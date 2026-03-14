/**
 * extract-deal-memories — BA-001a
 *
 * Receives meeting data and uses Claude Haiku to extract structured deal
 * memory events (commitments, objections, signals, risk flags, etc.).
 *
 * Called by the post-meeting orchestrator (service role only), NOT directly
 * from the frontend.
 *
 * POST /extract-deal-memories
 * {
 *   meeting_id: string,
 *   org_id: string,
 *   user_id: string,
 *   transcript_text: string,
 *   summary?: string,
 *   summary_oneliner?: string,
 *   next_steps_oneliner?: string,
 *   contact_id?: string,
 *   company_id?: string,
 *   deal_id?: string
 * }
 *
 * Returns: { events: DealMemoryExtraction[], written: number, contact_updated: boolean }
 *       or { skipped, reason } or { error }
 *
 * Deploy with --no-verify-jwt (staging ES256 JWT issue).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { updateContactFromEvent } from '../_shared/memory/contacts.ts';

// ============================================================================
// Types
// ============================================================================

interface ExtractDealMemoriesRequest {
  meeting_id: string;
  org_id: string;
  user_id: string;
  transcript_text: string;
  summary?: string;
  summary_oneliner?: string;
  next_steps_oneliner?: string;
  contact_id?: string;
  company_id?: string;
  deal_id?: string;
}

interface DealMemoryExtraction {
  event_type: string;
  event_category: string;
  summary: string;
  confidence: number;
  detail: Record<string, unknown>;
  verbatim_quote?: string;
  speaker?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

// ============================================================================
// Extraction prompt
// ============================================================================

function buildSystemPrompt(): string {
  return `You are a sales intelligence analyst. Your job is to extract structured deal memory events from a meeting transcript and/or summary.

For each notable event in the meeting, extract a structured object. Typical meetings yield 3-8 events.

EVENT TYPES (use exactly these values for event_type):
- commitment_made: Someone promised to do something (send proposal, schedule follow-up, provide info)
- objection_raised: Prospect raised a concern, blocker, or pushback
- positive_signal: Buying signal, enthusiasm, agreement to next step
- risk_flag: Something that could derail the deal (budget cuts, competitor, timeline slip)
- champion_identified: A person who is actively advocating internally
- competitor_mentioned: A competing product or vendor was discussed
- budget_confirmed: Budget range, approval status, or funding discussed
- timeline_set: Close date, decision date, or implementation timeline mentioned
- sentiment_shift: Notable change in tone or engagement during the meeting

EVENT CATEGORIES (map to the corresponding event_type):
- commitment: commitment_made
- objection: objection_raised
- signal: positive_signal
- stakeholder: champion_identified
- sentiment: sentiment_shift
- competitive: competitor_mentioned
- timeline: timeline_set
- commercial: budget_confirmed, risk_flag

For each event, return:
{
  "event_type": "<one of the types above>",
  "event_category": "<matching category>",
  "summary": "<1-2 sentence human-readable description>",
  "confidence": <0.0 to 1.0 — how confident you are this event occurred>,
  "detail": {<structured metadata: deadline, owner, amount, blocker, competitor_name, etc.>},
  "verbatim_quote": "<exact quote from transcript if available, null otherwise>",
  "speaker": "<who said it — name or 'rep'/'prospect'>"
}

RULES:
1. Only extract events you are confident actually occurred. Set confidence accordingly.
2. Include verbatim_quote when you can find the exact words in the transcript.
3. The detail object should contain structured data relevant to the event type:
   - commitment_made: { owner, action, deadline? }
   - objection_raised: { blocker, severity, addressed? }
   - positive_signal: { signal, strength }
   - risk_flag: { risk, impact, mitigation? }
   - champion_identified: { name, role, evidence }
   - competitor_mentioned: { competitor_name, context, positioning }
   - budget_confirmed: { amount?, range?, status, approval_needed? }
   - timeline_set: { date?, phase, dependencies? }
   - sentiment_shift: { from, to, trigger }
4. Return a JSON array. Return [] if no meaningful events found.
5. Return ONLY valid JSON, no markdown fences or additional text.`;
}

function buildUserMessage(body: ExtractDealMemoriesRequest): string {
  const parts: string[] = [];

  if (body.summary_oneliner) {
    parts.push(`MEETING SUMMARY (one-liner): ${body.summary_oneliner}`);
  }

  if (body.summary) {
    parts.push(`MEETING SUMMARY:\n${body.summary}`);
  }

  if (body.next_steps_oneliner) {
    parts.push(`NEXT STEPS: ${body.next_steps_oneliner}`);
  }

  if (body.transcript_text) {
    // Truncate transcript to ~12k chars to stay within Haiku's sweet spot
    const truncated = body.transcript_text.length > 12000
      ? body.transcript_text.slice(0, 12000) + '\n\n[transcript truncated]'
      : body.transcript_text;
    parts.push(`TRANSCRIPT:\n${truncated}`);
  }

  parts.push(
    '\nExtract all deal memory events from the meeting content above. Return a JSON array.',
  );

  return parts.join('\n\n');
}

// ============================================================================
// Intelligence gate — check user preferences
// ============================================================================

async function isExtractionEnabled(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[extract-deal-memories] Failed to load user_settings:', error.message);
    // Default to enabled if we can't read settings
    return true;
  }

  if (!settings) {
    // No settings row — default to enabled
    return true;
  }

  const prefs = settings.preferences as Record<string, unknown> | null;
  if (!prefs) return true;

  const brainIntelligence = prefs.brain_intelligence as Record<string, unknown> | undefined;
  if (!brainIntelligence) {
    // brain_intelligence key doesn't exist — default to enabled
    return true;
  }

  const postMeetingExtraction = brainIntelligence.post_meeting_extraction;
  if (postMeetingExtraction === undefined || postMeetingExtraction === null) {
    // Key not set — default to enabled
    return true;
  }

  return Boolean(postMeetingExtraction);
}

// ============================================================================
// LLM call
// ============================================================================

async function callClaudeHaiku(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
): Promise<DealMemoryExtraction[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 2000,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(unreadable body)');
    throw new Error(`Anthropic API returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  // Claude returns content as an array of blocks; filter to text blocks
  const textBlocks: string[] = (data.content ?? [])
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { text: string }) => block.text);

  const responseText = textBlocks.join('');

  return parseClaudeResponse(responseText);
}

// ============================================================================
// JSON parsing
// ============================================================================

function parseClaudeResponse(text: string): DealMemoryExtraction[] {
  // First attempt: direct parse
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return validateEvents(parsed);
  } catch {
    // fall through to extraction
  }

  // Second attempt: extract JSON array from the text
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');

  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    try {
      const extracted = JSON.parse(text.slice(arrayStart, arrayEnd + 1));
      if (Array.isArray(extracted)) return validateEvents(extracted);
    } catch {
      // fall through
    }
  }

  console.error(
    `[extract-deal-memories] Failed to parse Claude JSON response. Raw:\n${text.slice(0, 500)}`,
  );
  return [];
}

/** Validate and clean event objects from Claude */
function validateEvents(events: unknown[]): DealMemoryExtraction[] {
  return events
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
    .map((e) => ({
      event_type: String(e.event_type ?? 'unknown'),
      event_category: String(e.event_category ?? 'unknown'),
      summary: String(e.summary ?? ''),
      confidence: typeof e.confidence === 'number' ? e.confidence : 0.5,
      detail: (typeof e.detail === 'object' && e.detail !== null ? e.detail : {}) as Record<string, unknown>,
      verbatim_quote: typeof e.verbatim_quote === 'string' ? e.verbatim_quote : undefined,
      speaker: typeof e.speaker === 'string' ? e.speaker : undefined,
    }))
    .filter((e) => e.summary.length > 0);
}

// ============================================================================
// Parse next_steps_oneliner into commitment events
// ============================================================================

function parseNextStepsIntoCommitments(
  nextSteps: string,
): DealMemoryExtraction[] {
  if (!nextSteps || nextSteps.trim().length === 0) return [];

  // Split by semicolons or numbered items (1., 2., etc.)
  const items = nextSteps
    .split(/(?:;\s*)|(?:\d+\.\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return items.map((item) => ({
    event_type: 'commitment_made',
    event_category: 'commitment',
    summary: item,
    confidence: 0.85,
    detail: { owner: 'rep', status: 'pending', action: item },
    verbatim_quote: undefined,
    speaker: 'rep',
  }));
}

// ============================================================================
// Write events to deal_memory_events + update contact_memory
// ============================================================================

async function writeEventsToDb(
  supabase: ReturnType<typeof createClient>,
  events: DealMemoryExtraction[],
  body: ExtractDealMemoriesRequest,
): Promise<{ written: number; contact_updated: boolean }> {
  const now = new Date().toISOString();
  const contactIds = body.contact_id ? [body.contact_id] : [];

  // Build rows for batch insert
  const rows = events.map((e) => ({
    org_id: body.org_id,
    deal_id: body.deal_id ?? null,
    event_type: e.event_type,
    event_category: e.event_category,
    source_type: 'transcript',
    source_id: body.meeting_id,
    source_timestamp: now,
    summary: e.summary,
    detail: e.detail,
    verbatim_quote: e.verbatim_quote ?? null,
    speaker: e.speaker ?? null,
    confidence: e.confidence,
    salience: e.confidence > 0.8 ? 'high' : 'medium',
    extracted_by: 'extract-deal-memories',
    contact_ids: contactIds,
  }));

  if (rows.length === 0) {
    return { written: 0, contact_updated: false };
  }

  // Batch insert into deal_memory_events
  const { data: inserted, error: insertError } = await supabase
    .from('deal_memory_events')
    .insert(rows)
    .select('id, event_type, event_category, detail, source_timestamp, contact_ids, deal_id, org_id');

  if (insertError) {
    console.error(
      '[extract-deal-memories] Failed to insert deal_memory_events:',
      insertError.message,
    );
    return { written: 0, contact_updated: false };
  }

  const written = inserted?.length ?? 0;
  console.log(`[extract-deal-memories] Wrote ${written} events to deal_memory_events`);

  // Update contact_memory for events that have a contact_id
  let contactUpdated = false;

  if (body.contact_id && inserted && inserted.length > 0) {
    try {
      // Call updateContactFromEvent for each inserted event
      for (const evt of inserted) {
        await updateContactFromEvent(
          {
            event_type: evt.event_type,
            event_category: evt.event_category,
            detail: evt.detail as Record<string, unknown>,
            source_timestamp: evt.source_timestamp,
            contact_ids: evt.contact_ids as string[],
            deal_id: evt.deal_id,
            org_id: evt.org_id,
          },
          supabase,
        );
      }
      contactUpdated = true;
      console.log(
        `[extract-deal-memories] Updated contact_memory for contact ${body.contact_id}`,
      );
    } catch (contactErr) {
      console.error(
        '[extract-deal-memories] Failed to update contact_memory:',
        contactErr instanceof Error ? contactErr.message : String(contactErr),
      );
    }
  }

  return { written, contact_updated: contactUpdated };
}

// ============================================================================
// Entry point
// ============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const body: ExtractDealMemoriesRequest = await req.json();

    // Validate required fields
    if (!body.meeting_id || !body.org_id || !body.user_id) {
      return errorResponse('meeting_id, org_id, and user_id are required', req, 400);
    }

    if (!body.transcript_text && !body.summary) {
      return errorResponse('transcript_text or summary is required', req, 400);
    }

    // Check ANTHROPIC_API_KEY
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      return jsonResponse({ error: 'API key not configured' }, req, 500);
    }

    // Create Supabase client for intelligence gate check
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Intelligence gate: check if post_meeting_extraction is enabled
    const enabled = await isExtractionEnabled(supabase, body.user_id);
    if (!enabled) {
      console.log(
        `[extract-deal-memories] Skipped for user ${body.user_id} — post_meeting_extraction disabled`,
      );
      return jsonResponse({ skipped: true, reason: 'disabled_by_user' }, req);
    }

    // Build prompts
    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(body);

    // Call Claude Haiku
    let events: DealMemoryExtraction[];
    try {
      events = await callClaudeHaiku(anthropicApiKey, systemPrompt, userMessage);
    } catch (llmError) {
      console.error(
        '[extract-deal-memories] LLM call failed:',
        llmError instanceof Error ? llmError.message : String(llmError),
      );
      return jsonResponse(
        {
          error: llmError instanceof Error ? llmError.message : 'LLM call failed',
          events: [],
        },
        req,
      );
    }

    // Parse next_steps_oneliner into commitment events
    const commitmentEvents = parseNextStepsIntoCommitments(body.next_steps_oneliner ?? '');

    // Merge LLM-extracted events with parsed commitment events
    const allEvents = [...events, ...commitmentEvents];

    console.log(
      `[extract-deal-memories] Extracted ${events.length} LLM events + ${commitmentEvents.length} commitment events for meeting ${body.meeting_id}`,
    );

    // Write to deal_memory_events + update contact_memory
    const { written, contact_updated } = await writeEventsToDb(supabase, allEvents, body);

    return jsonResponse({ events: allEvents, written, contact_updated }, req);
  } catch (err) {
    console.error(
      '[extract-deal-memories] Error:',
      err instanceof Error ? err.message : String(err),
    );
    return jsonResponse(
      {
        error: err instanceof Error ? err.message : 'Internal server error',
        events: [],
      },
      req,
    );
  }
});

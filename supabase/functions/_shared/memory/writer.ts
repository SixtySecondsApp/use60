/**
 * writer.ts — RAG-assisted event extraction pipeline.
 *
 * Queries the RAG API with targeted questions per event category, then uses
 * Claude Sonnet 4 to structure the results into typed deal_memory_events.
 *
 * Callers are responsible for credit tracking — this module does not touch
 * costTracking.ts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { DealMemoryEvent, EventCategory } from './types.ts';
import { EVENT_TYPES, isValidEventType, getCategoryForType } from './taxonomy.ts';
import { RAGClient } from './ragClient.ts';

// ---- Extraction query definitions ------------------------------------------

const EXTRACTION_QUERIES: Record<string, { category: EventCategory; questions: string[] }> = {
  commitments: {
    category: 'commitment',
    questions: [
      'What did the rep promise or commit to doing? Include deadlines if mentioned.',
      'What did the prospect agree to do or promise? Include deadlines.',
    ],
  },
  objections: {
    category: 'objection',
    questions: [
      'What concerns, pushback, or objections did the prospect raise?',
      'How were objections addressed or resolved?',
    ],
  },
  competitive: {
    category: 'competitive',
    questions: [
      'Were any competitors or alternative solutions mentioned? In what context?',
    ],
  },
  stakeholders: {
    category: 'stakeholder',
    questions: [
      "Were any new people mentioned who are involved in the decision? Did anyone's role change?",
    ],
  },
  commercial: {
    category: 'commercial',
    questions: [
      'Was budget, pricing, or deal value discussed? Any changes to timeline or close date?',
    ],
  },
  sentiment: {
    category: 'sentiment',
    questions: [
      'What was the overall tone? Any notable shifts in enthusiasm or concern?',
    ],
  },
};

// ---- Internal types --------------------------------------------------------

interface ClaudeEventCandidate {
  event_type: string;
  summary: string;
  detail: Record<string, unknown>;
  verbatim_quote: string | null;
  speaker: string | null;
  confidence: number;
  salience: 'high' | 'medium' | 'low';
  contact_ids: string[]; // AI returns names; we store [] — resolved in a future story
  supersedes_event_id: string | null;
}

// Subset of DealMemoryEvent used when building the existing-events context for Claude
type ExistingEventContext = Pick<
  DealMemoryEvent,
  'id' | 'event_type' | 'event_category' | 'summary' | 'detail' | 'source_timestamp' | 'contact_ids'
>;

// ---- Main export -----------------------------------------------------------

/**
 * Extract deal memory events from a meeting via RAG + Claude.
 *
 * 1. Loads existing recent events for this deal (last 30 days) for dedup context.
 * 2. For each event category, runs targeted RAG questions against the meeting window.
 * 3. Sends collected answers to Claude Sonnet 4 to structure into typed events.
 * 4. Filters by confidence threshold.
 * 5. Batch-inserts into deal_memory_events.
 * 6. Marks superseded events as inactive.
 *
 * Returns all successfully created events.
 */
export async function extractEventsFromMeeting(params: {
  meetingId: string;
  dealId: string;
  orgId: string;
  supabase: ReturnType<typeof createClient>;
  ragClient: RAGClient;
  anthropicApiKey: string;
  meetingDate?: string; // YYYY-MM-DD — defaults to today if omitted
  confidenceThreshold?: number;
  extractedBy?: string;
}): Promise<DealMemoryEvent[]> {
  const {
    meetingId,
    dealId,
    orgId,
    supabase,
    ragClient,
    anthropicApiKey,
    confidenceThreshold = 0.7,
    extractedBy = 'post-meeting-intel',
  } = params;

  // Step 1: Load recent events for this deal (last 30 days, active only)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existingEvents, error: existingError } = await supabase
    .from('deal_memory_events')
    .select('id, event_type, event_category, summary, detail, source_timestamp, contact_ids')
    .eq('deal_id', dealId)
    .eq('org_id', orgId)
    .eq('is_active', true)
    .gte('source_timestamp', thirtyDaysAgo);

  if (existingError) {
    console.error('[writer] Failed to load existing events:', existingError.message);
  }

  const recentEvents: ExistingEventContext[] = existingEvents ?? [];

  // Use provided meeting date or fall back to today
  const meetingDate = params.meetingDate ?? new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const dayBefore = new Date(Date.parse(meetingDate) - 24 * 60 * 60 * 1000).toISOString();
  const dayAfter = new Date(Date.parse(meetingDate) + 24 * 60 * 60 * 1000).toISOString();

  const ragFilters = {
    date_from: dayBefore,
    date_to: dayAfter,
    owner_user_id: null as null, // null = search all team members
  };

  // Step 2 & 3: Per category — RAG queries → Claude structuring
  const allNewEvents: Omit<DealMemoryEvent, 'id' | 'created_at' | 'updated_at'>[] = [];
  const supersessionMap = new Map<string, string>(); // old_event_id → new_event_id (populated after insert)

  // We need to carry supersedes_event_id through to post-insert linking,
  // so we track candidates alongside their structured events.
  const pendingSupersession: Array<{
    candidateIndex: number; // index into allNewEvents
    supersedes: string;
  }> = [];

  for (const [categoryKey, { category, questions }] of Object.entries(EXTRACTION_QUERIES)) {
    // Step 2a: Batch RAG queries for this category
    let ragAnswers: string[];

    try {
      const ragResults = await ragClient.queryBatch(
        questions.map((q) => ({ question: q, filters: ragFilters })),
      );
      ragAnswers = ragResults.map((r) => r.answer).filter((a) => a.trim().length > 0);
    } catch (err) {
      console.error(`[writer] RAG batch failed for category "${categoryKey}":`, err);
      ragAnswers = [];
    }

    if (ragAnswers.length === 0) {
      continue; // nothing retrieved for this category — skip
    }

    // Step 3: Structure answers into typed events via Claude
    let candidates: ClaudeEventCandidate[];

    try {
      candidates = await structureIntoEvents({
        category: categoryKey,
        ragAnswers,
        existingEvents: recentEvents,
        dealId,
        orgId,
        meetingId,
        meetingDate,
        anthropicApiKey,
      });
    } catch (err) {
      console.error(`[writer] structureIntoEvents failed for category "${categoryKey}":`, err);
      continue;
    }

    // Step 4: Filter by confidence threshold and validate event types
    for (const candidate of candidates) {
      if (candidate.confidence < confidenceThreshold) continue;
      if (!isValidEventType(candidate.event_type)) {
        console.warn(`[writer] Skipping unknown event_type: ${candidate.event_type}`);
        continue;
      }

      const resolvedCategory = getCategoryForType(candidate.event_type) ?? category;

      const event: Omit<DealMemoryEvent, 'id' | 'created_at' | 'updated_at'> = {
        org_id: orgId,
        deal_id: dealId,
        event_type: candidate.event_type,
        event_category: resolvedCategory,
        source_type: 'transcript',
        source_id: meetingId,
        source_timestamp: meetingDate,
        summary: candidate.summary,
        detail: candidate.detail,
        verbatim_quote: candidate.verbatim_quote,
        speaker: candidate.speaker,
        confidence: candidate.confidence,
        salience: candidate.salience,
        is_active: true,
        superseded_by: null,
        contact_ids: [], // names from AI — ID resolution is a future story
        extracted_by: extractedBy,
        model_used: 'claude-sonnet-4-6',
        credit_cost: 0, // caller tracks credits
      };

      if (candidate.supersedes_event_id) {
        pendingSupersession.push({
          candidateIndex: allNewEvents.length,
          supersedes: candidate.supersedes_event_id,
        });
      }

      allNewEvents.push(event);
    }
  }

  if (allNewEvents.length === 0) {
    return [];
  }

  // Step 5: Batch insert
  const insertedEvents = await batchInsertEvents(allNewEvents, supabase);

  // Step 6: Resolve supersession — match by summary (not index, since partial
  // chunk failures can shift indices in the returned array)
  for (const { candidateIndex, supersedes } of pendingSupersession) {
    const candidate = allNewEvents[candidateIndex];
    if (!candidate) continue;

    const inserted = insertedEvents.find(
      (e) => e.event_type === candidate.event_type && e.summary === candidate.summary,
    );
    if (inserted?.id) {
      supersessionMap.set(supersedes, inserted.id);
    }
  }

  if (supersessionMap.size > 0) {
    await handleSupersession(insertedEvents, supersessionMap, supabase);
  }

  return insertedEvents;
}

// ---- structureIntoEvents ---------------------------------------------------

/**
 * Calls Claude Sonnet 4 to convert RAG-retrieved text into typed event objects.
 */
async function structureIntoEvents(params: {
  category: string;
  ragAnswers: string[];
  existingEvents: ExistingEventContext[];
  dealId: string;
  orgId: string;
  meetingId: string;
  meetingDate: string;
  anthropicApiKey: string;
}): Promise<ClaudeEventCandidate[]> {
  const { category, ragAnswers, existingEvents, meetingDate, anthropicApiKey } = params;

  // Build existing events summary for dedup context
  const existingSummary =
    existingEvents.length === 0
      ? 'None.'
      : existingEvents
          .map(
            (e) =>
              `[${e.id}] ${e.event_type} (${e.source_timestamp?.split('T')[0] ?? 'unknown date'}): ${e.summary}`,
          )
          .join('\n');

  // Collect valid event types for this category
  const validTypesForCategory = Object.entries(EVENT_TYPES)
    .filter(([, def]) => {
      // Map category key to EventCategory
      const categoryKeyToEnum: Record<string, EventCategory> = {
        commitments: 'commitment',
        objections: 'objection',
        competitive: 'competitive',
        stakeholders: 'stakeholder',
        commercial: 'commercial',
        sentiment: 'sentiment',
      };
      return def.category === (categoryKeyToEnum[category] ?? category);
    })
    .map(([type, def]) => {
      const schemaLines = Object.entries(def.detailSchema)
        .map(([field, desc]) => `    ${field}: ${desc}`)
        .join('\n');
      return `- ${type}: ${def.description}\n  detail schema:\n${schemaLines}`;
    })
    .join('\n');

  const systemPrompt = `You are structuring intelligence retrieved from a sales meeting into typed events.
The retrieval system has already found relevant sections — convert them into structured data.

EXISTING EVENTS FOR THIS DEAL (for dedup — do not create duplicates):
${existingSummary}

RETRIEVED INTELLIGENCE:
${ragAnswers.join('\n\n---\n\n')}

For category "${category}", extract events matching these types:
${validTypesForCategory}

For each event, return a JSON object with:
- event_type: one of the valid types listed above
- summary: 1-2 sentence human-readable description
- detail: structured data matching the schema for this event_type
- verbatim_quote: exact quote if available, null otherwise
- speaker: who said/did this — name or 'rep'/'prospect'
- confidence: 0.0-1.0 how confident you are this event actually occurred
- salience: 'high', 'medium', or 'low' — impact on deal outcome
- contact_ids: array of contact names mentioned (we'll resolve IDs later)
- supersedes_event_id: if this updates/replaces an existing event, provide that event's ID

RULES:
- Only create events with confidence >= 0.5 (threshold filtering happens later)
- If a retrieved chunk updates or contradicts an existing event, set supersedes_event_id
- Assess salience: high = directly affects deal outcome, medium = notable, low = minor detail
- Return a JSON array of events. Return [] if nothing relevant found.`;

  const userMessage = `Extract ${category} events from the retrieved intelligence above.`;

  let responseText: string;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': anthropicApiKey,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
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
    // Claude returns content as an array of blocks; filter to text blocks only
    const textBlocks: string[] = (data.content ?? [])
      .filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text);

    responseText = textBlocks.join('');
  } catch (err) {
    console.error(`[writer] Claude API call failed for category "${params.category}":`, err);
    return [];
  }

  // Parse JSON from Claude response
  return parseClaudeResponse(responseText, params.category);
}

// ---- JSON parsing helper ---------------------------------------------------

function parseClaudeResponse(text: string, category: string): ClaudeEventCandidate[] {
  // First attempt: direct parse (Claude often returns clean JSON)
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return parsed as ClaudeEventCandidate[];
  } catch {
    // fall through to extraction
  }

  // Second attempt: extract the first JSON array from the text
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');

  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    try {
      const extracted = JSON.parse(text.slice(arrayStart, arrayEnd + 1));
      if (Array.isArray(extracted)) return extracted as ClaudeEventCandidate[];
    } catch {
      // fall through
    }
  }

  console.error(
    `[writer] Failed to parse Claude JSON response for category "${category}". Raw:\n${text.slice(0, 500)}`,
  );
  return [];
}

// ---- Batch insert helper ---------------------------------------------------

/**
 * Insert events in chunks of 50. Returns all successfully inserted events
 * (those from failed chunks are omitted rather than throwing).
 */
async function batchInsertEvents(
  events: Omit<DealMemoryEvent, 'id' | 'created_at' | 'updated_at'>[],
  supabase: ReturnType<typeof createClient>,
): Promise<DealMemoryEvent[]> {
  const CHUNK_SIZE = 50;
  const inserted: DealMemoryEvent[] = [];

  for (let i = 0; i < events.length; i += CHUNK_SIZE) {
    const chunk = events.slice(i, i + CHUNK_SIZE);

    const { data, error } = await supabase
      .from('deal_memory_events')
      .insert(chunk)
      .select('id, event_type, event_category, summary, source_timestamp, deal_id, org_id, source_type, source_id, detail, verbatim_quote, speaker, confidence, salience, is_active, superseded_by, contact_ids, extracted_by, model_used, credit_cost');

    if (error) {
      console.error(
        `[writer] Batch insert failed for chunk ${i}–${i + chunk.length - 1}:`,
        error.message,
      );
      // Continue — return what succeeded
      continue;
    }

    if (data) {
      inserted.push(...(data as DealMemoryEvent[]));
    }
  }

  return inserted;
}

// ---- Supersession handler --------------------------------------------------

/**
 * Mark old events as inactive and link them to the new event that supersedes them.
 */
async function handleSupersession(
  newEvents: DealMemoryEvent[],
  supersessionMap: Map<string, string>, // old_event_id → new_event_id
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  // Build a lookup from new event index position to its inserted ID
  // The map already has old_event_id → new_event_id resolved at call site.
  for (const [oldEventId, newEventId] of supersessionMap.entries()) {
    // Verify the new event was actually inserted (paranoia check)
    const newEventExists = newEvents.some((e) => e.id === newEventId);
    if (!newEventExists) {
      console.warn(
        `[writer] Supersession skipped: new event ${newEventId} not found in inserted set.`,
      );
      continue;
    }

    const { error } = await supabase
      .from('deal_memory_events')
      .update({ is_active: false, superseded_by: newEventId })
      .eq('id', oldEventId);

    if (error) {
      console.error(
        `[writer] Failed to mark event ${oldEventId} as superseded by ${newEventId}:`,
        error.message,
      );
    }
  }
}

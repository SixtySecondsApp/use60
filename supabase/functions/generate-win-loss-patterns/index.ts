/**
 * generate-win-loss-patterns — BA-010a
 *
 * Aggregates deal outcomes with meeting coaching data and uses Claude Haiku
 * to synthesize actionable win/loss patterns. Patterns are stored as
 * copilot_memories for proactive recall.
 *
 * POST /generate-win-loss-patterns
 * {
 *   user_id: string,
 *   org_id: string
 * }
 *
 * Returns: { patterns: { wins: string[], losses: string[] }, stored: number }
 *       or { skipped: true }
 *       or { error: string }
 *
 * Service role auth. Deploy with --no-verify-jwt (staging ES256 JWT issue).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

// ============================================================================
// Types
// ============================================================================

interface GenerateRequest {
  user_id: string;
  org_id: string;
}

interface MeetingData {
  sentiment_score: number | null;
  talk_time_rep_pct: number | null;
  coach_summary: string | null;
}

interface DealWithMeetings {
  id: string;
  name: string;
  status: string;
  company: string;
  meetings: MeetingData[];
}

interface AggregatedMetrics {
  avg_talk_time: number | null;
  avg_sentiment: number | null;
  coach_summaries: string[];
  deal_count: number;
}

interface WinLossPatterns {
  wins: string[];
  losses: string[];
}

// ============================================================================
// Constants
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

// ============================================================================
// Intelligence gate — check user preferences
// ============================================================================

async function isFeatureEnabled(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[generate-win-loss-patterns] Failed to load user_settings:', error.message);
    // Default to enabled if we can't read settings
    return true;
  }

  if (!settings) return true;

  const prefs = settings.preferences as Record<string, unknown> | null;
  if (!prefs) return true;

  const brainIntelligence = prefs.brain_intelligence as Record<string, unknown> | undefined;
  if (!brainIntelligence) return true;

  const winLossPatterns = brainIntelligence.win_loss_patterns;
  if (winLossPatterns === undefined || winLossPatterns === null) return true;

  return Boolean(winLossPatterns);
}

// ============================================================================
// Data collection
// ============================================================================

async function collectDealsWithMeetings(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<{ wonDeals: DealWithMeetings[]; lostDeals: DealWithMeetings[] }> {
  // Query won and lost deals
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('id, name, status, company, company_id')
    .eq('clerk_org_id', orgId)
    .in('status', ['won', 'lost']);

  if (dealsError) {
    console.error('[generate-win-loss-patterns] Failed to query deals:', dealsError.message);
    return { wonDeals: [], lostDeals: [] };
  }

  if (!deals || deals.length === 0) {
    return { wonDeals: [], lostDeals: [] };
  }

  // Collect company_ids to find linked meetings
  const companyIds = deals
    .map((d: Record<string, unknown>) => d.company_id as string | null)
    .filter((id): id is string => !!id);

  // Query meetings linked via company_id (same pattern used in Brain seeding)
  let meetingsByCompanyId: Map<string, MeetingData[]> = new Map();

  if (companyIds.length > 0) {
    const { data: meetings, error: meetingsError } = await supabase
      .from('meetings')
      .select('company_id, sentiment_score, talk_time_rep_pct, coach_summary')
      .in('company_id', companyIds);

    if (meetingsError) {
      console.error('[generate-win-loss-patterns] Failed to query meetings:', meetingsError.message);
    } else if (meetings) {
      for (const m of meetings) {
        const cid = m.company_id as string;
        if (!meetingsByCompanyId.has(cid)) {
          meetingsByCompanyId.set(cid, []);
        }
        meetingsByCompanyId.get(cid)!.push({
          sentiment_score: m.sentiment_score as number | null,
          talk_time_rep_pct: m.talk_time_rep_pct as number | null,
          coach_summary: m.coach_summary as string | null,
        });
      }
    }
  }

  // Separate into won and lost
  const wonDeals: DealWithMeetings[] = [];
  const lostDeals: DealWithMeetings[] = [];

  for (const deal of deals) {
    const d: DealWithMeetings = {
      id: deal.id as string,
      name: deal.name as string,
      status: deal.status as string,
      company: deal.company as string,
      meetings: deal.company_id ? (meetingsByCompanyId.get(deal.company_id as string) ?? []) : [],
    };

    if (deal.status === 'won') {
      wonDeals.push(d);
    } else {
      lostDeals.push(d);
    }
  }

  return { wonDeals, lostDeals };
}

// ============================================================================
// Collect objection types from deal_memory_events for lost deals
// ============================================================================

async function collectObjections(
  supabase: ReturnType<typeof createClient>,
  lostDealIds: string[],
): Promise<string[]> {
  if (lostDealIds.length === 0) return [];

  const { data: events, error } = await supabase
    .from('deal_memory_events')
    .select('summary, detail')
    .in('deal_id', lostDealIds)
    .eq('event_type', 'objection_raised')
    .eq('is_active', true);

  if (error) {
    console.error('[generate-win-loss-patterns] Failed to query objections:', error.message);
    return [];
  }

  if (!events || events.length === 0) return [];

  return events.map((e: Record<string, unknown>) => {
    const detail = e.detail as Record<string, unknown> | null;
    const blocker = detail?.blocker as string | undefined;
    const summary = e.summary as string;
    return blocker ? `${summary} (blocker: ${blocker})` : summary;
  });
}

// ============================================================================
// Aggregate metrics
// ============================================================================

function aggregateMetrics(deals: DealWithMeetings[]): AggregatedMetrics {
  const allMeetings = deals.flatMap((d) => d.meetings);

  const talkTimes = allMeetings
    .map((m) => m.talk_time_rep_pct)
    .filter((v): v is number => v !== null);

  const sentiments = allMeetings
    .map((m) => m.sentiment_score)
    .filter((v): v is number => v !== null);

  const coachSummaries = allMeetings
    .map((m) => m.coach_summary)
    .filter((v): v is string => v !== null && v.length > 0);

  return {
    avg_talk_time: talkTimes.length > 0
      ? talkTimes.reduce((a, b) => a + b, 0) / talkTimes.length
      : null,
    avg_sentiment: sentiments.length > 0
      ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      : null,
    coach_summaries: coachSummaries,
    deal_count: deals.length,
  };
}

// ============================================================================
// LLM synthesis
// ============================================================================

function buildPrompt(
  wonMetrics: AggregatedMetrics,
  lostMetrics: AggregatedMetrics,
  objections: string[],
): string {
  const sections: string[] = [];

  sections.push(`WON DEALS (${wonMetrics.deal_count} total):`);
  if (wonMetrics.avg_talk_time !== null) {
    sections.push(`- Average rep talk time: ${wonMetrics.avg_talk_time.toFixed(1)}%`);
  }
  if (wonMetrics.avg_sentiment !== null) {
    sections.push(`- Average sentiment score: ${wonMetrics.avg_sentiment.toFixed(3)}`);
  }
  if (wonMetrics.coach_summaries.length > 0) {
    sections.push(`- Coach summaries (strengths/observations):`);
    // Limit to avoid token overflow
    for (const cs of wonMetrics.coach_summaries.slice(0, 15)) {
      const truncated = cs.length > 300 ? cs.slice(0, 300) + '...' : cs;
      sections.push(`  * ${truncated}`);
    }
  }

  sections.push('');
  sections.push(`LOST DEALS (${lostMetrics.deal_count} total):`);
  if (lostMetrics.avg_talk_time !== null) {
    sections.push(`- Average rep talk time: ${lostMetrics.avg_talk_time.toFixed(1)}%`);
  }
  if (lostMetrics.avg_sentiment !== null) {
    sections.push(`- Average sentiment score: ${lostMetrics.avg_sentiment.toFixed(3)}`);
  }
  if (lostMetrics.coach_summaries.length > 0) {
    sections.push(`- Coach summaries (weaknesses/improvements):`);
    for (const cs of lostMetrics.coach_summaries.slice(0, 15)) {
      const truncated = cs.length > 300 ? cs.slice(0, 300) + '...' : cs;
      sections.push(`  * ${truncated}`);
    }
  }

  if (objections.length > 0) {
    sections.push('');
    sections.push('COMMON OBJECTIONS FROM LOST DEALS:');
    for (const obj of objections.slice(0, 10)) {
      sections.push(`  * ${obj}`);
    }
  }

  return sections.join('\n');
}

async function synthesizePatterns(
  apiKey: string,
  wonMetrics: AggregatedMetrics,
  lostMetrics: AggregatedMetrics,
  objections: string[],
): Promise<WinLossPatterns> {
  const dataPrompt = buildPrompt(wonMetrics, lostMetrics, objections);

  const systemPrompt = `You are a sales performance analyst. Analyze won and lost deal patterns to produce actionable insights.

Output ONLY valid JSON with no markdown fences. The JSON must have this structure:
{
  "wins": ["pattern 1", "pattern 2", ...],
  "losses": ["pattern 1", "pattern 2", ...]
}

Rules:
1. Produce 3-5 "You win when..." patterns and 3-5 "You lose when..." patterns.
2. Each pattern should be one actionable sentence with evidence from the data.
3. Reference specific metrics (talk time %, sentiment scores) where available.
4. For losses, reference common objections if provided.
5. Be specific and actionable, not generic. Bad: "You win when you build rapport." Good: "You win when rep talk time stays below 45% — your won deals average 38% vs 52% on losses."
6. Return ONLY the JSON object, no additional text.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1500,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: dataPrompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(unreadable body)');
    throw new Error(`Anthropic API returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  const textBlocks: string[] = (data.content ?? [])
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { text: string }) => block.text);

  const responseText = textBlocks.join('');

  return parsePatterns(responseText);
}

function parsePatterns(text: string): WinLossPatterns {
  const fallback: WinLossPatterns = { wins: [], losses: [] };

  // Direct parse
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed && Array.isArray(parsed.wins) && Array.isArray(parsed.losses)) {
      return {
        wins: parsed.wins.filter((s: unknown) => typeof s === 'string'),
        losses: parsed.losses.filter((s: unknown) => typeof s === 'string'),
      };
    }
  } catch {
    // fall through
  }

  // Extract JSON object from text
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    try {
      const extracted = JSON.parse(text.slice(objStart, objEnd + 1));
      if (extracted && Array.isArray(extracted.wins) && Array.isArray(extracted.losses)) {
        return {
          wins: extracted.wins.filter((s: unknown) => typeof s === 'string'),
          losses: extracted.losses.filter((s: unknown) => typeof s === 'string'),
        };
      }
    } catch {
      // fall through
    }
  }

  console.error(
    `[generate-win-loss-patterns] Failed to parse Haiku response. Raw:\n${text.slice(0, 500)}`,
  );
  return fallback;
}

// ============================================================================
// Store patterns to copilot_memories
// ============================================================================

async function storePatterns(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  patterns: WinLossPatterns,
): Promise<number> {
  // Delete old win/loss patterns first
  const { error: deleteError } = await supabase
    .from('copilot_memories')
    .delete()
    .eq('user_id', userId)
    .or('subject.like.Win pattern:%,subject.like.Loss pattern:%');

  if (deleteError) {
    console.error(
      '[generate-win-loss-patterns] Failed to delete old patterns:',
      deleteError.message,
    );
    // Continue anyway — we'll add new ones
  }

  // Build rows for new patterns
  const rows: Array<Record<string, unknown>> = [];

  for (const win of patterns.wins) {
    // Extract a short label from the pattern (first ~60 chars)
    const shortLabel = win.length > 60 ? win.slice(0, 57) + '...' : win;
    rows.push({
      user_id: userId,
      category: 'fact',
      subject: `Win pattern: ${shortLabel}`,
      content: win,
      confidence: 0.85,
    });
  }

  for (const loss of patterns.losses) {
    const shortLabel = loss.length > 60 ? loss.slice(0, 57) + '...' : loss;
    rows.push({
      user_id: userId,
      category: 'fact',
      subject: `Loss pattern: ${shortLabel}`,
      content: loss,
      confidence: 0.85,
    });
  }

  if (rows.length === 0) return 0;

  const { data: inserted, error: insertError } = await supabase
    .from('copilot_memories')
    .insert(rows)
    .select('id');

  if (insertError) {
    console.error(
      '[generate-win-loss-patterns] Failed to insert patterns:',
      insertError.message,
    );
    return 0;
  }

  const stored = inserted?.length ?? 0;
  console.log(`[generate-win-loss-patterns] Stored ${stored} patterns to copilot_memories`);
  return stored;
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
    const body: GenerateRequest = await req.json();

    // Validate required fields
    if (!body.user_id || !body.org_id) {
      return errorResponse('user_id and org_id are required', req, 400);
    }

    // Check ANTHROPIC_API_KEY
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, req, 500);
    }

    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Intelligence gate
    const enabled = await isFeatureEnabled(supabase, body.user_id);
    if (!enabled) {
      console.log(
        `[generate-win-loss-patterns] Skipped for user ${body.user_id} — win_loss_patterns disabled`,
      );
      return jsonResponse({ skipped: true }, req);
    }

    // Data collection: deals + meetings
    const { wonDeals, lostDeals } = await collectDealsWithMeetings(supabase, body.org_id);

    if (wonDeals.length === 0 && lostDeals.length === 0) {
      return jsonResponse(
        { patterns: { wins: [], losses: [] }, stored: 0, message: 'No won or lost deals found' },
        req,
      );
    }

    // Aggregate metrics
    const wonMetrics = aggregateMetrics(wonDeals);
    const lostMetrics = aggregateMetrics(lostDeals);

    // Collect objections from deal_memory_events for lost deals
    const lostDealIds = lostDeals.map((d) => d.id);
    const objections = await collectObjections(supabase, lostDealIds);

    console.log(
      `[generate-win-loss-patterns] Aggregated: ${wonDeals.length} won, ${lostDeals.length} lost, ${objections.length} objections`,
    );

    // LLM synthesis
    let patterns: WinLossPatterns;
    try {
      patterns = await synthesizePatterns(anthropicApiKey, wonMetrics, lostMetrics, objections);
    } catch (llmError) {
      console.error(
        '[generate-win-loss-patterns] LLM call failed:',
        llmError instanceof Error ? llmError.message : String(llmError),
      );
      return jsonResponse(
        { error: llmError instanceof Error ? llmError.message : 'LLM call failed' },
        req,
        500,
      );
    }

    // Store patterns to copilot_memories
    const stored = await storePatterns(supabase, body.user_id, patterns);

    return jsonResponse({ patterns, stored }, req);
  } catch (err) {
    console.error(
      '[generate-win-loss-patterns] Error:',
      err instanceof Error ? err.message : String(err),
    );
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      req,
      500,
    );
  }
});

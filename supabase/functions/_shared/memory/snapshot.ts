/**
 * snapshot.ts — Deal memory snapshot generation.
 *
 * Handles two concerns:
 *   1. shouldRegenerateSnapshot() — decides whether a fresh snapshot is needed
 *      based on trigger conditions (on-demand, stage change, event threshold,
 *      time threshold).
 *   2. generateSnapshot() — orchestrates event loading, RAG retrieval, Claude
 *      synthesis, and persistence into deal_memory_snapshots.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type {
  DealMemoryEvent,
  DealMemorySnapshot,
  Stakeholder,
  RiskFactor,
  SentimentPoint,
  Commitment,
} from './types.ts';
import { RAGClient } from './ragClient.ts';

// ---- Constants --------------------------------------------------------------

const EVENT_THRESHOLD = 15;         // new events that trigger regeneration
const TIME_THRESHOLD_DAYS = 7;      // days after which a stale snapshot + any new events triggers regen
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const EVENTS_LIMIT = 500;           // max events loaded per snapshot run

// ---- shouldRegenerateSnapshot -----------------------------------------------

export async function shouldRegenerateSnapshot(params: {
  dealId: string;
  orgId: string;
  supabase: ReturnType<typeof createClient>;
  stageChanged?: boolean;
  onDemand?: boolean;
}): Promise<boolean> {
  const { dealId, orgId, supabase, stageChanged, onDemand } = params;

  // 1. On-demand always regenerates
  if (onDemand === true) return true;

  // 2. Stage change always regenerates
  if (stageChanged === true) return true;

  // 3. Fetch latest snapshot
  const { data: snapshot, error: snapErr } = await supabase
    .from('deal_memory_snapshots')
    .select('id, events_included_through, created_at')
    .eq('deal_id', dealId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapErr) {
    console.error('[snapshot] Error fetching latest snapshot:', snapErr.message);
  }

  // 4. Cold start — no snapshot exists yet
  if (!snapshot) return true;

  // 5. Count new events since the snapshot's coverage timestamp
  const { count, error: countErr } = await supabase
    .from('deal_memory_events')
    .select('id', { count: 'exact', head: true })
    .eq('deal_id', dealId)
    .eq('org_id', orgId)
    .eq('is_active', true)
    .gt('source_timestamp', snapshot.events_included_through);

  if (countErr) {
    console.error('[snapshot] Error counting new events:', countErr.message);
  }

  const newEventCount = count ?? 0;

  // 5. Event threshold
  if (newEventCount >= EVENT_THRESHOLD) return true;

  // 6. Time threshold — snapshot is older than 7 days AND has new events
  const snapshotAge = Date.now() - new Date(snapshot.created_at).getTime();
  const ageThresholdMs = TIME_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  if (snapshotAge > ageThresholdMs && newEventCount > 0) return true;

  // 7. No trigger condition met
  return false;
}

// ---- generateSnapshot -------------------------------------------------------

export async function generateSnapshot(params: {
  dealId: string;
  orgId: string;
  supabase: ReturnType<typeof createClient>;
  ragClient: RAGClient;
  anthropicApiKey: string;
  generatedBy: 'scheduled' | 'on_demand' | 'event_threshold';
}): Promise<DealMemorySnapshot | null> {
  const { dealId, orgId, supabase, ragClient, anthropicApiKey, generatedBy } = params;

  // ---- 1. Load all active events for this deal ----------------------------

  const { data: events, error: eventsErr } = await supabase
    .from('deal_memory_events')
    .select(
      'id, event_type, event_category, source_type, source_timestamp, summary, detail, verbatim_quote, speaker, confidence, salience, contact_ids',
    )
    .eq('deal_id', dealId)
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('source_timestamp', { ascending: true })
    .limit(EVENTS_LIMIT);

  if (eventsErr) {
    console.error('[snapshot] Failed to load events:', eventsErr.message);
    return null;
  }

  const dealEvents = (events ?? []) as DealMemoryEvent[];

  // ---- 2. Fetch previous snapshot for continuity context ------------------

  const { data: prevSnapshot } = await supabase
    .from('deal_memory_snapshots')
    .select('id, narrative, key_facts, created_at')
    .eq('deal_id', dealId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousNarrative = prevSnapshot?.narrative ?? null;

  // ---- 3. RAG queries for narrative depth ---------------------------------

  const ragFilters = { deal_id: dealId };

  let ragAnswers: string[] = [];
  try {
    const ragResults = await ragClient.queryBatch([
      {
        question: 'Summarise the overall story of this deal from first meeting to now',
        filters: ragFilters,
      },
      {
        question: 'What are the key relationship dynamics between participants?',
        filters: ragFilters,
      },
      {
        question: 'What topics keep recurring across meetings?',
        filters: ragFilters,
      },
    ]);

    ragAnswers = ragResults.map((r) => r.answer).filter(Boolean);
  } catch (ragErr) {
    console.error('[snapshot] RAG queries failed, continuing without RAG context:', ragErr);
  }

  // ---- 4. Format events for the prompt ------------------------------------

  const formattedEvents = dealEvents
    .map((e) => {
      const date = e.source_timestamp.slice(0, 10);
      return `[${e.event_type}] ${date}: ${e.summary}`;
    })
    .join('\n');

  const ragNarrative = ragAnswers.length > 0
    ? ragAnswers.join('\n\n---\n\n')
    : 'No RAG context available.';

  const prompt = `You are creating a deal intelligence snapshot by synthesising two data sources:
1. STRUCTURED EVENTS — typed, factual signals (commitments, objections, risk flags)
2. RAG NARRATIVE — conversational depth retrieved from transcript embeddings

DEAL: ${dealId}

PREVIOUS SNAPSHOT (if exists):
${previousNarrative ?? 'None — this is the first snapshot.'}

STRUCTURED EVENTS (${dealEvents.length} events):
${formattedEvents || 'No events recorded yet.'}

RAG NARRATIVE:
${ragNarrative}

Generate a JSON object with these fields:
1. "narrative" — 3-5 paragraph story of this deal. Brief a colleague who's never seen it. Include specific names, dates, key moments.
2. "key_facts" — { "close_date": string|null, "amount": number|null, "stage": string|null, "champion": {"name":string,"contact_id":string}|null, "blockers": string[], "competitors": string[], "open_commitments_count": number }
3. "stakeholder_map" — [{ "contact_id": string, "name": string, "role": "decision_maker"|"champion"|"influencer"|"blocker"|"user"|"unknown", "engagement_level": "active"|"passive"|"disengaged", "last_active": string|null }]
4. "risk_assessment" — { "overall_score": number (0.0-1.0, higher = more at risk), "factors": [{ "type": string, "severity": "critical"|"high"|"medium"|"low", "detail": string }] }
5. "sentiment_trajectory" — [{ "date": string, "score": number, "trigger": string }] — last N data points from events
6. "open_commitments" — [{ "event_id": string, "owner": "rep"|"prospect", "action": string, "deadline": string|null, "status": "pending", "created_at": string }]

Return valid JSON only, no markdown fences.`;

  // ---- 5. Call Claude Sonnet 4 to synthesise ------------------------------

  let parsed: {
    narrative: string;
    key_facts: DealMemorySnapshot['key_facts'];
    stakeholder_map: Stakeholder[];
    risk_assessment: DealMemorySnapshot['risk_assessment'];
    sentiment_trajectory: SentimentPoint[];
    open_commitments: Commitment[];
  } | null = null;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => '(unreadable)');
      throw new Error(`Claude API ${claudeRes.status}: ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const rawText: string = claudeData?.content?.[0]?.text ?? '';

    parsed = JSON.parse(rawText);
  } catch (claudeErr) {
    console.error('[snapshot] Claude synthesis failed:', claudeErr);
    return null;
  }

  if (!parsed) return null;

  // ---- 6. Determine events_included_through --------------------------------
  // Use the source_timestamp of the latest event loaded, or now if no events.

  const latestEventTs = dealEvents.length > 0
    ? dealEvents[dealEvents.length - 1].source_timestamp
    : new Date().toISOString();

  // ---- 7. Insert into deal_memory_snapshots --------------------------------

  const { data: inserted, error: insertErr } = await supabase
    .from('deal_memory_snapshots')
    .insert({
      org_id: orgId,
      deal_id: dealId,
      narrative: parsed.narrative,
      key_facts: parsed.key_facts,
      stakeholder_map: parsed.stakeholder_map,
      risk_assessment: parsed.risk_assessment,
      sentiment_trajectory: parsed.sentiment_trajectory,
      open_commitments: parsed.open_commitments,
      events_included_through: latestEventTs,
      event_count: dealEvents.length,
      generated_by: generatedBy,
      model_used: CLAUDE_MODEL,
    })
    .select(
      'id, org_id, deal_id, narrative, key_facts, stakeholder_map, risk_assessment, sentiment_trajectory, open_commitments, events_included_through, event_count, generated_by, model_used, created_at',
    )
    .single();

  if (insertErr) {
    console.error('[snapshot] Failed to insert snapshot:', insertErr.message);
    return null;
  }

  return inserted as DealMemorySnapshot;
}

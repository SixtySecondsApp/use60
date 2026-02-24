/**
 * agent-deal-temperature (SIG-007)
 *
 * Aggregates multi-source signals into a per-deal temperature score (0.0–1.0)
 * stored in deal_signal_temperature via the upsert_signal_temperature RPC.
 *
 * Two execution modes:
 *
 *   single  — Recalculate one deal immediately after a new signal arrives.
 *             Body: { mode: "single", org_id: string, deal_id: string }
 *
 *   batch   — Recalculate all deals with signal activity in the last 7 days.
 *             Called daily by the morning-briefing pre-run.
 *             Body: {} or { org_id: string } for single-org override.
 *
 * Signal sources aggregated:
 *   - email_signal_events     (AI-classified email signals)
 *   - communication_events    (opens, clicks, replies)
 *   - email_send_log          (outbound tracking — proposal opens)
 *   - account_signals         (smart-listening signals)
 *
 * Temperature formula (0–100 internally, stored as 0.0–1.0):
 *   temp = min(100, Σ weight_i × exp(−hours_since_i / 72))
 *
 * Threshold crossing events returned in response:
 *   cold→warm at 30, warm→hot at 60, hot→warm/cold on drop below 30/60
 *
 * Auth: CRON_SECRET (x-cron-secret header) or service-role Bearer token.
 * Deploy: npx supabase functions deploy agent-deal-temperature --project-ref <ref> --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';

// =============================================================================
// Config
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Decay half-life in hours: score halves every 72 hours
const DECAY_HALF_LIFE_HOURS = 72;

// Temperature thresholds (internal 0–100 scale)
const THRESHOLD_WARM = 30;
const THRESHOLD_HOT = 60;

// =============================================================================
// Signal weight table (internal 0–100 scale points per signal occurrence)
// =============================================================================

const EMAIL_SIGNAL_WEIGHTS: Record<string, number> = {
  meeting_request:       20,
  positive_buying_signal: 15,
  forward_detected:      15,
  proposal_opened:       12,
  pricing_question:      10,
  email_reply:           10,
  fast_reply:             8,
  new_cc_contact:         6,   // multi-threading indicator
  introduction_offer:     5,
  competitor_mention:     3,   // mentioned competitor = still engaged
  // Negative signals — handled separately as decay modifier
  silence_detected:     -10,
  slow_reply:            -3,
  objection:             -5,
  out_of_office:          0,   // neutral — contact not available
};

const COMM_EVENT_WEIGHTS: Record<string, number> = {
  email_received:  10,   // inbound reply
  email_opened:     4,   // opened our email
  email_clicked:    6,   // clicked a link
};

// =============================================================================
// Types
// =============================================================================

interface SignalPoint {
  type: string;
  source: string;
  description: string;
  weight: number;
  detected_at: string;
}

interface DealTemperatureResult {
  deal_id: string;
  org_id: string;
  temperature_raw: number;    // 0–100 internal scale
  temperature: number;        // 0.0–1.0 stored scale
  trend: 'rising' | 'falling' | 'stable';
  signal_count_24h: number;
  signal_count_7d: number;
  top_signals: SignalPoint[];
  last_signal: string | null;
  threshold_crossing: ThresholdCrossing | null;
  previous_temperature: number | null;
}

interface ThresholdCrossing {
  direction: 'warming' | 'cooling';
  threshold: number;
  label: string;
}

interface BatchResult {
  mode: 'batch';
  orgs_processed: number;
  deals_processed: number;
  deals_errored: number;
  threshold_crossings: number;
  results: DealTemperatureResult[];
}

interface SingleResult {
  mode: 'single';
  result: DealTemperatureResult;
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    if (
      !verifyCronSecret(req, cronSecret) &&
      !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)
    ) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));

    // -------------------------------------------------------------------------
    // Route: single deal recalculation
    // -------------------------------------------------------------------------
    if (body.mode === 'single') {
      const { org_id, deal_id } = body as { org_id?: string; deal_id?: string };

      if (!org_id || !deal_id) {
        return errorResponse('single mode requires org_id and deal_id', req, 400);
      }

      console.log(`[agent-deal-temperature] Single recalc: deal=${deal_id} org=${org_id}`);

      const result = await recalculateDealTemperature(supabase, org_id, deal_id);
      const response: SingleResult = { mode: 'single', result };

      console.log(
        `[agent-deal-temperature] Single complete: temp=${result.temperature.toFixed(3)} ` +
        `trend=${result.trend} crossing=${result.threshold_crossing?.label ?? 'none'}`
      );

      return jsonResponse(response, req);
    }

    // -------------------------------------------------------------------------
    // Route: batch recalculation across all orgs (or single-org override)
    // -------------------------------------------------------------------------
    const singleOrgId: string | undefined = body.org_id;

    console.log('[agent-deal-temperature] Starting batch temperature recalculation...');

    let dealIds: Array<{ deal_id: string; org_id: string }>;

    if (singleOrgId) {
      dealIds = await getActiveDealsForOrg(supabase, singleOrgId);
    } else {
      dealIds = await getActiveDealsAllOrgs(supabase);
    }

    console.log(`[agent-deal-temperature] Recalculating ${dealIds.length} deal(s)`);

    const batchResult: BatchResult = {
      mode: 'batch',
      orgs_processed: new Set(dealIds.map((d) => d.org_id)).size,
      deals_processed: 0,
      deals_errored: 0,
      threshold_crossings: 0,
      results: [],
    };

    for (const { deal_id, org_id } of dealIds) {
      try {
        const result = await recalculateDealTemperature(supabase, org_id, deal_id);
        batchResult.results.push(result);
        batchResult.deals_processed++;
        if (result.threshold_crossing) {
          batchResult.threshold_crossings++;
        }
      } catch (err) {
        console.error(`[agent-deal-temperature] Error for deal ${deal_id}:`, err);
        batchResult.deals_errored++;
      }
    }

    console.log(
      `[agent-deal-temperature] Batch complete: ${batchResult.deals_processed} processed, ` +
      `${batchResult.deals_errored} errored, ${batchResult.threshold_crossings} threshold crossings`
    );

    return jsonResponse(batchResult, req);

  } catch (error) {
    console.error('[agent-deal-temperature] Fatal error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});

// =============================================================================
// Core: recalculate temperature for a single deal
// =============================================================================

async function recalculateDealTemperature(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  dealId: string
): Promise<DealTemperatureResult> {
  const now = new Date();
  const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // -------------------------------------------------------------------------
  // Fetch previous temperature for threshold crossing detection
  // -------------------------------------------------------------------------
  const { data: prevRow } = await supabase
    .from('deal_signal_temperature')
    .select('temperature')
    .eq('deal_id', dealId)
    .maybeSingle();

  const previousTemperature: number | null = prevRow?.temperature ?? null;

  // -------------------------------------------------------------------------
  // Collect signal points from all sources
  // -------------------------------------------------------------------------
  const signalPoints: SignalPoint[] = [];

  // Source 1: email_signal_events (AI-classified)
  const { data: emailSignals } = await supabase
    .from('email_signal_events')
    .select('signal_type, confidence, context, created_at')
    .eq('deal_id', dealId)
    .eq('org_id', orgId)
    .gte('created_at', cutoff7d)
    .order('created_at', { ascending: false })
    .limit(100);

  for (const sig of emailSignals || []) {
    const baseWeight = EMAIL_SIGNAL_WEIGHTS[sig.signal_type] ?? 0;
    if (baseWeight === 0) continue;

    // Scale by AI confidence (default 1.0 if not set)
    const confidence = sig.confidence ?? 1.0;
    const weight = baseWeight * confidence;

    signalPoints.push({
      type: sig.signal_type,
      source: 'email_signal_events',
      description: sig.context ?? sig.signal_type,
      weight,
      detected_at: sig.created_at,
    });
  }

  // Source 2: communication_events (opens, clicks, replies)
  const { data: commEvents } = await supabase
    .from('communication_events')
    .select('event_type, was_opened, was_clicked, was_replied, event_timestamp')
    .eq('deal_id', dealId)
    .in('event_type', ['email_received', 'email_opened', 'email_clicked'])
    .gte('event_timestamp', cutoff7d)
    .order('event_timestamp', { ascending: false })
    .limit(100);

  for (const ev of commEvents || []) {
    // For email_received: check was_replied for fast_reply bonus
    let eventType = ev.event_type;
    if (ev.event_type === 'email_received' && ev.was_replied) {
      eventType = 'email_received'; // base reply weight
    }

    const weight = COMM_EVENT_WEIGHTS[eventType] ?? 0;
    if (weight === 0) continue;

    signalPoints.push({
      type: eventType,
      source: 'communication_events',
      description: `Email ${eventType.replace('email_', '')}`,
      weight,
      detected_at: ev.event_timestamp,
    });
  }

  // Source 3: email_send_log — proposal opens
  const { data: sendLogs } = await supabase
    .from('email_send_log')
    .select('status, opened_at, deal_id, created_at')
    .eq('deal_id', dealId)
    .not('opened_at', 'is', null)
    .gte('created_at', cutoff7d)
    .limit(20);

  for (const log of sendLogs || []) {
    signalPoints.push({
      type: 'proposal_opened',
      source: 'email_send_log',
      description: 'Email opened by recipient',
      weight: EMAIL_SIGNAL_WEIGHTS['proposal_opened'],
      detected_at: log.opened_at ?? log.created_at,
    });
  }

  // Source 4: account_signals (smart listening)
  const { data: accountSignals } = await supabase
    .from('account_signals')
    .select('signal_type, score_delta, description, detected_at')
    .eq('deal_id', dealId)
    .gte('detected_at', cutoff7d)
    .order('detected_at', { ascending: false })
    .limit(50);

  for (const sig of accountSignals || []) {
    const delta = sig.score_delta ?? 5;
    signalPoints.push({
      type: sig.signal_type ?? 'account_signal',
      source: 'account_signals',
      description: sig.description ?? sig.signal_type ?? 'Account signal',
      weight: delta,
      detected_at: sig.detected_at,
    });
  }

  // -------------------------------------------------------------------------
  // Apply 72-hour exponential decay and sum temperature
  // -------------------------------------------------------------------------
  const nowMs = now.getTime();
  let temperatureRaw = 0;

  for (const sig of signalPoints) {
    const detectedAt = new Date(sig.detected_at).getTime();
    const hoursSince = Math.max(0, (nowMs - detectedAt) / (1000 * 60 * 60));
    const decayFactor = Math.exp(-hoursSince / DECAY_HALF_LIFE_HOURS);
    temperatureRaw += sig.weight * decayFactor;
  }

  // Clamp to 0–100
  temperatureRaw = Math.max(0, Math.min(100, temperatureRaw));

  // Scale to 0.0–1.0 for storage (deal_signal_temperature.temperature is NUMERIC(4,3))
  const temperature = Math.round((temperatureRaw / 100) * 1000) / 1000;

  // -------------------------------------------------------------------------
  // Signal counts for trend detection
  // -------------------------------------------------------------------------
  const count24h = signalPoints.filter(
    (s) => new Date(s.detected_at) >= new Date(cutoff24h)
  ).length;

  const count7d = signalPoints.length;

  // -------------------------------------------------------------------------
  // Trend detection: compare 24h count vs 7-day daily average
  // -------------------------------------------------------------------------
  const dailyAvg7d = count7d / 7;
  let trend: 'rising' | 'falling' | 'stable' = 'stable';

  if (dailyAvg7d > 0) {
    const ratio = count24h / dailyAvg7d;
    if (ratio >= 1.5) {
      trend = 'rising';
    } else if (ratio <= 0.5) {
      trend = 'falling';
    }
  } else if (count24h > 0) {
    // No prior 7d baseline but signals today — treat as rising
    trend = 'rising';
  }

  // -------------------------------------------------------------------------
  // Top signals: sort by decayed score descending, take top 5
  // -------------------------------------------------------------------------
  const scoredSignals = signalPoints.map((s) => {
    const hoursSince = Math.max(
      0,
      (nowMs - new Date(s.detected_at).getTime()) / (1000 * 60 * 60)
    );
    const decayedScore = s.weight * Math.exp(-hoursSince / DECAY_HALF_LIFE_HOURS);
    return { ...s, score_delta: Math.round(decayedScore * 10) / 10 };
  });

  scoredSignals.sort((a, b) => Math.abs(b.score_delta) - Math.abs(a.score_delta));
  const topSignals = scoredSignals.slice(0, 5).map((s) => ({
    type: s.type,
    source: s.source,
    description: s.description,
    score_delta: s.score_delta,
    detected_at: s.detected_at,
  }));

  // Most recent signal timestamp
  const lastSignal = signalPoints.length > 0
    ? signalPoints.reduce((latest, s) =>
        new Date(s.detected_at) > new Date(latest) ? s.detected_at : latest,
        signalPoints[0].detected_at
      )
    : null;

  // -------------------------------------------------------------------------
  // Threshold crossing detection
  // -------------------------------------------------------------------------
  const thresholdCrossing = detectThresholdCrossing(
    previousTemperature !== null ? previousTemperature * 100 : null,
    temperatureRaw
  );

  // -------------------------------------------------------------------------
  // Upsert via RPC
  // -------------------------------------------------------------------------
  const { error: upsertError } = await supabase.rpc('upsert_signal_temperature', {
    p_deal_id:          dealId,
    p_org_id:           orgId,
    p_temperature:      temperature,
    p_trend:            trend,
    p_last_signal:      lastSignal,
    p_signal_count_24h: count24h,
    p_signal_count_7d:  count7d,
    p_top_signals:      topSignals,
  });

  if (upsertError) {
    console.error(
      `[agent-deal-temperature] upsert_signal_temperature failed for deal ${dealId}:`,
      upsertError.message
    );
    throw new Error(`upsert failed: ${upsertError.message}`);
  }

  return {
    deal_id: dealId,
    org_id: orgId,
    temperature_raw: Math.round(temperatureRaw * 10) / 10,
    temperature,
    trend,
    signal_count_24h: count24h,
    signal_count_7d: count7d,
    top_signals: topSignals,
    last_signal: lastSignal,
    threshold_crossing: thresholdCrossing,
    previous_temperature: previousTemperature,
  };
}

// =============================================================================
// Threshold crossing detection
// =============================================================================

function detectThresholdCrossing(
  previousRaw: number | null,
  currentRaw: number
): ThresholdCrossing | null {
  if (previousRaw === null) return null;

  // Cold → Warm (crossed up through 30)
  if (previousRaw < THRESHOLD_WARM && currentRaw >= THRESHOLD_WARM) {
    return { direction: 'warming', threshold: THRESHOLD_WARM, label: 'cold→warm' };
  }

  // Warm → Hot (crossed up through 60)
  if (previousRaw < THRESHOLD_HOT && currentRaw >= THRESHOLD_HOT) {
    return { direction: 'warming', threshold: THRESHOLD_HOT, label: 'warm→hot' };
  }

  // Hot → Warm (dropped below 60)
  if (previousRaw >= THRESHOLD_HOT && currentRaw < THRESHOLD_HOT) {
    return { direction: 'cooling', threshold: THRESHOLD_HOT, label: 'hot→warm' };
  }

  // Warm → Cold (dropped below 30)
  if (previousRaw >= THRESHOLD_WARM && currentRaw < THRESHOLD_WARM) {
    return { direction: 'cooling', threshold: THRESHOLD_WARM, label: 'warm→cold' };
  }

  return null;
}

// =============================================================================
// Helpers: resolve deals to recalculate
// =============================================================================

/**
 * Returns deals with signal activity in the last 7 days for a specific org.
 */
async function getActiveDealsForOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<Array<{ deal_id: string; org_id: string }>> {
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('email_signal_events')
    .select('deal_id')
    .eq('org_id', orgId)
    .not('deal_id', 'is', null)
    .gte('created_at', cutoff7d)
    .limit(500);

  if (error) {
    console.error('[agent-deal-temperature] Failed to fetch deals for org:', error.message);
    return [];
  }

  const uniqueDealIds = [...new Set((data || []).map((r: { deal_id: string }) => r.deal_id))];
  return uniqueDealIds.map((id) => ({ deal_id: id, org_id: orgId }));
}

/**
 * Returns all deals with signal activity in the last 7 days across all orgs.
 */
async function getActiveDealsAllOrgs(
  supabase: ReturnType<typeof createClient>
): Promise<Array<{ deal_id: string; org_id: string }>> {
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('email_signal_events')
    .select('deal_id, org_id')
    .not('deal_id', 'is', null)
    .gte('created_at', cutoff7d)
    .limit(1000);

  if (error) {
    console.error('[agent-deal-temperature] Failed to fetch active deals:', error.message);
    return [];
  }

  // Deduplicate by (deal_id, org_id)
  const seen = new Set<string>();
  const results: Array<{ deal_id: string; org_id: string }> = [];

  for (const row of data || []) {
    const key = `${row.deal_id}:${row.org_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ deal_id: row.deal_id, org_id: row.org_id });
    }
  }

  return results;
}

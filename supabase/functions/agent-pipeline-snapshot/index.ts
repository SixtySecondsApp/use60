/**
 * agent-pipeline-snapshot
 *
 * BRF-005: Weekly pipeline snapshot cron job.
 *
 * Captures point-in-time pipeline metrics per user/org and writes them to
 * pipeline_snapshots. Also computes trailing forecast accuracy by comparing
 * last week's snapshot predictions against actual closes.
 *
 * Triggered by:
 *   - pg_cron every Monday at 5:00 AM UTC (before morning briefing cycle)
 *   - Manual POST { action: 'snapshot', userId?, orgId? } for on-demand runs
 *
 * Metrics captured per user:
 *   - total_pipeline_value       — sum of all open deal values
 *   - weighted_pipeline_value    — sum of deal value × stage close_probability
 *   - deals_by_stage             — { stage_name: { count, total_value } }
 *   - deals_at_risk              — count of deals with risk_score >= threshold
 *   - closed_this_period         — closed-won value since last Monday
 *   - target                     — from agent_config quota.revenue (if set)
 *   - coverage_ratio             — total_pipeline / target
 *   - forecast_accuracy_trailing — last week's weighted_pipeline vs actual closes
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

// ============================================================================
// Types
// ============================================================================

interface SnapshotRow {
  org_id: string;
  user_id: string;
  snapshot_date: string;       // ISO date string YYYY-MM-DD
  period: string;
  total_pipeline_value: number;
  weighted_pipeline_value: number;
  deals_by_stage: Record<string, { count: number; total_value: number }>;
  deals_at_risk: number;
  closed_this_period: number;
  target: number | null;
  coverage_ratio: number | null;
  forecast_accuracy_trailing: number | null;
}

interface DealRow {
  id: string;
  value: number | null;
  risk_score: number | null;
  deal_stages: {
    name: string;
    close_probability: number | null;
  } | null;
}

interface ClosedDeal {
  value: number | null;
  closed_at: string | null;
  updated_at: string;
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const { action = 'snapshot', userId, orgId } = body;

    if (action !== 'snapshot') {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result;
    if (userId && orgId) {
      // On-demand: single user
      const snapshot = await captureUserSnapshot(supabase, userId, orgId);
      result = { success: true, snapshots: snapshot ? [snapshot] : [] };
    } else {
      // Cron mode: all org members
      result = await captureAllSnapshots(supabase);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[agent-pipeline-snapshot] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// Capture All Users (Cron Mode)
// ============================================================================

async function captureAllSnapshots(
  supabase: ReturnType<typeof createClient>
): Promise<{ success: boolean; snapshots_written: number; errors: number }> {
  console.log('[pipeline-snapshot] Starting cron snapshot for all users...');

  const { data: memberships, error: membershipsError } = await supabase
    .from('organization_memberships')
    .select('user_id, org_id');

  if (membershipsError) {
    throw new Error(`Failed to fetch memberships: ${membershipsError.message}`);
  }

  // Deduplicate by user (take first org per user)
  const userOrgMap = new Map<string, string>();
  for (const m of memberships || []) {
    if (!userOrgMap.has(m.user_id)) {
      userOrgMap.set(m.user_id, m.org_id);
    }
  }

  console.log(`[pipeline-snapshot] Processing ${userOrgMap.size} users`);

  let snapshotsWritten = 0;
  let errors = 0;

  for (const [userId, orgId] of userOrgMap) {
    try {
      const snapshot = await captureUserSnapshot(supabase, userId, orgId);
      if (snapshot) snapshotsWritten++;
    } catch (err) {
      console.error(`[pipeline-snapshot] Failed for user ${userId}:`, err);
      errors++;
    }
  }

  console.log(`[pipeline-snapshot] Done. Written: ${snapshotsWritten}, Errors: ${errors}`);
  return { success: true, snapshots_written: snapshotsWritten, errors };
}

// ============================================================================
// Capture Single User Snapshot
// ============================================================================

async function captureUserSnapshot(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string
): Promise<SnapshotRow | null> {
  const today = new Date();
  const snapshotDate = today.toISOString().split('T')[0]; // YYYY-MM-DD

  // Monday of last week (for closed_this_period window)
  const lastMonday = getPreviousMonday(today);
  const lastMondayIso = lastMonday.toISOString();

  // -------------------------------------------------------------------------
  // 1. Fetch all open deals with stage close probability
  // -------------------------------------------------------------------------
  const { data: openDeals, error: dealsError } = await supabase
    .from('deals')
    .select('id, value, risk_score, deal_stages(name, close_probability)')
    .eq('owner_id', userId)
    .eq('organization_id', orgId)
    .not('status', 'in', '("won","lost")');

  if (dealsError) {
    console.error(`[pipeline-snapshot] Failed to fetch open deals for user ${userId}:`, dealsError.message);
    return null;
  }

  const deals: DealRow[] = openDeals || [];

  // -------------------------------------------------------------------------
  // 2. Compute pipeline metrics
  // -------------------------------------------------------------------------
  let totalPipelineValue = 0;
  let weightedPipelineValue = 0;
  let dealsAtRisk = 0;
  const dealsByStage: Record<string, { count: number; total_value: number }> = {};

  for (const deal of deals) {
    const value = deal.value ?? 0;
    const stageName = deal.deal_stages?.name ?? 'Unknown';
    const closeProbability = deal.deal_stages?.close_probability ?? 0;
    const riskScore = deal.risk_score ?? 0;

    totalPipelineValue += value;
    weightedPipelineValue += value * (closeProbability / 100);

    if (!dealsByStage[stageName]) {
      dealsByStage[stageName] = { count: 0, total_value: 0 };
    }
    dealsByStage[stageName].count++;
    dealsByStage[stageName].total_value += value;

    // At-risk threshold: risk_score >= 60 (matches global thresholds default)
    if (riskScore >= 60) {
      dealsAtRisk++;
    }
  }

  // -------------------------------------------------------------------------
  // 3. Closed-won value since last Monday
  // -------------------------------------------------------------------------
  const { data: closedDeals, error: closedError } = await supabase
    .from('deals')
    .select('value, closed_at, updated_at')
    .eq('owner_id', userId)
    .eq('organization_id', orgId)
    .eq('status', 'won')
    .gte('updated_at', lastMondayIso);

  if (closedError) {
    console.warn(`[pipeline-snapshot] Failed to fetch closed deals for user ${userId}:`, closedError.message);
  }

  const closedThisPeriod = (closedDeals as ClosedDeal[] || []).reduce(
    (sum, d) => sum + (d.value ?? 0),
    0
  );

  // -------------------------------------------------------------------------
  // 4. Quota target from agent_config (morning_briefing quota.revenue)
  // -------------------------------------------------------------------------
  const { data: quotaConfig } = await supabase
    .rpc('resolve_agent_config', {
      p_org_id: orgId,
      p_user_id: userId,
      p_agent_type: 'morning_briefing',
      p_config_key: 'quota.revenue',
    });

  const target: number | null = quotaConfig?.value ?? null;
  const coverageRatio: number | null =
    target && target > 0 ? totalPipelineValue / target : null;

  // -------------------------------------------------------------------------
  // 5. Trailing forecast accuracy
  //    Compare last week's snapshot weighted_pipeline vs actual closes this week
  // -------------------------------------------------------------------------
  const lastWeekDate = lastMonday.toISOString().split('T')[0];
  const { data: lastSnapshot } = await supabase
    .from('pipeline_snapshots')
    .select('weighted_pipeline_value')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('snapshot_date', lastWeekDate)
    .maybeSingle();

  let forecastAccuracyTrailing: number | null = null;
  if (lastSnapshot && lastSnapshot.weighted_pipeline_value > 0) {
    // Accuracy = actual closes / predicted weighted pipeline (capped at 1.0)
    forecastAccuracyTrailing = Math.min(
      closedThisPeriod / lastSnapshot.weighted_pipeline_value,
      1.0
    );
  }

  // -------------------------------------------------------------------------
  // 6. Upsert snapshot row
  // -------------------------------------------------------------------------
  const row: SnapshotRow = {
    org_id: orgId,
    user_id: userId,
    snapshot_date: snapshotDate,
    period: 'weekly',
    total_pipeline_value: Math.round(totalPipelineValue * 100) / 100,
    weighted_pipeline_value: Math.round(weightedPipelineValue * 100) / 100,
    deals_by_stage: dealsByStage,
    deals_at_risk: dealsAtRisk,
    closed_this_period: Math.round(closedThisPeriod * 100) / 100,
    target,
    coverage_ratio: coverageRatio !== null ? Math.round(coverageRatio * 10000) / 10000 : null,
    forecast_accuracy_trailing: forecastAccuracyTrailing !== null
      ? Math.round(forecastAccuracyTrailing * 10000) / 10000
      : null,
  };

  const { error: upsertError } = await supabase
    .from('pipeline_snapshots')
    .upsert(row, { onConflict: 'org_id,user_id,snapshot_date' });

  if (upsertError) {
    console.error(`[pipeline-snapshot] Failed to upsert snapshot for user ${userId}:`, upsertError.message);
    return null;
  }

  console.log(
    `[pipeline-snapshot] Snapshot written for user ${userId}: ` +
    `pipeline=${totalPipelineValue}, weighted=${weightedPipelineValue.toFixed(2)}, ` +
    `closed=${closedThisPeriod}, accuracy=${forecastAccuracyTrailing}`
  );

  return row;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Returns the Monday of the current week (or last Monday if today is not Monday).
 * Used to define the "closed this period" window.
 */
function getPreviousMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Days since last Monday: if today is Monday (1), go back 7; else go back (day - 1)
  const daysBack = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysBack);
  d.setHours(0, 0, 0, 0);
  return d;
}

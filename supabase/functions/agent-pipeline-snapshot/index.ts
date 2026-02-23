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
import { runAgent } from '../_shared/agentRunner.ts';

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
  metadata?: Record<string, any> | null;
}

interface DealRow {
  id: string;
  value: number | null;
  risk_score: number | null;
  health_score: number | null;
  deal_stages: {
    name: string;
    default_probability: number | null;
  } | null;
}

interface ClosedDeal {
  value: number | null;
  closed_won_date: string | null;
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

    const agentResult = await runAgent(
      {
        agentName: 'pipeline-snapshot',
        userId: userId ?? 'system',
        orgId: orgId ?? 'system',
      },
      async () => {
        if (userId && orgId) {
          // On-demand: single user
          const snapshot = await captureUserSnapshot(supabase, userId, orgId);
          return { success: true, snapshots: snapshot ? [snapshot] : [] };
        }
        // Cron mode: all org members
        return captureAllSnapshots(supabase);
      },
    );

    const result = agentResult.success
      ? agentResult.data
      : { success: false, error: agentResult.error };

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
    .select('id, value, risk_score, health_score, deal_stages(name, default_probability)')
    .eq('owner_id', userId)
    .eq('org_id', orgId)
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
    const defaultProbability = deal.deal_stages?.default_probability ?? 0;
    const riskScore = deal.risk_score ?? 0;
    const healthScore = deal.health_score;

    totalPipelineValue += value;
    weightedPipelineValue += value * (defaultProbability / 100);

    if (!dealsByStage[stageName]) {
      dealsByStage[stageName] = { count: 0, total_value: 0 };
    }
    dealsByStage[stageName].count++;
    dealsByStage[stageName].total_value += value;

    // At-risk: risk_score >= 60 OR health_score < 50 (matches global thresholds defaults)
    if (riskScore >= 60 || (healthScore !== null && healthScore < 50)) {
      dealsAtRisk++;
    }
  }

  // -------------------------------------------------------------------------
  // 3. Closed-won value since last Monday
  // -------------------------------------------------------------------------
  const { data: closedDeals, error: closedError } = await supabase
    .from('deals')
    .select('value, closed_won_date')
    .eq('owner_id', userId)
    .eq('org_id', orgId)
    .eq('status', 'won')
    .gte('closed_won_date', lastMondayIso);

  if (closedError) {
    console.warn(`[pipeline-snapshot] Failed to fetch closed deals for user ${userId}:`, closedError.message);
  }

  const closedThisPeriod = ((closedDeals as ClosedDeal[]) || []).reduce(
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
  // 6. Per-stage forecast calibration (PRD-21)
  //    Compare last 4 snapshots' stage predictions vs actual outcomes
  // -------------------------------------------------------------------------
  let repCalibration: Record<string, any> | null = null;
  const { data: recentSnapshots } = await supabase
    .from('pipeline_snapshots')
    .select('snapshot_date, deals_by_stage, closed_this_period, weighted_pipeline_value, forecast_accuracy_trailing')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: false })
    .limit(4);

  if (recentSnapshots && recentSnapshots.length >= 4) {
    // Calculate per-stage optimism factor
    const stageAccuracies: Record<string, { predicted: number; count: number }> = {};
    let totalPredicted = 0;
    let totalActual = 0;

    for (const snap of recentSnapshots) {
      totalPredicted += snap.weighted_pipeline_value || 0;
      totalActual += snap.closed_this_period || 0;

      const stages = snap.deals_by_stage || {};
      for (const [stageName, stageData] of Object.entries(stages)) {
        const sd = stageData as { count: number; total_value: number };
        if (!stageAccuracies[stageName]) {
          stageAccuracies[stageName] = { predicted: 0, count: 0 };
        }
        stageAccuracies[stageName].predicted += sd.total_value;
        stageAccuracies[stageName].count += sd.count;
      }
    }

    const overallOptimism = totalPredicted > 0 ? totalActual / totalPredicted : 1;

    repCalibration = {
      overall_optimism_factor: Math.round(overallOptimism * 100) / 100,
      overall_note: overallOptimism < 0.8
        ? `You tend to be ${Math.round((1 - overallOptimism) * 100)}% optimistic in your pipeline predictions`
        : overallOptimism > 1.1
        ? `Your pipeline predictions are conservative — you close ${Math.round((overallOptimism - 1) * 100)}% more than predicted`
        : 'Your pipeline predictions are well-calibrated',
      weeks_of_data: recentSnapshots.length,
      calibrated_pipeline: Math.round(weightedPipelineValue * overallOptimism * 100) / 100,
    };
  }

  // -------------------------------------------------------------------------
  // 7. Upsert coaching_skill_progression with forecast accuracy
  // -------------------------------------------------------------------------
  if (forecastAccuracyTrailing !== null) {
    const weekStart = getWeekStart(today);
    await supabase.from('coaching_skill_progression').upsert({
      org_id: orgId,
      user_id: userId,
      week_start: weekStart,
      forecast_accuracy: forecastAccuracyTrailing,
      metadata: { calibration: repCalibration },
    }, { onConflict: 'org_id,user_id,week_start' });
  }

  // -------------------------------------------------------------------------
  // 8. Upsert snapshot row
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
    metadata: repCalibration ? { rep_calibration: repCalibration } : null,
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

/** Returns ISO date string for Monday of the given date's week. */
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

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

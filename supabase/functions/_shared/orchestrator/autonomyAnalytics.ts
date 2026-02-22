/**
 * Autonomy Analytics — GRAD-001
 *
 * Approval rate analytics for the graduated autonomy system (PRD-24).
 * Calculates and caches per-action-type approval/rejection/edit rates
 * over configurable time windows (7d, 30d, 90d).
 *
 * Data sources:
 * - crm_approval_queue (CRM field/stage changes with HITL lifecycle)
 * - crm_field_updates (auto-applied changes via change_source = 'auto_apply')
 * - agent_activity (broader action types: email, slack, task, etc.)
 * - hitl_pending_approvals (legacy, if table exists)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// =============================================================================
// Types
// =============================================================================

export interface ActionAnalytics {
  action_type: string;
  window_start: string;
  window_end: string;
  approval_count: number;
  rejection_count: number;
  edit_count: number;
  auto_approved_count: number;
  total_count: number;
  approval_rate: number;
}

export interface AutonomyStatsResult {
  orgId: string;
  windowDays: number;
  stats: ActionAnalytics[];
  calculatedAt: string;
  stale: boolean;
}

export interface PromotionThresholds {
  minApprovals: number;
  maxRejectionRate: number;
  minDaysActive: number;
  demotionRejectionRate: number;
  cooldownDays: number;
}

export const DEFAULT_THRESHOLDS: PromotionThresholds = {
  minApprovals: 30,
  maxRejectionRate: 5,
  minDaysActive: 14,
  demotionRejectionRate: 15,
  cooldownDays: 30,
};

/** How long cached stats remain fresh before triggering a refresh */
const STALENESS_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

// =============================================================================
// Core API
// =============================================================================

/**
 * Calculate and return autonomy stats for an org.
 * Automatically refreshes stale data (older than 1 hour).
 *
 * @param supabase - Supabase client (service role recommended for refresh)
 * @param orgId - Organization UUID
 * @param windowDays - Time window: 7, 30, or 90 (default: 30)
 * @returns Formatted stats result with staleness indicator
 */
export async function calculateAutonomyStats(
  supabase: SupabaseClient,
  orgId: string,
  windowDays: number = 30
): Promise<AutonomyStatsResult> {
  // Check freshness of cached data
  const { data: latest } = await supabase
    .from('autonomy_action_stats')
    .select('calculated_at')
    .eq('org_id', orgId)
    .eq('window_days', windowDays)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = Date.now();
  const calculatedAt = latest?.calculated_at
    ? new Date(latest.calculated_at).getTime()
    : 0;
  const isStale = !latest || (now - calculatedAt) > STALENESS_THRESHOLD_MS;

  // Refresh if stale
  if (isStale) {
    const { error: refreshError } = await supabase.rpc('refresh_autonomy_analytics', {
      p_org_id: orgId,
    });

    if (refreshError) {
      console.error('[autonomyAnalytics] Error refreshing analytics:', refreshError);
      // Continue with potentially stale data rather than failing
    }
  }

  // Fetch stats from the RPC
  const { data, error } = await supabase.rpc('get_autonomy_analytics', {
    p_org_id: orgId,
    p_window_days: windowDays,
  });

  if (error) {
    console.error('[autonomyAnalytics] Error fetching analytics:', error);
    return {
      orgId,
      windowDays,
      stats: [],
      calculatedAt: new Date().toISOString(),
      stale: true,
    };
  }

  const stats = (data || []) as ActionAnalytics[];

  return {
    orgId,
    windowDays,
    stats,
    calculatedAt: stats.length > 0
      ? new Date().toISOString()
      : new Date().toISOString(),
    stale: isStale && stats.length === 0,
  };
}

/**
 * Get stats for a specific action type within an org.
 *
 * @param supabase - Supabase client
 * @param orgId - Organization UUID
 * @param actionType - One of the 8 action types (e.g. 'crm_field_update', 'send_email')
 * @param windowDays - Time window: 7, 30, or 90 (default: 30)
 * @returns Stats for the action type, or null if no data
 */
export async function getActionTypeStats(
  supabase: SupabaseClient,
  orgId: string,
  actionType: string,
  windowDays: number = 30
): Promise<ActionAnalytics | null> {
  const result = await calculateAutonomyStats(supabase, orgId, windowDays);

  return result.stats.find((s) => s.action_type === actionType) ?? null;
}

/**
 * Get stats across all three windows (7d, 30d, 90d) for an action type.
 * Useful for trend analysis in promotion/demotion decisions.
 */
export async function getActionTypeTrend(
  supabase: SupabaseClient,
  orgId: string,
  actionType: string
): Promise<{ window7d: ActionAnalytics | null; window30d: ActionAnalytics | null; window90d: ActionAnalytics | null }> {
  const [w7, w30, w90] = await Promise.all([
    getActionTypeStats(supabase, orgId, actionType, 7),
    getActionTypeStats(supabase, orgId, actionType, 30),
    getActionTypeStats(supabase, orgId, actionType, 90),
  ]);

  return {
    window7d: w7,
    window30d: w30,
    window90d: w90,
  };
}

// =============================================================================
// Backward-Compatible Aliases
// (consumed by promotionEngine.ts, demotionHandler.ts, autonomy-promotion-notify)
// =============================================================================

/**
 * @deprecated Use calculateAutonomyStats instead
 */
export async function getAutonomyAnalytics(
  supabase: SupabaseClient,
  orgId: string,
  windowDays: number = 30
): Promise<ActionAnalytics[]> {
  const result = await calculateAutonomyStats(supabase, orgId, windowDays);
  return result.stats;
}

/**
 * @deprecated Use calculateAutonomyStats (which auto-refreshes) instead
 */
export async function refreshAnalytics(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  const { error } = await supabase.rpc('refresh_autonomy_analytics', {
    p_org_id: orgId,
  });

  if (error) {
    console.error('[autonomyAnalytics] Error refreshing analytics:', error);
  }
}

// =============================================================================
// Promotion / Demotion Helpers
// =============================================================================

/**
 * Check if an action type meets promotion criteria.
 * Promotion requires sufficient volume and low rejection rate over 30d.
 */
export function meetsPromotionCriteria(
  analytics: ActionAnalytics,
  thresholds: PromotionThresholds = DEFAULT_THRESHOLDS
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (analytics.total_count < thresholds.minApprovals) {
    reasons.push(
      `Need ${thresholds.minApprovals} total actions (have ${analytics.total_count})`
    );
  }

  const rejectionRate =
    analytics.total_count > 0
      ? (analytics.rejection_count / analytics.total_count) * 100
      : 0;

  if (rejectionRate > thresholds.maxRejectionRate) {
    reasons.push(
      `Rejection rate ${rejectionRate.toFixed(1)}% exceeds ${thresholds.maxRejectionRate}% threshold`
    );
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Check if an action type should be demoted based on recent (7d) rejection spike.
 * Requires at least 3 actions in the window to avoid noise.
 */
export function shouldDemote(
  analytics7d: ActionAnalytics,
  thresholds: PromotionThresholds = DEFAULT_THRESHOLDS
): { demote: boolean; reason: string | null } {
  if (analytics7d.total_count < 3) {
    return { demote: false, reason: null };
  }

  const rejectionRate =
    (analytics7d.rejection_count / analytics7d.total_count) * 100;

  if (rejectionRate > thresholds.demotionRejectionRate) {
    return {
      demote: true,
      reason: `Rejection rate spiked to ${rejectionRate.toFixed(1)}% in the last 7 days (threshold: ${thresholds.demotionRejectionRate}%)`,
    };
  }

  return { demote: false, reason: null };
}

// supabase/functions/_shared/orchestrator/autonomyAnalytics.ts
// Approval rate analytics for graduated autonomy system (PRD-24, GRAD-001)

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

export interface ActionAnalytics {
  action_type: string;
  approval_count: number;
  rejection_count: number;
  edit_count: number;
  auto_approved_count: number;
  total_count: number;
  approval_rate: number;
}

/**
 * Get cached autonomy analytics for an org.
 * Refreshes if data is older than 1 hour.
 */
export async function getAutonomyAnalytics(
  supabase: SupabaseClient,
  orgId: string,
  windowDays: number = 30
): Promise<ActionAnalytics[]> {
  // Check if analytics are fresh (< 1 hour old)
  const { data: latest } = await supabase
    .from('autonomy_analytics')
    .select('calculated_at')
    .eq('org_id', orgId)
    .eq('window_days', windowDays)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const needsRefresh = !latest || new Date(latest.calculated_at) < oneHourAgo;

  if (needsRefresh) {
    await refreshAnalytics(supabase, orgId);
  }

  const { data, error } = await supabase.rpc('get_autonomy_analytics', {
    p_org_id: orgId,
    p_window_days: windowDays,
  });

  if (error) {
    console.error('[autonomyAnalytics] Error fetching analytics:', error);
    return [];
  }

  return (data || []) as ActionAnalytics[];
}

/**
 * Refresh analytics by recalculating from approval queue.
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

/**
 * Check if an action type meets promotion criteria.
 */
export function meetsPromotionCriteria(
  analytics: ActionAnalytics,
  thresholds: PromotionThresholds = DEFAULT_THRESHOLDS
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (analytics.total_count < thresholds.minApprovals) {
    reasons.push(`Need ${thresholds.minApprovals} total actions (have ${analytics.total_count})`);
  }

  const rejectionRate = analytics.total_count > 0
    ? (analytics.rejection_count / analytics.total_count) * 100
    : 0;

  if (rejectionRate > thresholds.maxRejectionRate) {
    reasons.push(`Rejection rate ${rejectionRate.toFixed(1)}% exceeds ${thresholds.maxRejectionRate}% threshold`);
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Check if an action type should be demoted.
 */
export function shouldDemote(
  analytics7d: ActionAnalytics,
  thresholds: PromotionThresholds = DEFAULT_THRESHOLDS
): { demote: boolean; reason: string | null } {
  if (analytics7d.total_count < 3) {
    return { demote: false, reason: null };
  }

  const rejectionRate = (analytics7d.rejection_count / analytics7d.total_count) * 100;

  if (rejectionRate > thresholds.demotionRejectionRate) {
    return {
      demote: true,
      reason: `Rejection rate spiked to ${rejectionRate.toFixed(1)}% in the last 7 days (threshold: ${thresholds.demotionRejectionRate}%)`,
    };
  }

  return { demote: false, reason: null };
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

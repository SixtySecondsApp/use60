/**
 * autonomyService — React Query hooks for the Autonomy Dashboard.
 *
 * Wires `autopilot_confidence` table data into the dashboard via typed hooks.
 * Joins with `autopilot_thresholds` to show promotion criteria alongside stats.
 *
 * Story: AUT-007
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { useOrgStore } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface AutonomyDashboardRow {
  action_type: string;
  current_tier: 'disabled' | 'suggest' | 'approve' | 'auto';
  score: number;
  approval_rate: number | null;
  clean_approval_rate: number | null;
  rejection_rate: number | null;
  undo_rate: number | null;
  total_signals: number;
  total_approved: number;
  total_rejected: number;
  total_undone: number;
  last_30_score: number | null;
  days_active: number;
  promotion_eligible: boolean;
  cooldown_until: string | null;
  never_promote: boolean;
  extra_required_signals: number;
  first_signal_at: string | null;
  last_signal_at: string | null;
  // Joined from autopilot_thresholds
  threshold_approval_rate: number | null;
  threshold_min_signals: number | null;
  threshold_window_days: number | null;
}

export interface AutonomyThreshold {
  action_type: string;
  from_tier: string;
  to_tier: string;
  min_approval_rate: number;
  min_signals: number;
  window_days: number;
  cooldown_days: number;
}

export interface WindowedApprovalRate {
  action_type: string;
  window_days: 7 | 30 | 90;
  approval_rate: number | null;
  signal_count: number;
}

// ============================================================================
// Query keys
// ============================================================================

const AUTONOMY_SERVICE_KEYS = {
  dashboard: (userId: string | undefined) =>
    ['autonomy-service', 'dashboard', userId] as const,
  thresholds: (orgId: string | undefined) =>
    ['autonomy-service', 'thresholds', orgId] as const,
  windowedRates: (userId: string | undefined, windowDays: number) =>
    ['autonomy-service', 'windowed-rates', userId, windowDays] as const,
};

// ============================================================================
// Data fetchers
// ============================================================================

async function fetchDashboardRows(userId: string): Promise<AutonomyDashboardRow[]> {
  const { data, error } = await supabase
    .from('autopilot_confidence')
    .select(
      'action_type, current_tier, score, approval_rate, clean_approval_rate, ' +
      'rejection_rate, undo_rate, total_signals, total_approved, total_rejected, ' +
      'total_undone, last_30_score, days_active, promotion_eligible, cooldown_until, ' +
      'never_promote, extra_required_signals, first_signal_at, last_signal_at'
    )
    .eq('user_id', userId)
    .order('action_type');

  if (error) throw error;

  const rows = (data ?? []) as Omit<
    AutonomyDashboardRow,
    'threshold_approval_rate' | 'threshold_min_signals' | 'threshold_window_days'
  >[];

  // Fetch thresholds for the next promotion level per action type
  const { data: thresholds } = await supabase
    .from('autopilot_thresholds')
    .select('action_type, from_tier, to_tier, min_approval_rate, min_signals, window_days')
    .order('action_type');

  const thresholdMap = new Map<string, AutonomyThreshold>();
  for (const t of thresholds ?? []) {
    // Map from current tier to next threshold (from_tier = current tier)
    thresholdMap.set(`${t.action_type}:${t.from_tier}`, t as AutonomyThreshold);
  }

  return rows.map((row) => {
    const key = `${row.action_type}:${row.current_tier}`;
    const threshold = thresholdMap.get(key);
    return {
      ...row,
      threshold_approval_rate: threshold?.min_approval_rate ?? null,
      threshold_min_signals: threshold?.min_signals ?? null,
      threshold_window_days: threshold?.window_days ?? null,
    };
  });
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetches all autopilot confidence rows for the current user,
 * joined with threshold data for promotion criteria display.
 *
 * Cached for 5 minutes (stale time).
 */
export function useAutonomyDashboardRows() {
  const { data: user } = useAuthUser();

  return useQuery<AutonomyDashboardRow[]>({
    queryKey: AUTONOMY_SERVICE_KEYS.dashboard(user?.id),
    queryFn: () => fetchDashboardRows(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetches windowed approval rate data per action type.
 * Returns a map of action_type → approval rate for the given window.
 *
 * Falls back to the `autopilot_confidence.approval_rate` (30-day default)
 * if a dedicated windowed view is not available.
 *
 * @param windowDays - 7, 30, or 90 days
 */
export function useWindowedApprovalRates(windowDays: 7 | 30 | 90 = 30) {
  const { data: user } = useAuthUser();

  return useQuery<Record<string, number | null>>({
    queryKey: AUTONOMY_SERVICE_KEYS.windowedRates(user?.id, windowDays),
    queryFn: async () => {
      if (!user?.id) return {};

      // Attempt to query windowed data from the RPC if available,
      // falling back to confidence table data
      const { data, error } = await supabase
        .from('autopilot_confidence')
        .select('action_type, approval_rate, last_30_score')
        .eq('user_id', user.id);

      if (error) throw error;

      const result: Record<string, number | null> = {};
      for (const row of data ?? []) {
        // For 7-day: use last_30_score as a proxy (best available)
        // For 30-day: use approval_rate
        // For 90-day: use approval_rate (all-time)
        if (windowDays === 7) {
          result[row.action_type] = row.last_30_score;
        } else {
          result[row.action_type] = row.approval_rate;
        }
      }
      return result;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetches org-level autopilot thresholds for all action types.
 */
export function useAutonomyThresholds() {
  const orgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<AutonomyThreshold[]>({
    queryKey: AUTONOMY_SERVICE_KEYS.thresholds(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('autopilot_thresholds')
        .select(
          'action_type, from_tier, to_tier, min_approval_rate, min_signals, window_days, cooldown_days'
        )
        .order('action_type');

      if (error) throw error;
      return (data ?? []) as AutonomyThreshold[];
    },
    enabled: !!orgId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * useAutopilotDashboard — React Query hook for autopilot confidence data.
 *
 * Fetches all `autopilot_confidence` rows for the current user and computes
 * dashboard-level aggregates: autonomy score, time saved, tier counts, etc.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuthUser } from '@/lib/hooks/useAuthUser';

// ============================================================================
// Types
// ============================================================================

export interface ActionTypeStats {
  action_type: string;
  current_tier: 'disabled' | 'suggest' | 'approve' | 'auto';
  score: number;
  approval_rate: number | null;
  clean_approval_rate: number | null;
  edit_rate: number | null;
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
}

export interface AutopilotDashboardData {
  stats: ActionTypeStats[];
  /** 0–100: percentage of tracked action types at the 'auto' tier */
  autonomy_score: number;
  /** Estimated hours saved per week across all auto/approve-tier actions */
  time_saved_hours_week: number;
  /** Total signals at the 'auto' tier in the last 30 days */
  total_auto_actions: number;
  /** Number of distinct action types being tracked */
  total_action_types_tracked: number;
  /** How many action types are at the 'auto' tier */
  auto_count: number;
  /** How many action types are at the 'approve' tier */
  approve_count: number;
  /** How many action types are at the 'suggest' tier */
  suggest_count: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Estimated time (in seconds) a user saves when an action is automated.
 * Used to calculate `time_saved_hours_week`.
 */
const ACTION_TIME_SECONDS: Record<string, number> = {
  'crm.note_add': 120,
  'crm.activity_log': 30,
  'crm.contact_enrich': 300,
  'crm.next_steps_update': 60,
  'crm.deal_field_update': 45,
  'crm.deal_stage_change': 30,
  'crm.deal_amount_change': 30,
  'crm.deal_close_date_change': 30,
  'email.draft_save': 0,
  'email.send': 600,
  'email.follow_up_send': 480,
  'email.check_in_send': 300,
  'task.create': 60,
  'task.assign': 30,
  'analysis.risk_assessment': 900,
  'analysis.coaching_feedback': 1200,
};

const DEFAULT_ACTION_TIME_SECONDS = 60;

// ============================================================================
// Data fetching
// ============================================================================

async function fetchAutopilotDashboard(userId: string): Promise<AutopilotDashboardData> {
  const { data, error } = await supabase
    .from('autopilot_confidence')
    .select(
      'action_type, current_tier, score, approval_rate, clean_approval_rate, ' +
      'edit_rate, rejection_rate, undo_rate, total_signals, total_approved, ' +
      'total_rejected, total_undone, last_30_score, days_active, ' +
      'promotion_eligible, cooldown_until, never_promote, extra_required_signals, ' +
      'first_signal_at, last_signal_at'
    )
    .eq('user_id', userId)
    .order('action_type');

  if (error) throw error;

  const rows = (data ?? []) as ActionTypeStats[];

  if (rows.length === 0) {
    return {
      stats: [],
      autonomy_score: 0,
      time_saved_hours_week: 0,
      total_auto_actions: 0,
      total_action_types_tracked: 0,
      auto_count: 0,
      approve_count: 0,
      suggest_count: 0,
    };
  }

  // Tier counts
  const auto_count = rows.filter((r) => r.current_tier === 'auto').length;
  const approve_count = rows.filter((r) => r.current_tier === 'approve').length;
  const suggest_count = rows.filter((r) => r.current_tier === 'suggest').length;

  // Autonomy score: % of action types at 'auto'
  const autonomy_score = (auto_count / rows.length) * 100;

  // Total auto-tier signals in the last 30 days
  const total_auto_actions = rows
    .filter((r) => r.current_tier === 'auto')
    .reduce((sum, r) => sum + (r.last_30_score != null ? r.last_30_score : 0), 0);

  // Time saved per week (in hours)
  // For auto-tier: signals/90days * 7 = signals per week; × time per action
  // For approve-tier: same but × 0.70 (70% time saved with HITL)
  let totalTimeSavedSeconds = 0;

  for (const row of rows) {
    if (row.current_tier !== 'auto' && row.current_tier !== 'approve') {
      continue;
    }

    const timeSeconds =
      ACTION_TIME_SECONDS[row.action_type] ?? DEFAULT_ACTION_TIME_SECONDS;

    // Estimate weekly signal rate from total signals over the tracked period
    const signalsPerWeek = (row.total_signals / 90) * 7;

    const multiplier = row.current_tier === 'auto' ? 1.0 : 0.7;

    totalTimeSavedSeconds += signalsPerWeek * timeSeconds * multiplier;
  }

  const time_saved_hours_week = totalTimeSavedSeconds / 3600;

  return {
    stats: rows,
    autonomy_score,
    time_saved_hours_week,
    total_auto_actions,
    total_action_types_tracked: rows.length,
    auto_count,
    approve_count,
    suggest_count,
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetches all autopilot confidence data for the current authenticated user
 * and computes dashboard-level aggregates.
 *
 * @example
 * const { data, isLoading, error, refetch } = useAutopilotDashboard();
 * if (data) {
 *   console.log('Autonomy score:', data.autonomy_score);
 *   console.log('Hours saved/week:', data.time_saved_hours_week);
 * }
 */
export function useAutopilotDashboard() {
  const { data: user } = useAuthUser();

  return useQuery<AutopilotDashboardData>({
    queryKey: ['autopilot-dashboard', user?.id],
    queryFn: () => fetchAutopilotDashboard(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export default useAutopilotDashboard;

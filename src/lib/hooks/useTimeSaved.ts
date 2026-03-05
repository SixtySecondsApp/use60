/**
 * useTimeSaved — React Query hook for precise time-saved calculation.
 *
 * Calculates time saved based on actual `autopilot_signals` history within a
 * given time period. Auto-tier actions count as 100% time saved; approve-tier
 * actions count as 70% (accounts for HITL review overhead).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuthUser } from '@/lib/hooks/useAuthUser';

// ============================================================================
// Types
// ============================================================================

export type TimePeriod = 'day' | 'week' | 'month';

export interface TimeSavedBreakdownItem {
  action_type: string;
  tier: string;
  seconds_saved: number;
  action_count: number;
}

export interface TimeSavedData {
  period: TimePeriod;
  total_seconds: number;
  total_hours: number;
  /** Seconds saved from auto-tier actions (100% of action time) */
  auto_seconds: number;
  /** Seconds saved from approve-tier actions (70% of action time) */
  approve_seconds: number;
  /** Count of auto-executed actions in the period */
  actions_auto: number;
  /** Count of approved actions in the period */
  actions_approved: number;
  breakdown: TimeSavedBreakdownItem[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Estimated time (in seconds) a user saves when an action is automated.
 * Mirrors the same table used in useAutopilotDashboard for consistency.
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

const DEFAULT_TIME_SECONDS = 60;

/** Signals that count as a completed / saved action for auto-tier rows */
const AUTO_TIER_COUNTED_SIGNALS = new Set(['auto_executed', 'approved']);

// ============================================================================
// Helpers
// ============================================================================

function getPeriodStartDate(period: TimePeriod): Date {
  const now = new Date();
  switch (period) {
    case 'day':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

// ============================================================================
// Signal row type — only the columns we select
// ============================================================================

interface SignalRow {
  action_type: string;
  signal: string;
  autonomy_tier_at_time: string;
  created_at: string;
}

// ============================================================================
// Data fetching
// ============================================================================

async function fetchTimeSaved(userId: string, period: TimePeriod): Promise<TimeSavedData> {
  const startDate = getPeriodStartDate(period);

  const { data, error } = await supabase
    .from('autopilot_signals')
    .select('action_type, signal, autonomy_tier_at_time, created_at')
    .eq('user_id', userId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as SignalRow[];

  const empty: TimeSavedData = {
    period,
    total_seconds: 0,
    total_hours: 0,
    auto_seconds: 0,
    approve_seconds: 0,
    actions_auto: 0,
    actions_approved: 0,
    breakdown: [],
  };

  if (rows.length === 0) {
    return empty;
  }

  // Accumulate per-(action_type, tier) for breakdown
  const breakdownMap = new Map<string, TimeSavedBreakdownItem>();

  let auto_seconds = 0;
  let approve_seconds = 0;
  let actions_auto = 0;
  let actions_approved = 0;

  for (const row of rows) {
    const tier = row.autonomy_tier_at_time;
    const signal = row.signal;
    const baseTime = ACTION_TIME_SECONDS[row.action_type] ?? DEFAULT_TIME_SECONDS;

    let secondsSaved = 0;

    if (tier === 'auto' && AUTO_TIER_COUNTED_SIGNALS.has(signal)) {
      // Full time saved — no human effort required
      secondsSaved = baseTime;
      auto_seconds += secondsSaved;
      actions_auto += 1;
    } else if (tier === 'approve' && signal === 'approved') {
      // 70% time saved — human still reviews
      secondsSaved = baseTime * 0.7;
      approve_seconds += secondsSaved;
      actions_approved += 1;
    }
    // All other signals (rejected, expired, undone, approved_edited at non-approve tier, etc.) → 0

    // Accumulate into breakdown map keyed by "action_type::tier"
    const key = `${row.action_type}::${tier}`;
    const existing = breakdownMap.get(key);
    if (existing) {
      existing.seconds_saved += secondsSaved;
      existing.action_count += 1;
    } else {
      breakdownMap.set(key, {
        action_type: row.action_type,
        tier,
        seconds_saved: secondsSaved,
        action_count: 1,
      });
    }
  }

  // Sort breakdown by seconds_saved descending for easy consumption by UI
  const breakdown = Array.from(breakdownMap.values()).sort(
    (a, b) => b.seconds_saved - a.seconds_saved
  );

  const total_seconds = auto_seconds + approve_seconds;
  const total_hours = total_seconds / 3600;

  return {
    period,
    total_seconds,
    total_hours,
    auto_seconds,
    approve_seconds,
    actions_auto,
    actions_approved,
    breakdown,
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Calculates precise time saved based on actual `autopilot_signals` history.
 *
 * Auto-tier actions in the period (signals: `auto_executed` or `approved`)
 * contribute 100% of their estimated action time. Approve-tier actions
 * (signal: `approved`) contribute 70% — accounting for HITL review overhead.
 *
 * @param period - Time window: 'day' (24 h), 'week' (7 d), or 'month' (30 d).
 *                 Defaults to 'week'.
 *
 * @example
 * const { data, isLoading, error, refetch } = useTimeSaved('week');
 * if (data) {
 *   console.log('Hours saved this week:', data.total_hours);
 *   console.log('Auto actions:', data.actions_auto);
 * }
 */
export function useTimeSaved(period: TimePeriod = 'week') {
  const { data: user } = useAuthUser();

  return useQuery<TimeSavedData>({
    queryKey: ['time-saved', user?.id, period],
    queryFn: () => fetchTimeSaved(user!.id, period),
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes — slightly fresher than autopilot dashboard
    refetchOnWindowFocus: false,
  });
}

export default useTimeSaved;

/**
 * useAutopilotHistory — React Query hook for autonomy score progression over time.
 *
 * Fetches tier-change events from `autopilot_events` for the current user and
 * reconstructs the autonomy score at each point in time.
 *
 * Autonomy score = (# action types at 'auto' tier) / (total tracked action types) * 100
 *
 * Logic:
 *   1. Fetch promotion/demotion events ordered chronologically
 *   2. Maintain a running map of { action_type -> current_tier }
 *   3. After each event, recompute the score
 *   4. Append today's current score as the final point
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { useAutopilotDashboard } from '@/lib/hooks/useAutopilotDashboard';

// ============================================================================
// Types
// ============================================================================

export interface AutonomyHistoryPoint {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** ISO datetime string for precise tooltip display */
  timestamp: string;
  /** 0–100: percentage of action types at 'auto' tier at this point in time */
  autonomy_score: number;
  event_type: string;
  action_type: string;
  from_tier: string;
  to_tier: string;
}

interface AutopilotEventRow {
  action_type: string;
  event_type: string;
  from_tier: string;
  to_tier: string;
  created_at: string;
}

// ============================================================================
// All known action types (used as the denominator for the score)
// ============================================================================

const ALL_ACTION_TYPES = [
  'crm.note_add',
  'crm.activity_log',
  'crm.contact_enrich',
  'crm.next_steps_update',
  'crm.deal_field_update',
  'crm.deal_stage_change',
  'crm.deal_amount_change',
  'crm.deal_close_date_change',
  'email.draft_save',
  'email.send',
  'email.follow_up_send',
  'email.check_in_send',
  'task.create',
  'task.assign',
  'calendar.create_event',
  'calendar.reschedule',
  'analysis.risk_assessment',
  'analysis.coaching_feedback',
];

// ============================================================================
// Helpers
// ============================================================================

function toDateKey(isoString: string): string {
  return isoString.slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString();
}

function startOfDayDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function computeScore(tierMap: Map<string, string>, trackedTypes: string[]): number {
  if (trackedTypes.length === 0) return 0;
  const autoCount = trackedTypes.filter((at) => tierMap.get(at) === 'auto').length;
  return (autoCount / trackedTypes.length) * 100;
}

// ============================================================================
// Fetch function
// ============================================================================

async function fetchAutopilotHistory(
  userId: string,
  days: number,
  currentScore: number,
): Promise<AutonomyHistoryPoint[]> {
  const startDate = startOfDayDaysAgo(days);

  const { data, error } = await supabase
    .from('autopilot_events')
    .select('action_type, event_type, from_tier, to_tier, created_at')
    .eq('user_id', userId)
    .in('event_type', ['promotion_accepted', 'demotion_auto', 'demotion_emergency'])
    .gte('created_at', startDate)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const events = (data ?? []) as AutopilotEventRow[];

  // No events: return a single point with the current score
  if (events.length === 0) {
    return [
      {
        date: toDateKey(todayIso()),
        timestamp: todayIso(),
        autonomy_score: Math.round(currentScore),
        event_type: 'current',
        action_type: '',
        from_tier: '',
        to_tier: '',
      },
    ];
  }

  // Build the set of action types that appear across all events — these are
  // the ones we've actually seen the user interact with in this window.
  // We combine with ALL_ACTION_TYPES so we have a stable denominator.
  const seenActionTypes = new Set(ALL_ACTION_TYPES);
  for (const ev of events) {
    seenActionTypes.add(ev.action_type);
  }
  const trackedTypes = Array.from(seenActionTypes);

  // Initialise the tier map: all types start at 'approve' (the default tier
  // before any promotions have been accepted).
  const tierMap = new Map<string, string>();
  for (const at of trackedTypes) {
    tierMap.set(at, 'approve');
  }

  const points: AutonomyHistoryPoint[] = [];

  for (const ev of events) {
    // Apply the tier change
    tierMap.set(ev.action_type, ev.to_tier);

    const score = computeScore(tierMap, trackedTypes);
    points.push({
      date: toDateKey(ev.created_at),
      timestamp: ev.created_at,
      autonomy_score: Math.round(score),
      event_type: ev.event_type,
      action_type: ev.action_type,
      from_tier: ev.from_tier,
      to_tier: ev.to_tier,
    });
  }

  // Append today's current score as the final anchor point (if it differs from
  // the last event date, or always to ensure the line reaches "now").
  const todayStr = toDateKey(todayIso());
  const lastPoint = points[points.length - 1];
  if (!lastPoint || lastPoint.date !== todayStr || lastPoint.autonomy_score !== Math.round(currentScore)) {
    points.push({
      date: todayStr,
      timestamp: todayIso(),
      autonomy_score: Math.round(currentScore),
      event_type: 'current',
      action_type: '',
      from_tier: '',
      to_tier: '',
    });
  }

  return points;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Returns a time-series of autonomy score changes for the current user.
 *
 * @param days - Number of days of history to fetch (default: 90)
 *
 * @example
 * const { data, isLoading } = useAutopilotHistory(90);
 * // data is AutonomyHistoryPoint[] sorted oldest → newest
 */
export function useAutopilotHistory(days: number = 90) {
  const { data: user } = useAuthUser();
  const { data: dashboard } = useAutopilotDashboard();

  const currentScore = dashboard?.autonomy_score ?? 0;

  return useQuery<AutonomyHistoryPoint[]>({
    queryKey: ['autopilot-history', user?.id, days, currentScore],
    queryFn: () => fetchAutopilotHistory(user!.id, days, currentScore),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export default useAutopilotHistory;

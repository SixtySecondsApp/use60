/**
 * useTeamAutopilot — React Query hook for manager/admin team-wide autonomy view.
 *
 * Calls the `autopilot-admin` edge function with `get_team_confidence` to fetch
 * all org members' `autopilot_confidence` rows, then transforms them into
 * per-member stats with aggregated autonomy scores and time-saved estimates.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

export interface TeamMemberStats {
  user_id: string;
  /** Email or name from profiles, falls back to first 8 chars of user_id */
  display_name: string;
  /** 0–100: percentage of tracked action types at the 'auto' tier */
  autonomy_score: number;
  /** Number of action types at 'auto' tier */
  auto_count: number;
  /** Number of action types at 'approve' tier */
  approve_count: number;
  /** Number of distinct action types being tracked */
  total_action_types: number;
  /** Estimated hours saved per week across auto/approve-tier actions */
  time_saved_hours_week: number;
  /** Days since the first signal was recorded (null if no signals yet) */
  days_since_first_signal: number | null;
  /** Per-action-type summary for this member */
  action_stats: Array<{
    action_type: string;
    current_tier: string;
    score: number;
  }>;
}

export interface TeamAutopilotData {
  members: TeamMemberStats[];
  team_avg_autonomy: number;
  team_total_time_saved_week: number;
  total_auto_actions_week: number;
}

// ============================================================================
// Raw row type returned by the edge function
// ============================================================================

interface ConfidenceRow {
  user_id: string;
  org_id: string;
  action_type: string;
  score: number;
  approval_rate: number | null;
  clean_approval_rate: number | null;
  rejection_rate: number | null;
  undo_rate: number | null;
  total_signals: number;
  days_active: number;
  last_30_score: number | null;
  current_tier: string;
  cooldown_until: string | null;
  never_promote: boolean;
  updated_at: string;
}

// ============================================================================
// Time constants — mirrors useAutopilotDashboard
// ============================================================================

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

async function fetchTeamAutopilot(orgId: string): Promise<TeamAutopilotData> {
  // 1. Fetch raw confidence rows for all org members
  const { data: invokeData, error: invokeError } = await supabase.functions.invoke(
    'autopilot-admin',
    { body: { action: 'get_team_confidence', org_id: orgId } },
  );

  if (invokeError) throw invokeError;

  const rows: ConfidenceRow[] = (invokeData?.data ?? []) as ConfidenceRow[];

  if (rows.length === 0) {
    return {
      members: [],
      team_avg_autonomy: 0,
      team_total_time_saved_week: 0,
      total_auto_actions_week: 0,
    };
  }

  // 2. Collect unique user_ids and resolve display names from profiles
  const uniqueUserIds = Array.from(new Set(rows.map((r) => r.user_id)));

  // Intentionally use maybeSingle pattern via .in() — won't throw if rows are missing
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .in('id', uniqueUserIds);

  const profileById = new Map<string, { email: string; first_name: string | null; last_name: string | null }>();
  for (const p of profiles ?? []) {
    profileById.set(p.id, {
      email: p.email ?? '',
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
    });
  }

  const getDisplayName = (userId: string): string => {
    const profile = profileById.get(userId);
    if (!profile) return userId.slice(0, 8);
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
    return fullName || profile.email || userId.slice(0, 8);
  };

  // 3. Group rows by user_id
  const rowsByUser = new Map<string, ConfidenceRow[]>();
  for (const row of rows) {
    const existing = rowsByUser.get(row.user_id);
    if (existing) {
      existing.push(row);
    } else {
      rowsByUser.set(row.user_id, [row]);
    }
  }

  // 4. Build per-member stats
  const members: TeamMemberStats[] = [];
  let totalAutoActionsWeek = 0;

  for (const [userId, memberRows] of rowsByUser.entries()) {
    const auto_count = memberRows.filter((r) => r.current_tier === 'auto').length;
    const approve_count = memberRows.filter((r) => r.current_tier === 'approve').length;
    const total_action_types = memberRows.length;
    const autonomy_score = total_action_types > 0 ? (auto_count / total_action_types) * 100 : 0;

    // Estimate weekly time saved using same formula as useAutopilotDashboard
    let totalTimeSavedSeconds = 0;
    for (const row of memberRows) {
      if (row.current_tier !== 'auto' && row.current_tier !== 'approve') continue;

      const timeSeconds = ACTION_TIME_SECONDS[row.action_type] ?? DEFAULT_ACTION_TIME_SECONDS;
      const signalsPerWeek = (row.total_signals / 90) * 7;
      const multiplier = row.current_tier === 'auto' ? 1.0 : 0.7;
      totalTimeSavedSeconds += signalsPerWeek * timeSeconds * multiplier;
    }

    const time_saved_hours_week = totalTimeSavedSeconds / 3600;

    // Auto actions in last 30 days (last_30_score is a proxy)
    const autoActionsWeek = memberRows
      .filter((r) => r.current_tier === 'auto')
      .reduce((sum, r) => sum + (r.last_30_score ?? 0), 0);

    totalAutoActionsWeek += autoActionsWeek;

    // Days since first signal: use days_active from any row (max across rows for earliest signal proxy)
    const maxDaysActive = memberRows.reduce((max, r) => Math.max(max, r.days_active ?? 0), 0);
    const days_since_first_signal = maxDaysActive > 0 ? maxDaysActive : null;

    members.push({
      user_id: userId,
      display_name: getDisplayName(userId),
      autonomy_score,
      auto_count,
      approve_count,
      total_action_types,
      time_saved_hours_week,
      days_since_first_signal,
      action_stats: memberRows.map((r) => ({
        action_type: r.action_type,
        current_tier: r.current_tier,
        score: r.score,
      })),
    });
  }

  // Sort members by autonomy_score descending (highest autonomy first)
  members.sort((a, b) => b.autonomy_score - a.autonomy_score);

  const team_avg_autonomy =
    members.length > 0
      ? members.reduce((sum, m) => sum + m.autonomy_score, 0) / members.length
      : 0;

  const team_total_time_saved_week = members.reduce(
    (sum, m) => sum + m.time_saved_hours_week,
    0,
  );

  return {
    members,
    team_avg_autonomy,
    team_total_time_saved_week,
    total_auto_actions_week: totalAutoActionsWeek,
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetches team-wide autopilot confidence data for admins/managers.
 * Calls `autopilot-admin` with `get_team_confidence` and transforms into
 * per-member stats with autonomy scores, tier counts, and time-saved estimates.
 *
 * @param orgId - The organization ID. Hook is disabled when null.
 *
 * @example
 * const { data, isLoading, error } = useTeamAutopilot(orgId);
 * if (data) {
 *   console.log('Team avg autonomy:', data.team_avg_autonomy);
 *   console.log('Members:', data.members.length);
 * }
 */
export function useTeamAutopilot(orgId: string | null) {
  return useQuery<TeamAutopilotData>({
    queryKey: ['team-autopilot', orgId],
    queryFn: () => fetchTeamAutopilot(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export default useTeamAutopilot;

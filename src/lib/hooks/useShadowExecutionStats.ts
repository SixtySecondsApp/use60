/**
 * useShadowExecutionStats — React Query hook for shadow execution analytics (AE2-013)
 *
 * Calls the `get_shadow_execution_stats` RPC to fetch match-rate data for
 * shadow executions, and also fetches the last N shadow comparisons for
 * the "see evidence" expandable detail.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';

// ============================================================================
// Types
// ============================================================================

export interface ShadowExecutionStatRow {
  total: number;
  would_have_matched: number;
  match_rate: number;
  action_type: string;
}

export interface ShadowComparison {
  id: string;
  action_type: string;
  actual_tier: string;
  shadow_tier: string;
  user_decision: string | null;
  edit_distance: number | null;
  would_have_matched: boolean | null;
  action_snapshot: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// Data fetching
// ============================================================================

async function fetchShadowStats(
  userId: string,
  actionType: string,
  days: number,
): Promise<ShadowExecutionStatRow | null> {
  const { data, error } = await supabase.rpc('get_shadow_execution_stats', {
    p_user_id: userId,
    p_action_type: actionType,
    p_days: days,
  });

  if (error) throw error;

  // RPC returns a set — take the first row (grouped by action_type)
  const rows = data as ShadowExecutionStatRow[] | null;
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

async function fetchAllShadowStats(
  userId: string,
  actionTypes: string[],
  days: number,
): Promise<ShadowExecutionStatRow[]> {
  const results = await Promise.all(
    actionTypes.map((at) => fetchShadowStats(userId, at, days)),
  );
  return results.filter((r): r is ShadowExecutionStatRow => r !== null);
}

async function fetchRecentComparisons(
  userId: string,
  actionType: string,
  limit: number,
): Promise<ShadowComparison[]> {
  const { data, error } = await supabase
    .from('autonomy_shadow_executions')
    .select(
      'id, action_type, actual_tier, shadow_tier, user_decision, edit_distance, would_have_matched, action_snapshot, created_at',
    )
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .not('would_have_matched', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ShadowComparison[];
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch shadow execution stats for a single action type.
 */
export function useShadowExecutionStats(actionType: string, days = 30) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['shadow-execution-stats', user?.id, actionType, days],
    queryFn: () => fetchShadowStats(user!.id, actionType, days),
    enabled: !!user?.id && !!actionType,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch shadow execution stats for multiple action types at once.
 */
export function useShadowExecutionStatsAll(actionTypes: string[], days = 30) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['shadow-execution-stats-all', user?.id, actionTypes, days],
    queryFn: () => fetchAllShadowStats(user!.id, actionTypes, days),
    enabled: !!user?.id && actionTypes.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch the last N shadow comparisons for a given action type.
 * Used by the "See evidence" expandable detail.
 */
export function useShadowComparisons(
  actionType: string,
  limit = 5,
  enabled = true,
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['shadow-comparisons', user?.id, actionType, limit],
    queryFn: () => fetchRecentComparisons(user!.id, actionType, limit),
    enabled: !!user?.id && !!actionType && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

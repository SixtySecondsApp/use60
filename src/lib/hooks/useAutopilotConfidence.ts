/**
 * useAutopilotConfidence — React Query hook for autopilot_confidence data.
 *
 * Used by US-017 (approval progress badge) and US-025 (graduated autonomy UI).
 *
 * Reads from `autopilot_confidence` table:
 *   - total_signals, current_tier, promotion_eligible, pending_promotion_nudge, never_promote
 *
 * Hooks:
 *   useAutopilotConfidence(actionType)      — single action type for badge
 *   useAllAutopilotConfidence()             — all action types for settings
 *   usePromotionNudges()                    — items with pending_promotion_nudge=true
 *   useTriggerAutopilotEvaluate()           — mutation to call autopilot-evaluate edge function
 *   useSnoozePromotionNudge()               — mutation to snooze a nudge for 7 days
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface AutopilotConfidence {
  id: string;
  user_id: string;
  org_id: string;
  action_type: string;
  total_signals: number;
  current_tier: 'disabled' | 'suggest' | 'approve' | 'auto';
  promotion_eligible: boolean;
  pending_promotion_nudge: boolean;
  never_promote: boolean;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Query keys
// ============================================================================

export const AUTOPILOT_KEYS = {
  all: ['autopilot-confidence'] as const,
  byActionType: (userId: string | null, orgId: string | null, actionType: string) =>
    ['autopilot-confidence', userId, orgId, actionType] as const,
  allForUser: (userId: string | null, orgId: string | null) =>
    ['autopilot-confidence', 'all', userId, orgId] as const,
  nudges: (userId: string | null, orgId: string | null) =>
    ['autopilot-confidence', 'nudges', userId, orgId] as const,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch autopilot confidence for a specific action type (for badge on CC items).
 */
export function useAutopilotConfidence(actionType: string | undefined) {
  const { userId } = useAuth();
  const orgId = useActiveOrgId();

  return useQuery<AutopilotConfidence | null>({
    queryKey: AUTOPILOT_KEYS.byActionType(userId, orgId, actionType ?? ''),
    queryFn: async () => {
      if (!userId || !orgId || !actionType) return null;
      const { data, error } = await supabase
        .from('autopilot_confidence')
        .select('id, user_id, org_id, action_type, total_signals, current_tier, promotion_eligible, pending_promotion_nudge, never_promote, snoozed_until, created_at, updated_at')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .eq('action_type', actionType)
        .maybeSingle();
      if (error) {
        console.warn('[useAutopilotConfidence] Query error:', error.message);
        return null;
      }
      return data as AutopilotConfidence | null;
    },
    enabled: !!userId && !!orgId && !!actionType,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch all autopilot confidence rows for the current user (for settings page).
 */
export function useAllAutopilotConfidence() {
  const { userId } = useAuth();
  const orgId = useActiveOrgId();

  return useQuery<AutopilotConfidence[]>({
    queryKey: AUTOPILOT_KEYS.allForUser(userId, orgId),
    queryFn: async () => {
      if (!userId || !orgId) return [];
      const { data, error } = await supabase
        .from('autopilot_confidence')
        .select('id, user_id, org_id, action_type, total_signals, current_tier, promotion_eligible, pending_promotion_nudge, never_promote, snoozed_until, created_at, updated_at')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .order('action_type');
      if (error) {
        console.warn('[useAllAutopilotConfidence] Query error:', error.message);
        return [];
      }
      return (data ?? []) as AutopilotConfidence[];
    },
    enabled: !!userId && !!orgId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch autopilot rows that have pending promotion nudge (for CC inbox banner).
 */
export function usePromotionNudges() {
  const { userId } = useAuth();
  const orgId = useActiveOrgId();

  return useQuery<AutopilotConfidence[]>({
    queryKey: AUTOPILOT_KEYS.nudges(userId, orgId),
    queryFn: async () => {
      if (!userId || !orgId) return [];
      const { data, error } = await supabase
        .from('autopilot_confidence')
        .select('id, user_id, org_id, action_type, total_signals, current_tier, promotion_eligible, pending_promotion_nudge, never_promote, snoozed_until, created_at, updated_at')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .eq('pending_promotion_nudge', true)
        .eq('never_promote', false);
      if (error) {
        console.warn('[usePromotionNudges] Query error:', error.message);
        return [];
      }
      return (data ?? []) as AutopilotConfidence[];
    },
    enabled: !!userId && !!orgId,
    staleTime: 60 * 1000,
  });
}

/**
 * Mutation: call autopilot-evaluate edge function to process a promotion.
 */
export function useTriggerAutopilotEvaluate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ actionType }: { actionType: string }) => {
      const result = await supabase.functions.invoke('autopilot-evaluate', {
        body: { action_type: actionType },
      });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTOPILOT_KEYS.all });
    },
  });
}

/**
 * Mutation: snooze a promotion nudge for 7 days.
 */
export function useSnoozePromotionNudge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ confidenceId }: { confidenceId: string }) => {
      const snoozedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from('autopilot_confidence')
        .update({
          pending_promotion_nudge: false,
          snoozed_until: snoozedUntil,
        })
        .eq('id', confidenceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTOPILOT_KEYS.all });
    },
  });
}

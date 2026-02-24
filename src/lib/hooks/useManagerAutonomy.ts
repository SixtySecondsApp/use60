// src/lib/hooks/useManagerAutonomy.ts
// React Query hooks for manager autonomy controls (PRD-24, GRAD-006)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AutonomyLevel = 'suggest' | 'approve' | 'auto' | 'no_limit';

export interface AutonomyCeiling {
  action_type: string;
  max_ceiling: AutonomyLevel;
  auto_promotion_eligible: boolean;
  updated_at: string;
}

export interface RepAutonomyEntry {
  user_id: string;
  email: string;
  full_name: string | null;
  action_type: string;
  policy: string;
}

export interface TeamAnalyticsRow {
  action_type: string;
  total_actions: number;
  approved: number;
  rejected: number;
  auto_approved: number;
  approval_rate: number;
  promotions: number;
  demotions: number;
}

export interface TeamAnalyticsSummary {
  total_actions: number;
  total_approved: number;
  total_rejected: number;
  total_auto: number;
  approval_rate: number;
  promotions_count: number;
  demotions_count: number;
  window_days: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('agent-config-admin', { body });
  if (error) throw error;
  return data as T;
}

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const MANAGER_AUTONOMY_KEYS = {
  all: ['manager-autonomy'] as const,
  ceilings: (orgId: string) => ['manager-autonomy', 'ceilings', orgId] as const,
  repAutonomy: (orgId: string) => ['manager-autonomy', 'rep-autonomy', orgId] as const,
  teamAnalytics: (orgId: string, windowDays: number) =>
    ['manager-autonomy', 'team-analytics', orgId, windowDays] as const,
};

// ---------------------------------------------------------------------------
// useAutonomyCeilings — fetches ceilings from agent-config-admin
// ---------------------------------------------------------------------------

export function useAutonomyCeilings() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery({
    queryKey: MANAGER_AUTONOMY_KEYS.ceilings(activeOrgId ?? ''),
    queryFn: async () => {
      if (!activeOrgId) return [];
      const result = await invokeAdmin<{ ceilings: AutonomyCeiling[] }>({
        action: 'get_autonomy_ceilings',
        org_id: activeOrgId,
      });
      return result.ceilings;
    },
    enabled: !!activeOrgId,
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// useSetAutonomyCeiling — mutation to update ceiling
// ---------------------------------------------------------------------------

export function useSetAutonomyCeiling() {
  const queryClient = useQueryClient();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useMutation({
    mutationFn: async ({
      actionType,
      maxCeiling,
      autoPromotionEligible,
    }: {
      actionType: string;
      maxCeiling?: AutonomyLevel;
      autoPromotionEligible?: boolean;
    }) => {
      if (!activeOrgId) throw new Error('No active organization');
      return invokeAdmin<{ success: boolean }>({
        action: 'set_autonomy_ceiling',
        org_id: activeOrgId,
        action_type: actionType,
        max_ceiling: maxCeiling,
        auto_promotion_eligible: autoPromotionEligible,
      });
    },
    onSuccess: () => {
      if (activeOrgId) {
        queryClient.invalidateQueries({ queryKey: MANAGER_AUTONOMY_KEYS.ceilings(activeOrgId) });
      }
      toast.success('Autonomy ceiling updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update autonomy ceiling');
    },
  });
}

// ---------------------------------------------------------------------------
// useRepAutonomyLevels — fetches per-rep autonomy data
// ---------------------------------------------------------------------------

export function useRepAutonomyLevels() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery({
    queryKey: MANAGER_AUTONOMY_KEYS.repAutonomy(activeOrgId ?? ''),
    queryFn: async () => {
      if (!activeOrgId) return [];
      const result = await invokeAdmin<{ reps: RepAutonomyEntry[] }>({
        action: 'get_rep_autonomy',
        org_id: activeOrgId,
      });
      return result.reps;
    },
    enabled: !!activeOrgId,
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// useSetRepAutonomyOverride — mutation to override rep's level
// ---------------------------------------------------------------------------

export function useSetRepAutonomyOverride() {
  const queryClient = useQueryClient();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useMutation({
    mutationFn: async ({
      userId,
      actionType,
      policy,
    }: {
      userId: string;
      actionType: string;
      policy: string;
    }) => {
      if (!activeOrgId) throw new Error('No active organization');
      return invokeAdmin<{ success: boolean }>({
        action: 'set_rep_autonomy_override',
        org_id: activeOrgId,
        user_id: userId,
        action_type: actionType,
        policy,
      });
    },
    onSuccess: () => {
      if (activeOrgId) {
        queryClient.invalidateQueries({ queryKey: MANAGER_AUTONOMY_KEYS.repAutonomy(activeOrgId) });
      }
      toast.success('Rep autonomy override saved');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to set rep autonomy override');
    },
  });
}

// ---------------------------------------------------------------------------
// useTeamAutonomyAnalytics — org-level analytics
// ---------------------------------------------------------------------------

export function useTeamAutonomyAnalytics(windowDays: number = 30) {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery({
    queryKey: MANAGER_AUTONOMY_KEYS.teamAnalytics(activeOrgId ?? '', windowDays),
    queryFn: async () => {
      if (!activeOrgId) return null;
      const result = await invokeAdmin<{
        analytics: TeamAnalyticsRow[];
        summary: TeamAnalyticsSummary;
      }>({
        action: 'get_team_autonomy_analytics',
        org_id: activeOrgId,
        window_days: windowDays,
      });
      return result;
    },
    enabled: !!activeOrgId,
    staleTime: 5 * 60 * 1000,
  });
}

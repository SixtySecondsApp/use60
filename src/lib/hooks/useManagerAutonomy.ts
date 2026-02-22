// src/lib/hooks/useManagerAutonomy.ts
// React Query hooks for manager autonomy controls (PRD-24, GRAD-006)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrganization } from '@/lib/hooks/useActiveOrganization';

interface PolicyCeiling {
  id: string;
  action_type: string;
  max_ceiling: 'auto' | 'approve' | 'suggest' | 'disabled';
  auto_promotion_eligible: boolean;
  updated_at: string;
}

interface TeamAutonomyStats {
  total_actions: number;
  total_approved: number;
  total_rejected: number;
  total_auto: number;
  approval_rate: number;
  promotions_count: number;
  demotions_count: number;
  per_user: Array<{
    user_id: string;
    total_actions: number;
    approved: number;
    rejected: number;
    auto_approved: number;
    approval_rate: number;
  }>;
}

interface UserAutonomyOverride {
  user_id: string;
  action_type: string;
  policy: string;
}

export function usePolicyCeilings() {
  const { activeOrganization } = useActiveOrganization();
  const orgId = activeOrganization?.id;

  return useQuery({
    queryKey: ['autonomy-ceilings', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('autonomy_policy_ceilings')
        .select('id, action_type, max_ceiling, auto_promotion_eligible, updated_at')
        .eq('org_id', orgId);
      if (error) throw error;
      return (data || []) as PolicyCeiling[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdatePolicyCeiling() {
  const queryClient = useQueryClient();
  const { activeOrganization } = useActiveOrganization();
  const orgId = activeOrganization?.id;

  return useMutation({
    mutationFn: async ({
      actionType,
      maxCeiling,
      autoPromotionEligible,
    }: {
      actionType: string;
      maxCeiling?: string;
      autoPromotionEligible?: boolean;
    }) => {
      if (!orgId) throw new Error('No active organization');

      const updates: Record<string, unknown> = {
        org_id: orgId,
        action_type: actionType,
      };
      if (maxCeiling !== undefined) updates.max_ceiling = maxCeiling;
      if (autoPromotionEligible !== undefined) updates.auto_promotion_eligible = autoPromotionEligible;

      const { error } = await supabase
        .from('autonomy_policy_ceilings')
        .upsert(updates, { onConflict: 'org_id,action_type' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autonomy-ceilings', orgId] });
    },
  });
}

export function useTeamAutonomyStats(windowDays: number = 30) {
  const { activeOrganization } = useActiveOrganization();
  const orgId = activeOrganization?.id;

  return useQuery({
    queryKey: ['team-autonomy-stats', orgId, windowDays],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase.rpc('get_team_autonomy_stats', {
        p_org_id: orgId,
        p_window_days: windowDays,
      });
      if (error) throw error;
      return data as TeamAutonomyStats;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUserAutonomyOverrides() {
  const { activeOrganization } = useActiveOrganization();
  const orgId = activeOrganization?.id;

  return useQuery({
    queryKey: ['user-autonomy-overrides', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('autonomy_policies')
        .select('user_id, action_type, policy')
        .eq('org_id', orgId)
        .not('user_id', 'is', null);
      if (error) throw error;
      return (data || []) as UserAutonomyOverride[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

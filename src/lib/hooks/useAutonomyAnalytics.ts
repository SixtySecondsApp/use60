// src/lib/hooks/useAutonomyAnalytics.ts
// React Query hook for autonomy analytics and promotion data (PRD-24, GRAD-005)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/lib/services/ServiceLocator';
import { supabase } from '@/lib/supabase';
import { useActiveOrganization } from '@/lib/hooks/useActiveOrganization';

interface ActionAnalytics {
  action_type: string;
  approval_count: number;
  rejection_count: number;
  edit_count: number;
  auto_approved_count: number;
  total_count: number;
  approval_rate: number;
}

interface PromotionSuggestion {
  id: string;
  action_type: string;
  current_policy: string;
  proposed_policy: string;
  evidence: {
    approvalCount: number;
    rejectionCount: number;
    approvalRate: number;
    windowDays: number;
  };
  status: string;
  created_at: string;
}

interface AuditLogEntry {
  id: string;
  action_type: string;
  change_type: string;
  previous_policy: string | null;
  new_policy: string | null;
  trigger_reason: string | null;
  initiated_by: string;
  created_at: string;
}

export function useAutonomyAnalytics(windowDays: number = 30) {
  const { activeOrganization } = useActiveOrganization();
  const orgId = activeOrganization?.id;

  return useQuery({
    queryKey: ['autonomy-analytics', orgId, windowDays],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.rpc('get_autonomy_analytics', {
        p_org_id: orgId,
        p_window_days: windowDays,
      });
      if (error) throw error;
      return (data || []) as ActionAnalytics[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePromotionSuggestions() {
  const { activeOrganization } = useActiveOrganization();
  const orgId = activeOrganization?.id;

  return useQuery({
    queryKey: ['autonomy-promotions', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('autonomy_promotion_queue')
        .select('id, action_type, current_policy, proposed_policy, evidence, status, created_at')
        .eq('org_id', orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as PromotionSuggestion[];
    },
    enabled: !!orgId,
  });
}

export function useAutonomyAuditLog(limit: number = 20) {
  const { activeOrganization } = useActiveOrganization();
  const orgId = activeOrganization?.id;

  return useQuery({
    queryKey: ['autonomy-audit-log', orgId, limit],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('autonomy_audit_log')
        .select('id, action_type, change_type, previous_policy, new_policy, trigger_reason, initiated_by, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as AuditLogEntry[];
    },
    enabled: !!orgId,
  });
}

export function useApprovePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ promotionId, action }: { promotionId: string; action: 'approve' | 'reject' | 'snooze' }) => {
      const statusMap = { approve: 'approved', reject: 'rejected', snooze: 'snoozed' };
      const { error } = await supabase
        .from('autonomy_promotion_queue')
        .update({
          status: statusMap[action],
          resolved_at: new Date().toISOString(),
          ...(action === 'snooze' ? { snoozed_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() } : {}),
        })
        .eq('id', promotionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autonomy-promotions'] });
      queryClient.invalidateQueries({ queryKey: ['autonomy-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['autonomy-audit-log'] });
    },
  });
}

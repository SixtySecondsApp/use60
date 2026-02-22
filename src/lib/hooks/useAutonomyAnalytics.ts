/**
 * useAutonomyAnalytics — React Query hooks for autonomy analytics, audit log,
 * promotion queue, and promotion approval (PRD-24, GRAD-005).
 *
 * Hooks:
 *   useAutonomyAnalytics(windowDays)   — approval rate stats per action type
 *   useAutonomyAuditLog(limit)         — promotion/demotion history
 *   usePromotionSuggestions()          — pending promotions from queue
 *   useApprovePromotion()              — mutation to approve/reject/snooze
 *   useAutonomyPolicies()              — current org-wide policies
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface ActionAnalytics {
  action_type: string;
  window_start?: string;
  window_end?: string;
  approval_count: number;
  rejection_count: number;
  edit_count: number;
  auto_approved_count: number;
  total_count: number;
  approval_rate: number;
}

export interface PromotionSuggestion {
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

export interface AuditLogEntry {
  id: string;
  action_type: string;
  change_type: 'promotion' | 'demotion' | 'manual_change' | 'cooldown_start' | 'cooldown_end' | 'ceiling_set';
  previous_policy: string | null;
  new_policy: string | null;
  trigger_reason: string | null;
  evidence: Record<string, unknown> | null;
  initiated_by: string;
  created_at: string;
}

export interface AutonomyPolicy {
  id: string;
  action_type: string;
  policy: 'auto' | 'approve' | 'suggest' | 'disabled';
  updated_at: string;
}

// ============================================================================
// Query keys
// ============================================================================

export const AUTONOMY_KEYS = {
  all: ['autonomy'] as const,
  analytics: (orgId: string | undefined, windowDays: number) =>
    ['autonomy', 'analytics', orgId, windowDays] as const,
  auditLog: (orgId: string | undefined, limit: number) =>
    ['autonomy', 'audit-log', orgId, limit] as const,
  promotions: (orgId: string | undefined) =>
    ['autonomy', 'promotions', orgId] as const,
  policies: (orgId: string | undefined) =>
    ['autonomy', 'policies', orgId] as const,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetches per-action-type approval analytics for the active organization.
 *
 * @param windowDays - Rolling window in days (7, 30, or 90). Default 30.
 */
export function useAutonomyAnalytics(windowDays: number = 30) {
  const orgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<ActionAnalytics[]>({
    queryKey: AUTONOMY_KEYS.analytics(orgId, windowDays),
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

/**
 * Fetches the promotion/demotion audit trail for the active organization.
 *
 * @param limit - Maximum number of entries to return. Default 20.
 */
export function useAutonomyAuditLog(limit: number = 20) {
  const orgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<AuditLogEntry[]>({
    queryKey: AUTONOMY_KEYS.auditLog(orgId, limit),
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('autonomy_audit_log')
        .select('id, action_type, change_type, previous_policy, new_policy, trigger_reason, evidence, initiated_by, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as AuditLogEntry[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetches pending promotion suggestions from the autonomy_promotion_queue.
 */
export function usePromotionSuggestions() {
  const orgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<PromotionSuggestion[]>({
    queryKey: AUTONOMY_KEYS.promotions(orgId),
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

/**
 * Fetches current org-wide autonomy policies (user_id IS NULL rows).
 */
export function useAutonomyPolicies() {
  const orgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<AutonomyPolicy[]>({
    queryKey: AUTONOMY_KEYS.policies(orgId),
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('autonomy_policies')
        .select('id, action_type, policy, updated_at')
        .eq('org_id', orgId)
        .is('user_id', null);
      if (error) throw error;
      return (data || []) as AutonomyPolicy[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Mutation to approve, reject, or snooze a promotion suggestion.
 * Invalidates analytics, promotions, audit log, and policies queries on success.
 */
export function useApprovePromotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      promotionId,
      action,
    }: {
      promotionId: string;
      action: 'approve' | 'reject' | 'snooze';
    }) => {
      const statusMap: Record<string, string> = {
        approve: 'approved',
        reject: 'rejected',
        snooze: 'snoozed',
      };

      const updates: Record<string, unknown> = {
        status: statusMap[action],
        resolved_at: new Date().toISOString(),
      };

      if (action === 'snooze') {
        updates.snoozed_until = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString();
      }

      const { error } = await supabase
        .from('autonomy_promotion_queue')
        .update(updates)
        .eq('id', promotionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autonomy'] });
    },
  });
}

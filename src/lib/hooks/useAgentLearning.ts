/**
 * useAgentLearning — React Query hooks for Agent Learning section in Command Centre
 *
 * Fetches:
 * 1. Acceptance rate by category (7d / 30d) from autonomy_analytics via get_autonomy_analytics RPC
 * 2. Trust Capital score via get_trust_capital RPC
 * 3. Recent calibration events from crm_approval_queue (last 5 resolved items)
 *
 * @see PST-015
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface AcceptanceRateEntry {
  action_type: string;
  approval_count: number;
  rejection_count: number;
  edit_count: number;
  auto_approved_count: number;
  total_count: number;
  approval_rate: number;
}

export interface TrustCapitalData {
  score: number;
  total_signals: number;
  action_types_trained: number;
  avg_confidence: number;
  days_active: number;
  auto_tier_count: number;
}

export interface CalibrationEvent {
  id: string;
  field_name: string;
  status: string;
  confidence: string;
  created_at: string;
  approved_at: string | null;
}

// ============================================================================
// Cache keys
// ============================================================================

export const AGENT_LEARNING_KEY = 'agent-learning' as const;

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch acceptance rates by category for 7d and 30d windows.
 * Uses the get_autonomy_analytics RPC which reads from the autonomy_analytics table.
 */
export function useAcceptanceRates() {
  const orgId = useActiveOrgId();

  const rates7d = useQuery({
    queryKey: [AGENT_LEARNING_KEY, 'acceptance-rates', orgId, 7],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.rpc('get_autonomy_analytics', {
        p_org_id: orgId,
        p_window_days: 7,
      } as any);
      if (error) throw error;
      return (data ?? []) as AcceptanceRateEntry[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const rates30d = useQuery({
    queryKey: [AGENT_LEARNING_KEY, 'acceptance-rates', orgId, 30],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.rpc('get_autonomy_analytics', {
        p_org_id: orgId,
        p_window_days: 30,
      } as any);
      if (error) throw error;
      return (data ?? []) as AcceptanceRateEntry[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  return { rates7d, rates30d };
}

/**
 * Fetch Trust Capital score via get_trust_capital RPC.
 */
export function useTrustCapital() {
  const { userId } = useAuth();
  const orgId = useActiveOrgId();

  return useQuery({
    queryKey: [AGENT_LEARNING_KEY, 'trust-capital', userId, orgId],
    queryFn: async () => {
      if (!userId || !orgId) return null;
      const { data, error } = await supabase.rpc('get_trust_capital', {
        p_user_id: userId,
        p_org_id: orgId,
      } as any);
      if (error) throw error;
      return (data ?? null) as TrustCapitalData | null;
    },
    enabled: !!userId && !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch last 5 resolved calibration events from crm_approval_queue.
 * These are items that have been approved, rejected, or edited.
 */
export function useCalibrationEvents() {
  const orgId = useActiveOrgId();

  return useQuery({
    queryKey: [AGENT_LEARNING_KEY, 'calibration-events', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('crm_approval_queue')
        .select('id, field_name, status, confidence, created_at, approved_at')
        .eq('org_id', orgId)
        .in('status', ['approved', 'rejected', 'edited'])
        .order('approved_at', { ascending: false, nullsFirst: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as CalibrationEvent[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

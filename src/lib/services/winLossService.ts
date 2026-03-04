/**
 * Win/Loss Service — PRD-117
 *
 * Data sources:
 *   - deal_outcomes table (via Supabase client)
 *   - get_win_loss_analytics RPC
 *   - get_competitive_win_loss RPC
 *   - win-loss-insights edge function (AI pattern generation)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import type {
  DealOutcome,
  LossReasonCode,
  WinLossAnalytics,
  CompetitorMatrixRow,
  WinLossInsight,
  WinLossPeriod,
} from '@/lib/types/winLoss';

// ============================================================================
// Query keys
// ============================================================================

const QK = {
  analytics: (orgId: string, period: WinLossPeriod) =>
    ['win-loss-analytics', orgId, period] as const,
  competitive: (orgId: string, period: WinLossPeriod) =>
    ['win-loss-competitive', orgId, period] as const,
  outcome: (dealId: string) =>
    ['deal-outcome', dealId] as const,
  insights: (orgId: string, period: WinLossPeriod) =>
    ['win-loss-insights', orgId, period] as const,
};

// ============================================================================
// Analytics RPC
// ============================================================================

async function fetchWinLossAnalytics(
  orgId: string,
  period: WinLossPeriod
): Promise<WinLossAnalytics> {
  const { data, error } = await supabase.rpc('get_win_loss_analytics', {
    p_org_id: orgId,
    p_period: period,
  });
  if (error) throw error;
  return data as WinLossAnalytics;
}

export function useWinLossAnalytics(orgId: string, period: WinLossPeriod) {
  return useQuery({
    queryKey: QK.analytics(orgId, period),
    queryFn: () => fetchWinLossAnalytics(orgId, period),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Competitive matrix RPC
// ============================================================================

async function fetchCompetitiveMatrix(
  orgId: string,
  period: WinLossPeriod
): Promise<CompetitorMatrixRow[]> {
  const { data, error } = await supabase.rpc('get_competitive_win_loss', {
    p_org_id: orgId,
    p_period: period,
  });
  if (error) throw error;
  return (data as CompetitorMatrixRow[]) ?? [];
}

export function useCompetitiveMatrix(orgId: string, period: WinLossPeriod) {
  return useQuery({
    queryKey: QK.competitive(orgId, period),
    queryFn: () => fetchCompetitiveMatrix(orgId, period),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Deal outcome (single deal)
// ============================================================================

export function useDealOutcome(dealId: string) {
  return useQuery({
    queryKey: QK.outcome(dealId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_outcomes')
        .select('id, deal_id, outcome, reason_code, competitor_id, notes, recorded_at')
        .eq('deal_id', dealId)
        .maybeSingle();
      if (error) throw error;
      return data as DealOutcome | null;
    },
    enabled: !!dealId,
  });
}

// ============================================================================
// Record deal outcome mutation
// ============================================================================

interface RecordOutcomeInput {
  orgId: string;
  dealId: string;
  outcome: 'won' | 'lost';
  reasonCode?: LossReasonCode | null;
  competitorId?: string | null;
  notes?: string | null;
}

export function useRecordDealOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RecordOutcomeInput) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('deal_outcomes')
        .upsert(
          {
            org_id: input.orgId,
            deal_id: input.dealId,
            outcome: input.outcome,
            reason_code: input.reasonCode ?? null,
            competitor_id: input.competitorId ?? null,
            notes: input.notes ?? null,
            recorded_by: user?.id ?? null,
            recorded_at: new Date().toISOString(),
          },
          { onConflict: 'deal_id' }
        );
      if (error) throw error;
    },
    onSuccess: (_, { dealId, orgId }) => {
      toast.success('Deal outcome recorded');
      queryClient.invalidateQueries({ queryKey: QK.outcome(dealId) });
      // Invalidate all analytics queries for this org
      queryClient.invalidateQueries({ queryKey: ['win-loss-analytics', orgId] });
      queryClient.invalidateQueries({ queryKey: ['win-loss-competitive', orgId] });
      queryClient.invalidateQueries({ queryKey: ['win-loss-insights', orgId] });
    },
    onError: (err: Error) => {
      toast.error(`Failed to record outcome: ${err.message}`);
    },
  });
}

// ============================================================================
// AI pattern insights
// ============================================================================

export function useWinLossInsights(orgId: string, period: WinLossPeriod) {
  return useQuery({
    queryKey: QK.insights(orgId, period),
    queryFn: async (): Promise<WinLossInsight[]> => {
      const { data, error } = await supabase.functions.invoke('win-loss-insights', {
        body: { org_id: orgId, period },
      });
      if (error) throw error;
      return (data as { insights: WinLossInsight[] })?.insights ?? [];
    },
    enabled: !!orgId,
    staleTime: 15 * 60 * 1000,  // 15 min — AI calls are expensive
    retry: false,
  });
}

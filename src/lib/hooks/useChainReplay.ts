/**
 * useChainReplay — TRINITY-018
 *
 * React Query hook that fetches the reasoning chain for a given chain_id
 * from the agent_daily_logs table. Used by CCChainReplay to render a
 * step-by-step timeline of agent decisions.
 *
 * Ordered by wave_number ASC, created_at ASC so the chain reads
 * chronologically from first wave to last.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

export interface ChainStep {
  id: string;
  agent_type: string;
  action_type: string;
  action_detail: Record<string, unknown> | null;
  decision_reasoning: string | null;
  outcome: 'success' | 'failed' | 'pending' | 'cancelled' | 'skipped';
  error_message: string | null;
  credit_cost: number | null;
  execution_ms: number | null;
  wave_number: number | null;
  created_at: string;
}

// ============================================================================
// Constants
// ============================================================================

const CHAIN_STEP_COLUMNS =
  'id, agent_type, action_type, action_detail, decision_reasoning, outcome, error_message, credit_cost, execution_ms, wave_number, created_at';

export const CHAIN_REPLAY_KEY = 'chain-replay' as const;

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetch all agent_daily_logs steps belonging to a single chain_id.
 *
 * @param chainId - The orchestrator chain UUID. Pass null to skip the query.
 * @returns React Query result with ChainStep[] data.
 */
export function useChainReplay(chainId: string | null) {
  return useQuery<ChainStep[]>({
    queryKey: [CHAIN_REPLAY_KEY, chainId],
    queryFn: async () => {
      if (!chainId) return [];

      const { data, error } = await supabase
        .from('agent_daily_logs')
        .select(CHAIN_STEP_COLUMNS)
        .eq('chain_id', chainId)
        .order('wave_number', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Chain replay query failed: ${error.message}`);
      }

      return (data ?? []) as ChainStep[];
    },
    enabled: !!chainId,
    staleTime: 60_000, // chain data is immutable once written
  });
}

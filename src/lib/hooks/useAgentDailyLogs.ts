/**
 * useAgentDailyLogs — React Query hook for agent_daily_logs
 *
 * Fetches paginated agent daily logs filtered by org_id with optional
 * agentType and outcome filters. Supports cursor-based pagination.
 *
 * TRINITY-014
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface AgentDailyLog {
  id: string;
  org_id: string;
  user_id: string;
  agent_type: string;
  action_type: string;
  action_detail: Record<string, unknown> | null;
  decision_reasoning: string | null;
  input_context_summary: string | null;
  outcome: 'success' | 'failed' | 'pending' | 'cancelled' | 'skipped';
  error_message: string | null;
  credit_cost: number | null;
  execution_ms: number | null;
  chain_id: string | null;
  wave_number: number | null;
  created_at: string;
}

export interface AgentDailyLogsFilters {
  agentType?: string;
  outcome?: string;
  cursor?: string; // created_at ISO string for cursor-based pagination
}

// ============================================================================
// Constants
// ============================================================================

const COLUMNS =
  'id, org_id, user_id, agent_type, action_type, action_detail, decision_reasoning, input_context_summary, outcome, error_message, credit_cost, execution_ms, chain_id, wave_number, created_at';

const PAGE_SIZE = 50;

export const AGENT_DAILY_LOGS_KEY = 'agent-daily-logs' as const;

// ============================================================================
// Query hook
// ============================================================================

/**
 * Fetch agent_daily_logs for the active organization.
 *
 * - Filtered by `org_id` (from useOrgStore)
 * - Optional `agentType` filter
 * - Optional `outcome` filter
 * - Cursor-based pagination via `cursor` (created_at of last row)
 * - Ordered by `created_at DESC`, limit 50 per page
 */
export function useAgentDailyLogs(filters: AgentDailyLogsFilters = {}) {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<AgentDailyLog[]>({
    queryKey: [AGENT_DAILY_LOGS_KEY, activeOrgId, filters.agentType, filters.outcome, filters.cursor],
    queryFn: async () => {
      if (!activeOrgId) return [];

      let query = supabase
        .from('agent_daily_logs')
        .select(COLUMNS)
        .eq('org_id', activeOrgId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (filters.agentType) {
        query = query.eq('agent_type', filters.agentType);
      }

      if (filters.outcome) {
        query = query.eq('outcome', filters.outcome);
      }

      if (filters.cursor) {
        query = query.lt('created_at', filters.cursor);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data ?? []) as AgentDailyLog[];
    },
    enabled: !!activeOrgId,
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

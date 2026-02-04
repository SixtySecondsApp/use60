/**
 * useExecutionHistory Hook
 *
 * React Query hooks for fetching execution history data.
 * Used by Copilot Lab History tab and per-skill/sequence History tabs.
 */

import { useQuery } from '@tanstack/react-query';
import {
  getExecutionHistory,
  getExecutionDetail,
} from '@/lib/services/executionHistoryService';
import type { ExecutionHistoryFilters } from '@/lib/types/executionHistory';

// ============================================================================
// Query Keys
// ============================================================================

const QUERY_KEYS = {
  all: ['execution-history'] as const,
  list: (orgId: string, filters: ExecutionHistoryFilters) =>
    ['execution-history', 'list', orgId, filters] as const,
  detail: (executionId: string) =>
    ['execution-history', 'detail', executionId] as const,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch execution history list with filters
 */
export function useExecutionHistory(
  orgId: string | undefined,
  filters: ExecutionHistoryFilters = {},
  enabled = true
) {
  return useQuery({
    queryKey: QUERY_KEYS.list(orgId || '', filters),
    queryFn: async () => {
      if (!orgId) throw new Error('Organization ID required');
      const result = await getExecutionHistory(orgId, filters);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch execution history');
      }
      return result.data!;
    },
    enabled: enabled && !!orgId,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Fetch single execution with full detail (tool calls + structured response)
 */
export function useExecutionDetail(
  executionId: string | null,
  enabled = true
) {
  return useQuery({
    queryKey: QUERY_KEYS.detail(executionId || ''),
    queryFn: async () => {
      if (!executionId) throw new Error('Execution ID required');
      const result = await getExecutionDetail(executionId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch execution detail');
      }
      return result.data!;
    },
    enabled: enabled && !!executionId,
    staleTime: 60_000, // 1 minute — execution data doesn't change
  });
}

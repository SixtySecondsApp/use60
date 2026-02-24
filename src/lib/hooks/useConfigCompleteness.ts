/**
 * useConfigCompleteness - React Query hook for organization configuration completeness
 *
 * Calls the `get_config_completeness` RPC to get a breakdown of how completely
 * the organization has been configured, grouped by category, with tier scoring.
 *
 * Usage:
 * ```ts
 * const { data, isLoading, error } = useConfigCompleteness(orgId, userId);
 * ```
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

export type ConfigTier = 'functional' | 'tuned' | 'optimised' | 'learning';

export interface ConfigCategoryBreakdown {
  total: number;
  answered: number;
  percentage: number;
}

export interface ConfigCompleteness {
  tier: ConfigTier;
  percentage: number;
  total_questions: number;
  answered_questions: number;
  auto_detected_configs: number;
  categories: Record<string, ConfigCategoryBreakdown>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetches the configuration completeness for an organization.
 *
 * @param orgId   - The active organization ID (required, query is disabled without it)
 * @param userId  - The current user ID (optional, passed as p_user_id to the RPC)
 */
export function useConfigCompleteness(
  orgId: string | undefined,
  userId: string | undefined
) {
  return useQuery<ConfigCompleteness>({
    queryKey: ['config-completeness', orgId, userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_config_completeness', {
        p_org_id: orgId,
        p_user_id: userId ?? null,
      });

      if (error) throw error;
      return data as ConfigCompleteness;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

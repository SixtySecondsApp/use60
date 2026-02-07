/**
 * useICPProfiles Hook
 *
 * Fetches AI-generated ICP profiles from the generate-icp-profiles edge function.
 * Profiles are cached server-side (24h) and client-side via React Query (5min).
 * Returns profile cards that pre-fill the Apollo search wizard.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, getSupabaseAuthToken } from '@/lib/supabase/clientV2';
import { useOrgId } from '@/lib/contexts/OrgContext';
import type { ApolloSearchParams } from '@/lib/services/apolloSearchService';

// ============================================================================
// Types
// ============================================================================

export interface ICPProfile {
  id: string;
  name: string;
  description: string;
  emoji: string;
  filters: ApolloSearchParams;
  filter_count: number;
  rationale: string;
}

interface ICPProfilesResponse {
  profiles: ICPProfile[];
  cached: boolean;
  reason?: string;
}

// ============================================================================
// Query Key
// ============================================================================

const icpProfilesKey = (orgId: string | null) => ['icp-profiles', orgId] as const;

// ============================================================================
// Hook
// ============================================================================

export function useICPProfiles() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: icpProfilesKey(orgId),
    queryFn: async (): Promise<ICPProfile[]> => {
      // Explicitly get auth token to avoid race condition on mount
      const token = await getSupabaseAuthToken();
      if (!token) {
        // Session not ready yet — React Query will retry
        throw new Error('Auth session not ready');
      }

      const { data, error } = await supabase.functions.invoke('generate-icp-profiles', {
        body: {},
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) {
        console.error('[useICPProfiles] Edge function error:', error);
        return [];
      }

      const response = data as ICPProfilesResponse;
      return response?.profiles || [];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
    retryDelay: 1000,
  });

  const regenerate = async () => {
    const token = await getSupabaseAuthToken();
    await supabase.functions.invoke('generate-icp-profiles', {
      body: { force_regenerate: true },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    queryClient.invalidateQueries({ queryKey: icpProfilesKey(orgId) });
  };

  return {
    profiles: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    regenerate,
  };
}

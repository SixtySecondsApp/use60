import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import type { GraphContact, ContactSource } from '../types';

const SOURCE_TO_RPC: Record<string, string> = {
  app: 'app',
  hubspot: 'hubspot',
  attio: 'attio',
};

export function useGraphData(activeSources: Set<ContactSource> = new Set(['app'])) {
  const { user } = useAuth();
  const activeOrgId = useOrgStore((state) => state.activeOrgId);

  const sourcesKey = Array.from(activeSources).sort().join(',');

  const query = useQuery({
    queryKey: ['graph-data', user?.id, activeOrgId, sourcesKey],
    queryFn: async (): Promise<GraphContact[]> => {
      if (!user?.id || !activeOrgId) return [];

      const rpcSources = Array.from(activeSources)
        .map((s) => SOURCE_TO_RPC[s] ?? s)
        .filter(Boolean);

      const { data, error } = await supabase.rpc('get_contact_graph_data', {
        p_user_id: user.id,
        p_org_id: activeOrgId,
        p_sources: rpcSources,
      });

      if (error) throw error;

      // RPC returns JSONB which is already parsed
      return (data as GraphContact[]) ?? [];
    },
    enabled: !!user?.id && !!activeOrgId,
    staleTime: 30000,
    gcTime: 60000,
    refetchOnWindowFocus: false,
  });

  const hasWarmthData = useMemo(
    () => (query.data ?? []).some((c) => c.warmth_score !== null),
    [query.data],
  );

  return { ...query, hasWarmthData };
}

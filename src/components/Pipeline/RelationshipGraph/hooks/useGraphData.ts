import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import type { GraphContact } from '../types';

export function useGraphData() {
  const { user } = useAuth();
  const activeOrgId = useOrgStore((state) => state.activeOrgId);

  const query = useQuery({
    queryKey: ['graph-data', user?.id, activeOrgId],
    queryFn: async (): Promise<GraphContact[]> => {
      if (!user?.id || !activeOrgId) return [];

      const { data, error } = await supabase.rpc('get_contact_graph_data', {
        p_user_id: user.id,
        p_org_id: activeOrgId,
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

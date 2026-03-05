import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

interface BackfillResult {
  total_signals: number;
  contacts_affected: number;
  sources: {
    activities: number;
    meetings: number;
    deal_stages: number;
  };
  recalculate: { processed: number; updated: number };
}

export function useWarmthBackfill() {
  const activeOrgId = useOrgStore((state) => state.activeOrgId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<BackfillResult> => {
      if (!activeOrgId) throw new Error('No active org');

      const { data, error } = await supabase.functions.invoke('backfill-runner/warmth', {
        body: { org_id: activeOrgId },
      });

      if (error) throw error;
      return data as BackfillResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graph-data'] });
    },
  });
}

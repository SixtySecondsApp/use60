import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export function useHubSpotSync(tableId: string | undefined) {
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!tableId) throw new Error('No table ID');
      const { data, error } = await supabase.functions.invoke('sync-hubspot-ops-table', {
        body: { table_id: tableId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { new_rows: number; updated_rows: number; last_synced_at: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      toast.success(`Synced: ${data.new_rows} new, ${data.updated_rows} updated`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to sync from HubSpot');
    },
  });

  return {
    sync: () => syncMutation.mutate(),
    isSyncing: syncMutation.isPending,
  };
}

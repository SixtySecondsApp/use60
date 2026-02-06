import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export function useHubSpotSync(tableId: string | undefined) {
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!tableId) throw new Error('No table ID');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('sync-hubspot-ops-table', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ table_id: tableId }),
      });

      if (resp.error) throw new Error(resp.error.message || 'Failed to sync');
      if (resp.data?.error) throw new Error(resp.data.error);
      return resp.data as {
        new_rows: number;
        updated_rows: number;
        removed_rows?: number;
        returned_rows?: number;
        last_synced_at: string;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });

      const parts = [`${data.new_rows} new`, `${data.updated_rows} updated`];
      if (data.removed_rows) parts.push(`${data.removed_rows} removed`);
      if (data.returned_rows) parts.push(`${data.returned_rows} returned`);
      toast.success(`Synced: ${parts.join(', ')}`);
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

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { getSupabaseAuthToken } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export function useHubSpotSync(tableId: string | undefined) {
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!tableId) throw new Error('No table ID');

      // Use direct fetch to ensure body is sent correctly
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const token = await getSupabaseAuthToken();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/sync-hubspot-ops-table`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ table_id: tableId }),
      });

      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
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

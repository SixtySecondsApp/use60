import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/clientV2'
import { toast } from 'sonner'
import type { InstantlySyncResult } from '@/lib/types/instantly'

interface SyncParams {
  table_id: string
  campaign_id: string
}

export function useInstantlySync(tableId: string | undefined) {
  const queryClient = useQueryClient()

  const syncMutation = useMutation({
    mutationFn: async (params: SyncParams) => {
      const { data, error } = await supabase.functions.invoke('sync-instantly-engagement', {
        body: params,
      })

      if (error) throw new Error(error.message || 'Failed to sync from Instantly')
      if (data?.error) throw new Error(data.error)

      return data as InstantlySyncResult
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] })
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] })
      queryClient.invalidateQueries({ queryKey: ['instantly-sync-history', tableId] })

      const parts = [`${data.matched_leads} matched`]
      if (data.columns_created > 0) parts.push(`${data.columns_created} columns added`)
      if (data.unmatched_leads > 0) parts.push(`${data.unmatched_leads} unmatched`)
      toast.success(`Synced engagement: ${parts.join(', ')}`)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to sync engagement from Instantly')
    },
  })

  return {
    sync: (params: SyncParams) => syncMutation.mutate(params),
    isSyncing: syncMutation.isPending,
  }
}

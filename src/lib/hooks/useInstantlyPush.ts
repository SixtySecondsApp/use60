import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/clientV2'
import { toast } from 'sonner'
import type { InstantlyPushResult } from '@/lib/types/instantly'

interface PushParams {
  table_id: string
  campaign_id: string
  row_ids?: string[]
  field_mapping?: Record<string, any>
}

export function useInstantlyPush(tableId: string | undefined) {
  const queryClient = useQueryClient()

  const pushMutation = useMutation({
    mutationFn: async (params: PushParams) => {
      const { data, error } = await supabase.functions.invoke('push-to-instantly', {
        body: params,
      })

      if (error) throw new Error(error.message || 'Failed to push to Instantly')
      if (data?.error) throw new Error(data.error)

      return data as InstantlyPushResult
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] })
      queryClient.invalidateQueries({ queryKey: ['instantly-sync-history', tableId] })
      queryClient.invalidateQueries({ queryKey: ['instantly-campaign-links', tableId] })

      const parts = [`${data.pushed_count} pushed`]
      if (data.skipped_count > 0) parts.push(`${data.skipped_count} skipped`)
      if (data.error_count > 0) parts.push(`${data.error_count} errors`)
      toast.success(`Instantly: ${parts.join(', ')}`)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to push leads to Instantly')
    },
  })

  return {
    push: (params: PushParams) => pushMutation.mutate(params),
    isPushing: pushMutation.isPending,
  }
}

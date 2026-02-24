import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, getSupabaseAuthToken } from '@/lib/supabase/clientV2'
import { toast } from 'sonner'
import type { InstantlyPushResult } from '@/lib/types/instantly'

/**
 * Validate that an Instantly campaign still exists and is accessible.
 * Returns { valid: true, campaign } or { valid: false, error }.
 */
export async function validateInstantlyCampaign(
  orgId: string,
  campaignId: string
): Promise<{ valid: true; campaign: any } | { valid: false; error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('instantly-admin', {
      body: { action: 'get_campaign', org_id: orgId, campaign_id: campaignId, _auth_token: await getSupabaseAuthToken() },
    })
    if (error || !data?.success) {
      return { valid: false, error: data?.error || error?.message || 'Campaign not found' }
    }
    return { valid: true, campaign: data.campaign }
  } catch (err: any) {
    return { valid: false, error: err.message || 'Failed to validate campaign' }
  }
}

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
        body: { ...params, _auth_token: await getSupabaseAuthToken() },
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

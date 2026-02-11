/**
 * useProspectingSearch — React Query mutation for the prospecting-search edge function.
 *
 * Calls supabase.functions.invoke('prospecting-search') which auto-injects auth via clientV2.
 * Tracks session search history and caches last results for comparison.
 */

import { useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/clientV2'
import { creditKeys } from '@/lib/hooks/useCreditBalance'
import { useOrgId } from '@/lib/contexts/OrgContext'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProspectingProvider = 'apollo' | 'ai_ark'
export type ProspectingAction = 'people_search' | 'company_search'

export interface ProspectingSearchParams {
  icp_profile_id?: string
  provider: ProspectingProvider
  action?: ProspectingAction
  search_params: Record<string, unknown>
  page?: number
  per_page?: number
}

export interface ProspectingSearchResult {
  results: Record<string, unknown>[]
  total_results: number
  credits_consumed: number
  page: number
  per_page: number
  has_more: boolean
  provider: ProspectingProvider
  action?: ProspectingAction
  duration_ms: number
  icp_profile_id: string | null
}

export interface ProspectingSearchHistoryEntry {
  params: ProspectingSearchParams
  result: ProspectingSearchResult
  timestamp: number
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProspectingSearch() {
  const queryClient = useQueryClient()
  const orgId = useOrgId()
  const sessionHistory = useRef<ProspectingSearchHistoryEntry[]>([])
  const lastResult = useRef<ProspectingSearchResult | null>(null)

  const mutation = useMutation<ProspectingSearchResult, Error, ProspectingSearchParams>({
    mutationFn: async (params) => {
      const { data, error } = await supabase.functions.invoke('prospecting-search', {
        body: params,
      })

      if (error) {
        throw new Error(error.message || 'Search request failed')
      }

      // Edge function returns error in body with HTTP error codes
      if (data?.error) {
        const err = new Error(data.message || data.error) as Error & { code?: string; balance?: number; estimated_cost?: number }
        err.code = data.code
        if (data.balance != null) (err as any).balance = data.balance
        if (data.estimated_cost != null) (err as any).estimated_cost = data.estimated_cost
        throw err
      }

      return data as ProspectingSearchResult
    },

    onSuccess: (result, params) => {
      // Cache last result for comparison
      lastResult.current = result

      // Add to session history
      sessionHistory.current.push({
        params,
        result,
        timestamp: Date.now(),
      })

      // Invalidate credit balance (it was deducted)
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: creditKeys.balance(orgId) })
      }

      // Invalidate search history queries
      queryClient.invalidateQueries({ queryKey: ['icp-search-history'] })
    },

    onError: (error: Error & { code?: string }) => {
      switch (error.code) {
        case 'UNAUTHORIZED':
          toast.error('Please sign in to search.')
          break
        case 'NO_ORG':
          toast.error('No organization found. Please join or create an organization.')
          break
        case 'INSUFFICIENT_CREDITS':
          toast.error('Insufficient credits. Please top up to continue searching.')
          break
        case 'PROVIDER_NOT_CONFIGURED':
          toast.error(error.message || 'Search provider not configured. Check Settings > Integrations.')
          break
        case 'RATE_LIMITED':
          toast.error('Rate limit exceeded. Please wait a moment and try again.')
          break
        case 'INVALID_PARAMS':
          toast.error(error.message || 'Invalid search parameters.')
          break
        default:
          toast.error(error.message || 'Search failed. Please try again.')
      }
    },
  })

  const getSessionHistory = useCallback(() => sessionHistory.current, [])
  const getLastResult = useCallback(() => lastResult.current, [])

  return {
    search: mutation.mutate,
    searchAsync: mutation.mutateAsync,
    isSearching: mutation.isPending,
    results: mutation.data ?? null,
    error: mutation.error,
    reset: mutation.reset,
    getSessionHistory,
    getLastResult,
  }
}

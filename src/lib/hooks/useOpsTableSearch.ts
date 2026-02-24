/**
 * useOpsTableSearch Hook
 *
 * React Query mutations for Apollo search and Ops creation.
 * Wraps apolloSearchService with toast notifications, cache invalidation,
 * and optional navigation to the newly created table.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import {
  apolloSearchService,
  type CreateTableFromSearchParams,
  type ApolloSearchParams,
  type OpsTableResult,
  type ApolloSearchResult,
} from '@/lib/services/apolloSearchService'
import { supabase, getSupabaseAuthToken } from '@/lib/supabase/clientV2'

interface UseOpsTableSearchOptions {
  /** When true, navigate to the new table on successful creation. Defaults to true. */
  navigateOnSuccess?: boolean
}

export function useOpsTableSearch(options: UseOpsTableSearchOptions = {}) {
  const { navigateOnSuccess = true } = options
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // ------------------------------------------------------------------
  // Mutation: Search Apollo and create a Ops
  // ------------------------------------------------------------------
  const createTableFromSearch = useMutation<OpsTableResult, Error, CreateTableFromSearchParams>({
    mutationFn: (params) => apolloSearchService.searchAndCreateTable(params),

    onSuccess: (result) => {
      // Invalidate the ops tables list so the sidebar / list page refreshes
      queryClient.invalidateQueries({ queryKey: ['ops-tables'] })

      const enriched = result.enriched_count || 0
      const enrichMsg = enriched > 0 ? `, ${enriched} enriched` : ''
      const dedupMsg = result.dedup?.duplicates
        ? `, ${result.dedup.duplicates} duplicates filtered`
        : ''
      toast.success(`${result.row_count} leads imported${enrichMsg}${dedupMsg}`)

      if (navigateOnSuccess) {
        navigate(`/ops/${result.table_id}`)
      }
    },

    onError: (error: Error & { code?: string; dedup?: { total: number; duplicates: number; net_new: number } }) => {
      const code = error.code

      switch (code) {
        case 'APOLLO_NOT_CONFIGURED':
          toast.error('Apollo is not configured. Add your API key in Settings > Integrations.')
          break
        case 'RATE_LIMITED':
          toast.error('Apollo rate limit reached. Please wait a moment and try again.')
          break
        case 'DUPLICATE_TABLE_NAME':
          toast.error(error.message || 'A table with that name already exists.')
          break
        case 'NO_RESULTS':
          toast.warning('No results matched your search criteria. Try broadening your filters.')
          break
        case 'ALL_DUPLICATES': {
          const count = error.dedup?.total ?? 0
          toast.warning(
            count > 0
              ? `Found ${count} contacts but all are already in your CRM or Ops tables. Try different filters or search LinkedIn directly.`
              : 'All contacts found are already in your CRM or previously imported.'
          )
          break
        }
        default:
          toast.error(error.message || 'Failed to create table from search')
      }
    },
  })

  // ------------------------------------------------------------------
  // Mutation: Standalone Apollo search (no table creation)
  // ------------------------------------------------------------------
  const searchApollo = useMutation<ApolloSearchResult, Error, ApolloSearchParams>({
    mutationFn: (params) => apolloSearchService.searchApollo(params),

    onError: (error: Error & { code?: string }) => {
      const code = error.code

      if (code === 'APOLLO_NOT_CONFIGURED') {
        toast.error('Apollo is not configured. Add your API key in Settings > Integrations.')
      } else if (code === 'RATE_LIMITED') {
        toast.error('Apollo rate limit reached. Please wait a moment and try again.')
      } else {
        toast.error(error.message || 'Apollo search failed')
      }
    },
  })

  return {
    createTableFromSearch,
    searchApollo,
    isCreating: createTableFromSearch.isPending,
    isSearching: searchApollo.isPending,
  }
}

// ---------------------------------------------------------------------------
// Apollo credit / usage info
// ---------------------------------------------------------------------------

export interface ApolloCreditsData {
  source: 'usage_stats' | 'rate_headers'
  // From usage_stats (master key)
  email_credits_used?: number
  email_credits_limit?: number
  email_credits_remaining?: number
  phone_credits_used?: number
  phone_credits_limit?: number
  phone_credits_remaining?: number
  // From rate headers (fallback)
  rate_limits?: Record<string, string | null>
  usage_stats_status?: number
  usage_stats_message?: string
  // Raw — pass through whatever Apollo returns
  [key: string]: unknown
}

async function fetchApolloCredits(): Promise<ApolloCreditsData> {
  const { data, error } = await supabase.functions.invoke('apollo-credits', {
    body: {},
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as ApolloCreditsData
}

export function useApolloCredits(enabled = true) {
  return useQuery({
    queryKey: ['apollo-credits'],
    queryFn: fetchApolloCredits,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,
  })
}

// ---------------------------------------------------------------------------
// NL → Apollo search params parser
// ---------------------------------------------------------------------------

export interface ParsedApolloQuery {
  params: Partial<ApolloSearchParams>
  summary: string
  enrichment?: {
    email?: boolean
    phone?: boolean
  }
  suggested_table_name?: string
}

export function useParseApolloQuery() {
  return useMutation<ParsedApolloQuery, Error, string>({
    mutationFn: async (query: string) => {
      const token = await getSupabaseAuthToken()
      const { data, error } = await supabase.functions.invoke('parse-apollo-query', {
        body: { query },
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      })

      if (error) throw new Error(error.message || 'Failed to parse query')
      if (data?.error) throw new Error(data.error)
      return data as ParsedApolloQuery
    },
  })
}

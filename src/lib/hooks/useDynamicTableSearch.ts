/**
 * useDynamicTableSearch Hook
 *
 * React Query mutations for Apollo search and Dynamic Table creation.
 * Wraps apolloSearchService with toast notifications, cache invalidation,
 * and optional navigation to the newly created table.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import {
  apolloSearchService,
  type CreateTableFromSearchParams,
  type ApolloSearchParams,
  type DynamicTableResult,
  type ApolloSearchResult,
} from '@/lib/services/apolloSearchService'

interface UseDynamicTableSearchOptions {
  /** When true, navigate to the new table on successful creation. Defaults to true. */
  navigateOnSuccess?: boolean
}

export function useDynamicTableSearch(options: UseDynamicTableSearchOptions = {}) {
  const { navigateOnSuccess = true } = options
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // ------------------------------------------------------------------
  // Mutation: Search Apollo and create a Dynamic Table
  // ------------------------------------------------------------------
  const createTableFromSearch = useMutation<DynamicTableResult, Error, CreateTableFromSearchParams>({
    mutationFn: (params) => apolloSearchService.searchAndCreateTable(params),

    onSuccess: (result) => {
      // Invalidate the dynamic tables list so the sidebar / list page refreshes
      queryClient.invalidateQueries({ queryKey: ['dynamic-tables'] })

      toast.success(`Table "${result.table_name}" created with ${result.row_count} leads`)

      if (navigateOnSuccess) {
        navigate(`/dynamic-tables/${result.table_id}`)
      }
    },

    onError: (error: Error & { code?: string }) => {
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
          toast.warning('No results found. Try broadening your search criteria.')
          break
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

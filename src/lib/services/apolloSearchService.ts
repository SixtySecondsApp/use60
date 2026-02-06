/**
 * Apollo Search Service
 *
 * Wraps the Apollo search and Ops creation flow.
 * Calls the copilot-dynamic-table edge function to search Apollo
 * and persist results as a Ops, or calls `apollo-search`
 * directly for standalone searches without table creation.
 */

import { supabase } from '@/lib/supabase/clientV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApolloSearchParams {
  person_titles?: string[]
  person_locations?: string[]
  organization_num_employees_ranges?: string[]
  organization_latest_funding_stage_cd?: string[]
  q_keywords?: string
  q_organization_keyword_tags?: string[]
  per_page?: number
  page?: number
}

export interface CreateTableFromSearchParams {
  query_description: string
  search_params: ApolloSearchParams
  table_name?: string
}

export interface OpsTableResult {
  table_id: string
  table_name: string
  row_count: number
  column_count: number
  source_type: string
  enriched_count: number
  preview_rows: Array<Record<string, string>>
  preview_columns: string[]
  query_description: string
}

export interface NormalizedContact {
  apollo_id: string
  first_name: string
  last_name: string
  full_name: string
  title: string
  company: string
  company_domain: string
  employees: number | null
  funding_stage: string | null
  email: string | null
  email_status: string | null
  linkedin_url: string | null
  phone: string | null
  city: string | null
  state: string | null
  country: string | null
}

export interface ApolloSearchResult {
  contacts: NormalizedContact[]
  pagination: {
    page: number
    per_page: number
    total: number
    has_more: boolean
  }
  query: Partial<ApolloSearchParams>
}

export interface ApolloSearchError {
  error: string
  code?: 'APOLLO_NOT_CONFIGURED' | 'RATE_LIMITED' | 'DUPLICATE_TABLE_NAME' | 'NO_RESULTS' | string
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const apolloSearchService = {
  /**
   * Search Apollo and persist results as a new Ops.
   *
   * Calls the copilot-dynamic-table edge function which internally
   * calls `apollo-search`, then creates the table + columns + rows + cells.
   */
  async searchAndCreateTable(
    params: CreateTableFromSearchParams
  ): Promise<OpsTableResult> {
    const { data, error } = await supabase.functions.invoke('copilot-dynamic-table', {
      body: {
        query_description: params.query_description,
        search_params: params.search_params,
        table_name: params.table_name,
      },
    })

    if (error) {
      throw new Error(error.message || 'Failed to create ops table from search')
    }

    // The edge function returns error payloads in the data body for
    // non-200 responses that supabase-js still resolves (e.g. 200 with NO_RESULTS).
    if (data?.error) {
      const err = new Error(data.error) as Error & { code?: string }
      err.code = data.code
      throw err
    }

    return data as OpsTableResult
  },

  /**
   * Standalone Apollo people search (no table creation).
   *
   * Calls the `apollo-search` edge function directly and returns
   * normalized contacts with pagination metadata.
   */
  async searchApollo(params: ApolloSearchParams): Promise<ApolloSearchResult> {
    const { data, error } = await supabase.functions.invoke('apollo-search', {
      body: params,
    })

    if (error) {
      throw new Error(error.message || 'Apollo search failed')
    }

    if (data?.error) {
      const err = new Error(data.error) as Error & { code?: string }
      err.code = data.code
      throw err
    }

    return data as ApolloSearchResult
  },
}

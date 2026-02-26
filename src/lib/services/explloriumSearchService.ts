/**
 * Explorium Search Service
 *
 * Wraps the Explorium search and Ops creation flow.
 * Calls the copilot-dynamic-table edge function to search Explorium
 * and persist results as an Ops, or calls `explorium-search`
 * directly for standalone searches without table creation.
 */

import { supabase, getSupabaseAuthToken } from '@/lib/supabase/clientV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExplloriumBusinessFilters {
  industries?: string[]
  employee_ranges?: string[]      // '1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'
  revenue_ranges?: string[]
  countries?: string[]            // ISO alpha-2
  technologies?: string[]
  intent_topics?: string[]
  is_public?: boolean
  domains?: string[]
  company_names?: string[]
}

export interface ExplloriumProspectFilters {
  job_title?: string
  include_related_titles?: boolean
  seniorities?: string[]          // 'manager', 'director', 'vp', 'c_suite', 'partner', 'owner', 'founder'
  departments?: string[]
  has_email?: boolean
  business_ids?: string[]
  employee_ranges?: string[]
  prospect_countries?: string[]
}

export interface ExplloriumSearchParams {
  action: 'business_search' | 'prospect_search' | 'stats'
  filters?: ExplloriumBusinessFilters | ExplloriumProspectFilters
  page?: number
  per_page?: number
  exclude_ids?: string[]
  preview_mode?: boolean
}

export interface ExplloriumStatsParams {
  action: 'business_search' | 'prospect_search'  // which entity to count
  filters?: ExplloriumBusinessFilters | ExplloriumProspectFilters
}

export interface NormalizedExploriumBusiness {
  explorium_id: string
  company_name: string
  domain: string | null
  industry: string | null
  employee_range: string | null
  revenue_range: string | null
  country: string | null
  city: string | null
  description: string | null
  logo_url: string | null
  linkedin_url: string | null
  website: string | null
  is_public: boolean | null
}

export interface NormalizedExploriumProspect {
  explorium_id: string
  first_name: string
  last_name: string
  full_name: string
  title: string
  job_level: string | null
  department: string | null
  linkedin_url: string | null
  country: string | null
  city: string | null
  company_name: string | null
  company_domain: string | null
  business_id: string | null
}

export interface ExplloriumSearchResult {
  results: NormalizedExploriumBusiness[] | NormalizedExploriumProspect[]
  pagination: {
    page: number
    per_page: number
    total: number
    total_pages: number
    has_more: boolean
    returned: number
  }
  total_count: number
  credits_consumed: number
  action: string
}

export interface CreateTableFromExploriumParams {
  query_description: string
  search_type: 'business_search' | 'prospect_search'
  filters: ExplloriumBusinessFilters | ExplloriumProspectFilters
  table_name?: string
  exclude_crm?: boolean   // default true — load CRM exclusions
  per_page?: number
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
  dedup?: { total: number; duplicates: number; net_new: number }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const explloriumSearchService = {
  /**
   * Search Explorium and persist results as a new Ops.
   *
   * Calls the copilot-dynamic-table edge function which internally
   * calls `explorium-search`, then creates the table + columns + rows + cells.
   */
  async searchAndCreateTable(
    params: CreateTableFromExploriumParams
  ): Promise<OpsTableResult> {
    const token = await getSupabaseAuthToken()
    const { data, error } = await supabase.functions.invoke('copilot-dynamic-table', {
      body: {
        source: 'explorium',
        query_description: params.query_description,
        search_type: params.search_type,
        filters: params.filters,
        ...(params.table_name ? { table_name: params.table_name } : {}),
        ...(params.exclude_crm !== undefined ? { exclude_crm: params.exclude_crm } : {}),
        ...(params.per_page !== undefined ? { per_page: params.per_page } : {}),
      },
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    })

    if (error) {
      throw new Error(error.message || 'Failed to create ops table from Explorium search')
    }

    // The edge function returns error payloads in the data body for
    // non-200 responses that supabase-js still resolves (e.g. 200 with NO_RESULTS).
    if (data?.error) {
      const err = new Error(data.error) as Error & { code?: string; dedup?: { total: number; duplicates: number; net_new: number } }
      err.code = data.code
      if (data.dedup) err.dedup = data.dedup
      throw err
    }

    return data as OpsTableResult
  },

  /**
   * Standalone Explorium search (no table creation).
   *
   * Calls the `explorium-search` edge function directly using raw fetch
   * with `_auth_token` in the body for browser extension compatibility
   * (some extensions convert POST to GET, stripping headers and body).
   */
  async searchExplorium(params: ExplloriumSearchParams): Promise<ExplloriumSearchResult> {
    const token = await getSupabaseAuthToken()
    if (!token) throw new Error('Not authenticated')

    // Use raw fetch to bypass supabase-js middleware and detect redirects
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY
    const url = `${supabaseUrl}/functions/v1/explorium-search`

    console.log('[explloriumSearchService] POST to:', url)

    // The explorium-search edge function expects filter fields at the top level
    // (e.g. industries, employee_ranges), not nested under a `filters` key.
    const { filters, ...restParams } = params
    const flatBody = { ...restParams, ...filters, _auth_token: token }

    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',  // Detect redirects instead of following them
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify(flatBody),
    })

    console.log('[explloriumSearchService] Response:', response.status, response.redirected ? 'REDIRECTED' : 'direct')

    const data = await response.json()

    if (!response.ok || data?.error) {
      console.error('[explloriumSearchService] Error response:', data)
      const err = new Error(data.error || `HTTP ${response.status}`) as Error & { code?: string }
      err.code = data.code
      throw err
    }

    return data as ExplloriumSearchResult
  },

  /**
   * Pre-flight stats check (0 credits).
   *
   * Returns the total_count for a given set of filters without consuming
   * search credits. Use before launching a full search to validate result size.
   */
  async getStats(params: ExplloriumStatsParams): Promise<{ total_count: number }> {
    const token = await getSupabaseAuthToken()
    // The explorium-search edge function expects filter fields at the top level,
    // not nested under a `filters` key. It infers entity type from the presence
    // of prospect-specific fields (job_title, seniorities, departments, prospect_countries).
    const { data, error } = await supabase.functions.invoke('explorium-search', {
      body: {
        action: 'stats',
        ...params.filters,
      },
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    })

    if (error) {
      throw new Error(error.message || 'Failed to fetch Explorium stats')
    }

    if (data?.error) {
      const err = new Error(data.error) as Error & { code?: string }
      err.code = data.code
      throw err
    }

    return { total_count: data?.total_count ?? 0 }
  },
}

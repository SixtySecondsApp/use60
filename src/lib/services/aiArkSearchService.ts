/**
 * AI Ark Search Service
 *
 * Wraps the AI Ark search and Ops creation flow.
 * Calls the copilot-dynamic-table edge function with source='ai_ark' to search
 * and persist results as an Op, or calls `ai-ark-search` directly for
 * standalone searches without table creation.
 */

import { supabase, getSupabaseAuthToken } from '@/lib/supabase/clientV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiArkCompanySearchParams {
  industry?: string[]
  employee_min?: number
  employee_max?: number
  location?: string[]
  domain?: string[]
  company_name?: string
  keywords?: string[]
  technologies?: string[]
  revenue_min?: number
  revenue_max?: number
  founded_min?: number
  founded_max?: number
  per_page?: number
  page?: number
}

export interface AiArkPeopleSearchParams {
  job_title?: string[]
  seniority_level?: string[]
  company_domain?: string[]
  company_name?: string
  location?: string[]
  name?: string
  keywords?: string[]
  industry?: string[]
  per_page?: number
  page?: number
}

export interface CreateTableFromAiArkParams {
  query_description: string
  search_params: AiArkCompanySearchParams | AiArkPeopleSearchParams
  search_type: 'company_search' | 'people_search'
  table_name?: string
  auto_enrich?: {
    email?: boolean
    phone?: boolean
    linkedin?: boolean
  }
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

export interface NormalizedAiArkCompany {
  ai_ark_id: string
  company_name: string
  domain: string | null
  industry: string | null
  employee_count: number | null
  employee_range: string | null
  location: string | null
  founded_year: number | null
  description: string | null
  logo_url: string | null
  linkedin_url: string | null
  website: string | null
  technologies: string[] | null
}

export interface NormalizedAiArkContact {
  ai_ark_id: string
  first_name: string
  last_name: string
  full_name: string
  title: string | null
  seniority: string | null
  linkedin_url: string | null
  location: string | null
  industry: string | null
  current_company: string | null
  current_company_domain: string | null
  photo_url: string | null
}

export interface AiArkCompanySearchResult {
  companies: NormalizedAiArkCompany[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
    returned: number
  }
  credits_consumed: number | null
}

export interface AiArkPeopleSearchResult {
  contacts: NormalizedAiArkContact[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
    returned: number
  }
  credits_consumed: number | null
}

export interface AiArkSearchError {
  error: string
  code?: 'AI_ARK_NOT_CONFIGURED' | 'RATE_LIMITED' | 'INVALID_PARAMS' | 'AI_ARK_API_ERROR' | string
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const aiArkSearchService = {
  /**
   * Search AI Ark and persist results as a new Op.
   *
   * Calls the copilot-dynamic-table edge function with source='ai_ark',
   * which internally calls `ai-ark-search`, then creates the table + columns + rows + cells.
   */
  async searchAndCreateTable(
    params: CreateTableFromAiArkParams
  ): Promise<OpsTableResult> {
    const token = await getSupabaseAuthToken()
    const { data, error } = await supabase.functions.invoke('copilot-dynamic-table', {
      body: {
        source: 'ai_ark',
        action: params.search_type,
        query_description: params.query_description,
        search_params: params.search_params,
        table_name: params.table_name,
        ...(params.auto_enrich ? { auto_enrich: params.auto_enrich } : {}),
      },
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    })

    if (error) {
      throw new Error(error.message || 'Failed to create ops table from AI Ark search')
    }

    if (data?.error) {
      const err = new Error(data.error) as Error & { code?: string; dedup?: { total: number; duplicates: number; net_new: number } }
      err.code = data.code
      if (data.dedup) err.dedup = data.dedup
      throw err
    }

    return data as OpsTableResult
  },

  /**
   * Standalone AI Ark company search (no table creation).
   *
   * Calls the `ai-ark-search` edge function directly and returns
   * normalized companies with pagination metadata.
   */
  async searchCompanies(params: AiArkCompanySearchParams): Promise<AiArkCompanySearchResult> {
    const token = await getSupabaseAuthToken()
    if (!token) throw new Error('Not authenticated')

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY
    const url = `${supabaseUrl}/functions/v1/ai-ark-search`

    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({
        action: 'company_search',
        ...params,
        _auth_token: token,
      }),
    })

    const data = await response.json()

    if (!response.ok || data?.error) {
      console.error('[aiArkSearchService] Company search error:', data)
      const err = new Error(data.error || `HTTP ${response.status}`) as Error & { code?: string }
      err.code = data.code
      throw err
    }

    return data as AiArkCompanySearchResult
  },

  /**
   * Standalone AI Ark people search (no table creation).
   *
   * Calls the `ai-ark-search` edge function directly and returns
   * normalized contacts with pagination metadata.
   */
  async searchPeople(params: AiArkPeopleSearchParams): Promise<AiArkPeopleSearchResult> {
    const token = await getSupabaseAuthToken()
    if (!token) throw new Error('Not authenticated')

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY
    const url = `${supabaseUrl}/functions/v1/ai-ark-search`

    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({
        action: 'people_search',
        ...params,
        _auth_token: token,
      }),
    })

    const data = await response.json()

    if (!response.ok || data?.error) {
      console.error('[aiArkSearchService] People search error:', data)
      const err = new Error(data.error || `HTTP ${response.status}`) as Error & { code?: string }
      err.code = data.code
      throw err
    }

    return data as AiArkPeopleSearchResult
  },
}

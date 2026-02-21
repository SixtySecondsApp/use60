/**
 * useParseAiArkQuery
 *
 * Mutation hook that sends a natural language query to the parse-ai-ark-query
 * edge function and returns structured AI Ark search filters.
 *
 * Mirrors the useParseApolloQuery pattern in useOpsTableSearch.ts.
 */

import { useMutation } from '@tanstack/react-query'
import { supabase, getSupabaseAuthToken } from '@/lib/supabase/clientV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mirrors the JSON schema returned by parse-ai-ark-query/index.ts */
export interface ParsedAiArkQuery {
  search_type: 'company' | 'people'
  industry?: string[]
  industry_tags?: string[]
  technologies?: string[]
  location?: string[]
  employee_min?: number
  employee_max?: number
  revenue_min?: number
  revenue_max?: number
  founded_min?: number
  founded_max?: number
  job_title?: string[]
  seniority_level?: string[]
  keywords?: string[]
  company_domain?: string[]
  company_name?: string
  suggested_table_name: string
  summary: string
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useParseAiArkQuery() {
  return useMutation<ParsedAiArkQuery, Error, string>({
    mutationFn: async (query: string) => {
      const token = await getSupabaseAuthToken()
      const { data, error } = await supabase.functions.invoke('parse-ai-ark-query', {
        body: { query },
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      })

      if (error) throw new Error(error.message || 'Failed to parse query')
      if (data?.error) throw new Error(data.error)
      return data as ParsedAiArkQuery
    },
  })
}

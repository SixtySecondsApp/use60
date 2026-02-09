import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

const AI_ARK_API_BASE = 'https://api.ai-ark.com/api/developer-portal/v1'

interface SemanticSearchParams {
  natural_language_query: string
  max_results?: number
  page?: number
  additional_filters?: Record<string, unknown>
  _auth_token?: string
}

interface NormalizedCompany {
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
  technologies: Array<{ category: string; name: string }> | null
}

/**
 * Split a natural language query into meaningful keyword phrases.
 * Splits on commas, " and ", and semicolons. Falls back to the full query
 * as a single keyword if no delimiters are found.
 */
function extractKeywords(query: string): string[] {
  const delimited = query
    .split(/[,;]|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  // If splitting produced nothing useful, use the whole query
  if (delimited.length === 0) {
    return [query.trim()]
  }

  return delimited
}

/**
 * Normalize an AI Ark company response object into a flat structure.
 */
function normalizeCompany(company: Record<string, unknown>): NormalizedCompany {
  const summary = (company.summary as Record<string, unknown>) || {}
  const link = (company.link as Record<string, unknown>) || {}
  const location = (company.location as Record<string, unknown>) || {}
  const headquarter = (location.headquarter as Record<string, unknown>) || {}
  const staff = (summary.staff as Record<string, unknown>) || {}
  const logo = (summary.logo as Record<string, unknown>) || {}
  const technologies = company.technologies as Array<{ category: string; name: string }> | undefined

  // Build location string from headquarter parts
  const locationParts = [
    headquarter.city as string,
    headquarter.state as string,
    headquarter.country as string,
  ].filter(Boolean)
  const locationStr = locationParts.length > 0 ? locationParts.join(', ') : (headquarter.raw_address as string) || null

  return {
    ai_ark_id: (company.id as string) || '',
    company_name: (summary.name as string) || '',
    domain: (link.domain as string) || null,
    industry: (summary.industry as string) || null,
    employee_count: (staff.total as number) || null,
    employee_range: (staff.range as string) || null,
    location: locationStr,
    founded_year: (summary.founded_year as number) || (summary.foundedYear as number) || null,
    description: (summary.description as string) || null,
    logo_url: (logo.source as string) || null,
    linkedin_url: (link.linkedin as string) || null,
    website: (link.website as string) || (link.domain ? `https://${link.domain}` : null),
    technologies: technologies && technologies.length > 0 ? technologies : null,
  }
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) {
    return preflightResponse
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    // Parse body -- auth token may be in body as fallback when headers are stripped
    const body = await req.json()
    const {
      _auth_token,
      natural_language_query,
      max_results = 25,
      page = 0,
      additional_filters,
    } = body as SemanticSearchParams

    // Validate query
    if (!natural_language_query || typeof natural_language_query !== 'string') {
      return new Response(
        JSON.stringify({
          error: 'natural_language_query is required and must be a string.',
          code: 'INVALID_PARAMS',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (natural_language_query.trim().length === 0) {
      return new Response(
        JSON.stringify({
          error: 'natural_language_query cannot be empty.',
          code: 'INVALID_PARAMS',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get auth token: prefer Authorization header, fallback to body token
    const authHeader = req.headers.get('Authorization')
    const bearerToken = authHeader || (_auth_token ? `Bearer ${_auth_token}` : null)

    if (!bearerToken) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization. Please sign in and try again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Authenticate user
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: bearerToken } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's org for AI Ark API key lookup
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'No organization found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get AI Ark API key from org integrations (service client for cross-user credential lookup)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: integration } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', membership.org_id)
      .eq('provider', 'ai_ark')
      .maybeSingle()

    const aiArkApiKey = (integration?.credentials as Record<string, string>)?.api_key
      || Deno.env.get('AI_ARK_API_KEY')

    if (!aiArkApiKey) {
      return new Response(
        JSON.stringify({
          error: 'AI Ark API key not configured. Please add your AI Ark API key in Settings > Integrations.',
          code: 'AI_ARK_NOT_CONFIGURED',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract keywords from the natural language query
    const keywords = extractKeywords(natural_language_query)
    const clampedSize = Math.min(Math.max(max_results, 1), 100)

    // Build AI Ark company search payload using keyword-based filters
    // Note: AI Ark keyword filter uses flat `include` (not nested `any.include`)
    const accountFilters: Record<string, unknown> = {
      keyword: {
        include: keywords,
        sources: ['KEYWORD', 'DESCRIPTION', 'SEO', 'NAME', 'INDUSTRY'],
      },
    }

    // Merge any additional filters provided by the caller (industry, location, employeeSize, etc.)
    if (additional_filters && typeof additional_filters === 'object') {
      Object.assign(accountFilters, additional_filters)
    }

    const searchPayload = {
      page,
      size: clampedSize,
      account: accountFilters,
    }

    console.log('[ai-ark-semantic] Searching with keywords:', JSON.stringify(keywords))
    console.log('[ai-ark-semantic] Payload:', JSON.stringify(searchPayload))

    // Call AI Ark /v1/companies endpoint
    const apiEndpoint = `${AI_ARK_API_BASE}/companies`
    const aiArkResponse = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TOKEN': aiArkApiKey,
      },
      body: JSON.stringify(searchPayload),
    })

    if (!aiArkResponse.ok) {
      const errorBody = await aiArkResponse.text()
      console.error('[ai-ark-semantic] AI Ark API error:', aiArkResponse.status, errorBody)

      if (aiArkResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error: 'AI Ark rate limit exceeded. Please wait a moment and try again.',
            code: 'RATE_LIMITED',
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (aiArkResponse.status === 401 || aiArkResponse.status === 403) {
        return new Response(
          JSON.stringify({
            error: 'AI Ark API key is invalid or expired. Please update your API key in Settings > Integrations.',
            code: 'AI_ARK_AUTH_ERROR',
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (aiArkResponse.status === 400) {
        return new Response(
          JSON.stringify({
            error: `Invalid search parameters: ${errorBody}`,
            code: 'INVALID_PARAMS',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          error: `AI Ark API error: ${aiArkResponse.status}`,
          details: errorBody,
          code: 'AI_ARK_API_ERROR',
        }),
        { status: aiArkResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const aiArkData = await aiArkResponse.json()

    // Parse credits consumed from response header
    const creditHeader = aiArkResponse.headers.get('x-credit')
    const creditsConsumed = creditHeader ? parseFloat(creditHeader) : null

    // Normalize results from AI Ark's response shape
    const companies = (aiArkData.content || []) as Record<string, unknown>[]
    const normalizedCompanies = companies.map(normalizeCompany)

    // Log sample for debugging
    if (companies.length > 0) {
      const sample = companies[0] as Record<string, unknown>
      const sampleSummary = (sample.summary as Record<string, unknown>) || {}
      console.log('[ai-ark-semantic] Sample company:', JSON.stringify({
        id: sample.id,
        name: sampleSummary.name,
        industry: sampleSummary.industry,
      }))
    }

    const pagination = {
      total: aiArkData.totalElements ?? normalizedCompanies.length,
      total_pages: aiArkData.totalPages ?? 1,
      page: aiArkData.pageable?.pageNumber ?? page,
      page_size: aiArkData.pageable?.pageSize ?? clampedSize,
      returned: normalizedCompanies.length,
    }

    return new Response(
      JSON.stringify({
        companies: normalizedCompanies,
        pagination,
        query: natural_language_query,
        keywords_used: keywords,
        credits_consumed: creditsConsumed,
        note: 'Keyword-based search (AI Ark does not offer native semantic search)',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[ai-ark-semantic] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

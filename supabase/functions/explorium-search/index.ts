import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { checkCreditBalance, logFlatRateCostEvent } from '../_shared/costTracking.ts'

const EXPLORIUM_API_BASE = 'https://api.explorium.ai/v1'
const EXPLORIUM_SEARCH_CREDIT_COST = 2 // 1 Explorium credit × 2x platform markup

// ---------------------------------------------------------------------------
// Request interface
// ---------------------------------------------------------------------------

interface ExploriumSearchRequest {
  action: 'business_search' | 'prospect_search' | 'stats'

  // Business search filters
  industries?: string[]
  employee_ranges?: string[]
  revenue_ranges?: string[]
  countries?: string[]
  technologies?: string[]
  intent_topics?: string[]
  is_public?: boolean
  domains?: string[]
  company_names?: string[]

  // Prospect search filters
  job_title?: string
  include_related_titles?: boolean
  seniorities?: string[]
  departments?: string[]
  has_email?: boolean
  business_ids?: string[]
  prospect_countries?: string[]

  // Pagination
  page?: number
  per_page?: number

  // Exclusion
  exclude_ids?: string[]

  // Mode
  preview_mode?: boolean

  // Auth fallback + credit bypass
  _auth_token?: string
  _skip_credit_deduction?: boolean
}

// ---------------------------------------------------------------------------
// Normalized output types
// ---------------------------------------------------------------------------

interface NormalizedExploriumBusiness {
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

interface NormalizedExploriumProspect {
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

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function normalizeBusiness(b: Record<string, unknown>): NormalizedExploriumBusiness {
  return {
    explorium_id: (b.business_id as string) || '',
    company_name: (b.name as string) || '',
    domain: (b.domain as string) || null,
    industry: (b.industry as string) || null,
    employee_range: (b.number_of_employees_range as string) || null,
    revenue_range: (b.yearly_revenue_range as string) || null,
    country: (b.country_name as string) || null,
    city: (b.city_name as string) || null,
    description: (b.business_description as string) || null,
    logo_url: (b.logo as string) || null,
    linkedin_url: null, // not in business response schema
    website: (b.website as string) || null,
    is_public: typeof b.is_public_company === 'boolean' ? b.is_public_company : null,
  }
}

function normalizeProspect(p: Record<string, unknown>): NormalizedExploriumProspect {
  const firstName = (p.first_name as string) || ''
  const lastName = (p.last_name as string) || ''
  return {
    explorium_id: (p.prospect_id as string) || '',
    first_name: firstName,
    last_name: lastName,
    full_name: (p.full_name as string) || `${firstName} ${lastName}`.trim(),
    title: (p.job_title as string) || '',
    job_level: (p.job_level_main as string) || null,
    department: (p.job_department_main as string) || null,
    linkedin_url: (p.linkedin as string) || null,
    country: (p.country_name as string) || null,
    city: (p.city as string) || null,
    company_name: (p.company_name as string) || null,
    company_domain: (p.company_website as string) || null,
    business_id: (p.business_id as string) || null,
  }
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

function buildBusinessPayload(params: ExploriumSearchRequest): Record<string, unknown> {
  const {
    industries,
    employee_ranges,
    revenue_ranges,
    countries,
    technologies,
    intent_topics,
    is_public,
    domains,
    company_names,
    exclude_ids,
    preview_mode,
    page = 1,
    per_page = 25,
  } = params

  const filters: Record<string, unknown> = {}
  if (industries?.length) filters.google_category = { values: industries }
  if (employee_ranges?.length) filters.company_size = { values: employee_ranges }
  if (revenue_ranges?.length) filters.company_revenue = { values: revenue_ranges }
  if (countries?.length) filters.country_code = { values: countries }
  if (technologies?.length) filters.company_tech_stack_tech = { values: technologies }
  if (intent_topics?.length) filters.business_intent_topics = { values: intent_topics }
  if (is_public !== undefined) filters.is_public_company = { value: is_public }
  if (domains?.length) filters.company_domain = { values: domains }
  if (company_names?.length) filters.company_name = { values: company_names }

  const payload: Record<string, unknown> = {
    mode: preview_mode ? 'preview' : 'full',
    page_size: Math.min(per_page, 500),
    page,
    filters,
  }

  if (exclude_ids?.length) payload.exclude = exclude_ids

  return payload
}

function buildProspectPayload(params: ExploriumSearchRequest): Record<string, unknown> {
  const {
    job_title,
    include_related_titles,
    seniorities,
    departments,
    has_email,
    employee_ranges,
    prospect_countries,
    business_ids,
    exclude_ids,
    preview_mode,
    page = 1,
    per_page = 25,
  } = params

  const filters: Record<string, unknown> = {}
  if (job_title) {
    filters.job_title = { value: job_title }
    filters.include_related_job_titles = include_related_titles ?? true
  }
  if (seniorities?.length) filters.job_level = { values: seniorities }
  if (departments?.length) filters.job_department = { values: departments }
  if (has_email !== undefined) filters.has_email = { value: has_email }
  if (employee_ranges?.length) filters.company_size = { values: employee_ranges }
  if (prospect_countries?.length) filters.country_code = { values: prospect_countries }
  if (business_ids?.length) filters.business_id = business_ids

  const payload: Record<string, unknown> = {
    mode: preview_mode ? 'preview' : 'full',
    page_size: Math.min(per_page, 500),
    page,
    filters,
  }

  if (exclude_ids?.length) payload.exclude = exclude_ids

  return payload
}

function buildStatsPayload(
  action: 'business_search' | 'prospect_search' | 'stats',
  params: ExploriumSearchRequest,
): { endpoint: string; payload: Record<string, unknown> } {
  // Stats mirrors the search payload minus pagination/mode
  const isProspect = action === 'prospect_search'
  const searchPayload = isProspect ? buildProspectPayload(params) : buildBusinessPayload(params)

  // Stats endpoints only need filters
  const statsPayload: Record<string, unknown> = {
    filters: searchPayload.filters,
  }
  if (searchPayload.exclude) statsPayload.exclude = searchPayload.exclude

  const endpoint = isProspect ? 'prospects/stats' : 'businesses/stats'
  return { endpoint, payload: statsPayload }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

  try {
    // Parse body — auth token may be in body as fallback when headers are stripped
    const body = await req.json()
    const {
      _auth_token,
      _skip_credit_deduction,
      ...params
    } = body as ExploriumSearchRequest

    const { action } = params

    if (!action || !['business_search', 'prospect_search', 'stats'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing action. Must be one of: business_search, prospect_search, stats.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Get auth token: prefer Authorization header, fallback to body token
    const authHeader = req.headers.get('Authorization')
    const bearerToken = authHeader || (_auth_token ? `Bearer ${_auth_token}` : null)

    if (!bearerToken) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization. Please sign in and try again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Authenticate user with user-scoped client (respects RLS)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: bearerToken } } },
    )

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Resolve org membership
    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'No organization found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const orgId = membership.org_id

    // Credit balance check (skip for stats — they are free)
    if (!_skip_credit_deduction && action !== 'stats') {
      const creditCheck = await checkCreditBalance(userClient, orgId)
      if (!creditCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: 'insufficient_credits',
            message: creditCheck.message || 'Your organization has run out of AI credits. Please top up to continue.',
            balance: creditCheck.balance,
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // Resolve Explorium API key — BYOK first, then platform key
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: creds } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'explorium')
      .maybeSingle()

    const apiKey = (creds?.credentials as Record<string, string>)?.api_key
      || Deno.env.get('EXPLORIUM_API_KEY')

    const usingOwnKey = !!(creds?.credentials as Record<string, string>)?.api_key

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'Explorium API key not configured. Please add your Explorium API key in Settings → Integrations.',
          code: 'EXPLORIUM_NOT_CONFIGURED',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ---------------------------------------------------------------------------
    // Build the request
    // ---------------------------------------------------------------------------

    let endpoint: string
    let payload: Record<string, unknown>

    if (action === 'stats') {
      // For stats we need to know which entity type to count — default to business
      // The caller should pass the same filters they would for the actual search.
      // We infer from presence of prospect-specific fields.
      const isProspectStats = !!(
        params.job_title ||
        params.seniorities?.length ||
        params.departments?.length ||
        params.prospect_countries?.length
      )
      const resolved = buildStatsPayload(
        isProspectStats ? 'prospect_search' : 'business_search',
        params,
      )
      endpoint = resolved.endpoint
      payload = resolved.payload
    } else if (action === 'prospect_search') {
      endpoint = 'prospects'
      payload = buildProspectPayload(params)
    } else {
      endpoint = 'businesses'
      payload = buildBusinessPayload(params)
    }

    console.log(`[explorium-search] action=${action} endpoint=${endpoint}`, JSON.stringify(payload))

    // ---------------------------------------------------------------------------
    // Call Explorium API
    // ---------------------------------------------------------------------------

    const exploriumResponse = await fetch(`${EXPLORIUM_API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_key': apiKey,
      },
      body: JSON.stringify(payload),
    })

    if (!exploriumResponse.ok) {
      const errorBody = await exploriumResponse.text()
      console.error(`[explorium-search] Explorium API error: ${exploriumResponse.status}`, errorBody)
      console.error('[explorium-search] Payload that caused error:', JSON.stringify(payload))

      if (exploriumResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error: 'Explorium rate limit exceeded. Please wait a moment and try again.',
            code: 'RATE_LIMITED',
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (exploriumResponse.status === 400 || exploriumResponse.status === 422) {
        let exploriumErrorMsg = ''
        try {
          const parsed = JSON.parse(errorBody)
          exploriumErrorMsg = parsed.message || parsed.error || parsed.detail || ''
        } catch { /* raw text */ }

        return new Response(
          JSON.stringify({
            error: `Invalid parameters: ${exploriumErrorMsg || errorBody}`,
            code: 'INVALID_PARAMS',
            details: errorBody,
            payload_sent: payload,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Generic upstream error
      return new Response(
        JSON.stringify({
          error: `Explorium API error: ${exploriumResponse.status}`,
          details: errorBody,
          payload_sent: payload,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const data = await exploriumResponse.json()

    // ---------------------------------------------------------------------------
    // Stats — lightweight early return (free, no credit deduction)
    // ---------------------------------------------------------------------------

    if (action === 'stats') {
      // Explorium stats API returns `total_results` (not total_count/count/total)
      const totalCount = (data.total_results as number)
        ?? (data.total_count as number)
        ?? (data.count as number)
        ?? (data.total as number)
        ?? 0

      return new Response(
        JSON.stringify({
          total_count: totalCount,
          action: 'stats',
          credits_consumed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ---------------------------------------------------------------------------
    // Normalize results
    // ---------------------------------------------------------------------------

    const rawItems = (data.data || data.results || data.businesses || data.prospects || []) as Record<string, unknown>[]
    const totalCount = (data.total_results as number)
      ?? (data.total_count as number)
      ?? (data.total as number)
      ?? rawItems.length
    const page = (params.page ?? 1)
    const perPage = Math.min(params.per_page ?? 25, 500)
    const totalPages = perPage > 0 ? Math.ceil(totalCount / perPage) : 1

    let results: NormalizedExploriumBusiness[] | NormalizedExploriumProspect[]

    if (action === 'prospect_search') {
      results = rawItems.map(normalizeProspect)
    } else {
      results = rawItems.map(normalizeBusiness)
    }

    // Log first result for field debugging
    if (rawItems.length > 0) {
      console.log('[explorium-search] Sample result keys:', Object.keys(rawItems[0]).join(', '))
    }

    // ---------------------------------------------------------------------------
    // Credit deduction — only for paid actions with platform key
    // ---------------------------------------------------------------------------

    if (!_skip_credit_deduction && !usingOwnKey) {
      await logFlatRateCostEvent(
        userClient,
        user.id,
        orgId,
        'explorium',
        `explorium-${action}`,
        EXPLORIUM_SEARCH_CREDIT_COST,
        'explorium_search',
      )
    }

    return new Response(
      JSON.stringify({
        results,
        pagination: {
          page,
          per_page: perPage,
          total: totalCount,
          total_pages: totalPages,
          has_more: page < totalPages,
          returned: results.length,
        },
        total_count: totalCount,
        credits_consumed: EXPLORIUM_SEARCH_CREDIT_COST,
        action,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('[explorium-search] Unhandled error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})

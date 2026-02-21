import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { checkCreditBalance, logFlatRateCostEvent } from '../_shared/costTracking.ts'

const AI_ARK_API_BASE = 'https://api.ai-ark.com/api/developer-portal/v1'

// ---------------------------------------------------------------------------
// Types: caller-facing flat params
// ---------------------------------------------------------------------------

interface CompanySearchParams {
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
  page?: number
  per_page?: number
}

interface PeopleSearchParams {
  company_domain?: string[]
  company_name?: string
  job_title?: string[]
  seniority_level?: string[]
  location?: string[]
  name?: string
  keywords?: string[]
  industry?: string[]
  page?: number
  per_page?: number
}

interface AIArkSearchParams {
  action: 'company_search' | 'people_search'
  _auth_token?: string
  _skip_credit_deduction?: boolean
  preview_mode?: boolean
  page_size?: number
  // Company search flat params
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
  // People search flat params
  company_domain?: string[]
  job_title?: string[]
  seniority_level?: string[]
  name?: string
  // Shared (used by both company and people search)
  keywords?: string[]
  // Pagination
  page?: number
  per_page?: number
}

const CREDIT_COSTS = {
  ai_ark_company: 0.25,
  ai_ark_people: 1.25,
}

// ---------------------------------------------------------------------------
// Types: normalized output
// ---------------------------------------------------------------------------

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
  technologies: string[] | null
}

interface NormalizedContact {
  ai_ark_id: string
  first_name: string
  last_name: string
  full_name: string
  title: string
  seniority: string | null
  linkedin_url: string | null
  location: string | null
  industry: string | null
  current_company: string | null
  current_company_domain: string | null
  photo_url: string | null
}

// ---------------------------------------------------------------------------
// Translate flat params -> AI Ark nested request body
// ---------------------------------------------------------------------------

function buildCompanyPayload(params: CompanySearchParams, page: number, size: number): Record<string, unknown> {
  const account: Record<string, unknown> = {}

  if (params.industry?.length) {
    account.industry = { include: params.industry }
  }

  if (params.employee_min != null || params.employee_max != null) {
    const range: Record<string, number> = {}
    if (params.employee_min != null) range.start = params.employee_min
    if (params.employee_max != null) range.end = params.employee_max
    account.employeeSize = [range]
  }

  if (params.location?.length) {
    account.location = params.location
  }

  if (params.domain?.length) {
    account.domain = { any: { include: params.domain } }
  }

  if (params.company_name) {
    account.name = { any: { include: [params.company_name], searchMode: 'SMART' } }
  }

  if (params.keywords?.length) {
    account.keyword = {
      include: params.keywords,
      sources: ['KEYWORD', 'DESCRIPTION', 'SEO', 'NAME', 'INDUSTRY'],
    }
  }

  if (params.technologies?.length) {
    account.technology = { include: params.technologies }
  }

  if (params.revenue_min != null || params.revenue_max != null) {
    const range: Record<string, number> = {}
    if (params.revenue_min != null) range.start = params.revenue_min
    if (params.revenue_max != null) range.end = params.revenue_max
    account.revenue = [range]
  }

  if (params.founded_min != null || params.founded_max != null) {
    const year: Record<string, number> = {}
    if (params.founded_min != null) year.start = params.founded_min
    if (params.founded_max != null) year.end = params.founded_max
    account.foundedYear = year
  }

  const payload: Record<string, unknown> = { page, size }
  if (Object.keys(account).length > 0) {
    payload.account = account
  }
  return payload
}

function buildPeoplePayload(params: PeopleSearchParams, page: number, size: number): Record<string, unknown> {
  const account: Record<string, unknown> = {}
  const contact: Record<string, unknown> = {}

  if (params.company_domain?.length) {
    account.domain = { any: { include: params.company_domain } }
  }

  if (params.company_name) {
    account.name = { any: { include: [params.company_name] } }
  }

  // AI Ark /v1/people only supports account.domain and account.name for
  // company-level filters. Industry and keyword filters are NOT supported on
  // the people endpoint — convert them to keyword-based account.name search
  // so the query still narrows results meaningfully.
  if (params.industry?.length || params.keywords?.length) {
    const terms = [...(params.industry ?? []), ...(params.keywords ?? [])]
    if (terms.length && !account.name) {
      account.name = { any: { include: terms, searchMode: 'SMART' } }
    }
  }

  if (params.job_title?.length) {
    contact.title = { any: { include: params.job_title, searchMode: 'SMART' } }
  }

  if (params.seniority_level?.length) {
    contact.seniority = { any: { include: params.seniority_level } }
  }

  if (params.location?.length) {
    contact.location = params.location
  }

  if (params.name) {
    contact.fullName = { any: { include: [params.name], searchMode: 'SMART' } }
  }

  const payload: Record<string, unknown> = { page, size }
  if (Object.keys(account).length > 0) {
    payload.account = account
  }
  if (Object.keys(contact).length > 0) {
    payload.contact = contact
  }
  return payload
}

// ---------------------------------------------------------------------------
// Normalize AI Ark responses -> flat records
// ---------------------------------------------------------------------------

function normalizeCompany(company: Record<string, unknown>): NormalizedCompany {
  const summary = (company.summary || {}) as Record<string, unknown>
  const link = (company.link || {}) as Record<string, unknown>
  const loc = (company.location || {}) as Record<string, unknown>
  const hq = (loc.headquarter || {}) as Record<string, unknown>
  const staff = (summary.staff || {}) as Record<string, unknown>
  const staffRange = (staff.range || {}) as Record<string, number>
  const logo = (summary.logo || {}) as Record<string, unknown>
  const techs = (company.technologies || []) as Array<Record<string, unknown>>
  const industries = (company.industries || []) as string[]

  let employeeRange: string | null = null
  if (staffRange.start != null && staffRange.end != null) {
    employeeRange = `${staffRange.start}-${staffRange.end}`
  }

  const locationStr = (hq.raw_address as string)
    || [hq.city, hq.state, hq.country].filter(Boolean).join(', ')
    || null

  return {
    ai_ark_id: (company.id as string) || '',
    company_name: (summary.name as string) || '',
    domain: (link.domain as string) || (link.domain_ltd as string) || null,
    industry: (summary.industry as string) || (industries.length > 0 ? industries[0] : null),
    employee_count: (staff.total as number) ?? null,
    employee_range: employeeRange,
    location: locationStr,
    founded_year: (summary.founded_year as number) ?? null,
    description: (summary.description as string) || null,
    logo_url: (logo.source as string) || null,
    linkedin_url: (link.linkedin as string) || null,
    website: (link.website as string) || null,
    technologies: techs.length > 0 ? techs.map((t) => (t.name as string) || '').filter(Boolean) : null,
  }
}

function normalizeContact(person: Record<string, unknown>): NormalizedContact {
  const profile = (person.profile || {}) as Record<string, unknown>
  const link = (person.link || {}) as Record<string, unknown>
  const loc = (person.location || {}) as Record<string, unknown>
  const dept = (person.department || {}) as Record<string, unknown>
  const picture = (profile.picture || {}) as Record<string, unknown>

  // Company info comes from the top-level `company` object in people search responses
  const company = (person.company || {}) as Record<string, unknown>
  const companySummary = (company.summary || {}) as Record<string, unknown>
  const companyLink = (company.link || {}) as Record<string, unknown>

  // Fallback: check position_groups for current role
  const positionGroups = (person.position_groups || []) as Array<Record<string, unknown>>
  const currentPosition = positionGroups.find((pg) => {
    const date = pg.date as Record<string, unknown> | undefined
    return date && date.end === null
  })
  const currentPosCompany = currentPosition
    ? (currentPosition.company as Record<string, unknown>) || {}
    : {}

  return {
    ai_ark_id: (person.id as string) || '',
    first_name: (profile.first_name as string) || '',
    last_name: (profile.last_name as string) || '',
    full_name: (profile.full_name as string) || '',
    title: (profile.title as string) || (profile.headline as string) || '',
    seniority: (dept.seniority as string) || null,
    linkedin_url: (link.linkedin as string) || null,
    location: (loc.default as string) || null,
    industry: (person.industry as string) || (companySummary.industry as string) || null,
    current_company: (companySummary.name as string) || (currentPosCompany.name as string) || null,
    current_company_domain: (companyLink.domain as string) || null,
    photo_url: (picture.source as string) || null,
  }
}

// ---------------------------------------------------------------------------
// Edge function
// ---------------------------------------------------------------------------

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
    const { _auth_token, _skip_credit_deduction, action, preview_mode, page_size, ...searchParams } = body as AIArkSearchParams

    // Validate action
    if (!action || !['company_search', 'people_search'].includes(action)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid action. Must be "company_search" or "people_search".',
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

    if (!_skip_credit_deduction && membership.org_id) {
      const creditCheck = await checkCreditBalance(supabase, membership.org_id)
      if (!creditCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: 'insufficient_credits',
            message: creditCheck.message || 'Your organization has run out of AI credits. Please top up to continue.',
            balance: creditCheck.balance,
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Get AI Ark API key from org integrations (service role to bypass RLS)
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

    // BYOK: if the org supplied their own key they pay AI Ark directly — skip credit deduction
    const usingOwnKey = !!(integration?.credentials as Record<string, string>)?.api_key

    if (!aiArkApiKey) {
      return new Response(
        JSON.stringify({
          error: 'AI Ark API key not configured. Please add your AI Ark API key in Settings > Integrations.',
          code: 'AI_ARK_NOT_CONFIGURED',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Pagination: accept caller's 1-based page, translate to 0-based for AI Ark
    const callerPage = searchParams.page ?? 1
    const aiArkPage = Math.max(0, callerPage - 1)
    // preview_mode overrides page_size -- always fetch 5 results
    const effectiveSize = preview_mode
      ? 5
      : Math.min(Math.max(page_size || searchParams.per_page || 25, 1), 100)
    const size = effectiveSize

    // Build AI Ark search payload and determine endpoint
    let apiEndpoint: string
    let searchPayload: Record<string, unknown>

    if (action === 'company_search') {
      apiEndpoint = `${AI_ARK_API_BASE}/companies`
      searchPayload = buildCompanyPayload(searchParams as CompanySearchParams, aiArkPage, size)
    } else {
      apiEndpoint = `${AI_ARK_API_BASE}/people`
      searchPayload = buildPeoplePayload(searchParams as PeopleSearchParams, aiArkPage, size)
    }

    console.log(`[ai-ark-search] ${action} -> POST ${apiEndpoint}`, JSON.stringify(searchPayload))

    // Call AI Ark API
    const aiArkResponse = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TOKEN': aiArkApiKey,
      },
      body: JSON.stringify(searchPayload),
    })

    // Extract credits consumed from response header
    const creditsConsumedHeader = aiArkResponse.headers.get('x-credit')
    const creditsFromProvider = creditsConsumedHeader ? parseFloat(creditsConsumedHeader) : null
    const estimatedCredits = action === 'company_search'
      ? CREDIT_COSTS.ai_ark_company
      : CREDIT_COSTS.ai_ark_people
    const creditsConsumed = Number.isFinite(creditsFromProvider) && creditsFromProvider !== null
      ? creditsFromProvider
      : estimatedCredits

    if (!aiArkResponse.ok) {
      const errorBody = await aiArkResponse.text()
      console.error('[ai-ark-search] AI Ark API error:', aiArkResponse.status, errorBody)

      if (aiArkResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error: 'AI Ark rate limit exceeded. Please wait a moment and try again.',
            code: 'RATE_LIMITED',
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (aiArkResponse.status === 400 || aiArkResponse.status === 422) {
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

    if (!_skip_credit_deduction && !usingOwnKey && membership.org_id && creditsConsumed > 0) {
      await logFlatRateCostEvent(
        supabase,
        user.id,
        membership.org_id,
        'ai_ark',
        `ai-ark-${action}`,
        creditsConsumed,
        'ai_ark_search',
      )
    }

    // AI Ark uses Spring-style pagination:
    // content[], totalElements, totalPages, pageable.pageNumber, size, number
    const content = (aiArkData.content || []) as Record<string, unknown>[]
    const totalElements = (aiArkData.totalElements ?? 0) as number
    const totalPages = (aiArkData.totalPages ?? 0) as number

    const estimatedCreditCost = action === 'company_search'
      ? {
          search_cost: CREDIT_COSTS.ai_ark_company,
          per_page_cost: CREDIT_COSTS.ai_ark_company,
          description: `Company search costs ${CREDIT_COSTS.ai_ark_company} credits per call`,
        }
      : {
          search_cost: CREDIT_COSTS.ai_ark_people,
          per_page_cost: CREDIT_COSTS.ai_ark_people,
          description: `People search costs ${CREDIT_COSTS.ai_ark_people} credits per call`,
        }

    if (action === 'company_search') {
      const companies = content.map(normalizeCompany)

      if (content.length > 0) {
        console.log('[ai-ark-search] Sample company keys:', Object.keys(content[0]).join(', '))
      }

      return new Response(
        JSON.stringify({
          results: companies,
          companies,
          pagination: {
            page: callerPage,
            page_size: size,
            per_page: size,
            total: totalElements,
            total_pages: totalPages,
            has_more: callerPage < totalPages,
            returned: companies.length,
          },
          total_count: totalElements,
          estimated_credit_cost: estimatedCreditCost,
          credits_consumed: creditsConsumed,
          action,
          query: searchPayload,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      const contacts = content.map(normalizeContact)

      if (content.length > 0) {
        console.log('[ai-ark-search] Sample person keys:', Object.keys(content[0]).join(', '))
      }

      return new Response(
        JSON.stringify({
          results: contacts,
          contacts,
          pagination: {
            page: callerPage,
            page_size: size,
            per_page: size,
            total: totalElements,
            total_pages: totalPages,
            has_more: callerPage < totalPages,
            returned: contacts.length,
          },
          total_count: totalElements,
          estimated_credit_cost: estimatedCreditCost,
          credits_consumed: creditsConsumed,
          action,
          query: searchPayload,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error) {
    console.error('[ai-ark-search] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

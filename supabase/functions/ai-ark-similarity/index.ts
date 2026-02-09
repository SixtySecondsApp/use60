import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

const AI_ARK_API_BASE = 'https://api.ai-ark.com/api/developer-portal/v1'

interface SimilaritySearchParams {
  seed_company_domain?: string
  seed_company_name?: string
  seed_linkedin_url?: string
  match_count?: number
  page?: number
  account?: Record<string, unknown>
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
  technologies: string[] | null
}

function normalizeCompany(company: Record<string, unknown>): NormalizedCompany {
  const summary = (company.summary as Record<string, unknown>) || {}
  const link = (company.link as Record<string, unknown>) || {}
  const locationData = (company.location as Record<string, unknown>) || {}
  const headquarter = (locationData.headquarter as Record<string, unknown>) || {}
  const staff = (summary.staff as Record<string, unknown>) || {}
  const logo = (summary.logo as Record<string, unknown>) || {}
  const technologies = (company.technologies as Array<Record<string, unknown>>) || []
  const industries = (company.industries as string[]) || []

  // Build location string from headquarter data
  let locationStr: string | null = null
  if (headquarter.raw_address) {
    locationStr = headquarter.raw_address as string
  } else {
    const parts = [headquarter.city, headquarter.country].filter(Boolean)
    locationStr = parts.length > 0 ? parts.join(', ') : null
  }

  // Build employee range string
  let employeeRange: string | null = null
  if (staff.range) {
    const range = staff.range as Record<string, unknown>
    if (range.low != null && range.high != null) {
      employeeRange = `${range.low}-${range.high}`
    } else if (typeof staff.range === 'string') {
      employeeRange = staff.range as string
    }
  }

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
    technologies: technologies.length > 0
      ? technologies.map(t => (t.name as string)).filter(Boolean)
      : null,
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
      seed_company_domain,
      seed_company_name,
      seed_linkedin_url,
      match_count = 25,
      page = 0,
      account,
    } = body as SimilaritySearchParams

    // Validate: at least one seed identifier is required
    if (!seed_company_domain && !seed_company_name && !seed_linkedin_url) {
      return new Response(
        JSON.stringify({
          error: 'At least one of seed_company_domain, seed_company_name, or seed_linkedin_url is required.',
          code: 'INVALID_PARAMS'
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

    // Get AI Ark API key from org integrations
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
          code: 'AI_ARK_NOT_CONFIGURED'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build lookalikeDomains array from seed inputs (max 5 entries)
    const lookalikeDomains: string[] = []

    if (seed_linkedin_url) {
      lookalikeDomains.push(seed_linkedin_url)
    }
    if (seed_company_domain) {
      lookalikeDomains.push(seed_company_domain)
    }
    if (seed_company_name) {
      // seed_company_name could be a domain or a LinkedIn URL -- pass it through
      lookalikeDomains.push(seed_company_name)
    }

    // Clamp size to 1-100 range
    const size = Math.max(1, Math.min(100, match_count))

    // Build AI Ark company search payload with lookalikeDomains
    const searchPayload: Record<string, unknown> = {
      page,
      size,
      lookalikeDomains,
    }

    // Merge optional account filters (e.g., industry, employee range, location)
    if (account && typeof account === 'object') {
      Object.assign(searchPayload, account)
    }

    // Call AI Ark API -- POST /v1/companies with lookalikeDomains
    const apiEndpoint = `${AI_ARK_API_BASE}/companies`
    console.log('[ai-ark-similarity] Calling AI Ark:', apiEndpoint, 'with', lookalikeDomains.length, 'seed domains')

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
      console.error('[ai-ark-similarity] AI Ark API error:', aiArkResponse.status, errorBody)

      if (aiArkResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error: 'AI Ark rate limit exceeded. Please wait a moment and try again.',
            code: 'RATE_LIMITED'
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (aiArkResponse.status === 400) {
        return new Response(
          JSON.stringify({
            error: `Invalid search parameters: ${errorBody}`,
            code: 'INVALID_PARAMS'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          error: `AI Ark API error: ${aiArkResponse.status}`,
          details: errorBody,
          code: 'AI_ARK_API_ERROR'
        }),
        { status: aiArkResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse credits consumed from response header
    const creditHeader = aiArkResponse.headers.get('x-credit')
    const creditsConsumed = creditHeader ? parseFloat(creditHeader) : null

    const aiArkData = await aiArkResponse.json()

    // Normalize results -- AI Ark returns companies in `content` array
    const companies = (aiArkData.content || []) as Record<string, unknown>[]
    const normalizedCompanies = companies.map(normalizeCompany)

    // Log sample for debugging
    if (companies.length > 0) {
      const sample = companies[0] as Record<string, unknown>
      const sampleSummary = (sample.summary as Record<string, unknown>) || {}
      console.log('[ai-ark-similarity] Found', companies.length, 'similar companies. Sample:', sampleSummary.name)
    } else {
      console.log('[ai-ark-similarity] No similar companies found for seeds:', lookalikeDomains)
    }

    const pagination = {
      total: (aiArkData.totalElements as number) ?? normalizedCompanies.length,
      total_pages: (aiArkData.totalPages as number) ?? 1,
      page: (aiArkData.pageable as Record<string, unknown>)?.pageNumber ?? page,
      page_size: (aiArkData.pageable as Record<string, unknown>)?.pageSize ?? size,
      returned: normalizedCompanies.length,
    }

    return new Response(
      JSON.stringify({
        companies: normalizedCompanies,
        pagination,
        credits_consumed: creditsConsumed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[ai-ark-similarity] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

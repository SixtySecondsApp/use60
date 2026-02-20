import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { checkCreditBalance, logFlatRateCostEvent } from '../_shared/costTracking.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1'

// Apollo uses predefined employee range buckets — arbitrary ranges are silently ignored
const VALID_EMPLOYEE_RANGES = [
  '1,10', '11,20', '21,50', '51,100', '101,200',
  '201,500', '501,1000', '1001,5000', '5001,10000', '10001,',
]

function normalizeEmployeeRanges(ranges?: string[]): string[] | undefined {
  if (!ranges?.length) return undefined
  const normalized: string[] = []
  for (const r of ranges) {
    // Already a valid bucket
    if (VALID_EMPLOYEE_RANGES.includes(r)) {
      normalized.push(r)
      continue
    }
    // Try to parse as "min,max" or "min-max" and find overlapping buckets
    const match = r.match(/^(\d+)[,\-\s]+(\d+)$/)
    if (match) {
      const min = parseInt(match[1], 10)
      const max = parseInt(match[2], 10)
      for (const bucket of VALID_EMPLOYEE_RANGES) {
        const parts = bucket.split(',')
        const bMin = parseInt(parts[0], 10)
        const bMax = parts[1] ? parseInt(parts[1], 10) : Infinity
        // Bucket overlaps with requested range
        if (bMax >= min && bMin <= max) {
          normalized.push(bucket)
        }
      }
      continue
    }
    // "N+" format (e.g. "500+")
    const plusMatch = r.match(/^(\d+)\+?$/)
    if (plusMatch) {
      const min = parseInt(plusMatch[1], 10)
      for (const bucket of VALID_EMPLOYEE_RANGES) {
        const parts = bucket.split(',')
        const bMax = parts[1] ? parseInt(parts[1], 10) : Infinity
        if (bMax >= min) normalized.push(bucket)
      }
      continue
    }
    console.warn(`[apollo-search] Unrecognized employee range "${r}", skipping`)
  }
  return normalized.length ? [...new Set(normalized)] : undefined
}

interface ApolloSearchParams {
  person_titles?: string[]
  person_locations?: string[]
  organization_num_employees_ranges?: string[]
  organization_latest_funding_stage_cd?: string[]
  q_keywords?: string
  q_organization_keyword_tags?: string[]
  person_seniorities?: string[]
  person_departments?: string[]
  q_organization_domains?: string[]
  contact_email_status?: string[]
  per_page?: number
  page?: number
  _auth_token?: string
  _skip_credit_deduction?: boolean
}

const APOLLO_SEARCH_CREDIT_COST = 0.3

interface NormalizedContact {
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
  website_url: string | null
  city: string | null
  state: string | null
  country: string | null
  // Availability flags from Apollo search (data exists but requires enrichment)
  has_email: boolean
  has_phone: boolean
  has_city: boolean
  has_state: boolean
  has_country: boolean
  has_linkedin: boolean
}

function normalizeContact(person: Record<string, unknown>): NormalizedContact {
  const org = (person.organization as Record<string, unknown>) || {}

  // Apollo's mixed_people/api_search returns reduced data:
  // - last_name may be obfuscated as "last_name_obfuscated": "Po***r"
  // - location/email/phone are boolean flags (has_city, has_email, etc.)
  // - org only has name + boolean flags (has_employee_count, has_industry)
  // Real data requires enrichment via people/match endpoint
  const lastName = (person.last_name as string)
    || (person.last_name_obfuscated as string)
    || ''
  const firstName = (person.first_name as string) || ''

  return {
    apollo_id: (person.id as string) || '',
    first_name: firstName,
    last_name: lastName,
    full_name: (person.name as string) || `${firstName} ${lastName}`.trim(),
    title: (person.title as string) || (person.headline as string) || '',
    company: (person.organization_name as string) || (org.name as string) || '',
    // These fields may not be present in search results (only in enrichment)
    company_domain: (org.primary_domain as string) || (person.primary_domain as string) || '',
    employees: (org.estimated_num_employees as number) || null,
    funding_stage: (org.latest_funding_stage as string) || null,
    email: (person.email as string) || null,
    email_status: (person.email_status as string) || null,
    linkedin_url: (person.linkedin_url as string) || null,
    phone: (person.phone_number as string)
      || ((person.phone_numbers as Record<string, unknown>[])?.find((p) => p.type === 'mobile')?.sanitized_number as string)
      || null,
    website_url: (org.website_url as string) || (org.primary_domain ? `https://${org.primary_domain}` : null),
    city: (person.city as string) || null,
    state: (person.state as string) || null,
    country: (person.country as string) || null,
    // Availability flags — Apollo search returns these instead of actual values
    has_email: person.has_email === true || person.has_email === 'true',
    has_phone: person.has_direct_phone === true || person.has_direct_phone === 'Yes' || person.has_direct_phone === 'true',
    has_city: person.has_city === true || person.has_city === 'true',
    has_state: person.has_state === true || person.has_state === 'true',
    has_country: person.has_country === true || person.has_country === 'true',
    has_linkedin: person.has_linkedin === true || person.has_linkedin === 'true' || !!(person.linkedin_url as string),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse body — auth token may be in body as fallback when headers are stripped
    const body = await req.json()
    const { _auth_token, _skip_credit_deduction, ...searchParams } = body as ApolloSearchParams

    // Get auth token: prefer Authorization header, fallback to body token
    const authHeader = req.headers.get('Authorization')
    const bearerToken = authHeader
      || (_auth_token ? `Bearer ${_auth_token}` : null)

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

    // Get user's org for Apollo API key lookup
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

    // Get Apollo API key from org integrations
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: integration } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', membership.org_id)
      .eq('provider', 'apollo')
      .maybeSingle()

    const apolloApiKey = (integration?.credentials as Record<string, string>)?.api_key
      || Deno.env.get('APOLLO_API_KEY')

    if (!apolloApiKey) {
      return new Response(
        JSON.stringify({
          error: 'Apollo API key not configured. Please add your Apollo API key in Settings → Integrations.',
          code: 'APOLLO_NOT_CONFIGURED'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const {
      person_titles,
      person_locations,
      organization_num_employees_ranges,
      organization_latest_funding_stage_cd,
      q_keywords,
      q_organization_keyword_tags,
      person_seniorities,
      person_departments,
      q_organization_domains,
      contact_email_status,
      per_page = 50,
      page = 1,
    } = searchParams as ApolloSearchParams

    // Coerce string values to arrays — AI planners sometimes generate strings
    // instead of arrays, which causes Apollo to return 422.
    const toArray = (v: unknown): string[] | undefined => {
      if (!v) return undefined
      if (Array.isArray(v)) return v.length > 0 ? v : undefined
      if (typeof v === 'string') return [v]
      return undefined
    }

    // Build Apollo search payload
    const searchPayload: Record<string, unknown> = {
      per_page: Math.min(per_page, 100),
      page,
    }

    const pTitles = toArray(person_titles)
    if (pTitles) searchPayload.person_titles = pTitles
    const pLocations = toArray(person_locations)
    if (pLocations) searchPayload.person_locations = pLocations
    const validEmployeeRanges = normalizeEmployeeRanges(toArray(organization_num_employees_ranges))
    if (validEmployeeRanges?.length) searchPayload.organization_num_employees_ranges = validEmployeeRanges
    const fundingStages = toArray(organization_latest_funding_stage_cd)
    if (fundingStages) searchPayload.organization_latest_funding_stage_cd = fundingStages
    if (q_keywords) searchPayload.q_keywords = Array.isArray(q_keywords) ? q_keywords.join(' ') : String(q_keywords)
    const orgKeywordTags = toArray(q_organization_keyword_tags)
    if (orgKeywordTags) searchPayload.q_organization_keyword_tags = orgKeywordTags
    const pSeniorities = toArray(person_seniorities)
    if (pSeniorities) searchPayload.person_seniorities = pSeniorities
    const pDepartments = toArray(person_departments)
    if (pDepartments) searchPayload.person_departments = pDepartments
    const orgDomains = toArray(q_organization_domains)
    if (orgDomains) searchPayload.q_organization_domains = orgDomains
    const emailStatus = toArray(contact_email_status)
    if (emailStatus) searchPayload.contact_email_status = emailStatus

    // Log the exact payload for debugging
    console.log('[apollo-search] Sending to Apollo:', JSON.stringify(searchPayload))

    // Call Apollo People Search API
    const apolloResponse = await fetch(`${APOLLO_API_BASE}/mixed_people/api_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apolloApiKey,
      },
      body: JSON.stringify(searchPayload),
    })

    if (!apolloResponse.ok) {
      const errorBody = await apolloResponse.text()
      console.error('[apollo-search] Apollo API error:', apolloResponse.status, errorBody)
      console.error('[apollo-search] Payload that caused error:', JSON.stringify(searchPayload))

      if (apolloResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Apollo rate limit exceeded. Please wait a moment and try again.', code: 'RATE_LIMITED' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Try to extract a useful message from Apollo's error response
      let apolloErrorMsg = ''
      try {
        const parsed = JSON.parse(errorBody)
        apolloErrorMsg = parsed.message || parsed.error || ''
      } catch { /* raw text */ }

      return new Response(
        JSON.stringify({
          error: `Apollo API error: ${apolloResponse.status}${apolloErrorMsg ? ` — ${apolloErrorMsg}` : ''}`,
          details: errorBody,
          payload_sent: searchPayload,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apolloData = await apolloResponse.json()
    const people = (apolloData.people || []) as Record<string, unknown>[]
    const totalResults = (apolloData.pagination?.total_entries as number) || 0

    if (!_skip_credit_deduction && membership.org_id) {
      await logFlatRateCostEvent(
        supabase,
        user.id,
        membership.org_id,
        'apollo',
        'apollo-people-search',
        APOLLO_SEARCH_CREDIT_COST,
        'apollo_search',
      )
    }

    // Log first result for debugging field names
    if (people.length > 0) {
      console.log('[apollo-search] Sample person keys:', Object.keys(people[0]).join(', '))
      const sampleOrg = (people[0].organization as Record<string, unknown>) || {}
      console.log('[apollo-search] Sample org keys:', Object.keys(sampleOrg).join(', '))
      console.log('[apollo-search] Sample person data:', JSON.stringify({
        name: people[0].name,
        first_name: people[0].first_name,
        last_name: people[0].last_name,
        city: people[0].city,
        state: people[0].state,
        country: people[0].country,
        email: people[0].email,
        linkedin_url: people[0].linkedin_url,
        organization_name: people[0].organization_name,
        org_domain: sampleOrg.primary_domain,
        org_employees: sampleOrg.estimated_num_employees,
        org_website: sampleOrg.website_url,
      }))
    }

    // Normalize results
    const contacts = people.map(normalizeContact)

    return new Response(
      JSON.stringify({
        contacts,
        pagination: {
          page,
          per_page: Math.min(per_page, 100),
          total: totalResults,
          has_more: page * per_page < totalResults,
        },
        credits_consumed: APOLLO_SEARCH_CREDIT_COST,
        query: {
          person_titles,
          person_locations,
          organization_num_employees_ranges,
          organization_latest_funding_stage_cd,
          q_keywords,
          q_organization_keyword_tags,
          person_seniorities,
          person_departments,
          q_organization_domains,
          contact_email_status,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[apollo-search] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

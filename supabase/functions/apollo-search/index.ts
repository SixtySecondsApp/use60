import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APOLLO_API_BASE = 'https://api.apollo.io/v1'

interface ApolloSearchParams {
  person_titles?: string[]
  person_locations?: string[]
  organization_num_employees_ranges?: string[]
  organization_latest_funding_stage_cd?: string[]
  q_keywords?: string
  q_organization_keyword_tags?: string[]
  per_page?: number
  page?: number
}

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
  city: string | null
  state: string | null
  country: string | null
}

function normalizeContact(person: Record<string, unknown>): NormalizedContact {
  const org = (person.organization as Record<string, unknown>) || {}
  return {
    apollo_id: person.id as string,
    first_name: (person.first_name as string) || '',
    last_name: (person.last_name as string) || '',
    full_name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
    title: (person.title as string) || '',
    company: (person.organization_name as string) || (org.name as string) || '',
    company_domain: (person.organization?.primary_domain as string) || (org.primary_domain as string) || '',
    employees: (org.estimated_num_employees as number) || null,
    funding_stage: (org.latest_funding_stage as string) || null,
    email: (person.email as string) || null,
    email_status: (person.email_status as string) || null,
    linkedin_url: (person.linkedin_url as string) || null,
    phone: (person.phone_number as string) || ((person.phone_numbers as Record<string, unknown>[])?.find((p) => p.type === 'mobile')?.sanitized_number as string) || null,
    city: (person.city as string) || null,
    state: (person.state as string) || null,
    country: (person.country as string) || null,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    // Authenticate user
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Get user's org for Apollo API key lookup
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      throw new Error('No organization found')
    }

    // Get Apollo API key from org integrations
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: integration } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('org_id', membership.org_id)
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

    const body = await req.json()
    const {
      person_titles,
      person_locations,
      organization_num_employees_ranges,
      organization_latest_funding_stage_cd,
      q_keywords,
      q_organization_keyword_tags,
      per_page = 50,
      page = 1,
    } = body as ApolloSearchParams

    // Build Apollo search payload
    const searchPayload: Record<string, unknown> = {
      api_key: apolloApiKey,
      per_page: Math.min(per_page, 100),
      page,
    }

    if (person_titles?.length) searchPayload.person_titles = person_titles
    if (person_locations?.length) searchPayload.person_locations = person_locations
    if (organization_num_employees_ranges?.length) searchPayload.organization_num_employees_ranges = organization_num_employees_ranges
    if (organization_latest_funding_stage_cd?.length) searchPayload.organization_latest_funding_stage_cd = organization_latest_funding_stage_cd
    if (q_keywords) searchPayload.q_keywords = q_keywords
    if (q_organization_keyword_tags?.length) searchPayload.q_organization_keyword_tags = q_organization_keyword_tags

    // Call Apollo People Search API
    const apolloResponse = await fetch(`${APOLLO_API_BASE}/mixed_people/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchPayload),
    })

    if (!apolloResponse.ok) {
      const errorBody = await apolloResponse.text()
      console.error('[apollo-search] Apollo API error:', apolloResponse.status, errorBody)

      if (apolloResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Apollo rate limit exceeded. Please wait a moment and try again.', code: 'RATE_LIMITED' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      throw new Error(`Apollo API error: ${apolloResponse.status}`)
    }

    const apolloData = await apolloResponse.json()
    const people = (apolloData.people || []) as Record<string, unknown>[]
    const totalResults = (apolloData.pagination?.total_entries as number) || 0

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
        query: {
          person_titles,
          person_locations,
          organization_num_employees_ranges,
          organization_latest_funding_stage_cd,
          q_keywords,
          q_organization_keyword_tags,
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

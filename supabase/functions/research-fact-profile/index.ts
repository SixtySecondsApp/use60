import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { executeGeminiSearch } from '../_shared/geminiSearch.ts'
import { executeExaSearch } from '../_shared/exaSearch.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResearchRequest {
  action: 'research' | 'status' | 'retry'
  fact_profile_id?: string
  profileId?: string
  domain?: string
}
type ResearchProvider = 'gemini' | 'exa' | 'disabled'

interface FactProfileResearchData {
  company_overview: {
    name: string
    tagline: string
    description: string
    founded_year: number | null
    headquarters: string
    company_type: string
    website: string
  }
  market_position: {
    industry: string
    sub_industries: string[]
    target_market: string
    market_size: string
    differentiators: string[]
    competitors: string[]
  }
  products_services: {
    products: string[]
    use_cases: string[]
    pricing_model: string
    key_features: string[]
  }
  team_leadership: {
    employee_count: number | null
    employee_range: string
    key_people: Array<{ name: string; title: string; linkedin: string }>
    departments: string[]
    hiring_signals: string[]
  }
  financials: {
    revenue_range: string
    funding_status: string
    funding_rounds: Array<{ round: string; amount: string; date: string }>
    total_raised: string
    investors: string[]
    valuation: string
  }
  technology: {
    tech_stack: string[]
    platforms: string[]
    integrations: string[]
  }
  ideal_customer_indicators: {
    target_industries: string[]
    target_company_sizes: string[]
    target_roles: string[]
    buying_signals: string[]
    pain_points: string[]
    value_propositions: string[]
  }
  recent_activity: {
    news: Array<{ title: string; url: string; date: string }>
    awards: string[]
    milestones: string[]
    reviews_summary: Record<string, unknown>
  }
}

const EMPTY_RESEARCH_DATA: FactProfileResearchData = {
  company_overview: {
    name: '',
    tagline: '',
    description: '',
    founded_year: null,
    headquarters: '',
    company_type: '',
    website: '',
  },
  market_position: {
    industry: '',
    sub_industries: [],
    target_market: '',
    market_size: '',
    differentiators: [],
    competitors: [],
  },
  products_services: {
    products: [],
    use_cases: [],
    pricing_model: '',
    key_features: [],
  },
  team_leadership: {
    employee_count: null,
    employee_range: '',
    key_people: [],
    departments: [],
    hiring_signals: [],
  },
  financials: {
    revenue_range: '',
    funding_status: '',
    funding_rounds: [],
    total_raised: '',
    investors: [],
    valuation: '',
  },
  technology: {
    tech_stack: [],
    platforms: [],
    integrations: [],
  },
  ideal_customer_indicators: {
    target_industries: [],
    target_company_sizes: [],
    target_roles: [],
    buying_signals: [],
    pain_points: [],
    value_propositions: [],
  },
  recent_activity: {
    news: [],
    awards: [],
    milestones: [],
    reviews_summary: {},
  },
}

// ---------------------------------------------------------------------------
// Org context sync helper
// ---------------------------------------------------------------------------

async function syncResearchToOrgContext(
  serviceClient: ReturnType<typeof createClient>,
  orgId: string,
  researchData: FactProfileResearchData
): Promise<{ synced: number }> {
  const updates: Array<{ key: string; value: unknown }> = []

  // company_overview
  const co = researchData.company_overview
  if (co.name) updates.push({ key: 'company_name', value: co.name })
  if (co.tagline) updates.push({ key: 'tagline', value: co.tagline })
  if (co.description) updates.push({ key: 'description', value: co.description })
  if (co.headquarters) updates.push({ key: 'headquarters', value: co.headquarters })
  if (co.website) updates.push({ key: 'website', value: co.website })
  if (co.company_type) updates.push({ key: 'company_type', value: co.company_type })

  // market_position
  const mp = researchData.market_position
  if (mp.industry) updates.push({ key: 'industry', value: mp.industry })
  if (mp.target_market) updates.push({ key: 'target_market', value: mp.target_market })
  if (mp.competitors?.length) updates.push({ key: 'competitors', value: mp.competitors })
  if (mp.differentiators?.length) updates.push({ key: 'differentiators', value: mp.differentiators })

  // products_services
  const ps = researchData.products_services
  if (ps.products?.length) updates.push({ key: 'products', value: ps.products })
  if (ps.key_features?.length) updates.push({ key: 'key_features', value: ps.key_features })
  if (ps.use_cases?.length) updates.push({ key: 'use_cases', value: ps.use_cases })
  if (ps.pricing_model) updates.push({ key: 'pricing_model', value: ps.pricing_model })

  // team_leadership
  const tl = researchData.team_leadership
  if (tl.key_people?.length) updates.push({ key: 'key_people', value: tl.key_people })
  if (tl.employee_count) updates.push({ key: 'employee_count', value: tl.employee_count })
  if (tl.employee_range) updates.push({ key: 'employee_range', value: tl.employee_range })

  // financials
  const fi = researchData.financials
  if (fi.revenue_range) updates.push({ key: 'revenue_range', value: fi.revenue_range })
  if (fi.funding_status) updates.push({ key: 'funding_status', value: fi.funding_status })
  if (fi.total_raised) updates.push({ key: 'total_raised', value: fi.total_raised })
  if (fi.investors?.length) updates.push({ key: 'investors', value: fi.investors })

  // technology
  const te = researchData.technology
  if (te.tech_stack?.length) updates.push({ key: 'tech_stack', value: te.tech_stack })
  if (te.platforms?.length) updates.push({ key: 'platforms', value: te.platforms })
  if (te.integrations?.length) updates.push({ key: 'integrations', value: te.integrations })

  // ideal_customer_indicators
  const ic = researchData.ideal_customer_indicators
  if (ic.target_industries?.length) updates.push({ key: 'target_industries', value: ic.target_industries })
  if (ic.target_roles?.length) updates.push({ key: 'target_roles', value: ic.target_roles })
  if (ic.pain_points?.length) updates.push({ key: 'pain_points', value: ic.pain_points })
  if (ic.value_propositions?.length) updates.push({ key: 'value_propositions', value: ic.value_propositions })
  if (ic.buying_signals?.length) updates.push({ key: 'buying_signals', value: ic.buying_signals })

  let synced = 0
  for (const update of updates) {
    const { error } = await serviceClient.rpc('upsert_organization_context', {
      p_org_id: orgId,
      p_key: update.key,
      p_value: JSON.stringify(update.value),
      p_source: 'fact_profile_research',
      p_confidence: 0.85,
    })
    if (!error) {
      synced++
    } else {
      console.warn(`[research-fact-profile] Failed to sync context key "${update.key}":`, error.message)
    }
  }

  return { synced }
}

async function syncResearchToOrgEnrichment(
  serviceClient: ReturnType<typeof createClient>,
  orgId: string,
  rd: FactProfileResearchData
): Promise<void> {
  const ov = rd.company_overview
  const mp = rd.market_position
  const ps = rd.products_services
  const tl = rd.team_leadership
  const fi = rd.financials
  const te = rd.technology
  const ic = rd.ideal_customer_indicators
  const ra = rd.recent_activity

  const fields: Record<string, unknown> = {
    organization_id: orgId,
    status: 'completed',
  }

  if (ov.name) fields.company_name = ov.name
  if (ov.tagline) fields.tagline = ov.tagline
  if (ov.description) fields.description = ov.description
  if (ov.headquarters) fields.headquarters = ov.headquarters
  if (ov.founded_year) fields.founded_year = ov.founded_year
  if (ov.website) fields.domain = ov.website
  if (mp.industry) fields.industry = mp.industry
  if (mp.target_market) fields.target_market = mp.target_market
  if (tl.employee_range) fields.employee_count = tl.employee_range
  if (ps.products?.length) fields.products = ps.products.map((p: string) => ({ name: p, description: '' }))
  if (ps.use_cases?.length) fields.use_cases = ps.use_cases
  if (ic.value_propositions?.length) fields.value_propositions = ic.value_propositions
  if (ic.pain_points?.length) fields.pain_points = ic.pain_points
  if (ic.buying_signals?.length) fields.buying_signals = ic.buying_signals
  if (mp.competitors?.length) fields.competitors = mp.competitors.map((c: string) => ({ name: c }))
  if (te.tech_stack?.length) fields.tech_stack = te.tech_stack
  if (tl.key_people?.length) fields.key_people = tl.key_people.map((p) => ({ name: p.name, title: p.title }))
  if (fi.funding_status) fields.funding_stage = fi.funding_status
  if (ic.target_industries?.length || ic.target_roles?.length || ic.pain_points?.length) {
    fields.ideal_customer_profile = {
      target_industries: ic.target_industries || [],
      target_company_sizes: ic.target_company_sizes || [],
      target_roles: ic.target_roles || [],
      pain_points: ic.pain_points || [],
      value_propositions: ic.value_propositions || [],
      buying_signals: ic.buying_signals || [],
    }
  }
  if (ra.news?.length) fields.recent_news = ra.news

  const { error } = await serviceClient
    .from('organization_enrichment')
    .upsert(fields, { onConflict: 'organization_id' })

  if (error) {
    console.warn('[research-fact-profile] Enrichment upsert failed:', error.message)
  }
}

function parseResearchProvider(rawValue: unknown): ResearchProvider {
  if (typeof rawValue !== 'string') return 'disabled'
  if (rawValue === 'gemini' || rawValue === 'exa' || rawValue === 'disabled') {
    return rawValue
  }
  return 'disabled'
}

function parseYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function mapProviderResultToFactProfileData(
  researchData: Record<string, unknown>,
  fallbackCompanyName: string,
  domain?: string
): FactProfileResearchData {
  const leadershipTeam = Array.isArray(researchData.leadership_team)
    ? researchData.leadership_team as Array<Record<string, unknown>>
    : []
  const productsServices = Array.isArray(researchData.products_services)
    ? researchData.products_services as string[]
    : []
  const competitors = Array.isArray(researchData.key_competitors)
    ? researchData.key_competitors as string[]
    : []
  const newsItemsRaw = Array.isArray(researchData.recent_news)
    ? researchData.recent_news as string[]
    : []
  const industries = new Set<string>()
  if (typeof researchData.industry === 'string' && researchData.industry.trim()) {
    industries.add(researchData.industry.trim())
  }

  const website = typeof researchData.website_url === 'string' && researchData.website_url.trim()
    ? researchData.website_url.trim()
    : (domain ? (domain.startsWith('http') ? domain : `https://${domain}`) : '')

  return {
    ...EMPTY_RESEARCH_DATA,
    company_overview: {
      ...EMPTY_RESEARCH_DATA.company_overview,
      name: (typeof researchData.company_name === 'string' && researchData.company_name.trim())
        ? researchData.company_name.trim()
        : fallbackCompanyName,
      description: typeof researchData.description === 'string' ? researchData.description : '',
      founded_year: parseYear(researchData.founded_year),
      headquarters: typeof researchData.headquarters_location === 'string' ? researchData.headquarters_location : '',
      website,
    },
    market_position: {
      ...EMPTY_RESEARCH_DATA.market_position,
      industry: typeof researchData.industry === 'string' ? researchData.industry : '',
      target_market: Array.isArray(researchData.customer_segments)
        ? (researchData.customer_segments as string[]).join(', ')
        : '',
      differentiators: Array.isArray(researchData.competitive_differentiators)
        ? researchData.competitive_differentiators as string[]
        : [],
      competitors,
    },
    products_services: {
      ...EMPTY_RESEARCH_DATA.products_services,
      products: productsServices,
      key_features: productsServices,
    },
    team_leadership: {
      ...EMPTY_RESEARCH_DATA.team_leadership,
      employee_range: typeof researchData.employee_count_range === 'string'
        ? researchData.employee_count_range
        : '',
      key_people: leadershipTeam.map((person) => ({
        name: typeof person.name === 'string' ? person.name : '',
        title: typeof person.title === 'string' ? person.title : '',
        linkedin: '',
      })).filter((person) => !!person.name),
    },
    financials: {
      ...EMPTY_RESEARCH_DATA.financials,
      funding_status: typeof researchData.funding_stage === 'string' ? researchData.funding_stage : '',
      total_raised: typeof researchData.funding_total === 'string' ? researchData.funding_total : '',
      investors: Array.isArray(researchData.key_investors) ? researchData.key_investors as string[] : [],
      funding_rounds:
        (typeof researchData.funding_total === 'string' && researchData.funding_total.trim())
          ? [{
              round: typeof researchData.funding_stage === 'string' ? researchData.funding_stage : '',
              amount: researchData.funding_total,
              date: '',
            }]
          : [],
    },
    technology: {
      ...EMPTY_RESEARCH_DATA.technology,
      tech_stack: Array.isArray(researchData.tech_stack) ? researchData.tech_stack as string[] : [],
    },
    ideal_customer_indicators: {
      ...EMPTY_RESEARCH_DATA.ideal_customer_indicators,
      target_industries: Array.from(industries),
      target_company_sizes: typeof researchData.employee_count_range === 'string'
        ? [researchData.employee_count_range]
        : [],
      buying_signals: newsItemsRaw.slice(0, 5),
      value_propositions: Array.isArray(researchData.competitive_differentiators)
        ? researchData.competitive_differentiators as string[]
        : [],
    },
    recent_activity: {
      ...EMPTY_RESEARCH_DATA.recent_activity,
      news: newsItemsRaw.map((item) => ({
        title: item,
        url: '',
        date: '',
      })),
      reviews_summary: typeof researchData.glassdoor_rating === 'number'
        ? { glassdoor_rating: researchData.glassdoor_rating }
        : {},
    },
  }
}

// ---------------------------------------------------------------------------
// Gemini configuration
// ---------------------------------------------------------------------------

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

// ---------------------------------------------------------------------------
// Website scraping helper
// ---------------------------------------------------------------------------

async function scrapeWebsite(domain: string): Promise<string> {
  try {
    const url = domain.startsWith('http') ? domain : `https://${domain}`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 60Bot/1.0)' },
      redirect: 'follow',
    })
    if (!response.ok) return ''
    const html = await response.text()
    // Strip HTML tags, keep text content
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15000) // Limit context
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Gemini research call
// ---------------------------------------------------------------------------

async function analyzeCompany(companyIdentifier: string, scrapedContent: string): Promise<FactProfileResearchData> {
  const prompt = `You are a business intelligence analyst. Analyze the following company based on the provided identifier and content.

Company identifier: ${companyIdentifier}

Website content:
${scrapedContent}

Return a JSON object with these exact sections:
{
  "company_overview": { "name": "", "tagline": "", "description": "", "founded_year": null, "headquarters": "", "company_type": "", "website": "" },
  "market_position": { "industry": "", "sub_industries": [], "target_market": "", "market_size": "", "differentiators": [], "competitors": [] },
  "products_services": { "products": [], "use_cases": [], "pricing_model": "", "key_features": [] },
  "team_leadership": { "employee_count": null, "employee_range": "", "key_people": [], "departments": [], "hiring_signals": [] },
  "financials": { "revenue_range": "", "funding_status": "", "funding_rounds": [{"round":"","amount":"","date":""}], "total_raised": "", "investors": [], "valuation": "" },
  "technology": { "tech_stack": [], "platforms": [], "integrations": [] },
  "ideal_customer_indicators": { "target_industries": [], "target_company_sizes": [], "target_roles": [], "buying_signals": [], "pain_points": [], "value_propositions": [] },
  "recent_activity": { "news": [{"title":"","url":"","date":""}], "awards": [], "milestones": [], "reviews_summary": {} }
}

Fill in as much data as you can. Use empty strings/arrays for unknown fields. For key_people, include name, title, and linkedin if known. Be factual and concise.`

  const geminiResponse = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  })

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text()
    throw new Error(`Gemini API error (${geminiResponse.status}): ${errorText}`)
  }

  const geminiData = await geminiResponse.json()
  const textContent = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!textContent) {
    throw new Error('No content in Gemini response')
  }

  // Gemini occasionally wraps JSON in markdown code fences.
  const cleanContent = textContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(cleanContent) as Partial<FactProfileResearchData>

  // Defensively normalize AI output into the expected schema.
  return {
    ...EMPTY_RESEARCH_DATA,
    ...parsed,
    company_overview: {
      ...EMPTY_RESEARCH_DATA.company_overview,
      ...(parsed.company_overview ?? {}),
    },
    market_position: {
      ...EMPTY_RESEARCH_DATA.market_position,
      ...(parsed.market_position ?? {}),
    },
    products_services: {
      ...EMPTY_RESEARCH_DATA.products_services,
      ...(parsed.products_services ?? {}),
    },
    team_leadership: {
      ...EMPTY_RESEARCH_DATA.team_leadership,
      ...(parsed.team_leadership ?? {}),
      key_people: Array.isArray(parsed.team_leadership?.key_people)
        ? parsed.team_leadership?.key_people ?? []
        : [],
    },
    financials: {
      ...EMPTY_RESEARCH_DATA.financials,
      ...(parsed.financials ?? {}),
      funding_rounds: Array.isArray(parsed.financials?.funding_rounds)
        ? parsed.financials?.funding_rounds ?? []
        : [],
    },
    technology: {
      ...EMPTY_RESEARCH_DATA.technology,
      ...(parsed.technology ?? {}),
    },
    ideal_customer_indicators: {
      ...EMPTY_RESEARCH_DATA.ideal_customer_indicators,
      ...(parsed.ideal_customer_indicators ?? {}),
    },
    recent_activity: {
      ...EMPTY_RESEARCH_DATA.recent_activity,
      ...(parsed.recent_activity ?? {}),
      news: Array.isArray(parsed.recent_activity?.news)
        ? parsed.recent_activity?.news ?? []
        : [],
    },
  }
}

// ---------------------------------------------------------------------------
// Edge function
// ---------------------------------------------------------------------------

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const cors = getCorsHeaders(req)
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const isStagingOrDevProject =
      supabaseUrl.includes('caerqjzvuerejfrdtygb') || // staging
      supabaseUrl.includes('wbgmnyekgqklggilgqag') // development
    const allowUnauthedInNonProd =
      Deno.env.get('ALLOW_UNAUTH_FACT_PROFILE_RESEARCH') === 'true' || isStagingOrDevProject

    // ------------------------------------------------------------------
    // 1. Auth: validate JWT (or allow fallback in staging/dev)
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')

    const anonClient = authHeader
      ? createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      )
      : null

    // ------------------------------------------------------------------
    // 2. Service role client for writes / fallback reads
    // ------------------------------------------------------------------
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let orgId: string | null = null
    if (anonClient) {
      const { data: { user }, error: authError } = await anonClient.auth.getUser()
      if (authError || !user) {
        if (!allowUnauthedInNonProd) {
          return json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
        }
        // In staging/dev, continue without auth and infer org from profile.
        console.warn('[research-fact-profile] Auth invalid in non-prod, falling back to unauth mode:', authError?.message)
      } else {
        // ------------------------------------------------------------------
        // 2. Org: look up user's organization
        // ------------------------------------------------------------------
        const { data: membership } = await anonClient
          .from('organization_memberships')
          .select('org_id, role')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()

        if (!membership) {
          if (!allowUnauthedInNonProd) {
            return json({ error: 'Not a member of any organization', code: 'NO_ORG' }, 403)
          }
          console.warn('[research-fact-profile] No membership in non-prod, falling back to profile org resolution')
        } else {
          orgId = membership.org_id
        }
      }
    } else if (!allowUnauthedInNonProd) {
      return json({ error: 'Missing authorization', code: 'UNAUTHORIZED' }, 401)
    }

    // ------------------------------------------------------------------
    // 3. Parse request body
    // ------------------------------------------------------------------
    const body = (await req.json()) as ResearchRequest
    const { action, domain } = body
    const factProfileId = body.fact_profile_id ?? body.profileId

    if (!action || !['research', 'status', 'retry'].includes(action)) {
      return json({ error: 'Invalid action. Must be "research", "status", or "retry".', code: 'INVALID_PARAMS' }, 400)
    }

    if (!factProfileId) {
      return json({ error: 'profileId (or fact_profile_id) is required.', code: 'INVALID_PARAMS' }, 400)
    }

    // In staging/dev fallback mode, infer org from the profile itself.
    if (!orgId) {
      const { data: profileForOrg } = await serviceClient
        .from('client_fact_profiles')
        .select('organization_id')
        .eq('id', factProfileId)
        .maybeSingle()
      if (!profileForOrg?.organization_id) {
        return json({ error: 'Fact profile not found', code: 'NOT_FOUND' }, 404)
      }
      orgId = profileForOrg.organization_id
    }

    // ------------------------------------------------------------------
    // 5. Handle actions
    // ------------------------------------------------------------------

    // === STATUS ===
    if (action === 'status') {
      const readClient = anonClient ?? serviceClient
      const { data: profile, error: profileError } = await readClient
        .from('client_fact_profiles')
        .select('id, research_status, research_data, research_sources, updated_at')
        .eq('id', factProfileId)
        .eq('organization_id', orgId)
        .maybeSingle()

      if (profileError) {
        console.error('[research-fact-profile] Status query error:', profileError)
        return json({ error: 'Failed to fetch profile status', code: 'QUERY_ERROR' }, 500)
      }

      if (!profile) {
        return json({ error: 'Fact profile not found', code: 'NOT_FOUND' }, 404)
      }

      return json({
        fact_profile_id: profile.id,
        research_status: profile.research_status,
        research_data: profile.research_data,
        research_sources: profile.research_sources,
        updated_at: profile.updated_at,
      })
    }

    // === RESEARCH / RETRY ===
    if (action === 'research' || action === 'retry') {
      let researchDomain = domain
      let companyName: string | null = null

      // Always fetch the profile to verify ownership and collect identifiers.
      const readClient = anonClient ?? serviceClient
      const { data: existingProfile } = await readClient
        .from('client_fact_profiles')
        .select('id, company_name, company_domain, research_status, is_org_profile')
        .eq('id', factProfileId)
        .eq('organization_id', orgId)
        .maybeSingle()

      if (!existingProfile) {
        return json({ error: 'Fact profile not found', code: 'NOT_FOUND' }, 404)
      }

      const isOrgProfile = existingProfile.is_org_profile === true
      companyName = existingProfile.company_name
      researchDomain = researchDomain ?? existingProfile.company_domain

      // Update status to researching
      const { error: updateStartError } = await serviceClient
        .from('client_fact_profiles')
        .update({ research_status: 'researching' })
        .eq('id', factProfileId)
        .eq('organization_id', orgId)

      if (updateStartError) {
        console.error('[research-fact-profile] Failed to update status to researching:', updateStartError)
        return json({ error: 'Failed to start research', code: 'UPDATE_ERROR' }, 500)
      }

      try {
        // Use configured provider first for higher quality research when available.
        const { data: settingData } = await anonClient
          .from('app_settings')
          .select('value')
          .eq('key', 'research_provider')
          .maybeSingle()
        const providerRaw = settingData?.value ? JSON.parse(settingData.value) : 'disabled'
        const provider = parseResearchProvider(providerRaw)

        // Scrape only when a domain is known; otherwise rely on model/prior knowledge.
        const scrapedContent = researchDomain ? await scrapeWebsite(researchDomain) : ''
        const researchIdentifier = researchDomain || companyName || factProfileId

        let researchData: FactProfileResearchData | null = null
        let researchMode = 'gemini_direct'
        const providerSources: Array<{ title?: string; uri?: string }> = []

        if (researchDomain && provider === 'gemini') {
          const geminiResults = await executeGeminiSearch(researchDomain)
          if (geminiResults.result) {
            researchData = mapProviderResultToFactProfileData(
              geminiResults.result as unknown as Record<string, unknown>,
              companyName || researchIdentifier,
              researchDomain
            )
            researchMode = 'gemini_search'
            if (Array.isArray(geminiResults.sources)) {
              providerSources.push(...geminiResults.sources)
            }
          } else {
            console.warn('[research-fact-profile] Gemini provider failed, falling back to direct extraction:', geminiResults.error)
          }
        }

        if (researchDomain && provider === 'exa' && !researchData) {
          const exaResults = await executeExaSearch(researchDomain)
          if (exaResults.result) {
            researchData = mapProviderResultToFactProfileData(
              exaResults.result as unknown as Record<string, unknown>,
              companyName || researchIdentifier,
              researchDomain
            )
            researchMode = 'exa_search'
          } else {
            console.warn('[research-fact-profile] Exa provider failed, falling back to direct extraction:', exaResults.error)
          }
        }

        if (!researchData) {
          // Fallback: analyze with direct Gemini prompt (+ scraped content if available).
          researchData = await analyzeCompany(researchIdentifier, scrapedContent)
          researchMode = 'gemini_direct'
        }

        // Build research sources
        const researchSources: Array<{ url: string; title: string; confidence: number; section: string }> = []
        for (const source of providerSources) {
          if (!source?.uri) continue
          researchSources.push({
            url: source.uri,
            title: source.title || 'Search source',
            confidence: 0.8,
            section: 'all',
          })
        }
        if (scrapedContent) {
          const websiteUrl = researchDomain!.startsWith('http') ? researchDomain! : `https://${researchDomain!}`
          researchSources.push({
            url: websiteUrl,
            title: 'Company website',
            confidence: 0.9,
            section: 'all',
          })
        }
        researchSources.push({
          url: researchMode === 'exa_search'
            ? 'https://exa.ai'
            : 'https://ai.google.dev/gemini-api/docs/models',
          title: researchMode === 'exa_search'
            ? 'Exa semantic search + Gemini extraction'
            : researchMode === 'gemini_search'
              ? 'Gemini search grounding'
              : 'Gemini 2.0 Flash analysis',
          confidence: researchMode === 'gemini_direct' ? 0.7 : 0.8,
          section: 'all',
        })

        // Update profile with research results
        const { error: updateCompleteError } = await serviceClient
          .from('client_fact_profiles')
          .update({
            research_data: researchData,
            research_status: 'complete',
            research_sources: researchSources,
          })
          .eq('id', factProfileId)
          .eq('organization_id', orgId)

        if (updateCompleteError) {
          console.error('[research-fact-profile] Failed to update with research results:', updateCompleteError)
          // Try to set failed status
          await serviceClient
            .from('client_fact_profiles')
            .update({ research_status: 'failed' })
            .eq('id', factProfileId)
            .eq('organization_id', orgId)

          return json({ error: 'Failed to save research results', code: 'UPDATE_ERROR' }, 500)
        }

        // -------------------------------------------------------------------
        // Org profile sync: push research data to organization_context
        // and trigger skill recompilation
        // -------------------------------------------------------------------
        if (isOrgProfile && orgId) {
          try {
            // Sync to both organization_enrichment and organization_context
            await syncResearchToOrgEnrichment(serviceClient, orgId, researchData)
            const syncResult = await syncResearchToOrgContext(serviceClient, orgId, researchData)
            console.log(`[research-fact-profile] Synced enrichment + ${syncResult.synced} context keys for org ${orgId}`)

            // Trigger skill recompilation so skills pick up the new context
            try {
              await serviceClient.functions.invoke('compile-organization-skills', {
                body: { action: 'compile_all', organization_id: orgId },
              })
              console.log(`[research-fact-profile] Triggered skill recompilation for org ${orgId}`)
            } catch (compileError) {
              console.warn('[research-fact-profile] Skill recompilation failed (non-fatal):', (compileError as Error).message)
            }
          } catch (syncError) {
            console.warn('[research-fact-profile] Org context sync failed (non-fatal):', (syncError as Error).message)
          }
        }

        return json({
          fact_profile_id: factProfileId,
          research_status: 'complete',
          research_data: researchData,
          research_sources: researchSources,
        })
      } catch (researchError) {
        console.error('[research-fact-profile] Research pipeline error:', researchError)

        // Set status to failed
        await serviceClient
          .from('client_fact_profiles')
          .update({ research_status: 'failed' })
          .eq('id', factProfileId)
          .eq('organization_id', orgId)

        return json({
          error: `Research failed: ${(researchError as Error).message}`,
          code: 'RESEARCH_ERROR',
          fact_profile_id: factProfileId,
          research_status: 'failed',
        }, 500)
      }
    }

    // Fallthrough (should not happen due to earlier validation)
    return json({ error: 'Unhandled action', code: 'INTERNAL_ERROR' }, 500)
  } catch (error) {
    console.error('[research-fact-profile] Unexpected error:', error)
    return json({
      error: (error as Error).message || 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, 500)
  }
})

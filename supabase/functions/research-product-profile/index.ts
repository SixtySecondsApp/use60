import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { checkCreditBalance, logAICostEvent } from '../_shared/costTracking.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResearchRequest {
  action: 'research' | 'status' | 'retry'
  product_profile_id: string
  organization_id?: string
}

interface ProductProfileResearchData {
  overview: {
    name: string
    tagline: string
    description: string
    category: string
    website: string
    launch_year: number | null
  }
  target_market: {
    industries: string[]
    company_sizes: string[]
    roles: string[]
    geographies: string[]
  }
  value_propositions: string[]
  pricing: {
    model: string
    tiers: Array<{ name: string; price: string; features: string[] }>
    free_trial: boolean
    enterprise_available: boolean
  }
  competitors: Array<{
    name: string
    website: string
    differentiator: string
  }>
  use_cases: Array<{
    title: string
    description: string
    industry: string
  }>
  differentiators: string[]
  pain_points_solved: string[]
  key_features: Array<{
    name: string
    description: string
    category: string
  }>
  integrations: Array<{
    name: string
    category: string
    description: string
  }>
}

const EMPTY_RESEARCH_DATA: ProductProfileResearchData = {
  overview: {
    name: '',
    tagline: '',
    description: '',
    category: '',
    website: '',
    launch_year: null,
  },
  target_market: {
    industries: [],
    company_sizes: [],
    roles: [],
    geographies: [],
  },
  value_propositions: [],
  pricing: {
    model: '',
    tiers: [],
    free_trial: false,
    enterprise_available: false,
  },
  competitors: [],
  use_cases: [],
  differentiators: [],
  pain_points_solved: [],
  key_features: [],
  integrations: [],
}

const LOG_PREFIX = '[research-product-profile]'
const GEMINI_MODEL = 'gemini-2.0-flash'

// ---------------------------------------------------------------------------
// Website scraping helper
// ---------------------------------------------------------------------------

async function scrapeWebsite(url: string): Promise<string> {
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`
    const response = await fetch(fullUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 60Bot/1.0)' },
      redirect: 'follow',
    })
    if (!response.ok) return ''
    const html = await response.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15000)
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Gemini product research call
// ---------------------------------------------------------------------------

async function analyzeProduct(
  productName: string,
  companyContext: string,
  scrapedContent: string,
  geminiApiKey: string
): Promise<ProductProfileResearchData> {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`

  const prompt = `You are a product intelligence analyst. Analyze the following product based on the provided information.

Product name: ${productName}
${companyContext}

${scrapedContent ? `Product/company website content:\n${scrapedContent}` : ''}

Return a JSON object with these exact 10 sections:
{
  "overview": {
    "name": "",
    "tagline": "One-line product description",
    "description": "2-3 sentence product description",
    "category": "SaaS|Service|Platform|Hardware|Consulting|Other",
    "website": "",
    "launch_year": null
  },
  "target_market": {
    "industries": ["industry1", "industry2"],
    "company_sizes": ["SMB", "Mid-Market", "Enterprise"],
    "roles": ["target buyer role 1", "target user role 2"],
    "geographies": ["region1"]
  },
  "value_propositions": ["value prop 1", "value prop 2", "value prop 3"],
  "pricing": {
    "model": "subscription|usage-based|one-time|freemium|custom",
    "tiers": [{"name": "Tier name", "price": "$X/mo", "features": ["feature1"]}],
    "free_trial": false,
    "enterprise_available": false
  },
  "competitors": [{"name": "Competitor", "website": "url", "differentiator": "how this product differs"}],
  "use_cases": [{"title": "Use case name", "description": "Brief description", "industry": "relevant industry"}],
  "differentiators": ["what makes this product unique 1", "unique advantage 2"],
  "pain_points_solved": ["pain point 1 this product addresses", "pain point 2"],
  "key_features": [{"name": "Feature name", "description": "What it does", "category": "category"}],
  "integrations": [{"name": "Integration name", "category": "CRM|Analytics|Communication|etc", "description": "What it does"}]
}

Fill in as much data as you can from available information. Use empty strings/arrays for unknown fields. Be factual and concise. Focus on actionable sales intelligence.`

  const geminiResponse = await fetch(geminiUrl, {
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

  const cleanContent = textContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(cleanContent) as Partial<ProductProfileResearchData>

  // Defensively normalize AI output into the expected schema
  return {
    ...EMPTY_RESEARCH_DATA,
    ...parsed,
    overview: {
      ...EMPTY_RESEARCH_DATA.overview,
      ...(parsed.overview ?? {}),
    },
    target_market: {
      ...EMPTY_RESEARCH_DATA.target_market,
      ...(parsed.target_market ?? {}),
    },
    value_propositions: Array.isArray(parsed.value_propositions)
      ? parsed.value_propositions
      : EMPTY_RESEARCH_DATA.value_propositions,
    pricing: {
      ...EMPTY_RESEARCH_DATA.pricing,
      ...(parsed.pricing ?? {}),
      tiers: Array.isArray(parsed.pricing?.tiers)
        ? parsed.pricing.tiers
        : [],
    },
    competitors: Array.isArray(parsed.competitors)
      ? parsed.competitors
      : EMPTY_RESEARCH_DATA.competitors,
    use_cases: Array.isArray(parsed.use_cases)
      ? parsed.use_cases
      : EMPTY_RESEARCH_DATA.use_cases,
    differentiators: Array.isArray(parsed.differentiators)
      ? parsed.differentiators
      : EMPTY_RESEARCH_DATA.differentiators,
    pain_points_solved: Array.isArray(parsed.pain_points_solved)
      ? parsed.pain_points_solved
      : EMPTY_RESEARCH_DATA.pain_points_solved,
    key_features: Array.isArray(parsed.key_features)
      ? parsed.key_features
      : EMPTY_RESEARCH_DATA.key_features,
    integrations: Array.isArray(parsed.integrations)
      ? parsed.integrations
      : EMPTY_RESEARCH_DATA.integrations,
  }
}

// ---------------------------------------------------------------------------
// Edge function
// ---------------------------------------------------------------------------

serve(async (req) => {
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
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') ?? ''
    const isStagingOrDevProject =
      supabaseUrl.includes('caerqjzvuerejfrdtygb') ||
      supabaseUrl.includes('wbgmnyekgqklggilgqag')
    const allowUnauthedInNonProd =
      Deno.env.get('ALLOW_UNAUTH_PRODUCT_PROFILE_RESEARCH') === 'true' || isStagingOrDevProject

    // ------------------------------------------------------------------
    // 1. Auth: validate JWT (or allow fallback in staging/dev)
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')

    const anonClient = authHeader
      ? createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      )
      : null

    // ------------------------------------------------------------------
    // 2. Service role client for writes / fallback reads
    // ------------------------------------------------------------------
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let orgId: string | null = null
    let authedUserId: string | null = null
    if (anonClient) {
      const { data: { user }, error: authError } = await anonClient.auth.getUser()
      if (authError || !user) {
        if (!allowUnauthedInNonProd) {
          return json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
        }
        console.warn(`${LOG_PREFIX} Auth invalid in non-prod, falling back to unauth mode:`, authError?.message)
      } else {
        authedUserId = user.id
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
          console.warn(`${LOG_PREFIX} No membership in non-prod, falling back to profile org resolution`)
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
    const { action, product_profile_id } = body

    if (!action || !['research', 'status', 'retry'].includes(action)) {
      return json({ error: 'Invalid action. Must be "research", "status", or "retry".', code: 'INVALID_PARAMS' }, 400)
    }

    if (!product_profile_id) {
      return json({ error: 'product_profile_id is required.', code: 'INVALID_PARAMS' }, 400)
    }

    // In staging/dev fallback mode, infer org from the profile itself
    if (!orgId) {
      const { data: profileForOrg } = await serviceClient
        .from('product_profiles')
        .select('organization_id')
        .eq('id', product_profile_id)
        .maybeSingle()
      if (!profileForOrg?.organization_id) {
        return json({ error: 'Product profile not found', code: 'NOT_FOUND' }, 404)
      }
      orgId = profileForOrg.organization_id
    }

    // ------------------------------------------------------------------
    // 4. Handle actions
    // ------------------------------------------------------------------

    // === STATUS ===
    if (action === 'status') {
      const readClient = anonClient ?? serviceClient
      const { data: profile, error: profileError } = await readClient
        .from('product_profiles')
        .select('id, research_status, research_data, research_sources, updated_at')
        .eq('id', product_profile_id)
        .eq('organization_id', orgId)
        .maybeSingle()

      if (profileError) {
        console.error(`${LOG_PREFIX} Status query error:`, profileError)
        return json({ error: 'Failed to fetch profile status', code: 'QUERY_ERROR' }, 500)
      }

      if (!profile) {
        return json({ error: 'Product profile not found', code: 'NOT_FOUND' }, 404)
      }

      return json({
        product_profile_id: profile.id,
        research_status: profile.research_status,
        research_data: profile.research_data,
        research_sources: profile.research_sources,
        updated_at: profile.updated_at,
      })
    }

    // === RESEARCH / RETRY ===
    if (action === 'research' || action === 'retry') {
      if (!geminiApiKey) {
        return json({ error: 'Gemini API key is not configured', code: 'CONFIG_ERROR' }, 500)
      }

      // Fetch the product profile
      const readClient = anonClient ?? serviceClient
      const { data: existingProfile } = await readClient
        .from('product_profiles')
        .select('id, name, description, product_url, fact_profile_id, research_status')
        .eq('id', product_profile_id)
        .eq('organization_id', orgId)
        .maybeSingle()

      if (!existingProfile) {
        return json({ error: 'Product profile not found', code: 'NOT_FOUND' }, 404)
      }

      // Fetch parent fact profile for company context (if linked)
      let companyContext = ''
      if (existingProfile.fact_profile_id) {
        const { data: factProfile } = await readClient
          .from('client_fact_profiles')
          .select('company_name, company_domain, research_data')
          .eq('id', existingProfile.fact_profile_id)
          .maybeSingle()

        if (factProfile) {
          const parts: string[] = []
          if (factProfile.company_name) parts.push(`Company: ${factProfile.company_name}`)
          if (factProfile.company_domain) parts.push(`Domain: ${factProfile.company_domain}`)
          const rd = factProfile.research_data as Record<string, unknown> | null
          if (rd) {
            const overview = rd.company_overview as Record<string, unknown> | undefined
            if (overview?.industry) parts.push(`Industry: ${overview.industry}`)
            if (overview?.description) parts.push(`Company description: ${overview.description}`)
          }
          if (parts.length > 0) {
            companyContext = `Company context:\n${parts.join('\n')}`
          }
        }
      }

      // Update status to researching
      const { error: updateStartError } = await serviceClient
        .from('product_profiles')
        .update({ research_status: 'researching' })
        .eq('id', product_profile_id)
        .eq('organization_id', orgId)

      if (updateStartError) {
        console.error(`${LOG_PREFIX} Failed to update status to researching:`, updateStartError)
        return json({ error: 'Failed to start research', code: 'UPDATE_ERROR' }, 500)
      }

      // Credit balance check before AI research
      if (orgId) {
        const balanceCheck = await checkCreditBalance(serviceClient, orgId)
        if (!balanceCheck.allowed) {
          return json({ error: 'Insufficient credits. Please top up to continue.', code: 'INSUFFICIENT_CREDITS' }, 402)
        }
      }

      try {
        // Scrape product URL if available
        const scrapedContent = existingProfile.product_url
          ? await scrapeWebsite(existingProfile.product_url)
          : ''

        const researchData = await analyzeProduct(
          existingProfile.name,
          companyContext,
          scrapedContent,
          geminiApiKey
        )

        // Build research sources
        const researchSources: Array<{ url: string; title: string; confidence: number; section: string }> = []

        if (scrapedContent && existingProfile.product_url) {
          const productUrl = existingProfile.product_url.startsWith('http')
            ? existingProfile.product_url
            : `https://${existingProfile.product_url}`
          researchSources.push({
            url: productUrl,
            title: 'Product website',
            confidence: 0.9,
            section: 'all',
          })
        }

        researchSources.push({
          url: 'https://ai.google.dev/gemini-api/docs/models',
          title: 'Gemini 2.0 Flash analysis',
          confidence: scrapedContent ? 0.8 : 0.7,
          section: 'all',
        })

        // Update profile with research results
        const { error: updateCompleteError } = await serviceClient
          .from('product_profiles')
          .update({
            research_data: researchData,
            research_status: 'complete',
            research_sources: researchSources,
          })
          .eq('id', product_profile_id)
          .eq('organization_id', orgId)

        if (updateCompleteError) {
          console.error(`${LOG_PREFIX} Failed to update with research results:`, updateCompleteError)
          await serviceClient
            .from('product_profiles')
            .update({ research_status: 'failed' })
            .eq('id', product_profile_id)
            .eq('organization_id', orgId)

          return json({ error: 'Failed to save research results', code: 'UPDATE_ERROR' }, 500)
        }

        console.log(`${LOG_PREFIX} Research complete for product "${existingProfile.name}" (${product_profile_id})`)

        // Log AI cost event
        if (orgId && authedUserId) {
          await logAICostEvent(
            serviceClient, authedUserId, orgId, 'gemini', GEMINI_MODEL,
            0, 0, 'research_enrichment'
          )
        }

        return json({
          product_profile_id,
          research_status: 'complete',
          research_data: researchData,
          research_sources: researchSources,
        })
      } catch (researchError) {
        console.error(`${LOG_PREFIX} Research pipeline error:`, researchError)

        await serviceClient
          .from('product_profiles')
          .update({ research_status: 'failed' })
          .eq('id', product_profile_id)
          .eq('organization_id', orgId)

        return json({
          error: `Research failed: ${(researchError as Error).message}`,
          code: 'RESEARCH_ERROR',
          product_profile_id,
          research_status: 'failed',
        }, 500)
      }
    }

    return json({ error: 'Unhandled action', code: 'INTERNAL_ERROR' }, 500)
  } catch (error) {
    console.error(`${LOG_PREFIX} Unexpected error:`, error)
    return json({
      error: (error as Error).message || 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, 500)
  }
})

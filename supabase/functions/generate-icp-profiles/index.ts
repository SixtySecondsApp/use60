import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Valid Apollo enum values to constrain AI output
const VALID_SENIORITIES = [
  'owner', 'founder', 'c_suite', 'partner', 'vp',
  'head', 'director', 'manager', 'senior', 'entry',
]

const VALID_DEPARTMENTS = [
  'engineering_technical', 'sales', 'marketing', 'finance',
  'operations', 'human_resources', 'support', 'legal',
  'product_management', 'data_science', 'consulting',
  'education', 'media_communications',
]

const VALID_EMPLOYEE_RANGES = [
  '1,10', '11,20', '21,50', '51,100', '101,200',
  '201,500', '501,1000', '1001,5000', '5001,10000', '10001,',
]

const VALID_FUNDING_STAGES = [
  'seed', 'angel', 'venture', 'series_a', 'series_b',
  'series_c', 'series_d', 'series_e', 'ipo', 'private_equity',
]

interface ICPProfile {
  id: string
  name: string
  description: string
  emoji: string
  filters: Record<string, unknown>
  filter_count: number
  rationale: string
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      throw new Error('No organization found')
    }

    const orgId = membership.org_id
    const body = await req.json().catch(() => ({}))
    const forceRegenerate = body?.force_regenerate === true

    // Service client for reading org data
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check cache first (unless force regenerate)
    if (!forceRegenerate) {
      const { data: cached } = await serviceClient
        .from('organization_context')
        .select('value, updated_at')
        .eq('organization_id', orgId)
        .eq('context_key', 'icp_apollo_profiles')
        .maybeSingle()

      if (cached?.value) {
        const updatedAt = new Date(cached.updated_at)
        const ageHours = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60)
        if (ageHours < 24) {
          return new Response(
            JSON.stringify({ profiles: cached.value, cached: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    // Gather org context in parallel
    const [enrichmentResult, orgResult, pastSearchesResult, contextResult] = await Promise.all([
      serviceClient
        .from('organization_enrichment')
        .select('company_name, industry, employee_count, products, value_propositions, competitors, target_market, ideal_customer_profile, pain_points, buying_signals, tech_stack, generated_skills')
        .eq('organization_id', orgId)
        .maybeSingle(),
      serviceClient
        .from('organizations')
        .select('name, company_domain, company_industry, company_size, company_bio')
        .eq('id', orgId)
        .single(),
      serviceClient
        .from('dynamic_tables')
        .select('source_query, name')
        .eq('organization_id', orgId)
        .eq('source_type', 'apollo')
        .order('created_at', { ascending: false })
        .limit(5),
      serviceClient
        .rpc('get_organization_context_object', { p_org_id: orgId })
        .maybeSingle(),
    ])

    const enrichment = enrichmentResult.data
    const org = orgResult.data
    const pastSearches = pastSearchesResult.data || []
    const orgContext = contextResult.data

    // Check if we have enough context to generate profiles
    const hasEnrichment = enrichment && (
      enrichment.target_market ||
      enrichment.ideal_customer_profile ||
      enrichment.products?.length ||
      enrichment.industry
    )
    const hasOrgInfo = org && (org.company_industry || org.company_bio)
    const hasPastSearches = pastSearches.length > 0

    if (!hasEnrichment && !hasOrgInfo && !hasPastSearches) {
      return new Response(
        JSON.stringify({ profiles: [], cached: false, reason: 'no_context' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build context summary for Claude
    const contextParts: string[] = []

    if (org) {
      contextParts.push(`COMPANY: ${org.name || enrichment?.company_name || 'Unknown'}`)
      if (org.company_domain) contextParts.push(`Domain: ${org.company_domain}`)
      if (org.company_industry || enrichment?.industry) contextParts.push(`Industry: ${org.company_industry || enrichment?.industry}`)
      if (org.company_size || enrichment?.employee_count) contextParts.push(`Company size: ${org.company_size || enrichment?.employee_count}`)
      if (org.company_bio) contextParts.push(`About: ${org.company_bio}`)
    }

    if (enrichment) {
      if (enrichment.products?.length) {
        const productList = enrichment.products.map((p: { name: string; description?: string }) =>
          p.description ? `${p.name} (${p.description})` : p.name
        ).join(', ')
        contextParts.push(`Products: ${productList}`)
      }
      if (enrichment.value_propositions?.length) {
        contextParts.push(`Value props: ${enrichment.value_propositions.join(', ')}`)
      }
      if (enrichment.target_market) {
        contextParts.push(`Target market: ${enrichment.target_market}`)
      }
      if (enrichment.ideal_customer_profile) {
        contextParts.push(`ICP: ${JSON.stringify(enrichment.ideal_customer_profile)}`)
      }
      if (enrichment.competitors?.length) {
        const compList = enrichment.competitors.map((c: { name: string }) => c.name).join(', ')
        contextParts.push(`Competitors: ${compList}`)
      }
      if (enrichment.pain_points?.length) {
        contextParts.push(`Pain points they solve: ${enrichment.pain_points.join(', ')}`)
      }
      if (enrichment.buying_signals?.length) {
        contextParts.push(`Buying signals: ${enrichment.buying_signals.join(', ')}`)
      }
      if (enrichment.tech_stack?.length) {
        contextParts.push(`Tech stack: ${enrichment.tech_stack.join(', ')}`)
      }
      // Extract ICP skill config if available
      const skills = enrichment.generated_skills as Record<string, unknown> | null
      if (skills?.icp) {
        const icp = skills.icp as { companyProfile?: string; buyerPersona?: string; buyingSignals?: string[] }
        if (icp.companyProfile) contextParts.push(`Ideal company profile: ${icp.companyProfile}`)
        if (icp.buyerPersona) contextParts.push(`Buyer persona: ${icp.buyerPersona}`)
        if (icp.buyingSignals?.length) contextParts.push(`ICP buying signals: ${icp.buyingSignals.join(', ')}`)
      }
    }

    if (orgContext && typeof orgContext === 'object') {
      const ctx = orgContext as Record<string, unknown>
      if (ctx.icp_summary && typeof ctx.icp_summary === 'string') {
        contextParts.push(`ICP summary: ${ctx.icp_summary}`)
      }
    }

    if (pastSearches.length > 0) {
      const searches = pastSearches
        .filter((s: { source_query: unknown }) => s.source_query)
        .map((s: { name: string; source_query: Record<string, unknown> }) => {
          const q = s.source_query
          const parts: string[] = []
          if (q.person_titles) parts.push(`titles: ${(q.person_titles as string[]).join(', ')}`)
          if (q.person_seniorities) parts.push(`seniority: ${(q.person_seniorities as string[]).join(', ')}`)
          if (q.person_departments) parts.push(`depts: ${(q.person_departments as string[]).join(', ')}`)
          if (q.q_keywords) parts.push(`keywords: ${q.q_keywords}`)
          if (q.organization_num_employees_ranges) parts.push(`size: ${(q.organization_num_employees_ranges as string[]).join(', ')}`)
          return `"${s.name}": ${parts.join(', ')}`
        })
      if (searches.length > 0) {
        contextParts.push(`Past Apollo searches:\n${searches.join('\n')}`)
      }
    }

    const contextSummary = contextParts.join('\n')

    // Call Claude to generate ICP profiles
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const prompt = `You are a sales intelligence expert. Based on the company context below, generate 2-4 distinct ICP (Ideal Customer Profile) profiles for prospecting via Apollo.io.

Each profile should target a DIFFERENT buyer persona that this company would want to sell to. Make them specific and actionable.

COMPANY CONTEXT:
${contextSummary}

IMPORTANT CONSTRAINTS — You MUST only use these exact values for filters:

Seniorities (pick relevant ones): ${VALID_SENIORITIES.join(', ')}
Departments (pick relevant ones): ${VALID_DEPARTMENTS.join(', ')}
Employee ranges (pick relevant ones): ${VALID_EMPLOYEE_RANGES.join(', ')}
Funding stages (pick relevant ones): ${VALID_FUNDING_STAGES.join(', ')}

For person_titles: use specific job titles as free text (e.g. "VP Sales", "Head of Revenue", "CTO")
For person_locations: use geographic locations as free text (e.g. "United States", "San Francisco")
For q_keywords: use industry/technology keywords as free text (e.g. "SaaS", "AI", "DevOps")
For q_organization_domains: use specific company domains (only if targeting specific companies)

Return a JSON array of profiles. Each profile must have:
- id: a short kebab-case slug (e.g. "vp-sales-mid-market")
- name: short human-readable name (e.g. "VP Sales at Mid-Market SaaS")
- description: 1-2 sentence description of who this profile targets and why
- emoji: a single emoji representing this profile
- rationale: why this profile is relevant based on the company context
- filters: an object with Apollo search parameters (only include filters that are relevant — don't set empty arrays)
  - person_titles: string[] (specific job titles)
  - person_seniorities: string[] (from valid list above)
  - person_departments: string[] (from valid list above)
  - person_locations: string[] (geographic locations)
  - q_keywords: string (industry keywords)
  - organization_num_employees_ranges: string[] (from valid list above)
  - organization_latest_funding_stage_cd: string[] (from valid list above)
  - q_organization_keyword_tags: string[] (company-level keywords)
  - contact_email_status: string[] (usually ["verified"])

Rules:
- Generate 2-4 profiles, each targeting a DISTINCT persona
- Be specific with job titles — don't just use "Manager", use "Sales Manager", "Marketing Manager" etc.
- Match company size ranges to the ICP context (if they sell to enterprise, use larger ranges)
- Include verified email filter when relevant
- Each profile should have at least 3 different filter types set
- Profiles should be ordered from most to least relevant

Return ONLY the JSON array, no markdown formatting.`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text()
      console.error('[generate-icp-profiles] Claude API error:', claudeResponse.status, errText)
      throw new Error(`AI generation failed: ${claudeResponse.status}`)
    }

    const claudeData = await claudeResponse.json()
    const responseText = claudeData.content?.[0]?.text || '[]'

    // Parse the JSON response (handle potential markdown wrapping)
    let profiles: ICPProfile[]
    try {
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      profiles = JSON.parse(cleaned)
    } catch (parseErr) {
      console.error('[generate-icp-profiles] Failed to parse Claude response:', responseText)
      throw new Error('Failed to parse AI-generated profiles')
    }

    // Validate and sanitize profiles
    profiles = profiles.map((p, i) => {
      const filters = p.filters || {}
      // Validate seniorities
      if (filters.person_seniorities) {
        filters.person_seniorities = (filters.person_seniorities as string[]).filter(
          (s: string) => VALID_SENIORITIES.includes(s)
        )
      }
      // Validate departments
      if (filters.person_departments) {
        filters.person_departments = (filters.person_departments as string[]).filter(
          (d: string) => VALID_DEPARTMENTS.includes(d)
        )
      }
      // Validate employee ranges
      if (filters.organization_num_employees_ranges) {
        filters.organization_num_employees_ranges = (filters.organization_num_employees_ranges as string[]).filter(
          (r: string) => VALID_EMPLOYEE_RANGES.includes(r)
        )
      }
      // Validate funding stages
      if (filters.organization_latest_funding_stage_cd) {
        filters.organization_latest_funding_stage_cd = (filters.organization_latest_funding_stage_cd as string[]).filter(
          (f: string) => VALID_FUNDING_STAGES.includes(f)
        )
      }

      // Count non-empty filter keys
      const filterCount = Object.entries(filters).filter(([_, v]) => {
        if (Array.isArray(v)) return v.length > 0
        if (typeof v === 'string') return v.trim().length > 0
        return false
      }).length

      return {
        id: p.id || `profile-${i}`,
        name: p.name || `Profile ${i + 1}`,
        description: p.description || '',
        emoji: p.emoji || '🎯',
        filters,
        filter_count: filterCount,
        rationale: p.rationale || '',
      }
    }).filter(p => p.filter_count > 0) // Remove profiles with no valid filters

    // Cache profiles in organization_context
    await serviceClient
      .from('organization_context')
      .upsert({
        organization_id: orgId,
        context_key: 'icp_apollo_profiles',
        value: profiles,
        value_type: 'array',
        source: 'ai_generated',
        confidence: 0.85,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,context_key',
      })

    return new Response(
      JSON.stringify({ profiles, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[generate-icp-profiles] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * sync-fact-profile-context
 *
 * Syncs a client_org fact profile's research data into organization_enrichment
 * and organization_context, so that email generation (loadBusinessContext),
 * skill compilation (compile-organization-skills), and the copilot all use
 * the researched company data.
 *
 * POST { profileId: string }
 * Auth: JWT (user must be member of the profile's org)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse } from '../_shared/corsHelper.ts'
import { authenticateRequest } from '../_shared/edgeAuth.ts'

// ============================================================================
// Types
// ============================================================================

interface ResearchData {
  company_overview?: {
    name?: string
    tagline?: string
    description?: string
    founded_year?: number | null
    headquarters?: string
    company_type?: string
    website?: string
  }
  market_position?: {
    industry?: string
    sub_industries?: string[]
    target_market?: string
    market_size?: string
    differentiators?: string[]
    competitors?: string[]
  }
  products_services?: {
    products?: string[]
    use_cases?: string[]
    pricing_model?: string
    key_features?: string[]
  }
  team_leadership?: {
    employee_count?: number | null
    employee_range?: string
    key_people?: Array<{ name: string; title: string; linkedin?: string }>
    departments?: string[]
    hiring_signals?: string[]
  }
  financials?: {
    revenue_range?: string
    funding_status?: string
    funding_rounds?: Array<{ round: string; amount: string; date: string }>
    total_raised?: string
    investors?: string[]
    valuation?: string
  }
  technology?: {
    tech_stack?: string[]
    platforms?: string[]
    integrations?: string[]
  }
  ideal_customer_indicators?: {
    target_industries?: string[]
    target_company_sizes?: string[]
    target_roles?: string[]
    buying_signals?: string[]
    pain_points?: string[]
    value_propositions?: string[]
  }
  recent_activity?: {
    news?: Array<{ title: string; url: string; date: string }>
    awards?: string[]
    milestones?: string[]
    reviews_summary?: Record<string, unknown>
  }
}

// ============================================================================
// Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  // CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, req, 405)
    }

    // --- Auth ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    const { userId } = await authenticateRequest(req, serviceClient, serviceRoleKey)
    const body = await req.json()
    const { profileId } = body

    if (!profileId) {
      return jsonResponse({ error: 'profileId is required' }, req, 400)
    }

    // --- Fetch fact profile ---
    const { data: profile, error: profileError } = await serviceClient
      .from('client_fact_profiles')
      .select('id, organization_id, profile_type, research_status, research_data, company_name')
      .eq('id', profileId)
      .maybeSingle()

    if (profileError || !profile) {
      return jsonResponse({ error: 'Fact profile not found' }, req, 404)
    }

    if (profile.profile_type !== 'client_org') {
      return jsonResponse({ error: 'Only client_org profiles can be synced to org context' }, req, 400)
    }

    if (profile.research_status !== 'complete') {
      return jsonResponse({ error: 'Profile research must be complete before syncing' }, req, 400)
    }

    // --- Verify org membership (column is org_id, not organization_id) ---
    const { data: membership } = await serviceClient
      .from('organization_memberships')
      .select('role')
      .eq('org_id', profile.organization_id)
      .eq('user_id', userId!)
      .maybeSingle()

    if (!membership) {
      return jsonResponse({ error: 'Not a member of this organization' }, req, 403)
    }

    const orgId = profile.organization_id
    const rd = profile.research_data as ResearchData

    // --- 1. Upsert organization_enrichment ---
    const enrichmentFields = buildEnrichmentFields(rd, orgId)
    const { error: enrichError } = await serviceClient
      .from('organization_enrichment')
      .upsert(enrichmentFields, { onConflict: 'organization_id' })

    if (enrichError) {
      console.error('[sync-fact-profile] enrichment upsert error:', enrichError)
      return jsonResponse({ error: 'Failed to update organization enrichment', details: enrichError.message }, req, 500)
    }

    // --- 2. Upsert organization_context keys ---
    const contextMappings = buildContextMappings(rd)
    let savedCount = 0
    const errors: string[] = []

    for (const ctx of contextMappings) {
      try {
        await serviceClient.rpc('upsert_organization_context', {
          p_org_id: orgId,
          p_key: ctx.key,
          p_value: JSON.stringify(ctx.value),
          p_source: 'fact_profile',
          p_confidence: 0.90,
        })
        savedCount++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[sync-fact-profile] Failed to save context key "${ctx.key}":`, msg)
        errors.push(ctx.key)
      }
    }

    console.log(`[sync-fact-profile] Synced profile ${profileId} → org ${orgId}: enrichment OK, context ${savedCount}/${contextMappings.length}`)

    return jsonResponse({
      success: true,
      organization_id: orgId,
      enrichment_updated: true,
      context_keys_synced: savedCount,
      context_keys_total: contextMappings.length,
      errors: errors.length > 0 ? errors : undefined,
    }, req)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[sync-fact-profile] Error:', message)

    if (message.startsWith('Unauthorized')) {
      return jsonResponse({ error: message }, req, 401)
    }
    return jsonResponse({ error: message }, req, 500)
  }
})

// ============================================================================
// Mapping: research_data → organization_enrichment columns
// ============================================================================

function buildEnrichmentFields(rd: ResearchData, orgId: string): Record<string, unknown> {
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

  // Company identity
  if (ov?.name) fields.company_name = ov.name
  if (ov?.tagline) fields.tagline = ov.tagline
  if (ov?.description) fields.description = ov.description
  if (ov?.headquarters) fields.headquarters = ov.headquarters
  if (ov?.founded_year) fields.founded_year = ov.founded_year
  if (ov?.website) fields.domain = ov.website

  // Industry & market
  if (mp?.industry) fields.industry = mp.industry
  if (mp?.target_market) fields.target_market = mp.target_market

  // Employees
  if (tl?.employee_range) fields.employee_count = tl.employee_range

  // Products → array of {name, description}
  if (ps?.products && ps.products.length > 0) {
    fields.products = ps.products.map(p => ({ name: p, description: '' }))
  }
  if (ps?.use_cases && ps.use_cases.length > 0) {
    fields.use_cases = ps.use_cases
  }

  // Value props & pain points
  if (ic?.value_propositions && ic.value_propositions.length > 0) {
    fields.value_propositions = ic.value_propositions
  }
  if (ic?.pain_points && ic.pain_points.length > 0) {
    fields.pain_points = ic.pain_points
  }
  if (ic?.buying_signals && ic.buying_signals.length > 0) {
    fields.buying_signals = ic.buying_signals
  }

  // Competitors → array of {name}
  if (mp?.competitors && mp.competitors.length > 0) {
    fields.competitors = mp.competitors.map(c => ({ name: c }))
  }

  // Technology
  if (te?.tech_stack && te.tech_stack.length > 0) {
    fields.tech_stack = te.tech_stack
  }

  // People
  if (tl?.key_people && tl.key_people.length > 0) {
    fields.key_people = tl.key_people.map(p => ({ name: p.name, title: p.title }))
  }

  // Financials
  if (fi?.funding_status) fields.funding_stage = fi.funding_status

  // ICP
  if (ic) {
    fields.ideal_customer_profile = {
      target_industries: ic.target_industries || [],
      target_company_sizes: ic.target_company_sizes || [],
      target_roles: ic.target_roles || [],
      pain_points: ic.pain_points || [],
      value_propositions: ic.value_propositions || [],
      buying_signals: ic.buying_signals || [],
    }
  }

  // Recent news
  if (ra?.news && ra.news.length > 0) {
    fields.recent_news = ra.news
  }

  return fields
}

// ============================================================================
// Mapping: research_data → organization_context key-value pairs
// Follows the exact same pattern as deep-enrich-organization/saveOrganizationContext
// ============================================================================

function buildContextMappings(rd: ResearchData): Array<{ key: string; value: unknown }> {
  const mappings: Array<{ key: string; value: unknown }> = []
  const ov = rd.company_overview
  const mp = rd.market_position
  const ps = rd.products_services
  const tl = rd.team_leadership
  const fi = rd.financials
  const te = rd.technology
  const ic = rd.ideal_customer_indicators

  // --- Company identity ---
  if (ov?.name) mappings.push({ key: 'company_name', value: ov.name })
  if (ov?.tagline) mappings.push({ key: 'tagline', value: ov.tagline })
  if (ov?.description) mappings.push({ key: 'description', value: ov.description })
  if (ov?.headquarters) mappings.push({ key: 'headquarters', value: ov.headquarters })
  if (ov?.founded_year) mappings.push({ key: 'founded_year', value: String(ov.founded_year) })

  // --- Industry & market ---
  if (mp?.industry) mappings.push({ key: 'industry', value: mp.industry })
  if (mp?.target_market) mappings.push({ key: 'target_market', value: mp.target_market })

  // --- Employees ---
  if (tl?.employee_range) mappings.push({ key: 'employee_count', value: tl.employee_range })

  // --- Products ---
  if (ps?.products && ps.products.length > 0) {
    const productObjects = ps.products.map(p => ({ name: p, description: '' }))
    mappings.push({ key: 'products', value: productObjects })
    mappings.push({ key: 'main_product', value: ps.products[0] })
  }
  if (ps?.key_features && ps.key_features.length > 0) {
    mappings.push({ key: 'key_features', value: ps.key_features })
  }
  if (ps?.use_cases && ps.use_cases.length > 0) {
    mappings.push({ key: 'use_cases', value: ps.use_cases })
  }

  // --- Value props & pain points ---
  if (ic?.value_propositions && ic.value_propositions.length > 0) {
    mappings.push({ key: 'value_propositions', value: ic.value_propositions })
  }
  if (ic?.pain_points && ic.pain_points.length > 0) {
    mappings.push({ key: 'pain_points', value: ic.pain_points })
  }
  if (ic?.buying_signals && ic.buying_signals.length > 0) {
    mappings.push({ key: 'buying_signals', value: ic.buying_signals })
  }

  // --- Competitors ---
  if (mp?.competitors && mp.competitors.length > 0) {
    mappings.push({ key: 'competitors', value: mp.competitors })
    mappings.push({ key: 'primary_competitor', value: mp.competitors[0] })
  }

  // --- Differentiators ---
  if (mp?.differentiators && mp.differentiators.length > 0) {
    mappings.push({ key: 'differentiators', value: mp.differentiators })
    mappings.push({ key: 'primary_differentiator', value: mp.differentiators[0] })
  }

  // --- Technology ---
  if (te?.tech_stack && te.tech_stack.length > 0) {
    mappings.push({ key: 'tech_stack', value: te.tech_stack })
  }

  // --- People ---
  if (tl?.key_people && tl.key_people.length > 0) {
    mappings.push({ key: 'key_people', value: tl.key_people.map(p => ({ name: p.name, title: p.title })) })
  }

  // --- Financials ---
  if (fi?.funding_status) {
    mappings.push({ key: 'funding_status', value: fi.funding_status })
  }
  if (fi?.funding_rounds && fi.funding_rounds.length > 0) {
    mappings.push({ key: 'funding_rounds', value: fi.funding_rounds })
    const latest = fi.funding_rounds[fi.funding_rounds.length - 1]
    if (latest) {
      mappings.push({ key: 'latest_funding', value: `${latest.round} - ${latest.amount} (${latest.date})` })
    }
  }
  if (fi?.investors && fi.investors.length > 0) {
    mappings.push({ key: 'investors', value: fi.investors })
  }

  // --- ICP fields ---
  if (ic?.target_industries && ic.target_industries.length > 0) {
    mappings.push({ key: 'target_industries', value: ic.target_industries })
    mappings.push({ key: 'icp_company_profile', value: `Target industries: ${ic.target_industries.join(', ')}` })
  }
  if (ic?.target_roles && ic.target_roles.length > 0) {
    mappings.push({ key: 'target_roles', value: ic.target_roles })
    mappings.push({ key: 'icp_buyer_persona', value: `Target roles: ${ic.target_roles.join(', ')}` })
  }

  return mappings
}

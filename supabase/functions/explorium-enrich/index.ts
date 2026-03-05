import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { checkCreditBalance, logFlatRateCostEvent } from '../_shared/costTracking.ts'

const LOG_PREFIX = '[explorium-enrich]'

// ---------------------------------------------------------------------------
// Explorium API config
// ---------------------------------------------------------------------------

const EXPLORIUM_API_BASE = 'https://api.explorium.ai'

// Enrichment type definitions — platform_credits is 2× Explorium's credit cost
const ENRICHMENT_TYPES: Record<string, { endpoint: string; platform_credits: number }> = {
  // 1 Explorium credit → 2 platform credits
  firmographics:      { endpoint: '/v1/businesses/firmographics/enrich',              platform_credits: 2 },
  financial:          { endpoint: '/v1/businesses/financial_indicators/enrich',        platform_credits: 2 },
  funding:            { endpoint: '/v1/businesses/funding_and_acquisition/enrich',     platform_credits: 2 },
  technographics:     { endpoint: '/v1/businesses/technographics/enrich',              platform_credits: 2 },
  keyword_search:     { endpoint: '/v1/businesses/keyword_search/enrich',              platform_credits: 2 },
  professional:       { endpoint: '/v1/prospects/contacts_information/bulk_enrich',    platform_credits: 2 },

  // 2 Explorium credits → 4 platform credits
  intent:             { endpoint: '/v1/businesses/bombora_intent/enrich',              platform_credits: 4 },
  website_traffic:    { endpoint: '/v1/businesses/website_traffic/enrich',             platform_credits: 4 },
  workforce_trends:   { endpoint: '/v1/businesses/workforce_trends/enrich',            platform_credits: 4 },
  webstack:           { endpoint: '/v1/businesses/webstack/enrich',                    platform_credits: 4 },
  website_changes:    { endpoint: '/v1/businesses/website_changes/enrich',             platform_credits: 4 },
  social_presence:    { endpoint: '/v1/businesses/linkedin_posts/enrich',              platform_credits: 4 },
  company_hierarchy:  { endpoint: '/v1/businesses/company_hierarchy/enrich',           platform_credits: 4 },

  // 5 Explorium credits → 10 platform credits
  contact_details:    { endpoint: '/v1/prospects/contacts_information/bulk_enrich',    platform_credits: 10 },
  individual_social:  { endpoint: '/v1/prospects/social_presence/enrich',              platform_credits: 10 },
  lookalikes:         { endpoint: '/v1/businesses/lookalikes/enrich',                  platform_credits: 10 },
  custom:             { endpoint: '/v1/custom_enrichment',                             platform_credits: 10 },
}

// Maximum rows to process per invocation (stay within Supabase 150s wall-clock limit)
const BATCH_SIZE = 50

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkEnrichRequest {
  action: 'bulk_enrich'
  table_id: string
  column_id: string
  enrich_type: string
  force_refresh?: boolean
  _auth_token?: string
  _skip_credit_deduction?: boolean
}

interface DynamicTableRow {
  id: string
  source_data: Record<string, unknown> | null
  source_id: string | null
}

// ---------------------------------------------------------------------------
// Value extraction helpers
// ---------------------------------------------------------------------------

/** Safely read a nested path from an object using dot notation */
function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== 'object') return null
    return (current as Record<string, unknown>)[segment]
  }, obj)
}

/** Coerce any value to a display string, returns null if empty/null/undefined */
function toDisplayString(value: unknown): string | null {
  if (value == null) return null
  if (Array.isArray(value)) {
    const flat = value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).filter(Boolean)
    return flat.length > 0 ? flat.join(', ') : null
  }
  if (typeof value === 'object') return JSON.stringify(value)
  const str = String(value).trim()
  return str.length > 0 ? str : null
}

/**
 * Extract a representative cell value from an Explorium enrichment response.
 * Each enrich_type surfaces different keys — we concatenate the most meaningful
 * fields into a single readable string that fits in a table cell.
 */
function extractFieldValue(
  enrichResponse: Record<string, unknown>,
  enrichType: string,
): string | null {
  // Explorium enrichment responses vary widely by endpoint.
  // We look for the data payload under common top-level keys and then pick
  // the most human-readable fields for the cell display value.
  const data = (enrichResponse.data ?? enrichResponse.result ?? enrichResponse) as Record<string, unknown>

  switch (enrichType) {
    case 'firmographics': {
      const parts: string[] = []
      const employees = toDisplayString(getPath(data, 'employee_count') ?? getPath(data, 'employees'))
      const revenue = toDisplayString(getPath(data, 'annual_revenue') ?? getPath(data, 'revenue'))
      const industry = toDisplayString(getPath(data, 'industry') ?? getPath(data, 'sector'))
      const founded = toDisplayString(getPath(data, 'founded_year') ?? getPath(data, 'year_founded'))
      const hq = toDisplayString(getPath(data, 'headquarters') ?? getPath(data, 'hq_location'))
      if (industry) parts.push(industry)
      if (employees) parts.push(`${employees} employees`)
      if (revenue) parts.push(`Revenue: ${revenue}`)
      if (founded) parts.push(`Founded: ${founded}`)
      if (hq) parts.push(hq)
      return parts.length > 0 ? parts.join(' | ') : toDisplayString(data)
    }

    case 'financial': {
      const parts: string[] = []
      const revenue = toDisplayString(getPath(data, 'annual_revenue') ?? getPath(data, 'revenue'))
      const growth = toDisplayString(getPath(data, 'revenue_growth') ?? getPath(data, 'growth_rate'))
      const profitability = toDisplayString(getPath(data, 'profitability') ?? getPath(data, 'gross_margin'))
      const raisedTotal = toDisplayString(getPath(data, 'total_funding'))
      if (revenue) parts.push(`Revenue: ${revenue}`)
      if (growth) parts.push(`Growth: ${growth}`)
      if (profitability) parts.push(`Profitability: ${profitability}`)
      if (raisedTotal) parts.push(`Total Funding: ${raisedTotal}`)
      return parts.length > 0 ? parts.join(' | ') : toDisplayString(data)
    }

    case 'funding': {
      const parts: string[] = []
      const lastRound = toDisplayString(getPath(data, 'last_funding_round') ?? getPath(data, 'last_round_type'))
      const lastAmount = toDisplayString(getPath(data, 'last_funding_amount') ?? getPath(data, 'last_round_amount'))
      const totalFunding = toDisplayString(getPath(data, 'total_funding'))
      const investors = toDisplayString(getPath(data, 'investors') ?? getPath(data, 'lead_investors'))
      const stage = toDisplayString(getPath(data, 'funding_stage') ?? getPath(data, 'stage'))
      if (stage) parts.push(stage)
      if (lastRound) parts.push(`Last: ${lastRound}`)
      if (lastAmount) parts.push(lastAmount)
      if (totalFunding) parts.push(`Total: ${totalFunding}`)
      if (investors) parts.push(`Investors: ${investors}`)
      return parts.length > 0 ? parts.join(' | ') : toDisplayString(data)
    }

    case 'technographics': {
      const techList = getPath(data, 'technologies') ?? getPath(data, 'tech_stack')
      if (Array.isArray(techList)) {
        const names = techList
          .map((t) => (typeof t === 'object' && t !== null ? (t as Record<string, unknown>).name ?? t : t))
          .map(String)
          .filter(Boolean)
        return names.length > 0 ? names.slice(0, 20).join(', ') : null
      }
      return toDisplayString(techList ?? data)
    }

    case 'keyword_search': {
      const keywords = getPath(data, 'keywords') ?? getPath(data, 'tags')
      if (Array.isArray(keywords)) {
        return keywords.map(String).filter(Boolean).slice(0, 30).join(', ') || null
      }
      const description = toDisplayString(getPath(data, 'description') ?? getPath(data, 'summary'))
      return description ?? toDisplayString(keywords ?? data)
    }

    case 'professional':
    case 'contact_details': {
      // Returns contact/person info
      const contacts = getPath(data, 'contacts') ?? getPath(data, 'results')
      if (Array.isArray(contacts) && contacts.length > 0) {
        const first = contacts[0] as Record<string, unknown>
        const name = toDisplayString(getPath(first, 'full_name') ?? getPath(first, 'name'))
        const title = toDisplayString(getPath(first, 'title') ?? getPath(first, 'job_title'))
        const email = toDisplayString(getPath(first, 'email') ?? getPath(first, 'work_email'))
        const parts = [name, title, email].filter(Boolean)
        return parts.length > 0 ? parts.join(' | ') : JSON.stringify(first)
      }
      return toDisplayString(data)
    }

    case 'intent': {
      const topics = getPath(data, 'intent_topics') ?? getPath(data, 'topics') ?? getPath(data, 'signals')
      if (Array.isArray(topics)) {
        const topNames = topics
          .map((t) => (typeof t === 'object' && t !== null ? (t as Record<string, unknown>).topic ?? (t as Record<string, unknown>).name ?? t : t))
          .map(String)
          .filter(Boolean)
        return topNames.length > 0 ? topNames.slice(0, 10).join(', ') : null
      }
      const score = toDisplayString(getPath(data, 'intent_score') ?? getPath(data, 'score'))
      return score ?? toDisplayString(topics ?? data)
    }

    case 'website_traffic': {
      const parts: string[] = []
      const visits = toDisplayString(getPath(data, 'monthly_visits') ?? getPath(data, 'monthly_traffic') ?? getPath(data, 'visits'))
      const rank = toDisplayString(getPath(data, 'global_rank') ?? getPath(data, 'alexa_rank'))
      const growth = toDisplayString(getPath(data, 'traffic_growth') ?? getPath(data, 'mom_growth'))
      if (visits) parts.push(`Visits: ${visits}/mo`)
      if (rank) parts.push(`Rank: #${rank}`)
      if (growth) parts.push(`Growth: ${growth}`)
      return parts.length > 0 ? parts.join(' | ') : toDisplayString(data)
    }

    case 'workforce_trends': {
      const parts: string[] = []
      const headcount = toDisplayString(getPath(data, 'employee_count') ?? getPath(data, 'headcount'))
      const growth = toDisplayString(getPath(data, 'headcount_growth') ?? getPath(data, 'employee_growth'))
      const hiring = toDisplayString(getPath(data, 'open_jobs') ?? getPath(data, 'job_openings'))
      const topDepts = getPath(data, 'top_departments') ?? getPath(data, 'departments')
      if (headcount) parts.push(`Employees: ${headcount}`)
      if (growth) parts.push(`Growth: ${growth}`)
      if (hiring) parts.push(`Open Roles: ${hiring}`)
      if (Array.isArray(topDepts) && topDepts.length > 0) parts.push(`Top Depts: ${topDepts.slice(0, 3).join(', ')}`)
      return parts.length > 0 ? parts.join(' | ') : toDisplayString(data)
    }

    case 'webstack': {
      const stack = getPath(data, 'technologies') ?? getPath(data, 'webstack') ?? getPath(data, 'tools')
      if (Array.isArray(stack)) {
        return stack
          .map((t) => (typeof t === 'object' && t !== null ? (t as Record<string, unknown>).name ?? t : t))
          .map(String)
          .filter(Boolean)
          .slice(0, 20)
          .join(', ') || null
      }
      return toDisplayString(stack ?? data)
    }

    case 'website_changes': {
      const changes = getPath(data, 'changes') ?? getPath(data, 'detected_changes')
      if (Array.isArray(changes) && changes.length > 0) {
        return changes
          .map((c) => (typeof c === 'object' && c !== null ? (c as Record<string, unknown>).description ?? JSON.stringify(c) : String(c)))
          .slice(0, 5)
          .join('; ') || null
      }
      const summary = toDisplayString(getPath(data, 'summary') ?? getPath(data, 'last_change'))
      return summary ?? toDisplayString(changes ?? data)
    }

    case 'social_presence': {
      const posts = getPath(data, 'posts') ?? getPath(data, 'linkedin_posts')
      const followers = toDisplayString(getPath(data, 'followers') ?? getPath(data, 'follower_count'))
      const engagement = toDisplayString(getPath(data, 'engagement_rate') ?? getPath(data, 'avg_engagement'))
      const parts: string[] = []
      if (followers) parts.push(`Followers: ${followers}`)
      if (engagement) parts.push(`Engagement: ${engagement}`)
      if (Array.isArray(posts) && posts.length > 0) {
        const latest = posts[0] as Record<string, unknown>
        const text = toDisplayString(latest.text ?? latest.content ?? latest.body)
        if (text) parts.push(`Latest: ${text.slice(0, 100)}`)
      }
      return parts.length > 0 ? parts.join(' | ') : toDisplayString(data)
    }

    case 'company_hierarchy': {
      const parts: string[] = []
      const parent = toDisplayString(getPath(data, 'parent_company') ?? getPath(data, 'parent'))
      const subsidiaries = getPath(data, 'subsidiaries') ?? getPath(data, 'children')
      const type = toDisplayString(getPath(data, 'company_type') ?? getPath(data, 'entity_type'))
      if (parent) parts.push(`Parent: ${parent}`)
      if (type) parts.push(type)
      if (Array.isArray(subsidiaries) && subsidiaries.length > 0) {
        parts.push(`${subsidiaries.length} subsidiaries`)
      }
      return parts.length > 0 ? parts.join(' | ') : toDisplayString(data)
    }

    case 'individual_social': {
      const parts: string[] = []
      const linkedin = toDisplayString(getPath(data, 'linkedin_url') ?? getPath(data, 'linkedin'))
      const followers = toDisplayString(getPath(data, 'followers') ?? getPath(data, 'connection_count'))
      const headline = toDisplayString(getPath(data, 'headline') ?? getPath(data, 'bio'))
      if (linkedin) parts.push(linkedin)
      if (followers) parts.push(`${followers} followers`)
      if (headline) parts.push(headline.slice(0, 100))
      return parts.length > 0 ? parts.join(' | ') : toDisplayString(data)
    }

    case 'lookalikes': {
      const results = getPath(data, 'lookalikes') ?? getPath(data, 'similar_companies') ?? getPath(data, 'results')
      if (Array.isArray(results)) {
        const names = results
          .map((r) => (typeof r === 'object' && r !== null ? (r as Record<string, unknown>).name ?? (r as Record<string, unknown>).company_name : String(r)))
          .filter(Boolean)
          .slice(0, 10)
        return names.length > 0 ? names.join(', ') : null
      }
      return toDisplayString(results ?? data)
    }

    case 'custom': {
      // Custom enrichment — return the full result serialized
      return toDisplayString(data)
    }

    default: {
      // Unknown type — try common top-level text fields, otherwise serialize
      const value =
        toDisplayString(getPath(data, 'value')) ??
        toDisplayString(getPath(data, 'result')) ??
        toDisplayString(getPath(data, 'summary')) ??
        toDisplayString(getPath(data, 'description'))
      return value ?? toDisplayString(data)
    }
  }
}

// ---------------------------------------------------------------------------
// Explorium API call
// ---------------------------------------------------------------------------

/**
 * Call an Explorium enrichment endpoint for a single business/prospect.
 * The request body shape varies by endpoint; we pass through source_id as the
 * primary identifier and let Explorium handle matching.
 */
async function callExploriumEnrich(
  apiKey: string,
  endpoint: string,
  enrichType: string,
  row: DynamicTableRow,
): Promise<Record<string, unknown>> {
  // Build the request body — Explorium endpoints generally accept business/prospect
  // identifiers. We use source_id (e.g. domain, company name) from the row.
  // For prospects/contacts endpoints we pass the same identifier and let Explorium match.
  const requestBody: Record<string, unknown> = {}

  if (row.source_id) {
    // source_id can be a domain, company name, or person identifier depending on table context
    const sourceId = String(row.source_id).trim()
    // Detect if it looks like a domain (contains a dot, no spaces)
    if (/^[a-z0-9-]+\.[a-z]{2,}(\.[a-z]{2,})?$/i.test(sourceId)) {
      requestBody.domain = sourceId
    } else {
      requestBody.company_name = sourceId
    }
  }

  // For prospect endpoints, also pass business identifier
  if (enrichType === 'professional' || enrichType === 'contact_details' || enrichType === 'individual_social') {
    // These may need additional identifiers; pass what we have
    if (requestBody.domain) {
      requestBody.business_domain = requestBody.domain
    }
  }

  const response = await fetch(`${EXPLORIUM_API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_key': apiKey,
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Explorium API ${response.status}: ${errorText.slice(0, 300)}`)
  }

  return await response.json()
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) {
    return preflightResponse
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Auth: support Authorization header OR body._auth_token fallback
    const body = await req.json() as BulkEnrichRequest
    const { _auth_token, _skip_credit_deduction, ...params } = body

    const authHeader = req.headers.get('Authorization')
    const bearerToken = authHeader || (_auth_token ? `Bearer ${_auth_token}` : null)

    if (!bearerToken) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization. Please sign in and try again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Authenticate user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: bearerToken } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Service client bypasses RLS for table reads/writes
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    // Get user's org
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

    // Get Explorium API key — BYOK from integration_credentials, else platform key
    const { data: creds } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'explorium')
      .maybeSingle()

    const byokKey = (creds?.credentials as Record<string, string> | null)?.api_key
    const platformKey = Deno.env.get('EXPLORIUM_API_KEY')
    const exploriumApiKey = byokKey || platformKey
    const usingByok = !!byokKey

    if (!exploriumApiKey) {
      return new Response(
        JSON.stringify({
          error: 'Explorium API key not configured. Add it in Settings > Integrations.',
          code: 'EXPLORIUM_NOT_CONFIGURED',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Credit balance pre-flight check (skip if BYOK — they pay Explorium directly)
    if (!_skip_credit_deduction && !usingByok) {
      const balanceCheck = await checkCreditBalance(serviceClient, orgId)
      if (!balanceCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: 'insufficient_credits',
            message: balanceCheck.message || 'Your organization has run out of AI credits. Please top up to continue.',
            balance: balanceCheck.balance,
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // Validate action
    const { action } = params
    if (action !== 'bulk_enrich') {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}. Supported actions: bulk_enrich` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ---------------------------------------------------------------------------
    // Action: bulk_enrich
    // ---------------------------------------------------------------------------

    const { table_id, column_id, enrich_type, force_refresh = false } = params as BulkEnrichRequest

    if (!table_id || !column_id || !enrich_type) {
      return new Response(
        JSON.stringify({ error: 'table_id, column_id, and enrich_type are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const enrichDef = ENRICHMENT_TYPES[enrich_type]
    if (!enrichDef) {
      return new Response(
        JSON.stringify({
          error: `Unknown enrich_type: "${enrich_type}". Valid types: ${Object.keys(ENRICHMENT_TYPES).join(', ')}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`${LOG_PREFIX} Starting bulk_enrich: table=${table_id} column=${column_id} type=${enrich_type} force=${force_refresh}`)

    // Fetch rows in batches (up to BATCH_SIZE per invocation)
    const { data: rows, error: rowsError } = await serviceClient
      .from('dynamic_table_rows')
      .select('id, source_data, source_id')
      .eq('table_id', table_id)
      .order('row_index')
      .range(0, BATCH_SIZE - 1)

    if (rowsError) {
      console.error(`${LOG_PREFIX} Error fetching rows:`, rowsError)
      throw rowsError
    }

    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({
          enriched_count: 0,
          cached_count: 0,
          failed_count: 0,
          credits_consumed: 0,
          table_id,
          column_id,
          enrich_type,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const typedRows = rows as DynamicTableRow[]
    const cacheKey = `explorium_${enrich_type}`

    // Separate cached vs. needs-API rows
    const cachedRows: DynamicTableRow[] = []
    const needsApiRows: DynamicTableRow[] = []

    for (const row of typedRows) {
      const sourceData = row.source_data ?? {}
      const cachedData = sourceData[cacheKey]
      if (cachedData != null && !force_refresh) {
        cachedRows.push(row)
      } else {
        needsApiRows.push(row)
      }
    }

    console.log(`${LOG_PREFIX} Rows: ${typedRows.length} total, ${cachedRows.length} cached, ${needsApiRows.length} need API`)

    const stats = {
      enriched_count: 0,
      cached_count: 0,
      failed_count: 0,
      credits_consumed: 0,
    }

    // -- Step 1: Serve cached rows (no API call, no credits) --
    if (cachedRows.length > 0) {
      const cachedCells = cachedRows.map((row) => {
        const sourceData = row.source_data ?? {}
        const cachedEnrichData = sourceData[cacheKey] as Record<string, unknown>
        const cellValue = extractFieldValue(cachedEnrichData, enrich_type)
        return {
          row_id: row.id,
          column_id: column_id,
          value: cellValue,
          source: 'explorium_cache',
          status: 'complete',
          confidence: 1.0,
        }
      })

      const { error: cacheUpsertError } = await serviceClient
        .from('dynamic_table_cells')
        .upsert(cachedCells, { onConflict: 'row_id,column_id' })

      if (cacheUpsertError) {
        console.error(`${LOG_PREFIX} Error upserting cached cells:`, cacheUpsertError)
      } else {
        stats.cached_count = cachedRows.length
      }
    }

    // -- Step 2: Mark API-needed rows as pending --
    if (needsApiRows.length > 0) {
      const pendingCells = needsApiRows.map((row) => ({
        row_id: row.id,
        column_id: column_id,
        value: null,
        status: 'pending',
        source: 'explorium',
      }))

      await serviceClient
        .from('dynamic_table_cells')
        .upsert(pendingCells, { onConflict: 'row_id,column_id' })
    }

    // -- Step 3: Call Explorium API for cache-miss rows --
    for (const row of needsApiRows) {
      try {
        const enrichResponse = await callExploriumEnrich(
          exploriumApiKey,
          enrichDef.endpoint,
          enrich_type,
          row,
        )

        // Cache full response in source_data.explorium_<type>
        const existingSourceData = row.source_data ?? {}
        const updatedSourceData = { ...existingSourceData, [cacheKey]: enrichResponse }

        await serviceClient
          .from('dynamic_table_rows')
          .update({ source_data: updatedSourceData })
          .eq('id', row.id)

        // Extract cell value and write
        const cellValue = extractFieldValue(enrichResponse, enrich_type)

        await serviceClient
          .from('dynamic_table_cells')
          .upsert(
            {
              row_id: row.id,
              column_id: column_id,
              value: cellValue,
              source: 'explorium',
              status: 'complete',
              confidence: 1.0,
            },
            { onConflict: 'row_id,column_id' },
          )

        stats.enriched_count++

        // Deduct credits per enriched row (skip if BYOK or explicitly skipped)
        if (!_skip_credit_deduction && !usingByok) {
          await logFlatRateCostEvent(
            serviceClient,
            user.id,
            orgId,
            'explorium',
            `explorium-enrich-${enrich_type}`,
            enrichDef.platform_credits,
            'explorium_enrich',
          )
          stats.credits_consumed += enrichDef.platform_credits
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`${LOG_PREFIX} Error enriching row ${row.id}:`, errMsg)

        // Mark cell as failed
        await serviceClient
          .from('dynamic_table_cells')
          .upsert(
            {
              row_id: row.id,
              column_id: column_id,
              value: null,
              source: 'explorium',
              status: 'failed',
              confidence: 0,
              error_message: errMsg.slice(0, 500),
            },
            { onConflict: 'row_id,column_id' },
          )

        stats.failed_count++
      }
    }

    console.log(
      `${LOG_PREFIX} Done: enriched=${stats.enriched_count} cached=${stats.cached_count} failed=${stats.failed_count} credits=${stats.credits_consumed}`,
    )

    return new Response(
      JSON.stringify({
        enriched_count: stats.enriched_count,
        cached_count: stats.cached_count,
        failed_count: stats.failed_count,
        credits_consumed: stats.credits_consumed,
        table_id,
        column_id,
        enrich_type,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`${LOG_PREFIX} Unhandled error:`, errMsg)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

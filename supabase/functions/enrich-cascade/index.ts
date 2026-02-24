import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { logFlatRateCostEvent } from '../_shared/costTracking.ts'

/**
 * enrich-cascade — Multi-provider contact enrichment with field-level source attribution.
 *
 * Cascade strategy (per row):
 *   1. Check source_data cache (ai_ark then apollo) — zero API calls if cached
 *   2. Try AI Ark reverse-lookup (email or linkedin required) — higher quality
 *   3. If AI Ark misses fields, try Apollo people/match to fill gaps
 *   4. Merge results: prefer AI Ark values, fill missing fields from Apollo
 *   5. Write merged cell value + source attribution per field into source_data
 *
 * Rate limits respected:
 *   - AI Ark: 4 concurrent / 250ms delay between batches (~5/sec max)
 *   - Apollo: 5 concurrent
 *
 * POST body:
 * {
 *   action: 'enrich_contact'       -- single contact enrichment (returns merged person)
 *   action: 'bulk_enrich'          -- batch enrichment for dynamic table column
 *
 *   // enrich_contact params
 *   email?: string
 *   linkedin_url?: string
 *   field?: string                 -- which field to return (e.g. 'phone')
 *
 *   // bulk_enrich params
 *   table_id: string
 *   column_id: string
 *   row_ids?: string[]
 *   max_rows?: number
 *   force_refresh?: boolean
 *   disable_cascade?: boolean      -- skip Apollo fallback even if enabled for org
 * }
 */

const AI_ARK_API_BASE = 'https://api.ai-ark.com/api/developer-portal/v1'
const APOLLO_API_BASE = 'https://api.apollo.io/api/v1'

const AI_ARK_CONCURRENT = 4
const AI_ARK_BATCH_DELAY_MS = 250
const APOLLO_CONCURRENT = 5

// ---------------------------------------------------------------------------
// Credit costs (per API call, flat rate regardless of results returned)
// ---------------------------------------------------------------------------

const CREDIT_COSTS = {
  ai_ark_reverse_lookup: 1.25,
  apollo_people_match: 1.0,
}

// ---------------------------------------------------------------------------
// Field maps: which source provides which fields
// ---------------------------------------------------------------------------

const AI_ARK_FIELD_MAP: Record<string, { path: string; label: string }> = {
  first_name:       { path: 'profile.first_name',        label: 'First Name' },
  last_name:        { path: 'profile.last_name',         label: 'Last Name' },
  full_name:        { path: 'profile.full_name',         label: 'Full Name' },
  title:            { path: 'profile.title',             label: 'Title' },
  headline:         { path: 'profile.headline',          label: 'Headline' },
  seniority:        { path: 'department.seniority',      label: 'Seniority' },
  summary:          { path: 'profile.summary',           label: 'Summary' },
  linkedin_url:     { path: 'link.linkedin',             label: 'LinkedIn' },
  twitter:          { path: 'link.twitter',              label: 'Twitter' },
  github:           { path: 'link.github',               label: 'GitHub' },
  city:             { path: 'location.city',             label: 'City' },
  state:            { path: 'location.state',            label: 'State' },
  country:          { path: 'location.country',          label: 'Country' },
  location:         { path: 'location.default',          label: 'Location' },
  company:          { path: 'company.summary.name',      label: 'Company' },
  company_name:     { path: 'company.summary.name',      label: 'Company Name' },
  company_domain:   { path: 'company.link.domain',       label: 'Company Domain' },
  industry:         { path: 'industry',                  label: 'Industry' },
  photo_url:        { path: 'profile.picture.source',    label: 'Photo URL' },
}

const APOLLO_FIELD_MAP: Record<string, { path: string; label: string }> = {
  email:             { path: 'email',                                  label: 'Email' },
  personal_email:    { path: 'personal_emails[0]',                    label: 'Personal Email' },
  phone:             { path: 'phone_numbers[0].sanitized_number',     label: 'Phone' },
  mobile_phone:      { path: 'mobile_phone',                          label: 'Mobile Phone' },
  linkedin_url:      { path: 'linkedin_url',                          label: 'LinkedIn' },
  title:             { path: 'title',                                  label: 'Title' },
  headline:          { path: 'headline',                               label: 'Headline' },
  seniority:         { path: 'seniority',                              label: 'Seniority' },
  departments:       { path: 'departments',                            label: 'Departments' },
  city:              { path: 'city',                                   label: 'City' },
  state:             { path: 'state',                                  label: 'State' },
  country:           { path: 'country',                                label: 'Country' },
  photo_url:         { path: 'photo_url',                             label: 'Photo URL' },
  email_status:      { path: 'email_status',                          label: 'Email Status' },
  company_name:      { path: 'organization.name',                     label: 'Company Name' },
  company_domain:    { path: 'organization.primary_domain',           label: 'Company Domain' },
  company_industry:  { path: 'organization.industry',                 label: 'Industry' },
  company_employees: { path: 'organization.estimated_num_employees',  label: 'Employees' },
  company_revenue:   { path: 'organization.annual_revenue',           label: 'Revenue' },
  company_funding:   { path: 'organization.latest_funding_stage',     label: 'Funding Stage' },
}

// Fields where Apollo is the preferred/only source (has email, phone)
const APOLLO_PRIMARY_FIELDS = new Set([
  'email', 'personal_email', 'phone', 'mobile_phone',
  'email_status', 'departments', 'company_industry',
  'company_employees', 'company_revenue', 'company_funding',
])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RowData {
  id: string
  source_data: Record<string, unknown> | null
  cells: Record<string, { column_id: string; value: string | null }>
}

interface ColumnMeta {
  key: string
  label: string
  column_type: string
  hubspot_property_name: string | null
}

interface EnrichedPerson {
  // Merged values keyed by field name
  [field: string]: string | null
}

interface SourceAttribution {
  // Per-field source: 'ai_ark' | 'apollo' | 'ai_ark_cache' | 'apollo_cache'
  [field: string]: string
}

// ---------------------------------------------------------------------------
// Path extraction helpers
// ---------------------------------------------------------------------------

function extractField(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current == null) return null
    const arrayMatch = segment.match(/^(\w+)\[(\d+)\]$/)
    if (arrayMatch) {
      const arr = (current as Record<string, unknown>)[arrayMatch[1]]
      return Array.isArray(arr) ? arr[parseInt(arrayMatch[2])] : null
    }
    return (current as Record<string, unknown>)[segment]
  }, obj)
}

function formatValue(value: unknown): string | null {
  if (value == null) return null
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// ---------------------------------------------------------------------------
// Merge AI Ark + Apollo into a single normalized person record
// ---------------------------------------------------------------------------

function mergePersonData(
  aiArkData: Record<string, unknown> | null,
  apolloData: Record<string, unknown> | null,
  aiArkSource: 'ai_ark' | 'ai_ark_cache',
  apolloSource: 'apollo' | 'apollo_cache',
): { person: EnrichedPerson; attribution: SourceAttribution } {
  const person: EnrichedPerson = {}
  const attribution: SourceAttribution = {}

  // All known fields (union of both maps)
  const allFields = new Set([
    ...Object.keys(AI_ARK_FIELD_MAP),
    ...Object.keys(APOLLO_FIELD_MAP),
  ])

  for (const field of allFields) {
    // Apollo-primary fields: prefer Apollo if available
    if (APOLLO_PRIMARY_FIELDS.has(field)) {
      if (apolloData && APOLLO_FIELD_MAP[field]) {
        const val = formatValue(extractField(apolloData, APOLLO_FIELD_MAP[field].path))
        if (val != null) {
          person[field] = val
          attribution[field] = apolloSource
          continue
        }
      }
      // Fallback to AI Ark if it has this field
      if (aiArkData && AI_ARK_FIELD_MAP[field]) {
        const val = formatValue(extractField(aiArkData, AI_ARK_FIELD_MAP[field].path))
        if (val != null) {
          person[field] = val
          attribution[field] = aiArkSource
          continue
        }
      }
      person[field] = null
      continue
    }

    // AI Ark preferred for all other fields
    if (aiArkData && AI_ARK_FIELD_MAP[field]) {
      const val = formatValue(extractField(aiArkData, AI_ARK_FIELD_MAP[field].path))
      if (val != null) {
        person[field] = val
        attribution[field] = aiArkSource
        continue
      }
    }
    // Fallback to Apollo for remaining fields
    if (apolloData && APOLLO_FIELD_MAP[field]) {
      const val = formatValue(extractField(apolloData, APOLLO_FIELD_MAP[field].path))
      if (val != null) {
        person[field] = val
        attribution[field] = apolloSource
        continue
      }
    }
    person[field] = null
  }

  return { person, attribution }
}

// ---------------------------------------------------------------------------
// Build AI Ark reverse-lookup params from cell data
// ---------------------------------------------------------------------------

function buildAiArkLookupParams(
  row: RowData,
  columnIdToKey: Map<string, string>,
  columnIdToMeta: Map<string, ColumnMeta>,
): { kind: string; search: Record<string, string> } | null {
  let emailVal: string | null = null
  let linkedinVal: string | null = null

  for (const [, cell] of Object.entries(row.cells)) {
    if (!cell.value) continue
    const meta = columnIdToMeta.get(cell.column_id)
    const key = columnIdToKey.get(cell.column_id) ?? ''
    const label = meta?.label ?? ''
    const colType = meta?.column_type ?? ''

    if (
      colType === 'email' ||
      key === 'email' || key === 'work_email' ||
      label.toLowerCase().includes('email')
    ) {
      if (!emailVal) emailVal = cell.value
    }

    if (
      colType === 'linkedin' ||
      key === 'linkedin_url' || key === 'linkedin' ||
      label.toLowerCase().includes('linkedin')
    ) {
      if (!linkedinVal) linkedinVal = cell.value
    }
  }

  if (emailVal) return { kind: 'CONTACT', search: { email: emailVal } }
  if (linkedinVal) return { kind: 'CONTACT', search: { linkedin: linkedinVal } }
  return null
}

// ---------------------------------------------------------------------------
// Build Apollo match params from cell data
// ---------------------------------------------------------------------------

function buildApolloMatchParams(
  row: RowData,
  columnIdToKey: Map<string, string>,
  columnIdToMeta: Map<string, ColumnMeta>,
): Record<string, string> | null {
  let emailVal: string | null = null
  let firstNameVal: string | null = null
  let lastNameVal: string | null = null
  let fullNameVal: string | null = null
  let domainVal: string | null = null
  let companyVal: string | null = null
  let linkedinVal: string | null = null

  for (const [, cell] of Object.entries(row.cells)) {
    if (!cell.value) continue
    const meta = columnIdToMeta.get(cell.column_id)
    const key = columnIdToKey.get(cell.column_id) ?? ''
    const label = (meta?.label ?? '').toLowerCase()
    const colType = meta?.column_type ?? ''
    const hsProp = meta?.hubspot_property_name ?? ''

    if (colType === 'email' || key === 'email' || key === 'work_email' || label.includes('email') || hsProp === 'email') {
      if (!emailVal) emailVal = cell.value
    }
    if (key === 'first_name' || key === 'firstname' || label === 'first name' || hsProp === 'firstname') {
      if (!firstNameVal) firstNameVal = cell.value
    }
    if (key === 'last_name' || key === 'lastname' || label === 'last name' || hsProp === 'lastname') {
      if (!lastNameVal) lastNameVal = cell.value
    }
    if (colType === 'person' || key === 'full_name' || key === 'name' || label === 'name' || label === 'full name') {
      if (!fullNameVal) fullNameVal = cell.value
    }
    if (key === 'company_domain' || key === 'domain' || label === 'domain' || label === 'company domain') {
      if (!domainVal) domainVal = cell.value
    }
    if (colType === 'company' || key === 'company' || key === 'company_name' || label === 'company' || label === 'company name') {
      if (!companyVal) companyVal = cell.value
    }
    if (colType === 'linkedin' || key === 'linkedin_url' || key === 'linkedin' || label.includes('linkedin')) {
      if (!linkedinVal) linkedinVal = cell.value
    }
  }

  if (emailVal) return { email: emailVal }
  if (firstNameVal && lastNameVal && domainVal) return { first_name: firstNameVal, last_name: lastNameVal, domain: domainVal }
  if (firstNameVal && lastNameVal && companyVal) return { first_name: firstNameVal, last_name: lastNameVal, organization_name: companyVal }
  if (fullNameVal && domainVal) return { name: fullNameVal, domain: domainVal }
  if (fullNameVal && companyVal) return { name: fullNameVal, organization_name: companyVal }
  if (linkedinVal) return { linkedin_url: linkedinVal }
  return null
}

// ---------------------------------------------------------------------------
// Rate limiting sleep
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// API callers
// ---------------------------------------------------------------------------

async function callAiArkReverseLookup(
  apiKey: string,
  lookupBody: { kind: string; search: Record<string, string> },
): Promise<{ person: Record<string, unknown> | null; credits_consumed: number }> {
  const response = await fetch(`${AI_ARK_API_BASE}/people/reverse-lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-TOKEN': apiKey },
    body: JSON.stringify(lookupBody),
  })

  const creditsHeader = response.headers.get('x-credit')
  const credits_consumed = creditsHeader ? parseFloat(creditsHeader) : CREDIT_COSTS.ai_ark_reverse_lookup

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI Ark API ${response.status}: ${errorText.slice(0, 200)}`)
  }

  const person = await response.json()
  return { person: person && typeof person === 'object' ? person as Record<string, unknown> : null, credits_consumed }
}

async function callApolloMatch(
  apiKey: string,
  params: Record<string, string>,
): Promise<{ person: Record<string, unknown> | null; credits_consumed: number }> {
  const response = await fetch(`${APOLLO_API_BASE}/people/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Apollo API ${response.status}: ${errorText.slice(0, 200)}`)
  }

  const result = await response.json()
  return {
    person: result.person as Record<string, unknown> | null ?? null,
    credits_consumed: CREDIT_COSTS.apollo_people_match,
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // ---------------------------------------------------------------------------
    // Auth
    // ---------------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    // ---------------------------------------------------------------------------
    // Org resolution
    // ---------------------------------------------------------------------------
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

    // ---------------------------------------------------------------------------
    // API key resolution
    // ---------------------------------------------------------------------------
    const [aiArkCreds, apolloCreds] = await Promise.all([
      serviceClient
        .from('integration_credentials')
        .select('credentials')
        .eq('organization_id', orgId)
        .eq('provider', 'ai_ark')
        .maybeSingle(),
      serviceClient
        .from('integration_credentials')
        .select('credentials')
        .eq('organization_id', orgId)
        .eq('provider', 'apollo')
        .maybeSingle(),
    ])

    const aiArkApiKey = (aiArkCreds.data?.credentials as Record<string, string>)?.api_key
      || Deno.env.get('AI_ARK_API_KEY')

    const apolloApiKey = (apolloCreds.data?.credentials as Record<string, string>)?.api_key
      || Deno.env.get('APOLLO_API_KEY')

    // ---------------------------------------------------------------------------
    // Parse request
    // ---------------------------------------------------------------------------
    const body = await req.json()
    const { action } = body

    if (!action || !['enrich_contact', 'bulk_enrich'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'action must be "enrich_contact" or "bulk_enrich"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ---------------------------------------------------------------------------
    // Check org cascade setting
    // Orgs can disable the Apollo fallback via organization_settings.enrich_cascade_enabled
    // Default: cascade is ON if Apollo key is present
    // ---------------------------------------------------------------------------
    let cascadeEnabled = !!apolloApiKey

    if (cascadeEnabled && !body.disable_cascade) {
      const { data: orgSettings } = await serviceClient
        .from('organization_settings')
        .select('enrich_cascade_enabled')
        .eq('organization_id', orgId)
        .maybeSingle()

      // Only disable if explicitly set to false; null/undefined means "default on"
      if (orgSettings && orgSettings.enrich_cascade_enabled === false) {
        cascadeEnabled = false
      }
    } else if (body.disable_cascade) {
      cascadeEnabled = false
    }

    // ---------------------------------------------------------------------------
    // Action: enrich_contact
    // Single contact enrichment — returns merged person object with attribution
    // ---------------------------------------------------------------------------
    if (action === 'enrich_contact') {
      const { email, linkedin_url, field } = body

      if (!email && !linkedin_url) {
        return new Response(
          JSON.stringify({ error: 'email or linkedin_url required for enrich_contact', code: 'INVALID_PARAMS' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (!aiArkApiKey) {
        return new Response(
          JSON.stringify({ error: 'AI Ark API key not configured. Add it in Settings > Integrations.', code: 'AI_ARK_NOT_CONFIGURED' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const aiArkLookupBody = {
        kind: 'CONTACT',
        search: email ? { email } : { linkedin: linkedin_url },
      }

      let aiArkPerson: Record<string, unknown> | null = null
      let apolloPerson: Record<string, unknown> | null = null
      let aiArkCredits = 0
      let apolloCredits = 0

      // Step 1: AI Ark
      try {
        const result = await callAiArkReverseLookup(aiArkApiKey, aiArkLookupBody)
        aiArkPerson = result.person
        aiArkCredits = result.credits_consumed
      } catch (err) {
        console.warn('[enrich-cascade] AI Ark lookup failed:', err)
      }

      // Step 2: Apollo cascade (if enabled and we want a field Apollo is better at, or AI Ark missed)
      if (cascadeEnabled && apolloApiKey) {
        const apolloParams: Record<string, string> = email
          ? { email }
          : { linkedin_url: linkedin_url as string }
        try {
          const result = await callApolloMatch(apolloApiKey, apolloParams)
          apolloPerson = result.person
          apolloCredits = result.credits_consumed
        } catch (err) {
          console.warn('[enrich-cascade] Apollo match failed:', err)
        }
      }

      // Log credits
      const logPromises: Promise<unknown>[] = []
      if (aiArkCredits > 0) {
        logPromises.push(
          logFlatRateCostEvent(userClient, user.id, orgId, 'ai_ark', 'enrich-cascade-ai-ark', aiArkCredits, 'enrich_cascade')
        )
      }
      if (apolloCredits > 0) {
        logPromises.push(
          logFlatRateCostEvent(userClient, user.id, orgId, 'apollo', 'enrich-cascade-apollo', apolloCredits, 'enrich_cascade')
        )
      }
      await Promise.allSettled(logPromises)

      const { person, attribution } = mergePersonData(
        aiArkPerson,
        apolloPerson,
        'ai_ark',
        'apollo',
      )

      // If a specific field was requested, return just that value
      const fieldValue = field ? (person[field] ?? null) : null

      return new Response(
        JSON.stringify({
          person,
          attribution,
          field_value: fieldValue,
          sources_used: {
            ai_ark: aiArkPerson != null,
            apollo: apolloPerson != null,
          },
          credits_consumed: {
            ai_ark: aiArkCredits,
            apollo: apolloCredits,
            total: aiArkCredits + apolloCredits,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ---------------------------------------------------------------------------
    // Action: bulk_enrich
    // Batch enrichment for a dynamic table column
    // ---------------------------------------------------------------------------
    if (action === 'bulk_enrich') {
      const {
        table_id,
        column_id,
        row_ids,
        max_rows,
        force_refresh = false,
      } = body

      if (!table_id || !column_id) {
        return new Response(
          JSON.stringify({ error: 'table_id and column_id required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (!aiArkApiKey) {
        return new Response(
          JSON.stringify({ error: 'AI Ark API key not configured. Add it in Settings > Integrations.', code: 'AI_ARK_NOT_CONFIGURED' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Get target column config
      const { data: column, error: colError } = await serviceClient
        .from('dynamic_table_columns')
        .select('id, key, label, column_type, ai_ark_property_name, apollo_property_name, table_id')
        .eq('id', column_id)
        .single()

      if (colError || !column) {
        return new Response(
          JSON.stringify({ error: 'Column not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Determine which field to extract (prefer ai_ark_property_name, fallback to apollo_property_name)
      const targetField = (column.ai_ark_property_name || column.apollo_property_name || column.key) as string
      const aiArkFieldDef = AI_ARK_FIELD_MAP[targetField]
      const apolloFieldDef = APOLLO_FIELD_MAP[targetField]

      if (!aiArkFieldDef && !apolloFieldDef) {
        return new Response(
          JSON.stringify({ error: `Unknown field: ${targetField}. Not found in AI Ark or Apollo field maps.` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Get all columns for matching
      const { data: allColumns } = await serviceClient
        .from('dynamic_table_columns')
        .select('id, key, label, column_type, hubspot_property_name')
        .eq('table_id', table_id)

      const columnIdToKey = new Map<string, string>()
      const columnIdToMeta = new Map<string, ColumnMeta>()
      for (const col of allColumns ?? []) {
        columnIdToKey.set(col.id, col.key)
        columnIdToMeta.set(col.id, {
          key: col.key,
          label: (col.label as string) ?? '',
          column_type: (col.column_type as string) ?? '',
          hubspot_property_name: (col.hubspot_property_name as string | null) ?? null,
        })
      }

      // Fetch target rows with their cells
      let rowQuery = serviceClient
        .from('dynamic_table_rows')
        .select('id, source_data, dynamic_table_cells(column_id, value)')
        .eq('table_id', table_id)
        .order('row_index', { ascending: true })

      if (row_ids?.length > 0) {
        rowQuery = rowQuery.in('id', row_ids)
      }
      rowQuery = rowQuery.limit(max_rows ?? 100)

      const { data: rawRows, error: rowError } = await rowQuery
      if (rowError) throw rowError

      const rows: RowData[] = (rawRows ?? []).map((r: Record<string, unknown>) => {
        const cells: Record<string, { column_id: string; value: string | null }> = {}
        for (const cell of (r.dynamic_table_cells as Array<{ column_id: string; value: string | null }>) ?? []) {
          cells[cell.column_id] = cell
        }
        return {
          id: r.id as string,
          source_data: r.source_data as Record<string, unknown> | null,
          cells,
        }
      })

      // Separate into cached vs needs enrichment
      const cachedRows: RowData[] = []
      const needsEnrichment: RowData[] = []

      for (const row of rows) {
        const hasCascadeCache = row.source_data?.enrich_cascade != null
        const hasAiArkCache = row.source_data?.ai_ark != null
        if ((hasCascadeCache || hasAiArkCache) && !force_refresh) {
          cachedRows.push(row)
        } else {
          needsEnrichment.push(row)
        }
      }

      const stats = {
        enriched: 0,
        cached_hits: 0,
        failed: 0,
        skipped: 0,
        credits_consumed: {
          ai_ark: 0,
          apollo: 0,
          total: 0,
        },
      }

      // Process cached rows — extract field from existing source_data
      if (cachedRows.length > 0) {
        const cachedCells = cachedRows.map((row) => {
          const sd = row.source_data!
          // Prefer enrich_cascade merged data, fallback to ai_ark cache
          const cachedMerged = sd.enrich_cascade as Record<string, unknown> | undefined
          const aiArkCached = sd.ai_ark as Record<string, unknown> | undefined

          let cellValue: string | null = null
          let source = 'cache'

          if (cachedMerged) {
            cellValue = (cachedMerged[targetField] as string | null) ?? null
            source = ((sd.enrich_cascade_attribution as Record<string, string> | undefined)?.[targetField]) ?? 'cache'
          } else if (aiArkCached && aiArkFieldDef) {
            cellValue = formatValue(extractField(aiArkCached, aiArkFieldDef.path))
            source = 'ai_ark_cache'
          }

          stats.cached_hits++
          return {
            row_id: row.id,
            column_id,
            value: cellValue,
            status: cellValue != null ? 'enriched' : 'failed',
            source,
            confidence: 1.0,
            error_message: cellValue == null ? `Field "${targetField}" not in cached data` : null,
          }
        })

        await serviceClient
          .from('dynamic_table_cells')
          .upsert(cachedCells, { onConflict: 'row_id,column_id' })
      }

      // Mark needs-enrichment cells as pending
      if (needsEnrichment.length > 0) {
        await serviceClient
          .from('dynamic_table_cells')
          .upsert(
            needsEnrichment.map((row) => ({
              row_id: row.id,
              column_id,
              value: null,
              status: 'pending',
              source: 'enrich_cascade',
            })),
            { onConflict: 'row_id,column_id' },
          )
      }

      // Build matchable rows for AI Ark
      const aiArkMatchable: Array<{
        row: RowData
        aiArkParams: { kind: string; search: Record<string, string> }
        apolloParams: Record<string, string> | null
      }> = []
      const unmatchableRows: RowData[] = []

      for (const row of needsEnrichment) {
        const aiArkParams = buildAiArkLookupParams(row, columnIdToKey, columnIdToMeta)
        const apolloParams = buildApolloMatchParams(row, columnIdToKey, columnIdToMeta)

        if (!aiArkParams && !apolloParams) {
          unmatchableRows.push(row)
        } else {
          aiArkMatchable.push({
            row,
            aiArkParams: aiArkParams ?? { kind: 'CONTACT', search: {} },
            apolloParams,
          })
        }
      }

      // Mark unmatchable rows as failed immediately
      if (unmatchableRows.length > 0) {
        stats.skipped += unmatchableRows.length
        await serviceClient
          .from('dynamic_table_cells')
          .upsert(
            unmatchableRows.map((row) => ({
              row_id: row.id,
              column_id,
              value: null,
              status: 'failed',
              source: 'enrich_cascade',
              error_message: 'Insufficient data for enrichment (need email or LinkedIn URL)',
            })),
            { onConflict: 'row_id,column_id' },
          )
      }

      // Process in batches to respect AI Ark 5/sec rate limit
      for (let i = 0; i < aiArkMatchable.length; i += AI_ARK_CONCURRENT) {
        const batch = aiArkMatchable.slice(i, i + AI_ARK_CONCURRENT)

        await Promise.allSettled(
          batch.map(async ({ row, aiArkParams, apolloParams }) => {
            let aiArkPerson: Record<string, unknown> | null = null
            let apolloPerson: Record<string, unknown> | null = null
            let aiArkCredits = 0
            let apolloCredits = 0

            // Step 1: AI Ark reverse-lookup
            if (aiArkParams.search && Object.keys(aiArkParams.search).length > 0) {
              try {
                const result = await callAiArkReverseLookup(aiArkApiKey, aiArkParams)
                aiArkPerson = result.person
                aiArkCredits = result.credits_consumed
                stats.credits_consumed.ai_ark += aiArkCredits
                stats.credits_consumed.total += aiArkCredits
              } catch (err) {
                console.warn(`[enrich-cascade] AI Ark failed for row ${row.id}:`, err)
              }
            }

            // Step 2: Apollo cascade for missing fields
            if (cascadeEnabled && apolloApiKey && apolloParams) {
              // Only call Apollo if: AI Ark failed entirely, OR the target field is Apollo-primary
              const needsApollo = aiArkPerson == null || APOLLO_PRIMARY_FIELDS.has(targetField)
              if (needsApollo) {
                try {
                  const result = await callApolloMatch(apolloApiKey, apolloParams)
                  apolloPerson = result.person
                  apolloCredits = result.credits_consumed
                  stats.credits_consumed.apollo += apolloCredits
                  stats.credits_consumed.total += apolloCredits
                } catch (err) {
                  console.warn(`[enrich-cascade] Apollo failed for row ${row.id}:`, err)
                }
              }
            }

            if (aiArkPerson == null && apolloPerson == null) {
              stats.failed++
              await serviceClient
                .from('dynamic_table_cells')
                .upsert({
                  row_id: row.id,
                  column_id,
                  value: null,
                  status: 'failed',
                  source: 'enrich_cascade',
                  error_message: 'No match found in AI Ark or Apollo',
                }, { onConflict: 'row_id,column_id' })
              return
            }

            // Merge and attribute
            const { person: mergedPerson, attribution } = mergePersonData(
              aiArkPerson,
              apolloPerson,
              'ai_ark',
              'apollo',
            )

            // Extract target field
            const cellValue = mergedPerson[targetField] ?? null
            const fieldSource = attribution[targetField] ?? 'enrich_cascade'

            // Store merged data in source_data for future cache hits
            const existingSourceData = row.source_data ?? {}
            const updatedSourceData = {
              ...existingSourceData,
              enrich_cascade: mergedPerson,
              enrich_cascade_attribution: attribution,
              ...(aiArkPerson ? { ai_ark: aiArkPerson } : {}),
              ...(apolloPerson ? { apollo: apolloPerson } : {}),
            }

            await serviceClient
              .from('dynamic_table_rows')
              .update({ source_data: updatedSourceData })
              .eq('id', row.id)

            await serviceClient
              .from('dynamic_table_cells')
              .upsert({
                row_id: row.id,
                column_id,
                value: cellValue,
                status: cellValue != null ? 'enriched' : 'failed',
                source: fieldSource,
                confidence: 1.0,
                error_message: cellValue == null ? `Field "${targetField}" not available from any provider` : null,
              }, { onConflict: 'row_id,column_id' })

            // Log credits per-provider
            const creditLogs: Promise<unknown>[] = []
            if (aiArkCredits > 0) {
              creditLogs.push(
                logFlatRateCostEvent(userClient, user.id, orgId, 'ai_ark', 'enrich-cascade-ai-ark', aiArkCredits, 'enrich_cascade')
              )
            }
            if (apolloCredits > 0) {
              creditLogs.push(
                logFlatRateCostEvent(userClient, user.id, orgId, 'apollo', 'enrich-cascade-apollo', apolloCredits, 'enrich_cascade')
              )
            }
            await Promise.allSettled(creditLogs)

            stats.enriched++
          }),
        )

        // Respect AI Ark 5/sec rate limit between batches
        if (i + AI_ARK_CONCURRENT < aiArkMatchable.length) {
          await sleep(AI_ARK_BATCH_DELAY_MS)
        }
      }

      return new Response(
        JSON.stringify({
          processed: rows.length,
          ...stats,
          cascade_enabled: cascadeEnabled,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Should never reach here after the action validation above
    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    console.error('[enrich-cascade] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

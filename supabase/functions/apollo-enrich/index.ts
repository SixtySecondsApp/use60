import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { createConcurrencyLimiter, fetchWithRetry } from '../_shared/rateLimiter.ts'

/**
 * apollo-enrich — Enrich Ops table rows via Apollo People Enrichment API.
 *
 * "Enrich once, column many" pattern:
 *   - Calls Apollo /v1/people/match to get full person+org data
 *   - Caches the FULL response in dynamic_table_rows.source_data.apollo
 *   - Extracts only the requested field (apollo_property_name) into the cell
 *   - Second+ Apollo columns read from cache — zero API calls, zero credits
 *
 * POST body:
 *   { table_id, column_id, row_ids?, max_rows?, reveal_personal_emails?, reveal_phone_number?, force_refresh? }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APOLLO_API_BASE = 'https://api.apollo.io/v1'
const CONCURRENCY = 5
const DEFAULT_BATCH_SIZE = 100

// ---------------------------------------------------------------------------
// Apollo field mapping: property_name → response path + column type
// ---------------------------------------------------------------------------

const APOLLO_FIELD_MAP: Record<string, { path: string; label: string }> = {
  // Contact
  email:              { path: 'email',                                    label: 'Email' },
  personal_email:     { path: 'personal_emails[0]',                      label: 'Personal Email' },
  phone:              { path: 'phone_numbers[0].sanitized_number',       label: 'Phone' },
  mobile_phone:       { path: 'mobile_phone',                            label: 'Mobile Phone' },
  linkedin_url:       { path: 'linkedin_url',                            label: 'LinkedIn' },
  // Professional
  title:              { path: 'title',                                   label: 'Title' },
  headline:           { path: 'headline',                                label: 'Headline' },
  seniority:          { path: 'seniority',                               label: 'Seniority' },
  departments:        { path: 'departments',                             label: 'Departments' },
  // Location
  city:               { path: 'city',                                    label: 'City' },
  state:              { path: 'state',                                   label: 'State' },
  country:            { path: 'country',                                 label: 'Country' },
  // Social
  twitter_url:        { path: 'twitter_url',                             label: 'Twitter' },
  github_url:         { path: 'github_url',                              label: 'GitHub' },
  facebook_url:       { path: 'facebook_url',                            label: 'Facebook' },
  photo_url:          { path: 'photo_url',                               label: 'Photo URL' },
  // Email quality
  email_status:       { path: 'email_status',                            label: 'Email Status' },
  email_confidence:   { path: 'extrapolated_email_confidence',           label: 'Email Confidence' },
  // Company (from embedded organization)
  company_name:       { path: 'organization.name',                       label: 'Company Name' },
  company_domain:     { path: 'organization.primary_domain',             label: 'Company Domain' },
  company_industry:   { path: 'organization.industry',                   label: 'Industry' },
  company_employees:  { path: 'organization.estimated_num_employees',    label: 'Employees' },
  company_revenue:    { path: 'organization.annual_revenue',             label: 'Revenue' },
  company_funding:    { path: 'organization.latest_funding_stage',       label: 'Funding Stage' },
  company_phone:      { path: 'organization.phone',                      label: 'Company Phone' },
  company_city:       { path: 'organization.city',                       label: 'Company City' },
  company_country:    { path: 'organization.country',                    label: 'Company Country' },
  company_linkedin:   { path: 'organization.linkedin_url',               label: 'Company LinkedIn' },
  company_website:    { path: 'organization.website_url',                label: 'Company Website' },
  company_tech_stack: { path: 'organization.technology_names',           label: 'Tech Stack' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a dotted path like "organization.name" or "phone_numbers[0].sanitized_number" */
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

/** Format extracted value for cell storage */
function formatValue(value: unknown): string | null {
  if (value == null) return null
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

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

/**
 * Build Apollo match params from row cell data.
 *
 * Uses a smart resolution strategy that matches by:
 *   1. column_type (e.g., 'email', 'linkedin', 'company')
 *   2. column label (case-insensitive fuzzy: "Email", "Work Email", "First Name")
 *   3. column key (legacy: 'email', 'first_name', etc.)
 *   4. hubspot_property_name (e.g., 'email', 'firstname', 'company')
 */
function buildMatchParams(
  row: RowData,
  _columnKeyToId: Map<string, string>,
  columnIdToKey: Map<string, string>,
  columnIdToMeta: Map<string, ColumnMeta>,
): Record<string, string> | null {
  // Build a semantic lookup: for each cell, tag it with ALL identifiers
  // so we can match flexibly
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
    const label = meta?.label ?? ''
    const colType = meta?.column_type ?? ''
    const hsProp = meta?.hubspot_property_name ?? ''

    // --- Email ---
    if (
      colType === 'email' ||
      key === 'email' || key === 'work_email' ||
      label.includes('email') ||
      hsProp === 'email' || hsProp === 'hs_email'
    ) {
      if (!emailVal) emailVal = cell.value
    }

    // --- First Name ---
    if (
      key === 'first_name' || key === 'firstname' ||
      label === 'first name' || label === 'firstname' || label === 'first' ||
      hsProp === 'firstname'
    ) {
      if (!firstNameVal) firstNameVal = cell.value
    }

    // --- Last Name ---
    if (
      key === 'last_name' || key === 'lastname' ||
      label === 'last name' || label === 'lastname' || label === 'last' || label === 'surname' ||
      hsProp === 'lastname'
    ) {
      if (!lastNameVal) lastNameVal = cell.value
    }

    // --- Full Name ---
    if (
      colType === 'person' ||
      key === 'full_name' || key === 'name' || key === 'contact_name' ||
      label === 'name' || label === 'full name' || label === 'contact' || label === 'contact name' ||
      hsProp === 'name'
    ) {
      if (!fullNameVal) fullNameVal = cell.value
    }

    // --- Domain ---
    if (
      key === 'company_domain' || key === 'domain' || key === 'website' ||
      label === 'domain' || label === 'company domain' || label === 'website' ||
      hsProp === 'domain' || hsProp === 'website' || hsProp === 'hs_domain'
    ) {
      if (!domainVal) domainVal = cell.value
    }

    // --- Company ---
    if (
      colType === 'company' ||
      key === 'company' || key === 'company_name' || key === 'organization' ||
      label === 'company' || label === 'company name' || label === 'organization' || label === 'org' ||
      hsProp === 'company' || hsProp === 'associatedcompanyid'
    ) {
      if (!companyVal) companyVal = cell.value
    }

    // --- LinkedIn ---
    if (
      colType === 'linkedin' ||
      key === 'linkedin_url' || key === 'linkedin' ||
      label.includes('linkedin') ||
      hsProp === 'linkedin_url' || hsProp === 'hs_linkedin_url'
    ) {
      if (!linkedinVal) linkedinVal = cell.value
    }
  }

  // Strategy 1: email match (most accurate)
  if (emailVal) {
    return { email: emailVal }
  }

  // Strategy 2: name + domain/company
  if (firstNameVal && lastNameVal && domainVal) {
    return { first_name: firstNameVal, last_name: lastNameVal, domain: domainVal }
  }
  if (firstNameVal && lastNameVal && companyVal) {
    return { first_name: firstNameVal, last_name: lastNameVal, organization_name: companyVal }
  }
  if (fullNameVal && domainVal) {
    return { name: fullNameVal, domain: domainVal }
  }
  if (fullNameVal && companyVal) {
    return { name: fullNameVal, organization_name: companyVal }
  }

  // Strategy 3: linkedin URL
  if (linkedinVal) {
    return { linkedin_url: linkedinVal }
  }

  return null // insufficient data
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Auth: validate JWT, get user + org
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    // Get user's org
    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) throw new Error('No organization found')
    const orgId = membership.org_id

    // Parse request
    const {
      table_id,
      column_id,
      row_ids,
      max_rows,
      reveal_personal_emails = false,
      reveal_phone_number = false,
      force_refresh = false,
      skip_completed = false,
    } = await req.json()

    if (!table_id || !column_id) {
      return new Response(
        JSON.stringify({ error: 'table_id and column_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Key-to-Apollo-property fallback map (mirrors copilot-dynamic-table ENRICH_COLUMN_MAP)
    const KEY_TO_APOLLO: Record<string, string> = {
      email: 'email',
      phone: 'phone',
      linkedin_url: 'linkedin_url',
      city: 'city',
      website_url: 'company_website',
      funding_stage: 'company_funding',
      employees: 'company_employees',
    }

    // 1. Get target column config (which Apollo field to extract)
    const { data: column, error: colError } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, key, apollo_property_name, table_id')
      .eq('id', column_id)
      .single()

    if (colError || !column) {
      return new Response(
        JSON.stringify({ error: 'Column not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Use apollo_property_name if set, otherwise infer from column key
    let apolloField = column.apollo_property_name as string | null
    if (!apolloField && column.key) {
      apolloField = KEY_TO_APOLLO[column.key as string] ?? null
      // Backfill the column so future calls don't need the fallback
      if (apolloField) {
        serviceClient
          .from('dynamic_table_columns')
          .update({ apollo_property_name: apolloField })
          .eq('id', column_id)
          .then(() => {}) // fire-and-forget
      }
    }

    if (!apolloField || !APOLLO_FIELD_MAP[apolloField]) {
      return new Response(
        JSON.stringify({ error: `Unknown Apollo field: ${apolloField}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const fieldDef = APOLLO_FIELD_MAP[apolloField]

    // 2. Get Apollo API key
    const { data: creds } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'apollo')
      .maybeSingle()

    const apolloApiKey = (creds?.credentials as Record<string, string>)?.api_key
      || Deno.env.get('APOLLO_API_KEY')

    if (!apolloApiKey) {
      return new Response(
        JSON.stringify({ error: 'Apollo API key not configured. Add it in Settings > Integrations.', code: 'APOLLO_NOT_CONFIGURED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Get all columns (for matching — need key, label, column_type, hubspot_property_name)
    const { data: allColumns } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, key, label, column_type, hubspot_property_name')
      .eq('table_id', table_id)

    const columnKeyToId = new Map<string, string>()
    const columnIdToKey = new Map<string, string>()
    const columnIdToMeta = new Map<string, { key: string; label: string; column_type: string; hubspot_property_name: string | null }>()
    for (const col of allColumns ?? []) {
      columnKeyToId.set(col.key, col.id)
      columnIdToKey.set(col.id, col.key)
      columnIdToMeta.set(col.id, {
        key: col.key,
        label: (col.label as string ?? '').toLowerCase(),
        column_type: col.column_type as string ?? '',
        hubspot_property_name: col.hubspot_property_name as string | null,
      })
    }

    // 4. Fetch target rows with their cells
    let rowQuery = serviceClient
      .from('dynamic_table_rows')
      .select('id, source_data, dynamic_table_cells(column_id, value)')
      .eq('table_id', table_id)
      .order('row_index', { ascending: true })

    if (row_ids?.length > 0) {
      rowQuery = rowQuery.in('id', row_ids)
    }

    const limit = max_rows ?? DEFAULT_BATCH_SIZE
    rowQuery = rowQuery.limit(limit)

    const { data: rawRows, error: rowError } = await rowQuery
    if (rowError) throw rowError

    // Transform rows into usable format
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

    // 4b. Filter out already-completed rows when skip_completed is enabled
    let filteredRows = rows
    if (skip_completed && rows.length > 0) {
      const rowIdList = rows.map((r) => r.id)
      const { data: completedCells } = await serviceClient
        .from('dynamic_table_cells')
        .select('row_id')
        .in('row_id', rowIdList)
        .eq('column_id', column_id)
        .eq('status', 'complete')

      if (completedCells && completedCells.length > 0) {
        const completedRowIds = new Set(completedCells.map((c) => c.row_id))
        filteredRows = rows.filter((r) => !completedRowIds.has(r.id))
        console.log(`[apollo-enrich] skip_completed: filtered out ${completedCells.length} already-complete rows, ${filteredRows.length} remaining`)
      }
    }

    // 5. Separate rows into cached vs needs-enrichment
    const cachedRows: RowData[] = []
    const needsEnrichment: RowData[] = []

    for (const row of filteredRows) {
      const apolloCache = row.source_data?.apollo as Record<string, unknown> | undefined
      if (apolloCache && !force_refresh) {
        cachedRows.push(row)
      } else {
        needsEnrichment.push(row)
      }
    }

    // 6. Process cached rows immediately (extract field, write cell)
    if (cachedRows.length > 0) {
      const cachedCells = cachedRows.map((row) => {
        const apolloData = row.source_data!.apollo as Record<string, unknown>
        const rawValue = extractField(apolloData, fieldDef.path)
        return {
          row_id: row.id,
          column_id: column_id,
          value: formatValue(rawValue),
          status: rawValue != null ? 'complete' : 'failed',
          source: 'apollo_cache',
          confidence: 1.0,
          error_message: rawValue == null ? 'Field not available in cached Apollo data' : null,
        }
      })

      await serviceClient
        .from('dynamic_table_cells')
        .upsert(cachedCells, { onConflict: 'row_id,column_id' })
    }

    // 7. Mark all needs-enrichment cells as pending
    if (needsEnrichment.length > 0) {
      const pendingCells = needsEnrichment.map((row) => ({
        row_id: row.id,
        column_id: column_id,
        value: null,
        status: 'pending',
        source: 'apollo',
      }))

      await serviceClient
        .from('dynamic_table_cells')
        .upsert(pendingCells, { onConflict: 'row_id,column_id' })
    }

    // 8. Enrich rows that need it via Apollo API
    const stats = { enriched: 0, cached_hits: cachedRows.length, failed: 0, skipped: 0, credits_estimated: 0 }

    // Separate rows with match params from those without
    const matchableRows: Array<{ row: RowData; params: Record<string, string> }> = []
    for (const row of needsEnrichment) {
      // Priority 1: Use Apollo person ID from source_data (guaranteed match, no name guessing)
      const apolloId = (row.source_data?.apollo_id as string)
        || (row.source_data?.id as string)
      if (apolloId) {
        matchableRows.push({ row, params: { id: apolloId } })
        continue
      }

      // Priority 2: Match by email, name+company, or LinkedIn from cell data
      const matchParams = buildMatchParams(row, columnKeyToId, columnIdToKey, columnIdToMeta)
      if (!matchParams) {
        stats.skipped++
        await serviceClient
          .from('dynamic_table_cells')
          .upsert({
            row_id: row.id,
            column_id: column_id,
            value: null,
            status: 'failed',
            source: 'apollo',
            error_message: 'Insufficient data for Apollo matching (need email, name+company, or LinkedIn URL)',
          }, { onConflict: 'row_id,column_id' })
      } else {
        matchableRows.push({ row, params: matchParams })
      }
    }

    // Helper to process a single Apollo person result and store in DB
    async function processEnrichResult(row: RowData, person: Record<string, unknown> | null) {
      if (!person) {
        stats.failed++
        await serviceClient
          .from('dynamic_table_cells')
          .upsert({
            row_id: row.id,
            column_id: column_id,
            value: null,
            status: 'failed',
            source: 'apollo',
            error_message: 'No match found in Apollo',
          }, { onConflict: 'row_id,column_id' })
        return
      }

      // Cache full Apollo response in source_data.apollo
      const existingSourceData = row.source_data ?? {}
      const updatedSourceData = { ...existingSourceData, apollo: person }

      await serviceClient
        .from('dynamic_table_rows')
        .update({ source_data: updatedSourceData })
        .eq('id', row.id)

      // Extract target field value
      const rawValue = extractField(person, fieldDef.path)
      const cellValue = formatValue(rawValue)

      await serviceClient
        .from('dynamic_table_cells')
        .upsert({
          row_id: row.id,
          column_id: column_id,
          value: cellValue,
          status: cellValue != null ? 'complete' : 'failed',
          source: 'apollo',
          confidence: 1.0,
          error_message: cellValue == null ? `Field "${apolloField}" not available for this contact` : null,
        }, { onConflict: 'row_id,column_id' })

      stats.enriched++
      stats.credits_estimated += 1 + (reveal_personal_emails ? 1 : 0) + (reveal_phone_number ? 8 : 0)
    }

    // Use Bulk API for 10+ rows, single API for fewer
    const BULK_BATCH_SIZE = 10
    const useBulkApi = matchableRows.length >= BULK_BATCH_SIZE

    if (useBulkApi) {
      // --- Bulk People Enrichment: /v1/people/bulk_match (batches of 10) ---
      const limiter = createConcurrencyLimiter(3) // Lower concurrency for bulk
      const batches: Array<typeof matchableRows> = []
      for (let i = 0; i < matchableRows.length; i += BULK_BATCH_SIZE) {
        batches.push(matchableRows.slice(i, i + BULK_BATCH_SIZE))
      }

      await Promise.allSettled(
        batches.map((batch) =>
          limiter(async () => {
            try {
              const details = batch.map(({ params }) => {
                const detail: Record<string, unknown> = { ...params }
                if (reveal_personal_emails) detail.reveal_personal_emails = true
                if (reveal_phone_number) detail.reveal_phone_number = true
                return detail
              })

              const response = await fetchWithRetry(
                `${APOLLO_API_BASE}/people/bulk_match`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ api_key: apolloApiKey, details }),
                },
                { maxRetries: 2, baseDelayMs: 3000, logPrefix: '[apollo-enrich-bulk]' },
              )

              if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Apollo Bulk API ${response.status}: ${errorText.slice(0, 200)}`)
              }

              const bulkResult = await response.json()
              const matches = (bulkResult.matches ?? bulkResult.people ?? []) as Array<Record<string, unknown> | null>

              // Process each result (matches array is in same order as details)
              await Promise.all(
                batch.map(async ({ row }, idx) => {
                  const person = matches[idx] ?? null
                  await processEnrichResult(row, person)
                }),
              )
            } catch (err) {
              // If bulk fails, mark all rows in this batch as failed
              for (const { row } of batch) {
                stats.failed++
                await serviceClient
                  .from('dynamic_table_cells')
                  .upsert({
                    row_id: row.id,
                    column_id: column_id,
                    value: null,
                    status: 'failed',
                    source: 'apollo',
                    error_message: String(err).slice(0, 500),
                  }, { onConflict: 'row_id,column_id' })
              }
            }
          }),
        ),
      )
    } else {
      // --- Single enrichment: /v1/people/match (fewer than 10 rows) ---
      const limiter = createConcurrencyLimiter(CONCURRENCY)
      await Promise.allSettled(
        matchableRows.map(({ row, params }) =>
          limiter(async () => {
            try {
              const apolloBody: Record<string, unknown> = {
                api_key: apolloApiKey,
                ...params,
              }

              if (reveal_personal_emails) apolloBody.reveal_personal_emails = true
              if (reveal_phone_number) apolloBody.reveal_phone_number = true

              const response = await fetchWithRetry(
                `${APOLLO_API_BASE}/people/match`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(apolloBody),
                },
                { maxRetries: 2, baseDelayMs: 2000, logPrefix: '[apollo-enrich]' },
              )

              if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Apollo API ${response.status}: ${errorText.slice(0, 200)}`)
              }

              const apolloResult = await response.json()
              const person = apolloResult.person as Record<string, unknown> | null
              await processEnrichResult(row, person)
            } catch (err) {
              stats.failed++
              await serviceClient
                .from('dynamic_table_cells')
                .upsert({
                  row_id: row.id,
                  column_id: column_id,
                  value: null,
                  status: 'failed',
                  source: 'apollo',
                  error_message: String(err).slice(0, 500),
                }, { onConflict: 'row_id,column_id' })
            }
          }),
        ),
      )
    }

    // Post-enrichment: update full_name cells with unmasked names from Apollo
    // Apollo search masks last names ("****") but the enrich/match API returns real names
    const nameColumnId = columnKeyToId.get('full_name')
    if (nameColumnId && needsEnrichment.length > 0) {
      try {
        const { data: enrichedRows } = await serviceClient
          .from('dynamic_table_rows')
          .select('id, source_data')
          .in('id', needsEnrichment.map(r => r.id))

        if (enrichedRows && enrichedRows.length > 0) {
          const nameCellUpserts: Array<{ row_id: string; column_id: string; value: string; source: string; status: string }> = []

          for (const row of enrichedRows) {
            const sd = (row.source_data || {}) as Record<string, unknown>
            const apolloData = sd.apollo as Record<string, unknown> | undefined
            if (!apolloData) continue

            const firstName = apolloData.first_name as string | undefined
            const lastName = apolloData.last_name as string | undefined

            // Skip if last name is still masked or missing
            if (!firstName && !lastName) continue
            if (lastName && /^\*+$/.test(lastName)) continue

            const fullName = [firstName, lastName].filter(Boolean).join(' ')
            if (fullName) {
              nameCellUpserts.push({
                row_id: row.id,
                column_id: nameColumnId,
                value: fullName,
                source: 'apollo',
                status: 'complete',
              })
            }
          }

          if (nameCellUpserts.length > 0) {
            await serviceClient
              .from('dynamic_table_cells')
              .upsert(nameCellUpserts, { onConflict: 'row_id,column_id' })
            console.log(`[apollo-enrich] Updated ${nameCellUpserts.length} name cells with unmasked data`)
          }
        }
      } catch (nameErr) {
        console.warn('[apollo-enrich] Post-enrichment name update warning:', nameErr)
      }
    }

    return new Response(
      JSON.stringify({
        processed: filteredRows.length,
        ...stats,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    console.error('[apollo-enrich] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

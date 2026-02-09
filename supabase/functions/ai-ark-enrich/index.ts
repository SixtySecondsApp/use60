import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * ai-ark-enrich — Enrich Ops table rows via AI Ark People Reverse Lookup API.
 *
 * "Enrich once, column many" pattern:
 *   - Calls AI Ark POST /v1/people/reverse-lookup to get full person data
 *   - Caches the FULL response in dynamic_table_rows.source_data.ai_ark
 *   - Extracts only the requested field into the cell
 *   - Second+ AI Ark columns read from cache — zero API calls
 *
 * POST body:
 *   { action: 'reverse_lookup' | 'bulk_enrich', ... }
 *
 * Actions:
 *   - reverse_lookup: Single contact enrichment (email, linkedin_url, or full_name+company_name)
 *   - bulk_enrich: Batch enrichment via individual reverse-lookup calls (no bulk API exists)
 *     Processes in batches of 4 concurrent requests to stay under 5/sec rate limit.
 */

const AI_ARK_API_BASE = 'https://api.ai-ark.com/api/developer-portal/v1'
const CONCURRENT_BATCH_SIZE = 4
const BATCH_DELAY_MS = 250 // delay between batches to stay under 5/sec rate limit

// ---------------------------------------------------------------------------
// AI Ark field mapping: property_name → response path + label
// Paths use dot notation with array indexing (e.g. "experiences[0].company.name")
// ---------------------------------------------------------------------------

const AI_ARK_FIELD_MAP: Record<string, { path: string; label: string }> = {
  // Name
  first_name:         { path: 'profile.first_name',                    label: 'First Name' },
  last_name:          { path: 'profile.last_name',                     label: 'Last Name' },
  full_name:          { path: 'profile.full_name',                     label: 'Full Name' },

  // Professional
  title:              { path: 'profile.title',                         label: 'Title' },
  headline:           { path: 'profile.headline',                      label: 'Headline' },
  seniority:          { path: 'department.seniority',                  label: 'Seniority' },
  summary:            { path: 'profile.summary',                       label: 'Summary' },

  // Links
  linkedin_url:       { path: 'link.linkedin',                         label: 'LinkedIn' },
  twitter:            { path: 'link.twitter',                          label: 'Twitter' },
  github:             { path: 'link.github',                           label: 'GitHub' },

  // Location
  city:               { path: 'location.city',                         label: 'City' },
  state:              { path: 'location.state',                        label: 'State' },
  country:            { path: 'location.country',                      label: 'Country' },
  location:           { path: 'location.default',                      label: 'Location' },

  // Company (from top-level company object or first position_group)
  company:            { path: 'company.summary.name',                  label: 'Company' },
  company_name:       { path: 'company.summary.name',                  label: 'Company Name' },
  company_domain:     { path: 'company.link.domain',                   label: 'Company Domain' },

  // Other
  industry:           { path: 'industry',                              label: 'Industry' },
  photo_url:          { path: 'profile.picture.source',                label: 'Photo URL' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a dotted path like "profile.title" or "experiences[0].company.name" */
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
}

/**
 * Build AI Ark reverse-lookup request body from row cell data.
 * Returns { kind: "CONTACT", search: { email } } or { kind: "CONTACT", search: { linkedin } }
 * or null if insufficient data.
 *
 * Note: AI Ark reverse-lookup does NOT support name+company search — only email or linkedin.
 * We still detect name+company from cells but will skip those rows since the API can't handle them.
 */
function buildLookupParams(
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

    // --- Email ---
    if (
      colType === 'email' ||
      key === 'email' || key === 'work_email' ||
      label.toLowerCase().includes('email')
    ) {
      if (!emailVal) emailVal = cell.value
    }

    // --- LinkedIn ---
    if (
      colType === 'linkedin' ||
      key === 'linkedin_url' || key === 'linkedin' ||
      label.toLowerCase().includes('linkedin')
    ) {
      if (!linkedinVal) linkedinVal = cell.value
    }
  }

  // Strategy 1: email (most accurate)
  if (emailVal) {
    return { kind: 'CONTACT', search: { email: emailVal } }
  }

  // Strategy 2: LinkedIn URL
  if (linkedinVal) {
    return { kind: 'CONTACT', search: { linkedin: linkedinVal } }
  }

  return null // insufficient data — API only supports email or linkedin
}

/**
 * Call AI Ark reverse-lookup API for a single person.
 * Returns { person, credits_consumed } or throws on failure.
 */
async function callReverseLookup(
  apiKey: string,
  lookupBody: { kind: string; search: Record<string, string> },
): Promise<{ person: Record<string, unknown> | null; credits_consumed: number }> {
  const response = await fetch(`${AI_ARK_API_BASE}/people/reverse-lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TOKEN': apiKey,
    },
    body: JSON.stringify(lookupBody),
  })

  const creditsHeader = response.headers.get('x-credit')
  const credits_consumed = creditsHeader ? parseInt(creditsHeader, 10) : 0

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI Ark API ${response.status}: ${errorText.slice(0, 200)}`)
  }

  const personData = await response.json()
  return { person: personData, credits_consumed }
}

/** Sleep utility for rate limiting */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Auth: validate JWT, get user + org
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
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

    // Get AI Ark API key
    const { data: creds } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'ai_ark')
      .maybeSingle()

    const aiArkApiKey = (creds?.credentials as Record<string, string>)?.api_key
      || Deno.env.get('AI_ARK_API_KEY')

    if (!aiArkApiKey) {
      return new Response(
        JSON.stringify({
          error: 'AI Ark API key not configured. Add it in Settings > Integrations.',
          code: 'AI_ARK_NOT_CONFIGURED'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Parse request
    const body = await req.json()
    const { action } = body

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'action required (reverse_lookup or bulk_enrich)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ---------------------------------------------------------------------------
    // Action: reverse_lookup (single contact enrichment)
    // ---------------------------------------------------------------------------
    if (action === 'reverse_lookup') {
      const { email, linkedin_url, full_name, company_name } = body

      if (!email && !linkedin_url && !(full_name && company_name)) {
        return new Response(
          JSON.stringify({
            error: 'Provide email, linkedin_url, or (full_name + company_name)',
            code: 'INVALID_PARAMS'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Build the reverse-lookup request body
      const lookupBody: { kind: string; search: Record<string, string> } = {
        kind: 'CONTACT',
        search: {},
      }

      if (email) {
        lookupBody.search.email = email
      } else if (linkedin_url) {
        lookupBody.search.linkedin = linkedin_url
      } else if (full_name && company_name) {
        // Note: AI Ark reverse-lookup may not support name+company,
        // but we pass it through in case the API adds support
        lookupBody.search.full_name = full_name
        lookupBody.search.company_name = company_name
      }

      const { person, credits_consumed } = await callReverseLookup(aiArkApiKey, lookupBody)

      return new Response(
        JSON.stringify({
          person,
          cached: false,
          credits_consumed,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ---------------------------------------------------------------------------
    // Action: bulk_enrich (batch enrichment for dynamic table)
    // Uses individual reverse-lookup calls (no bulk API exists).
    // Processes in batches of 4 concurrent requests to stay under 5/sec rate limit.
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

      // 1. Get target column config (which AI Ark field to extract)
      const { data: column, error: colError } = await serviceClient
        .from('dynamic_table_columns')
        .select('id, ai_ark_property_name, table_id')
        .eq('id', column_id)
        .single()

      if (colError || !column) {
        return new Response(
          JSON.stringify({ error: 'Column not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const aiArkField = column.ai_ark_property_name as string
      if (!aiArkField || !AI_ARK_FIELD_MAP[aiArkField]) {
        return new Response(
          JSON.stringify({ error: `Unknown AI Ark field: ${aiArkField}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const fieldDef = AI_ARK_FIELD_MAP[aiArkField]

      // 2. Get all columns (for matching email/linkedin from cells)
      const { data: allColumns } = await serviceClient
        .from('dynamic_table_columns')
        .select('id, key, label, column_type')
        .eq('table_id', table_id)

      const columnIdToKey = new Map<string, string>()
      const columnIdToMeta = new Map<string, { key: string; label: string; column_type: string }>()
      for (const col of allColumns ?? []) {
        columnIdToKey.set(col.id, col.key)
        columnIdToMeta.set(col.id, {
          key: col.key,
          label: (col.label as string ?? ''),
          column_type: col.column_type as string ?? '',
        })
      }

      // 3. Fetch target rows with their cells
      let rowQuery = serviceClient
        .from('dynamic_table_rows')
        .select('id, source_data, dynamic_table_cells(column_id, value)')
        .eq('table_id', table_id)
        .order('row_index', { ascending: true })

      if (row_ids?.length > 0) {
        rowQuery = rowQuery.in('id', row_ids)
      }

      const limit = max_rows ?? 100
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

      // 4. Separate rows into cached vs needs-enrichment
      const cachedRows: RowData[] = []
      const needsEnrichment: RowData[] = []

      for (const row of rows) {
        const aiArkCache = row.source_data?.ai_ark as Record<string, unknown> | undefined
        if (aiArkCache && !force_refresh) {
          cachedRows.push(row)
        } else {
          needsEnrichment.push(row)
        }
      }

      // 5. Process cached rows immediately (extract field, write cell)
      if (cachedRows.length > 0) {
        const cachedCells = cachedRows.map((row) => {
          const aiArkData = row.source_data!.ai_ark as Record<string, unknown>
          const rawValue = extractField(aiArkData, fieldDef.path)
          return {
            row_id: row.id,
            column_id: column_id,
            value: formatValue(rawValue),
            status: rawValue != null ? 'enriched' : 'failed',
            source: 'ai_ark_cache',
            confidence: 1.0,
            error_message: rawValue == null ? 'Field not available in cached AI Ark data' : null,
          }
        })

        await serviceClient
          .from('dynamic_table_cells')
          .upsert(cachedCells, { onConflict: 'row_id,column_id' })
      }

      // 6. Mark all needs-enrichment cells as pending
      if (needsEnrichment.length > 0) {
        const pendingCells = needsEnrichment.map((row) => ({
          row_id: row.id,
          column_id: column_id,
          value: null,
          status: 'pending',
          source: 'ai_ark',
        }))

        await serviceClient
          .from('dynamic_table_cells')
          .upsert(pendingCells, { onConflict: 'row_id,column_id' })
      }

      // 7. Enrich rows that need it via individual AI Ark reverse-lookup calls
      const stats = {
        enriched: 0,
        cached_hits: cachedRows.length,
        failed: 0,
        skipped: 0,
        credits_consumed: 0,
      }

      // Build lookup params for each row
      const matchableRows: Array<{ row: RowData; params: { kind: string; search: Record<string, string> } }> = []
      for (const row of needsEnrichment) {
        const lookupParams = buildLookupParams(row, columnIdToKey, columnIdToMeta)
        if (!lookupParams) {
          stats.skipped++
          await serviceClient
            .from('dynamic_table_cells')
            .upsert({
              row_id: row.id,
              column_id: column_id,
              value: null,
              status: 'failed',
              source: 'ai_ark',
              error_message: 'Insufficient data for AI Ark lookup (need email or LinkedIn URL)',
            }, { onConflict: 'row_id,column_id' })
        } else {
          matchableRows.push({ row, params: lookupParams })
        }
      }

      // Helper to process a single AI Ark person result and store in DB
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
              source: 'ai_ark',
              error_message: 'No match found in AI Ark',
            }, { onConflict: 'row_id,column_id' })
          return
        }

        // Cache full AI Ark response in source_data.ai_ark
        const existingSourceData = row.source_data ?? {}
        const updatedSourceData = { ...existingSourceData, ai_ark: person }

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
            status: cellValue != null ? 'enriched' : 'failed',
            source: 'ai_ark',
            confidence: 1.0,
            error_message: cellValue == null ? `Field "${aiArkField}" not available for this contact` : null,
          }, { onConflict: 'row_id,column_id' })

        stats.enriched++
      }

      // Process in batches of CONCURRENT_BATCH_SIZE (4) to stay under 5/sec rate limit
      for (let i = 0; i < matchableRows.length; i += CONCURRENT_BATCH_SIZE) {
        const batch = matchableRows.slice(i, i + CONCURRENT_BATCH_SIZE)

        await Promise.all(
          batch.map(async ({ row, params }) => {
            try {
              const { person, credits_consumed } = await callReverseLookup(aiArkApiKey, params)
              stats.credits_consumed += credits_consumed
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
                  source: 'ai_ark',
                  error_message: String(err).slice(0, 500),
                }, { onConflict: 'row_id,column_id' })
            }
          }),
        )

        // Delay between batches to respect rate limits (5 req/sec)
        if (i + CONCURRENT_BATCH_SIZE < matchableRows.length) {
          await sleep(BATCH_DELAY_MS)
        }
      }

      return new Response(
        JSON.stringify({
          processed: rows.length,
          ...stats,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Unknown action
    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    console.error('[ai-ark-enrich] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

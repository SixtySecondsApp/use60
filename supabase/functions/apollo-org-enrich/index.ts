import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { createConcurrencyLimiter, fetchWithRetry } from '../_shared/rateLimiter.ts'

/**
 * apollo-org-enrich — Enrich Ops table rows with Apollo Organization data.
 *
 * Uses "enrich once, column many" pattern (same as apollo-enrich):
 *   - Calls Apollo GET /v1/organizations/enrich?domain=...
 *   - Caches full org response in dynamic_table_rows.source_data.apollo_org
 *   - Extracts requested field into the cell
 *   - Second+ org columns read from cache
 *
 * POST body:
 *   { table_id, column_id, row_ids?, max_rows?, force_refresh? }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1'
const CONCURRENCY = 5
const DEFAULT_BATCH_SIZE = 100

// ---------------------------------------------------------------------------
// Apollo Organization field mapping
// ---------------------------------------------------------------------------

const APOLLO_ORG_FIELD_MAP: Record<string, { path: string; label: string }> = {
  org_name:            { path: 'name',                     label: 'Company Name' },
  org_domain:          { path: 'primary_domain',           label: 'Domain' },
  org_industry:        { path: 'industry',                 label: 'Industry' },
  org_employees:       { path: 'estimated_num_employees',  label: 'Employees' },
  org_revenue:         { path: 'annual_revenue',           label: 'Annual Revenue' },
  org_funding:         { path: 'latest_funding_stage',     label: 'Funding Stage' },
  org_funding_total:   { path: 'total_funding',            label: 'Total Funding' },
  org_founded:         { path: 'founded_year',             label: 'Founded Year' },
  org_phone:           { path: 'phone',                    label: 'Company Phone' },
  org_city:            { path: 'city',                     label: 'HQ City' },
  org_state:           { path: 'state',                    label: 'HQ State' },
  org_country:         { path: 'country',                  label: 'HQ Country' },
  org_linkedin:        { path: 'linkedin_url',             label: 'LinkedIn' },
  org_website:         { path: 'website_url',              label: 'Website' },
  org_twitter:         { path: 'twitter_url',              label: 'Twitter' },
  org_facebook:        { path: 'facebook_url',             label: 'Facebook' },
  org_description:     { path: 'short_description',        label: 'Description' },
  org_tech_stack:      { path: 'technology_names',         label: 'Tech Stack' },
  org_keywords:        { path: 'keywords',                 label: 'Keywords' },
  org_seo_description: { path: 'seo_description',          label: 'SEO Description' },
  org_logo:            { path: 'logo_url',                 label: 'Logo URL' },
  org_type:            { path: 'organization_type',        label: 'Org Type' },
}

// ---------------------------------------------------------------------------
// Helpers
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

interface RowData {
  id: string
  source_data: Record<string, unknown> | null
  cells: Record<string, { column_id: string; value: string | null }>
}

/** Find domain for org enrichment from row cell data */
function findDomain(
  row: RowData,
  columnIdToKey: Map<string, string>,
): string | null {
  const values: Record<string, string> = {}
  for (const [, cell] of Object.entries(row.cells)) {
    const key = columnIdToKey.get(cell.column_id)
    if (key && cell.value) values[key] = cell.value
  }

  // Try various domain columns
  const domain = values.company_domain || values.domain || values.website || values.org_domain
  if (domain) {
    // Strip protocol and path if present
    return domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim()
  }

  // Try company name as fallback (Apollo supports name-based org search too)
  return null
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

    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

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
      force_refresh = false,
    } = await req.json()

    if (!table_id || !column_id) {
      return new Response(
        JSON.stringify({ error: 'table_id and column_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Get target column config
    const { data: column, error: colError } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, apollo_property_name, table_id')
      .eq('id', column_id)
      .single()

    if (colError || !column) {
      return new Response(
        JSON.stringify({ error: 'Column not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const apolloField = column.apollo_property_name as string
    if (!apolloField || !APOLLO_ORG_FIELD_MAP[apolloField]) {
      return new Response(
        JSON.stringify({ error: `Unknown Apollo org field: ${apolloField}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const fieldDef = APOLLO_ORG_FIELD_MAP[apolloField]

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
        JSON.stringify({ error: 'Apollo API key not configured', code: 'APOLLO_NOT_CONFIGURED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Get all columns for key mapping
    const { data: allColumns } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', table_id)

    const columnIdToKey = new Map<string, string>()
    for (const col of allColumns ?? []) {
      columnIdToKey.set(col.id, col.key)
    }

    // 4. Fetch target rows
    let rowQuery = serviceClient
      .from('dynamic_table_rows')
      .select('id, source_data, dynamic_table_cells(column_id, value)')
      .eq('table_id', table_id)
      .order('row_index', { ascending: true })

    if (row_ids?.length > 0) {
      rowQuery = rowQuery.in('id', row_ids)
    }
    rowQuery = rowQuery.limit(max_rows ?? DEFAULT_BATCH_SIZE)

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

    // 5. Separate cached vs needs enrichment
    const cachedRows: RowData[] = []
    const needsEnrichment: RowData[] = []

    for (const row of rows) {
      const orgCache = row.source_data?.apollo_org as Record<string, unknown> | undefined
      if (orgCache && !force_refresh) {
        cachedRows.push(row)
      } else {
        needsEnrichment.push(row)
      }
    }

    // 6. Process cached rows
    if (cachedRows.length > 0) {
      const cachedCells = cachedRows.map((row) => {
        const orgData = row.source_data!.apollo_org as Record<string, unknown>
        const rawValue = extractField(orgData, fieldDef.path)
        return {
          row_id: row.id,
          column_id: column_id,
          value: formatValue(rawValue),
          status: rawValue != null ? 'complete' : 'failed',
          source: 'apollo_org_cache',
          confidence: 1.0,
          error_message: rawValue == null ? 'Field not available in cached Apollo org data' : null,
        }
      })

      await serviceClient
        .from('dynamic_table_cells')
        .upsert(cachedCells, { onConflict: 'row_id,column_id' })
    }

    // 7. Mark pending
    if (needsEnrichment.length > 0) {
      const pendingCells = needsEnrichment.map((row) => ({
        row_id: row.id,
        column_id: column_id,
        value: null,
        status: 'pending',
        source: 'apollo_org',
      }))
      await serviceClient
        .from('dynamic_table_cells')
        .upsert(pendingCells, { onConflict: 'row_id,column_id' })
    }

    // 8. Enrich via Apollo Organization Enrichment API
    const limiter = createConcurrencyLimiter(CONCURRENCY)
    const stats = { enriched: 0, cached_hits: cachedRows.length, failed: 0, skipped: 0, credits_estimated: 0 }

    await Promise.allSettled(
      needsEnrichment.map((row) =>
        limiter(async () => {
          const domain = findDomain(row, columnIdToKey)

          if (!domain) {
            stats.skipped++
            await serviceClient
              .from('dynamic_table_cells')
              .upsert({
                row_id: row.id,
                column_id: column_id,
                value: null,
                status: 'failed',
                source: 'apollo_org',
                error_message: 'No company domain found for org enrichment',
              }, { onConflict: 'row_id,column_id' })
            return
          }

          try {
            const response = await fetchWithRetry(
              `${APOLLO_API_BASE}/organizations/enrich?domain=${encodeURIComponent(domain)}`,
              { method: 'GET', headers: { 'Content-Type': 'application/json', 'x-api-key': apolloApiKey } },
              { maxRetries: 2, baseDelayMs: 2000, logPrefix: '[apollo-org-enrich]' },
            )

            if (!response.ok) {
              const errorText = await response.text()
              throw new Error(`Apollo Org API ${response.status}: ${errorText.slice(0, 200)}`)
            }

            const result = await response.json()
            const org = result.organization as Record<string, unknown> | null

            if (!org) {
              stats.failed++
              await serviceClient
                .from('dynamic_table_cells')
                .upsert({
                  row_id: row.id,
                  column_id: column_id,
                  value: null,
                  status: 'failed',
                  source: 'apollo_org',
                  error_message: `No organization found for domain: ${domain}`,
                }, { onConflict: 'row_id,column_id' })
              return
            }

            // Cache full org response in source_data.apollo_org (separate from person cache)
            const existingSourceData = row.source_data ?? {}
            const updatedSourceData = { ...existingSourceData, apollo_org: org }

            await serviceClient
              .from('dynamic_table_rows')
              .update({ source_data: updatedSourceData })
              .eq('id', row.id)

            // Extract field
            const rawValue = extractField(org, fieldDef.path)
            const cellValue = formatValue(rawValue)

            await serviceClient
              .from('dynamic_table_cells')
              .upsert({
                row_id: row.id,
                column_id: column_id,
                value: cellValue,
                status: cellValue != null ? 'complete' : 'failed',
                source: 'apollo_org',
                confidence: 1.0,
                error_message: cellValue == null ? `Field "${apolloField}" not available for this organization` : null,
              }, { onConflict: 'row_id,column_id' })

            stats.enriched++
            stats.credits_estimated += 1
          } catch (err) {
            stats.failed++
            await serviceClient
              .from('dynamic_table_cells')
              .upsert({
                row_id: row.id,
                column_id: column_id,
                value: null,
                status: 'failed',
                source: 'apollo_org',
                error_message: String(err).slice(0, 500),
              }, { onConflict: 'row_id,column_id' })
          }
        }),
      ),
    )

    return new Response(
      JSON.stringify({ processed: rows.length, ...stats }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    console.error('[apollo-org-enrich] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

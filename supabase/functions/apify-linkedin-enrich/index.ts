import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { createConcurrencyLimiter } from '../_shared/rateLimiter.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * apify-linkedin-enrich — Enrich Ops table rows via Apify LinkedIn Profile Scraper.
 *
 * "Enrich once, column many" pattern:
 *   - Calls Apify actor 2SyF0bVxmgGr8IVCZ to scrape full LinkedIn profile
 *   - Caches the FULL response in dynamic_table_rows.source_data.linkedin
 *   - Extracts only the requested field (apollo_property_name) into the cell
 *   - Second+ LinkedIn columns read from cache — zero API calls
 *
 * POST body:
 *   { table_id, column_id, row_ids?, max_rows?, force_refresh?, skip_completed? }
 */

const APIFY_ACTOR_ID = '2SyF0bVxmgGr8IVCZ'
const CONCURRENCY = 2
const DEFAULT_BATCH_SIZE = 10

// ---------------------------------------------------------------------------
// LinkedIn field mapping: property_name → response path + label
// ---------------------------------------------------------------------------

const LINKEDIN_FIELD_MAP: Record<string, { path: string; label: string }> = {
  // Profile
  full_name:            { path: 'fullName',                          label: 'Full Name' },
  first_name:           { path: 'firstName',                         label: 'First Name' },
  last_name:            { path: 'lastName',                          label: 'Last Name' },
  headline:             { path: 'headline',                          label: 'Headline' },
  about:                { path: 'about',                             label: 'About / Summary' },
  location:             { path: 'addressWithCountry',                label: 'Location' },
  profile_photo:        { path: 'profilePic',                        label: 'Profile Photo' },
  email:                { path: 'email',                             label: 'Email' },
  mobile_number:        { path: 'mobileNumber',                      label: 'Mobile Number' },
  // Current role (top-level shortcuts from Apify)
  current_title:        { path: 'jobTitle',                          label: 'Current Title' },
  current_company:      { path: 'companyName',                       label: 'Current Company' },
  current_company_industry: { path: 'companyIndustry',               label: 'Company Industry' },
  current_company_size: { path: 'companySize',                       label: 'Company Size' },
  current_company_website: { path: 'companyWebsite',                 label: 'Company Website' },
  current_company_linkedin: { path: 'companyLinkedin',               label: 'Company LinkedIn' },
  job_location:         { path: 'jobLocation',                       label: 'Job Location' },
  current_duration:     { path: 'currentJobDuration',                label: 'Current Job Duration' },
  current_duration_yrs: { path: 'currentJobDurationInYrs',           label: 'Current Job Duration (Years)' },
  job_started_on:       { path: 'jobStartedOn',                      label: 'Job Started On' },
  // Experience history
  previous_title:       { path: 'experiences[1].title',              label: 'Previous Title' },
  previous_company:     { path: 'experiences[1].companyName',        label: 'Previous Company' },
  total_experience_yrs: { path: 'totalExperienceYears',              label: 'Total Experience (Years)' },
  experience_count:     { path: 'experiencesCount',                  label: 'Experience Count' },
  // Education
  education:            { path: 'educations[0].title',               label: 'Education' },
  education_school:     { path: 'educations[0].subtitle',            label: 'School' },
  // Social / Stats
  connections:          { path: 'connections',                        label: 'Connections' },
  followers:            { path: 'followers',                          label: 'Followers' },
  skills:               { path: 'skills',                            label: 'Skills' },
  languages:            { path: 'languages',                         label: 'Languages' },
  certifications:       { path: 'licenseAndCertificates[0].title',   label: 'Top Certification' },
  linkedin_url:         { path: 'linkedinUrl',                       label: 'LinkedIn URL' },
  // Flags
  is_premium:           { path: 'isPremium',                         label: 'Premium Account' },
  is_creator:           { path: 'isCreator',                         label: 'Creator' },
  is_influencer:        { path: 'isInfluencer',                      label: 'Influencer' },
  is_job_seeker:        { path: 'isJobSeeker',                       label: 'Job Seeker' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a dotted path like "experiences[0].title" or "experiences.length" */
function extractField(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current == null) return null

    // Handle .length for arrays
    if (segment === 'length' && Array.isArray(current)) {
      return current.length
    }

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
  if (Array.isArray(value)) {
    // Handle array of objects with 'title' (skills, languages, certifications)
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      const titles = value.map((item: Record<string, unknown>) => item.title || item.name || String(item)).filter(Boolean)
      return titles.length > 0 ? titles.join(', ') : null
    }
    return value.join(', ')
  }
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
 * Find LinkedIn URL from row cells.
 * Looks for columns with type='linkedin', or label/key containing 'linkedin'.
 */
function findLinkedInUrl(
  row: RowData,
  columnIdToMeta: Map<string, ColumnMeta>,
): string | null {
  for (const [, cell] of Object.entries(row.cells)) {
    if (!cell.value) continue
    const meta = columnIdToMeta.get(cell.column_id)
    if (!meta) continue

    const colType = meta.column_type ?? ''
    const key = meta.key ?? ''
    const label = (meta.label ?? '').toLowerCase()

    if (
      colType === 'linkedin' ||
      key === 'linkedin_url' || key === 'linkedin' ||
      label.includes('linkedin')
    ) {
      // Validate it looks like a LinkedIn URL
      const val = cell.value.trim()
      if (val.includes('linkedin.com/')) {
        return val
      }
    }
  }
  return null
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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Parse request body first (need _auth_token fallback)
    const body = await req.json()
    const {
      table_id,
      column_id,
      row_ids,
      max_rows,
      force_refresh = false,
      skip_completed = false,
      _auth_token,
    } = body

    // Auth: validate JWT, get user + org
    // Try Authorization header first, fall back to _auth_token in body
    const authHeader = req.headers.get('Authorization') || (_auth_token ? `Bearer ${_auth_token}` : null)
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

    if (!table_id || !column_id) {
      return new Response(
        JSON.stringify({ error: 'table_id and column_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Get target column config (which LinkedIn field to extract)
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

    // apollo_property_name is reused for LinkedIn property name storage
    const linkedinField = column.apollo_property_name as string
    if (!linkedinField || !LINKEDIN_FIELD_MAP[linkedinField]) {
      return new Response(
        JSON.stringify({ error: `Unknown LinkedIn field: ${linkedinField}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const fieldDef = LINKEDIN_FIELD_MAP[linkedinField]

    // 2. Get Apify API token
    const { data: creds } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'apify')
      .maybeSingle()

    const apifyToken = (creds?.credentials as Record<string, string>)?.api_token
    if (!apifyToken) {
      return new Response(
        JSON.stringify({ error: 'Apify API token not configured. Add it in Settings > Integrations.', code: 'APIFY_NOT_CONFIGURED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Get all columns (for finding LinkedIn URL column + sibling LinkedIn property columns)
    const { data: allColumns } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, key, label, column_type, apollo_property_name')
      .eq('table_id', table_id)

    const columnIdToMeta = new Map<string, ColumnMeta>()
    for (const col of allColumns ?? []) {
      columnIdToMeta.set(col.id, {
        key: col.key,
        label: (col.label as string ?? '').toLowerCase(),
        column_type: col.column_type as string ?? '',
      })
    }

    // Build list of ALL linkedin_property columns in this table (for backfill)
    const siblingLinkedInColumns = (allColumns ?? [])
      .filter((col) => col.column_type === 'linkedin_property' && col.id !== column_id && col.apollo_property_name)
      .map((col) => ({
        id: col.id as string,
        field: col.apollo_property_name as string,
        fieldDef: LINKEDIN_FIELD_MAP[col.apollo_property_name as string],
      }))
      .filter((col) => col.fieldDef != null)

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
        console.log(`[apify-linkedin-enrich] skip_completed: filtered out ${completedCells.length} already-complete rows, ${filteredRows.length} remaining`)
      }
    }

    // 5. Separate rows into cached vs needs-enrichment
    const cachedRows: RowData[] = []
    const needsEnrichment: RowData[] = []

    for (const row of filteredRows) {
      const linkedinCache = row.source_data?.linkedin as Record<string, unknown> | undefined
      if (linkedinCache && !force_refresh) {
        cachedRows.push(row)
      } else {
        needsEnrichment.push(row)
      }
    }

    // 6. Process cached rows immediately (extract field, write cell + backfill siblings)
    if (cachedRows.length > 0) {
      const cachedCells: Array<Record<string, unknown>> = []
      for (const row of cachedRows) {
        const linkedinData = row.source_data!.linkedin as Record<string, unknown>
        // Primary column
        const rawValue = extractField(linkedinData, fieldDef.path)
        cachedCells.push({
          row_id: row.id,
          column_id: column_id,
          value: formatValue(rawValue),
          status: rawValue != null ? 'complete' : 'failed',
          source: 'linkedin_cache',
          confidence: 1.0,
          error_message: rawValue == null ? 'Field not available in cached LinkedIn data' : null,
        })
        // Backfill sibling LinkedIn property columns from cached data
        for (const sib of siblingLinkedInColumns) {
          const sibValue = extractField(linkedinData, sib.fieldDef.path)
          cachedCells.push({
            row_id: row.id,
            column_id: sib.id,
            value: formatValue(sibValue),
            status: sibValue != null ? 'complete' : 'failed',
            source: 'linkedin_cache',
            confidence: 1.0,
            error_message: sibValue == null ? `Field "${sib.field}" not available in cached LinkedIn data` : null,
          })
        }
      }

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
        source: 'linkedin',
      }))

      await serviceClient
        .from('dynamic_table_cells')
        .upsert(pendingCells, { onConflict: 'row_id,column_id' })
    }

    // 8. Enrich rows that need it via Apify
    const stats = { enriched: 0, cached_hits: cachedRows.length, failed: 0, skipped: 0 }

    // Separate rows with LinkedIn URLs from those without
    const scrapableRows: Array<{ row: RowData; linkedinUrl: string }> = []
    for (const row of needsEnrichment) {
      const linkedinUrl = findLinkedInUrl(row, columnIdToMeta)
      if (!linkedinUrl) {
        stats.skipped++
        await serviceClient
          .from('dynamic_table_cells')
          .upsert({
            row_id: row.id,
            column_id: column_id,
            value: null,
            status: 'failed',
            source: 'linkedin',
            error_message: 'No LinkedIn URL found in row cells',
          }, { onConflict: 'row_id,column_id' })
      } else {
        scrapableRows.push({ row, linkedinUrl })
      }
    }

    // Scrape LinkedIn profiles via Apify (concurrency-limited)
    const limiter = createConcurrencyLimiter(CONCURRENCY)
    await Promise.allSettled(
      scrapableRows.map(({ row, linkedinUrl }) =>
        limiter(async () => {
          try {
            // Call Apify actor synchronously and get dataset items
            const response = await fetch(
              `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items?token=${apifyToken}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  profileUrls: [linkedinUrl],
                }),
              },
            )

            if (!response.ok) {
              const errorText = await response.text()
              throw new Error(`Apify API ${response.status}: ${errorText.slice(0, 200)}`)
            }

            const items = await response.json()
            const profile = Array.isArray(items) && items.length > 0 ? items[0] : null

            if (!profile) {
              stats.failed++
              await serviceClient
                .from('dynamic_table_cells')
                .upsert({
                  row_id: row.id,
                  column_id: column_id,
                  value: null,
                  status: 'failed',
                  source: 'linkedin',
                  error_message: 'Apify returned no profile data',
                }, { onConflict: 'row_id,column_id' })
              return
            }

            // Cache full LinkedIn response in source_data.linkedin
            const existingSourceData = row.source_data ?? {}
            const updatedSourceData = { ...existingSourceData, linkedin: profile }

            await serviceClient
              .from('dynamic_table_rows')
              .update({ source_data: updatedSourceData })
              .eq('id', row.id)

            // Extract target field value + backfill ALL sibling LinkedIn columns
            const profileData = profile as Record<string, unknown>
            const rawValue = extractField(profileData, fieldDef.path)
            const cellValue = formatValue(rawValue)

            const cellsToWrite: Array<Record<string, unknown>> = [{
              row_id: row.id,
              column_id: column_id,
              value: cellValue,
              status: cellValue != null ? 'complete' : 'failed',
              source: 'linkedin',
              confidence: 1.0,
              error_message: cellValue == null ? `Field "${linkedinField}" not available for this profile` : null,
            }]

            // Backfill sibling columns from freshly scraped data
            for (const sib of siblingLinkedInColumns) {
              const sibValue = extractField(profileData, sib.fieldDef.path)
              cellsToWrite.push({
                row_id: row.id,
                column_id: sib.id,
                value: formatValue(sibValue),
                status: sibValue != null ? 'complete' : 'failed',
                source: 'linkedin',
                confidence: 1.0,
                error_message: sibValue == null ? `Field "${sib.field}" not available for this profile` : null,
              })
            }

            await serviceClient
              .from('dynamic_table_cells')
              .upsert(cellsToWrite, { onConflict: 'row_id,column_id' })

            stats.enriched++
          } catch (err) {
            stats.failed++
            await serviceClient
              .from('dynamic_table_cells')
              .upsert({
                row_id: row.id,
                column_id: column_id,
                value: null,
                status: 'failed',
                source: 'linkedin',
                error_message: String(err).slice(0, 500),
              }, { onConflict: 'row_id,column_id' })
          }
        }),
      ),
    )

    return new Response(
      JSON.stringify({
        processed: filteredRows.length,
        ...stats,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    console.error('[apify-linkedin-enrich] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

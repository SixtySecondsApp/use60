import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * bettercontact-enrich — Submit, poll, process, and check credits for BetterContact enrichment.
 *
 * Router pattern with 4 actions:
 *   - submit:            Build contacts payload from Ops table rows, submit async enrichment
 *   - status:            Poll BetterContact for async request status/results
 *   - credits:           Check BetterContact account credit balance
 *   - poll_and_process:  Polling fallback — check status and process results if terminated
 *
 * BetterContact is async-only: submit returns a request_id, results arrive via
 * webhook (webhook-integrations?provider=bettercontact) or polling (poll_and_process action).
 *
 * POST body: { action: 'submit' | 'status' | 'credits' | 'poll_and_process', ...params }
 */

const BETTERCONTACT_API_URL = 'https://app.bettercontact.rocks/api/v2'

// ---------------------------------------------------------------------------
// Field map: bettercontact_property_name → response field path
// ---------------------------------------------------------------------------

const BETTERCONTACT_FIELD_MAP: Record<string, { path: string; label: string }> = {
  email:          { path: 'contact_email_address',        label: 'Email' },
  email_status:   { path: 'contact_email_address_status', label: 'Email Status' },
  phone:          { path: 'contact_phone_number',         label: 'Phone' },
  first_name:     { path: 'contact_first_name',           label: 'First Name' },
  last_name:      { path: 'contact_last_name',            label: 'Last Name' },
  job_title:      { path: 'contact_job_title',            label: 'Job Title' },
  gender:         { path: 'contact_gender',               label: 'Gender' },
  email_provider: { path: 'email_provider',               label: 'Email Provider' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a custom field value from BetterContact's array format.
 *  custom_fields comes back as [{name, value, position}, ...] not a flat object. */
function getCustomField(customFields: any, fieldName: string): string | null {
  if (!customFields) return null
  // Handle array format: [{name: "row_id", value: "xxx"}, ...]
  if (Array.isArray(customFields)) {
    const field = customFields.find((f: any) => f.name === fieldName)
    return field?.value ?? null
  }
  // Handle flat object format (fallback)
  return customFields[fieldName] ?? null
}

/** Find a column from a lookup map using multiple name patterns */
function findColumnByPatterns(
  patterns: string[],
  columnsByKey: Record<string, any>,
  columnsByLabel: Record<string, any>,
): any | null {
  for (const p of patterns) {
    if (columnsByKey[p]) return columnsByKey[p]
    if (columnsByLabel[p]) return columnsByLabel[p]
  }
  return null
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleSubmit(
  body: any,
  serviceClient: any,
  user: any,
  orgId: string,
  apiKey: string,
  supabaseUrl: string,
  headers: Record<string, string>,
): Promise<Response> {
  const {
    table_id,
    column_id,
    row_ids,
    enrich_email_address = true,
    enrich_phone_number = false,
    force_refresh = false,
    skip_completed = true,
  } = body

  if (!table_id || !column_id) {
    return new Response(
      JSON.stringify({ error: 'table_id and column_id required' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  // 1. Get target column config
  const { data: targetCol } = await serviceClient
    .from('dynamic_table_columns')
    .select('id, key, label, bettercontact_property_name, column_type')
    .eq('id', column_id)
    .maybeSingle()

  if (!targetCol) {
    return new Response(
      JSON.stringify({ error: 'Column not found' }),
      { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  // 2. Get ALL columns for smart field matching
  const { data: allColumns } = await serviceClient
    .from('dynamic_table_columns')
    .select('id, key, label, column_type, bettercontact_property_name, apollo_property_name')
    .eq('table_id', table_id)
    .order('position')

  // 3. Build column lookup maps for input field detection
  const columnsByKey: Record<string, any> = {}
  const columnsByLabel: Record<string, any> = {}
  for (const col of allColumns || []) {
    if (col.key) columnsByKey[col.key.toLowerCase()] = col
    if (col.label) columnsByLabel[col.label.toLowerCase()] = col
  }

  const firstNameCol = findColumnByPatterns(
    ['first_name', 'first name', 'firstname', 'fname'],
    columnsByKey, columnsByLabel,
  )
  const lastNameCol = findColumnByPatterns(
    ['last_name', 'last name', 'lastname', 'lname'],
    columnsByKey, columnsByLabel,
  )
  const companyCol = findColumnByPatterns(
    ['company', 'company_name', 'company name', 'organization'],
    columnsByKey, columnsByLabel,
  )
  const domainCol = findColumnByPatterns(
    ['domain', 'company_domain', 'company domain', 'website', 'url'],
    columnsByKey, columnsByLabel,
  )
  const linkedinCol = findColumnByPatterns(
    ['linkedin', 'linkedin_url', 'linkedin url', 'linkedin profile'],
    columnsByKey, columnsByLabel,
  )

  if (!firstNameCol || !lastNameCol) {
    return new Response(
      JSON.stringify({
        error: 'Table must have First Name and Last Name columns for BetterContact enrichment',
      }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  if (!companyCol && !domainCol) {
    return new Response(
      JSON.stringify({
        error: 'Table must have a Company or Domain column for BetterContact enrichment',
      }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  // 4. Fetch rows
  let rowQuery = serviceClient
    .from('dynamic_table_rows')
    .select('id, source_data')
    .eq('table_id', table_id)

  if (row_ids && row_ids.length > 0) {
    rowQuery = rowQuery.in('id', row_ids)
  }

  const { data: rows } = await rowQuery
  if (!rows || rows.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No rows found' }),
      { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  // 5. Fetch cells for all rows + relevant columns
  const relevantColumnIds = [
    firstNameCol?.id, lastNameCol?.id, companyCol?.id, domainCol?.id, linkedinCol?.id, column_id,
  ].filter(Boolean)

  const { data: cells } = await serviceClient
    .from('dynamic_table_cells')
    .select('row_id, column_id, value, status')
    .in('row_id', rows.map((r: any) => r.id))
    .in('column_id', relevantColumnIds)

  // Build cell lookup: row_id -> column_id -> cell
  const cellMap: Record<string, Record<string, any>> = {}
  for (const cell of cells || []) {
    if (!cellMap[cell.row_id]) cellMap[cell.row_id] = {}
    cellMap[cell.row_id][cell.column_id] = cell
  }

  // 6. Separate cached vs needs-enrichment
  const cachedRows: any[] = []
  const needsEnrichment: any[] = []

  for (const row of rows) {
    const targetCell = cellMap[row.id]?.[column_id]

    // Skip completed if flag is set
    if (skip_completed && targetCell?.status === 'complete') {
      continue
    }

    // Check cache
    const cachedData = row.source_data?.bettercontact
    if (cachedData && !force_refresh) {
      cachedRows.push(row)
    } else {
      needsEnrichment.push(row)
    }
  }

  // 7. Process cached rows (extract field value from cache)
  let cachedHits = 0
  const propertyName = targetCol.bettercontact_property_name || 'email'
  const fieldInfo = BETTERCONTACT_FIELD_MAP[propertyName]

  for (const row of cachedRows) {
    const cached = row.source_data?.bettercontact
    if (!cached) continue

    const value = cached[fieldInfo?.path || propertyName] ?? null

    await serviceClient
      .from('dynamic_table_cells')
      .upsert({
        row_id: row.id,
        column_id,
        value: value ? String(value) : null,
        status: value ? 'complete' : 'failed',
        source: 'bettercontact_cache',
        confidence: value ? 0.9 : 0,
      }, { onConflict: 'row_id,column_id' })

    cachedHits++
  }

  // If nothing needs enrichment, return early
  if (needsEnrichment.length === 0) {
    return new Response(
      JSON.stringify({
        processed: cachedHits,
        cached_hits: cachedHits,
        submitted: 0,
        message: 'All rows served from cache',
      }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  // 8. Create enrichment_jobs row
  const { data: enrichmentJob } = await serviceClient
    .from('enrichment_jobs')
    .insert({
      table_id,
      column_id,
      created_by: user.id,
      status: 'queued',
      total_rows: needsEnrichment.length,
      processed_rows: 0,
      failed_rows: 0,
    })
    .select('id')
    .single()

  // 9. Mark cells as pending
  const pendingCells = needsEnrichment.map((row: any) => ({
    row_id: row.id,
    column_id,
    value: null,
    status: 'pending',
    source: 'bettercontact',
    confidence: 0,
  }))

  await serviceClient
    .from('dynamic_table_cells')
    .upsert(pendingCells, { onConflict: 'row_id,column_id' })

  // 10. Build BetterContact request payload
  const contactsPayload = needsEnrichment.map((row: any) => {
    const rowCells = cellMap[row.id] || {}

    const contact: Record<string, any> = {
      first_name: rowCells[firstNameCol.id]?.value || '',
      last_name: rowCells[lastNameCol.id]?.value || '',
      custom_fields: {
        row_id: row.id,
        column_id,
        enrichment_job_id: enrichmentJob?.id,
      },
    }

    if (companyCol && rowCells[companyCol.id]?.value) {
      contact.company = rowCells[companyCol.id].value
    }
    if (domainCol && rowCells[domainCol.id]?.value) {
      contact.company_domain = rowCells[domainCol.id].value
    }
    if (linkedinCol && rowCells[linkedinCol.id]?.value) {
      contact.linkedin_url = rowCells[linkedinCol.id].value
    }

    return contact
  })

  // 11. Build webhook URL
  const webhookUrl = `${supabaseUrl}/functions/v1/webhook-integrations?provider=bettercontact`

  // 12. Submit to BetterContact API
  const bcResponse = await fetch(`${BETTERCONTACT_API_URL}/async`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      data: contactsPayload,
      enrich_email_address,
      enrich_phone_number,
      webhook: webhookUrl,
    }),
  })

  if (!bcResponse.ok) {
    const errorText = await bcResponse.text()
    console.error('[bettercontact-enrich] API error:', bcResponse.status, errorText)

    // Mark job as failed
    if (enrichmentJob) {
      await serviceClient
        .from('enrichment_jobs')
        .update({ status: 'failed', error_message: `BetterContact API error: ${bcResponse.status}` })
        .eq('id', enrichmentJob.id)
    }

    // Mark cells as failed
    const failedCells = needsEnrichment.map((row: any) => ({
      row_id: row.id,
      column_id,
      value: null,
      status: 'failed',
      source: 'bettercontact',
      error_message: `API error: ${bcResponse.status}`,
    }))

    await serviceClient
      .from('dynamic_table_cells')
      .upsert(failedCells, { onConflict: 'row_id,column_id' })

    return new Response(
      JSON.stringify({ error: `BetterContact API error: ${bcResponse.status}` }),
      { status: 502, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  const bcResult = await bcResponse.json()

  // 13. Store request tracking
  await serviceClient
    .from('bettercontact_requests')
    .insert({
      organization_id: orgId,
      table_id,
      column_id,
      bettercontact_request_id: bcResult.id,
      action: 'enrich',
      status: 'pending',
      total_contacts: needsEnrichment.length,
      webhook_url: webhookUrl,
      enrichment_job_id: enrichmentJob?.id,
      enrich_email: enrich_email_address,
      enrich_phone: enrich_phone_number,
      created_by: user.id,
    })

  // 14. Update enrichment_jobs status
  if (enrichmentJob) {
    await serviceClient
      .from('enrichment_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', enrichmentJob.id)
  }

  return new Response(
    JSON.stringify({
      processed: cachedHits,
      cached_hits: cachedHits,
      submitted: needsEnrichment.length,
      bettercontact_request_id: bcResult.id,
      enrichment_job_id: enrichmentJob?.id,
      message: `Submitted ${needsEnrichment.length} contacts for enrichment`,
    }),
    { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
  )
}

async function handleStatus(
  body: any,
  apiKey: string,
  headers: Record<string, string>,
): Promise<Response> {
  const { request_id } = body
  if (!request_id) {
    return new Response(
      JSON.stringify({ error: 'request_id required' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  const response = await fetch(`${BETTERCONTACT_API_URL}/async/${request_id}`, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey },
  })

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: `BetterContact API error: ${response.status}` }),
      { status: response.status, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  const result = await response.json()
  return new Response(
    JSON.stringify(result),
    { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
  )
}

async function handleCredits(
  apiKey: string,
  credentials: any,
  headers: Record<string, string>,
): Promise<Response> {
  const email = credentials?.email || ''

  const response = await fetch(
    `${BETTERCONTACT_API_URL}/account?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(apiKey)}`,
    { method: 'GET' },
  )

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to check BetterContact credits' }),
      { status: response.status, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  const result = await response.json()
  return new Response(
    JSON.stringify({
      credits_left: result.credits_left,
      email: result.email,
    }),
    { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
  )
}

async function handlePollAndProcess(
  body: any,
  serviceClient: any,
  orgId: string,
  apiKey: string,
  headers: Record<string, string>,
): Promise<Response> {
  const { request_id } = body

  if (!request_id) {
    return new Response(
      JSON.stringify({ error: 'request_id required' }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  // Check BetterContact status
  const bcResponse = await fetch(`${BETTERCONTACT_API_URL}/async/${request_id}`, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey },
  })

  if (!bcResponse.ok) {
    return new Response(
      JSON.stringify({ error: `BetterContact API error: ${bcResponse.status}` }),
      { status: bcResponse.status, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  const bcResult = await bcResponse.json()

  // If not yet terminated, return current status
  if (bcResult.status !== 'terminated') {
    return new Response(
      JSON.stringify({
        status: bcResult.status,
        message: 'Still processing',
      }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  // Results ready — process them (same logic as webhook handler)
  const { data: bcRequest } = await serviceClient
    .from('bettercontact_requests')
    .select('id, table_id, column_id, enrichment_job_id, status')
    .eq('bettercontact_request_id', request_id)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!bcRequest) {
    return new Response(
      JSON.stringify({ error: 'Request tracking not found' }),
      { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  // Skip if already processed
  if (bcRequest.status === 'terminated') {
    return new Response(
      JSON.stringify({
        status: 'terminated',
        message: 'Already processed',
        summary: bcResult.summary,
      }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  }

  // Get target column config
  const { data: targetCol } = await serviceClient
    .from('dynamic_table_columns')
    .select('id, bettercontact_property_name')
    .eq('id', bcRequest.column_id)
    .maybeSingle()

  const propertyName = targetCol?.bettercontact_property_name || 'email'
  const fieldPath = BETTERCONTACT_FIELD_MAP[propertyName]?.path || propertyName

  const results = bcResult.data || []
  let processedCount = 0
  let failedCount = 0

  for (const contact of results) {
    const rowId = getCustomField(contact.custom_fields, 'row_id')
    if (!rowId) { failedCount++; continue }

    // Cache in source_data
    const { data: existingRow } = await serviceClient
      .from('dynamic_table_rows')
      .select('id, source_data')
      .eq('id', rowId)
      .maybeSingle()

    if (existingRow) {
      await serviceClient
        .from('dynamic_table_rows')
        .update({ source_data: { ...(existingRow.source_data || {}), bettercontact: contact } })
        .eq('id', rowId)
    }

    const value = contact[fieldPath] ?? null
    const isEnriched = contact.enriched === true

    await serviceClient
      .from('dynamic_table_cells')
      .upsert({
        row_id: rowId,
        column_id: bcRequest.column_id,
        value: value ? String(value) : null,
        status: isEnriched && value ? 'complete' : 'failed',
        source: 'bettercontact',
        confidence: isEnriched ? 0.95 : 0,
        error_message: !isEnriched ? 'Not found by BetterContact' : null,
      }, { onConflict: 'row_id,column_id' })

    if (isEnriched && value) processedCount++
    else failedCount++
  }

  // Update enrichment_jobs
  if (bcRequest.enrichment_job_id) {
    await serviceClient
      .from('enrichment_jobs')
      .update({
        status: 'complete',
        processed_rows: processedCount,
        failed_rows: failedCount,
        completed_at: new Date().toISOString(),
      })
      .eq('id', bcRequest.enrichment_job_id)
  }

  // Update tracking
  await serviceClient
    .from('bettercontact_requests')
    .update({
      status: 'terminated',
      processed_contacts: processedCount + failedCount,
      credits_consumed: bcResult.credits_consumed || 0,
      completed_at: new Date().toISOString(),
    })
    .eq('id', bcRequest.id)

  return new Response(
    JSON.stringify({
      status: 'terminated',
      processed: processedCount,
      failed: failedCount,
      credits_consumed: bcResult.credits_consumed,
      summary: bcResult.summary,
    }),
    { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
  )
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) {
    return preflightResponse
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    const body = await req.json()
    const { action } = body

    // Auth: get user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // User client for auth
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Service client for DB operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Get org membership
    const { data: membership } = await serviceClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'No organization found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const orgId = membership.org_id

    // Get BetterContact API key (BYOK only)
    const { data: creds } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'bettercontact')
      .maybeSingle()

    const apiKey = (creds?.credentials as Record<string, string>)?.api_key
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'BetterContact API key not configured. Add it in Settings > Integrations.',
          code: 'BETTERCONTACT_NOT_CONFIGURED',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Route by action
    switch (action) {
      case 'submit':
        return await handleSubmit(body, serviceClient, user, orgId, apiKey, supabaseUrl, corsHeaders)
      case 'status':
        return await handleStatus(body, apiKey, corsHeaders)
      case 'credits':
        return await handleCredits(apiKey, creds?.credentials, corsHeaders)
      case 'poll_and_process':
        return await handlePollAndProcess(body, serviceClient, orgId, apiKey, corsHeaders)
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    }
  } catch (err: any) {
    console.error('[bettercontact-enrich] Error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { HeyReachClient } from '../_shared/heyreach.ts'

let _reqRef: Request | null = null

function jsonResponse(data: any, status = 200) {
  const cors = _reqRef ? getCorsHeaders(_reqRef) : {}
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function errorResponse(error: string) {
  return jsonResponse({ success: false, error })
}

serve(async (req) => {
  _reqRef = req
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return errorResponse('Server misconfigured')
    }

    let body: any = {}
    try {
      const rawBody = await req.text()
      if (rawBody) body = JSON.parse(rawBody)
    } catch (e: any) {
      return errorResponse(`Invalid JSON: ${e.message}`)
    }

    // Auth
    let userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (!userToken && body._auth_token) userToken = body._auth_token
    if (!userToken) return errorResponse('Unauthorized')

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return errorResponse('Unauthorized')

    const { org_id: orgId, table_id: tableId, campaign_link_id: linkId, row_ids: rowIds } = body
    if (!orgId || !tableId || !linkId || !Array.isArray(rowIds) || rowIds.length === 0) {
      return errorResponse('Missing org_id, table_id, campaign_link_id, or row_ids')
    }

    const svc = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Get campaign link with field mapping
    const { data: link, error: linkErr } = await svc
      .from('heyreach_campaign_links')
      .select('id, campaign_id, campaign_name, field_mapping, sender_column_key')
      .eq('id', linkId)
      .eq('org_id', orgId)
      .single()

    if (linkErr || !link) return errorResponse('Campaign link not found')

    // Get HeyReach client
    const { data: creds } = await svc
      .from('heyreach_org_credentials')
      .select('api_key')
      .eq('org_id', orgId)
      .maybeSingle()

    if (!creds?.api_key) return errorResponse('HeyReach not connected')
    const heyreach = new HeyReachClient({ apiKey: creds.api_key })

    // Get table columns
    const { data: columns } = await svc
      .from('dynamic_table_columns')
      .select('id, column_key, name')
      .eq('table_id', tableId)

    const colById = new Map((columns || []).map(c => [c.id, c]))
    const colByKey = new Map((columns || []).map(c => [c.column_key, c]))

    // Get rows with cells
    const { data: rows } = await svc
      .from('dynamic_table_rows')
      .select('id, heyreach_lead_id')
      .eq('table_id', tableId)
      .in('id', rowIds)

    if (!rows?.length) return errorResponse('No matching rows found')

    // Get all cells for these rows
    const { data: cells } = await svc
      .from('dynamic_table_cells')
      .select('row_id, column_id, value')
      .in('row_id', rowIds)

    // Build cell lookup: row_id -> column_key -> value
    const cellMap = new Map<string, Map<string, string>>()
    for (const cell of (cells || [])) {
      const col = colById.get(cell.column_id)
      if (!col) continue
      if (!cellMap.has(cell.row_id)) cellMap.set(cell.row_id, new Map())
      cellMap.get(cell.row_id)!.set(col.column_key, cell.value)
    }

    // Build leads from field mapping
    const fieldMapping: Record<string, string> = link.field_mapping || {}
    const senderColKey = link.sender_column_key

    const leads: any[] = []
    const errors: { row_id: string; error: string }[] = []

    for (const row of rows) {
      const rowCells = cellMap.get(row.id) || new Map()

      const lead: any = {}

      // Map standard fields
      for (const [heyreachField, opsColKey] of Object.entries(fieldMapping)) {
        if (heyreachField === 'custom_variables') continue
        const value = rowCells.get(opsColKey as string)
        if (value) lead[heyreachField] = value
      }

      // Map custom variables
      if (fieldMapping.custom_variables && typeof fieldMapping.custom_variables === 'object') {
        lead.custom_variables = {}
        for (const [varName, colKey] of Object.entries(fieldMapping.custom_variables as Record<string, string>)) {
          const value = rowCells.get(colKey)
          if (value) lead.custom_variables[varName] = value
        }
      }

      // Validate required fields
      if (!lead.linkedin_url && !lead.linkedinUrl && !lead.professional_url) {
        errors.push({ row_id: row.id, error: 'Missing LinkedIn URL' })
        continue
      }
      if (!lead.first_name && !lead.firstName) {
        errors.push({ row_id: row.id, error: 'Missing first name' })
        continue
      }

      // Add sender if column configured
      if (senderColKey) {
        const senderId = rowCells.get(senderColKey)
        if (senderId) lead.sender_id = senderId
      }

      lead._row_id = row.id
      lead._heyreach_lead_id = row.heyreach_lead_id
      leads.push(lead)
    }

    // Push leads to HeyReach in batches of 100
    const BATCH_SIZE = 100
    let succeeded = 0
    let failed = errors.length

    const startTime = Date.now()

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE)
      const leadsToSend = batch.map(l => {
        const { _row_id, _heyreach_lead_id, ...leadData } = l
        return leadData
      })

      try {
        const result = await heyreach.request<any>({
          method: 'POST',
          path: '/api/public/campaign/AddLeadsToListV2',
          body: { campaignId: link.campaign_id, leads: leadsToSend },
        })

        const addedCount = result?.addedCount ?? result?.addedLeadsCount ?? result?.added_leads_count ?? leadsToSend.length
        succeeded += addedCount

        // Update heyreach_lead_id on rows
        for (const lead of batch) {
          await svc
            .from('dynamic_table_rows')
            .update({ heyreach_lead_id: lead.linkedin_url || lead.linkedinUrl || lead.professional_url, source_type: 'heyreach' })
            .eq('id', lead._row_id)
        }
      } catch (e: any) {
        console.error(`[heyreach-sync-outbound] Batch push failed:`, e.message)
        failed += batch.length
        for (const lead of batch) {
          errors.push({ row_id: lead._row_id, error: e.message })
        }
      }
    }

    const duration = Date.now() - startTime

    // Update last_push_at on campaign link
    await svc
      .from('heyreach_campaign_links')
      .update({ last_push_at: new Date().toISOString() })
      .eq('id', linkId)

    // Log to sync history
    await svc.from('heyreach_sync_history').insert({
      org_id: orgId,
      table_id: tableId,
      campaign_id: link.campaign_id,
      synced_by: user.id,
      sync_type: 'lead_push',
      rows_processed: leads.length + errors.length,
      rows_succeeded: succeeded,
      rows_failed: failed,
      sync_duration_ms: duration,
      error_message: errors.length > 0 ? `${errors.length} leads failed` : null,
      metadata: { errors: errors.slice(0, 10) },
    })

    // Log to integration_sync_logs
    await svc.from('integration_sync_logs').insert({
      org_id: orgId,
      user_id: user.id,
      integration_name: 'heyreach',
      operation: 'push',
      direction: 'outbound',
      entity_type: 'leads',
      entity_name: `${link.campaign_name || link.campaign_id}`,
      status: failed === 0 ? 'success' : succeeded > 0 ? 'success' : 'failed',
      metadata: { campaign_id: link.campaign_id, succeeded, failed, duration_ms: duration },
    })

    return jsonResponse({
      success: true,
      pushed: succeeded,
      failed,
      errors: errors.slice(0, 20),
      duration_ms: duration,
    })
  } catch (e: any) {
    console.error('[heyreach-sync-outbound] Unhandled error:', e)
    return errorResponse(`${e.message || 'Internal server error'}`)
  }
})

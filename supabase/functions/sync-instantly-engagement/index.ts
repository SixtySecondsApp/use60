import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { corsHeaders } from '../_shared/cors.ts'
import { InstantlyClient } from '../_shared/instantly.ts'

const CELL_CHUNK_SIZE = 500
const LEAD_PAGE_SIZE = 100

// Engagement columns auto-created on first sync
const ENGAGEMENT_COLUMNS = [
  { key: 'instantly_status', label: 'Instantly Status', column_type: 'text' },
  { key: 'instantly_email_status', label: 'Email Status', column_type: 'text' },
  { key: 'instantly_last_contacted', label: 'Last Contacted', column_type: 'date' },
  { key: 'instantly_reply_count', label: 'Reply Count', column_type: 'number' },
  { key: 'instantly_open_count', label: 'Open Count', column_type: 'number' },
]

function jsonResponse(data: any, _status = 200) {
  // Always return 200 so supabase.functions.invoke() puts the body in `data`
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  const startTime = Date.now()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Server misconfigured' }, 500)
    }

    // Auth
    const userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (!userToken) return jsonResponse({ success: false, error: 'Unauthorized' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401)

    const body = await req.json()
    const { table_id, campaign_id } = body

    if (!table_id || !campaign_id) {
      return jsonResponse({ success: false, error: 'Missing table_id or campaign_id' })
    }

    const svc = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Get table + verify access
    const { data: table } = await svc
      .from('dynamic_tables')
      .select('id, organization_id')
      .eq('id', table_id)
      .single()

    if (!table) return jsonResponse({ success: false, error: 'Table not found' }, 404)

    const { data: membership } = await svc
      .from('organization_memberships')
      .select('id')
      .eq('org_id', table.organization_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) return jsonResponse({ success: false, error: 'Access denied' }, 403)

    // Get Instantly credentials
    const { data: creds } = await svc
      .from('instantly_org_credentials')
      .select('api_key')
      .eq('org_id', table.organization_id)
      .maybeSingle()

    if (!creds?.api_key) {
      return jsonResponse({ success: false, error: 'Instantly not connected' })
    }

    const instantly = new InstantlyClient({ apiKey: creds.api_key })

    // Step 1: Ensure engagement columns exist
    const { data: existingColumns } = await svc
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', table_id)

    const existingKeys = new Set((existingColumns ?? []).map(c => c.key))

    // Get max position for new columns
    const { data: maxPosResult } = await svc
      .from('dynamic_table_columns')
      .select('position')
      .eq('table_id', table_id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    let nextPosition = (maxPosResult?.position ?? 0) + 1

    const columnsToCreate = ENGAGEMENT_COLUMNS.filter(c => !existingKeys.has(c.key))
    if (columnsToCreate.length > 0) {
      const inserts = columnsToCreate.map(c => ({
        table_id,
        key: c.key,
        label: c.label,
        column_type: c.column_type,
        position: nextPosition++,
        is_visible: true,
      }))

      await svc.from('dynamic_table_columns').insert(inserts)
    }

    // Refresh column map after potential inserts
    const { data: allColumns } = await svc
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', table_id)

    const columnKeyToId = new Map<string, string>()
    for (const col of allColumns ?? []) {
      columnKeyToId.set(col.key, col.id)
    }

    // Step 2: Get existing rows with their email values (for matching)
    const { data: rows } = await svc
      .from('dynamic_table_rows')
      .select('id, source_id, instantly_lead_id')
      .eq('table_id', table_id)

    if (!rows || rows.length === 0) {
      return jsonResponse({ success: true, new_leads: 0, updated_leads: 0, message: 'No rows in table' })
    }

    // Get email column to match leads
    const { data: link } = await svc
      .from('instantly_campaign_links')
      .select('field_mapping')
      .eq('table_id', table_id)
      .eq('campaign_id', campaign_id)
      .maybeSingle()

    const emailColKey = link?.field_mapping?.email
    if (!emailColKey) {
      return jsonResponse({ success: false, error: 'No email column mapped for this campaign link' })
    }

    const emailColId = columnKeyToId.get(emailColKey)
    if (!emailColId) {
      return jsonResponse({ success: false, error: `Email column "${emailColKey}" not found` })
    }

    // Get email cell values for all rows
    const { data: emailCells } = await svc
      .from('dynamic_table_cells')
      .select('row_id, value')
      .eq('column_id', emailColId)
      .in('row_id', rows.map(r => r.id))

    // Build email → rowId lookup (lowercase for matching)
    const emailToRowId = new Map<string, string>()
    for (const cell of emailCells ?? []) {
      if (cell.value) {
        emailToRowId.set(cell.value.trim().toLowerCase(), cell.row_id)
      }
    }

    // Step 3: Fetch all leads from Instantly for this campaign
    const allLeads: any[] = []
    let startingAfter: string | undefined = undefined
    let hasMore = true

    while (hasMore) {
      const data = await instantly.request<any>({
        method: 'POST',
        path: '/api/v2/leads/list',
        body: {
          campaign_id,
          limit: LEAD_PAGE_SIZE,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        },
      })

      const items = data?.items ?? data ?? []
      if (Array.isArray(items)) {
        allLeads.push(...items)
      }

      startingAfter = data?.next_starting_after
      hasMore = !!startingAfter && items.length === LEAD_PAGE_SIZE
    }

    // Step 4: Match leads to rows and build cell upserts
    const cellUpserts: Array<{ row_id: string; column_id: string; value: string }> = []
    let matchedCount = 0
    let unmatchedCount = 0

    for (const lead of allLeads) {
      const email = (lead.email || '').trim().toLowerCase()
      const rowId = emailToRowId.get(email)

      if (!rowId) {
        unmatchedCount++
        continue
      }

      matchedCount++

      // Map engagement data to columns
      const statusColId = columnKeyToId.get('instantly_status')
      const emailStatusColId = columnKeyToId.get('instantly_email_status')
      const lastContactedColId = columnKeyToId.get('instantly_last_contacted')
      const replyCountColId = columnKeyToId.get('instantly_reply_count')
      const openCountColId = columnKeyToId.get('instantly_open_count')

      if (statusColId && lead.interest_status_label) {
        cellUpserts.push({ row_id: rowId, column_id: statusColId, value: String(lead.interest_status_label) })
      }

      if (emailStatusColId && lead.lead_status) {
        cellUpserts.push({ row_id: rowId, column_id: emailStatusColId, value: String(lead.lead_status) })
      }

      if (lastContactedColId && lead.timestamp_last_email_sent) {
        cellUpserts.push({ row_id: rowId, column_id: lastContactedColId, value: lead.timestamp_last_email_sent })
      }

      if (replyCountColId && lead.reply_count !== undefined) {
        cellUpserts.push({ row_id: rowId, column_id: replyCountColId, value: String(lead.reply_count ?? 0) })
      }

      if (openCountColId && lead.open_count !== undefined) {
        cellUpserts.push({ row_id: rowId, column_id: openCountColId, value: String(lead.open_count ?? 0) })
      }
    }

    // Step 5: Batch upsert cells
    for (let i = 0; i < cellUpserts.length; i += CELL_CHUNK_SIZE) {
      const chunk = cellUpserts.slice(i, i + CELL_CHUNK_SIZE)
      const { error: upsertError } = await svc
        .from('dynamic_table_cells')
        .upsert(chunk, { onConflict: 'row_id,column_id' })

      if (upsertError) {
        console.error(`[sync-instantly-engagement] Upsert error at chunk ${i}:`, upsertError.message)
      }
    }

    // Step 6: Update campaign link + integration timestamps
    await svc
      .from('instantly_campaign_links')
      .update({ last_engagement_sync_at: new Date().toISOString() })
      .eq('table_id', table_id)
      .eq('campaign_id', campaign_id)

    await svc
      .from('instantly_org_integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('org_id', table.organization_id)

    // Record in sync history
    await svc.from('instantly_sync_history').insert({
      table_id,
      campaign_id,
      synced_by: user.id,
      updated_leads_count: matchedCount,
      sync_type: 'engagement_pull',
      sync_duration_ms: Date.now() - startTime,
    })

    return jsonResponse({
      success: true,
      matched_leads: matchedCount,
      unmatched_leads: unmatchedCount,
      total_instantly_leads: allLeads.length,
      cells_updated: cellUpserts.length,
      columns_created: columnsToCreate.length,
    })
  } catch (e: any) {
    console.error('[sync-instantly-engagement] Unhandled error:', e)
    return jsonResponse({ success: false, error: e.message || 'Internal server error' }, 500)
  }
})

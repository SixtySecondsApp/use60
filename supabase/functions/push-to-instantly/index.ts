import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { corsHeaders } from '../_shared/cors.ts'
import { InstantlyClient } from '../_shared/instantly.ts'

const BULK_CHUNK_SIZE = 100

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
    const { table_id, campaign_id, row_ids, field_mapping } = body

    if (!table_id || !campaign_id) {
      return jsonResponse({ success: false, error: 'Missing table_id or campaign_id' })
    }

    const svc = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Get table + verify org membership
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

    // Get Instantly API key
    const { data: creds } = await svc
      .from('instantly_org_credentials')
      .select('api_key')
      .eq('org_id', table.organization_id)
      .maybeSingle()

    if (!creds?.api_key) {
      return jsonResponse({ success: false, error: 'Instantly not connected' })
    }

    const instantly = new InstantlyClient({ apiKey: creds.api_key })

    // Validate campaign still exists before building leads
    try {
      await instantly.request<any>({
        method: 'GET',
        path: `/api/v2/campaigns/${campaign_id}`,
      })
    } catch (e: any) {
      const msg = e.message || ''
      if (msg.includes('404') || msg.includes('not found') || msg.toLowerCase().includes('not_found')) {
        return jsonResponse({
          success: false,
          error: 'Campaign not found in Instantly. It may have been deleted.',
          code: 'CAMPAIGN_NOT_FOUND',
        })
      }
      // Non-404 errors (rate limit, network) — let the push proceed and fail naturally
      console.warn('[push-to-instantly] Campaign validation warning:', msg)
    }

    // Get columns (for mapping) — include integration_config for step column detection
    const { data: columns } = await svc
      .from('dynamic_table_columns')
      .select('id, key, label, integration_config')
      .eq('table_id', table_id)

    const columnKeyToId = new Map<string, string>()
    const columnIdToKey = new Map<string, string>()
    for (const col of columns ?? []) {
      columnKeyToId.set(col.key, col.id)
      columnIdToKey.set(col.id, col.key)
    }

    // Detect sequence step columns (created by Instantly wizard's author_steps mode)
    // These have integration_config.instantly_subtype === 'sequence_step'
    const stepColumns: Array<{ key: string; varName: string }> = []
    for (const col of columns ?? []) {
      const cfg = col.integration_config as Record<string, any> | null
      if (cfg?.instantly_subtype === 'sequence_step' && cfg?.step_config) {
        const stepNum = cfg.step_config.step_number
        const field = cfg.step_config.field // 'subject' or 'body'
        stepColumns.push({
          key: col.key,
          varName: `step_${stepNum}_${field}`,
        })
      }
    }

    // Get field mapping — check: 1) request body, 2) campaign_links table, 3) column integration_config
    let mapping = field_mapping
    if (!mapping) {
      const { data: link } = await svc
        .from('instantly_campaign_links')
        .select('field_mapping')
        .eq('table_id', table_id)
        .eq('campaign_id', campaign_id)
        .maybeSingle()

      mapping = link?.field_mapping
    }

    // Fallback: check column integration_config (where EditInstantlySettingsModal saves it)
    if (!mapping) {
      const { data: configCol } = await svc
        .from('dynamic_table_columns')
        .select('integration_config')
        .eq('table_id', table_id)
        .eq('column_type', 'instantly')
        .not('integration_config', 'is', null)

      if (configCol) {
        for (const col of configCol) {
          const cfg = col.integration_config as Record<string, any> | null
          if (cfg?.campaign_id === campaign_id && cfg?.field_mapping?.email) {
            mapping = cfg.field_mapping
            break
          }
        }
      }
    }

    if (!mapping?.email) {
      return jsonResponse({ success: false, error: 'No email column mapped. Cannot push leads.' })
    }

    // Get rows (all or selected)
    let rowsQuery = svc
      .from('dynamic_table_rows')
      .select('id, source_id')
      .eq('table_id', table_id)

    if (row_ids && Array.isArray(row_ids) && row_ids.length > 0) {
      rowsQuery = rowsQuery.in('id', row_ids)
    }

    const { data: rows } = await rowsQuery
    if (!rows || rows.length === 0) {
      return jsonResponse({ success: true, pushed_count: 0, skipped_count: 0, error_count: 0 })
    }

    // Get all cells for these rows
    const rowIdList = rows.map(r => r.id)
    const allCells: Array<{ row_id: string; column_id: string; value: string | null }> = []

    // Fetch cells in chunks to avoid URL length limits
    for (let i = 0; i < rowIdList.length; i += 500) {
      const chunk = rowIdList.slice(i, i + 500)
      const { data: cells } = await svc
        .from('dynamic_table_cells')
        .select('row_id, column_id, value')
        .in('row_id', chunk)

      if (cells) allCells.push(...cells)
    }

    // Build cell lookup: rowId -> { colKey: value }
    const rowCellMap = new Map<string, Record<string, string | null>>()
    for (const cell of allCells) {
      const colKey = columnIdToKey.get(cell.column_id)
      if (!colKey) continue
      if (!rowCellMap.has(cell.row_id)) rowCellMap.set(cell.row_id, {})
      rowCellMap.get(cell.row_id)![colKey] = cell.value
    }

    // Build Instantly leads from mapping
    const leads: Array<{ email: string; first_name?: string; last_name?: string; company_name?: string; custom_variables?: Record<string, string | number | boolean | null>; _row_id: string }> = []
    let skipped = 0

    for (const row of rows) {
      const cellValues = rowCellMap.get(row.id) || {}

      const email = cellValues[mapping.email]
      if (!email || !email.includes('@')) {
        skipped++
        continue
      }

      const lead: any = {
        email: email.trim().toLowerCase(),
        _row_id: row.id,
      }

      if (mapping.first_name && cellValues[mapping.first_name]) {
        lead.first_name = cellValues[mapping.first_name]
      }
      if (mapping.last_name && cellValues[mapping.last_name]) {
        lead.last_name = cellValues[mapping.last_name]
      }
      if (mapping.company_name && cellValues[mapping.company_name]) {
        lead.company_name = cellValues[mapping.company_name]
      }

      // All other mapped fields go into custom_variables
      const customVars: Record<string, string | null> = {}

      if (mapping.custom_variables && typeof mapping.custom_variables === 'object') {
        for (const [instantlyKey, colKey] of Object.entries(mapping.custom_variables)) {
          const val = cellValues[colKey as string]
          if (val !== undefined) customVars[instantlyKey] = val
        }
      }

      // Auto-include sequence step column values (subject/body from formulas or AI)
      for (const sc of stepColumns) {
        const val = cellValues[sc.key]
        if (val) customVars[sc.varName] = val
      }

      if (Object.keys(customVars).length > 0) {
        lead.custom_variables = customVars
      }

      leads.push(lead)
    }

    // Push in chunks via bulk API
    let pushedTotal = 0
    let errorCount = 0

    for (let i = 0; i < leads.length; i += BULK_CHUNK_SIZE) {
      const chunk = leads.slice(i, i + BULK_CHUNK_SIZE)

      // Strip _row_id before sending to Instantly
      const instantlyLeads = chunk.map(({ _row_id, ...rest }) => rest)

      try {
        await instantly.request<any>({
          method: 'POST',
          path: '/api/v2/leads/bulk',
          body: {
            campaign_id: campaign_id,
            skip_if_in_campaign: true,
            leads: instantlyLeads,
          },
        })
        pushedTotal += chunk.length
      } catch (e: any) {
        console.error(`[push-to-instantly] Bulk push failed for chunk ${i}:`, e.message)
        errorCount += chunk.length
      }
    }

    // Update campaign link with last push timestamp
    await svc
      .from('instantly_campaign_links')
      .update({ last_push_at: new Date().toISOString() })
      .eq('table_id', table_id)
      .eq('campaign_id', campaign_id)

    // Record in sync history
    await svc.from('instantly_sync_history').insert({
      table_id,
      campaign_id,
      synced_by: user.id,
      pushed_leads_count: pushedTotal,
      sync_type: 'lead_push',
      sync_duration_ms: Date.now() - startTime,
      error_message: errorCount > 0 ? `${errorCount} leads failed to push` : null,
    })

    return jsonResponse({
      success: true,
      pushed_count: pushedTotal,
      skipped_count: skipped,
      error_count: errorCount,
      total_rows: rows.length,
    })
  } catch (e: any) {
    console.error('[push-to-instantly] Unhandled error:', e)
    return jsonResponse({ success: false, error: e.message || 'Internal server error' }, 500)
  }
})

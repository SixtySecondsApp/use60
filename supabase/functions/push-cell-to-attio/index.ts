import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'
import { AttioClient, toAttioValues } from '../_shared/attio.ts'

/**
 * Push Cell to Attio (Bidirectional Write-Back)
 *
 * Fire-and-forget edge function. When a user edits a cell in an Attio-sourced
 * Ops table, this pushes the change back to Attio.
 *
 * Loop prevention: checks attio_last_pushed_at vs cell.updated_at to avoid
 * infinite sync cycles.
 */
serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse('Server misconfigured', req, 500)
  }

  // Validate user JWT
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader) return errorResponse('Unauthorized', req, 401)

  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await anonClient.auth.getUser()
  if (userError || !user) return errorResponse('Unauthorized', req, 401)

  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const body = await req.json()
    const { row_id, column_id, value, org_id } = body

    if (!row_id || !column_id || !org_id) {
      return errorResponse('Missing row_id, column_id, or org_id', req, 400)
    }

    // Get column details (must be attio_property type)
    const { data: column, error: colError } = await svc
      .from('dynamic_table_columns')
      .select('id, column_type, attio_property_name')
      .eq('id', column_id)
      .maybeSingle()

    if (colError || !column) {
      return errorResponse('Column not found', req, 404)
    }

    if (column.column_type !== 'attio_property' || !column.attio_property_name) {
      // Not an Attio column — no write-back needed
      return jsonResponse({ success: true, skipped: true, reason: 'not_attio_column' }, req)
    }

    // Get row details (need attio_record_id and source object)
    const { data: row, error: rowError } = await svc
      .from('dynamic_table_rows')
      .select('id, source_id, table_id')
      .eq('id', row_id)
      .maybeSingle()

    if (rowError || !row || !row.source_id) {
      return errorResponse('Row not found or missing source_id (attio_record_id)', req, 404)
    }

    // Get table to determine source object
    const { data: table, error: tableError } = await svc
      .from('dynamic_tables')
      .select('id, source_type, source_config')
      .eq('id', row.table_id)
      .maybeSingle()

    if (tableError || !table || table.source_type !== 'attio') {
      return jsonResponse({ success: true, skipped: true, reason: 'not_attio_table' }, req)
    }

    const sourceObject = table.source_config?.object || 'people'
    const recordId = row.source_id

    // Check write-back loop prevention
    const { data: cell } = await svc
      .from('dynamic_table_cells')
      .select('attio_last_pushed_at, updated_at')
      .eq('row_id', row_id)
      .eq('column_id', column_id)
      .maybeSingle()

    if (cell?.attio_last_pushed_at) {
      const pushedAt = new Date(cell.attio_last_pushed_at).getTime()
      const updatedAt = cell?.updated_at ? new Date(cell.updated_at).getTime() : 0
      // If pushed more recently than updated, this is a sync-back — skip
      if (pushedAt >= updatedAt) {
        return jsonResponse({ success: true, skipped: true, reason: 'loop_prevention' }, req)
      }
    }

    // Get Attio access token
    const { data: creds, error: credsError } = await svc
      .from('attio_org_credentials')
      .select('access_token')
      .eq('org_id', org_id)
      .maybeSingle()

    if (credsError || !creds?.access_token) {
      return errorResponse('Attio not connected or missing credentials', req, 400)
    }

    // Build the Attio update payload
    const attioValues = toAttioValues({ [column.attio_property_name]: value })

    // Push to Attio
    const client = new AttioClient({ accessToken: creds.access_token })
    await client.updateRecord(sourceObject, recordId, attioValues)

    // Mark cell as pushed to prevent loop
    await svc
      .from('dynamic_table_cells')
      .update({ attio_last_pushed_at: new Date().toISOString() })
      .eq('row_id', row_id)
      .eq('column_id', column_id)

    // Log the push
    await svc
      .from('integration_sync_logs')
      .insert({
        organization_id: org_id,
        integration_type: 'attio',
        direction: 'outbound',
        entity_type: sourceObject,
        status: 'success',
        details: {
          record_id: recordId,
          attribute: column.attio_property_name,
          action: 'cell_write_back',
        },
      })
      .catch((e: any) => console.warn('[push-cell-to-attio] Sync log failed:', e.message))

    return jsonResponse({ success: true, pushed: true }, req)
  } catch (error) {
    console.error('[push-cell-to-attio] Error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      req,
      500
    )
  }
})

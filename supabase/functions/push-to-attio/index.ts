import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'
import { AttioClient, toAttioValues } from '../_shared/attio.ts'

/**
 * Push to Attio — Batch assert (upsert) Ops table rows to Attio
 *
 * Supports:
 * - Field mapping from Ops columns to Attio attributes
 * - Matching attribute for dedup (e.g., 'email_addresses' for people, 'domains' for companies)
 * - Duplicate strategies: update (assert/upsert), skip (check first), create (always new)
 * - Optional list addition after push
 * - Rate-limited batch processing (25 writes/s)
 */
serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse('Server misconfigured', req, 500)
  }

  // Validate user JWT
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
    const {
      org_id,
      table_id,
      object, // 'people', 'companies', 'deals'
      field_mapping, // { column_id: attio_attribute_name }
      field_type_map, // { attio_attribute: 'email' | 'phone' | 'domain' | ... }
      matching_attribute, // e.g., 'email_addresses' for people
      duplicate_strategy = 'update', // 'update' | 'skip' | 'create'
      row_ids, // optional: specific rows to push (null = all)
      list_id, // optional: add pushed records to this Attio list
      action_column_id, // optional: column to update with push status
    } = body

    if (!org_id || !table_id || !object || !field_mapping) {
      return errorResponse('Missing org_id, table_id, object, or field_mapping', req, 400)
    }

    // Verify admin role
    const { data: membership } = await svc
      .from('organization_memberships')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return errorResponse('Admin role required', req, 403)
    }

    // Get Attio credentials
    const { data: creds } = await svc
      .from('attio_org_credentials')
      .select('access_token')
      .eq('org_id', org_id)
      .maybeSingle()

    if (!creds?.access_token) {
      return errorResponse('Attio not connected', req, 400)
    }

    const client = new AttioClient({ accessToken: creds.access_token })

    // Get column definitions for mapping
    const columnIds = Object.keys(field_mapping)
    const { data: columns } = await svc
      .from('dynamic_table_columns')
      .select('id, name')
      .in('id', columnIds)

    const columnMap = new Map((columns || []).map((c: any) => [c.id, c.name]))

    // Get rows to push
    let rowQuery = svc
      .from('dynamic_table_rows')
      .select('id, source_id')
      .eq('table_id', table_id)
      .is('attio_removed_at', null)

    if (row_ids?.length) {
      rowQuery = rowQuery.in('id', row_ids)
    }

    const { data: rows, error: rowsError } = await rowQuery
    if (rowsError) return errorResponse(`Failed to fetch rows: ${rowsError.message}`, req, 500)
    if (!rows || rows.length === 0) {
      return jsonResponse({ success: true, created: 0, updated: 0, skipped: 0, failed: 0 }, req)
    }

    // Get all cells for these rows and mapped columns
    const rowIdList = rows.map((r: any) => r.id)
    const { data: cells } = await svc
      .from('dynamic_table_cells')
      .select('row_id, column_id, value')
      .in('row_id', rowIdList)
      .in('column_id', columnIds)

    // Build row -> cell map
    const cellsByRow = new Map<string, Map<string, string>>()
    for (const cell of cells || []) {
      if (!cellsByRow.has(cell.row_id)) cellsByRow.set(cell.row_id, new Map())
      cellsByRow.get(cell.row_id)!.set(cell.column_id, cell.value || '')
    }

    // Process rows in batches
    const BATCH_SIZE = 10 // Conservative for Attio's 25 writes/s
    let created = 0
    let updated = 0
    let skipped = 0
    let failed = 0
    const statusUpdates: Array<{ row_id: string; status: string }> = []

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)

      const batchPromises = batch.map(async (row: any) => {
        try {
          const rowCells = cellsByRow.get(row.id) || new Map()

          // Build flat object from field mapping
          const flatObj: Record<string, any> = {}
          for (const [colId, attioAttr] of Object.entries(field_mapping)) {
            const cellValue = rowCells.get(colId)
            if (cellValue !== undefined && cellValue !== '') {
              flatObj[attioAttr as string] = cellValue
            }
          }

          if (Object.keys(flatObj).length === 0) {
            skipped++
            statusUpdates.push({ row_id: row.id, status: 'Skipped (no data)' })
            return
          }

          // Convert to Attio value format
          const attioValues = toAttioValues(flatObj, field_type_map)

          let result: any
          let action: string

          if (duplicate_strategy === 'update' && matching_attribute) {
            // Assert (upsert) with matching attribute
            result = await client.assertRecord(object, attioValues, matching_attribute)
            action = row.source_id ? 'Updated' : 'Created'
            if (row.source_id) updated++
            else created++
          } else if (duplicate_strategy === 'skip' && row.source_id) {
            // Skip if already has a source_id
            skipped++
            statusUpdates.push({ row_id: row.id, status: 'Skipped (exists)' })
            return
          } else {
            // Create new record
            result = await client.createRecord(object, attioValues)
            action = 'Created'
            created++
          }

          // Store the Attio record ID back on the row
          const recordId = result?.id?.record_id
          if (recordId && !row.source_id) {
            await svc
              .from('dynamic_table_rows')
              .update({ source_id: recordId })
              .eq('id', row.id)
          }

          // Optionally add to list
          if (list_id && recordId) {
            try {
              await client.addToList(list_id, object, recordId)
            } catch (listErr: any) {
              console.warn(`[push-to-attio] Failed to add to list: ${listErr.message}`)
            }
          }

          // Mark cells as pushed
          for (const colId of Object.keys(field_mapping)) {
            await svc
              .from('dynamic_table_cells')
              .update({ attio_last_pushed_at: new Date().toISOString() })
              .eq('row_id', row.id)
              .eq('column_id', colId)
          }

          statusUpdates.push({ row_id: row.id, status: action })
        } catch (err: any) {
          console.error(`[push-to-attio] Row ${row.id} failed:`, err.message)
          failed++
          statusUpdates.push({ row_id: row.id, status: `Failed: ${err.message}` })
        }
      })

      await Promise.all(batchPromises)
    }

    // Update action column if specified
    if (action_column_id && statusUpdates.length > 0) {
      const cellUpserts = statusUpdates.map((s) => ({
        row_id: s.row_id,
        column_id: action_column_id,
        value: s.status,
      }))

      // Batch upsert in chunks
      for (let i = 0; i < cellUpserts.length; i += 100) {
        const chunk = cellUpserts.slice(i, i + 100)
        await svc
          .from('dynamic_table_cells')
          .upsert(chunk, { onConflict: 'row_id,column_id' })
          .catch((e: any) => console.warn('[push-to-attio] Status update failed:', e.message))
      }
    }

    // Log the push operation
    await svc
      .from('integration_sync_logs')
      .insert({
        organization_id: org_id,
        integration_type: 'attio',
        direction: 'outbound',
        entity_type: object,
        status: 'success',
        details: {
          table_id,
          created,
          updated,
          skipped,
          failed,
          total: rows.length,
          matching_attribute,
          duplicate_strategy,
        },
      })
      .catch((e: any) => console.warn('[push-to-attio] Sync log failed:', e.message))

    return jsonResponse({
      success: true,
      created,
      updated,
      skipped,
      failed,
      total: rows.length,
    }, req)
  } catch (error) {
    console.error('[push-to-attio] Error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      req,
      500
    )
  }
})

// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'
import { AttioClient, fromAttioValues } from '../_shared/attio.ts'

/**
 * sync-attio-ops-table — Incremental sync of an Attio-sourced Ops table.
 *
 * Fetches ALL records from Attio (object query or list entries), diffs against
 * local rows, and applies creates/updates/removals. Stores a snapshot in
 * attio_sync_history for revert capability.
 */

const CHUNK_SIZE = 500
const ATTIO_PAGE_SIZE = 500

serve(async (req: Request) => {
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

  // Validate user JWT or cron secret
  let syncedByUserId: string | null = null
  const authHeader = req.headers.get('Authorization') || ''
  const cronSecret = req.headers.get('x-cron-secret') || ''
  const expectedCronSecret = Deno.env.get('CRON_SECRET') || ''

  const isCron = cronSecret && expectedCronSecret && cronSecret === expectedCronSecret

  if (!isCron) {
    if (!authHeader) return errorResponse('Unauthorized', req, 401)

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return errorResponse('Unauthorized', req, 401)
    syncedByUserId = user.id
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const { table_id, org_id } = await req.json()

    if (!table_id) {
      return errorResponse('table_id required', req, 400)
    }

    // 1. Get table metadata
    const { data: table, error: tableErr } = await supabase
      .from('dynamic_tables')
      .select('id, organization_id, source_type, source_query')
      .eq('id', table_id)
      .single()

    if (tableErr || !table) {
      return errorResponse('Table not found', req, 404)
    }

    if (table.source_type !== 'attio') {
      return errorResponse('Table is not an Attio-sourced table', req, 400)
    }

    const orgId = org_id || table.organization_id
    const sourceQuery = (table.source_query as Record<string, any>) ?? {}
    const sourceObject = sourceQuery.object || 'people'
    const listId = sourceQuery.list_id || null
    const filter = sourceQuery.filter || null

    // 2. Get Attio credentials
    const { data: creds } = await supabase
      .from('attio_org_credentials')
      .select('access_token')
      .eq('org_id', orgId)
      .maybeSingle()

    if (!creds?.access_token) {
      return errorResponse('Attio not connected', req, 400)
    }

    const attio = new AttioClient({ accessToken: creds.access_token })

    // 3. Get table columns (attio_property type)
    const { data: columns } = await supabase
      .from('dynamic_table_columns')
      .select('id, key, attio_property_name, column_type')
      .eq('table_id', table_id)

    const propertyToColumnId = new Map<string, string>()
    for (const col of columns ?? []) {
      const propName = col.attio_property_name || col.key
      if (propName) propertyToColumnId.set(propName, col.id)
    }

    // 4. Get existing rows by source_id
    const { data: existingRows } = await supabase
      .from('dynamic_table_rows')
      .select('id, source_id, attio_removed_at')
      .eq('table_id', table_id)

    const sourceIdToRow = new Map<string, { id: string; attio_removed_at: string | null }>()
    for (const row of existingRows ?? []) {
      if (row.source_id) {
        sourceIdToRow.set(row.source_id, { id: row.id, attio_removed_at: row.attio_removed_at })
      }
    }

    // 5. Fetch ALL current records from Attio (paginate)
    const syncStartTime = Date.now()
    const allAttioRecords = new Map<string, { recordId: string; values: Record<string, any>; raw: any }>()

    if (listId) {
      // List-based: query list entries
      let offset = 0
      while (true) {
        const response = await attio.queryListEntries(listId, {
          filter: filter || undefined,
          limit: ATTIO_PAGE_SIZE,
          offset,
        })

        const entries = response?.data ?? []
        if (entries.length === 0) break

        for (const entry of entries) {
          const recordId = entry.parent_record_id
          const flatValues = fromAttioValues(entry.entry_values || {})
          allAttioRecords.set(recordId, {
            recordId,
            values: flatValues,
            raw: entry,
          })
        }

        offset = response.next_offset ?? 0
        if (!response.next_offset || entries.length < ATTIO_PAGE_SIZE) break
      }
    } else {
      // Object-based: query records
      let offset = 0
      while (true) {
        const response = await attio.queryRecords(sourceObject, {
          filter: filter || undefined,
          limit: ATTIO_PAGE_SIZE,
          offset,
        })

        const records = response?.data ?? []
        if (records.length === 0) break

        for (const record of records) {
          const recordId = record.id.record_id
          const flatValues = fromAttioValues(record.values || {})
          allAttioRecords.set(recordId, {
            recordId,
            values: flatValues,
            raw: record,
          })
        }

        offset = response.next_offset ?? 0
        if (!response.next_offset || records.length < ATTIO_PAGE_SIZE) break
      }
    }

    console.log(`[sync-attio-ops-table] Fetched ${allAttioRecords.size} records from Attio`)

    // 6. Diff: split into new, updated, removed
    const toInsert: Array<{ recordId: string; values: Record<string, any>; raw: any }> = []
    const toUpdate: Array<{ recordId: string; rowId: string; values: Record<string, any>; raw: any }> = []
    const toRemove: Array<{ rowId: string; sourceId: string }> = []
    const toReturn: Array<{ rowId: string; sourceId: string }> = []

    // Snapshot tracking
    const cellChanges: Array<{ row_id: string; column_id: string; old_value: string | null; new_value: string }> = []
    const rowActions: Array<{ id: string; action: 'created' | 'updated' | 'removed' | 'returned'; source_id: string }> = []

    for (const [recordId, attioRecord] of allAttioRecords) {
      const existing = sourceIdToRow.get(recordId)
      if (existing) {
        if (existing.attio_removed_at) {
          // Record returned to Attio
          toReturn.push({ rowId: existing.id, sourceId: recordId })
          rowActions.push({ id: existing.id, action: 'returned', source_id: recordId })
        }
        toUpdate.push({ recordId, rowId: existing.id, values: attioRecord.values, raw: attioRecord.raw })
      } else {
        toInsert.push(attioRecord)
      }
    }

    // Records in local but not in Attio = removed
    for (const [sourceId, row] of sourceIdToRow) {
      if (!allAttioRecords.has(sourceId) && !row.attio_removed_at) {
        toRemove.push({ rowId: row.id, sourceId })
        rowActions.push({ id: row.id, action: 'removed', source_id: sourceId })
      }
    }

    console.log(`[sync-attio-ops-table] Diff: ${toInsert.length} new, ${toUpdate.length} update, ${toRemove.length} remove, ${toReturn.length} return`)

    // 7. Process updates — batch upsert cells
    if (toUpdate.length > 0) {
      // Fetch existing cell values for snapshot + loop prevention
      const updateRowIds = toUpdate.map(u => u.rowId)

      // Fetch in chunks to avoid overly large IN clauses
      const existingCellMap = new Map<string, { value: string | null; attio_last_pushed_at: string | null }>()

      for (let i = 0; i < updateRowIds.length; i += CHUNK_SIZE) {
        const chunk = updateRowIds.slice(i, i + CHUNK_SIZE)
        const { data: existingCells } = await supabase
          .from('dynamic_table_cells')
          .select('row_id, column_id, value, attio_last_pushed_at')
          .in('row_id', chunk)

        for (const cell of existingCells ?? []) {
          existingCellMap.set(`${cell.row_id}:${cell.column_id}`, {
            value: cell.value,
            attio_last_pushed_at: cell.attio_last_pushed_at,
          })
        }
      }

      const lastSyncAt = sourceQuery.last_synced_at
      const cellUpserts: Array<{ row_id: string; column_id: string; value: string }> = []

      for (const { rowId, values } of toUpdate) {
        for (const [propName, colId] of propertyToColumnId) {
          const rawValue = values[propName]
          if (rawValue === null || rawValue === undefined) continue

          const cellKey = `${rowId}:${colId}`
          const existing = existingCellMap.get(cellKey)

          // Write-back loop prevention: skip cells recently pushed by user
          if (existing?.attio_last_pushed_at && lastSyncAt) {
            const pushedAt = new Date(existing.attio_last_pushed_at).getTime()
            const lastSync = new Date(lastSyncAt).getTime()
            if (pushedAt > lastSync) continue
          }

          const newValue = String(rawValue)

          // Track change for snapshot
          if (existing && existing.value !== newValue) {
            cellChanges.push({ row_id: rowId, column_id: colId, old_value: existing.value, new_value: newValue })
          }

          cellUpserts.push({ row_id: rowId, column_id: colId, value: newValue })
        }
      }

      // Upsert cells in chunks
      for (let i = 0; i < cellUpserts.length; i += CHUNK_SIZE) {
        const chunk = cellUpserts.slice(i, i + CHUNK_SIZE)
        const { error: upsertErr } = await supabase
          .from('dynamic_table_cells')
          .upsert(chunk, { onConflict: 'row_id,column_id' })
        if (upsertErr) {
          console.error('[sync-attio-ops-table] Cell upsert error:', upsertErr)
        }
      }

      // Update source_data.attio on rows (parallel within chunks)
      for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
        const chunk = toUpdate.slice(i, i + CHUNK_SIZE)
        await Promise.all(
          chunk.map(({ rowId, raw }) =>
            supabase
              .from('dynamic_table_rows')
              .update({ source_data: { attio: raw } })
              .eq('id', rowId)
          )
        )
      }

      // Track updated rows in actions (only those with actual cell changes)
      const rowsWithChanges = new Set(cellChanges.map(c => c.row_id))
      for (const { rowId, recordId } of toUpdate) {
        if (rowsWithChanges.has(rowId)) {
          rowActions.push({ id: rowId, action: 'updated', source_id: recordId })
        }
      }
    }

    // 8. Process inserts — batch create rows + cells
    let newRowCount = 0
    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE)
        const rowInserts = chunk.map(r => ({
          table_id,
          source_id: r.recordId,
          source_data: { attio: r.raw },
        }))

        const { data: newRowsData } = await supabase
          .from('dynamic_table_rows')
          .insert(rowInserts)
          .select('id, source_id')

        if (newRowsData && newRowsData.length > 0) {
          const newSourceToRowId = new Map<string, string>()
          for (const r of newRowsData) {
            newSourceToRowId.set(r.source_id, r.id)
            rowActions.push({ id: r.id, action: 'created', source_id: r.source_id })
          }

          // Build cells for new rows
          const cellInserts: Array<{ row_id: string; column_id: string; value: string }> = []
          for (const record of chunk) {
            const rowId = newSourceToRowId.get(record.recordId)
            if (!rowId) continue
            for (const [propName, colId] of propertyToColumnId) {
              const rawValue = record.values[propName]
              if (rawValue !== null && rawValue !== undefined) {
                cellInserts.push({ row_id: rowId, column_id: colId, value: String(rawValue) })
              }
            }
          }

          // Insert cells in chunks
          for (let ci = 0; ci < cellInserts.length; ci += CHUNK_SIZE) {
            const cellChunk = cellInserts.slice(ci, ci + CHUNK_SIZE)
            await supabase.from('dynamic_table_cells').insert(cellChunk)
          }

          newRowCount += newRowsData.length
        }
      }
    }

    // 9. Process removals — soft delete
    if (toRemove.length > 0) {
      const removeIds = toRemove.map(r => r.rowId)
      for (let i = 0; i < removeIds.length; i += CHUNK_SIZE) {
        const chunk = removeIds.slice(i, i + CHUNK_SIZE)
        await supabase
          .from('dynamic_table_rows')
          .update({ attio_removed_at: new Date().toISOString() })
          .in('id', chunk)
      }
    }

    // 10. Process returns — clear attio_removed_at
    if (toReturn.length > 0) {
      const returnIds = toReturn.map(r => r.rowId)
      for (let i = 0; i < returnIds.length; i += CHUNK_SIZE) {
        const chunk = returnIds.slice(i, i + CHUNK_SIZE)
        await supabase
          .from('dynamic_table_rows')
          .update({ attio_removed_at: null })
          .in('id', chunk)
      }
    }

    // 11. Record sync history
    const syncDurationMs = Date.now() - syncStartTime
    const now = new Date().toISOString()

    try {
      await supabase.from('attio_sync_history').insert({
        table_id,
        synced_by: syncedByUserId,
        synced_at: now,
        new_records_count: newRowCount,
        updated_records_count: cellChanges.length > 0 ? new Set(cellChanges.map(c => c.row_id)).size : 0,
        removed_records_count: toRemove.length,
        returned_records_count: toReturn.length,
        snapshot: {
          cells: cellChanges.slice(0, 5000),
          rows: rowActions.slice(0, 2000),
        },
        sync_duration_ms: syncDurationMs,
      })
    } catch (historyErr) {
      console.error('[sync-attio-ops-table] Failed to record sync history:', historyErr)
    }

    // 12. Update table metadata
    await supabase
      .from('dynamic_tables')
      .update({
        row_count: (existingRows?.length ?? 0) + newRowCount - toRemove.length,
        source_query: { ...sourceQuery, last_synced_at: now },
      })
      .eq('id', table_id)

    // 13. Update attio_org_integrations.last_sync_at
    await supabase
      .from('attio_org_integrations')
      .update({ last_sync_at: now })
      .eq('org_id', orgId)

    // 14. Log to integration_sync_logs (fire-and-forget)
    supabase
      .from('integration_sync_logs')
      .insert({
        organization_id: orgId,
        integration_type: 'attio',
        direction: 'inbound',
        entity_type: sourceObject,
        status: 'success',
        details: {
          table_id,
          new: newRowCount,
          updated: cellChanges.length > 0 ? new Set(cellChanges.map(c => c.row_id)).size : 0,
          removed: toRemove.length,
          returned: toReturn.length,
          duration_ms: syncDurationMs,
        },
      })
      .then(() => {})
      .catch((e: any) => console.warn('[sync-attio-ops-table] Sync log failed:', e.message))

    // 15. Trigger insights analysis after sync (fire-and-forget)
    try {
      fetch(`${supabaseUrl}/functions/v1/ops-table-insights-engine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ tableId: table_id, action: 'analyze' }),
      }).catch(err => console.error('[sync-attio-ops-table] Insights trigger failed:', err))
    } catch {
      // Silent fail
    }

    // 16. Trigger on_sync workflows (fire-and-forget)
    try {
      const { data: workflows } = await supabase
        .from('ops_table_workflows')
        .select('id')
        .eq('table_id', table_id)
        .eq('trigger_type', 'on_sync')
        .eq('is_active', true)

      if (workflows && workflows.length > 0) {
        for (const workflow of workflows) {
          fetch(`${supabaseUrl}/functions/v1/ops-table-workflow-engine`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authHeader ? { Authorization: authHeader } : {}),
            },
            body: JSON.stringify({
              tableId: table_id,
              action: 'execute',
              workflowId: workflow.id,
            }),
          }).catch(err => console.error('[sync-attio-ops-table] Workflow trigger failed:', err))
        }
      }
    } catch {
      // Silent fail
    }

    return jsonResponse({
      new_rows: newRowCount,
      updated_rows: cellChanges.length > 0 ? new Set(cellChanges.map(c => c.row_id)).size : 0,
      removed_rows: toRemove.length,
      returned_rows: toReturn.length,
      total_attio_records: allAttioRecords.size,
      sync_duration_ms: syncDurationMs,
      last_synced_at: now,
    }, req)
  } catch (error: any) {
    console.error('[sync-attio-ops-table] Error:', error)
    return errorResponse(error?.message ?? 'Internal error', req, 500)
  }
})

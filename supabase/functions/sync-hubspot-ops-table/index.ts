// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

// Inlined HubSpotClient to avoid cross-file imports that cause bundling issues

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class HubSpotClient {
  private accessToken: string
  private baseUrl: string
  private minDelayMs: number

  constructor(args: { accessToken: string; baseUrl?: string; minDelayMs?: number }) {
    this.accessToken = args.accessToken
    this.baseUrl = args.baseUrl || 'https://api.hubapi.com'
    this.minDelayMs = typeof args.minDelayMs === 'number' ? args.minDelayMs : 120
  }

  async request<T>(args: {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
    path: string
    query?: Record<string, string | number | boolean | undefined | null>
    body?: any
    retries?: number
  }): Promise<T> {
    const retries = typeof args.retries === 'number' ? args.retries : 3
    let attempt = 0
    let lastError: any = null

    while (attempt <= retries) {
      try {
        if (this.minDelayMs > 0) await sleep(this.minDelayMs)

        const url = new URL(this.baseUrl + args.path)
        if (args.query) {
          for (const [k, v] of Object.entries(args.query)) {
            if (v === undefined || v === null) continue
            url.searchParams.set(k, String(v))
          }
        }

        const resp = await fetch(url.toString(), {
          method: args.method,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
        })

        if (resp.status === 204) return undefined as T

        const text = await resp.text()
        let json: any = null
        try {
          json = text ? JSON.parse(text) : null
        } catch {
          json = text ? { message: text } : null
        }

        if (!resp.ok) {
          const msg = json?.message || json?.error || `HubSpot API error (${resp.status})`
          throw { status: resp.status, message: msg, responseBody: json }
        }

        return json as T
      } catch (err: any) {
        lastError = err
        const status = err?.status
        const isRetryable = status === 429 || (typeof status === 'number' && status >= 500)
        if (!isRetryable || attempt === retries) throw err

        const waitMs = Math.min(30_000, 1000 * Math.pow(2, attempt))
        await sleep(waitMs)
        attempt++
      }
    }
    throw lastError || new Error('HubSpot request failed')
  }
}

/**
 * sync-hubspot-ops-table — Incremental sync of a HubSpot-sourced Ops table.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAGE_SIZE = 100

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { table_id } = await req.json()

    if (!table_id) {
      return new Response(
        JSON.stringify({ error: 'table_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Get table metadata
    const { data: table, error: tableErr } = await supabase
      .from('dynamic_tables')
      .select('id, organization_id, source_type, source_query')
      .eq('id', table_id)
      .single()

    if (tableErr || !table) {
      return new Response(
        JSON.stringify({ error: 'Table not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (table.source_type !== 'hubspot') {
      return new Response(
        JSON.stringify({ error: 'Table is not a HubSpot-sourced table' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Extract user ID from auth header (for sync history)
    let syncedByUserId: string | null = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      try {
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        })
        const { data: { user } } = await userClient.auth.getUser()
        syncedByUserId = user?.id ?? null
      } catch { /* non-critical */ }
    }

    const sourceQuery = table.source_query as Record<string, any> ?? {}
    const objectType = sourceQuery.object_type ?? 'contacts'
    const lastSyncedAt = sourceQuery.last_synced_at ?? sourceQuery.imported_at

    // 2. Get HubSpot credentials
    const { data: creds } = await supabase
      .from('hubspot_org_credentials')
      .select('access_token')
      .eq('org_id', table.organization_id)
      .maybeSingle()

    if (!creds?.access_token) {
      return new Response(
        JSON.stringify({ error: 'HubSpot not connected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const hubspot = new HubSpotClient({ accessToken: creds.access_token })

    // 3. Get table columns
    const { data: columns } = await supabase
      .from('dynamic_table_columns')
      .select('id, key, hubspot_property_name')
      .eq('table_id', table_id)

    const propertyToColumnId = new Map<string, string>()
    for (const col of columns ?? []) {
      const propName = col.hubspot_property_name || col.key
      propertyToColumnId.set(propName, col.id)
    }

    // 4. Get existing rows by source_id
    const { data: existingRows } = await supabase
      .from('dynamic_table_rows')
      .select('id, source_id')
      .eq('table_id', table_id)

    const sourceIdToRowId = new Map<string, string>()
    for (const row of existingRows ?? []) {
      if (row.source_id) {
        sourceIdToRowId.set(row.source_id, row.id)
      }
    }

    // 5. Fetch updated records from HubSpot
    const propertyNames = Array.from(propertyToColumnId.keys())
    const listId = sourceQuery.list_id
    let after: string | undefined
    let newRows = 0
    let updatedRows = 0

    // Track all HubSpot contact IDs seen during sync (for removed contact detection)
    const allHubSpotContactIds = new Set<string>()
    const syncStartTime = Date.now()

    // Snapshot tracking for sync history
    const cellChanges: Array<{ row_id: string; column_id: string; old_value: string | null; new_value: string }> = []
    const rowActions: Array<{ id: string; action: 'added' | 'removed' | 'returned'; source_id: string }> = []

    // Pre-fetch existing cell values for snapshot (for updated rows only)
    // We'll do this lazily per-page to avoid loading all cells upfront

    // If this is a list-based table, verify the list still exists
    if (listId) {
      console.log(`[sync-hubspot-ops-table] Verifying list ${listId} exists...`)
      try {
        const listInfo = await hubspot.request<any>({
          method: 'GET',
          path: `/crm/v3/lists/${listId}`,
        })
        console.log(`[sync-hubspot-ops-table] List found: "${listInfo?.name}" (ID: ${listInfo?.listId})`)
      } catch (listErr: any) {
        console.error(`[sync-hubspot-ops-table] List verification failed:`, listErr)
        const errorMsg = listErr?.message || listErr?.responseBody?.message || 'Unknown error'

        // Check if it's a "list not found" error
        if (errorMsg.includes('does not exist') || listErr?.status === 404) {
          return new Response(
            JSON.stringify({
              error: `HubSpot list no longer exists (ID: ${listId}). The list may have been deleted in HubSpot. You can delete this table and re-import from a new list.`,
              details: errorMsg,
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
        throw listErr
      }
    }

    while (true) {
      let results: any[] = []

      if (listId) {
        // For list-based tables: memberships + batch read
        console.log(`[sync-hubspot-ops-table] Fetching memberships for list ${listId}...`)
        const membershipResponse = await hubspot.request<any>({
          method: 'GET',
          path: `/crm/v3/lists/${listId}/memberships`,
          query: { limit: PAGE_SIZE, ...(after ? { after } : {}) },
        })

        const memberIds = membershipResponse?.results?.map((m: any) => m.recordId) ?? []
        if (memberIds.length === 0) break

        const batchResponse = await hubspot.request<any>({
          method: 'POST',
          path: `/crm/v3/objects/${objectType}/batch/read`,
          body: {
            propertiesWithHistory: [],
            inputs: memberIds.map((id: string) => ({ id })),
            properties: propertyNames.length > 0 ? propertyNames : ['email'],
          },
        })

        results = batchResponse?.results ?? []
        after = membershipResponse?.paging?.next?.after
      } else {
        // No list - use search API
        const filters: any[] = []
        if (lastSyncedAt) {
          filters.push({
            propertyName: 'lastmodifieddate',
            operator: 'GTE',
            value: new Date(lastSyncedAt).getTime().toString(),
          })
        }

        const response = await hubspot.request<any>({
          method: 'POST',
          path: `/crm/v3/objects/${objectType}/search`,
          body: {
            filterGroups: filters.length > 0 ? [{ filters }] : [],
            properties: propertyNames.length > 0 ? propertyNames : ['email'],
            limit: PAGE_SIZE,
            ...(after ? { after } : {}),
          },
        })

        results = response?.results ?? []
        after = response?.paging?.next?.after
      }

      if (results.length === 0) break

      // Track all contact IDs for removed detection
      for (const record of results) {
        allHubSpotContactIds.add(record.id)
      }

      // Split results into existing (update) and new (insert) buckets
      const toUpdate: Array<{ record: any; rowId: string }> = []
      const toInsert: any[] = []

      for (const record of results) {
        const existingRowId = sourceIdToRowId.get(record.id)
        if (existingRowId) {
          toUpdate.push({ record, rowId: existingRowId })
        } else {
          toInsert.push(record)
        }
      }

      const CHUNK_SIZE = 500

      // --- Batch UPDATE existing rows ---
      if (toUpdate.length > 0) {
        // Fetch existing cell values + pushed timestamps for these rows (for snapshot + loop prevention)
        const updateRowIds = toUpdate.map(u => u.rowId)
        const { data: existingCells } = await supabase
          .from('dynamic_table_cells')
          .select('row_id, column_id, value, hubspot_last_pushed_at')
          .in('row_id', updateRowIds)

        const existingCellMap = new Map<string, { value: string | null; hubspot_last_pushed_at: string | null }>()
        for (const cell of existingCells ?? []) {
          existingCellMap.set(`${cell.row_id}:${cell.column_id}`, {
            value: cell.value,
            hubspot_last_pushed_at: cell.hubspot_last_pushed_at,
          })
        }

        // Batch upsert cells for all existing rows (uses UNIQUE(row_id, column_id) constraint)
        const cellUpserts: Array<{ row_id: string; column_id: string; value: string }> = []
        for (const { record, rowId } of toUpdate) {
          for (const [propName, colId] of propertyToColumnId) {
            const value = record.properties?.[propName]
            if (value === null || value === undefined) continue

            const cellKey = `${rowId}:${colId}`
            const existing = existingCellMap.get(cellKey)

            // Write-back loop prevention: skip cells recently pushed by user
            if (existing?.hubspot_last_pushed_at && lastSyncedAt) {
              const pushedAt = new Date(existing.hubspot_last_pushed_at).getTime()
              const lastSync = new Date(lastSyncedAt).getTime()
              if (pushedAt > lastSync) continue
            }

            const newValue = String(value)
            // Track change for snapshot
            if (existing && existing.value !== newValue) {
              cellChanges.push({ row_id: rowId, column_id: colId, old_value: existing.value, new_value: newValue })
            }

            cellUpserts.push({ row_id: rowId, column_id: colId, value: newValue })
          }
        }

        // Upsert cells in chunks of 500 to avoid payload limits
        for (let i = 0; i < cellUpserts.length; i += CHUNK_SIZE) {
          const chunk = cellUpserts.slice(i, i + CHUNK_SIZE)
          const { error: upsertErr } = await supabase
            .from('dynamic_table_cells')
            .upsert(chunk, { onConflict: 'row_id,column_id' })
          if (upsertErr) {
            console.error('[sync-hubspot-ops-table] Cell upsert error:', upsertErr)
          }
        }

        // Batch update source_data on rows (must be individual updates since each has different data)
        // Use Promise.all to parallelize
        await Promise.all(
          toUpdate.map(({ record, rowId }) =>
            supabase
              .from('dynamic_table_rows')
              .update({ source_data: record })
              .eq('id', rowId)
          )
        )

        updatedRows += toUpdate.length
      }

      // --- Batch INSERT new rows ---
      if (toInsert.length > 0) {
        const rowInserts = toInsert.map((record) => ({
          table_id,
          source_id: record.id,
          source_data: record,
        }))

        const { data: newRowsData } = await supabase
          .from('dynamic_table_rows')
          .insert(rowInserts)
          .select('id, source_id')

        if (newRowsData && newRowsData.length > 0) {
          // Build a map of source_id → new row id
          const newSourceToRowId = new Map<string, string>()
          for (const r of newRowsData) {
            newSourceToRowId.set(r.source_id, r.id)
            sourceIdToRowId.set(r.source_id, r.id)
            rowActions.push({ id: r.id, action: 'added', source_id: r.source_id })
          }

          // Batch insert all cells for new rows
          const cellInserts: Array<{ row_id: string; column_id: string; value: string }> = []
          for (const record of toInsert) {
            const rowId = newSourceToRowId.get(record.id)
            if (!rowId) continue
            for (const [propName, colId] of propertyToColumnId) {
              const value = record.properties?.[propName]
              if (value !== null && value !== undefined) {
                cellInserts.push({ row_id: rowId, column_id: colId, value: String(value) })
              }
            }
          }

          // Insert cells in chunks of 500
          for (let i = 0; i < cellInserts.length; i += CHUNK_SIZE) {
            const chunk = cellInserts.slice(i, i + CHUNK_SIZE)
            await supabase.from('dynamic_table_cells').insert(chunk)
          }
        }

        newRows += toInsert.length
      }

      if (!after) break
    }

    // 6. Removed contact detection (list-based tables only)
    let removedCount = 0
    let returnedCount = 0

    if (listId && allHubSpotContactIds.size > 0) {
      // Fetch all rows with their source_id and hubspot_removed_at
      const { data: allRows } = await supabase
        .from('dynamic_table_rows')
        .select('id, source_id, hubspot_removed_at')
        .eq('table_id', table_id)

      const toRemove: string[] = []
      const toReturn: string[] = []

      for (const row of allRows ?? []) {
        if (!row.source_id) continue
        const inCurrentList = allHubSpotContactIds.has(row.source_id)

        if (!inCurrentList && !row.hubspot_removed_at) {
          // Contact was removed from the HubSpot list
          toRemove.push(row.id)
          rowActions.push({ id: row.id, action: 'removed', source_id: row.source_id })
        } else if (inCurrentList && row.hubspot_removed_at) {
          // Contact returned to the list
          toReturn.push(row.id)
          rowActions.push({ id: row.id, action: 'returned', source_id: row.source_id })
        }
      }

      if (toRemove.length > 0) {
        await supabase
          .from('dynamic_table_rows')
          .update({ hubspot_removed_at: new Date().toISOString() })
          .in('id', toRemove)
        removedCount = toRemove.length
      }

      if (toReturn.length > 0) {
        await supabase
          .from('dynamic_table_rows')
          .update({ hubspot_removed_at: null })
          .in('id', toReturn)
        returnedCount = toReturn.length
      }
    }

    // 7. Record sync history
    const syncDurationMs = Date.now() - syncStartTime
    const now = new Date().toISOString()

    try {
      await supabase.from('hubspot_sync_history').insert({
        table_id,
        synced_by: syncedByUserId,
        synced_at: now,
        new_contacts_count: newRows,
        updated_contacts_count: updatedRows,
        removed_contacts_count: removedCount,
        returned_contacts_count: returnedCount,
        snapshot: {
          cells: cellChanges.slice(0, 5000), // Cap snapshot size
          rows: rowActions.slice(0, 2000),
        },
        sync_duration_ms: syncDurationMs,
      })
    } catch (historyErr) {
      console.error('[sync-hubspot-ops-table] Failed to record sync history:', historyErr)
    }

    // 8. Update table metadata
    await supabase
      .from('dynamic_tables')
      .update({
        row_count: (existingRows?.length ?? 0) + newRows,
        source_query: { ...sourceQuery, last_synced_at: now },
      })
      .eq('id', table_id)

    // OI-011: Trigger insights analysis after sync (fire-and-forget)
    try {
      fetch(`${supabaseUrl}/functions/v1/ops-table-insights-engine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { 'Authorization': authHeader } : {}),
        },
        body: JSON.stringify({ tableId: table_id, action: 'analyze' }),
      }).catch(err => console.error('[sync] Insights trigger failed:', err));
    } catch (e) {
      // Silent fail - don't block sync
    }

    // OI-003: Trigger on_sync workflows (fire-and-forget)
    try {
      const { data: workflows } = await supabase
        .from('ops_table_workflows')
        .select('id')
        .eq('table_id', table_id)
        .eq('trigger_type', 'on_sync')
        .eq('is_active', true);

      if (workflows && workflows.length > 0) {
        for (const workflow of workflows) {
          fetch(`${supabaseUrl}/functions/v1/ops-table-workflow-engine`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authHeader ? { 'Authorization': authHeader } : {}),
            },
            body: JSON.stringify({
              tableId: table_id,
              action: 'execute',
              workflowId: workflow.id,
            }),
          }).catch(err => console.error('[sync] Workflow trigger failed:', err));
        }
      }
    } catch (e) {
      // Silent fail - don't block sync
    }

    return new Response(
      JSON.stringify({
        new_rows: newRows,
        updated_rows: updatedRows,
        removed_rows: removedCount,
        returned_rows: returnedCount,
        last_synced_at: now,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[sync-hubspot-ops-table] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HubSpotClient } from '../_shared/hubspot.ts'

/**
 * sync-hubspot-ops-table — Incremental sync of a HubSpot-sourced Ops table.
 *
 * POST body: {
 *   table_id: string,
 * }
 *
 * Uses lastmodifieddate to fetch only updated records since last sync.
 * Returns: { new_rows: number, updated_rows: number, last_synced_at: string }
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
      .select('id, key')
      .eq('table_id', table_id)

    const keyToColumnId = new Map<string, string>()
    for (const col of columns ?? []) {
      keyToColumnId.set(col.key, col.id)
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
    const propertyNames = Array.from(keyToColumnId.keys())
    let after: string | undefined
    let newRows = 0
    let updatedRows = 0

    // Build filter for records modified since last sync
    const filters: any[] = []
    if (lastSyncedAt) {
      filters.push({
        propertyName: 'lastmodifieddate',
        operator: 'GTE',
        value: new Date(lastSyncedAt).getTime().toString(),
      })
    }

    while (true) {
      const searchBody: any = {
        filterGroups: filters.length > 0 ? [{ filters }] : [],
        properties: propertyNames,
        limit: PAGE_SIZE,
      }
      if (after) searchBody.after = after

      const response = await hubspot.request<any>(
        `/crm/v3/objects/${objectType}/search`,
        { method: 'POST', body: JSON.stringify(searchBody) },
      )

      const results = response?.results ?? []
      if (results.length === 0) break

      for (const record of results) {
        const existingRowId = sourceIdToRowId.get(record.id)

        if (existingRowId) {
          // Update existing row's cells
          const cellUpserts: any[] = []
          for (const [key, colId] of keyToColumnId) {
            const value = record.properties?.[key]
            if (value !== null && value !== undefined) {
              cellUpserts.push({
                row_id: existingRowId,
                column_id: colId,
                value: String(value),
              })
            }
          }

          if (cellUpserts.length > 0) {
            // Upsert cells (update if exists, insert if not)
            for (const cell of cellUpserts) {
              const { data: existing } = await supabase
                .from('dynamic_table_cells')
                .select('id')
                .eq('row_id', cell.row_id)
                .eq('column_id', cell.column_id)
                .maybeSingle()

              if (existing) {
                await supabase
                  .from('dynamic_table_cells')
                  .update({ value: cell.value })
                  .eq('id', existing.id)
              } else {
                await supabase
                  .from('dynamic_table_cells')
                  .insert(cell)
              }
            }
          }

          // Update source_data
          await supabase
            .from('dynamic_table_rows')
            .update({ source_data: record })
            .eq('id', existingRowId)

          updatedRows++
        } else {
          // Insert new row
          const { data: newRow } = await supabase
            .from('dynamic_table_rows')
            .insert({ table_id, source_id: record.id, source_data: record })
            .select('id')
            .single()

          if (newRow) {
            const cellInserts: any[] = []
            for (const [key, colId] of keyToColumnId) {
              const value = record.properties?.[key]
              if (value !== null && value !== undefined) {
                cellInserts.push({
                  row_id: newRow.id,
                  column_id: colId,
                  value: String(value),
                })
              }
            }
            if (cellInserts.length > 0) {
              await supabase.from('dynamic_table_cells').insert(cellInserts)
            }
            sourceIdToRowId.set(record.id, newRow.id)
          }

          newRows++
        }
      }

      after = response?.paging?.next?.after
      if (!after) break
    }

    // 6. Update table metadata
    const now = new Date().toISOString()
    await supabase
      .from('dynamic_tables')
      .update({
        row_count: (existingRows?.length ?? 0) + newRows,
        source_query: { ...sourceQuery, last_synced_at: now },
      })
      .eq('id', table_id)

    return new Response(
      JSON.stringify({ new_rows: newRows, updated_rows: updatedRows, last_synced_at: now }),
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

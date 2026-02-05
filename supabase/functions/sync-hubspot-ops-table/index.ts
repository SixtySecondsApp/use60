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

      for (const record of results) {
        const existingRowId = sourceIdToRowId.get(record.id)

        if (existingRowId) {
          // Update existing row's cells
          for (const [propName, colId] of propertyToColumnId) {
            const value = record.properties?.[propName]
            if (value !== null && value !== undefined) {
              const { data: existing } = await supabase
                .from('dynamic_table_cells')
                .select('id')
                .eq('row_id', existingRowId)
                .eq('column_id', colId)
                .maybeSingle()

              if (existing) {
                await supabase
                  .from('dynamic_table_cells')
                  .update({ value: String(value) })
                  .eq('id', existing.id)
              } else {
                await supabase
                  .from('dynamic_table_cells')
                  .insert({ row_id: existingRowId, column_id: colId, value: String(value) })
              }
            }
          }

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
            for (const [propName, colId] of propertyToColumnId) {
              const value = record.properties?.[propName]
              if (value !== null && value !== undefined) {
                cellInserts.push({ row_id: newRow.id, column_id: colId, value: String(value) })
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

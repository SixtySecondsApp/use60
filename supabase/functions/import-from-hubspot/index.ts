// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HubSpotClient } from '../_shared/hubspot.ts'

/**
 * import-from-hubspot — Import HubSpot contacts/companies into a new Ops table.
 *
 * POST body: {
 *   org_id: string,
 *   user_id: string,
 *   table_name: string,
 *   object_type: 'contacts' | 'companies',
 *   properties: string[],           // HubSpot property names to import
 *   field_mappings: { hubspotProperty: string, columnLabel: string, columnType: string }[],
 *   list_id?: string,               // Import from specific list
 *   filters?: { propertyName: string, operator: string, value: string }[],
 *   limit?: number,                 // Max records (default 1000)
 * }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAGE_SIZE = 100
const DEFAULT_LIMIT = 1000

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json()
    const { org_id, user_id, table_name, object_type, properties, field_mappings, list_id, filters, limit } = body

    if (!org_id || !user_id || !table_name || !object_type || !field_mappings?.length) {
      return new Response(
        JSON.stringify({ error: 'org_id, user_id, table_name, object_type, and field_mappings required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Get HubSpot credentials
    const { data: creds } = await supabase
      .from('hubspot_org_credentials')
      .select('access_token')
      .eq('org_id', org_id)
      .maybeSingle()

    if (!creds?.access_token) {
      return new Response(
        JSON.stringify({ error: 'HubSpot not connected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const hubspot = new HubSpotClient({ accessToken: creds.access_token })

    // 2. Create table
    const { data: table, error: tableError } = await supabase
      .from('dynamic_tables')
      .insert({
        organization_id: org_id,
        created_by: user_id,
        name: table_name,
        source_type: 'hubspot',
        source_query: { object_type, list_id, filters, imported_at: new Date().toISOString() },
      })
      .select('id')
      .single()

    if (tableError) throw tableError

    // 3. Create columns from field mappings
    const columnInserts = field_mappings.map((m: any, idx: number) => ({
      table_id: table.id,
      key: m.hubspotProperty.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
      label: m.columnLabel,
      column_type: m.columnType || 'text',
      position: idx,
    }))

    const { data: createdColumns, error: colError } = await supabase
      .from('dynamic_table_columns')
      .insert(columnInserts)
      .select('id, key')

    if (colError) throw colError

    const keyToColumnId = new Map<string, string>()
    for (const col of createdColumns ?? []) {
      keyToColumnId.set(col.key, col.id)
    }

    // 4. Fetch HubSpot records with pagination
    const maxRecords = limit ?? DEFAULT_LIMIT
    const propertyNames = field_mappings.map((m: any) => m.hubspotProperty)
    let after: string | undefined
    let totalImported = 0

    while (totalImported < maxRecords) {
      let response: any

      if (list_id) {
        // Fetch from list
        const searchBody: any = {
          filterGroups: [{ filters: [{ propertyName: 'hs_object_id', operator: 'HAS_PROPERTY' }] }],
          properties: propertyNames,
          limit: Math.min(PAGE_SIZE, maxRecords - totalImported),
        }
        if (after) searchBody.after = after

        response = await hubspot.request<any>(`/crm/v3/lists/${list_id}/memberships/join-results`, {
          method: 'POST',
          body: JSON.stringify(searchBody),
        })
      } else {
        // Use search API
        const searchBody: any = {
          filterGroups: filters?.length
            ? [{ filters: filters.map((f: any) => ({ propertyName: f.propertyName, operator: f.operator, value: f.value })) }]
            : [],
          properties: propertyNames,
          limit: Math.min(PAGE_SIZE, maxRecords - totalImported),
        }
        if (after) searchBody.after = after

        response = await hubspot.request<any>(`/crm/v3/objects/${object_type}/search`, {
          method: 'POST',
          body: JSON.stringify(searchBody),
        })
      }

      const results = response?.results ?? []
      if (results.length === 0) break

      // Insert rows
      const rowInserts = results.map((r: any) => ({
        table_id: table.id,
        source_id: r.id,
        source_data: r,
      }))

      const { data: insertedRows, error: rowError } = await supabase
        .from('dynamic_table_rows')
        .insert(rowInserts)
        .select('id, source_id')

      if (rowError) throw rowError

      // Insert cells
      const cellInserts: any[] = []
      for (const row of insertedRows ?? []) {
        const hubspotRecord = results.find((r: any) => r.id === row.source_id)
        if (!hubspotRecord) continue

        for (const mapping of field_mappings) {
          const colKey = mapping.hubspotProperty.replace(/[^a-z0-9]/gi, '_').toLowerCase()
          const colId = keyToColumnId.get(colKey)
          if (!colId) continue

          const value = hubspotRecord.properties?.[mapping.hubspotProperty] ?? null
          if (value !== null) {
            cellInserts.push({ row_id: row.id, column_id: colId, value: String(value) })
          }
        }
      }

      if (cellInserts.length > 0) {
        const { error: cellError } = await supabase
          .from('dynamic_table_cells')
          .insert(cellInserts)

        if (cellError) console.error('[import-from-hubspot] Cell insert error:', cellError)
      }

      totalImported += results.length

      // Pagination
      after = response?.paging?.next?.after
      if (!after) break
    }

    // 5. Update row count
    await supabase
      .from('dynamic_tables')
      .update({ row_count: totalImported })
      .eq('id', table.id)

    return new Response(
      JSON.stringify({
        table_id: table.id,
        rows_imported: totalImported,
        columns_created: field_mappings.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[import-from-hubspot] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

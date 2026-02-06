// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { HubSpotClient } from '../_shared/hubspot.ts'

/**
 * import-from-hubspot — Import HubSpot contacts into a new Ops table.
 *
 * Simplified flow: imports email as the key identifier. Users add more
 * HubSpot property columns later in the table itself.
 *
 * POST body: {
 *   org_id: string,
 *   user_id: string,
 *   table_name: string,
 *   list_id?: string,               // Import from specific list
 *   filters?: { propertyName: string, operator: string, value: string }[],
 *   limit?: number,                 // Max records (default 1000)
 *   import_all_columns?: boolean,   // If true, create columns for common properties
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
    const { org_id, user_id, table_name, list_id, filters, filter_logic, limit, import_all_columns } = body

    if (!org_id || !user_id || !table_name) {
      return new Response(
        JSON.stringify({ error: 'org_id, user_id, and table_name required' }),
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

    // 2. Create table with source_type = 'hubspot'
    const { data: table, error: tableError } = await supabase
      .from('dynamic_tables')
      .insert({
        organization_id: org_id,
        created_by: user_id,
        name: table_name,
        source_type: 'hubspot',
        source_query: {
          list_id,
          filters,
          imported_at: new Date().toISOString(),
        },
      })
      .select('id')
      .single()

    if (tableError) throw tableError

    // 3. Create columns - email is always created, others depend on import_all_columns
    const columnsToCreate = [
      { key: 'email', label: 'Email', column_type: 'email', hubspot_property_name: 'email' },
    ]

    if (import_all_columns) {
      columnsToCreate.push(
        { key: 'firstname', label: 'First Name', column_type: 'text', hubspot_property_name: 'firstname' },
        { key: 'lastname', label: 'Last Name', column_type: 'text', hubspot_property_name: 'lastname' },
        { key: 'company', label: 'Company', column_type: 'text', hubspot_property_name: 'company' },
        { key: 'jobtitle', label: 'Job Title', column_type: 'text', hubspot_property_name: 'jobtitle' },
        { key: 'phone', label: 'Phone', column_type: 'phone', hubspot_property_name: 'phone' },
        { key: 'lifecyclestage', label: 'Lifecycle Stage', column_type: 'text', hubspot_property_name: 'lifecyclestage' },
        { key: 'hs_lead_status', label: 'Lead Status', column_type: 'text', hubspot_property_name: 'hs_lead_status' },
      )
    }

    const columnInserts = columnsToCreate.map((col, idx) => ({
      table_id: table.id,
      key: col.key,
      label: col.label,
      column_type: col.column_type,
      hubspot_property_name: col.hubspot_property_name,
      position: idx,
    }))

    const { data: createdColumns, error: colError } = await supabase
      .from('dynamic_table_columns')
      .insert(columnInserts)
      .select('id, key, hubspot_property_name')

    if (colError) throw colError

    // Build a map of hubspot property name -> column id for cell insertion
    const columnMap = new Map<string, string>()
    for (const col of createdColumns ?? []) {
      if (col.hubspot_property_name) {
        columnMap.set(col.hubspot_property_name, col.id)
      }
    }

    // 4. Fetch HubSpot records with pagination
    const maxRecords = limit ?? DEFAULT_LIMIT
    // We fetch common properties to store in source_data for later column population
    const propertyNames = [
      'email',
      'firstname',
      'lastname',
      'company',
      'jobtitle',
      'phone',
      'lifecyclestage',
      'hs_lead_status',
      'city',
      'state',
      'country',
    ]

    let after: string | undefined
    let totalImported = 0

    while (totalImported < maxRecords) {
      let results: any[] = []

      if (list_id) {
        // For list-based imports, we need two API calls:
        // 1. Get member IDs from the list
        // 2. Batch-read contacts with their properties
        const pageLimit = Math.min(PAGE_SIZE, maxRecords - totalImported)
        const membershipResponse = await hubspot.request<any>({
          method: 'GET',
          path: `/crm/v3/lists/${list_id}/memberships`,
          query: {
            limit: pageLimit,
            ...(after ? { after } : {}),
          },
        })

        const memberIds = membershipResponse?.results?.map((m: any) => m.recordId) ?? []
        if (memberIds.length === 0) break

        // Batch-read contacts with properties
        const batchResponse = await hubspot.request<any>({
          method: 'POST',
          path: '/crm/v3/objects/contacts/batch/read',
          body: {
            propertiesWithHistory: [],
            inputs: memberIds.map((id: string) => ({ id })),
            properties: propertyNames,
          },
        })

        results = batchResponse?.results ?? []
        after = membershipResponse?.paging?.next?.after
      } else {
        // Use search API
        const searchBody: any = {
          filterGroups: filters?.length
            ? filter_logic === 'OR'
              ? filters.map((f: any) => ({ filters: [{ propertyName: f.propertyName, operator: f.operator, value: f.value }] }))
              : [{ filters: filters.map((f: any) => ({ propertyName: f.propertyName, operator: f.operator, value: f.value })) }]
            : [],
          properties: propertyNames,
          limit: Math.min(PAGE_SIZE, maxRecords - totalImported),
        }
        if (after) searchBody.after = after

        const response = await hubspot.request<any>({
          method: 'POST',
          path: '/crm/v3/objects/contacts/search',
          body: searchBody,
        })

        results = response?.results ?? []
        after = response?.paging?.next?.after
      }

      if (results.length === 0) break

      // Insert rows with full source_data for later property column population
      const rowInserts = results.map((r: any) => ({
        table_id: table.id,
        source_id: r.id, // HubSpot contact ID
        source_data: r,  // Full HubSpot object including properties
      }))

      const { data: insertedRows, error: rowError } = await supabase
        .from('dynamic_table_rows')
        .insert(rowInserts)
        .select('id, source_id')

      if (rowError) throw rowError

      // Insert cells for all created columns
      const cellInserts: any[] = []
      for (const row of insertedRows ?? []) {
        const hubspotRecord = results.find((r: any) => r.id === row.source_id)
        if (!hubspotRecord) continue

        // Insert cells for each column that has a corresponding HubSpot property
        for (const [propertyName, columnId] of columnMap.entries()) {
          const value = hubspotRecord.properties?.[propertyName]
          if (value != null && value !== '') {
            cellInserts.push({
              row_id: row.id,
              column_id: columnId,
              value: String(value),
              status: 'complete',
            })
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

      // Pagination - after is already set in conditionals above
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
        columns_created: createdColumns?.length ?? 1,
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

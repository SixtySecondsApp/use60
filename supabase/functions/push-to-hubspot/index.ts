// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { HubSpotClient } from '../_shared/hubspot.ts'

/**
 * push-to-hubspot — Push dynamic table rows to HubSpot as contacts.
 *
 * POST body: {
 *   table_id: string,
 *   column_id?: string,        // action column to track status
 *   row_ids: string[],
 *   config: {
 *     fieldMappings: { opsColumnKey: string, hubspotProperty: string }[],
 *     duplicateStrategy: 'update' | 'skip' | 'create',
 *     listId?: string,
 *     createNewList?: boolean,
 *     newListName?: string,
 *   }
 * }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HUBSPOT_BATCH_SIZE = 100

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { table_id, column_id, row_ids, config } = await req.json()

    if (!table_id || !row_ids?.length || !config?.fieldMappings?.length) {
      return new Response(
        JSON.stringify({ error: 'table_id, row_ids, and config.fieldMappings required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Get org and HubSpot credentials
    const { data: tableData } = await supabase
      .from('dynamic_tables')
      .select('organization_id')
      .eq('id', table_id)
      .single()

    const orgId = tableData?.organization_id
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Table not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: creds } = await supabase
      .from('hubspot_org_credentials')
      .select('access_token')
      .eq('org_id', orgId)
      .maybeSingle()

    if (!creds?.access_token) {
      return new Response(
        JSON.stringify({ error: 'HubSpot not connected. Connect in Settings > Integrations.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const hubspot = new HubSpotClient({ accessToken: creds.access_token })

    // 2. Get columns and rows
    const { data: allColumns } = await supabase
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', table_id)

    const columnIdToKey = new Map<string, string>()
    for (const col of allColumns ?? []) {
      columnIdToKey.set(col.id, col.key)
    }

    const { data: rows } = await supabase
      .from('dynamic_table_rows')
      .select('id, dynamic_table_cells(column_id, value)')
      .in('id', row_ids)
      .order('row_index', { ascending: true })

    // 3. Build HubSpot contact records
    const fieldMappings = config.fieldMappings as { opsColumnKey: string; hubspotProperty: string }[]
    const duplicateStrategy = config.duplicateStrategy ?? 'update'

    const contacts: { rowId: string; properties: Record<string, string> }[] = []

    for (const row of rows ?? []) {
      const cellValues = new Map<string, string>()
      for (const cell of row.dynamic_table_cells ?? []) {
        const key = columnIdToKey.get(cell.column_id)
        if (key) cellValues.set(key, cell.value ?? '')
      }

      const properties: Record<string, string> = {}
      for (const mapping of fieldMappings) {
        const val = cellValues.get(mapping.opsColumnKey) ?? ''
        if (val) properties[mapping.hubspotProperty] = val
      }

      contacts.push({ rowId: row.id, properties })
    }

    // 4. Batch upsert to HubSpot
    const results = {
      pushed: 0, updated: 0, skipped: 0, failed: 0,
      errors: [] as string[],
      list_id: null as string | null,
      list_contacts_added: 0,
    }
    const allHubSpotContactIds: string[] = []

    // Process in batches of 100
    for (let i = 0; i < contacts.length; i += HUBSPOT_BATCH_SIZE) {
      const batch = contacts.slice(i, i + HUBSPOT_BATCH_SIZE)

      const inputs = batch.map((c) => ({
        properties: c.properties,
        id: c.properties.email ?? undefined,
      }))

      try {
        if (duplicateStrategy === 'update') {
          const response = await hubspot.request<any>({
            method: 'POST',
            path: '/crm/v3/objects/contacts/batch/upsert',
            body: {
              inputs: inputs.map((inp) => ({
                properties: inp.properties,
                id: inp.properties.email,
                idProperty: 'email',
              })),
            },
          })

          for (let j = 0; j < batch.length; j++) {
            const result = response?.results?.[j]
            if (result?.id) allHubSpotContactIds.push(result.id)
            const status = result?.new ? 'Pushed' : 'Updated'
            results.pushed++

            if (column_id) {
              await supabase
                .from('dynamic_table_cells')
                .upsert(
                  { row_id: batch[j].rowId, column_id, value: status, status: 'complete', source: 'hubspot', confidence: 1.0 },
                  { onConflict: 'row_id,column_id' },
                )
            }
          }
        } else if (duplicateStrategy === 'create') {
          const response = await hubspot.request<any>({
            method: 'POST',
            path: '/crm/v3/objects/contacts/batch/create',
            body: { inputs: inputs.map((inp) => ({ properties: inp.properties })) },
          })

          for (const r of response?.results ?? []) {
            if (r?.id) allHubSpotContactIds.push(r.id)
          }
          results.pushed += batch.length

          for (let j = 0; j < batch.length; j++) {
            if (column_id) {
              await supabase
                .from('dynamic_table_cells')
                .upsert(
                  { row_id: batch[j].rowId, column_id, value: 'Pushed', status: 'complete', source: 'hubspot', confidence: 1.0 },
                  { onConflict: 'row_id,column_id' },
                )
            }
          }
        } else {
          // Skip — batch create, handle 409 conflicts
          try {
            const response = await hubspot.request<any>({
              method: 'POST',
              path: '/crm/v3/objects/contacts/batch/create',
              body: { inputs: inputs.map((inp) => ({ properties: inp.properties })) },
            })
            for (const r of response?.results ?? []) {
              if (r?.id) allHubSpotContactIds.push(r.id)
            }
            results.pushed += batch.length
          } catch (e: any) {
            results.skipped += batch.length
          }

          for (let j = 0; j < batch.length; j++) {
            if (column_id) {
              await supabase
                .from('dynamic_table_cells')
                .upsert(
                  { row_id: batch[j].rowId, column_id, value: 'Processed', status: 'complete', source: 'hubspot', confidence: 1.0 },
                  { onConflict: 'row_id,column_id' },
                )
            }
          }
        }
      } catch (error: any) {
        results.failed += batch.length
        results.errors.push(error.message ?? String(error))

        for (const contact of batch) {
          if (column_id) {
            await supabase
              .from('dynamic_table_cells')
              .upsert(
                { row_id: contact.rowId, column_id, value: 'Failed', status: 'failed', source: 'hubspot', error_message: error.message },
                { onConflict: 'row_id,column_id' },
              )
          }
        }
      }
    }

    // 5. Create new HubSpot list if requested
    let listId = config.listId as string | undefined
    if (config.createNewList && config.newListName) {
      try {
        console.log(`[push-to-hubspot] Creating new HubSpot list: "${config.newListName}"`)
        const listResponse = await hubspot.request<any>({
          method: 'POST',
          path: '/crm/v3/lists',
          body: {
            name: config.newListName,
            objectTypeId: '0-1', // contacts
            processingType: 'MANUAL',
          },
        })
        listId = listResponse?.listId ?? listResponse?.list?.listId
        if (listId) {
          console.log(`[push-to-hubspot] Created list ${listId}: "${config.newListName}"`)
          results.list_id = listId
        }
      } catch (listError: any) {
        console.error('[push-to-hubspot] List creation error:', listError?.message ?? listError)
        results.errors.push(`List creation failed: ${listError?.message ?? String(listError)}`)
      }
    }

    // 6. Add contacts to HubSpot list if specified
    if (listId && allHubSpotContactIds.length > 0) {
      try {
        console.log(`[push-to-hubspot] Adding ${allHubSpotContactIds.length} contacts to list ${listId}`)
        await hubspot.request<any>({
          method: 'PUT',
          path: `/crm/v3/lists/${listId}/memberships/add`,
          body: allHubSpotContactIds,
        })
        results.list_contacts_added = allHubSpotContactIds.length
        results.list_id = listId
        console.log(`[push-to-hubspot] Added ${allHubSpotContactIds.length} contacts to list ${listId}`)
      } catch (listError: any) {
        console.error('[push-to-hubspot] List assignment error:', listError?.message ?? listError)
        results.errors.push(`List assignment failed: ${listError?.message ?? String(listError)}`)
      }
    }

    return new Response(
      JSON.stringify(results),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[push-to-hubspot] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

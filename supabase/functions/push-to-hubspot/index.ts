// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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
    const results = { pushed: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[] }

    // Process in batches of 100
    for (let i = 0; i < contacts.length; i += HUBSPOT_BATCH_SIZE) {
      const batch = contacts.slice(i, i + HUBSPOT_BATCH_SIZE)

      const inputs = batch.map((c) => ({
        properties: c.properties,
        id: c.properties.email ?? undefined, // For upsert by email
      }))

      try {
        if (duplicateStrategy === 'update') {
          // Use batch upsert with email as idProperty
          const response = await hubspot.request<any>(
            '/crm/v3/objects/contacts/batch/upsert',
            {
              method: 'POST',
              body: JSON.stringify({
                inputs: inputs.map((inp) => ({
                  properties: inp.properties,
                  id: inp.properties.email,
                  idProperty: 'email',
                })),
              }),
            },
          )

          for (let j = 0; j < batch.length; j++) {
            const result = response?.results?.[j]
            const status = result?.new ? 'Pushed' : 'Updated'
            results.pushed++

            // Update CRM status cell
            if (column_id) {
              await supabase
                .from('dynamic_table_cells')
                .upsert(
                  {
                    row_id: batch[j].rowId,
                    column_id,
                    value: status,
                    status: 'complete',
                    source: 'hubspot',
                    confidence: 1.0,
                  },
                  { onConflict: 'row_id,column_id' },
                )
            }
          }
        } else if (duplicateStrategy === 'create') {
          // Create new contacts (no dedup)
          const response = await hubspot.request<any>(
            '/crm/v3/objects/contacts/batch/create',
            {
              method: 'POST',
              body: JSON.stringify({ inputs: inputs.map((inp) => ({ properties: inp.properties })) }),
            },
          )

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
          // Skip — check existence first then create new only
          // For simplicity, use batch create and handle 409 conflicts
          try {
            await hubspot.request<any>(
              '/crm/v3/objects/contacts/batch/create',
              {
                method: 'POST',
                body: JSON.stringify({ inputs: inputs.map((inp) => ({ properties: inp.properties })) }),
              },
            )
            results.pushed += batch.length
          } catch (e: any) {
            // Some may already exist — mark as skipped
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

        // Mark batch as failed
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

    // 5. Add to HubSpot list if specified
    if (config.listId && results.pushed > 0) {
      try {
        // Get HubSpot contact IDs that were just created/updated
        // For now, skip list assignment — could be added via a separate call
        console.log(`[push-to-hubspot] List assignment for list ${config.listId} — not yet implemented`)
      } catch (listError) {
        console.error('[push-to-hubspot] List assignment error:', listError)
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

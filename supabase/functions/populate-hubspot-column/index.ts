// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * populate-hubspot-column — Populate cells for a HubSpot property column
 *
 * Reads the property value from each row's source_data (which stores the full
 * HubSpot contact object) and creates/updates the cell values.
 *
 * POST body: {
 *   table_id: string,
 *   column_id: string,
 *   property_name: string,  // HubSpot property internal name (e.g. 'firstname')
 * }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 100

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json()
    const { table_id, column_id, property_name } = body

    if (!table_id || !column_id || !property_name) {
      return new Response(
        JSON.stringify({ error: 'table_id, column_id, and property_name required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Verify the table is a HubSpot table
    const { data: table } = await supabase
      .from('dynamic_tables')
      .select('id, source_type')
      .eq('id', table_id)
      .single()

    if (!table || table.source_type !== 'hubspot') {
      return new Response(
        JSON.stringify({ error: 'Table is not a HubSpot table' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Verify the column exists and is a hubspot_property column
    const { data: column } = await supabase
      .from('dynamic_table_columns')
      .select('id, column_type, hubspot_property_name')
      .eq('id', column_id)
      .single()

    if (!column) {
      return new Response(
        JSON.stringify({ error: 'Column not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Fetch all rows for this table (with pagination)
    let offset = 0
    let totalPopulated = 0
    let hasMore = true

    while (hasMore) {
      const { data: rows, error: rowsError } = await supabase
        .from('dynamic_table_rows')
        .select('id, source_data')
        .eq('table_id', table_id)
        .range(offset, offset + BATCH_SIZE - 1)

      if (rowsError) throw rowsError
      if (!rows || rows.length === 0) {
        hasMore = false
        break
      }

      // 4. Build cell inserts/upserts
      const cellUpserts: { row_id: string; column_id: string; value: string | null; status: string }[] = []

      for (const row of rows) {
        // Extract property value from source_data.properties
        const sourceData = row.source_data as { properties?: Record<string, unknown> } | null
        const propertyValue = sourceData?.properties?.[property_name]

        // Convert to string if not null/undefined
        let cellValue: string | null = null
        if (propertyValue !== null && propertyValue !== undefined) {
          cellValue = String(propertyValue)
        }

        cellUpserts.push({
          row_id: row.id,
          column_id: column_id,
          value: cellValue,
          status: 'complete',
        })
      }

      // 5. Upsert cells (use ON CONFLICT to update existing cells)
      if (cellUpserts.length > 0) {
        const { error: upsertError } = await supabase
          .from('dynamic_table_cells')
          .upsert(cellUpserts, {
            onConflict: 'row_id,column_id',
            ignoreDuplicates: false,
          })

        if (upsertError) {
          console.error('[populate-hubspot-column] Upsert error:', upsertError)
        } else {
          totalPopulated += cellUpserts.length
        }
      }

      // Pagination
      if (rows.length < BATCH_SIZE) {
        hasMore = false
      } else {
        offset += BATCH_SIZE
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        cells_populated: totalPopulated,
        property_name,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[populate-hubspot-column] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

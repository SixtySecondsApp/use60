// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * import-from-ops-table — Deep copy rows from one Ops table to a new one.
 *
 * POST body: {
 *   org_id: string,
 *   user_id: string,
 *   source_table_id: string,
 *   table_name: string,
 *   column_keys: string[],     // which columns to copy
 *   filters?: { column_key: string, operator: string, value: string }[],
 * }
 *
 * Returns: { table_id, rows_imported, columns_matched, columns_skipped }
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
    const { org_id, user_id, source_table_id, table_name, column_keys, filters } = body

    if (!org_id || !user_id || !source_table_id || !table_name || !column_keys?.length) {
      return new Response(
        JSON.stringify({ error: 'org_id, user_id, source_table_id, table_name, and column_keys required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Get source table columns
    const { data: sourceColumns, error: srcColErr } = await supabase
      .from('dynamic_table_columns')
      .select('id, key, label, column_type, is_enrichment, enrichment_prompt, dropdown_options, formula_expression, integration_type, integration_config, action_type, action_config, width')
      .eq('table_id', source_table_id)
      .order('position')

    if (srcColErr) throw srcColErr

    // Filter to only requested columns
    const selectedColumns = (sourceColumns ?? []).filter((c: any) => column_keys.includes(c.key))
    const skippedCount = column_keys.length - selectedColumns.length

    // 2. Create new table
    const { data: newTable, error: tableErr } = await supabase
      .from('dynamic_tables')
      .insert({
        organization_id: org_id,
        created_by: user_id,
        name: table_name,
        source_type: 'ops_table',
        source_query: {
          source_table_id,
          imported_at: new Date().toISOString(),
        },
      })
      .select('id')
      .single()

    if (tableErr) throw tableErr

    // 3. Create columns in new table
    const columnInserts = selectedColumns.map((c: any, idx: number) => ({
      table_id: newTable.id,
      key: c.key,
      label: c.label,
      column_type: c.column_type,
      is_enrichment: c.is_enrichment,
      enrichment_prompt: c.enrichment_prompt,
      dropdown_options: c.dropdown_options,
      formula_expression: c.formula_expression,
      integration_type: c.integration_type,
      integration_config: c.integration_config,
      action_type: c.action_type,
      action_config: c.action_config,
      width: c.width,
      position: idx,
    }))

    const { data: newColumns, error: colErr } = await supabase
      .from('dynamic_table_columns')
      .insert(columnInserts)
      .select('id, key')

    if (colErr) throw colErr

    // Map source column key → new column ID
    const keyToNewColId = new Map<string, string>()
    for (const col of newColumns ?? []) {
      keyToNewColId.set(col.key, col.id)
    }

    // Map source column ID → key (for cell lookup)
    const srcColIdToKey = new Map<string, string>()
    for (const col of selectedColumns) {
      srcColIdToKey.set(col.id, col.key)
    }

    // 4. Fetch source rows in batches
    let offset = 0
    let totalImported = 0

    while (true) {
      const { data: sourceRows, error: rowErr } = await supabase
        .from('dynamic_table_rows')
        .select('id, source_id, source_data')
        .eq('table_id', source_table_id)
        .order('row_index')
        .range(offset, offset + BATCH_SIZE - 1)

      if (rowErr) throw rowErr
      if (!sourceRows || sourceRows.length === 0) break

      // Insert rows
      const rowInserts = sourceRows.map((r: any) => ({
        table_id: newTable.id,
        source_id: r.source_id,
        source_data: {
          ...r.source_data,
          _source_ops_table_id: source_table_id,
          _source_row_id: r.id,
        },
      }))

      const { data: newRows, error: newRowErr } = await supabase
        .from('dynamic_table_rows')
        .insert(rowInserts)
        .select('id')

      if (newRowErr) throw newRowErr

      // Fetch cells for source rows
      const sourceRowIds = sourceRows.map((r: any) => r.id)
      const sourceColIds = selectedColumns.map((c: any) => c.id)

      const { data: sourceCells } = await supabase
        .from('dynamic_table_cells')
        .select('row_id, column_id, value, confidence, source')
        .in('row_id', sourceRowIds)
        .in('column_id', sourceColIds)

      // Map source row ID → new row ID (by position)
      const srcRowIdToNewRowId = new Map<string, string>()
      sourceRows.forEach((sr: any, idx: number) => {
        if (newRows?.[idx]) {
          srcRowIdToNewRowId.set(sr.id, newRows[idx].id)
        }
      })

      // Insert cells
      const cellInserts: any[] = []
      for (const cell of sourceCells ?? []) {
        const newRowId = srcRowIdToNewRowId.get(cell.row_id)
        const colKey = srcColIdToKey.get(cell.column_id)
        if (!newRowId || !colKey) continue
        const newColId = keyToNewColId.get(colKey)
        if (!newColId) continue

        cellInserts.push({
          row_id: newRowId,
          column_id: newColId,
          value: cell.value,
          confidence: cell.confidence,
          source: cell.source,
        })
      }

      if (cellInserts.length > 0) {
        // Insert cells in sub-batches to avoid payload limits
        for (let i = 0; i < cellInserts.length; i += 500) {
          const batch = cellInserts.slice(i, i + 500)
          const { error: cellErr } = await supabase
            .from('dynamic_table_cells')
            .insert(batch)
          if (cellErr) console.error('[import-from-ops-table] Cell insert error:', cellErr)
        }
      }

      totalImported += sourceRows.length
      offset += BATCH_SIZE
    }

    // 5. Update row count
    await supabase
      .from('dynamic_tables')
      .update({ row_count: totalImported })
      .eq('id', newTable.id)

    return new Response(
      JSON.stringify({
        table_id: newTable.id,
        rows_imported: totalImported,
        columns_matched: selectedColumns.length,
        columns_skipped: skippedCount,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[import-from-ops-table] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

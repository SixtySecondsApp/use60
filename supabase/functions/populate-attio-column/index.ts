import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'
import { extractAttioField } from '../_shared/attio.ts'

/**
 * Populate Attio Column
 *
 * When a user adds a new attio_property column to an existing Attio-sourced table,
 * this function reads cached source_data.attio from each row and extracts the
 * requested attribute value to populate the new column's cells.
 */
serve(async (req) => {
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

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader) {
    return errorResponse('Missing authorization header', req, 401)
  }

  // Validate user
  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await anonClient.auth.getUser()
  if (userError || !user) {
    return errorResponse('Unauthorized', req, 401)
  }

  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const body = await req.json()
    const { table_id, column_id } = body

    if (!table_id || !column_id) {
      return errorResponse('Missing table_id or column_id', req, 400)
    }

    // Get the column definition
    const { data: column, error: colError } = await svc
      .from('dynamic_table_columns')
      .select('id, column_type, attio_property_name, table_id')
      .eq('id', column_id)
      .eq('table_id', table_id)
      .maybeSingle()

    if (colError || !column) {
      return errorResponse('Column not found', req, 404)
    }

    if (column.column_type !== 'attio_property' || !column.attio_property_name) {
      return errorResponse('Column is not an attio_property type or missing attio_property_name', req, 400)
    }

    // Get all rows with their source_data
    const { data: rows, error: rowsError } = await svc
      .from('dynamic_table_rows')
      .select('id, source_data')
      .eq('table_id', table_id)
      .is('attio_removed_at', null)

    if (rowsError) {
      return errorResponse(`Failed to fetch rows: ${rowsError.message}`, req, 500)
    }

    if (!rows || rows.length === 0) {
      return jsonResponse({ success: true, populated: 0, pending: 0, failed: 0 }, req)
    }

    // Check for existing cells to avoid duplicates
    const { data: existingCells } = await svc
      .from('dynamic_table_cells')
      .select('row_id')
      .eq('column_id', column_id)

    const existingRowIds = new Set((existingCells || []).map((c: any) => c.row_id))

    // Build cells to insert
    const cellsToInsert: Array<{ row_id: string; column_id: string; value: string }> = []
    let pending = 0
    let failed = 0

    for (const row of rows) {
      // Skip rows that already have a cell for this column
      if (existingRowIds.has(row.id)) continue

      const attioData = row.source_data?.attio
      if (!attioData || !attioData.values) {
        pending++
        continue
      }

      try {
        const extracted = extractAttioField(attioData.values, column.attio_property_name)
        const cellValue = extracted !== null && extracted !== undefined ? String(extracted) : ''

        cellsToInsert.push({
          row_id: row.id,
          column_id: column_id,
          value: cellValue,
        })
      } catch {
        failed++
      }
    }

    // Batch insert cells in chunks of 100
    const CHUNK_SIZE = 100
    let populated = 0

    for (let i = 0; i < cellsToInsert.length; i += CHUNK_SIZE) {
      const chunk = cellsToInsert.slice(i, i + CHUNK_SIZE)
      const { error: insertError } = await svc
        .from('dynamic_table_cells')
        .upsert(chunk, { onConflict: 'row_id,column_id' })

      if (insertError) {
        console.error(`[populate-attio-column] Chunk insert error:`, insertError)
        failed += chunk.length
      } else {
        populated += chunk.length
      }
    }

    return jsonResponse({
      success: true,
      populated,
      pending,
      failed,
      total: rows.length,
    }, req)
  } catch (error) {
    console.error('[populate-attio-column] Error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      req,
      500
    )
  }
})

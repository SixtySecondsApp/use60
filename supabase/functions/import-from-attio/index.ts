// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'
import { AttioClient, fromAttioValues } from '../_shared/attio.ts'
import type { AttioRecord, AttioListEntry, AttioFilter } from '../_shared/attio.ts'

/**
 * import-from-attio — Import Attio records into a new Ops table.
 *
 * POST body: {
 *   org_id: string,
 *   import_mode: 'list' | 'filter',
 *   object: string,             // e.g. 'people', 'companies', 'deals'
 *   list_id?: string,           // Required when import_mode = 'list'
 *   filter?: AttioFilter,       // Optional filter for 'filter' mode
 *   selected_attributes: Array<{ slug: string, title: string }>,
 *   table_name: string,
 * }
 */

const PAGE_SIZE = 500

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse('Server misconfigured', req, 500)
  }

  // Validate user JWT
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader) return errorResponse('Unauthorized', req, 401)

  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await anonClient.auth.getUser()
  if (userError || !user) return errorResponse('Unauthorized', req, 401)

  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const body = await req.json()
    const {
      org_id,
      import_mode,
      object,
      list_id,
      filter,
      selected_attributes,
      table_name,
    } = body

    if (!org_id || !import_mode || !object || !table_name) {
      return errorResponse('Missing org_id, import_mode, object, or table_name', req)
    }

    if (!selected_attributes || !Array.isArray(selected_attributes) || selected_attributes.length === 0) {
      return errorResponse('selected_attributes is required and must be a non-empty array', req)
    }

    if (import_mode === 'list' && !list_id) {
      return errorResponse('list_id is required when import_mode is "list"', req)
    }

    // Verify org membership
    const { data: membership } = await svc
      .from('organization_memberships')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return errorResponse('Not a member of this organization', req, 403)
    }

    // Get Attio credentials
    const { data: creds } = await svc
      .from('attio_org_credentials')
      .select('access_token')
      .eq('org_id', org_id)
      .maybeSingle()

    if (!creds?.access_token) {
      return errorResponse('Attio not connected', req, 400)
    }

    const client = new AttioClient({ accessToken: creds.access_token })

    // ── Create the dynamic table ──────────────────────────────────────────
    let finalTableName = table_name
    let table: { id: string } | null = null

    for (let attempt = 0; attempt < 5; attempt++) {
      const tryName = attempt === 0 ? table_name : `${table_name} (${attempt + 1})`
      const { data, error: tableError } = await svc
        .from('dynamic_tables')
        .insert({
          organization_id: org_id,
          created_by: user.id,
          name: tryName,
          source_type: 'attio',
          source_query: {
            object,
            list_id: list_id ?? null,
            filter: filter ?? null,
            import_mode,
            imported_at: new Date().toISOString(),
          },
        })
        .select('id')
        .single()

      if (!tableError) {
        table = data
        finalTableName = tryName
        break
      }

      if (!tableError.message?.includes('unique_table_name_per_org')) {
        throw tableError
      }

      console.log(`[import-from-attio] Table name "${tryName}" already exists, trying next`)
    }

    if (!table) {
      throw new Error(`Table name "${table_name}" already exists. Please choose a different name.`)
    }

    // ── Create columns ────────────────────────────────────────────────────
    // Position 0 = row number column, attributes start at 1
    const columnInserts = [
      {
        table_id: table.id,
        key: '_row_number',
        label: '#',
        column_type: 'row_number',
        position: 0,
      },
      ...selected_attributes.map((attr: { slug: string; title: string }, idx: number) => ({
        table_id: table.id,
        key: attr.slug,
        label: attr.title,
        column_type: 'attio_property',
        attio_property_name: attr.slug,
        position: idx + 1,
      })),
    ]

    const { data: createdColumns, error: colError } = await svc
      .from('dynamic_table_columns')
      .insert(columnInserts)
      .select('id, key, attio_property_name')

    if (colError) throw colError

    // Map attio attribute slug -> column id
    const columnMap = new Map<string, string>()
    for (const col of createdColumns ?? []) {
      if (col.attio_property_name) {
        columnMap.set(col.attio_property_name, col.id)
      }
    }

    // ── Fetch records with pagination ─────────────────────────────────────
    let offset = 0
    let totalImported = 0

    while (true) {
      let records: Array<{ record_id: string; values: Record<string, any[]>; created_at?: string }> = []

      if (import_mode === 'list') {
        // Query list entries, then resolve parent records for full values
        const entryResponse = await client.queryListEntries(list_id!, {
          limit: PAGE_SIZE,
          offset,
        })

        const entries: AttioListEntry[] = entryResponse?.data ?? []
        if (entries.length === 0) break

        // Resolve parent records to get full attribute values
        // List entries have entry_values (list-specific) but we need parent record values
        const parentRecordIds = entries.map(e => e.parent_record_id).filter(Boolean)
        const parentObject = entries[0]?.parent_object ?? object

        // Batch-fetch parent records (Attio doesn't have a batch endpoint, so we query with IDs)
        // Use queryRecords with a filter for the record IDs
        const resolvedRecords: AttioRecord[] = []
        // Fetch in batches of 50 to avoid oversized filter arrays
        for (let i = 0; i < parentRecordIds.length; i += 50) {
          const batch = parentRecordIds.slice(i, i + 50)
          // Fetch each record individually — Attio v2 doesn't support batch-get by IDs
          const batchPromises = batch.map(id =>
            client.getRecord(parentObject, id).catch(err => {
              console.warn(`[import-from-attio] Failed to fetch record ${id}:`, err.message)
              return null
            })
          )
          const results = await Promise.all(batchPromises)
          for (const r of results) {
            if (r) resolvedRecords.push(r)
          }
        }

        records = resolvedRecords.map(r => ({
          record_id: r.id.record_id,
          values: r.values,
          created_at: r.created_at,
        }))

        // Update offset for next page
        if (entryResponse.next_offset != null) {
          offset = entryResponse.next_offset
        } else {
          // If fewer entries than page size, we've reached the end
          if (entries.length < PAGE_SIZE) {
            // Process these records then break
          }
          offset += entries.length
        }

        // Break after processing if no more pages
        if (entries.length < PAGE_SIZE && !entryResponse.next_offset) {
          // Will process below, then exit loop
        }
      } else {
        // Filter mode: query records directly
        const response = await client.queryRecords(object, {
          filter: filter ?? undefined,
          limit: PAGE_SIZE,
          offset,
        })

        const data: AttioRecord[] = response?.data ?? []
        if (data.length === 0) break

        records = data.map(r => ({
          record_id: r.id.record_id,
          values: r.values,
          created_at: r.created_at,
        }))

        if (response.next_offset != null) {
          offset = response.next_offset
        } else {
          offset += data.length
        }
      }

      if (records.length === 0) break

      // ── Insert rows ───────────────────────────────────────────────────
      const rowInserts = records.map(r => ({
        table_id: table!.id,
        source_id: r.record_id,
        source_data: {
          attio: {
            id: r.record_id,
            values: r.values,
            created_at: r.created_at ?? null,
          },
        },
      }))

      const { data: insertedRows, error: rowError } = await svc
        .from('dynamic_table_rows')
        .insert(rowInserts)
        .select('id, source_id')

      if (rowError) throw rowError

      // ── Insert cells ──────────────────────────────────────────────────
      const cellInserts: Array<{
        row_id: string
        column_id: string
        value: string
        status: string
      }> = []

      for (const row of insertedRows ?? []) {
        const record = records.find(r => r.record_id === row.source_id)
        if (!record) continue

        const flatValues = fromAttioValues(record.values)

        for (const [attrSlug, columnId] of columnMap.entries()) {
          const value = flatValues[attrSlug]
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

      // Batch upsert cells in chunks of 500
      for (let i = 0; i < cellInserts.length; i += 500) {
        const chunk = cellInserts.slice(i, i + 500)
        const { error: cellError } = await svc
          .from('dynamic_table_cells')
          .upsert(chunk, { onConflict: 'row_id,column_id' })

        if (cellError) {
          console.error('[import-from-attio] Cell upsert error:', cellError)
        }
      }

      totalImported += records.length

      // If this was the last page in list mode
      if (import_mode === 'list' && records.length < PAGE_SIZE) break
      // In filter mode, break if no next_offset was given and page was smaller than limit
      if (import_mode === 'filter' && records.length < PAGE_SIZE) break
    }

    // ── Update row count ────────────────────────────────────────────────
    await svc
      .from('dynamic_tables')
      .update({ row_count: totalImported })
      .eq('id', table.id)

    // ── Log to integration_sync_logs ────────────────────────────────────
    try {
      await svc.rpc('log_integration_sync', {
        p_org_id: org_id,
        p_user_id: user.id,
        p_integration_name: 'attio',
        p_operation: 'pull',
        p_direction: 'inbound',
        p_entity_type: object,
        p_entity_id: table.id,
        p_entity_name: finalTableName,
        p_status: 'success',
        p_error_message: null,
        p_metadata: {
          import_mode,
          list_id: list_id ?? null,
          rows_imported: totalImported,
          columns_created: createdColumns?.length ?? 0,
        },
        p_batch_id: null,
      })
    } catch (logErr) {
      console.error('[import-from-attio] Failed to log sync operation:', logErr)
    }

    return jsonResponse({
      table_id: table.id,
      table_name: finalTableName,
      rows_imported: totalImported,
      columns_created: createdColumns?.length ?? 0,
    }, req)
  } catch (error: any) {
    console.error('[import-from-attio] Error:', error)
    return errorResponse(error.message ?? 'Internal error', req, 500)
  }
})

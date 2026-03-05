// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

/**
 * setup-pipeline-template — Create an ops table from any pipeline template config.
 *
 * POST body: {
 *   org_id: string,
 *   template_key: string,
 *   template_config: PipelineTemplate  // full config from frontend
 * }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Auth
    const userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (!userToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
    }

    const body = await req.json()
    const { org_id, template_key, template_config } = body
    if (!org_id || !template_config) {
      return new Response(
        JSON.stringify({ error: 'org_id and template_config required' }),
        { status: 400, headers: JSON_HEADERS },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    console.log(`[setup-pipeline-template] Starting template="${template_key}" org=${org_id} user=${user.id}`)

    // ── 1. Fetch source data ────────────────────────────────────

    const dataSource = template_config.dataSource
    let sourceRows: Record<string, string>[] = []

    if (dataSource.type === 'meetings') {
      const { data: meetings, error: meetErr } = await supabase
        .from('meetings')
        .select('id, title, meeting_start, owner_user_id, transcript_text, contact_id')
        .eq('org_id', org_id)
        .not('transcript_text', 'is', null)
        .order('meeting_start', { ascending: false })
        .limit(dataSource.limit ?? 10)

      if (meetErr) throw meetErr

      // Resolve contacts
      const contactIds = (meetings ?? []).map(m => m.contact_id).filter(Boolean)
      let contactMap: Record<string, { first_name: string; last_name: string; company: string }> = {}
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, company')
          .in('id', contactIds)
        for (const c of contacts ?? []) {
          contactMap[c.id] = { first_name: c.first_name ?? '', last_name: c.last_name ?? '', company: c.company ?? '' }
        }
      }

      for (const meeting of meetings ?? []) {
        const contact = meeting.contact_id ? contactMap[meeting.contact_id] : null
        const row: Record<string, string> = {}
        const mapping = dataSource.column_mapping ?? {}

        for (const [templateCol, sourceCol] of Object.entries(mapping)) {
          if (sourceCol === 'contact_first_name') row[templateCol] = contact?.first_name ?? 'Unknown'
          else if (sourceCol === 'contact_last_name') row[templateCol] = contact?.last_name ?? ''
          else if (sourceCol === 'contact_company') row[templateCol] = contact?.company ?? meeting.title ?? ''
          else if (sourceCol === 'meeting_date') row[templateCol] = meeting.meeting_start ?? ''
          else if (sourceCol === 'transcript_text') row[templateCol] = (meeting.transcript_text ?? '').slice(0, 10000)
        }
        sourceRows.push(row)
      }

      console.log(`[setup-pipeline-template] Meetings found: ${sourceRows.length}`)
    }

    if (dataSource.type === 'contacts') {
      const { data: contacts, error: contactErr } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, company, title, industry, company_size')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(dataSource.limit ?? 10)

      if (contactErr) throw contactErr

      const mapping = dataSource.column_mapping ?? {}
      for (const contact of contacts ?? []) {
        const row: Record<string, string> = {}
        for (const [templateCol, sourceCol] of Object.entries(mapping)) {
          row[templateCol] = (contact as any)[sourceCol] ?? ''
        }
        sourceRows.push(row)
      }

      console.log(`[setup-pipeline-template] Contacts found: ${sourceRows.length}`)
    }

    if (dataSource.type === 'deals') {
      const { data: deals, error: dealErr } = await supabase
        .from('deals')
        .select('id, name, stage, amount, close_date, company_name, contact_name')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(dataSource.limit ?? 10)

      if (dealErr) throw dealErr

      const mapping = dataSource.column_mapping ?? {}
      for (const deal of deals ?? []) {
        const row: Record<string, string> = {}
        for (const [templateCol, sourceCol] of Object.entries(mapping)) {
          row[templateCol] = String((deal as any)[sourceCol] ?? '')
        }
        sourceRows.push(row)
      }

      console.log(`[setup-pipeline-template] Deals found: ${sourceRows.length}`)
    }

    // Fallback to synthetic data if no real data found
    if (sourceRows.length === 0 && dataSource.synthetic_rows && dataSource.synthetic_rows.length > 0) {
      sourceRows = dataSource.synthetic_rows
      console.log(`[setup-pipeline-template] Using ${sourceRows.length} synthetic rows (no real data)`)
    }

    // ── 2. Create table ─────────────────────────────────────────

    const baseName = template_config.name
    const { data: existingTables } = await supabase
      .from('dynamic_tables')
      .select('name')
      .eq('organization_id', org_id)
      .like('name', `${baseName}%`)

    let tableName = baseName
    if (existingTables && existingTables.length > 0) {
      const taken = new Set(existingTables.map((t: any) => t.name))
      let n = 2
      while (taken.has(tableName)) {
        tableName = `${baseName} ${n}`
        n++
      }
    }

    const { data: table, error: tableError } = await supabase
      .from('dynamic_tables')
      .insert({
        organization_id: org_id,
        created_by: user.id,
        name: tableName,
        description: template_config.description ?? '',
        source_type: 'manual',
        row_count: sourceRows.length,
      })
      .select('id')
      .single()

    if (tableError) throw tableError
    const tableId = table.id
    console.log(`[setup-pipeline-template] Created table: ${tableId} "${tableName}"`)

    // ── 3. Create columns ───────────────────────────────────────

    const columns = template_config.columns ?? []
    const columnInserts = columns.map((col: any) => ({
      table_id: tableId,
      key: col.key,
      label: col.label,
      column_type: col.column_type,
      position: col.position,
      width: col.width ?? 150,
      is_visible: true,
      is_enrichment: false,
      ...(col.formula_expression ? { formula_expression: col.formula_expression } : {}),
      ...(col.action_config ? { action_config: col.action_config } : {}),
    }))

    const { data: createdColumns, error: colError } = await supabase
      .from('dynamic_table_columns')
      .insert(columnInserts)
      .select('id, key')

    if (colError) {
      console.error('[setup-pipeline-template] Column insert error:', JSON.stringify(colError))
      throw colError
    }

    const colKeyToId: Record<string, string> = {}
    for (const c of createdColumns ?? []) {
      colKeyToId[c.key] = c.id
    }

    // ── 4. Create rows + cells ──────────────────────────────────

    const sourceColumnKeys = columns.filter((c: any) => c.is_source).map((c: any) => c.key)

    for (const rowData of sourceRows) {
      const { data: row, error: rowError } = await supabase
        .from('dynamic_table_rows')
        .insert({ table_id: tableId, row_index: 0 })
        .select('id')
        .single()

      if (rowError) throw rowError

      const cells = sourceColumnKeys
        .filter((key: string) => colKeyToId[key] && rowData[key])
        .map((key: string) => ({
          row_id: row.id,
          column_id: colKeyToId[key],
          value: rowData[key],
          source: 'import',
          status: 'complete',
          confidence: 1.0,
        }))

      if (cells.length > 0) {
        const { error: cellError } = await supabase
          .from('dynamic_table_cells')
          .insert(cells)
        if (cellError) throw cellError
      }
    }

    console.log(`[setup-pipeline-template] Done. Rows: ${sourceRows.length}, Columns: ${createdColumns?.length ?? 0}`)

    return new Response(
      JSON.stringify({
        table_id: tableId,
        table_name: tableName,
        rows_created: sourceRows.length,
        columns_created: createdColumns?.length ?? 0,
        used_synthetic: sourceRows === dataSource.synthetic_rows,
      }),
      { status: 200, headers: JSON_HEADERS },
    )
  } catch (error: any) {
    const msg = error?.message ?? String(error)
    const detail = error?.details ?? error?.hint ?? ''
    const code = error?.code ?? ''
    console.error('[setup-pipeline-template] Error:', msg, detail, code, JSON.stringify(error))
    return new Response(
      JSON.stringify({ error: msg, detail, code }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})

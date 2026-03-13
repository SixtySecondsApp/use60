// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { InstantlyClient } from '../_shared/instantly.ts'

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
    const { org_id, template_key, template_config, filters, use_synthetic } = body
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

    // If use_synthetic is explicitly requested, skip fetching real data
    if (use_synthetic) {
      sourceRows = dataSource.synthetic_rows ?? []
      console.log(`[setup-pipeline-template] Using ${sourceRows.length} synthetic rows (user requested)`)
    }

    if (sourceRows.length === 0 && dataSource.type === 'meetings') {
      let meetQuery = supabase
        .from('meetings')
        .select('id, title, meeting_start, owner_user_id, transcript_text, contact_id, primary_contact_id, summary, sentiment_score')
        .eq('org_id', org_id)
        .not('transcript_text', 'is', null)
        .order('meeting_start', { ascending: false })
        .limit(dataSource.limit ?? 10)

      // Apply optional filters
      if (filters?.date_from) meetQuery = meetQuery.gte('meeting_start', filters.date_from)
      if (filters?.sentiment === 'positive') meetQuery = meetQuery.gte('sentiment_score', 0.6)
      else if (filters?.sentiment === 'negative') meetQuery = meetQuery.lte('sentiment_score', -0.3)
      else if (filters?.sentiment === 'neutral') meetQuery = meetQuery.gt('sentiment_score', -0.3).lt('sentiment_score', 0.6)

      const { data: meetings, error: meetErr } = await meetQuery

      if (meetErr) throw meetErr

      // Resolve contacts — use contact_id or primary_contact_id
      const contactIds = (meetings ?? []).map(m => m.contact_id ?? m.primary_contact_id).filter(Boolean)
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
        const resolvedContactId = meeting.contact_id ?? meeting.primary_contact_id
        const contact = resolvedContactId ? contactMap[resolvedContactId] : null
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

    if (sourceRows.length === 0 && dataSource.type === 'contacts') {
      let contactQuery = supabase
        .from('contacts')
        .select('id, first_name, last_name, company, title, email, engagement_level')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(dataSource.limit ?? 10)

      if (filters?.search) {
        contactQuery = contactQuery.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,company.ilike.%${filters.search}%`)
      }

      const { data: contacts, error: contactErr } = await contactQuery

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

    if (sourceRows.length === 0 && dataSource.type === 'deals') {
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

    // Fallback to synthetic data if no real data found (and not already loaded via use_synthetic)
    if (sourceRows.length === 0 && !use_synthetic && dataSource.synthetic_rows && dataSource.synthetic_rows.length > 0) {
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
      ...(col.integration_config ? { integration_config: col.integration_config } : {}),
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

    // ── 5. Create default view with formatting rules (if template has them) ──
    if (template_config.formatting_rules && template_config.formatting_rules.length > 0) {
      const { error: viewError } = await supabase
        .from('ops_table_views')
        .insert({
          table_id: tableId,
          created_by: user.id,
          name: 'Default',
          is_default: true,
          is_system: false,
          filter_config: [],
          sort_config: null,
          column_config: null,
          formatting_rules: template_config.formatting_rules,
          group_config: null,
          summary_config: null,
          position: 0,
        })
      if (viewError) {
        console.warn('[setup-pipeline-template] View creation failed (non-fatal):', viewError.message)
      } else {
        console.log(`[setup-pipeline-template] Default view created with ${template_config.formatting_rules.length} formatting rules`)
      }
    }

    // ── 6. Instantly integration (optional) ──────────────────────
    const instantlyConfig = body.instantly_config
    let instantlyCampaignId: string | null = null

    if (instantlyConfig?.enabled) {
      try {
        const { data: creds } = await supabase
          .from('instantly_org_credentials')
          .select('api_key')
          .eq('org_id', org_id)
          .maybeSingle()

        if (creds?.api_key) {
          const instantly = new InstantlyClient({ apiKey: creds.api_key })
          instantlyCampaignId = instantlyConfig.campaign_id ?? null

          if (instantlyConfig.create_new) {
            const sequences = [{
              steps: (instantlyConfig.steps ?? []).map((s: any) => ({
                type: 'email',
                delay: s.delay ?? 0,
                wait: s.delay ?? 0,
                variants: [{
                  subject: `{{step_${s.step_number}_subject}}`,
                  body: `{{step_${s.step_number}_body}}`,
                }],
              })),
            }]

            const campaign = await instantly.request<{ id?: string }>({
              method: 'POST',
              path: '/api/v2/campaigns',
              body: {
                name: instantlyConfig.campaign_name || tableName,
                campaign_schedule: {
                  schedules: [{
                    name: 'Default',
                    timing: { from: '09:00', to: '17:00' },
                    days: { 1: true, 2: true, 3: true, 4: true, 5: true },
                    timezone: 'America/Chicago',
                  }],
                },
                sequences,
              },
            })
            instantlyCampaignId = campaign?.id ?? null
            console.log(`[setup-pipeline-template] Instantly campaign created: ${instantlyCampaignId}`)
          }

          if (instantlyCampaignId) {
            await supabase.from('instantly_campaign_links').insert({
              table_id: tableId,
              campaign_id: instantlyCampaignId,
              campaign_name: instantlyConfig.campaign_name || tableName,
              field_mapping: instantlyConfig.field_mapping ?? {},
              auto_sync_engagement: true,
            })
            console.log(`[setup-pipeline-template] Instantly campaign linked to table ${tableId}`)
          }
        } else {
          console.warn('[setup-pipeline-template] Instantly enabled but no API key found for org')
        }
      } catch (instantlyErr: any) {
        // Non-fatal — table is still created even if Instantly setup fails
        console.warn('[setup-pipeline-template] Instantly setup failed (non-fatal):', instantlyErr?.message ?? instantlyErr)
      }
    }

    // ── 7. HubSpot Sequences (optional) ─────────────────────────
    const hubspotConfig = body.hubspot_sequence_config
    let hubspotEnrolledCount = 0

    if (hubspotConfig?.enabled && hubspotConfig?.sequence_id) {
      try {
        const { data: hsCreds } = await supabase
          .from('hubspot_org_credentials')
          .select('access_token')
          .eq('org_id', org_id)
          .maybeSingle()

        if (hsCreds?.access_token) {
          const emailColKey = sourceColumnKeys.find((k: string) => k === 'email' || k === 'contact_email')
          if (emailColKey) {
            for (const rowData of sourceRows) {
              const email = rowData[emailColKey]
              if (!email) continue

              try {
                // Look up HubSpot contact by email
                const searchResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${hsCreds.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
                    limit: 1,
                  }),
                })
                const searchData = await searchResp.json()
                const contactId = searchData?.results?.[0]?.id
                if (!contactId) continue

                // Enroll in sequence
                const enrollResp = await fetch('https://api.hubapi.com/automation/v4/sequences/enrollments', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${hsCreds.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    sequenceId: hubspotConfig.sequence_id,
                    contactId,
                    senderEmail: hubspotConfig.sender_email,
                  }),
                })
                if (enrollResp.ok) hubspotEnrolledCount++
              } catch (rowErr: any) {
                console.warn(`[setup-pipeline-template] HubSpot enroll failed for ${email}:`, rowErr?.message)
              }
            }
            console.log(`[setup-pipeline-template] HubSpot: enrolled ${hubspotEnrolledCount} contacts in sequence`)
          }
        } else {
          console.warn('[setup-pipeline-template] HubSpot enabled but no credentials found for org')
        }
      } catch (hsErr: any) {
        // Non-fatal
        console.warn('[setup-pipeline-template] HubSpot enrollment failed (non-fatal):', hsErr?.message ?? hsErr)
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
        ...(instantlyCampaignId ? { instantly_campaign_id: instantlyCampaignId } : {}),
        ...(hubspotEnrolledCount > 0 ? { hubspot_enrolled_count: hubspotEnrolledCount } : {}),
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

// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

/**
 * setup-reengagement-demo — Create a demo re-engagement pipeline ops table
 * cloned from meetings data with AI prompt buttons and formula extractors.
 *
 * POST body: { org_id: string }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' }

const PROMPT_1_SYSTEM = `You are an expert sales analyst. Analyse the meeting transcript and output ONLY valid JSON with these fields:

{
  "qualified": true/false,
  "months_ago": number,
  "specific_pain": "string — the prospect's main pain point",
  "budget_signal": "string — any budget/pricing mentions",
  "interest_areas": "string — what they were most interested in",
  "company_context": "string — company situation/industry context",
  "suggested_tier": "starter|growth|enterprise",
  "personalisation_hook": "string — a specific detail to reference in outreach",
  "use60_angle": "string — how 60 specifically helps this prospect",
  "tone_notes": "string — recommended tone for follow-up (formal/casual/urgent)"
}

Mark qualified=true if they showed genuine interest AND have a real use case. Mark false for tyre-kickers, wrong fit, or no budget signal.`

const PROMPT_1_USER = `Meeting with {{first_name}} {{last_name}} from {{company}} on {{meeting_date}}.
Rep: {{rep_name}}

Transcript:
{{transcript_text}}`

const PROMPT_2_SYSTEM = `You are a copywriter generating email merge variables for a re-engagement campaign. Using the analysis provided, output ONLY valid JSON:

{
  "time_ref": "string — natural time reference e.g. 'back in January' or 'a few months ago'",
  "pain_ref": "string — reference to their specific pain without being too direct",
  "pain_short": "string — 5-word version of their pain",
  "hook_line": "string — opening line that references something specific from the meeting",
  "use60_intro": "string — one sentence explaining what 60 does for them specifically",
  "pain_reframe": "string — reframe their pain as an opportunity",
  "capability_match": "string — specific 60 capability that maps to their need"
}`

const PROMPT_2_USER = `Analysis for {{first_name}} {{last_name}} ({{company}}):
{{transcript_analysis}}`

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
    const { org_id } = body
    if (!org_id) {
      return new Response(JSON.stringify({ error: 'org_id required' }), { status: 400, headers: JSON_HEADERS })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 1. Fetch 5 meetings with transcripts
    const { data: meetings, error: meetError } = await supabase
      .from('meetings')
      .select('id, title, meeting_date, owner_user_id, transcript_text, contact_id')
      .eq('organization_id', org_id)
      .not('transcript_text', 'is', null)
      .order('meeting_date', { ascending: false })
      .limit(5)

    if (meetError) throw meetError

    // Get contact details
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

    // Get user names for rep_name
    const ownerIds = (meetings ?? []).map(m => m.owner_user_id).filter(Boolean)
    let userMap: Record<string, string> = {}
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', ownerIds)
      for (const p of profiles ?? []) {
        userMap[p.id] = p.full_name ?? 'Unknown'
      }
    }

    // 2. Create the ops table
    const { data: table, error: tableError } = await supabase
      .from('dynamic_tables')
      .insert({
        organization_id: org_id,
        created_by: user.id,
        name: 'Re-Engagement Pipeline (Demo)',
        description: 'AI-powered re-engagement pipeline: analyse transcripts → generate personalised email variables',
        source_type: 'manual',
        row_count: meetings?.length ?? 0,
      })
      .select('id')
      .single()

    if (tableError) throw tableError
    const tableId = table.id

    // 3. Create columns
    const columnDefs = [
      // Source data columns
      { key: 'first_name', label: 'First Name', column_type: 'text', position: 0 },
      { key: 'last_name', label: 'Last Name', column_type: 'text', position: 1 },
      { key: 'company', label: 'Company', column_type: 'text', position: 2 },
      { key: 'meeting_date', label: 'Meeting Date', column_type: 'date', position: 3 },
      { key: 'rep_name', label: 'Rep', column_type: 'text', position: 4 },
      { key: 'transcript_text', label: 'Transcript', column_type: 'text', position: 5 },

      // Step 1 button
      {
        key: 'analyse_btn', label: 'Analyse', column_type: 'button', position: 6,
        action_config: {
          label: 'Analyse Transcript',
          color: '#8b5cf6',
          actions: [{
            type: 'run_prompt',
            config: {
              system_prompt: PROMPT_1_SYSTEM,
              user_message_template: PROMPT_1_USER,
              model: 'claude-sonnet-4-5-20250929',
              provider: 'anthropic',
              temperature: 0.3,
              max_tokens: 2048,
              output_column_key: 'transcript_analysis',
            },
          }],
        },
      },

      // Step 1 output
      { key: 'transcript_analysis', label: 'Analysis (JSON)', column_type: 'text', position: 7 },

      // Step 1 formula extractors
      { key: 'qualified', label: 'Qualified', column_type: 'formula', position: 8, formula_expression: 'JSON_GET(@transcript_analysis, "qualified")' },
      { key: 'months_ago', label: 'Months Ago', column_type: 'formula', position: 9, formula_expression: 'JSON_GET(@transcript_analysis, "months_ago")' },
      { key: 'specific_pain', label: 'Pain Point', column_type: 'formula', position: 10, formula_expression: 'JSON_GET(@transcript_analysis, "specific_pain")' },
      { key: 'budget_signal', label: 'Budget Signal', column_type: 'formula', position: 11, formula_expression: 'JSON_GET(@transcript_analysis, "budget_signal")' },
      { key: 'interest_areas', label: 'Interest Areas', column_type: 'formula', position: 12, formula_expression: 'JSON_GET(@transcript_analysis, "interest_areas")' },
      { key: 'company_context', label: 'Company Context', column_type: 'formula', position: 13, formula_expression: 'JSON_GET(@transcript_analysis, "company_context")' },
      { key: 'suggested_tier', label: 'Suggested Tier', column_type: 'formula', position: 14, formula_expression: 'JSON_GET(@transcript_analysis, "suggested_tier")' },
      { key: 'personalisation_hook', label: 'Hook', column_type: 'formula', position: 15, formula_expression: 'JSON_GET(@transcript_analysis, "personalisation_hook")' },
      { key: 'use60_angle', label: '60 Angle', column_type: 'formula', position: 16, formula_expression: 'JSON_GET(@transcript_analysis, "use60_angle")' },
      { key: 'tone_notes', label: 'Tone', column_type: 'formula', position: 17, formula_expression: 'JSON_GET(@transcript_analysis, "tone_notes")' },

      // Step 2 button (conditional on qualified = true)
      {
        key: 'personalise_btn', label: 'Personalise', column_type: 'button', position: 18,
        action_config: {
          label: 'Write Personalisation',
          color: '#10b981',
          actions: [{
            type: 'run_prompt',
            config: {
              system_prompt: PROMPT_2_SYSTEM,
              user_message_template: PROMPT_2_USER,
              model: 'claude-sonnet-4-5-20250929',
              provider: 'anthropic',
              temperature: 0.5,
              max_tokens: 1024,
              output_column_key: 'email_variables',
            },
          }],
          condition: {
            column_key: 'qualified',
            operator: 'equals',
            value: 'true',
          },
        },
      },

      // Step 2 output
      { key: 'email_variables', label: 'Email Vars (JSON)', column_type: 'text', position: 19 },

      // Step 2 formula extractors
      { key: 'time_ref', label: 'Time Ref', column_type: 'formula', position: 20, formula_expression: 'JSON_GET(@email_variables, "time_ref")' },
      { key: 'pain_ref', label: 'Pain Ref', column_type: 'formula', position: 21, formula_expression: 'JSON_GET(@email_variables, "pain_ref")' },
      { key: 'pain_short', label: 'Pain Short', column_type: 'formula', position: 22, formula_expression: 'JSON_GET(@email_variables, "pain_short")' },
      { key: 'hook_line', label: 'Hook Line', column_type: 'formula', position: 23, formula_expression: 'JSON_GET(@email_variables, "hook_line")' },
      { key: 'use60_intro', label: '60 Intro', column_type: 'formula', position: 24, formula_expression: 'JSON_GET(@email_variables, "use60_intro")' },
      { key: 'pain_reframe', label: 'Pain Reframe', column_type: 'formula', position: 25, formula_expression: 'JSON_GET(@email_variables, "pain_reframe")' },
      { key: 'capability_match', label: 'Capability Match', column_type: 'formula', position: 26, formula_expression: 'JSON_GET(@email_variables, "capability_match")' },
    ]

    const columnInserts = columnDefs.map((col) => ({
      table_id: tableId,
      key: col.key,
      label: col.label,
      column_type: col.column_type,
      position: col.position,
      width: col.column_type === 'text' && col.key === 'transcript_text' ? 300 : 150,
      is_visible: true,
      is_enrichment: false,
      ...(col.formula_expression ? { formula_expression: col.formula_expression } : {}),
      ...(col.action_config ? { action_config: col.action_config } : {}),
    }))

    const { data: createdColumns, error: colInsertError } = await supabase
      .from('dynamic_table_columns')
      .insert(columnInserts)
      .select('id, key')

    if (colInsertError) throw colInsertError

    const colKeyToId: Record<string, string> = {}
    for (const c of createdColumns ?? []) {
      colKeyToId[c.key] = c.id
    }

    // 4. Create rows and cells from meetings
    for (const meeting of meetings ?? []) {
      const contact = meeting.contact_id ? contactMap[meeting.contact_id] : null
      const repName = meeting.owner_user_id ? userMap[meeting.owner_user_id] : 'Unknown'

      const { data: row, error: rowError } = await supabase
        .from('dynamic_table_rows')
        .insert({ table_id: tableId, row_index: 0 })
        .select('id')
        .single()

      if (rowError) throw rowError

      const cellData: Record<string, string> = {
        first_name: contact?.first_name ?? 'Unknown',
        last_name: contact?.last_name ?? '',
        company: contact?.company ?? meeting.title ?? '',
        meeting_date: meeting.meeting_date ?? '',
        rep_name: repName,
        transcript_text: (meeting.transcript_text ?? '').slice(0, 10000), // Cap at 10k chars
      }

      const cells = Object.entries(cellData)
        .filter(([key]) => colKeyToId[key])
        .map(([key, value]) => ({
          row_id: row.id,
          column_id: colKeyToId[key],
          value,
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

    return new Response(
      JSON.stringify({
        table_id: tableId,
        rows_created: meetings?.length ?? 0,
        columns_created: createdColumns?.length ?? 0,
      }),
      { status: 200, headers: JSON_HEADERS },
    )
  } catch (error: any) {
    console.error('[setup-reengagement-demo] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})

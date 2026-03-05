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

Mark qualified=true if they showed genuine interest AND have a real use case. Mark false for tyre-kickers, wrong fit, or no budget signal.

Today's date is {{today_date}}. Calculate months_ago and all time references accurately based on the meeting date and today's date.`

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
}

Today's date is {{today_date}}. Generate accurate time references — e.g. if the meeting was in December and it's now March, say "back in December", not "back in the spring".`

const PROMPT_2_USER = `Analysis for {{first_name}} {{last_name}} ({{company}}):
{{transcript_analysis}}`

const PROMPT_3_SYSTEM = `You are a sales rep writing a short, warm re-engagement email. Use the provided merge variables to compose the email. Keep it under 150 words. No subject line — just the body. Write in first person, casual-professional tone. Don't be salesy. Reference something specific from the original meeting. End with a soft CTA (e.g. "Would it make sense to grab 15 minutes?").

Output the email body as plain text — no JSON, no markdown, no formatting.

Today's date is {{today_date}}. Ensure any time references in the email are accurate relative to when the meeting actually occurred.`

const PROMPT_3_USER = `Write a re-engagement email to {{first_name}} at {{company}}.

Variables:
- Hook line: {{hook_line}}
- Pain reference: {{pain_ref}}
- Time reference: {{time_ref}}
- 60 intro: {{use60_intro}}
- Pain reframe: {{pain_reframe}}
- Capability match: {{capability_match}}`

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
    console.log('[setup-reengagement-demo] Starting for org:', org_id, 'user:', user.id)

    // 1. Fetch 5 meetings with transcripts
    const { data: meetings, error: meetError } = await supabase
      .from('meetings')
      .select('id, title, meeting_start, owner_user_id, transcript_text, contact_id')
      .eq('org_id', org_id)
      .not('transcript_text', 'is', null)
      .order('meeting_start', { ascending: false })
      .limit(5)

    if (meetError) throw meetError
    console.log('[setup-reengagement-demo] Meetings found:', meetings?.length ?? 0)

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

    // 2. Find a unique table name (append number if duplicates exist)
    const baseName = 'Re-Engagement Pipeline (Demo)'
    const { data: existingTables } = await supabase
      .from('dynamic_tables')
      .select('name')
      .eq('organization_id', org_id)
      .like('name', 'Re-Engagement Pipeline (Demo)%')

    let tableName = baseName
    if (existingTables && existingTables.length > 0) {
      const taken = new Set(existingTables.map(t => t.name))
      let n = 1
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
        description: 'AI-powered re-engagement pipeline: analyse transcripts → generate personalised email variables',
        source_type: 'manual',
        row_count: meetings?.length ?? 0,
      })
      .select('id')
      .single()
    if (tableError) throw tableError
    const tableId = table.id
    console.log('[setup-reengagement-demo] Created table:', tableId, tableName)
    console.log('[setup-reengagement-demo] Table created:', tableId)

    // 3. Create columns — keep it lean, use JSON_GET formulas to extract key fields
    const columnDefs = [
      // Source data
      { key: 'first_name', label: 'First Name', column_type: 'text', position: 0 },
      { key: 'last_name', label: 'Last Name', column_type: 'text', position: 1 },
      { key: 'company', label: 'Company', column_type: 'text', position: 2 },
      { key: 'meeting_date', label: 'Meeting Date', column_type: 'date', position: 3 },
      { key: 'transcript_text', label: 'Transcript', column_type: 'text', position: 4 },

      // Step 1: Analyse button
      {
        key: 'analyse_btn', label: 'Analyse', column_type: 'action', position: 5,
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

      // Step 1: Raw JSON output (hidden by default — formulas extract what matters)
      { key: 'transcript_analysis', label: 'Analysis (JSON)', column_type: 'text', position: 6 },

      // Step 1: Key extracted fields
      { key: 'qualified', label: 'Qualified', column_type: 'formula', position: 7, formula_expression: 'JSON_GET(@transcript_analysis, "qualified")' },
      { key: 'specific_pain', label: 'Pain Point', column_type: 'formula', position: 8, formula_expression: 'JSON_GET(@transcript_analysis, "specific_pain")' },
      { key: 'suggested_tier', label: 'Tier', column_type: 'formula', position: 9, formula_expression: 'JSON_GET(@transcript_analysis, "suggested_tier")' },

      // Step 2: Personalise button (only shows when qualified = true)
      {
        key: 'personalise_btn', label: 'Personalise', column_type: 'action', position: 10,
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

      // Step 2: Raw JSON output
      { key: 'email_variables', label: 'Email Vars (JSON)', column_type: 'text', position: 11 },

      // Step 2: Key extracted fields
      { key: 'hook_line', label: 'Hook Line', column_type: 'formula', position: 12, formula_expression: 'JSON_GET(@email_variables, "hook_line")' },
      { key: 'pain_ref', label: 'Pain Ref', column_type: 'formula', position: 13, formula_expression: 'JSON_GET(@email_variables, "pain_ref")' },
      { key: 'time_ref', label: 'Time Ref', column_type: 'formula', position: 14, formula_expression: 'JSON_GET(@email_variables, "time_ref")' },
      { key: 'use60_intro', label: '60 Intro', column_type: 'formula', position: 15, formula_expression: 'JSON_GET(@email_variables, "use60_intro")' },
      { key: 'pain_reframe', label: 'Pain Reframe', column_type: 'formula', position: 16, formula_expression: 'JSON_GET(@email_variables, "pain_reframe")' },
      { key: 'capability_match', label: 'Capability', column_type: 'formula', position: 17, formula_expression: 'JSON_GET(@email_variables, "capability_match")' },

      // Step 3: Write Email button (only shows when email_variables exist)
      {
        key: 'write_email_btn', label: 'Write Email', column_type: 'action', position: 18,
        action_config: {
          label: 'Write Email',
          color: '#f59e0b',
          actions: [{
            type: 'run_prompt',
            config: {
              system_prompt: PROMPT_3_SYSTEM,
              user_message_template: PROMPT_3_USER,
              model: 'claude-sonnet-4-5-20250929',
              provider: 'anthropic',
              temperature: 0.6,
              max_tokens: 1024,
              output_column_key: 'email_draft',
            },
          }],
          condition: {
            column_key: 'email_variables',
            operator: 'is_not_empty',
          },
        },
      },

      // Step 3: Email output
      { key: 'email_draft', label: 'Email Draft', column_type: 'text', position: 19 },
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

    if (colInsertError) { console.error('[setup-reengagement-demo] Column insert error:', JSON.stringify(colInsertError)); throw colInsertError }

    const colKeyToId: Record<string, string> = {}
    for (const c of createdColumns ?? []) {
      colKeyToId[c.key] = c.id
    }

    // 4. Create rows and cells from meetings
    for (const meeting of meetings ?? []) {
      const contact = meeting.contact_id ? contactMap[meeting.contact_id] : null

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
        meeting_date: meeting.meeting_start ?? '',
        transcript_text: (meeting.transcript_text ?? '').slice(0, 10000),
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
    const msg = error?.message ?? String(error)
    const detail = error?.details ?? error?.hint ?? ''
    const code = error?.code ?? ''
    console.error('[setup-reengagement-demo] Error:', msg, detail, code, JSON.stringify(error))
    return new Response(
      JSON.stringify({ error: msg, detail, code }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})

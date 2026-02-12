/**
 * Generate Email Sequence
 *
 * Two-tier email generation (cost-optimised):
 *   1. Claude Sonnet 4.5 writes REAL emails for the FIRST prospect only (runs ONCE)
 *   2. Gemini Flash uses that first row's emails as a style example to generate
 *      personalised emails for ALL remaining prospects (runs per lead)
 *
 * Fallback: if Anthropic call fails, falls back to direct Gemini generation for all.
 *
 * POST /generate-email-sequence
 * Body: {
 *   table_id: string,
 *   row_ids?: string[],           // If omitted, processes all rows
 *   sequence_config: {
 *     num_steps: number,           // 1-5 email steps
 *     angle?: string,              // Campaign angle/messaging direction
 *   },
 *   business_context_prompt?: string,  // Pre-built context string (from orchestrator)
 *   sign_off?: string,               // Explicit sign-off for emails
 * }
 *
 * Returns: { generated_count, failed_count, step_columns_created }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1'
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'
import { loadBusinessContext, buildContextPrompt } from '../_shared/businessContext.ts'
import { getUserOrgId } from '../_shared/edgeAuth.ts'
import { createConcurrencyLimiter } from '../_shared/rateLimiter.ts'
import {
  buildEmailSystemPrompt,
  buildSequenceTiming,
  FRAMEWORK_SELECTION_GUIDE,
} from '../_shared/emailPromptRules.ts'

// ============================================================================
// Types
// ============================================================================

interface SequenceConfig {
  num_steps: number
  angle?: string
  email_type?: 'cold_outreach' | 'event_invitation' | 'meeting_request' | 'follow_up'
  event_details?: { event_name?: string; date?: string; time?: string; venue?: string; description?: string }
}

interface RequestBody {
  table_id: string
  row_ids?: string[]
  sequence_config: SequenceConfig
  business_context_prompt?: string
  sign_off?: string
  model?: string
}

interface EmailStep {
  subject: string
  body: string
}

interface ProspectData {
  row_id: string
  name: string
  title: string
  company: string
  company_description?: string
  city?: string
  linkedin_url?: string
  // Rich Apollo enrichment data
  industry?: string
  revenue?: string
  employees?: string
  tech_stack?: string[]
  headline?: string
  seniority?: string
  departments?: string[]
  funding_stage?: string
  company_keywords?: string[]
}

// ============================================================================
// Constants
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GEMINI_API_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const LOG = '[generate-email-sequence]'
const CONCURRENCY = 5
const MAX_STEPS = 5

// ============================================================================
// Helper: build prospect context string for prompts
// ============================================================================

function buildProspectBlock(prospect: ProspectData): string {
  return `- Name: ${prospect.name}
- Title: ${prospect.title}
- Company: ${prospect.company}
${prospect.company_description ? `- Company Description: ${prospect.company_description}` : ''}
${prospect.city ? `- Location: ${prospect.city}` : ''}
${prospect.headline ? `- Headline: ${prospect.headline}` : ''}
${prospect.seniority ? `- Seniority: ${prospect.seniority}` : ''}
${prospect.industry ? `- Industry: ${prospect.industry}` : ''}
${prospect.revenue ? `- Company Revenue: ${prospect.revenue}` : ''}
${prospect.employees ? `- Company Size: ${prospect.employees} employees` : ''}
${prospect.funding_stage ? `- Funding Stage: ${prospect.funding_stage}` : ''}
${prospect.tech_stack?.length ? `- Tech Stack: ${prospect.tech_stack.join(', ')}` : ''}
${prospect.departments?.length ? `- Departments: ${prospect.departments.join(', ')}` : ''}
${prospect.company_keywords?.length ? `- Company Focus: ${prospect.company_keywords.join(', ')}` : ''}`
}

// ============================================================================
// Email Type Helpers
// ============================================================================

// Extract tone-of-voice from business context prompt for the shared prompt builder
function extractToneOfVoice(contextPrompt: string): string | undefined {
  const toneMatch = contextPrompt.match(/(?:tone of voice|brand voice|communication style)[:\s]*([^\n]+)/i)
  return toneMatch?.[1]?.trim() || undefined
}

function filterContextForEmailType(contextPrompt: string, emailType?: string): string {
  if (emailType !== 'event_invitation') return contextPrompt

  // For event invitations, strip sales-oriented context that would make emails sound like pitches
  const lines = contextPrompt.split('\n')
  const filtered = lines.filter(line => {
    const upper = line.toUpperCase().trim()
    // Remove value propositions, pain points, and competitor info
    if (upper.startsWith('VALUE PROPOSITION') || upper.startsWith('## VALUE PROPOSITION')) return false
    if (upper.startsWith('PAIN POINTS') || upper.startsWith('## PAIN POINTS')) return false
    if (upper.startsWith('COMPETITORS') || upper.startsWith('## COMPETITORS')) return false
    if (upper.startsWith('KEY DIFFERENTIATORS') || upper.startsWith('## KEY DIFFERENTIATORS')) return false
    return true
  })
  return filtered.join('\n')
}

function buildEventDetailsBlock(config: SequenceConfig): string {
  if (!config.event_details) return ''
  const d = config.event_details
  const parts = []
  if (d.event_name) parts.push(`Event Name: ${d.event_name}`)
  if (d.date) parts.push(`Date: ${d.date}`)
  if (d.time) parts.push(`Time: ${d.time}`)
  if (d.venue) parts.push(`Venue: ${d.venue}`)
  if (d.description) parts.push(`Description: ${d.description}`)
  if (parts.length === 0) return ''
  return `\n\n## Event Details (use these EXACTLY — do not change or omit)\n${parts.join('\n')}`
}

// ============================================================================
// Tier 1: Claude Sonnet — Write real emails for the FIRST prospect (runs ONCE)
// ============================================================================

async function generateExampleEmails(
  prospect: ProspectData,
  config: SequenceConfig,
  contextPrompt: string,
  signOff: string,
): Promise<EmailStep[]> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const numSteps = Math.min(Math.max(config.num_steps, 1), MAX_STEPS)

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const isInvitation = config.email_type === 'event_invitation'
  const filteredContext = filterContextForEmailType(contextPrompt, config.email_type)
  const eventBlock = buildEventDetailsBlock(config)
  const sequenceType = isInvitation ? 'event invitation email sequence' : 'cold email sequence'

  const toneVoice = extractToneOfVoice(contextPrompt)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: buildEmailSystemPrompt(config.email_type, signOff, toneVoice),
    messages: [{
      role: 'user',
      content: `Write a ${numSteps}-step ${sequenceType} for this prospect.

## Prospect
${buildProspectBlock(prospect)}

## Business Context
${filteredContext}

${config.angle ? `## Campaign Angle\n${config.angle}\n` : ''}${eventBlock}

${FRAMEWORK_SELECTION_GUIDE}

## Sequence Timing
${buildSequenceTiming(numSteps)}

## Requirements
1. Generate exactly ${numSteps} email step(s)
2. Each step needs a subject line and body
3. Step 1: ${isInvitation ? 'Personal invitation explaining why this prospect is a great fit for the event' : 'Initial outreach with a personalised opening referencing the prospect\'s role/company'}
${numSteps > 1 ? `4. Step 2+: ${isInvitation ? 'Follow-up referencing the original invitation, adding urgency (limited spots) and new value' : 'Follow-up emails that reference the previous email, add new value, and create urgency without being pushy'}` : ''}

Respond with ONLY a JSON array of objects, each with "subject" and "body" fields. No markdown, no explanation.`,
    }],
  })

  const text = response.content.find((c: { type: string }) => c.type === 'text') as { type: 'text'; text: string } | undefined
  if (!text?.text) throw new Error('No content in Claude response')

  // Extract JSON from response (may be wrapped in markdown code blocks)
  let jsonStr = text.text.trim()
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) jsonStr = jsonMatch[1].trim()

  const steps = JSON.parse(jsonStr) as EmailStep[]
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('Invalid email format from Claude')

  return steps.slice(0, numSteps)
}

// ============================================================================
// Tier 2: Gemini Flash — Generate emails for remaining prospects using the
//         first row's emails as a style/quality example (runs per lead)
// ============================================================================

async function generateEmailsFromExample(
  prospect: ProspectData,
  exampleProspect: ProspectData,
  exampleEmails: EmailStep[],
  config: SequenceConfig,
  contextPrompt: string,
  signOff: string,
): Promise<EmailStep[]> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const numSteps = Math.min(Math.max(config.num_steps, 1), MAX_STEPS)

  const isInvitation = config.email_type === 'event_invitation'
  const filteredContext = filterContextForEmailType(contextPrompt, config.email_type)
  const eventBlock = buildEventDetailsBlock(config)
  const sequenceType = isInvitation ? 'event invitation email sequence' : 'cold email sequence'

  // Format the example emails for the prompt
  const exampleBlock = exampleEmails.map((e, i) => `Step ${i + 1}:\n  Subject: ${e.subject}\n  Body: ${e.body}`).join('\n\n')

  const toneVoice = extractToneOfVoice(contextPrompt)
  const systemContext = buildEmailSystemPrompt(config.email_type, signOff, toneVoice)

  const prompt = `${systemContext}

---

Generate a ${numSteps}-step ${sequenceType} for a NEW prospect, using the example emails below as a style and quality reference.

## Example Emails (written for ${exampleProspect.name}, ${exampleProspect.title} at ${exampleProspect.company})
${exampleBlock}

## NEW Prospect (write emails for this person)
${buildProspectBlock(prospect)}

## Business Context
${filteredContext}

${config.angle ? `## Campaign Angle\n${config.angle}\n` : ''}${eventBlock}

## Requirements
1. Generate exactly ${numSteps} email step(s) for the NEW prospect
2. Match the same tone, length, structure, and quality as the example emails
3. Personalise to the NEW prospect's company, role, industry — do NOT copy the example content
4. Each step needs a subject line and body
5. End with: ${signOff || 'Best regards'}
6. Do NOT use generic phrases like "I hope this email finds you well"
7. Reference something specific about the NEW prospect
${isInvitation ? `8. This is an EVENT INVITATION — do NOT pitch products/services, do NOT change the event details, do NOT reference the prospect's city as the event location` : ''}

Respond with ONLY a JSON array of objects, each with "subject" and "body" fields. No markdown, no explanation.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!resultText) throw new Error('No content in Gemini response')

  const steps = JSON.parse(resultText) as EmailStep[]
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('Invalid email sequence format')

  return steps.slice(0, numSteps)
}

// ============================================================================
// Fallback: Direct Gemini Generation (when Claude is unavailable)
// ============================================================================

async function generateEmailsDirectly(
  prospect: ProspectData,
  config: SequenceConfig,
  contextPrompt: string,
  signOff: string,
): Promise<EmailStep[]> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const numSteps = Math.min(Math.max(config.num_steps, 1), MAX_STEPS)
  const isInvitation = config.email_type === 'event_invitation'
  const filteredContext = filterContextForEmailType(contextPrompt, config.email_type)
  const eventBlock = buildEventDetailsBlock(config)
  const sequenceType = isInvitation ? 'event invitation email sequence' : 'cold email sequence'

  const toneVoice = extractToneOfVoice(contextPrompt)
  const systemContext = buildEmailSystemPrompt(config.email_type, signOff, toneVoice)

  const prompt = `${systemContext}

---

Generate a ${numSteps}-step ${sequenceType} for this prospect.

## Prospect
${buildProspectBlock(prospect)}

## Business Context
${filteredContext}

${config.angle ? `## Campaign Angle\n${config.angle}\n` : ''}${eventBlock}

${FRAMEWORK_SELECTION_GUIDE}

## Sequence Timing
${buildSequenceTiming(numSteps)}

## Requirements
1. Generate exactly ${numSteps} email step(s)
2. Each step needs a subject line and body
3. Step 1: ${isInvitation ? 'Personal invitation explaining why this prospect is a great fit for the event' : 'Initial outreach with a personalised opening that references the prospect\'s role/company'}
${numSteps > 1 ? `4. Step 2+: ${isInvitation ? 'Follow-up referencing the original invitation, adding urgency (limited spots) and new value' : 'Follow-up emails that reference the previous email, add new value, and create urgency without being pushy'}` : ''}

Respond with ONLY a JSON array of objects, each with "subject" and "body" fields. No markdown, no explanation.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No content in Gemini response')

  const steps = JSON.parse(text) as EmailStep[]
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('Invalid email sequence format')

  return steps.slice(0, numSteps)
}

// ============================================================================
// Column Management
// ============================================================================

async function ensureStepColumns(
  serviceClient: ReturnType<typeof createClient>,
  tableId: string,
  numSteps: number,
): Promise<Map<string, { subjectColumnId: string; bodyColumnId: string }>> {
  // Get existing columns to find max position and check for existing step columns
  const { data: existingColumns } = await serviceClient
    .from('dynamic_table_columns')
    .select('id, key, position')
    .eq('table_id', tableId)
    .order('position', { ascending: false })

  let maxPosition = existingColumns?.[0]?.position ?? 0
  const existingKeys = new Map<string, string>()
  for (const col of existingColumns || []) {
    existingKeys.set(col.key, col.id)
  }

  const stepMap = new Map<string, { subjectColumnId: string; bodyColumnId: string }>()
  const columnsToCreate: Array<Record<string, unknown>> = []

  for (let i = 1; i <= numSteps; i++) {
    const subjectKey = `instantly_step_${i}_subject`
    const bodyKey = `instantly_step_${i}_body`

    let subjectId = existingKeys.get(subjectKey)
    let bodyId = existingKeys.get(bodyKey)

    if (!subjectId) {
      maxPosition++
      const col = {
        table_id: tableId,
        key: subjectKey,
        label: `Step ${i} Subject`,
        column_type: 'text',
        position: maxPosition,
        width: 250,
        is_visible: true,
        is_enrichment: true,
      }
      columnsToCreate.push(col)
    }

    if (!bodyId) {
      maxPosition++
      const col = {
        table_id: tableId,
        key: bodyKey,
        label: `Step ${i} Body`,
        column_type: 'text',
        position: maxPosition,
        width: 350,
        is_visible: true,
        is_enrichment: true,
      }
      columnsToCreate.push(col)
    }

    // We'll fill in IDs after insert
    stepMap.set(String(i), { subjectColumnId: subjectId || '', bodyColumnId: bodyId || '' })
  }

  // Batch create missing columns
  if (columnsToCreate.length > 0) {
    const { data: created, error } = await serviceClient
      .from('dynamic_table_columns')
      .insert(columnsToCreate)
      .select('id, key')

    if (error) {
      console.error(`${LOG} Failed to create step columns:`, error)
      throw new Error(`Failed to create step columns: ${error.message}`)
    }

    // Map created column IDs
    for (const col of created || []) {
      const match = col.key.match(/^instantly_step_(\d+)_(subject|body)$/)
      if (match) {
        const stepNum = match[1]
        const field = match[2]
        const entry = stepMap.get(stepNum)
        if (entry) {
          if (field === 'subject') entry.subjectColumnId = col.id
          else entry.bodyColumnId = col.id
        }
      }
    }
  }

  return stepMap
}

// ============================================================================
// Store generation config on step columns
// ============================================================================

async function storeGenerationConfig(
  serviceClient: ReturnType<typeof createClient>,
  tableId: string,
  config: SequenceConfig,
  signOff: string,
  model: string | undefined,
  numSteps: number,
): Promise<void> {
  // Fetch all step columns for this table
  const { data: stepColumns } = await serviceClient
    .from('dynamic_table_columns')
    .select('id, key')
    .eq('table_id', tableId)
    .like('key', 'instantly_step_%')

  if (!stepColumns || stepColumns.length === 0) return

  const generationConfig = {
    num_steps: numSteps,
    angle: config.angle || '',
    email_type: config.email_type || 'cold_outreach',
    event_details: config.event_details || null,
    sign_off: signOff,
    model: model || 'anthropic/claude-sonnet-4-5-20250929',
    tier_strategy: (model && (model.startsWith('google/') || model.startsWith('gemini'))) ? 'single_tier' : 'two_tier',
  }

  // Update each step column's integration_config
  const updates = stepColumns.map(col => {
    const match = col.key.match(/^instantly_step_(\d+)_(subject|body)$/)
    if (!match) return null
    return {
      id: col.id,
      integration_config: {
        email_generation: true,
        generation_config: generationConfig,
        step_number: parseInt(match[1], 10),
        step_part: match[2],
      },
    }
  }).filter(Boolean) as Array<{ id: string; integration_config: Record<string, unknown> }>

  // Batch update in parallel (small number of columns)
  await Promise.all(
    updates.map(u =>
      serviceClient
        .from('dynamic_table_columns')
        .update({ integration_config: u.integration_config })
        .eq('id', u.id)
    )
  )

  console.log(`${LOG} Stored generation config on ${updates.length} step columns`)
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    // --- Auth ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401)
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401)
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const orgId = await getUserOrgId(serviceClient, user.id)
    if (!orgId) {
      return errorResponse('No organization found', req)
    }

    // --- Parse request ---
    const body = (await req.json()) as RequestBody
    if (!body.table_id || !body.sequence_config?.num_steps) {
      return errorResponse('Missing required fields: table_id, sequence_config.num_steps', req)
    }

    const numSteps = Math.min(Math.max(body.sequence_config.num_steps, 1), MAX_STEPS)
    console.log(`${LOG} Generating ${numSteps}-step sequence for table=${body.table_id}`)

    // --- Load context ---
    let contextPrompt = body.business_context_prompt || ''
    let signOff = body.sign_off || ''
    if (!contextPrompt) {
      const ctx = await loadBusinessContext(serviceClient, orgId, user.id)
      contextPrompt = buildContextPrompt(ctx)
      if (!signOff) signOff = ctx.emailSignOff || ''
    } else if (!signOff) {
      // Extract sign-off from context prompt if not provided explicitly
      const signOffMatch = contextPrompt.match(/(?:sign[ -]?off|closing|signature):\s*(.+?)(?:\n|$)/i)
      if (signOffMatch) signOff = signOffMatch[1].trim()
    }

    // --- Get prospect data from table rows ---
    const rowQuery = serviceClient
      .from('dynamic_table_rows')
      .select('id, source_data')
      .eq('table_id', body.table_id)
      .is('hubspot_removed_at', null)
      .order('row_index')

    if (body.row_ids && body.row_ids.length > 0) {
      rowQuery.in('id', body.row_ids)
    }

    const { data: rows, error: rowError } = await rowQuery
    if (rowError) throw new Error(`Failed to fetch rows: ${rowError.message}`)
    if (!rows || rows.length === 0) {
      return jsonResponse({ generated_count: 0, failed_count: 0, step_columns_created: 0 }, req)
    }

    // Get columns for cell lookup
    const { data: columns } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', body.table_id)

    const columnKeyToId = new Map<string, string>()
    const columnIdToKey = new Map<string, string>()
    for (const col of columns || []) {
      columnKeyToId.set(col.key, col.id)
      columnIdToKey.set(col.id, col.key)
    }

    // Get cells for prospect data extraction
    const rowIds = rows.map(r => r.id)
    const { data: cells } = await serviceClient
      .from('dynamic_table_cells')
      .select('row_id, column_id, value')
      .in('row_id', rowIds)

    // Build prospect data per row
    const rowCells = new Map<string, Map<string, string>>()
    for (const cell of cells || []) {
      if (!cell.value) continue
      let rowMap = rowCells.get(cell.row_id)
      if (!rowMap) {
        rowMap = new Map()
        rowCells.set(cell.row_id, rowMap)
      }
      const key = columnIdToKey.get(cell.column_id)
      if (key) rowMap.set(key, cell.value)
    }

    const prospects: ProspectData[] = rows.map(row => {
      const cellMap = rowCells.get(row.id) || new Map()
      const sourceData = (row.source_data as Record<string, unknown>) || {}
      const apolloData = (sourceData.apollo || sourceData) as Record<string, unknown>
      const orgData = (apolloData.organization as Record<string, unknown>) || {}

      return {
        row_id: row.id,
        name: cellMap.get('full_name') || cellMap.get('first_name') || (apolloData.first_name as string) || 'there',
        title: cellMap.get('title') || (apolloData.title as string) || '',
        company: cellMap.get('company') || (orgData.name as string) || '',
        company_description: (orgData.short_description as string) || '',
        city: cellMap.get('city') || (apolloData.city as string) || '',
        linkedin_url: cellMap.get('linkedin_url') || (apolloData.linkedin_url as string) || '',
        // Rich enrichment data from Apollo
        industry: (orgData.industry as string) || '',
        revenue: orgData.estimated_annual_revenue ? String(orgData.estimated_annual_revenue) : '',
        employees: orgData.estimated_num_employees ? String(orgData.estimated_num_employees) : (cellMap.get('employees') || ''),
        tech_stack: Array.isArray(orgData.current_technologies) ? (orgData.current_technologies as string[]).slice(0, 10) : [],
        headline: (apolloData.headline as string) || '',
        seniority: (apolloData.seniority as string) || '',
        departments: Array.isArray(apolloData.departments) ? (apolloData.departments as string[]) : [],
        funding_stage: (orgData.latest_funding_stage as string) || cellMap.get('funding_stage') || '',
        company_keywords: Array.isArray(orgData.keywords) ? (orgData.keywords as string[]).slice(0, 10) : [],
      }
    })

    // --- Ensure step columns exist ---
    const stepMap = await ensureStepColumns(serviceClient, body.table_id, numSteps)
    const stepColumnsCreated = [...stepMap.values()].filter(
      v => v.subjectColumnId && v.bodyColumnId
    ).length

    // --- Store generation config on step columns ---
    await storeGenerationConfig(
      serviceClient,
      body.table_id,
      body.sequence_config,
      signOff,
      body.model,
      numSteps,
    )

    // --- Determine tier strategy based on model ---
    // If model starts with google/ or gemini, use Gemini for all (single tier)
    const useGeminiOnly = body.model && (body.model.startsWith('google/') || body.model.startsWith('gemini'))

    // --- Two-tier email generation ---
    // Tier 1: Claude writes real emails for the first prospect (1 API call)
    // Tier 2: Gemini generates emails for remaining prospects using row 1 as example
    const limiter = createConcurrencyLimiter(CONCURRENCY)
    let generatedCount = 0
    let failedCount = 0

    // Helper to write cells for a prospect's email steps
    const writeStepCells = async (prospectRowId: string, steps: EmailStep[]) => {
      const cellsToUpsert: Array<Record<string, unknown>> = []
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        const stepNum = String(i + 1)
        const colIds = stepMap.get(stepNum)
        if (!colIds) continue
        if (colIds.subjectColumnId) {
          cellsToUpsert.push({
            row_id: prospectRowId,
            column_id: colIds.subjectColumnId,
            value: step.subject,
            status: 'complete',
            source: 'enrichment',
          })
        }
        if (colIds.bodyColumnId) {
          cellsToUpsert.push({
            row_id: prospectRowId,
            column_id: colIds.bodyColumnId,
            value: step.body,
            status: 'complete',
            source: 'enrichment',
          })
        }
      }
      if (cellsToUpsert.length > 0) {
        const { error: upsertError } = await serviceClient
          .from('dynamic_table_cells')
          .upsert(cellsToUpsert, { onConflict: 'row_id,column_id' })
        if (upsertError) throw new Error(`Cell upsert error: ${upsertError.message}`)
      }
    }

    // Tier 1: Claude writes real emails for prospect[0] (skipped if Gemini-only mode)
    let exampleEmails: EmailStep[] | null = null
    const firstProspect = prospects[0]

    if (!useGeminiOnly && ANTHROPIC_API_KEY) {
      try {
        console.log(`${LOG} Tier 1: Claude writing emails for first prospect (${firstProspect.name})`)
        exampleEmails = await generateExampleEmails(
          firstProspect,
          { num_steps: numSteps, angle: body.sequence_config.angle, email_type: body.sequence_config.email_type, event_details: body.sequence_config.event_details },
          contextPrompt,
          signOff,
        )
        // Write first prospect's cells immediately
        await writeStepCells(firstProspect.row_id, exampleEmails)
        generatedCount++
        console.log(`${LOG} Tier 1 complete: ${exampleEmails.length} emails written for ${firstProspect.name}`)
      } catch (err) {
        console.error(`${LOG} Tier 1 (Claude) failed for first prospect, falling back to Gemini for all:`, (err as Error).message)
        exampleEmails = null
      }
    } else if (useGeminiOnly) {
      console.log(`${LOG} Gemini-only mode (model=${body.model}), skipping Tier 1 Claude`)
    } else {
      console.log(`${LOG} ANTHROPIC_API_KEY not set, using direct Gemini generation for all`)
    }

    // Tier 2: Gemini generates emails for remaining prospects (or all if Claude failed)
    const remainingProspects = exampleEmails ? prospects.slice(1) : prospects
    console.log(`${LOG} Tier 2: Gemini generating for ${remainingProspects.length} prospects${exampleEmails ? ' (using row 1 as example)' : ' (direct mode)'}`)

    const tasks = remainingProspects.map(prospect =>
      limiter(async () => {
        try {
          let steps: EmailStep[]

          if (exampleEmails) {
            // Two-tier: Gemini uses first row's emails as style example
            steps = await generateEmailsFromExample(
              prospect,
              firstProspect,
              exampleEmails,
              { num_steps: numSteps, angle: body.sequence_config.angle, email_type: body.sequence_config.email_type, event_details: body.sequence_config.event_details },
              contextPrompt,
              signOff,
            )
          } else {
            // Fallback: direct Gemini generation (no example)
            steps = await generateEmailsDirectly(
              prospect,
              { num_steps: numSteps, angle: body.sequence_config.angle, email_type: body.sequence_config.email_type, event_details: body.sequence_config.event_details },
              contextPrompt,
              signOff,
            )
          }

          await writeStepCells(prospect.row_id, steps)
          generatedCount++
        } catch (err) {
          console.error(`${LOG} Failed for row ${prospect.row_id}:`, (err as Error).message)
          failedCount++
        }
      })
    )

    await Promise.all(tasks)

    console.log(`${LOG} Complete: ${generatedCount} generated, ${failedCount} failed`)

    return jsonResponse({
      generated_count: generatedCount,
      failed_count: failedCount,
      step_columns_created: stepColumnsCreated,
    }, req)
  } catch (err) {
    console.error(`${LOG} Fatal error:`, err)
    return errorResponse((err as Error).message, req, 500)
  }
})

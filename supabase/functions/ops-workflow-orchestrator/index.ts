/**
 * Ops Workflow Orchestrator
 *
 * Receives a natural language prompt and executes a multi-step prospecting
 * workflow: Apollo search → table creation → enrichment → email generation
 * → Instantly campaign creation.
 *
 * Streams progress via SSE so the frontend can show real-time step updates.
 *
 * POST /ops-workflow-orchestrator
 * Body: { prompt: string, config?: WorkflowConfig, clarification_answers?: Record<string, string> }
 *
 * SSE Events (all step events include `agent` field for specialist attribution):
 *   plan_created      — skill plan decomposed from prompt (agent: orchestrator)
 *   clarification_needed — orchestrator needs user input
 *   step_start         — step execution beginning (agent: research|outreach|prospecting)
 *   step_progress      — intermediate progress (e.g. "enriched 45/100")
 *   step_complete      — step finished with summary
 *   step_error         — step failed (workflow continues)
 *   workflow_complete   — all steps done, returns table_id + summary
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1'
import {
  handleCorsPreflightRequest,
  getCorsHeaders,
} from '../_shared/corsHelper.ts'
import { loadBusinessContext, buildContextPrompt } from '../_shared/businessContext.ts'
import { getUserOrgId } from '../_shared/edgeAuth.ts'
import { loadAgentTeamConfig } from '../_shared/agentConfig.ts'
import type { AgentName } from '../_shared/agentConfig.ts'

// ============================================================================
// Types
// ============================================================================

interface WorkflowConfig {
  table_name?: string
  max_results?: number
  skip_enrichment?: boolean
  skip_email_generation?: boolean
  skip_campaign_creation?: boolean
  num_email_steps?: number
  campaign_angle?: string
  target_table_id?: string
}

interface WorkflowRequest {
  prompt: string
  config?: WorkflowConfig
  clarification_answers?: Record<string, string>
}

interface SkillPlan {
  search_params: Record<string, unknown>
  table_name: string
  enrichment: { email: boolean; phone: boolean }
  email_sequence: {
    num_steps: number
    angle: string
    step_delays?: number[]
    email_type?: 'cold_outreach' | 'event_invitation' | 'meeting_request' | 'follow_up'
    event_details?: { event_name?: string; date?: string; time?: string; venue?: string; description?: string }
  } | null
  campaign: { create_new: boolean; campaign_name?: string } | null
  summary: string
  clarifying_questions?: Array<{
    type: 'select' | 'text'
    question: string
    options?: string[]
    key: string
  }>
}

interface StepResult {
  step: string
  status: 'complete' | 'error' | 'skipped'
  summary: string
  data?: Record<string, unknown>
  error?: string
  duration_ms: number
  agent?: AgentName
}

// ============================================================================
// Constants
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const LOG = '[ops-workflow-orchestrator]'

// ============================================================================
// SSE Helpers
// ============================================================================

function sseEvent(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  controller.enqueue(new TextEncoder().encode(payload))
}

// ============================================================================
// Skill Plan Decomposition
// ============================================================================

async function decomposePrompt(
  prompt: string,
  contextPrompt: string,
  config?: WorkflowConfig,
  clarificationAnswers?: Record<string, string>,
): Promise<SkillPlan> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const answersContext = clarificationAnswers
    ? `\n\nThe user has already answered these clarifying questions:\n${Object.entries(clarificationAnswers).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
    : ''

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: `You are a sales workflow planner. Given a natural language prompt describing a prospecting/outreach workflow, decompose it into a structured execution plan.

${contextPrompt ? `## Business Context\n${contextPrompt}\n` : ''}

You have one tool: create_workflow_plan. Always use it to return the structured plan.

## Rules
1. Extract Apollo search parameters from the prompt (titles, locations, seniorities, departments, company size, funding stage, keywords)
2. Determine if email enrichment is needed (default: yes, for verified emails)
3. Determine if an email sequence should be generated (look for "outreach", "sequence", "campaign", "email", "follow up")
4. Determine if an Instantly campaign should be created (look for "campaign", "send", "outreach", "Instantly")
5. Generate a descriptive table name (2-5 words)
6. Do NOT include clarifying_questions — the frontend handles pre-flight questions before calling this endpoint
7. When the user says "companies" or "businesses" (not "contacts" or "people"), focus the search on COMPANIES:
   - Use q_organization_keyword_tags for company type/industry keywords (e.g. ["marketing agency", "digital agency"])
   - Set organization_num_employees_ranges to match company size
   - Do NOT set person_titles or person_seniorities unless the user explicitly requests specific roles
   - The search still returns people (Apollo is people-first), but filtered by the RIGHT companies
8. For locations, use full country names (e.g. "United Kingdom" not "UK")
9. Always include contact_email_status: ["verified"] unless user specifies otherwise
10. Default per_page to 50 unless user specifies a count (max 100)
11. When the prompt mentions C-level roles (CEO, CTO, CFO, COO, CMO, CRO, etc.), ALWAYS add person_seniorities: ["c_suite", "owner", "founder", "partner"] to broaden the search beyond exact title matches
12. When a specific city is mentioned, always include the country/state for clarity but do NOT broaden to a wider region — Apollo's location search is fuzzy and will already match nearby areas. For example: "Bristol" → ["Bristol, United Kingdom"]. "San Francisco" → ["San Francisco, California"]. "London" → ["London, United Kingdom"]
13. When the prompt asks for a specific number of results (e.g. "Find 10 CEOs"), set per_page to exactly that number. Do NOT over-fetch — return only what was requested
14. When generating email sequences, calculate smart step_delays (days between each email) based on context:
    - If there's a deadline/event date, work backwards: space emails so the last follow-up lands 2-3 days before the event, and the first email goes out ASAP
    - For event invitations: use shorter intervals (2-3 days) to create urgency
    - For general cold outreach: use longer intervals (3-5 days) between steps
    - For urgent/time-sensitive campaigns: compress to 1-2 day intervals
    - step_delays is an array where index 0 = delay before step 2, index 1 = delay before step 3, etc. (step 1 has no delay)
    - Today's date is ${new Date().toISOString().split('T')[0]}
15. Classify email_type based on the prompt:
    - 'event_invitation': when the prompt mentions an event, breakfast, dinner, roundtable, conference, webinar, meetup, or similar WITH a date/time/venue
    - 'meeting_request': for requesting a 1:1 meeting or call
    - 'follow_up': for following up on a previous interaction
    - 'cold_outreach': default for general prospecting/sales outreach
16. For event_invitation, you MUST extract event_details (event_name, date, time, venue) from the prompt — these details are CRITICAL and must appear verbatim in the generated emails. Do NOT leave any event detail empty if it's mentioned in the prompt.
17. For organization_num_employees_ranges, Apollo uses PREDEFINED buckets — you MUST only use these exact strings: "1,10", "11,20", "21,50", "51,100", "101,200", "201,500", "501,1000", "1001,5000", "5001,10000", "10001,". To cover a user's requested range, select ALL buckets that overlap. Examples: "50-200 employees" → ["21,50", "51,100", "101,200"], "under 50" → ["1,10", "11,20", "21,50"], "500+ employees" → ["501,1000", "1001,5000", "5001,10000", "10001,"], "small company" → ["1,10", "11,20", "21,50"], "enterprise" → ["5001,10000", "10001,"]${answersContext}`,
    tools: [{
      name: 'create_workflow_plan',
      description: 'Create a structured workflow execution plan from the user prompt',
      input_schema: {
        type: 'object' as const,
        properties: {
          search_params: {
            type: 'object',
            description: 'Apollo search parameters',
            properties: {
              person_titles: { type: 'array', items: { type: 'string' } },
              person_locations: { type: 'array', items: { type: 'string' } },
              person_seniorities: { type: 'array', items: { type: 'string' } },
              person_departments: { type: 'array', items: { type: 'string' } },
              organization_num_employees_ranges: { type: 'array', items: { type: 'string' } },
              organization_latest_funding_stage_cd: { type: 'array', items: { type: 'string' } },
              q_keywords: { type: 'string' },
              q_organization_keyword_tags: { type: 'array', items: { type: 'string' } },
              q_organization_domains: { type: 'array', items: { type: 'string' } },
              contact_email_status: { type: 'array', items: { type: 'string' } },
              per_page: { type: 'number' },
            },
          },
          table_name: { type: 'string', description: 'Short descriptive table name (2-5 words)' },
          enrichment: {
            type: 'object',
            properties: {
              email: { type: 'boolean' },
              phone: { type: 'boolean' },
            },
          },
          email_sequence: {
            type: 'object',
            description: 'Email sequence config. Null if no email generation needed.',
            properties: {
              num_steps: { type: 'number', description: 'Number of email steps (1-5)' },
              angle: { type: 'string', description: 'Campaign angle / messaging direction' },
              step_delays: {
                type: 'array',
                items: { type: 'number' },
                description: 'Days between each email step. Array length = num_steps - 1. E.g. for 3 steps with delays [2, 3]: step 1 sends immediately, step 2 after 2 days, step 3 after 3 more days.',
              },
              email_type: {
                type: 'string',
                enum: ['cold_outreach', 'event_invitation', 'meeting_request', 'follow_up'],
                description: 'Type of email to generate. Use event_invitation for events with date/time/venue.',
              },
              event_details: {
                type: 'object',
                description: 'Event details for event_invitation type. Extract ALL details from the prompt.',
                properties: {
                  event_name: { type: 'string', description: 'Name of the event (e.g. "AI Round Table Breakfast")' },
                  date: { type: 'string', description: 'Date of the event (e.g. "6th March 2026")' },
                  time: { type: 'string', description: 'Time of the event (e.g. "9am - 11am")' },
                  venue: { type: 'string', description: 'Venue/location of the event (e.g. "The Harbour Hotel, Bristol")' },
                  description: { type: 'string', description: 'Optional description of the event' },
                },
              },
            },
          },
          campaign: {
            type: 'object',
            description: 'Campaign config. Null if no campaign creation needed.',
            properties: {
              create_new: { type: 'boolean' },
              campaign_name: { type: 'string' },
            },
          },
          summary: { type: 'string', description: 'Human-readable summary of the plan' },
        },
        required: ['search_params', 'table_name', 'enrichment', 'summary'],
      },
    }],
    tool_choice: { type: 'tool' as const, name: 'create_workflow_plan' },
    messages: [{ role: 'user', content: prompt }],
  })

  // Extract tool use result
  const toolUse = response.content.find(
    (c: { type: string }) => c.type === 'tool_use'
  ) as { type: 'tool_use'; input: Record<string, unknown> } | undefined

  if (!toolUse) {
    throw new Error('Claude did not return a workflow plan')
  }

  const plan = toolUse.input as unknown as SkillPlan

  // Apply config overrides
  if (config?.table_name) plan.table_name = config.table_name
  if (config?.max_results) (plan.search_params as Record<string, unknown>).per_page = Math.min(config.max_results, 100)
  if (config?.skip_email_generation) plan.email_sequence = null
  if (config?.skip_campaign_creation) plan.campaign = null
  if (config?.num_email_steps && plan.email_sequence) plan.email_sequence.num_steps = config.num_email_steps
  if (config?.campaign_angle && plan.email_sequence) plan.email_sequence.angle = config.campaign_angle

  return plan
}

// ============================================================================
// Multi-Agent Plan Decomposition
// ============================================================================

interface AgentPlanFragment {
  agent: AgentName
  search_params?: Partial<Record<string, unknown>>
  email_sequence?: Partial<SkillPlan['email_sequence']>
  campaign?: Partial<SkillPlan['campaign']>
  enrichment?: Partial<SkillPlan['enrichment']>
  table_name?: string
  summary?: string
}

/**
 * Decompose a prompt using parallel specialist agents.
 * Each agent analyzes the prompt from its domain perspective and returns
 * a plan fragment. Fragments are merged into a unified SkillPlan.
 *
 * Falls back to single-agent decomposePrompt() on any error.
 */
async function decomposePromptMultiAgent(
  prompt: string,
  contextPrompt: string,
  config: WorkflowConfig | undefined,
  clarificationAnswers: Record<string, string> | undefined,
  orgId: string,
  serviceClient: ReturnType<typeof createClient>,
): Promise<SkillPlan> {
  if (!ANTHROPIC_API_KEY) {
    return decomposePrompt(prompt, contextPrompt, config, clarificationAnswers)
  }

  const teamConfig = await loadAgentTeamConfig(serviceClient, orgId)
  const model = teamConfig.worker_model
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const answersContext = clarificationAnswers
    ? `\n\nThe user has already answered these clarifying questions:\n${Object.entries(clarificationAnswers).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
    : ''

  // Define the 3 specialist planning prompts
  const agentPrompts: Array<{ agent: AgentName; system: string }> = [
    {
      agent: 'research',
      system: `You are the Research specialist analyzing a prospecting prompt.
Extract the ideal customer profile criteria and optimize search parameters.

${contextPrompt ? `## Business Context\n${contextPrompt}\n` : ''}

Return a JSON object with:
- search_params: Apollo search parameters (person_titles, person_locations, person_seniorities, person_departments, organization_num_employees_ranges, q_keywords, q_organization_keyword_tags, q_organization_domains, contact_email_status, per_page)
- enrichment: { email: boolean, phone: boolean }
- table_name: short descriptive name (2-5 words)
- summary: what leads are being targeted and why

Rules:
- For locations, use full country names
- Always include contact_email_status: ["verified"] unless specified otherwise
- Default per_page to 50 (max 100)
- For C-level roles, add person_seniorities: ["c_suite", "owner", "founder", "partner"]
- For organization_num_employees_ranges, use Apollo buckets: "1,10", "11,20", "21,50", "51,100", "101,200", "201,500", "501,1000", "1001,5000", "5001,10000", "10001,"
- When a specific number of results is requested, set per_page to that number
- When the user says "companies" or "businesses" (not "contacts" or "people"), focus on COMPANIES: use q_organization_keyword_tags for company type/industry keywords, set organization_num_employees_ranges, do NOT set person_titles or person_seniorities unless the user explicitly requests specific roles
- Today's date is ${new Date().toISOString().split('T')[0]}${answersContext}`,
    },
    {
      agent: 'outreach',
      system: `You are the Outreach specialist analyzing a prospecting prompt.
Plan the email sequence strategy, angles, and timing.

${contextPrompt ? `## Business Context\n${contextPrompt}\n` : ''}

Return a JSON object with:
- email_sequence: { num_steps, angle, step_delays, email_type, event_details } or null if no emails needed
- summary: the outreach strategy rationale

Rules:
- Only include email_sequence if the prompt mentions outreach/emails/sequence/campaign/follow-up
- num_steps: 1-5 email steps
- step_delays: array of day delays between steps (length = num_steps - 1)
- email_type: "cold_outreach" | "event_invitation" | "meeting_request" | "follow_up"
- For event_invitation: extract event_details (event_name, date, time, venue, description)
- For events, work backwards from the date: space emails so last follow-up lands 2-3 days before
- For cold outreach: 3-5 day intervals. For urgent: 1-2 day intervals
- Today's date is ${new Date().toISOString().split('T')[0]}${answersContext}`,
    },
    {
      agent: 'prospecting',
      system: `You are the Prospecting specialist analyzing a prospecting prompt.
Determine enrichment needs and campaign structure.

${contextPrompt ? `## Business Context\n${contextPrompt}\n` : ''}

Return a JSON object with:
- campaign: { create_new: boolean, campaign_name: string } or null if no campaign needed
- enrichment: { email: boolean, phone: boolean }
- summary: campaign and enrichment strategy

Rules:
- Only include campaign if the prompt mentions campaign/send/outreach/Instantly or if email_sequence is implied
- campaign_name should be descriptive (e.g., "UK CTO Cold Outreach Q1")
- Email enrichment should default to true for outbound
- Phone enrichment only if explicitly requested
- Today's date is ${new Date().toISOString().split('T')[0]}${answersContext}`,
    },
  ]

  try {
    // Run all 3 agents in parallel
    const fragmentPromises = agentPrompts.map(async ({ agent, system }): Promise<AgentPlanFragment> => {
      try {
        const response = await anthropic.messages.create({
          model,
          max_tokens: 1024,
          system,
          messages: [{ role: 'user', content: prompt }],
        })

        const text = response.content.find((c) => c.type === 'text')
        if (!text || text.type !== 'text') return { agent }

        const jsonMatch = text.text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return { agent }

        const parsed = JSON.parse(jsonMatch[0])
        return { agent, ...parsed }
      } catch (err) {
        console.error(`${LOG} Multi-agent plan fragment error (${agent}):`, (err as Error).message)
        return { agent }
      }
    })

    const fragments = await Promise.all(fragmentPromises)

    // Merge fragments into a unified SkillPlan
    const researchFragment = fragments.find(f => f.agent === 'research')
    const outreachFragment = fragments.find(f => f.agent === 'outreach')
    const prospectingFragment = fragments.find(f => f.agent === 'prospecting')

    // Research agent provides the core search params — if it failed, fall back
    if (!researchFragment?.search_params) {
      console.warn(`${LOG} Research agent returned no search_params, falling back to single-agent`)
      return decomposePrompt(prompt, contextPrompt, config, clarificationAnswers)
    }

    const plan: SkillPlan = {
      search_params: researchFragment.search_params as Record<string, unknown>,
      table_name: researchFragment.table_name || 'Prospect List',
      enrichment: {
        email: researchFragment.enrichment?.email ?? prospectingFragment?.enrichment?.email ?? true,
        phone: researchFragment.enrichment?.phone ?? prospectingFragment?.enrichment?.phone ?? false,
      },
      email_sequence: outreachFragment?.email_sequence
        ? {
            num_steps: outreachFragment.email_sequence.num_steps || 3,
            angle: outreachFragment.email_sequence.angle || 'professional outreach',
            step_delays: outreachFragment.email_sequence.step_delays,
            email_type: outreachFragment.email_sequence.email_type,
            event_details: outreachFragment.email_sequence.event_details,
          }
        : null,
      campaign: prospectingFragment?.campaign
        ? {
            create_new: prospectingFragment.campaign.create_new ?? true,
            campaign_name: prospectingFragment.campaign.campaign_name,
          }
        : null,
      summary: [
        researchFragment.summary,
        outreachFragment?.summary,
        prospectingFragment?.summary,
      ].filter(Boolean).join(' | '),
    }

    // Apply config overrides (same as single-agent path)
    if (config?.table_name) plan.table_name = config.table_name
    if (config?.max_results) (plan.search_params as Record<string, unknown>).per_page = Math.min(config.max_results, 100)
    if (config?.skip_email_generation) plan.email_sequence = null
    if (config?.skip_campaign_creation) plan.campaign = null
    if (config?.num_email_steps && plan.email_sequence) plan.email_sequence.num_steps = config.num_email_steps
    if (config?.campaign_angle && plan.email_sequence) plan.email_sequence.angle = config.campaign_angle

    return plan
  } catch (err) {
    console.error(`${LOG} Multi-agent decomposition failed, falling back:`, (err as Error).message)
    return decomposePrompt(prompt, contextPrompt, config, clarificationAnswers)
  }
}

// ============================================================================
// Step Executors
// ============================================================================

async function executeSearch(
  plan: SkillPlan,
  authHeader: string,
  targetTableId?: string,
): Promise<StepResult> {
  const start = Date.now()
  try {
    // Call copilot-dynamic-table to search + create/populate table
    const requestBody: Record<string, unknown> = {
      query_description: plan.summary,
      search_params: plan.search_params,
      table_name: plan.table_name,
      auto_enrich: plan.enrichment.email || plan.enrichment.phone
        ? { email: plan.enrichment.email, phone: plan.enrichment.phone }
        : undefined,
    }
    // If targeting an existing table, pass its ID so data gets added there
    if (targetTableId) {
      requestBody.target_table_id = targetTableId
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/copilot-dynamic-table`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(requestBody),
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      const errorDetail = data.details ? ` Details: ${typeof data.details === 'string' ? data.details.slice(0, 200) : JSON.stringify(data.details).slice(0, 200)}` : ''
      console.error(`${LOG} Search failed:`, data.error, errorDetail)
      return {
        step: 'search',
        status: 'error',
        summary: data.error || 'Apollo search failed',
        error: `${data.error || 'Apollo search failed'}${errorDetail}`,
        duration_ms: Date.now() - start,
        agent: 'research' as AgentName,
      }
    }

    return {
      step: 'search',
      status: 'complete',
      summary: `Found ${data.row_count} leads, created table "${data.table_name}"`,
      data: {
        table_id: data.table_id,
        table_name: data.table_name,
        row_count: data.row_count,
        enriched_count: data.enriched_count || 0,
      },
      duration_ms: Date.now() - start,
      agent: 'research' as AgentName,
    }
  } catch (err) {
    return {
      step: 'search',
      status: 'error',
      summary: `Search failed: ${(err as Error).message}`,
      error: (err as Error).message,
      duration_ms: Date.now() - start,
      agent: 'research' as AgentName,
    }
  }
}

async function executeEmailGeneration(
  tableId: string,
  plan: SkillPlan,
  authHeader: string,
  contextPrompt: string,
  signOff?: string,
): Promise<StepResult> {
  const start = Date.now()
  try {
    if (!plan.email_sequence) {
      return { step: 'email_generation', status: 'skipped', summary: 'No email sequence requested', duration_ms: 0, agent: 'outreach' as AgentName }
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-email-sequence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        table_id: tableId,
        sequence_config: {
          num_steps: plan.email_sequence.num_steps,
          angle: plan.email_sequence.angle,
          email_type: plan.email_sequence.email_type,
          event_details: plan.email_sequence.event_details,
        },
        business_context_prompt: contextPrompt,
        ...(signOff ? { sign_off: signOff } : {}),
      }),
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      return {
        step: 'email_generation',
        status: 'error',
        summary: data.error || 'Email generation failed',
        error: data.error,
        duration_ms: Date.now() - start,
        agent: 'outreach' as AgentName,
      }
    }

    return {
      step: 'email_generation',
      status: 'complete',
      summary: `Generated ${data.generated_count} email sequences (${plan.email_sequence.num_steps} steps each)`,
      data: {
        generated_count: data.generated_count,
        failed_count: data.failed_count,
        step_columns_created: data.step_columns_created,
      },
      duration_ms: Date.now() - start,
      agent: 'outreach' as AgentName,
    }
  } catch (err) {
    return {
      step: 'email_generation',
      status: 'error',
      summary: `Email generation failed: ${(err as Error).message}`,
      error: (err as Error).message,
      duration_ms: Date.now() - start,
      agent: 'outreach' as AgentName,
    }
  }
}

/**
 * Build Instantly sequences payload from the generated email step columns.
 *
 * Reads the first row's step columns to build the email sequence template.
 * Instantly uses {{variable}} placeholders — we map the dynamic parts so each
 * lead's personalised content goes via custom variables.
 */
async function buildSequencesFromTable(
  serviceClient: ReturnType<typeof createClient>,
  tableId: string,
  numSteps: number,
  stepDelays?: number[],
): Promise<{ sequences: any[]; variableMapping: Record<string, string> }> {
  // Get the step columns
  const { data: columns } = await serviceClient
    .from('dynamic_table_columns')
    .select('id, key, label')
    .eq('table_id', tableId)
    .like('key', 'instantly_step_%')

  if (!columns || columns.length === 0) {
    return { sequences: [], variableMapping: {} }
  }

  // Build a single sequence with steps
  // Each step uses {{step_N_subject}} and {{step_N_body}} as custom variables
  // so Instantly personalises per-lead from the pushed custom_variables
  // Instantly API requires: type, delay, variants[{subject, body}]
  const steps: any[] = []
  const variableMapping: Record<string, string> = {}

  for (let i = 1; i <= numSteps; i++) {
    const subjectKey = `instantly_step_${i}_subject`
    const bodyKey = `instantly_step_${i}_body`
    const subjectCol = columns.find(c => c.key === subjectKey)
    const bodyCol = columns.find(c => c.key === bodyKey)

    if (!subjectCol || !bodyCol) continue

    // Map table column keys to Instantly custom variable names
    variableMapping[subjectKey] = `step_${i}_subject`
    variableMapping[bodyKey] = `step_${i}_body`

    // Delay: step 1 = 0 (send immediately), subsequent steps use planner-calculated delays
    // stepDelays[0] = delay before step 2, stepDelays[1] = delay before step 3, etc.
    const delay = i === 1 ? 0 : (stepDelays && stepDelays[i - 2] != null ? stepDelays[i - 2] : (i === 2 ? 2 : 3))

    steps.push({
      type: 'email',
      delay,
      variants: [{
        subject: `{{step_${i}_subject}}`,
        body: `{{step_${i}_body}}`,
      }],
    })
  }

  if (steps.length === 0) {
    return { sequences: [], variableMapping: {} }
  }

  return {
    sequences: [{ steps }],
    variableMapping,
  }
}

async function executeCampaignCreation(
  tableId: string,
  plan: SkillPlan,
  authHeader: string,
  orgId: string,
  userId: string,
  serviceClient: ReturnType<typeof createClient>,
  controller: ReadableStreamDefaultController,
): Promise<StepResult> {
  const start = Date.now()
  try {
    if (!plan.campaign) {
      return { step: 'campaign_creation', status: 'skipped', summary: 'No campaign creation requested', duration_ms: 0, agent: 'prospecting' as AgentName }
    }

    const numSteps = plan.email_sequence?.num_steps || 0
    let sequences: any[] | undefined
    let variableMapping: Record<string, string> = {}

    // Build sequences from generated email step columns
    if (numSteps > 0) {
      sseEvent(controller, 'step_progress', { step: 'campaign_creation', message: 'Building email sequences from generated content' })
      const seqResult = await buildSequencesFromTable(serviceClient, tableId, numSteps, plan.email_sequence?.step_delays)
      if (seqResult.sequences.length > 0) {
        sequences = seqResult.sequences
        variableMapping = seqResult.variableMapping
      }
    }

    // Create campaign in PAUSED state via instantly-admin
    const campaignName = plan.campaign.campaign_name || plan.table_name

    const response = await fetch(`${SUPABASE_URL}/functions/v1/instantly-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        action: 'create_campaign',
        org_id: orgId,
        name: campaignName,
        ...(sequences ? { sequences } : {}),
      }),
    })

    const data = await response.json()

    if (!data.success || data.error) {
      return {
        step: 'campaign_creation',
        status: 'error',
        summary: data.error || 'Campaign creation failed',
        error: data.error,
        duration_ms: Date.now() - start,
        agent: 'prospecting' as AgentName,
      }
    }

    const campaignId = data.campaign?.id || data.campaign?.campaign_id
    if (!campaignId) {
      return {
        step: 'campaign_creation',
        status: 'error',
        summary: 'Campaign created but no ID returned',
        error: 'No campaign_id in response',
        duration_ms: Date.now() - start,
        agent: 'prospecting' as AgentName,
      }
    }

    // Build field_mapping for campaign link record (used later for manual push)
    const { data: allColumns } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', tableId)

    const fullMapping: Record<string, string> = {}
    for (const col of allColumns || []) {
      if (col.key === 'email') fullMapping[col.key] = 'email'
      else if (col.key === 'first_name') fullMapping[col.key] = 'first_name'
      else if (col.key === 'last_name') fullMapping[col.key] = 'last_name'
      else if (col.key === 'company' || col.key === 'organization_name') fullMapping[col.key] = 'company_name'
      else if (col.key === 'phone_number') fullMapping[col.key] = 'phone'
      else if (col.key === 'website_url') fullMapping[col.key] = 'website'
      else if (variableMapping[col.key]) fullMapping[col.key] = variableMapping[col.key]
    }

    // Get all row IDs (for creating pending push cells)
    const { data: rows } = await serviceClient
      .from('dynamic_table_rows')
      .select('id')
      .eq('table_id', tableId)
      .is('hubspot_removed_at', null)

    const rowIds = (rows || []).map(r => r.id)

    // --- Create Instantly columns, campaign link, and pending push cells ---
    sseEvent(controller, 'step_progress', { step: 'campaign_creation', message: 'Creating Instantly columns in table' })

    try {
      // Get max column position
      const { data: existingCols } = await serviceClient
        .from('dynamic_table_columns')
        .select('position')
        .eq('table_id', tableId)
        .order('position', { ascending: false })
        .limit(1)

      let nextPos = (existingCols?.[0]?.position ?? 0) + 1

      // Create campaign_config column
      const { data: campaignCol } = await serviceClient
        .from('dynamic_table_columns')
        .insert({
          table_id: tableId,
          key: 'instantly_campaign',
          label: 'Instantly Campaign',
          column_type: 'instantly',
          position: nextPos,
          width: 200,
          is_visible: true,
          is_enrichment: false,
          integration_config: {
            instantly_subtype: 'campaign_config',
            campaign_id: campaignId,
            campaign_name: campaignName,
            campaign_status: 'paused',
          },
        })
        .select('id')
        .single()

      nextPos++

      // Create push_action column
      const { data: pushCol } = await serviceClient
        .from('dynamic_table_columns')
        .insert({
          table_id: tableId,
          key: 'instantly_push',
          label: 'Push to Instantly',
          column_type: 'instantly',
          position: nextPos,
          width: 140,
          is_visible: true,
          is_enrichment: false,
          integration_config: {
            instantly_subtype: 'push_action',
            campaign_id: campaignId,
            campaign_name: campaignName,
            push_config: {
              campaign_id: campaignId,
              auto_field_mapping: false,
            },
          },
        })
        .select('id')
        .single()

      // Create pending push cells for all rows (user will push manually)
      if (pushCol && rowIds.length > 0) {
        const pushCells = rowIds.map(rowId => ({
          row_id: rowId,
          column_id: pushCol.id,
          value: 'pending',
          status: 'idle',
          source: 'instantly',
        }))

        // Batch upsert in chunks of 500
        const CHUNK_SIZE = 500
        for (let i = 0; i < pushCells.length; i += CHUNK_SIZE) {
          const chunk = pushCells.slice(i, i + CHUNK_SIZE)
          await serviceClient
            .from('dynamic_table_cells')
            .upsert(chunk, { onConflict: 'row_id,column_id' })
        }
        console.log(`${LOG} Created ${pushCells.length} pending push cells in push_action column`)
      }

      // Create instantly_campaign_links record
      await serviceClient
        .from('instantly_campaign_links')
        .upsert({
          table_id: tableId,
          campaign_id: campaignId,
          campaign_name: campaignName,
          field_mapping: fullMapping,
          auto_sync_columns: Object.keys(variableMapping),
          linked_by: userId,
          linked_at: new Date().toISOString(),
        }, { onConflict: 'table_id,campaign_id' })

      console.log(`${LOG} Created Instantly columns and campaign link for table=${tableId} campaign=${campaignId}`)
    } catch (colErr) {
      console.error(`${LOG} Post-push column/link creation warning:`, (colErr as Error).message)
      // Non-fatal — campaign and leads are created, columns are optional
    }

    return {
      step: 'campaign_creation',
      status: 'complete',
      summary: `Campaign "${campaignName}" created (paused). Review emails, push leads, then launch.`,
      data: {
        campaign_id: campaignId,
        campaign_name: campaignName,
        leads_pushed: 0,
        email_steps: numSteps,
        status: 'paused',
      },
      duration_ms: Date.now() - start,
      agent: 'prospecting' as AgentName,
    }
  } catch (err) {
    return {
      step: 'campaign_creation',
      status: 'error',
      summary: `Campaign creation failed: ${(err as Error).message}`,
      error: (err as Error).message,
      duration_ms: Date.now() - start,
      agent: 'prospecting' as AgentName,
    }
  }
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

  try {
    // --- Auth ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const orgId = await getUserOrgId(serviceClient, user.id)
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'No organization found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Parse request ---
    const body = (await req.json()) as WorkflowRequest
    if (!body.prompt) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: prompt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`${LOG} Starting workflow for user=${user.id} org=${orgId} prompt="${body.prompt.slice(0, 100)}"`)

    // --- SSE Stream ---
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // STEP 0: Load business context
          sseEvent(controller, 'step_start', { step: 'context', label: 'Loading business context' })
          const ctx = await loadBusinessContext(serviceClient, orgId, user.id)
          const contextPrompt = buildContextPrompt(ctx)
          const emailSignOff = ctx.emailSignOff || ''
          sseEvent(controller, 'step_complete', { step: 'context', summary: 'Business context loaded' })

          // STEP 1: Decompose prompt into skill plan (multi-agent with fallback)
          sseEvent(controller, 'step_start', { step: 'planning', label: 'Analyzing your request', agent: 'orchestrator' })
          const plan = await decomposePromptMultiAgent(
            body.prompt, contextPrompt, body.config, body.clarification_answers, orgId, serviceClient
          )
          sseEvent(controller, 'plan_created', { plan })

          // Check for clarifying questions
          if (plan.clarifying_questions && plan.clarifying_questions.length > 0 && !body.clarification_answers) {
            sseEvent(controller, 'clarification_needed', { questions: plan.clarifying_questions })
            sseEvent(controller, 'workflow_paused', {
              reason: 'Clarification needed',
              questions: plan.clarifying_questions,
            })
            controller.close()
            return
          }

          sseEvent(controller, 'step_complete', { step: 'planning', summary: plan.summary })

          const steps: StepResult[] = []

          // STEP 2: Apollo search + table creation/population (research agent)
          sseEvent(controller, 'step_start', { step: 'search', label: 'Searching Apollo for prospects', agent: 'research' })
          const searchResult = await executeSearch(plan, authHeader, body.config?.target_table_id)
          steps.push(searchResult)
          sseEvent(controller, searchResult.status === 'complete' ? 'step_complete' : 'step_error', searchResult)

          // If search failed, we can't continue
          if (searchResult.status === 'error' || !searchResult.data?.table_id) {
            sseEvent(controller, 'workflow_complete', {
              status: 'error',
              steps,
              error: 'Search failed — cannot proceed with workflow',
              duration_ms: steps.reduce((sum, s) => sum + s.duration_ms, 0),
            })
            controller.close()
            return
          }

          const tableId = searchResult.data.table_id as string

          // STEPS 3+4: Email generation + campaign creation
          // Parallelization strategy:
          //   - Email only: outreach agent runs alone
          //   - Campaign only (no emails): prospecting agent runs alone
          //   - Both requested: email runs first (outreach), then campaign (prospecting)
          //     because campaign reads email step columns to build Instantly sequences
          const wantsEmail = !!plan.email_sequence
          const wantsCampaign = !!plan.campaign

          if (wantsEmail) {
            // Email generation (outreach agent) — must complete before campaign if both requested
            sseEvent(controller, 'step_start', { step: 'email_generation', label: 'Generating personalised emails', agent: 'outreach' })
            const emailResult = await executeEmailGeneration(tableId, plan, authHeader, contextPrompt, emailSignOff)
            steps.push(emailResult)
            sseEvent(controller, emailResult.status === 'complete' ? 'step_complete' : 'step_error', emailResult)
          }

          if (wantsCampaign) {
            // Campaign creation (prospecting agent)
            sseEvent(controller, 'step_start', { step: 'campaign_creation', label: 'Creating Instantly campaign', agent: 'prospecting' })
            const campaignResult = await executeCampaignCreation(tableId, plan, authHeader, orgId, user.id, serviceClient, controller)
            steps.push(campaignResult)
            sseEvent(controller, campaignResult.status === 'complete' ? 'step_complete' : 'step_error', campaignResult)
          }

          // --- Workflow complete ---
          const errors = steps.filter(s => s.status === 'error')
          const totalDuration = steps.reduce((sum, s) => sum + s.duration_ms, 0)

          // Update table metadata with workflow description
          if (wantsCampaign || wantsEmail) {
            await serviceClient
              .from('dynamic_tables')
              .update({ description: `Workflow: ${plan.summary}` })
              .eq('id', tableId)
          }

          sseEvent(controller, 'workflow_complete', {
            status: errors.length === 0 ? 'complete' : 'partial',
            table_id: tableId,
            table_name: plan.table_name,
            steps,
            errors: errors.map(e => ({ step: e.step, error: e.error })),
            duration_ms: totalDuration,
          })

          controller.close()
        } catch (err) {
          console.error(`${LOG} Workflow error:`, err)
          sseEvent(controller, 'workflow_complete', {
            status: 'error',
            error: (err as Error).message,
            steps: [],
            duration_ms: 0,
          })
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    console.error(`${LOG} Fatal error:`, err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

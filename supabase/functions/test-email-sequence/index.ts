/**
 * Test Email Sequence — mirrors the real two-tier production flow:
 *
 *   Tier 1: Claude writes emails for prospect #1 (the "example")
 *   Tier 2: Gemini 2.5 Flash clones that style for prospects #2+ (one call each)
 *
 * Unlike generate-email-sequence, this does NOT require a table. It accepts
 * prospect data directly and returns all generated emails in the response.
 *
 * POST /test-email-sequence
 * Body: {
 *   prospects: ProspectInput[],            // 1+ prospects — first gets Claude, rest get Gemini
 *   sequence_config: { num_steps, angle?, email_type?, event_details? },
 *   sign_off?: string,
 *   business_context_prompt?: string,
 * }
 *
 * Returns: {
 *   system_prompt: string,
 *   user_prompt: string,                   // Claude's user prompt (for prospect 1)
 *   results: Array<{
 *     prospect: { name, title, company },
 *     tier: 'claude' | 'gemini',
 *     emails: EmailStep[],
 *     duration_ms: number,
 *     error?: string,
 *   }>
 * }
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
import {
  buildEmailSystemPrompt,
  buildSequenceTiming,
  FRAMEWORK_SELECTION_GUIDE,
} from '../_shared/emailPromptRules.ts'

// ============================================================================
// Types
// ============================================================================

interface ProspectInput {
  name: string
  title: string
  company: string
  company_description?: string
  city?: string
  industry?: string
  revenue?: string
  employees?: string
  headline?: string
  seniority?: string
  funding_stage?: string
  tech_stack?: string[]
  company_keywords?: string[]
}

interface SequenceConfig {
  num_steps: number
  angle?: string
  email_type?: string
  event_details?: { event_name?: string; date?: string; time?: string; venue?: string; description?: string }
}

interface EmailStep {
  subject: string
  body: string
}

interface ProspectResult {
  prospect: { name: string; title: string; company: string }
  tier: 'claude' | 'gemini'
  emails: EmailStep[]
  duration_ms: number
  error?: string
}

// ============================================================================
// Constants
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GEMINI_API_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MAX_STEPS = 5

// ============================================================================
// Helpers
// ============================================================================

function buildProspectBlock(p: ProspectInput): string {
  return `- Name: ${p.name}
- Title: ${p.title}
- Company: ${p.company}
${p.company_description ? `- Company Description: ${p.company_description}` : ''}
${p.city ? `- Location: ${p.city}` : ''}
${p.headline ? `- Headline: ${p.headline}` : ''}
${p.seniority ? `- Seniority: ${p.seniority}` : ''}
${p.industry ? `- Industry: ${p.industry}` : ''}
${p.revenue ? `- Company Revenue: ${p.revenue}` : ''}
${p.employees ? `- Company Size: ${p.employees} employees` : ''}
${p.funding_stage ? `- Funding Stage: ${p.funding_stage}` : ''}
${p.tech_stack?.length ? `- Tech Stack: ${p.tech_stack.join(', ')}` : ''}
${p.company_keywords?.length ? `- Company Focus: ${p.company_keywords.join(', ')}` : ''}`
}

function extractToneOfVoice(contextPrompt: string): string | undefined {
  const match = contextPrompt.match(/(?:tone of voice|brand voice|communication style)[:\s]*([^\n]+)/i)
  return match?.[1]?.trim() || undefined
}

function buildEventBlock(config: SequenceConfig): string {
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

function parseEmailSteps(text: string, numSteps: number): EmailStep[] {
  let jsonStr = text.trim()
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) jsonStr = jsonMatch[1].trim()
  const steps = JSON.parse(jsonStr) as EmailStep[]
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('Invalid email format')
  return steps.slice(0, numSteps)
}

// ============================================================================
// Tier 1: Claude — write real emails for prospect #1
// ============================================================================

async function tier1Claude(
  prospect: ProspectInput,
  config: SequenceConfig,
  systemPrompt: string,
  contextPrompt: string,
  numSteps: number,
): Promise<{ emails: EmailStep[]; duration_ms: number; user_prompt: string }> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const isInvitation = config.email_type === 'event_invitation'
  const sequenceType = isInvitation ? 'event invitation email sequence' : 'cold email sequence'
  const eventBlock = buildEventBlock(config)

  const userPrompt = `Write a ${numSteps}-step ${sequenceType} for this prospect.

## Prospect
${buildProspectBlock(prospect)}

## Business Context
${contextPrompt}

${config.angle ? `## Campaign Angle\n${config.angle}\n` : ''}${eventBlock}

${FRAMEWORK_SELECTION_GUIDE}

## Sequence Timing
${buildSequenceTiming(numSteps)}

## Requirements
1. Generate exactly ${numSteps} email step(s)
2. Each step needs a subject line and body
3. Step 1: ${isInvitation ? 'Personal invitation explaining why this prospect is a great fit for the event' : 'Initial outreach with a personalised opening referencing the prospect\'s role/company'}
${numSteps > 1 ? `4. Step 2+: ${isInvitation ? 'Follow-up referencing the original invitation, adding urgency (limited spots) and new value' : 'Follow-up emails that reference the previous email, add new value, and create urgency without being pushy'}` : ''}

Respond with ONLY a JSON array of objects, each with "subject" and "body" fields. No markdown, no explanation.`

  const start = Date.now()
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content.find((c: { type: string }) => c.type === 'text') as { type: 'text'; text: string } | undefined
  if (!text?.text) throw new Error('No content in Claude response')

  return {
    emails: parseEmailSteps(text.text, numSteps),
    duration_ms: Date.now() - start,
    user_prompt: userPrompt,
  }
}

// ============================================================================
// Tier 2: Gemini — clone style from prospect #1's emails for a new prospect
// ============================================================================

async function tier2Gemini(
  prospect: ProspectInput,
  exampleProspect: ProspectInput,
  exampleEmails: EmailStep[],
  config: SequenceConfig,
  systemPrompt: string,
  contextPrompt: string,
  signOff: string,
  numSteps: number,
): Promise<{ emails: EmailStep[]; duration_ms: number }> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const isInvitation = config.email_type === 'event_invitation'
  const sequenceType = isInvitation ? 'event invitation email sequence' : 'cold email sequence'
  const eventBlock = buildEventBlock(config)
  const exampleBlock = exampleEmails.map((e, i) => `Step ${i + 1}:\n  Subject: ${e.subject}\n  Body: ${e.body}`).join('\n\n')

  const prompt = `${systemPrompt}

---

Generate a ${numSteps}-step ${sequenceType} for a NEW prospect, using the example emails below as a style and quality reference.

## Example Emails (written for ${exampleProspect.name}, ${exampleProspect.title} at ${exampleProspect.company})
${exampleBlock}

## NEW Prospect (write emails for this person)
${buildProspectBlock(prospect)}

## Business Context
${contextPrompt}

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

  const start = Date.now()
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
    },
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!resultText) throw new Error('No content in Gemini response')

  return { emails: parseEmailSteps(resultText, numSteps), duration_ms: Date.now() - start }
}

// ============================================================================
// Handler
// ============================================================================

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', req, 401)

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return errorResponse('Unauthorized', req, 401)

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const orgId = await getUserOrgId(serviceClient, user.id)
    if (!orgId) return errorResponse('No organization found', req)

    // Parse request
    const body = await req.json()
    const { prospects, sequence_config, sign_off, business_context_prompt } = body

    if (!Array.isArray(prospects) || prospects.length === 0) {
      return errorResponse('Missing required field: prospects (array of 1+ prospects)', req)
    }
    if (!prospects[0]?.name || !prospects[0]?.title || !prospects[0]?.company) {
      return errorResponse('Each prospect needs: name, title, company', req)
    }
    if (!sequence_config?.num_steps) {
      return errorResponse('Missing required field: sequence_config.num_steps', req)
    }

    const numSteps = Math.min(Math.max(sequence_config.num_steps, 1), MAX_STEPS)

    // Load business context
    let contextPrompt = business_context_prompt || ''
    let resolvedSignOff = sign_off || ''
    if (!contextPrompt) {
      const ctx = await loadBusinessContext(serviceClient, orgId, user.id)
      contextPrompt = buildContextPrompt(ctx)
      if (!resolvedSignOff) resolvedSignOff = ctx.emailSignOff || ''
    }

    const toneVoice = extractToneOfVoice(contextPrompt)
    const systemPrompt = buildEmailSystemPrompt(sequence_config.email_type, resolvedSignOff, toneVoice)

    const results: ProspectResult[] = []

    // --- Tier 1: Claude writes for prospect #1 ---
    let claudeEmails: EmailStep[] | null = null
    let claudeUserPrompt = ''

    try {
      const tier1 = await tier1Claude(
        prospects[0],
        sequence_config,
        systemPrompt,
        contextPrompt,
        numSteps,
      )
      claudeEmails = tier1.emails
      claudeUserPrompt = tier1.user_prompt
      results.push({
        prospect: { name: prospects[0].name, title: prospects[0].title, company: prospects[0].company },
        tier: 'claude',
        emails: tier1.emails,
        duration_ms: tier1.duration_ms,
      })
    } catch (err) {
      results.push({
        prospect: { name: prospects[0].name, title: prospects[0].title, company: prospects[0].company },
        tier: 'claude',
        emails: [],
        duration_ms: 0,
        error: (err as Error).message,
      })
    }

    // --- Tier 2: Gemini clones style for prospects #2+ (parallel) ---
    if (prospects.length > 1 && claudeEmails) {
      const geminiTasks = prospects.slice(1).map(async (p: ProspectInput) => {
        try {
          const tier2 = await tier2Gemini(
            p,
            prospects[0],
            claudeEmails!,
            sequence_config,
            systemPrompt,
            contextPrompt,
            resolvedSignOff,
            numSteps,
          )
          return {
            prospect: { name: p.name, title: p.title, company: p.company },
            tier: 'gemini' as const,
            emails: tier2.emails,
            duration_ms: tier2.duration_ms,
          }
        } catch (err) {
          return {
            prospect: { name: p.name, title: p.title, company: p.company },
            tier: 'gemini' as const,
            emails: [] as EmailStep[],
            duration_ms: 0,
            error: (err as Error).message,
          }
        }
      })
      const geminiResults = await Promise.all(geminiTasks)
      results.push(...geminiResults)
    } else if (prospects.length > 1 && !claudeEmails) {
      // Claude failed — mark remaining as skipped
      for (const p of prospects.slice(1)) {
        results.push({
          prospect: { name: p.name, title: p.title, company: p.company },
          tier: 'gemini',
          emails: [],
          duration_ms: 0,
          error: 'Skipped: Claude (Tier 1) failed — Gemini needs example emails to clone',
        })
      }
    }

    return jsonResponse({
      system_prompt: systemPrompt,
      user_prompt: claudeUserPrompt,
      results,
    }, req)
  } catch (err) {
    console.error('[test-email-sequence] Error:', err)
    return errorResponse((err as Error).message, req, 500)
  }
})

/**
 * Edge Function: proposal-compose-v2
 *
 * Stage 2 of the V2 proposal generation pipeline.
 *
 * Takes an assembled ProposalContextPayload + optional template schema + style
 * fingerprint, sends them to Claude Sonnet for structured proposal composition,
 * and stores the resulting ProposalSection[] on the proposals row.
 *
 * Pipeline position:
 *   Stage 1 — proposal-assemble-context  (builds ProposalContextPayload)
 *   Stage 2 — proposal-compose-v2        (THIS FUNCTION)
 *   Stage 3 — proposal-deliver           (renders / delivers)
 *
 * Auth: Service-role only (internal pipeline call). JWT verification is
 * disabled at deploy time (--no-verify-jwt).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'
import {
  logAICostEvent,
  checkCreditBalance,
} from '../_shared/costTracking.ts'
import { styleFingerPrintToPromptBlock } from '../_shared/proposalStyleFingerprint.ts'
import type { ProposalContextPayload } from '../_shared/proposalContext.ts'

// =============================================================================
// Constants
// =============================================================================

const MODEL = 'anthropic/claude-3-5-sonnet-20241022'
const MAX_TOKENS = 8192
const TEMPERATURE = 0.3

// =============================================================================
// OpenRouter helper
// =============================================================================

async function getOpenRouterApiKey(supabase: ReturnType<typeof createClient>, userId: string): Promise<string> {
  try {
    const { data: userSettings, error: settingsError } = await supabase
      .from('user_settings')
      .select('ai_provider_keys')
      .eq('user_id', userId)
      .maybeSingle()

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.log('[proposal-compose-v2] Error fetching user settings (non-fatal):', settingsError.message)
    }

    const userKey = userSettings?.ai_provider_keys?.openrouter
    if (userKey && typeof userKey === 'string' && userKey.trim().length > 0) {
      console.log('[proposal-compose-v2] Using user personal OpenRouter key')
      return userKey.trim()
    }
  } catch (err) {
    console.log('[proposal-compose-v2] User OpenRouter key not found, falling back to shared key:', err instanceof Error ? err.message : String(err))
  }

  const sharedKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!sharedKey || sharedKey.trim().length === 0) {
    throw new Error('OPENROUTER_API_KEY not configured. Please add your OpenRouter API key in Settings > AI Provider Settings.')
  }
  console.log('[proposal-compose-v2] Using shared OpenRouter key')
  return sharedKey.trim()
}

// =============================================================================
// Types
// =============================================================================

interface ProposalSection {
  id: string
  type:
    | 'cover'
    | 'executive_summary'
    | 'problem'
    | 'solution'
    | 'approach'
    | 'timeline'
    | 'pricing'
    | 'terms'
    | 'custom'
  title: string
  /** Rich HTML content for this section */
  content: string
  order: number
}

interface TemplateSectionDef {
  type: ProposalSection['type']
  title: string
  description?: string
  required?: boolean
}

interface ComposeRequest {
  proposal_id: string
  /** Pre-assembled context. If omitted, reads from proposals.context_payload. */
  context_payload?: ProposalContextPayload | null
  /** Section schema from a proposal_templates row. If omitted, the default schema is used. */
  template_schema?: TemplateSectionDef[] | null
  user_id: string
  org_id: string
}

// =============================================================================
// Default template schema
// =============================================================================

const DEFAULT_TEMPLATE_SCHEMA: TemplateSectionDef[] = [
  // NOTE: No "cover" section — the PDF template renders the cover page
  // automatically from metadata (title, client name, date, reference).
  {
    type: 'executive_summary',
    title: 'Executive Summary',
    description:
      '2–3 substantial paragraphs. Open by reflecting back the client\'s situation and goals (use their words from the transcript). Then explain what you\'re proposing and why it\'s the right fit. Close with a clear, specific next step (e.g. "We recommend a 30-minute platform walkthrough next Tuesday").',
    required: true,
  },
  {
    type: 'problem',
    title: 'The Challenge',
    description:
      'Restate the client\'s pain points using their EXACT language from the transcript. Quote specific phrases they used. Organise into 2-3 themes. Each theme should be a short paragraph (not just a bullet point). Show you listened.',
    required: true,
  },
  {
    type: 'solution',
    title: 'Our Solution',
    description:
      'Map specific products/services from the offering profile to each pain point above. For each, explain HOW it solves the problem (not just WHAT it is). Use subheadings for each solution component. Include concrete details — feature names, capabilities, integrations.',
    required: true,
  },
  {
    type: 'approach',
    title: 'Our Approach',
    description:
      'Describe the implementation methodology in 3-5 phases. Each phase should have a name, timeframe, and 2-3 sentences describing deliverables and activities. Write in confident prose, not just bullet lists.',
    required: false,
  },
  {
    type: 'timeline',
    title: 'Timeline & Milestones',
    description:
      'Build an HTML <table> with columns: Phase, Deliverable, Target Date, Owner. Derive dates from the deal expected close date if available. Use realistic timeframes. Include 4-6 milestones minimum.',
    required: false,
  },
  {
    type: 'pricing',
    title: 'Investment',
    description:
      'Build a professional HTML <table> with columns: Component, Details, Investment. Use the deal value and offering pricing_models to populate REAL numbers. If deal.value is known, break it into line items that sum to the total. Never use "$XX,XXX" placeholders — use the actual figures, or reasonable estimates based on context.',
    required: true,
  },
  {
    type: 'terms',
    title: 'Terms & Next Steps',
    description:
      'List 3-5 concrete next steps with owners and specific timeframes (e.g. "Review and sign by 15 March 2026"). Include practical terms: contract duration, payment schedule, implementation start. Extract any commitments made during the meeting.',
    required: true,
  },
]

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that a parsed object looks like ProposalSection[].
 * Returns { valid, errors }.
 */
function validateSections(parsed: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!Array.isArray(parsed)) {
    errors.push('Response must be a JSON array')
    return { valid: false, errors }
  }

  const validTypes = new Set([
    'cover',
    'executive_summary',
    'problem',
    'solution',
    'approach',
    'timeline',
    'pricing',
    'terms',
    'custom',
  ])

  parsed.forEach((item, idx) => {
    if (typeof item !== 'object' || item === null) {
      errors.push(`Section ${idx}: must be an object`)
      return
    }
    const s = item as Record<string, unknown>
    if (typeof s.id !== 'string') errors.push(`Section ${idx}: id must be a string`)
    if (typeof s.type !== 'string' || !validTypes.has(s.type as string))
      errors.push(`Section ${idx}: type "${s.type}" is not a valid ProposalSection type`)
    if (typeof s.title !== 'string') errors.push(`Section ${idx}: title must be a string`)
    if (typeof s.content !== 'string') errors.push(`Section ${idx}: content must be a string`)
    if (typeof s.order !== 'number') errors.push(`Section ${idx}: order must be a number`)
  })

  return { valid: errors.length === 0, errors }
}

/**
 * Attempt to parse a ProposalSection[] from a raw AI response string.
 * Handles JSON wrapped in markdown code fences and bare JSON arrays / objects.
 * Falls back gracefully — returns null if nothing usable can be extracted.
 */
function parseAIResponse(raw: string): ProposalSection[] | null {
  // 1. Try to extract JSON from code fences  ```json … ``` or ``` … ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim())
      const candidate = Array.isArray(parsed) ? parsed : parsed.sections
      if (Array.isArray(candidate) && validateSections(candidate).valid) {
        return candidate as ProposalSection[]
      }
    } catch {
      // fall through
    }
  }

  // 2. Try to extract a top-level array
  const arrayMatch = raw.match(/(\[[\s\S]*\])/)
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[1])
      if (Array.isArray(parsed) && validateSections(parsed).valid) {
        return parsed as ProposalSection[]
      }
    } catch {
      // fall through
    }
  }

  // 3. Try to extract an object with a .sections array
  const objMatch = raw.match(/(\{[\s\S]*\})/)
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[1])
      if (Array.isArray(parsed?.sections) && validateSections(parsed.sections).valid) {
        return parsed.sections as ProposalSection[]
      }
    } catch {
      // fall through
    }
  }

  // 4. Last resort: try the whole string as JSON
  try {
    const parsed = JSON.parse(raw.trim())
    const candidate = Array.isArray(parsed) ? parsed : parsed?.sections
    if (Array.isArray(candidate) && validateSections(candidate).valid) {
      return candidate as ProposalSection[]
    }
  } catch {
    // give up
  }

  return null
}

// =============================================================================
// Prompt builders
// =============================================================================

function buildSystemPrompt(
  context: ProposalContextPayload,
  sections: TemplateSectionDef[],
): string {
  const styleBlock = styleFingerPrintToPromptBlock(context.style_fingerprint)

  const sectionDefs = sections
    .map(
      (s, i) =>
        `  ${i + 1}. type: "${s.type}" | title: "${s.title}"${s.required ? ' (required)' : ' (optional)'}` +
        (s.description ? `\n     ${s.description}` : ''),
    )
    .join('\n')

  return `You are a world-class B2B sales proposal writer. You write proposals that close deals — not corporate documents that get ignored. Every section must be persuasive, specific, and grounded in the real context provided.

${styleBlock}

OUTPUT FORMAT:
Return ONLY a valid JSON array of ProposalSection objects. No explanation, markdown fences, or wrapper text.

Each ProposalSection must have these exact fields:
  - id: string (e.g. "section-1", "section-2" …)
  - type: one of "executive_summary" | "problem" | "solution" | "approach" | "timeline" | "pricing" | "terms" | "custom"
  - title: string (the display title for this section)
  - content: string (rich HTML — use <p>, <ul>, <li>, <table>, <strong>, <em>, <h3> etc.)
  - order: number (1-indexed, matching array position)

SECTION DEFINITIONS:
${sectionDefs}

═══════════════════════════════════════════════════════════════
THE 10 RULES OF PROPOSALS THAT CLOSE — FOLLOW ALL OF THESE
═══════════════════════════════════════════════════════════════

1. LEAD WITH THEIR PROBLEM, NOT YOUR SOLUTION.
   The first section is always about THEM. What they told you in the call. Their pain. Their goals. Use their exact words from the transcript. Prove you listened before you pitch.

2. KEEP IT CONCISE.
   Short, dense sections outperform long, watery ones. Every sentence must earn its place.

3. SHOW VALUE BEFORE SHOWING PRICE.
   Build value first: problem, solution, proof, THEN price. Make the executive summary earn the pricing.

4. WRITE IN THE CLIENT'S LANGUAGE.
   Match the tone and vocabulary from the transcript. If they say "grow revenue," don't write "optimize monetization." If they're non-technical, no jargon.

5. INCLUDE SOCIAL PROOF BEFORE PRICING.
   Reference case studies, results, and proof from the offering profile BEFORE the pricing section.

6. ONE DOCUMENT, ONE DECISION.
   The proposal should make exactly one thing clear: what to do next. Don't ask them to "review and get back to us."

7. BUILD IN RISK REVERSAL.
   Phased approaches, pilots, money-back language. Show them the safety net.

8. CREATE URGENCY WITHOUT BEING PUSHY.
   Use real constraints: team availability, pricing validity, market timing. Reference timelines from the call.

9. NEVER USE PLACEHOLDER TEXT.
   NEVER write "[Client Name]", "[Current Date]", "$XX,XXX", "[Date + 10 days]", or any square-bracket placeholder. Use the REAL data from context. If a value isn't available, make a reasonable estimate or omit the detail entirely.

10. MAKE EVERY SECTION SUBSTANTIAL.
    2-4 paragraphs minimum per section. Bullet-point-only sections look lazy. Lead with prose, support with bullets. Each section should demonstrate deep understanding.

═══════════════════════════════════════════════════════════════
CONTEXT USAGE — THIS IS CRITICAL
═══════════════════════════════════════════════════════════════

You will be given real deal context, meeting transcripts, contact profiles, and offering details. USE ALL OF IT:

• TRANSCRIPT: Read the entire transcript carefully. Extract the client's exact pain points, goals, budget signals, timeline, objections, and specific requests. Quote their words in the proposal.
• DEAL DATA: Use the deal value for pricing. Use the company name. Use the close date for timeline.
• CONTACT: Address the proposal to the actual contact by name and title.
• OFFERING PROFILE: Name specific products, services, features, and pricing models. Don't say "our platform" — say the actual product names with specific capabilities.
• ORG PREFERENCES: Use the company name, value propositions, and tone guidelines.

If the transcript mentions specific challenges, requirements, or questions — address EACH ONE in the proposal. The client should feel like you wrote this specifically for them after deeply listening to their call.

═══════════════════════════════════════════════════════════════
HTML FORMATTING
═══════════════════════════════════════════════════════════════

• Use <p> for paragraphs, <ul>/<li> for bullet lists, <ol>/<li> for numbered lists
• Use <table> with <thead>/<tbody>/<tfoot> for pricing and timeline tables
• Use <h3> for sub-headings within sections, <strong> for emphasis
• Do NOT generate a "cover" section — the PDF template renders this automatically
• Content should be valid HTML fragments (no <html>, <body>, or <head> wrappers)`
}

function buildUserPrompt(context: ProposalContextPayload): string {
  const parts: string[] = ['Here is the full context for the proposal:\n']

  // ── Deal context ──────────────────────────────────────────────────────────
  if (context.deal) {
    const d = context.deal
    parts.push('## DEAL CONTEXT')
    parts.push(`- Deal name: ${d.name ?? 'Untitled deal'}`)
    if (d.company) parts.push(`- Company: ${d.company}`)
    if (d.value != null) parts.push(`- Deal value: $${d.value.toLocaleString()}`)
    if (d.stage) parts.push(`- Stage: ${d.stage}`)
    if (d.probability != null) parts.push(`- Win probability: ${d.probability}%`)
    if (d.expected_close_date)
      parts.push(`- Expected close date: ${new Date(d.expected_close_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
    const cfKeys = Object.keys(d.custom_fields ?? {})
    if (cfKeys.length > 0) {
      parts.push('- Custom fields:')
      cfKeys.forEach((k) => parts.push(`    ${k}: ${String(d.custom_fields[k])}`))
    }
    parts.push('')
  }

  // ── Contact profile ───────────────────────────────────────────────────────
  if (context.contact) {
    const c = context.contact
    parts.push('## CONTACT PROFILE')
    if (c.name) parts.push(`- Name: ${c.name}`)
    if (c.title) parts.push(`- Title: ${c.title}`)
    if (c.company) parts.push(`- Company: ${c.company}`)
    if (c.email) parts.push(`- Email: ${c.email}`)
    if (c.metadata && Object.keys(c.metadata).length > 0) {
      parts.push(`- Additional metadata: ${JSON.stringify(c.metadata)}`)
    }
    if (c.recent_activities?.length > 0) {
      parts.push('- Recent activities:')
      c.recent_activities.slice(0, 5).forEach((a) =>
        parts.push(`    [${a.activity_type}] ${a.description ?? '(no description)'} (${new Date(a.created_at).toLocaleDateString()})`)
      )
    }
    parts.push('')
  }

  // ── Meeting transcript / summary ──────────────────────────────────────────
  if (context.meeting) {
    const m = context.meeting
    parts.push('## MEETING CONTEXT')
    if (m.title) parts.push(`- Meeting title: ${m.title}`)
    if (m.scheduled_at)
      parts.push(`- Held on: ${new Date(m.scheduled_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)

    // Always include summary first (concise overview), then transcript (detail)
    if (m.ai_summary) {
      parts.push('\n### MEETING SUMMARY')
      parts.push(m.ai_summary)
    }
    if (m.transcript) {
      parts.push('\n### FULL TRANSCRIPT (read carefully — extract client pain points, goals, budget, timeline)')
      parts.push(m.transcript)
    }
    if (!m.transcript && !m.ai_summary) {
      parts.push('\n(No transcript or summary available for this meeting)')
    }

    if (m.previous_meetings?.length > 0) {
      parts.push('\n### PREVIOUS MEETINGS (conversation history)')
      m.previous_meetings.forEach((pm) => {
        parts.push(`\n#### ${pm.title ?? 'Untitled'} — ${pm.scheduled_at ? new Date(pm.scheduled_at).toLocaleDateString() : 'date unknown'}`)
        if (pm.ai_summary) parts.push(pm.ai_summary)
      })
    }
    parts.push('')
  }

  // ── Offering profile ──────────────────────────────────────────────────────
  if (context.offering_profile) {
    const o = context.offering_profile
    parts.push('## OFFERING PROFILE')
    parts.push(`- Name: ${o.name}`)
    if (o.description) parts.push(`- Description: ${o.description}`)
    if (o.products?.length > 0)
      parts.push(`- Products: ${JSON.stringify(o.products)}`)
    if (o.services?.length > 0)
      parts.push(`- Services: ${JSON.stringify(o.services)}`)
    if (o.pricing_models?.length > 0)
      parts.push(`- Pricing models: ${JSON.stringify(o.pricing_models)}`)
    if (o.differentiators?.length > 0)
      parts.push(`- Differentiators / value props: ${JSON.stringify(o.differentiators)}`)
    if (o.case_studies?.length > 0)
      parts.push(`- Case studies: ${JSON.stringify(o.case_studies)}`)
    parts.push('')
  }

  // ── Org preferences ───────────────────────────────────────────────────────
  const op = context.org_preferences
  if (op.company_name || op.tone_guidelines || op.industry || op.value_propositions?.length > 0) {
    parts.push('## ORG PREFERENCES')
    if (op.company_name) parts.push(`- Our company name: ${op.company_name}`)
    if (op.industry) parts.push(`- Industry: ${op.industry}`)
    if (op.tone_guidelines) parts.push(`- Tone guidelines: ${op.tone_guidelines}`)
    if (op.value_propositions?.length > 0)
      parts.push(`- Value propositions: ${JSON.stringify(op.value_propositions)}`)
    parts.push('')
  }

  parts.push('---')
  parts.push('Now compose the complete proposal as a JSON array of ProposalSection objects.')

  return parts.join('\n')
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req: Request) => {
  // ── CORS preflight ─────────────────────────────────────────────────────────
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  try {
    // ── Parse & validate request body ────────────────────────────────────────
    let body: ComposeRequest
    try {
      body = await req.json() as ComposeRequest
    } catch {
      return errorResponse('Invalid JSON body', req, 400)
    }

    const { proposal_id, user_id, org_id } = body

    if (!proposal_id) return errorResponse('proposal_id is required', req, 400)
    if (!user_id) return errorResponse('user_id is required', req, 400)
    if (!org_id) return errorResponse('org_id is required', req, 400)

    // ── Supabase service-role client ──────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceKey) {
      return errorResponse('Server configuration error: missing Supabase credentials', req, 500)
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // ── Budget / credit check ─────────────────────────────────────────────────
    const creditCheck = await checkCreditBalance(supabase, org_id)
    if (!creditCheck.allowed) {
      return errorResponse(
        creditCheck.message ?? 'Insufficient AI credits. Please top up your balance.',
        req,
        402,
      )
    }

    // ── Load context payload ──────────────────────────────────────────────────
    let context: ProposalContextPayload

    if (body.context_payload) {
      context = body.context_payload
    } else {
      // Read from proposals.context_payload
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .select('context_payload, generation_status')
        .eq('id', proposal_id)
        .maybeSingle()

      if (proposalError) {
        console.error('[proposal-compose-v2] Error loading proposal:', proposalError.message)
        return errorResponse('Failed to load proposal record', req, 500)
      }

      if (!proposal) {
        return errorResponse(`Proposal ${proposal_id} not found`, req, 404)
      }

      if (!proposal.context_payload) {
        return errorResponse(
          'No context_payload found on proposal. Run proposal-assemble-context first.',
          req,
          400,
        )
      }

      context = proposal.context_payload as ProposalContextPayload
    }

    // ── Load template schema ──────────────────────────────────────────────────
    let templateSchema: TemplateSectionDef[]

    if (body.template_schema && body.template_schema.length > 0) {
      templateSchema = body.template_schema
    } else {
      // Try to fetch the default template for this org
      const { data: defaultTemplate } = await supabase
        .from('proposal_templates')
        .select('section_schema')
        .eq('org_id', org_id)
        .eq('is_default', true)
        .maybeSingle()

      if (defaultTemplate?.section_schema && Array.isArray(defaultTemplate.section_schema)) {
        templateSchema = defaultTemplate.section_schema as TemplateSectionDef[]
      } else {
        templateSchema = DEFAULT_TEMPLATE_SCHEMA
      }
    }

    // ── Mark proposal as processing ───────────────────────────────────────────
    await supabase
      .from('proposals')
      .update({ generation_status: 'composing', updated_at: new Date().toISOString() })
      .eq('id', proposal_id)

    // ── Build prompts ─────────────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(context, templateSchema)
    const userPrompt = buildUserPrompt(context)

    // ── Resolve OpenRouter key ────────────────────────────────────────────────
    let openRouterKey: string
    try {
      openRouterKey = await getOpenRouterApiKey(supabase, user_id)
    } catch (err) {
      return errorResponse(
        err instanceof Error ? err.message : 'OpenRouter API key not configured',
        req,
        500,
      )
    }

    console.log(
      `[proposal-compose-v2] Calling ${MODEL} via OpenRouter for proposal ${proposal_id}`,
      `| sections: ${templateSchema.length}`,
      `| deal: ${context.deal?.name ?? 'none'}`,
      `| contact: ${context.contact?.name ?? 'none'}`,
    )

    // ── Call OpenRouter API (OpenAI-compatible) ───────────────────────────────
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://app.use60.com',
        'X-Title': 'Sixty Sales Dashboard - Proposal Compose V2',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      console.error(
        `[proposal-compose-v2] OpenRouter API error ${aiResponse.status}:`,
        errText,
      )

      await supabase
        .from('proposals')
        .update({ generation_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', proposal_id)

      return errorResponse(
        `AI generation failed (${aiResponse.status}): ${errText}`,
        req,
        502,
      )
    }

    const aiData = await aiResponse.json()
    const rawContent: string = aiData?.choices?.[0]?.message?.content ?? ''

    // ── Extract token usage for cost logging ──────────────────────────────────
    const inputTokens: number = aiData.usage?.prompt_tokens ?? 0
    const outputTokens: number = aiData.usage?.completion_tokens ?? 0

    // ── Parse & validate sections ─────────────────────────────────────────────
    const sections = parseAIResponse(rawContent)

    if (!sections || sections.length === 0) {
      console.error(
        '[proposal-compose-v2] Failed to parse ProposalSection[] from AI response. Raw output:',
        rawContent.substring(0, 500),
      )

      await supabase
        .from('proposals')
        .update({ generation_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', proposal_id)

      return errorResponse('AI returned an invalid response structure. Please retry.', req, 500)
    }

    // ── Store result on proposals ─────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('proposals')
      .update({
        sections,
        generation_status: 'composed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal_id)

    if (updateError) {
      console.error(
        '[proposal-compose-v2] Failed to store composed sections:',
        updateError.message,
      )
      return errorResponse('Failed to save composed proposal', req, 500)
    }

    console.log(
      `[proposal-compose-v2] Stored ${sections.length} sections for proposal ${proposal_id}`,
      `| input_tokens: ${inputTokens} | output_tokens: ${outputTokens}`,
    )

    // ── Log AI cost (fire-and-forget — never block the response) ──────────────
    logAICostEvent(
      supabase,
      user_id,
      org_id,
      'openrouter',
      MODEL,
      inputTokens,
      outputTokens,
      'proposal_generation',
      {
        proposal_id,
        sections_count: sections.length,
        model: MODEL,
        pipeline_stage: 'compose-v2',
      },
      { source: 'user_initiated', contextSummary: `Proposal compose: ${context.deal?.name ?? proposal_id}` },
      'proposal-compose-v2',
    ).catch((err) => {
      console.warn('[proposal-compose-v2] Cost logging failed (non-fatal):', err)
    })

    // ── Return success ────────────────────────────────────────────────────────
    return jsonResponse(
      {
        success: true,
        proposal_id,
        sections_count: sections.length,
        model: MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
      req,
      200,
    )
  } catch (err) {
    console.error('[proposal-compose-v2] Unexpected error:', err)
    return errorResponse(
      `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      req,
      500,
    )
  }
})

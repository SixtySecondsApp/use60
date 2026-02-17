import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { fetchWithRetry } from '../_shared/rateLimiter.ts'
import { checkCreditBalance, logAICostEvent, logFlatRateCostEvent } from '../_shared/costTracking.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

const LOG_PREFIX = '[enrich-dynamic-table]'

// Timeout for a single row enrichment (30 seconds)
const ROW_TIMEOUT_MS = 30_000

/**
 * Resolve @column_key references in an enrichment prompt using row data.
 * e.g. "Find news about @company_name" → "Find news about Acme Corp"
 */
function resolveColumnMentions(
  prompt: string,
  rowContext: Record<string, string>
): string {
  return prompt.replace(/@([a-z][a-z0-9_]*)/g, (_match, key) => {
    return rowContext[key] ?? 'N/A'
  })
}

// Maximum rows per invocation to stay within Supabase edge function wall-clock limit (150s)
const BATCH_SIZE = 50

interface EnrichRequest {
  table_id: string
  column_id: string
  row_ids?: string[]
  /** Resume an existing job from where it left off */
  resume_job_id?: string
  /** When true, skip rows where the cell already has status='complete' */
  skip_completed?: boolean
  /** Preview mode: process one row, skip job creation and cell persistence */
  preview_mode?: boolean
  /** Override prompt for preview */
  preview_prompt?: string
  /** Override provider for preview */
  preview_provider?: 'openrouter' | 'anthropic' | 'exa'
  /** Specific row to preview (defaults to first row) */
  preview_row_id?: string
  /** Optional product profile ID for injecting product context into prompts */
  product_profile_id?: string
  /** Optional fact profile ID for resolving ${variable} placeholders in prompts */
  context_profile_id?: string
}

/**
 * Fetch a product profile and build a context string for prompt injection.
 * Returns empty string if product_profile_id is not provided or not found.
 */
async function buildProductContext(
  productProfileId: string | undefined,
  userClient: ReturnType<typeof createClient>
): Promise<string> {
  if (!productProfileId) return ''

  const { data: profile, error } = await userClient
    .from('product_profiles')
    .select('name, description, research_data, research_status')
    .eq('id', productProfileId)
    .maybeSingle()

  if (error || !profile) {
    console.warn(`${LOG_PREFIX} Product profile ${productProfileId} not found or access denied:`, error?.message)
    return ''
  }

  const researchData = (profile.research_data ?? {}) as Record<string, unknown>
  const parts: string[] = [`Product: ${profile.name}`]

  if (profile.description) {
    parts.push(`Description: ${profile.description}`)
  }

  if (researchData.value_propositions) {
    const vp = Array.isArray(researchData.value_propositions)
      ? researchData.value_propositions.join('; ')
      : String(researchData.value_propositions)
    parts.push(`Value Propositions: ${vp}`)
  }

  if (researchData.differentiators) {
    const diff = Array.isArray(researchData.differentiators)
      ? researchData.differentiators.join('; ')
      : String(researchData.differentiators)
    parts.push(`Differentiators: ${diff}`)
  }

  if (researchData.pain_points_solved) {
    const pp = Array.isArray(researchData.pain_points_solved)
      ? researchData.pain_points_solved.join('; ')
      : String(researchData.pain_points_solved)
    parts.push(`Pain Points Solved: ${pp}`)
  }

  return parts.join('\n')
}

/**
 * Resolve ${product_context} placeholder in a prompt string.
 * If product context is empty, removes the placeholder cleanly.
 */
function resolveProductContext(prompt: string, productContext: string): string {
  if (!prompt.includes('${product_context}')) return prompt
  return prompt.replace(/\$\{product_context\}/g, productContext || '')
}

/**
 * Fetch a fact profile and build a flat key-value context for prompt variable resolution.
 * Returns empty Record if profileId is not provided or not found.
 */
async function buildFactProfileContext(
  profileId: string | undefined,
  supabaseClient: ReturnType<typeof createClient>
): Promise<Record<string, string>> {
  if (!profileId) return {}

  const { data: profile, error } = await supabaseClient
    .from('client_fact_profiles')
    .select('research_data, is_org_profile, company_name')
    .eq('id', profileId)
    .maybeSingle()

  if (error || !profile) {
    console.warn(`${LOG_PREFIX} Fact profile ${profileId} not found or error:`, error?.message)
    return {}
  }

  const rd = (profile.research_data ?? {}) as Record<string, unknown>
  const ctx: Record<string, string> = {}

  // Helper: safely stringify a value (arrays joined, objects stringified, primitives as-is)
  const str = (val: unknown): string => {
    if (val == null) return ''
    if (Array.isArray(val)) return val.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ')
    if (typeof val === 'object') return JSON.stringify(val)
    return String(val)
  }

  // company_overview
  const co = rd.company_overview as Record<string, unknown> | undefined
  ctx.company_name = str(co?.name || profile.company_name)
  ctx.tagline = str(co?.tagline)
  ctx.description = str(co?.description)

  // market_position
  const mp = rd.market_position as Record<string, unknown> | undefined
  ctx.industry = str(mp?.industry)
  ctx.target_market = str(mp?.target_market)
  ctx.competitors = str(mp?.competitors)
  ctx.differentiators = str(mp?.differentiators)

  // products_services
  const ps = rd.products_services as Record<string, unknown> | undefined
  ctx.products = str(ps?.products)
  ctx.key_features = str(ps?.key_features)
  ctx.use_cases = str(ps?.use_cases)
  ctx.pricing_model = str(ps?.pricing_model)

  // team_leadership
  const tl = rd.team_leadership as Record<string, unknown> | undefined
  const keyPeople = tl?.key_people as { name: string; title: string }[] | undefined
  ctx.key_people = keyPeople ? keyPeople.map(p => `${p.name} (${p.title})`).join(', ') : ''
  ctx.employee_count = str(tl?.employee_count)
  ctx.employee_range = str(tl?.employee_range)

  // technology
  const tech = rd.technology as Record<string, unknown> | undefined
  ctx.tech_stack = str(tech?.tech_stack)

  // financials
  const fin = rd.financials as Record<string, unknown> | undefined
  ctx.revenue_range = str(fin?.revenue_range)
  ctx.funding_status = str(fin?.funding_status)

  // ideal_customer_indicators
  const ici = rd.ideal_customer_indicators as Record<string, unknown> | undefined
  ctx.value_propositions = str(ici?.value_propositions)
  ctx.pain_points = str(ici?.pain_points)
  ctx.buying_signals = str(ici?.buying_signals)

  // Remove empty-string entries
  for (const key of Object.keys(ctx)) {
    if (!ctx[key]) delete ctx[key]
  }

  return ctx
}

/**
 * Resolve ${variable_name} placeholders in a prompt using fact profile context.
 * Skips ${product_context} (handled separately) and @column_key references.
 */
function resolveFactProfileContext(prompt: string, context: Record<string, string>): string {
  if (Object.keys(context).length === 0) return prompt
  return prompt.replace(/\$\{([a-z][a-z0-9_]*)\}/g, (_match, varName) => {
    // Don't replace ${product_context} — that's handled by resolveProductContext
    if (varName === 'product_context') return _match
    return context[varName] ?? _match
  })
}

/**
 * Resolve the fact profile ID to use for context, with fallback chain:
 * 1. Explicit context_profile_id from request body
 * 2. Table's context_profile_id column
 * 3. Org's is_org_profile=true profile
 * 4. null (skip fact profile context)
 */
async function resolveContextProfileId(
  bodyProfileId: string | undefined,
  tableId: string,
  orgId: string | null,
  serviceClient: ReturnType<typeof createClient>
): Promise<string | undefined> {
  // 1. Explicit from request body
  if (bodyProfileId) return bodyProfileId

  // 2. From the table's context_profile_id column
  const { data: tableRow } = await serviceClient
    .from('dynamic_tables')
    .select('context_profile_id')
    .eq('id', tableId)
    .maybeSingle()

  if (tableRow?.context_profile_id) return tableRow.context_profile_id as string

  // 3. Org's default org profile
  if (orgId) {
    const { data: orgProfile } = await serviceClient
      .from('client_fact_profiles')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_org_profile', true)
      .maybeSingle()

    if (orgProfile?.id) return orgProfile.id as string
  }

  // 4. No fact profile context
  return undefined
}

interface JobSummary {
  job_id: string
  status: 'complete' | 'failed' | 'running'
  total_rows: number
  processed_rows: number
  failed_rows: number
  /** True if more rows remain to be processed */
  has_more: boolean
  /** The row_index of the last processed row — used for batch resumption */
  last_processed_row_index: number
}

interface IntentSignal {
  signal: string
  strength: 'high' | 'medium' | 'context'
  evidence?: string
}

interface ExaCitation {
  title?: string
  url?: string
}

interface ExaAnswerResponse {
  answer?: string
  citations?: ExaCitation[]
}

interface AICallResult {
  text: string
  inputTokens: number
  outputTokens: number
}

interface ExtractionResult {
  data: Record<string, unknown>
  inputTokens: number
  outputTokens: number
}

// Credit costs per API call
const EXA_ENRICHMENT_CREDIT_COST = 0.2

/**
 * Determine confidence score based on the AI response content.
 *
 * - Contains "N/A", "unknown", "unclear", "not available", "cannot determine" → 0.3
 * - Short, definitive answer (≤ 120 chars, no hedging language) → 0.9
 * - Otherwise → 0.7
 */
function scoreConfidence(text: string): number {
  const lower = text.toLowerCase().trim()

  const uncertainPatterns = [
    'n/a',
    'unknown',
    'unclear',
    'not available',
    'cannot determine',
    'unable to determine',
    'no information',
    'not enough information',
    'i don\'t know',
    'i cannot',
    'insufficient data',
  ]

  for (const pattern of uncertainPatterns) {
    if (lower.includes(pattern)) {
      return 0.3
    }
  }

  const hedgingPatterns = [
    'might be',
    'could be',
    'possibly',
    'perhaps',
    'it seems',
    'likely',
    'probably',
    'i think',
    'may be',
    'not certain',
    'not sure',
  ]

  const hasHedging = hedgingPatterns.some((p) => lower.includes(p))

  if (!hasHedging && text.trim().length <= 120) {
    return 0.9
  }

  return 0.7
}

/**
 * Call Claude API directly (fallback when no OpenRouter model specified).
 * Returns the text content or throws on error/timeout.
 */
async function callClaude(prompt: string, apiKey: string): Promise<AICallResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ROW_TIMEOUT_MS)

  try {
    const response = await fetchWithRetry(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
      {
        maxRetries: 3,
        baseDelayMs: 2000,
        signal: controller.signal,
        logPrefix: LOG_PREFIX,
      }
    )

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Claude API error ${response.status}: ${errorBody}`)
    }

    const data = await response.json()
    const textBlock = data.content?.find(
      (block: { type: string; text?: string }) => block.type === 'text'
    )

    if (!textBlock?.text) {
      throw new Error('No text content in Claude response')
    }

    return {
      text: textBlock.text.trim(),
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Call OpenRouter API with a specified model.
 * OpenRouter uses OpenAI-compatible API format.
 */
async function callOpenRouter(prompt: string, apiKey: string, modelId: string): Promise<AICallResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ROW_TIMEOUT_MS)

  try {
    const response = await fetchWithRetry(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://app.use60.com',
          'X-Title': 'use60 Sales Intelligence',
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
      {
        maxRetries: 3,
        baseDelayMs: 2000,
        signal: controller.signal,
        logPrefix: LOG_PREFIX,
      }
    )

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('No content in OpenRouter response')
    }

    return {
      text: content.trim(),
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Call Exa answer endpoint and return answer + citations.
 */
async function callExaAnswer(prompt: string, apiKey: string): Promise<ExaAnswerResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ROW_TIMEOUT_MS)

  try {
    const response = await fetchWithRetry(
      'https://api.exa.ai/answer',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          query: prompt,
          text: true,
        }),
      },
      {
        maxRetries: 3,
        baseDelayMs: 2000,
        signal: controller.signal,
        logPrefix: LOG_PREFIX,
      }
    )

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Exa API error ${response.status}: ${errorBody}`)
    }

    const data = (await response.json()) as ExaAnswerResponse
    return data
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Post-process an Exa answer through Claude to extract structured JSON
 * according to a user-defined schema.
 */
async function callClaudeForExtraction(
  exaAnswer: string,
  citations: ExaCitation[],
  schema: { fields: { name: string; type: string; description: string }[] },
  apiKey: string
): Promise<ExtractionResult> {
  const prompt = `Extract structured data from this web research result.

RESEARCH RESULT:
${exaAnswer}

SOURCES:
${citations.map(c => `- ${c.title}: ${c.url}`).join('\n')}

Extract the following fields as JSON:
${schema.fields.map(f => `- "${f.name}" (${f.type}): ${f.description}`).join('\n')}

Return ONLY a valid JSON object with these field names as keys. Use null for any field you cannot determine.`

  const result = await callClaude(prompt, apiKey)
  try {
    const cleaned = result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    return { data: JSON.parse(cleaned), inputTokens: result.inputTokens, outputTokens: result.outputTokens }
  } catch {
    return { data: { _raw: result.text }, inputTokens: result.inputTokens, outputTokens: result.outputTokens }
  }
}

function deriveIntentSignals(answer: string, citations: ExaCitation[]): IntentSignal[] {
  const lowered = answer.toLowerCase()
  const signals: IntentSignal[] = []

  if (lowered.includes('hiring') || lowered.includes('headcount growth')) {
    signals.push({
      signal: 'Hiring momentum indicates active GTM investment',
      strength: 'high',
      evidence: 'Answer text references hiring or team expansion.',
    })
  }
  if (lowered.includes('funding') || lowered.includes('series ')) {
    signals.push({
      signal: 'Recent funding suggests budget availability',
      strength: 'high',
      evidence: 'Answer text references funding activity.',
    })
  }
  if (lowered.includes('expansion') || lowered.includes('new market')) {
    signals.push({
      signal: 'Expansion activity suggests near-term tooling demand',
      strength: 'medium',
      evidence: 'Answer text references expansion/new market entry.',
    })
  }
  if (citations.length > 0) {
    signals.push({
      signal: 'Multiple external sources available for outreach personalization',
      strength: 'medium',
      evidence: `Found ${citations.length} citation source(s).`,
    })
  }

  if (signals.length === 0) {
    signals.push({
      signal: 'No strong intent pattern detected; monitor for new triggers',
      strength: 'context',
    })
  }

  return signals.slice(0, 4)
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)
  const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' }

  try {
    // -----------------------------------------------------------------
    // 1. Authenticate user
    // -----------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: JSON_HEADERS }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY') ?? ''
    const exaApiKey = Deno.env.get('EXA_API_KEY') ?? ''

    // At least one AI provider must be configured
    if (!anthropicApiKey && !openrouterApiKey) {
      console.error(`${LOG_PREFIX} No AI provider configured (ANTHROPIC_API_KEY or OPENROUTER_API_KEY)`)
      return new Response(
        JSON.stringify({ error: 'AI enrichment is not configured' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }

    // User-scoped client for auth verification only
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()

    if (authError || !user) {
      console.error(`${LOG_PREFIX} Auth error:`, authError?.message)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: JSON_HEADERS }
      )
    }

    // Service role client for all DB writes
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    // -----------------------------------------------------------------
    // 2. Parse and validate request
    // -----------------------------------------------------------------
    const body = (await req.json()) as EnrichRequest

    if (!body.table_id || !body.column_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: table_id, column_id' }),
        { status: 400, headers: JSON_HEADERS }
      )
    }

    const { table_id, column_id, row_ids, resume_job_id, skip_completed } = body

    // Verify the table exists and user has access (use user client for RLS check)
    const { data: table, error: tableError } = await userClient
      .from('dynamic_tables')
      .select('id, organization_id, created_by')
      .eq('id', table_id)
      .maybeSingle()

    if (tableError || !table) {
      console.error(`${LOG_PREFIX} Table not found or access denied:`, tableError?.message)
      return new Response(
        JSON.stringify({ error: 'Table not found or access denied' }),
        { status: 404, headers: JSON_HEADERS }
      )
    }

    const orgId = table.organization_id as string | null

    // -----------------------------------------------------------------
    // 2a. Credit balance check
    // -----------------------------------------------------------------
    if (orgId) {
      const creditCheck = await checkCreditBalance(serviceClient, orgId)
      if (!creditCheck.allowed) {
        console.warn(`${LOG_PREFIX} Credit check failed for org ${orgId}: ${creditCheck.message}`)
        return new Response(
          JSON.stringify({ error: creditCheck.message || 'Insufficient credits' }),
          { status: 402, headers: JSON_HEADERS }
        )
      }
    }

    // -----------------------------------------------------------------
    // 2b. Fetch product context (optional — non-breaking)
    // -----------------------------------------------------------------
    const productContext = await buildProductContext(body.product_profile_id, userClient)
    if (productContext) {
      console.log(`${LOG_PREFIX} Product context loaded for profile ${body.product_profile_id}`)
    }

    // -----------------------------------------------------------------
    // 2b2. Fetch fact profile context (optional — non-breaking)
    // Fallback chain: request body → table column → org default → skip
    // -----------------------------------------------------------------
    let factProfileContext: Record<string, string> = {}
    try {
      const resolvedProfileId = await resolveContextProfileId(
        body.context_profile_id,
        table_id,
        orgId,
        serviceClient
      )
      if (resolvedProfileId) {
        factProfileContext = await buildFactProfileContext(resolvedProfileId, serviceClient)
        const keyCount = Object.keys(factProfileContext).length
        if (keyCount > 0) {
          console.log(`${LOG_PREFIX} Fact profile context loaded: ${keyCount} variables from profile ${resolvedProfileId}`)
        } else {
          console.log(`${LOG_PREFIX} Fact profile ${resolvedProfileId} found but no context variables extracted`)
        }
      }
    } catch (factErr) {
      console.warn(`${LOG_PREFIX} Fact profile context resolution failed (non-fatal):`, factErr instanceof Error ? factErr.message : factErr)
      // Non-fatal: continue without fact profile context
    }

    // -----------------------------------------------------------------
    // 2c. Preview mode — process one row, skip column/job/cell persistence
    // -----------------------------------------------------------------
    if (body.preview_mode) {
      const previewPrompt = body.preview_prompt
      if (!previewPrompt?.trim()) {
        return new Response(
          JSON.stringify({ error: 'preview_prompt is required for preview mode' }),
          { status: 400, headers: JSON_HEADERS }
        )
      }

      const previewProvider = body.preview_provider ?? 'anthropic'
      const previewUseExa = previewProvider === 'exa'
      const previewUseOpenRouter = previewProvider === 'openrouter'

      // Validate API key for selected provider
      if (previewUseExa && !exaApiKey) {
        return new Response(JSON.stringify({ error: 'Exa is not configured' }), { status: 500, headers: JSON_HEADERS })
      }
      if (previewUseOpenRouter && !openrouterApiKey) {
        return new Response(JSON.stringify({ error: 'OpenRouter is not configured' }), { status: 500, headers: JSON_HEADERS })
      }
      if (!previewUseExa && !previewUseOpenRouter && !anthropicApiKey) {
        return new Response(JSON.stringify({ error: 'Anthropic is not configured' }), { status: 500, headers: JSON_HEADERS })
      }

      // Fetch one row (specific or first in table)
      let previewRowQuery = serviceClient
        .from('dynamic_table_rows')
        .select('id, row_index')
        .eq('table_id', table_id)
        .order('row_index', { ascending: true })
        .limit(1)

      if (body.preview_row_id) {
        previewRowQuery = serviceClient
          .from('dynamic_table_rows')
          .select('id, row_index')
          .eq('id', body.preview_row_id)
          .eq('table_id', table_id)
          .limit(1)
      }

      const { data: previewRows, error: previewRowError } = await previewRowQuery
      if (previewRowError || !previewRows || previewRows.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No rows available for preview' }),
          { status: 404, headers: JSON_HEADERS }
        )
      }

      const previewRow = previewRows[0]

      // Fetch all columns for context
      const { data: prevAllColumns } = await serviceClient
        .from('dynamic_table_columns')
        .select('id, key')
        .eq('table_id', table_id)

      // Build row context
      const { data: prevCells } = await serviceClient
        .from('dynamic_table_cells')
        .select('column_id, value')
        .eq('row_id', previewRow.id)

      const prevColMap: Record<string, string> = {}
      for (const col of prevAllColumns ?? []) {
        prevColMap[col.id] = col.key
      }
      const prevRowContext: Record<string, string> = {}
      for (const cell of prevCells ?? []) {
        const key = prevColMap[cell.column_id]
        if (key && cell.value != null) {
          prevRowContext[key] = cell.value
        }
      }

      const resolvedPreviewPrompt = resolveProductContext(
        resolveFactProfileContext(
          resolveColumnMentions(previewPrompt, prevRowContext),
          factProfileContext
        ),
        productContext
      )

      try {
        let answer = ''
        let sources: { title?: string; url?: string }[] = []
        let intentSignals: IntentSignal[] = []

        let previewCreditsConsumed = 0

        if (previewUseExa) {
          const exaProductCtx = productContext ? `\n\nProduct context: ${productContext}` : ''
          const exaQuery = `${resolvedPreviewPrompt}\n\nEntity data: ${JSON.stringify(prevRowContext)}${exaProductCtx}`
          const exaResult = await callExaAnswer(exaQuery, exaApiKey)
          answer = typeof exaResult.answer === 'string' ? exaResult.answer.trim() : 'N/A'
          sources = Array.isArray(exaResult.citations)
            ? exaResult.citations.map(c => ({ title: c.title, url: c.url })).slice(0, 6)
            : []
          intentSignals = deriveIntentSignals(answer, exaResult.citations ?? [])

          // Log Exa cost
          if (orgId) {
            await logFlatRateCostEvent(serviceClient, user.id, orgId, 'exa', 'exa-answer', EXA_ENRICHMENT_CREDIT_COST, 'exa_enrichment', { table_id, preview: true })
            previewCreditsConsumed += EXA_ENRICHMENT_CREDIT_COST
          }
        } else {
          const productSection = productContext
            ? `\n\nPRODUCT CONTEXT:\n${productContext}\n`
            : ''
          const prompt = `You are a data enrichment agent. Given the following information about a person/company, complete the requested enrichment task.

PERSON/COMPANY DATA:
${JSON.stringify(prevRowContext, null, 2)}${productSection}

ENRICHMENT TASK:
${resolvedPreviewPrompt}

RESPONSE FORMAT:
Respond with a JSON object containing two fields:
- "answer": Your concise, factual enrichment result (string). If you cannot determine the answer, use "N/A".
- "sources": An array of sources you used. Each source is an object with "title" (short description) and optionally "url" (if a specific web URL is known). If no sources, use an empty array.

Respond with ONLY the JSON object, no markdown or extra text.`

          const aiResult = previewUseOpenRouter
            ? await callOpenRouter(prompt, openrouterApiKey, 'google/gemini-3-flash-preview')
            : await callClaude(prompt, anthropicApiKey)

          answer = aiResult.text
          try {
            const cleaned = aiResult.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
            const parsed = JSON.parse(cleaned)
            if (parsed && typeof parsed.answer === 'string') {
              answer = parsed.answer
              sources = Array.isArray(parsed.sources) ? parsed.sources : []
            }
          } catch {
            // plain text response
          }

          // Log LLM cost
          if (orgId && (aiResult.inputTokens > 0 || aiResult.outputTokens > 0)) {
            const provider = previewUseOpenRouter ? 'openrouter' as const : 'anthropic' as const
            const model = previewUseOpenRouter ? 'google/gemini-3-flash-preview' : 'claude-sonnet-4-20250514'
            await logAICostEvent(serviceClient, user.id, orgId, provider, model, aiResult.inputTokens, aiResult.outputTokens, 'enrichment', { table_id, preview: true })
          }
        }

        const confidence = scoreConfidence(answer)

        return new Response(
          JSON.stringify({
            answer,
            sources,
            intent_signals: intentSignals,
            confidence,
            row_context: prevRowContext,
            credits_consumed: previewCreditsConsumed,
          }),
          { status: 200, headers: JSON_HEADERS }
        )
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Preview failed'
        console.error(`${LOG_PREFIX} Preview error:`, msg)
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 500, headers: JSON_HEADERS }
        )
      }
    }

    // Verify the column exists, belongs to this table, and is an enrichment column
    const { data: column, error: columnError } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, key, label, is_enrichment, enrichment_prompt, enrichment_model, enrichment_provider, enrichment_schema, enrichment_pack_id')
      .eq('id', column_id)
      .eq('table_id', table_id)
      .maybeSingle()

    if (columnError || !column) {
      console.error(`${LOG_PREFIX} Column not found:`, columnError?.message)
      return new Response(
        JSON.stringify({ error: 'Column not found for this table' }),
        { status: 404, headers: JSON_HEADERS }
      )
    }

    if (!column.is_enrichment) {
      return new Response(
        JSON.stringify({ error: 'Column is not an enrichment column' }),
        { status: 400, headers: JSON_HEADERS }
      )
    }

    const enrichmentPrompt = column.enrichment_prompt
    if (!enrichmentPrompt) {
      return new Response(
        JSON.stringify({ error: 'Column has no enrichment prompt configured' }),
        { status: 400, headers: JSON_HEADERS }
      )
    }

    // Detect if this column is part of a pack (multi-column enrichment group)
    const packId = column.enrichment_pack_id as string | null
    let packColumns: typeof column[] = []

    if (packId) {
      const { data: siblings } = await serviceClient
        .from('dynamic_table_columns')
        .select('id, key, label, enrichment_prompt, enrichment_schema, enrichment_pack_id, position')
        .eq('table_id', table_id)
        .eq('enrichment_pack_id', packId)
        .order('position', { ascending: true })

      packColumns = siblings ?? []
      console.log(`${LOG_PREFIX} Pack "${packId}" detected with ${packColumns.length} sibling columns`)
    }

    const isPackEnrichment = packId !== null && packColumns.length > 1

    // Determine which AI provider to use
    const enrichmentModel = column.enrichment_model as string | null
    const configuredProvider = (column.enrichment_provider as string | null)?.toLowerCase() ?? null
    const useExa = configuredProvider === 'exa'
    const useAnthropic = configuredProvider === 'anthropic'
    const useOpenRouter = Boolean(!useExa && !useAnthropic && enrichmentModel && openrouterApiKey)

    // Validate we have the required API key for the selected provider
    if (useExa && !exaApiKey) {
      console.error(`${LOG_PREFIX} Exa provider selected but EXA_API_KEY not configured`)
      return new Response(
        JSON.stringify({ error: 'Exa is not configured' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }
    if (!useExa && !useAnthropic && useOpenRouter && !openrouterApiKey) {
      console.error(`${LOG_PREFIX} OpenRouter model specified but OPENROUTER_API_KEY not configured`)
      return new Response(
        JSON.stringify({ error: 'OpenRouter is not configured' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }
    if (!useExa && !useOpenRouter && !anthropicApiKey) {
      console.error(`${LOG_PREFIX} No model specified and ANTHROPIC_API_KEY not configured`)
      return new Response(
        JSON.stringify({ error: 'Default AI provider (Anthropic) is not configured' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }

    const providerLabel = useExa
      ? 'Exa answer'
      : useOpenRouter
        ? `OpenRouter (${enrichmentModel})`
        : 'Anthropic Claude'
    console.log(`${LOG_PREFIX} Using AI provider: ${providerLabel}`)

    // Track total credits consumed across this batch
    let totalCreditsConsumed = 0

    // -----------------------------------------------------------------
    // 3. Fetch rows to enrich (with batch limits)
    // -----------------------------------------------------------------

    // If resuming, fetch the existing job to get the last processed position
    let resumeFromIndex = 0
    let existingJobProcessed = 0
    let existingJobFailed = 0

    if (resume_job_id) {
      const { data: existingJob, error: jobFetchError } = await serviceClient
        .from('enrichment_jobs')
        .select('id, last_processed_row_index, processed_rows, failed_rows, total_rows, status')
        .eq('id', resume_job_id)
        .maybeSingle()

      if (jobFetchError || !existingJob) {
        console.error(`${LOG_PREFIX} Failed to fetch resume job:`, jobFetchError?.message)
        return new Response(
          JSON.stringify({ error: 'Resume job not found' }),
          { status: 404, headers: JSON_HEADERS }
        )
      }

      if (existingJob.status !== 'running') {
        return new Response(
          JSON.stringify({ error: `Cannot resume job with status: ${existingJob.status}` }),
          { status: 400, headers: JSON_HEADERS }
        )
      }

      resumeFromIndex = existingJob.last_processed_row_index ?? 0
      existingJobProcessed = existingJob.processed_rows ?? 0
      existingJobFailed = existingJob.failed_rows ?? 0
      console.log(`${LOG_PREFIX} Resuming job ${resume_job_id} from row_index > ${resumeFromIndex}`)
    }

    // Fetch rows — either specific row_ids or next batch by row_index
    let rowsQuery = serviceClient
      .from('dynamic_table_rows')
      .select('id, row_index')
      .eq('table_id', table_id)
      .order('row_index', { ascending: true })

    if (row_ids && row_ids.length > 0) {
      rowsQuery = rowsQuery.in('id', row_ids)
    }

    if (resumeFromIndex > 0) {
      rowsQuery = rowsQuery.gt('row_index', resumeFromIndex)
    }

    // Limit to BATCH_SIZE rows per invocation
    rowsQuery = rowsQuery.limit(BATCH_SIZE)

    const { data: rawRows, error: rowsError } = await rowsQuery

    // Filter out already-completed rows when skip_completed is enabled
    let rows = rawRows ?? []
    if (skip_completed && rows.length > 0) {
      const rowIdList = rows.map((r) => r.id)
      const { data: completedCells } = await serviceClient
        .from('dynamic_table_cells')
        .select('row_id')
        .in('row_id', rowIdList)
        .eq('column_id', column_id)
        .eq('status', 'complete')

      if (completedCells && completedCells.length > 0) {
        const completedRowIds = new Set(completedCells.map((c) => c.row_id))
        rows = rows.filter((r) => !completedRowIds.has(r.id))
        console.log(`${LOG_PREFIX} skip_completed: filtered out ${completedCells.length} already-complete rows, ${rows.length} remaining`)
      }
    }

    if (rowsError || rows.length === 0) {
      // If resuming and no more rows, the job is complete
      if (resume_job_id) {
        const finalStatus = existingJobFailed > 0 && existingJobProcessed === 0 ? 'failed' : 'complete'
        await serviceClient
          .from('enrichment_jobs')
          .update({
            status: finalStatus,
            completed_at: new Date().toISOString(),
          })
          .eq('id', resume_job_id)

        const summary: JobSummary = {
          job_id: resume_job_id,
          status: finalStatus,
          total_rows: existingJobProcessed + existingJobFailed,
          processed_rows: existingJobProcessed,
          failed_rows: existingJobFailed,
          has_more: false,
          last_processed_row_index: resumeFromIndex,
        }
        return new Response(JSON.stringify(summary), { status: 200, headers: JSON_HEADERS })
      }

      console.error(`${LOG_PREFIX} No rows found:`, rowsError?.message)
      return new Response(
        JSON.stringify({ error: 'No rows found to enrich' }),
        { status: 404, headers: JSON_HEADERS }
      )
    }

    // Count total remaining rows (for progress tracking on new jobs)
    let totalRowCount = rows.length
    if (!resume_job_id && !row_ids) {
      if (skip_completed) {
        // Count only non-complete rows across the whole table
        const { count: allRowCount } = await serviceClient
          .from('dynamic_table_rows')
          .select('id', { count: 'exact', head: true })
          .eq('table_id', table_id)

        const { count: completedCount } = await serviceClient
          .from('dynamic_table_cells')
          .select('row_id', { count: 'exact', head: true })
          .eq('column_id', column_id)
          .eq('status', 'complete')

        totalRowCount = (allRowCount ?? rows.length) - (completedCount ?? 0)
        if (totalRowCount < 0) totalRowCount = rows.length
      } else {
        const { count } = await serviceClient
          .from('dynamic_table_rows')
          .select('id', { count: 'exact', head: true })
          .eq('table_id', table_id)

        totalRowCount = count ?? rows.length
      }
    } else if (row_ids && row_ids.length > 0) {
      totalRowCount = row_ids.length
    }

    console.log(`${LOG_PREFIX} Processing batch of ${rows.length} rows (total: ${totalRowCount}) for column "${column.label}"`)

    // -----------------------------------------------------------------
    // 4. Fetch all columns for this table (to build row context)
    // -----------------------------------------------------------------
    const { data: allColumns, error: allColumnsError } = await serviceClient
      .from('dynamic_table_columns')
      .select('id, key, label')
      .eq('table_id', table_id)
      .order('position', { ascending: true })

    if (allColumnsError || !allColumns) {
      console.error(`${LOG_PREFIX} Failed to fetch columns:`, allColumnsError?.message)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch table columns' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }

    // Build column ID → key/label maps
    const columnIdToKey: Record<string, string> = {}
    const columnIdToLabel: Record<string, string> = {}
    for (const col of allColumns) {
      columnIdToKey[col.id] = col.key
      columnIdToLabel[col.id] = col.label
    }

    // -----------------------------------------------------------------
    // 5. Fetch existing cells for all rows (to build context per row)
    // -----------------------------------------------------------------
    const rowIdList = rows.map((r) => r.id)

    const { data: existingCells, error: cellsError } = await serviceClient
      .from('dynamic_table_cells')
      .select('row_id, column_id, value')
      .in('row_id', rowIdList)

    if (cellsError) {
      console.error(`${LOG_PREFIX} Failed to fetch existing cells:`, cellsError.message)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch existing cell data' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }

    // Build a map: row_id → { column_key: value, ... }
    const rowContextMap: Record<string, Record<string, string>> = {}
    for (const cell of existingCells || []) {
      const key = columnIdToKey[cell.column_id]
      if (!key) continue
      if (!rowContextMap[cell.row_id]) {
        rowContextMap[cell.row_id] = {}
      }
      if (cell.value != null) {
        rowContextMap[cell.row_id][key] = cell.value
      }
    }

    // -----------------------------------------------------------------
    // 6. Create or resume enrichment job
    // -----------------------------------------------------------------
    let jobId: string

    if (resume_job_id) {
      jobId = resume_job_id
      console.log(`${LOG_PREFIX} Resuming enrichment job: ${jobId}`)
    } else {
      const { data: job, error: jobError } = await serviceClient
        .from('enrichment_jobs')
        .insert({
          table_id,
          column_id,
          created_by: user.id,
          status: 'running',
          total_rows: totalRowCount,
          processed_rows: 0,
          failed_rows: 0,
          enrichment_prompt: enrichmentPrompt,
          started_at: new Date().toISOString(),
          batch_size: BATCH_SIZE,
          last_processed_row_index: 0,
        })
        .select('id')
        .single()

      if (jobError || !job) {
        console.error(`${LOG_PREFIX} Failed to create enrichment job:`, jobError?.message)
        return new Response(
          JSON.stringify({ error: 'Failed to create enrichment job' }),
          { status: 500, headers: JSON_HEADERS }
        )
      }

      jobId = job.id
      console.log(`${LOG_PREFIX} Created enrichment job: ${jobId}`)
    }

    // -----------------------------------------------------------------
    // 6b. Mark all batch cells as 'pending' for instant UI feedback
    // -----------------------------------------------------------------
    // When pack enrichment, mark all sibling columns' cells as pending too
    const pendingColumnIds = isPackEnrichment
      ? packColumns.map(c => c.id)
      : [column_id]

    const pendingUpserts = rows.flatMap((row) =>
      pendingColumnIds.map((colId) => ({
        row_id: row.id,
        column_id: colId,
        value: null,
        confidence: null,
        status: 'pending',
        source: 'ai_enrichment',
        error_message: null,
        metadata: null,
      }))
    )

    for (let i = 0; i < pendingUpserts.length; i += 500) {
      const chunk = pendingUpserts.slice(i, i + 500)
      const { error: pendingError } = await serviceClient
        .from('dynamic_table_cells')
        .upsert(chunk, { onConflict: 'row_id,column_id' })
      if (pendingError) {
        console.error(`${LOG_PREFIX} Failed to mark cells as pending:`, pendingError.message)
      }
    }

    console.log(`${LOG_PREFIX} Marked ${pendingUpserts.length} cells as pending${isPackEnrichment ? ` (pack: ${pendingColumnIds.length} columns)` : ''}`)

    // -----------------------------------------------------------------
    // 7. Process rows sequentially (this batch only)
    // -----------------------------------------------------------------
    let processedRows = existingJobProcessed
    let failedRows = existingJobFailed
    let lastRowIndex = resumeFromIndex

    for (const row of rows) {
      const rowContext = rowContextMap[row.id] || {}

      try {
        // Resolve @column_key references, ${variable} fact profile context, and ${product_context}
        const resolvedPrompt = resolveProductContext(
          resolveFactProfileContext(
            resolveColumnMentions(enrichmentPrompt, rowContext),
            factProfileContext
          ),
          productContext
        )

        // ---------------------------------------------------------------
        // Pack enrichment: one Exa+Claude call distributes across all pack columns
        // ---------------------------------------------------------------
        if (useExa && isPackEnrichment) {
          // Build combined schema from all pack sibling columns
          const combinedFields: { name: string; type: string; description: string; _column_id: string }[] = []
          for (const packCol of packColumns) {
            const schema = packCol.enrichment_schema as { fields: { name: string; type: string; description: string }[] } | null
            if (schema?.fields) {
              for (const f of schema.fields) {
                combinedFields.push({ ...f, _column_id: packCol.id })
              }
            }
          }
          const combinedSchema = { fields: combinedFields.map(({ _column_id: _, ...rest }) => rest) }

          // One Exa call
          const exaProductCtx = productContext ? `\n\nProduct context: ${productContext}` : ''
          const exaQuery = `${resolvedPrompt}\n\nEntity data: ${JSON.stringify(rowContext)}${exaProductCtx}`
          const exaResult = await callExaAnswer(exaQuery, exaApiKey)
          const answer = typeof exaResult.answer === 'string' ? exaResult.answer.trim() : 'N/A'
          const sources = Array.isArray(exaResult.citations)
            ? exaResult.citations.map(c => ({ title: c.title, url: c.url })).slice(0, 6)
            : []
          const intentSignals = deriveIntentSignals(answer, exaResult.citations ?? [])

          // Log Exa cost
          if (orgId) {
            await logFlatRateCostEvent(serviceClient, user.id, orgId, 'exa', 'exa-answer', EXA_ENRICHMENT_CREDIT_COST, 'exa_enrichment', { table_id, column_id, row_id: row.id, pack: true })
            totalCreditsConsumed += EXA_ENRICHMENT_CREDIT_COST
          }

          // One Claude extraction with combined schema
          let structured: Record<string, unknown> = {}
          let extractionOk = false
          if (combinedSchema.fields.length > 0 && anthropicApiKey) {
            try {
              const extraction = await callClaudeForExtraction(answer, exaResult.citations ?? [], combinedSchema, anthropicApiKey)
              structured = extraction.data
              extractionOk = !('_raw' in structured)

              // Log Claude extraction cost
              if (orgId && (extraction.inputTokens > 0 || extraction.outputTokens > 0)) {
                await logAICostEvent(serviceClient, user.id, orgId, 'anthropic', 'claude-sonnet-4-20250514', extraction.inputTokens, extraction.outputTokens, 'enrichment_extraction', { table_id, column_id, row_id: row.id, pack: true })
              }
            } catch (schemaErr) {
              console.error(`${LOG_PREFIX} Pack extraction failed for row ${row.id}:`, schemaErr instanceof Error ? schemaErr.message : schemaErr)
            }
          }

          // Distribute each field value to the corresponding pack column's cell
          const packCellUpserts = packColumns.map((packCol) => {
            let fieldValue = answer // fallback: raw answer for every column
            if (extractionOk) {
              const colSchema = packCol.enrichment_schema as { fields: { name: string; type: string; description: string }[] } | null
              const fieldName = colSchema?.fields?.[0]?.name
              if (fieldName && fieldName in structured) {
                const rawVal = structured[fieldName]
                fieldValue = rawVal != null ? String(rawVal) : 'N/A'
              }
            }
            return {
              row_id: row.id,
              column_id: packCol.id,
              value: fieldValue,
              confidence: scoreConfidence(fieldValue),
              source: 'ai_enrichment',
              status: 'complete',
              error_message: null,
              metadata: {
                enrichment_provider: 'exa',
                ...(sources.length > 0 ? { sources } : {}),
                ...(intentSignals.length > 0 ? { intent_signals: intentSignals } : {}),
                ...(extractionOk ? { structured_data: structured } : {}),
                enrichment_pack_id: packId,
              },
            }
          })

          const { error: packUpsertError } = await serviceClient
            .from('dynamic_table_cells')
            .upsert(packCellUpserts, { onConflict: 'row_id,column_id' })

          if (packUpsertError) {
            console.error(`${LOG_PREFIX} Pack cell upsert error for row ${row.id}:`, packUpsertError.message)
            throw new Error(`Pack cell upsert failed: ${packUpsertError.message}`)
          }

          // Insert job result for the driver column
          await serviceClient.from('enrichment_job_results').insert({
            job_id: jobId,
            row_id: row.id,
            result: answer,
            confidence: scoreConfidence(answer),
            source: 'ai_enrichment',
          })

          processedRows++
          lastRowIndex = row.row_index
          await serviceClient
            .from('enrichment_jobs')
            .update({ processed_rows: processedRows, failed_rows: failedRows, last_processed_row_index: lastRowIndex })
            .eq('id', jobId)
          continue // skip the normal single-column flow
        }

        // ---------------------------------------------------------------
        // Standard single-column enrichment
        // ---------------------------------------------------------------

        // Build the prompt
        const productSection = productContext
          ? `\n\nPRODUCT CONTEXT:\n${productContext}\n`
          : ''
        const prompt = `You are a data enrichment agent. Given the following information about a person/company, complete the requested enrichment task.

PERSON/COMPANY DATA:
${JSON.stringify(rowContext, null, 2)}${productSection}

ENRICHMENT TASK:
${resolvedPrompt}

RESPONSE FORMAT:
Respond with a JSON object containing two fields:
- "answer": Your concise, factual enrichment result (string). If you cannot determine the answer, use "N/A".
- "sources": An array of sources you used. Each source is an object with "title" (short description) and optionally "url" (if a specific web URL is known). If no sources, use an empty array.

Example: {"answer": "Series B, raised $50M in Jan 2025", "sources": [{"title": "TechCrunch article on funding round", "url": "https://example.com/article"}]}

Respond with ONLY the JSON object, no markdown or extra text.`

        let answer = ''
        let sources: { title?: string; url?: string }[] = []
        let intentSignals: IntentSignal[] = []
        let structuredData: Record<string, unknown> | null = null
        const enrichmentSchema = column.enrichment_schema as { fields: { name: string; type: string; description: string }[] } | null

        if (useExa) {
          const exaProductCtx = productContext ? `\n\nProduct context: ${productContext}` : ''
          const exaQuery = `${resolvedPrompt}\n\nEntity data: ${JSON.stringify(rowContext)}${exaProductCtx}`
          const exaResult = await callExaAnswer(exaQuery, exaApiKey)
          answer = typeof exaResult.answer === 'string' ? exaResult.answer.trim() : 'N/A'
          sources = Array.isArray(exaResult.citations)
            ? exaResult.citations
                .map((citation) => ({
                  title: citation.title,
                  url: citation.url,
                }))
                .slice(0, 6)
            : []
          intentSignals = deriveIntentSignals(answer, exaResult.citations ?? [])

          // Log Exa cost
          if (orgId) {
            await logFlatRateCostEvent(serviceClient, user.id, orgId, 'exa', 'exa-answer', EXA_ENRICHMENT_CREDIT_COST, 'exa_enrichment', { table_id, column_id, row_id: row.id })
            totalCreditsConsumed += EXA_ENRICHMENT_CREDIT_COST
          }

          // Schema-based structured extraction: Exa answer → Claude post-processing
          if (enrichmentSchema && enrichmentSchema.fields?.length > 0 && anthropicApiKey) {
            try {
              const extraction = await callClaudeForExtraction(answer, exaResult.citations ?? [], enrichmentSchema, anthropicApiKey)
              structuredData = extraction.data

              // Log Claude extraction cost
              if (orgId && (extraction.inputTokens > 0 || extraction.outputTokens > 0)) {
                await logAICostEvent(serviceClient, user.id, orgId, 'anthropic', 'claude-sonnet-4-20250514', extraction.inputTokens, extraction.outputTokens, 'enrichment_extraction', { table_id, column_id, row_id: row.id })
              }
            } catch (schemaErr) {
              console.error(`${LOG_PREFIX} Schema extraction failed for row ${row.id}:`, schemaErr instanceof Error ? schemaErr.message : schemaErr)
              // Non-fatal: continue with unstructured answer
            }
          }
        } else {
          // Call AI provider (OpenRouter if model specified, otherwise Claude)
          const aiResult = useOpenRouter
            ? await callOpenRouter(prompt, openrouterApiKey, enrichmentModel!)
            : await callClaude(prompt, anthropicApiKey)

          // Parse structured response (answer + sources)
          answer = aiResult.text
          try {
            // Strip markdown code fences if present
            const cleaned = aiResult.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
            const parsed = JSON.parse(cleaned)
            if (parsed && typeof parsed.answer === 'string') {
              answer = parsed.answer
              sources = Array.isArray(parsed.sources) ? parsed.sources : []
            }
          } catch {
            // AI returned plain text — use as-is, no sources
          }

          // Log LLM cost
          if (orgId && (aiResult.inputTokens > 0 || aiResult.outputTokens > 0)) {
            const provider = useOpenRouter ? 'openrouter' as const : 'anthropic' as const
            const model = useOpenRouter ? enrichmentModel! : 'claude-sonnet-4-20250514'
            await logAICostEvent(serviceClient, user.id, orgId, provider, model, aiResult.inputTokens, aiResult.outputTokens, 'enrichment', { table_id, column_id, row_id: row.id })
          }
        }

        const confidence = scoreConfidence(answer)
        const cellMetadata = {
          enrichment_provider: useExa ? 'exa' : (useOpenRouter ? 'openrouter' : 'anthropic'),
          ...(sources.length > 0 ? { sources } : {}),
          ...(intentSignals.length > 0 ? { intent_signals: intentSignals } : {}),
          ...(structuredData ? { structured_data: structuredData } : {}),
        }

        // Upsert cell with result (sources in metadata, not in value)
        const { error: upsertError } = await serviceClient
          .from('dynamic_table_cells')
          .upsert(
            {
              row_id: row.id,
              column_id,
              value: answer,
              confidence,
              source: 'ai_enrichment',
              status: 'complete',
              error_message: null,
              metadata: cellMetadata,
            },
            { onConflict: 'row_id,column_id' }
          )

        if (upsertError) {
          console.error(`${LOG_PREFIX} Cell upsert error for row ${row.id}:`, upsertError.message)
          throw new Error(`Cell upsert failed: ${upsertError.message}`)
        }

        // Insert job result
        await serviceClient.from('enrichment_job_results').insert({
          job_id: jobId,
          row_id: row.id,
          result: answer,
          confidence,
          source: 'ai_enrichment',
        })

        processedRows++
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        const isTimeout =
          error instanceof DOMException && error.name === 'AbortError'
        const displayError = isTimeout
          ? 'Enrichment timed out (>30s)'
          : errorMessage

        console.error(
          `${LOG_PREFIX} Row ${row.id} failed:`,
          displayError
        )

        // Mark cell(s) as failed — for pack enrichment, mark all sibling columns
        const failColumnIds = isPackEnrichment ? packColumns.map(c => c.id) : [column_id]
        const failUpserts = failColumnIds.map(colId => ({
          row_id: row.id,
          column_id: colId,
          value: null,
          confidence: null,
          source: 'ai_enrichment',
          status: 'failed',
          error_message: displayError,
          metadata: null,
        }))

        const cellFailResult = await serviceClient
          .from('dynamic_table_cells')
          .upsert(failUpserts, { onConflict: 'row_id,column_id' })

        if (cellFailResult.error) {
          console.error(
            `${LOG_PREFIX} Failed to mark cell as failed for row ${row.id}:`,
            cellFailResult.error.message
          )
        }

        // Insert job result with error
        await serviceClient.from('enrichment_job_results').insert({
          job_id: jobId,
          row_id: row.id,
          result: null,
          confidence: null,
          source: 'ai_enrichment',
          error: displayError,
        })

        failedRows++
      }

      // Track last processed row_index for checkpoint
      lastRowIndex = row.row_index

      // Update job progress after each row (checkpoint)
      await serviceClient
        .from('enrichment_jobs')
        .update({
          processed_rows: processedRows,
          failed_rows: failedRows,
          last_processed_row_index: lastRowIndex,
        })
        .eq('id', jobId)
    }

    // -----------------------------------------------------------------
    // 8. Determine if more rows remain
    // -----------------------------------------------------------------
    // Check if there are rows after the last one we processed
    const { count: remainingCount } = await serviceClient
      .from('dynamic_table_rows')
      .select('id', { count: 'exact', head: true })
      .eq('table_id', table_id)
      .gt('row_index', lastRowIndex)

    const hasMore = (remainingCount ?? 0) > 0 && !row_ids

    // If no more rows (or specific row_ids were given), mark job complete
    if (!hasMore) {
      const allFailed = processedRows === 0 && failedRows > 0
      const finalStatus = allFailed ? 'failed' : 'complete'

      await serviceClient
        .from('enrichment_jobs')
        .update({
          status: finalStatus,
          processed_rows: processedRows,
          failed_rows: failedRows,
          last_processed_row_index: lastRowIndex,
          completed_at: new Date().toISOString(),
          error_message: allFailed ? 'All rows failed enrichment' : null,
        })
        .eq('id', jobId)

      console.log(
        `${LOG_PREFIX} Job ${jobId} ${finalStatus}: ${processedRows} processed, ${failedRows} failed, credits consumed: ${totalCreditsConsumed.toFixed(4)}`
      )
    } else {
      console.log(
        `${LOG_PREFIX} Job ${jobId} batch complete: ${processedRows} processed, ${failedRows} failed, credits consumed: ${totalCreditsConsumed.toFixed(4)}, more rows remain`
      )
    }

    // -----------------------------------------------------------------
    // 9. Return job summary
    // -----------------------------------------------------------------
    const summary: JobSummary & { credits_consumed: number } = {
      job_id: jobId,
      status: hasMore ? 'running' : (processedRows === 0 && failedRows > 0 ? 'failed' : 'complete'),
      total_rows: totalRowCount,
      processed_rows: processedRows,
      failed_rows: failedRows,
      has_more: hasMore,
      last_processed_row_index: lastRowIndex,
      credits_consumed: totalCreditsConsumed,
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: JSON_HEADERS,
    })
  } catch (error) {
    console.error(`${LOG_PREFIX} Unexpected error:`, error)
    return new Response(
      JSON.stringify({
        error: (error as Error).message || 'Internal server error',
      }),
      { status: 500, headers: JSON_HEADERS }
    )
  }
})

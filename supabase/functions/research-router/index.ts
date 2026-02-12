import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts'
import { perplexityAdapter } from '../_shared/providers/perplexityAdapter.ts'
import { exaAdapter } from '../_shared/providers/exaAdapter.ts'
import {
  apifyLinkedInAdapter,
  apifyMapsAdapter,
  apifySerpAdapter,
} from '../_shared/providers/apifyAdapters.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DepthLevel = 'low' | 'medium' | 'high'
type ProviderName = 'perplexity' | 'exa' | 'apify_linkedin' | 'apify_maps' | 'apify_serp'

interface ProviderResult {
  raw_text: string
  sources: Array<{ url: string; title: string }>
  provider: ProviderName
}

interface AgentRun {
  id: string
  agent_column_id: string
  row_id: string
  status: string
  depth_level_used: DepthLevel
  result_text: string | null
  result_structured: Record<string, unknown> | null
  sources: Record<string, unknown>[] | null
  providers_used: string[] | null
  confidence: string | null
  chain_log: Record<string, unknown>[] | null
}

interface AgentColumn {
  id: string
  ops_table_id: string
  organization_id: string
  prompt_template: string
  output_format: string
  research_depth: DepthLevel
  source_preferences: Record<string, boolean>
  auto_route: boolean
}

interface RowData {
  id: string
  source_data: Record<string, unknown> | null
}

interface ChainStep {
  step: number
  provider: ProviderName
  query: string
  results_count: number
  timestamp: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINKEDIN_SIGNALS = ['linkedin', 'profile', 'connections', 'posts', 'experience', 'education']
const LOCATION_SIGNALS = ['address', 'location', 'reviews', 'rating', 'maps', 'business hours']
const DISCOVERY_SIGNALS = ['find', 'list', 'identify', 'discover', 'similar to', 'companies like', 'who are']

// ---------------------------------------------------------------------------
// Provider Ranking & Classification
// ---------------------------------------------------------------------------

/**
 * Classify prompt and return ranked list of providers
 * Uses keyword heuristics to determine best providers for the query
 */
function classifyPromptAndRank(prompt: string): ProviderName[] {
  const lowerPrompt = prompt.toLowerCase()

  // Check for LinkedIn signals
  const hasLinkedInSignal = LINKEDIN_SIGNALS.some(signal => lowerPrompt.includes(signal))
  if (hasLinkedInSignal) {
    return ['apify_linkedin', 'perplexity', 'exa', 'apify_serp']
  }

  // Check for location/maps signals
  const hasLocationSignal = LOCATION_SIGNALS.some(signal => lowerPrompt.includes(signal))
  if (hasLocationSignal) {
    return ['apify_maps', 'apify_serp', 'perplexity', 'exa']
  }

  // Check for discovery signals
  const hasDiscoverySignal = DISCOVERY_SIGNALS.some(signal => lowerPrompt.includes(signal))
  if (hasDiscoverySignal) {
    return ['exa', 'perplexity', 'apify_serp', 'apify_linkedin']
  }

  // Default: general research query
  return ['perplexity', 'exa', 'apify_serp', 'apify_linkedin']
}

/**
 * Hydrate prompt template with row data
 * Replaces {{variable}} with actual values from row source_data
 */
function hydratePrompt(template: string, rowData: Record<string, unknown> | null): string {
  if (!rowData) return template

  let hydrated = template

  // Match {{variable}} patterns
  const variablePattern = /\{\{([^}]+)\}\}/g
  const matches = template.match(variablePattern)

  if (matches) {
    for (const match of matches) {
      // Extract variable name (remove {{ and }})
      const varName = match.slice(2, -2).trim()

      // Try to resolve from rowData (nested paths supported with dot notation)
      const value = resolveNestedPath(rowData, varName)

      if (value !== undefined && value !== null) {
        hydrated = hydrated.replace(match, String(value))
      }
    }
  }

  return hydrated
}

/**
 * Resolve nested path in object (e.g., "company.name" -> obj.company.name)
 */
function resolveNestedPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }

  return current
}

/**
 * Filter ranked providers by source preferences
 */
function filterProvidersByPreferences(
  rankedProviders: ProviderName[],
  sourcePreferences: Record<string, boolean>
): ProviderName[] {
  return rankedProviders.filter(provider => sourcePreferences[provider] !== false)
}

// ---------------------------------------------------------------------------
// LLM Extraction
// ---------------------------------------------------------------------------

interface ExtractionResult {
  answer: string
  confidence: 'high' | 'medium' | 'low'
  sources_cited: string[]
  token_cost: number
}

/**
 * Call Claude Haiku to extract a concise answer from research results
 */
async function extractWithLLM(
  prompt: string,
  rawResults: string,
  outputFormat: string,
  apiKey: string,
  isHighDepth = false
): Promise<ExtractionResult | null> {
  try {
    const systemPrompt = isHighDepth
      ? `You are a senior research analyst for the sales intelligence platform 60.
You have been given research results from multiple sources gathered in sequence.
Synthesize these into a comprehensive, accurate answer.

Rules:
- Cross-reference sources — prefer information confirmed by multiple sources
- Flag any contradictions between sources
- If sources disagree, note the discrepancy and state which source is more authoritative
- Answer only based on the provided research results
- If the answer cannot be determined despite multiple sources, respond with "Not found"
- Do not hallucinate or guess
- Cite which source(s) support each part of your answer (include URLs when available)
- Confidence: rate as high/medium/low — "high" requires corroboration from 2+ sources`
      : `You are a data extraction assistant for the sales intelligence platform 60.
Given the following research results and the user's question, provide a
concise answer in ${outputFormat} format.

Rules:
- Answer only based on the provided research results
- If the answer cannot be determined, respond with "Not found"
- Do not hallucinate or guess
- Cite which source(s) you used (include URLs when available)
- Confidence: rate as high/medium/low based on source quality and directness`

    const userMessage = `Question: ${prompt}

Research results:
${rawResults}

Provide your answer in the following JSON format:
{
  "answer": "your extracted answer here",
  "confidence": "high|medium|low",
  "sources_cited": ["url1", "url2", ...]
}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4.5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[research-router] Anthropic API error:', response.status, errorText)
      return null
    }

    const data = await response.json()
    const contentBlock = data.content?.[0]

    if (!contentBlock || contentBlock.type !== 'text') {
      console.error('[research-router] Unexpected response format from Anthropic')
      return null
    }

    const textContent = contentBlock.text

    // Extract token usage from response
    const usage = data.usage
    const tokenCost = (usage?.input_tokens || 0) + (usage?.output_tokens || 0)

    // Try to parse JSON from the response
    // The LLM might wrap it in markdown code blocks
    const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                     textContent.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      console.error('[research-router] Could not extract JSON from LLM response')
      return null
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0]
    const parsed = JSON.parse(jsonStr) as ExtractionResult

    return {
      answer: parsed.answer || textContent,
      confidence: parsed.confidence || 'low',
      sources_cited: parsed.sources_cited || [],
      token_cost: tokenCost,
    }
  } catch (error) {
    console.error('[research-router] LLM extraction error:', error)
    return null
  }
}

// ---------------------------------------------------------------------------
// Provider Execution
// ---------------------------------------------------------------------------

/**
 * Execute a provider call
 * Handles errors and returns ProviderResult or null
 */
async function executeProvider(
  provider: ProviderName,
  query: string,
  apiKeys: Record<string, string>
): Promise<ProviderResult | null> {
  try {
    switch (provider) {
      case 'perplexity': {
        const apiKey = apiKeys.perplexity
        if (!apiKey) {
          console.warn('[research-router] Missing Perplexity API key')
          return null
        }
        // Use 'medium' depth by default for router calls
        return await perplexityAdapter(query, 'medium', apiKey)
      }

      case 'exa': {
        const apiKey = apiKeys.exa
        if (!apiKey) {
          console.warn('[research-router] Missing Exa API key')
          return null
        }
        return await exaAdapter(query, apiKey)
      }

      case 'apify_serp': {
        const apiKey = apiKeys.apify
        if (!apiKey) {
          console.warn('[research-router] Missing Apify API key')
          return null
        }
        return await apifySerpAdapter(query, apiKey)
      }

      case 'apify_linkedin': {
        const apiKey = apiKeys.apify
        if (!apiKey) {
          console.warn('[research-router] Missing Apify API key')
          return null
        }
        // Try to extract LinkedIn URL from query or fail gracefully
        const urlMatch = query.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s]+/)
        if (!urlMatch) {
          console.warn('[research-router] No LinkedIn URL found in query for apify_linkedin')
          return null
        }
        return await apifyLinkedInAdapter(urlMatch[0], apiKey)
      }

      case 'apify_maps': {
        const apiKey = apiKeys.apify
        if (!apiKey) {
          console.warn('[research-router] Missing Apify API key')
          return null
        }
        // Try to extract business name and location from query
        // For now, use the whole query as business name with empty location
        // This is a simple heuristic - improve as needed
        return await apifyMapsAdapter(query, '', apiKey)
      }

      default:
        console.warn(`[research-router] Unknown provider: ${provider}`)
        return null
    }
  } catch (error) {
    console.error(`[research-router] Provider ${provider} error:`, error)
    return null
  }
}

/**
 * Execute Low Depth strategy
 * Calls single best provider
 */
async function executeLowDepth(
  rankedProviders: ProviderName[],
  query: string,
  apiKeys: Record<string, string>,
  outputFormat: string
): Promise<{
  result_text: string
  sources: Array<{ url: string; title: string; provider: string }>
  providers_used: ProviderName[]
  confidence: 'high' | 'medium' | 'low'
  token_cost?: number
}> {
  // Use rank 1 (best provider)
  const provider = rankedProviders[0]

  const result = await executeProvider(provider, query, apiKeys)

  if (!result) {
    throw new Error(`Failed to get results from provider: ${provider}`)
  }

  // Add provider name to sources
  const sourcesWithProvider = result.sources.map(source => ({
    ...source,
    provider: result.provider,
  }))

  // Try LLM extraction if Anthropic API key is available
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || apiKeys.anthropic
  let extractedAnswer: string | null = null
  let extractedConfidence: 'high' | 'medium' | 'low' = 'medium'
  let citedSources: string[] = []
  let tokenCost: number | undefined = undefined

  if (anthropicKey) {
    const extraction = await extractWithLLM(query, result.raw_text, outputFormat, anthropicKey, false)

    if (extraction) {
      extractedAnswer = extraction.answer
      extractedConfidence = extraction.confidence
      citedSources = extraction.sources_cited
      tokenCost = extraction.token_cost
    }
  }

  // If extraction succeeded, use it; otherwise fall back to raw text
  return {
    result_text: extractedAnswer || result.raw_text,
    sources: sourcesWithProvider,
    providers_used: [result.provider],
    confidence: extractedAnswer ? extractedConfidence : 'low',
    token_cost: tokenCost,
  }
}

/**
 * Execute Medium Depth strategy
 * Calls top 2 providers in parallel and merges results
 */
async function executeMediumDepth(
  rankedProviders: ProviderName[],
  query: string,
  apiKeys: Record<string, string>,
  outputFormat: string
): Promise<{
  result_text: string
  sources: Array<{ url: string; title: string; provider: string }>
  providers_used: ProviderName[]
  confidence: 'high' | 'medium' | 'low'
  token_cost?: number
}> {
  // Use top 2 providers
  const providers = rankedProviders.slice(0, 2)

  // Execute in parallel
  const results = await Promise.all(
    providers.map(provider => executeProvider(provider, query, apiKeys))
  )

  // Filter out null results
  const successfulResults = results.filter((r): r is ProviderResult => r !== null)

  if (successfulResults.length === 0) {
    throw new Error('All providers failed to return results')
  }

  // Merge results with separator
  const mergedText = successfulResults
    .map((result, idx) => {
      return `--- Source ${idx + 1}: ${result.provider} ---\n\n${result.raw_text}`
    })
    .join('\n\n========================================\n\n')

  // Combine all sources
  const allSources = successfulResults.flatMap(result =>
    result.sources.map(source => ({
      ...source,
      provider: result.provider,
    }))
  )

  const providersUsed = successfulResults.map(r => r.provider)

  // Try LLM extraction if Anthropic API key is available
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || apiKeys.anthropic
  let extractedAnswer: string | null = null
  let extractedConfidence: 'high' | 'medium' | 'low' = successfulResults.length >= 2 ? 'high' : 'medium'
  let citedSources: string[] = []
  let tokenCost: number | undefined = undefined

  if (anthropicKey) {
    const extraction = await extractWithLLM(query, mergedText, outputFormat, anthropicKey, false)

    if (extraction) {
      extractedAnswer = extraction.answer
      extractedConfidence = extraction.confidence
      citedSources = extraction.sources_cited
      tokenCost = extraction.token_cost
    }
  }

  // If extraction succeeded, use it; otherwise fall back to merged text
  return {
    result_text: extractedAnswer || mergedText,
    sources: allSources,
    providers_used: providersUsed,
    confidence: extractedAnswer ? extractedConfidence : (successfulResults.length >= 2 ? 'high' : 'medium'),
    token_cost: tokenCost,
  }
}

/**
 * Execute High Depth strategy
 * Builds sequential chain (discovery -> content -> synthesis)
 */
async function executeHighDepth(
  rankedProviders: ProviderName[],
  query: string,
  apiKeys: Record<string, string>,
  outputFormat: string
): Promise<{
  result_text: string
  sources: Array<{ url: string; title: string; provider: string }>
  providers_used: ProviderName[]
  confidence: 'high' | 'medium' | 'low'
  chain_log: ChainStep[]
  token_cost?: number
}> {
  const chainLog: ChainStep[] = []
  const allSources: Array<{ url: string; title: string; provider: string }> = []
  const textSegments: string[] = []

  // Step 1: Discovery phase (use Exa if available, otherwise first provider)
  const discoveryProvider = rankedProviders.includes('exa') ? 'exa' : rankedProviders[0]

  const discoveryResult = await executeProvider(discoveryProvider, query, apiKeys)

  if (discoveryResult) {
    chainLog.push({
      step: 1,
      provider: discoveryResult.provider,
      query,
      results_count: discoveryResult.sources.length,
      timestamp: new Date().toISOString(),
    })

    textSegments.push(`=== Step 1: Discovery (${discoveryResult.provider}) ===\n\n${discoveryResult.raw_text}`)
    allSources.push(...discoveryResult.sources.map(s => ({ ...s, provider: discoveryResult.provider })))
  }

  // Step 2: Content enrichment (use SERP scraper if available)
  const contentProvider = rankedProviders.includes('apify_serp') ? 'apify_serp' : rankedProviders[1] || rankedProviders[0]

  if (contentProvider !== discoveryProvider) {
    const contentResult = await executeProvider(contentProvider, query, apiKeys)

    if (contentResult) {
      chainLog.push({
        step: 2,
        provider: contentResult.provider,
        query,
        results_count: contentResult.sources.length,
        timestamp: new Date().toISOString(),
      })

      textSegments.push(`=== Step 2: Content Enrichment (${contentResult.provider}) ===\n\n${contentResult.raw_text}`)
      allSources.push(...contentResult.sources.map(s => ({ ...s, provider: contentResult.provider })))
    }
  }

  // Step 3: Synthesis phase (use Perplexity for reasoning if available)
  const synthesisProvider = rankedProviders.includes('perplexity') ? 'perplexity' : rankedProviders[2] || rankedProviders[0]

  if (synthesisProvider !== discoveryProvider && synthesisProvider !== contentProvider) {
    const synthesisResult = await executeProvider(synthesisProvider, query, apiKeys)

    if (synthesisResult) {
      chainLog.push({
        step: 3,
        provider: synthesisResult.provider,
        query,
        results_count: synthesisResult.sources.length,
        timestamp: new Date().toISOString(),
      })

      textSegments.push(`=== Step 3: Synthesis (${synthesisResult.provider}) ===\n\n${synthesisResult.raw_text}`)
      allSources.push(...synthesisResult.sources.map(s => ({ ...s, provider: synthesisResult.provider })))
    }
  }

  if (textSegments.length === 0) {
    throw new Error('All chain steps failed')
  }

  const providersUsed = [...new Set(chainLog.map(step => step.provider))] as ProviderName[]

  // Prepare chain results with provider labels for LLM
  const chainResultsForLLM = textSegments.join('\n\n========================================\n\n')

  // Try LLM extraction with high-depth synthesis prompt
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || apiKeys.anthropic
  let extractedAnswer: string | null = null
  let extractedConfidence: 'high' | 'medium' | 'low' = chainLog.length >= 2 ? 'high' : 'medium'
  let citedSources: string[] = []
  let tokenCost: number | undefined = undefined

  if (anthropicKey) {
    const extraction = await extractWithLLM(query, chainResultsForLLM, outputFormat, anthropicKey, true)

    if (extraction) {
      extractedAnswer = extraction.answer
      extractedConfidence = extraction.confidence
      citedSources = extraction.sources_cited
      tokenCost = extraction.token_cost
    }
  }

  // If extraction succeeded, use it; otherwise fall back to chain results
  return {
    result_text: extractedAnswer || chainResultsForLLM,
    sources: allSources,
    providers_used: providersUsed,
    confidence: extractedAnswer ? extractedConfidence : (chainLog.length >= 2 ? 'high' : 'medium'),
    chain_log: chainLog,
    token_cost: tokenCost,
  }
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    // This function is triggered internally by Supabase (not user-facing)
    // Use service role key for all operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // ------------------------------------------------------------------
    // 1. Parse request body
    // ------------------------------------------------------------------
    const body = await req.json() as { agent_run_id: string }
    const { agent_run_id } = body

    if (!agent_run_id || typeof agent_run_id !== 'string') {
      return errorResponse('Missing or invalid agent_run_id', req, 400)
    }

    console.log(`[research-router] Processing agent_run ${agent_run_id}`)

    // ------------------------------------------------------------------
    // 2. Fetch agent_run with joined data
    // ------------------------------------------------------------------
    const { data: agentRun, error: runError } = await serviceClient
      .from('agent_runs')
      .select('id, agent_column_id, row_id, status, depth_level_used')
      .eq('id', agent_run_id)
      .maybeSingle()

    if (runError) {
      console.error('[research-router] Failed to fetch agent_run:', runError)
      return errorResponse('Failed to fetch agent_run', req, 500)
    }

    if (!agentRun) {
      return errorResponse('Agent run not found', req, 404)
    }

    const typedRun = agentRun as AgentRun

    // Check status - only process queued runs
    if (typedRun.status !== 'queued') {
      console.log(`[research-router] Agent run ${agent_run_id} is not queued (status: ${typedRun.status}), skipping`)
      return jsonResponse({ message: 'Agent run already processed' }, req, 200)
    }

    // ------------------------------------------------------------------
    // 3. Fetch agent_column
    // ------------------------------------------------------------------
    const { data: agentColumn, error: columnError } = await serviceClient
      .from('agent_columns')
      .select('id, ops_table_id, organization_id, prompt_template, output_format, research_depth, source_preferences, auto_route')
      .eq('id', typedRun.agent_column_id)
      .maybeSingle()

    if (columnError || !agentColumn) {
      console.error('[research-router] Failed to fetch agent_column:', columnError)
      await serviceClient
        .from('agent_runs')
        .update({
          status: 'failed',
          error_message: 'Agent column not found',
          completed_at: new Date().toISOString(),
        })
        .eq('id', agent_run_id)
      return errorResponse('Agent column not found', req, 404)
    }

    const typedColumn = agentColumn as AgentColumn

    // ------------------------------------------------------------------
    // 4. Fetch row data
    // ------------------------------------------------------------------
    const { data: rowData, error: rowError } = await serviceClient
      .from('dynamic_table_rows')
      .select('id, source_data')
      .eq('id', typedRun.row_id)
      .maybeSingle()

    if (rowError || !rowData) {
      console.error('[research-router] Failed to fetch row data:', rowError)
      await serviceClient
        .from('agent_runs')
        .update({
          status: 'failed',
          error_message: 'Row data not found',
          completed_at: new Date().toISOString(),
        })
        .eq('id', agent_run_id)
      return errorResponse('Row data not found', req, 404)
    }

    const typedRow = rowData as RowData

    // ------------------------------------------------------------------
    // 5. Update status to in_progress
    // ------------------------------------------------------------------
    await serviceClient
      .from('agent_runs')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .eq('id', agent_run_id)

    // Broadcast realtime update
    await serviceClient.channel('agent_runs').send({
      type: 'broadcast',
      event: 'status_update',
      payload: { agent_run_id, status: 'in_progress' },
    })

    // ------------------------------------------------------------------
    // 6. Hydrate prompt with row data
    // ------------------------------------------------------------------
    const hydratedPrompt = hydratePrompt(typedColumn.prompt_template, typedRow.source_data)
    console.log(`[research-router] Hydrated prompt: ${hydratedPrompt}`)

    // ------------------------------------------------------------------
    // 7. Classify prompt and rank providers
    // ------------------------------------------------------------------
    let rankedProviders = classifyPromptAndRank(hydratedPrompt)

    // Apply source preferences if auto_route is false
    if (!typedColumn.auto_route) {
      rankedProviders = filterProvidersByPreferences(rankedProviders, typedColumn.source_preferences)

      if (rankedProviders.length === 0) {
        await serviceClient
          .from('agent_runs')
          .update({
            status: 'failed',
            error_message: 'No providers enabled in source preferences',
            completed_at: new Date().toISOString(),
          })
          .eq('id', agent_run_id)
        return errorResponse('No providers enabled', req, 400)
      }
    }

    console.log(`[research-router] Ranked providers: ${rankedProviders.join(', ')}`)

    // ------------------------------------------------------------------
    // 8. Get API keys from integration_credentials
    // ------------------------------------------------------------------
    const { data: credentials } = await serviceClient
      .from('integration_credentials')
      .select('provider_name, credentials')
      .eq('organization_id', typedColumn.organization_id)
      .in('provider_name', ['perplexity', 'exa', 'apify', 'anthropic'])

    const apiKeys: Record<string, string> = {}
    if (credentials) {
      for (const cred of credentials) {
        // Credentials are stored as JSONB with shape: { api_key: "..." }
        const credData = cred.credentials as Record<string, string>
        if (credData.api_key) {
          apiKeys[cred.provider_name] = credData.api_key
        }
      }
    }

    // ------------------------------------------------------------------
    // 9. Execute depth strategy
    // ------------------------------------------------------------------
    let executionResult: {
      result_text: string
      sources: Array<{ url: string; title: string; provider: string }>
      providers_used: ProviderName[]
      confidence: 'high' | 'medium' | 'low'
      chain_log?: ChainStep[]
      token_cost?: number
    }

    try {
      switch (typedRun.depth_level_used) {
        case 'low':
          executionResult = await executeLowDepth(rankedProviders, hydratedPrompt, apiKeys, typedColumn.output_format)
          break

        case 'medium':
          executionResult = await executeMediumDepth(rankedProviders, hydratedPrompt, apiKeys, typedColumn.output_format)
          break

        case 'high':
          executionResult = await executeHighDepth(rankedProviders, hydratedPrompt, apiKeys, typedColumn.output_format)
          break

        default:
          throw new Error(`Unknown depth level: ${typedRun.depth_level_used}`)
      }
    } catch (error) {
      console.error('[research-router] Execution error:', error)
      await serviceClient
        .from('agent_runs')
        .update({
          status: 'failed',
          error_message: (error as Error).message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', agent_run_id)

      // Broadcast realtime update
      await serviceClient.channel('agent_runs').send({
        type: 'broadcast',
        event: 'status_update',
        payload: { agent_run_id, status: 'failed' },
      })

      return errorResponse(`Execution failed: ${(error as Error).message}`, req, 500)
    }

    // ------------------------------------------------------------------
    // 10. Update agent_run with results
    // ------------------------------------------------------------------
    const updatePayload: Record<string, unknown> = {
      status: 'complete',
      result_text: executionResult.result_text,
      sources: executionResult.sources,
      providers_used: executionResult.providers_used,
      confidence: executionResult.confidence,
      chain_log: executionResult.chain_log || null,
      completed_at: new Date().toISOString(),
    }

    // Add token_cost if available
    if (executionResult.token_cost !== undefined) {
      updatePayload.token_cost = executionResult.token_cost
    }

    const { error: updateError } = await serviceClient
      .from('agent_runs')
      .update(updatePayload)
      .eq('id', agent_run_id)

    if (updateError) {
      console.error('[research-router] Failed to update agent_run:', updateError)
      return errorResponse('Failed to update agent_run', req, 500)
    }

    // ------------------------------------------------------------------
    // 11. Broadcast realtime update
    // ------------------------------------------------------------------
    await serviceClient.channel('agent_runs').send({
      type: 'broadcast',
      event: 'status_update',
      payload: { agent_run_id, status: 'complete' },
    })

    console.log(
      `[research-router] Completed agent_run ${agent_run_id} using providers: ${executionResult.providers_used.join(', ')}`
    )

    return jsonResponse(
      {
        agent_run_id,
        status: 'complete',
        providers_used: executionResult.providers_used,
        confidence: executionResult.confidence,
      },
      req,
      200
    )
  } catch (error) {
    console.error('[research-router] Unexpected error:', error)
    return errorResponse(`Internal server error: ${(error as Error).message}`, req, 500)
  }
})

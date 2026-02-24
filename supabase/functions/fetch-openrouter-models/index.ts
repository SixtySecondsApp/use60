import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const JSON_HEADERS = {
  ...corsHeaders,
  'Content-Type': 'application/json',
}

const LOG_PREFIX = '[fetch-openrouter-models]'

let cachedResult: ProcessedResult | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// Providers we care about for enrichment — ordered by preference
const ENRICHMENT_PROVIDERS = [
  'google',
  'perplexity',
  'openai',
  'anthropic',
  'meta-llama',
  'mistralai',
  'deepseek',
  'qwen',
]

// Curated featured models — guaranteed recommended slots + score boost
// Update this list when notable new models are released
const FEATURED_MODELS: Record<string, number> = {
  'google/gemini-3-flash-preview': 20,       // Latest Google Flash — fast, 1M context
  'google/gemini-2.5-flash-preview': 15,     // Previous gen flash
  'google/gemini-2.0-flash-001': 10,         // Stable flash
  'perplexity/sonar-pro': 18,                // Perplexity pro — web search built-in
  'perplexity/sonar': 15,                    // Perplexity standard
  'anthropic/claude-sonnet-4': 12,           // Latest Claude
  'openai/gpt-4o-mini': 12,                  // Fast, cheap GPT
  'deepseek/deepseek-chat': 10,              // DeepSeek V3
}

// Models with built-in web search capability
const WEB_SEARCH_MODELS = new Set([
  'perplexity/sonar',
  'perplexity/sonar-pro',
  'perplexity/sonar-reasoning',
  'perplexity/sonar-reasoning-pro',
])

// Provider display names
const PROVIDER_LABELS: Record<string, string> = {
  'google': 'Google',
  'perplexity': 'Perplexity',
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'meta-llama': 'Meta',
  'mistralai': 'Mistral',
  'deepseek': 'DeepSeek',
  'qwen': 'Qwen',
}

// Skip these model patterns (not useful for enrichment)
const SKIP_PATTERNS = [
  /\bfree\b/i,
  /\bpreview\b/i,
  /\bextended\b/i,
  /\bvision\b/i,
  /\bimage\b/i,
  /\baudio\b/i,
  /\btts\b/i,
  /\bwhisper\b/i,
  /\bdall-e\b/i,
  /\bstable-diffusion\b/i,
  /\bembed/i,
  /\bmoderation\b/i,
  /\brealtime\b/i,
]

interface RawModel {
  id: string
  name: string
  description?: string
  context_length: number
  pricing: {
    prompt: string
    completion: string
  }
  top_provider?: {
    max_completion_tokens?: number
  }
  architecture?: {
    modality?: string
    input_modalities?: string[]
    output_modalities?: string[]
  }
}

interface EnrichedModel {
  id: string
  name: string
  provider: string
  providerLabel: string
  context_length: number
  pricePerMillionInput: number
  pricePerMillionOutput: number
  recommended: boolean
  enrichmentScore: number // 0-100, higher = better for enrichment
  hasWebSearch: boolean
}

interface ProcessedResult {
  models: EnrichedModel[]
  providers: { id: string; label: string; count: number }[]
  topPick: string | null
}

function toPricePerMillion(pricePerToken: string): number {
  const price = parseFloat(pricePerToken)
  if (isNaN(price)) return 0
  return price * 1_000_000
}

function getProvider(modelId: string): string {
  return modelId.split('/')[0] || 'unknown'
}

/**
 * Score a model for enrichment suitability (0-100)
 * Enrichment needs: fast, cheap, good instruction-following, decent context
 */
function scoreForEnrichment(model: RawModel): number {
  const inputPrice = toPricePerMillion(model.pricing.prompt)
  const contextK = model.context_length / 1000

  let score = 50 // base

  // Curated featured model boost (guarantees top placement for known-good models)
  const featuredBoost = FEATURED_MODELS[model.id] || 0
  score += featuredBoost

  // Price scoring (lower = better, most important factor)
  if (inputPrice === 0) score += 15 // free is great
  else if (inputPrice < 0.15) score += 25 // very cheap
  else if (inputPrice < 0.50) score += 20 // cheap
  else if (inputPrice < 2.00) score += 10 // moderate
  else if (inputPrice < 5.00) score += 0 // pricey
  else score -= 10 // expensive

  // Context window (need at least 16K for enrichment, more is better up to a point)
  if (contextK >= 128) score += 10
  else if (contextK >= 32) score += 5
  else if (contextK < 8) score -= 20

  // Prefer models with "flash", "mini", "lite", "instant" in name (speed indicators)
  const nameLower = model.name.toLowerCase()
  if (/flash|mini|lite|instant|turbo|fast/.test(nameLower)) score += 10

  // Boost known-good enrichment providers
  const provider = getProvider(model.id)
  if (provider === 'google') score += 5
  if (provider === 'perplexity') score += 8 // Perplexity has built-in search
  if (provider === 'openai') score += 3
  if (provider === 'anthropic') score += 3

  // Web search capability bonus
  if (WEB_SEARCH_MODELS.has(model.id)) score += 5

  return Math.max(0, Math.min(100, score))
}

/**
 * Filter and rank models for enrichment
 */
function processModels(rawModels: RawModel[]): ProcessedResult {
  const models: EnrichedModel[] = rawModels
    .filter(m => {
      // Must support text output
      const outputMods = m.architecture?.output_modalities || ['text']
      if (!outputMods.includes('text')) return false

      // Must be from a known provider
      const provider = getProvider(m.id)
      if (!ENRICHMENT_PROVIDERS.includes(provider)) return false

      // Skip non-enrichment models (but never skip curated featured models)
      if (!FEATURED_MODELS[m.id] && SKIP_PATTERNS.some(p => p.test(m.id) || p.test(m.name))) return false

      // Must have pricing
      if (!m.pricing?.prompt) return false

      // Must have reasonable context
      if (m.context_length < 4000) return false

      return true
    })
    .map(m => {
      const provider = getProvider(m.id)
      const score = scoreForEnrichment(m)
      return {
        id: m.id,
        name: m.name,
        provider,
        providerLabel: PROVIDER_LABELS[provider] || provider,
        context_length: m.context_length,
        pricePerMillionInput: toPricePerMillion(m.pricing.prompt),
        pricePerMillionOutput: toPricePerMillion(m.pricing.completion),
        recommended: false, // set below
        enrichmentScore: score,
        hasWebSearch: WEB_SEARCH_MODELS.has(m.id),
      }
    })
    .sort((a, b) => b.enrichmentScore - a.enrichmentScore)

  // Featured models are always recommended
  for (const m of models) {
    if (FEATURED_MODELS[m.id]) {
      m.recommended = true
    }
  }

  // Mark top 3 per provider as recommended (max 15 total including featured)
  const perProviderCount: Record<string, number> = {}
  let totalRecommended = models.filter(m => m.recommended).length
  // Count already-recommended featured models per provider
  for (const m of models) {
    if (m.recommended) {
      perProviderCount[m.provider] = (perProviderCount[m.provider] || 0) + 1
    }
  }
  for (const m of models) {
    if (m.recommended) continue // already marked
    const count = perProviderCount[m.provider] || 0
    if (count < 3 && totalRecommended < 15) {
      m.recommended = true
      perProviderCount[m.provider] = count + 1
      totalRecommended++
    }
  }

  // Build provider list with counts
  const providerCounts: Record<string, number> = {}
  for (const m of models) {
    providerCounts[m.provider] = (providerCounts[m.provider] || 0) + 1
  }

  const providers = ENRICHMENT_PROVIDERS
    .filter(p => providerCounts[p])
    .map(p => ({
      id: p,
      label: PROVIDER_LABELS[p] || p,
      count: providerCounts[p],
    }))

  return {
    models,
    providers,
    topPick: models[0]?.id || null,
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts?: { maxRetries?: number; baseDelayMs?: number }
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? 3
  const baseDelayMs = opts?.baseDelayMs ?? 2000
  let lastResponse: Response | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init)
    if (response.ok) return response
    lastResponse = response
    const shouldRetry = response.status === 429 || response.status >= 500
    if (!shouldRetry || attempt === maxRetries) return response
    const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), 30000) + Math.random() * 1000
    console.log(`${LOG_PREFIX} ${response.status} — retrying in ${Math.round(delayMs)}ms`)
    await new Promise(r => setTimeout(r, delayMs))
  }
  return lastResponse!
}

async function fetchModelsFromOpenRouter(apiKey: string): Promise<RawModel[]> {
  const response = await fetchWithRetry(
    'https://openrouter.ai/api/v1/models',
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.use60.com',
        'X-Title': 'use60 Sales Intelligence',
      },
    },
    { maxRetries: 2, baseDelayMs: 1000 }
  )

  if (!response.ok) {
    throw new Error(`OpenRouter API error ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  return data.data || []
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let authHeader = req.headers.get('authorization') || req.headers.get('Authorization')

    if (!authHeader) {
      try {
        const body = await req.clone().json()
        if (body?.accessToken) authHeader = `Bearer ${body.accessToken}`
      } catch {}
    }

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: JSON_HEADERS }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY') ?? ''

    if (!openrouterApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenRouter is not configured' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }

    // Verify auth via RLS (works with ES256 JWTs)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { error: authError } = await userClient.from('profiles').select('id').limit(1).maybeSingle()
    if (authError) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: JSON_HEADERS }
      )
    }

    // Check cache
    const now = Date.now()
    if (!cachedResult || now - cacheTimestamp > CACHE_TTL_MS) {
      console.log(`${LOG_PREFIX} Fetching models from OpenRouter API`)
      const rawModels = await fetchModelsFromOpenRouter(openrouterApiKey)
      cachedResult = processModels(rawModels)
      cacheTimestamp = now
      console.log(`${LOG_PREFIX} Processed ${cachedResult.models.length} models, top pick: ${cachedResult.topPick}`)
    }

    return new Response(
      JSON.stringify(cachedResult),
      { status: 200, headers: JSON_HEADERS }
    )
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error)
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Internal server error' }),
      { status: 500, headers: JSON_HEADERS }
    )
  }
})

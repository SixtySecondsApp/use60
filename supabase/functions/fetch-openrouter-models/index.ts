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

// Cache models in memory for 1 hour
let cachedModels: OpenRouterModel[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// Recommended models to highlight (curated for quality and value)
const RECOMMENDED_MODEL_IDS = [
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3.5-sonnet:beta',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'meta-llama/llama-3.1-70b-instruct',
  'meta-llama/llama-3.1-8b-instruct',
  'mistralai/mixtral-8x7b-instruct',
  'google/gemini-pro-1.5',
]

interface OpenRouterModel {
  id: string
  name: string
  description?: string
  context_length: number
  pricing: {
    prompt: string // Price per token as string (e.g., "0.000003")
    completion: string
  }
  top_provider?: {
    max_completion_tokens?: number
  }
  recommended?: boolean
  pricePerMillionInput?: number
  pricePerMillionOutput?: number
}

interface OpenRouterResponse {
  data: OpenRouterModel[]
}

/**
 * Fetch with retry on 429 and 5xx responses
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts?: { maxRetries?: number; baseDelayMs?: number; logPrefix?: string }
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? 3
  const baseDelayMs = opts?.baseDelayMs ?? 2000
  const logPrefix = opts?.logPrefix ?? '[fetchWithRetry]'

  let lastResponse: Response | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init)

    if (response.ok) return response

    lastResponse = response
    const shouldRetry = response.status === 429 || response.status >= 500
    if (!shouldRetry || attempt === maxRetries) return response

    let delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), 30000)
    const retryAfter = response.headers.get('retry-after')
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10)
      if (!isNaN(seconds)) delayMs = seconds * 1000
    }
    delayMs += Math.random() * 1000

    console.log(`${logPrefix} ${response.status} — retrying in ${Math.round(delayMs)}ms (attempt ${attempt + 1}/${maxRetries})`)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return lastResponse!
}

/**
 * Convert price per token (string) to price per 1M tokens (number)
 */
function toPricePerMillion(pricePerToken: string): number {
  const price = parseFloat(pricePerToken)
  if (isNaN(price)) return 0
  return price * 1_000_000
}

/**
 * Fetch models from OpenRouter API
 */
async function fetchModelsFromOpenRouter(apiKey: string): Promise<OpenRouterModel[]> {
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
    {
      maxRetries: 2,
      baseDelayMs: 1000,
      logPrefix: LOG_PREFIX,
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`)
  }

  const data: OpenRouterResponse = await response.json()
  return data.data || []
}

/**
 * Process and enhance models with computed fields
 */
function processModels(models: OpenRouterModel[]): OpenRouterModel[] {
  return models
    .map(model => ({
      ...model,
      recommended: RECOMMENDED_MODEL_IDS.includes(model.id),
      pricePerMillionInput: toPricePerMillion(model.pricing.prompt),
      pricePerMillionOutput: toPricePerMillion(model.pricing.completion),
    }))
    .sort((a, b) => {
      // Recommended models first
      if (a.recommended && !b.recommended) return -1
      if (!a.recommended && b.recommended) return 1
      // Then by name
      return a.name.localeCompare(b.name)
    })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Try to get auth token from multiple sources:
    // 1. Authorization header (standard)
    // 2. Request body (fallback when headers aren't forwarded)
    let authHeader = req.headers.get('authorization') || req.headers.get('Authorization')

    // Log all headers for debugging
    const headerNames: string[] = []
    req.headers.forEach((_, k) => headerNames.push(k))
    console.log(`${LOG_PREFIX} Available headers: ${headerNames.join(', ')}`)

    // If no auth header, try to get token from request body
    if (!authHeader) {
      try {
        const body = await req.clone().json()
        if (body?.accessToken) {
          authHeader = `Bearer ${body.accessToken}`
          console.log(`${LOG_PREFIX} Using accessToken from request body`)
        }
      } catch {
        // No JSON body or no accessToken field
      }
    }

    if (!authHeader) {
      console.log(`${LOG_PREFIX} No auth token found in headers or body`)
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: JSON_HEADERS }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY') ?? ''

    if (!openrouterApiKey) {
      console.error(`${LOG_PREFIX} OPENROUTER_API_KEY not configured`)
      return new Response(
        JSON.stringify({ error: 'OpenRouter is not configured' }),
        { status: 500, headers: JSON_HEADERS }
      )
    }

    // Verify user is authenticated
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()

    if (authError || !user) {
      console.error(`${LOG_PREFIX} Auth error:`, authError?.message)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: JSON_HEADERS }
      )
    }

    // Parse query params for filtering
    const url = new URL(req.url)
    const recommendedOnly = url.searchParams.get('recommended') === 'true'
    const search = url.searchParams.get('search')?.toLowerCase()

    // Check cache
    const now = Date.now()
    if (!cachedModels || now - cacheTimestamp > CACHE_TTL_MS) {
      console.log(`${LOG_PREFIX} Cache miss/expired, fetching from OpenRouter API`)
      const rawModels = await fetchModelsFromOpenRouter(openrouterApiKey)
      cachedModels = processModels(rawModels)
      cacheTimestamp = now
      console.log(`${LOG_PREFIX} Cached ${cachedModels.length} models`)
    } else {
      console.log(`${LOG_PREFIX} Cache hit, returning cached models`)
    }

    // Filter models based on query params
    let models = cachedModels

    if (recommendedOnly) {
      models = models.filter(m => m.recommended)
    }

    if (search) {
      models = models.filter(m =>
        m.id.toLowerCase().includes(search) ||
        m.name.toLowerCase().includes(search) ||
        m.description?.toLowerCase().includes(search)
      )
    }

    return new Response(
      JSON.stringify({
        models,
        cached: now - cacheTimestamp < 1000, // True if just fetched
        total: models.length,
        recommendedCount: models.filter(m => m.recommended).length,
      }),
      { status: 200, headers: JSON_HEADERS }
    )
  } catch (error) {
    console.error(`${LOG_PREFIX} Unexpected error:`, error)
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Internal server error' }),
      { status: 500, headers: JSON_HEADERS }
    )
  }
})

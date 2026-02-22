import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { logAICostEvent, checkCreditBalance } from '../_shared/costTracking.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AnalyzeFocusAreasRequest {
  action: 'analyze_focus_areas'
  transcripts: string[]
  contact_name?: string
  company_name?: string
}

interface GenerateGoalsRequest {
  action: 'generate_goals'
  transcripts: string[]
  contact_name?: string
  company_name?: string
  focus_areas?: string[]
  async?: boolean // If true, create job and return immediately
  stream?: boolean // If true, use streaming API
}

interface GenerateSOWRequest {
  action: 'generate_sow'
  goals: string
  contact_name?: string
  company_name?: string
  focus_areas?: string[]
  length_target?: 'short' | 'medium' | 'long'
  word_limit?: number
  page_target?: number
}

interface GenerateProposalRequest {
  action: 'generate_proposal' | 'stream_proposal'
  goals: string
  contact_name?: string
  company_name?: string
  focus_areas?: string[]
  length_target?: 'short' | 'medium' | 'long'
  word_limit?: number
  page_target?: number
  async?: boolean // If true, create job and return immediately
  stream?: boolean // If true, use streaming API
}

interface GetJobStatusRequest {
  action: 'get_job_status'
  job_id: string
}

interface ProcessJobRequest {
  action: 'process_job'
  job_id?: string // If not provided, process next pending job
}

type RequestBody = AnalyzeFocusAreasRequest | GenerateGoalsRequest | GenerateSOWRequest | GenerateProposalRequest | GetJobStatusRequest | ProcessJobRequest

// =============================================================================
// Structured JSON Output Types (REL-003)
// =============================================================================

interface ProposalSection {
  id: string
  type: 'cover' | 'executive_summary' | 'problem' | 'solution' | 'approach' | 'timeline' | 'pricing' | 'terms' | 'custom'
  title: string
  content: string  // HTML content for this section
  order: number
}

interface ProposalSections {
  sections: ProposalSection[]
  metadata?: {
    generated_at: string
    model: string
    token_count?: number
  }
}

// JSON Schema for validation
const PROPOSAL_SECTIONS_SCHEMA = {
  required: ['sections'],
  properties: {
    sections: {
      type: 'array',
      items: {
        required: ['id', 'type', 'title', 'content', 'order'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['cover', 'executive_summary', 'problem', 'solution', 'approach', 'timeline', 'pricing', 'terms', 'custom'] },
          title: { type: 'string' },
          content: { type: 'string' },
          order: { type: 'number' }
        }
      }
    }
  }
}

/**
 * Get model settings from system_config
 */
async function getModelSettings(supabase: any): Promise<{
  sow_model: string
  proposal_model: string
  focus_model: string
  goals_model: string
}> {
  const { data } = await supabase
    .from('system_config')
    .select('key, value')
    .in('key', [
      'proposal_sow_model',
      'proposal_proposal_model',
      'proposal_focus_model',
      'proposal_goals_model',
    ])

  const settings: any = {
    sow_model: 'anthropic/claude-3-5-sonnet-20241022',
    proposal_model: 'anthropic/claude-3-5-sonnet-20241022',
    focus_model: 'anthropic/claude-haiku-4.5', // Claude 4.5 Haiku
    goals_model: 'anthropic/claude-3-5-sonnet-20241022',
  }

  data?.forEach((item: any) => {
    if (item.key === 'proposal_sow_model') settings.sow_model = item.value
    if (item.key === 'proposal_proposal_model') settings.proposal_model = item.value
    if (item.key === 'proposal_focus_model') settings.focus_model = item.value
    if (item.key === 'proposal_goals_model') settings.goals_model = item.value
  })

  return settings
}

/**
 * Fetch available models from OpenRouter
 * Uses OPENROUTER_API_KEY from Edge Function secrets or provided key
 */
async function getAvailableModels(openRouterApiKey?: string): Promise<Array<{ id: string; name: string }>> {
  try {
    // Use provided key or fall back to Edge Function secret
    const apiKey = openRouterApiKey || Deno.env.get('OPENROUTER_API_KEY')
    
    if (!apiKey) {
      console.warn('No OpenRouter API key available to fetch models')
      return []
    }

    console.log('Fetching available models from OpenRouter...')
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.warn(`Failed to fetch models from OpenRouter (${response.status}):`, errorText)
      return []
    }

    const data = await response.json()
    const models = data.data || []
    console.log(`Fetched ${models.length} available models from OpenRouter`)
    return models
  } catch (error) {
    console.warn('Error fetching models from OpenRouter:', error)
    return []
  }
}

/**
 * Find the correct Claude Haiku 4.5 model ID from available models
 * Uses OPENROUTER_API_KEY from Edge Function secrets to fetch models
 */
async function findClaudeHaiku45Model(openRouterApiKey?: string): Promise<string> {
  const models = await getAvailableModels(openRouterApiKey)
  
  if (models.length === 0) {
    console.warn('No models fetched, using default: anthropic/claude-haiku-4.5')
    return 'anthropic/claude-haiku-4.5'
  }
  
  // Look for Claude Haiku 4.5 models (various possible names)
  const possibleIds = [
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-haiku-4-5',
    'anthropic/claude-4-5-haiku',
    'anthropic/claude-haiku-4',
    'anthropic/claude-haiku-20250514',
  ]
  
  // First, try exact matches
  for (const id of possibleIds) {
    const found = models.find((m: any) => m.id === id)
    if (found) {
      console.log(`✅ Found Claude Haiku 4.5 model: ${found.id} (${found.name || found.id})`)
      return found.id
    }
  }
  
  // Then try fuzzy matching (look for "haiku" and "4.5" or "4-5" in the name/id)
  const fuzzyMatch = models.find((m: any) => {
    const id = m.id.toLowerCase()
    const name = (m.name || '').toLowerCase()
    return (id.includes('haiku') || name.includes('haiku')) && 
           (id.includes('4.5') || id.includes('4-5') || id.includes('4_5') || name.includes('4.5'))
  })
  
  if (fuzzyMatch) {
    console.log(`✅ Found Claude Haiku 4.5 model (fuzzy match): ${fuzzyMatch.id} (${fuzzyMatch.name || fuzzyMatch.id})`)
    return fuzzyMatch.id
  }
  
  // Fallback: look for any Haiku model with version 4.x
  const haiku4Match = models.find((m: any) => {
    const id = m.id.toLowerCase()
    return id.includes('haiku') && (id.includes('4') || id.includes('2025'))
  })
  
  if (haiku4Match) {
    console.log(`⚠️  Found Claude Haiku 4.x model (fallback): ${haiku4Match.id} (${haiku4Match.name || haiku4Match.id})`)
    return haiku4Match.id
  }
  
  // Log available Claude models for debugging
  const claudeModels = models.filter((m: any) => m.id.toLowerCase().includes('claude') && m.id.toLowerCase().includes('haiku'))
  if (claudeModels.length > 0) {
    console.log('Available Claude Haiku models:')
    claudeModels.slice(0, 10).forEach((m: any) => {
      console.log(`  - ${m.id} (${m.name || m.id})`)
    })
  }
  
  // Last resort: return the default
  console.warn('⚠️  Could not find Claude Haiku 4.5 model in available models, using default: anthropic/claude-haiku-4.5')
  return 'anthropic/claude-haiku-4.5'
}

/**
 * Validate that a model ID exists in OpenRouter's available models
 * Uses OPENROUTER_API_KEY from Edge Function secrets
 */
async function validateModelId(modelId: string, openRouterApiKey?: string): Promise<boolean> {
  const models = await getAvailableModels(openRouterApiKey)
  
  if (models.length === 0) {
    console.warn('⚠️  Could not fetch models for validation, assuming model is valid')
    return true // Assume valid if we can't fetch models
  }
  
  const exists = models.some((m: any) => m.id === modelId)
  
  if (!exists) {
    console.warn(`❌ Model ${modelId} not found in available models.`)
    console.warn('Available Claude Haiku models:')
    const claudeHaikuModels = models.filter((m: any) => 
      m.id.toLowerCase().includes('claude') && m.id.toLowerCase().includes('haiku')
    )
    if (claudeHaikuModels.length > 0) {
      claudeHaikuModels.slice(0, 10).forEach((m: any) => {
        console.warn(`  - ${m.id} (${m.name || m.id})`)
      })
    } else {
      console.warn('  (No Claude Haiku models found)')
    }
  } else {
    const foundModel = models.find((m: any) => m.id === modelId)
    console.log(`✅ Model ${modelId} validated: ${foundModel?.name || modelId}`)
  }
  
  return exists
}

/**
 * Get OpenRouter API key - prefer user's personal key, fall back to shared key
 */
async function getOpenRouterApiKey(supabase: any, userId: string): Promise<string> {
  // Try to get user's personal OpenRouter API key from user_settings
  try {
    const { data: userSettings, error: settingsError } = await supabase
      .from('user_settings')
      .select('ai_provider_keys')
      .eq('user_id', userId)
      .single()

    if (settingsError && settingsError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine, but other errors should be logged
      console.log('Error fetching user settings (non-fatal):', settingsError.message)
    }

    if (userSettings?.ai_provider_keys?.openrouter) {
      const userKey = userSettings.ai_provider_keys.openrouter
      if (userKey && typeof userKey === 'string' && userKey.trim().length > 0) {
        console.log('Using user\'s personal OpenRouter API key')
        return userKey.trim()
      }
    }
  } catch (error) {
    // If user_settings doesn't exist or key not found, fall through to shared key
    console.log('User OpenRouter API key not found, falling back to shared key:', error instanceof Error ? error.message : String(error))
  }

  // Fall back to shared environment variable
  const sharedKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!sharedKey || sharedKey.trim().length === 0) {
    console.error('OPENROUTER_API_KEY not configured in environment variables')
    throw new Error('OPENROUTER_API_KEY not configured. Please add your OpenRouter API key in Settings > AI Provider Settings.')
  }

  console.log('Using shared OpenRouter API key')
  return sharedKey.trim()
}

// =============================================================================
// Proposal Progress Tracking (REL-004)
// =============================================================================

/**
 * Update proposal generation progress for Supabase Realtime subscribers.
 *
 * Stores detailed progress in `brand_config._generation_progress` (JSONB) and
 * keeps `generation_status` in sync using the allowed enum values:
 *   'pending' | 'processing' | 'complete' | 'failed'
 *
 * Clients subscribe to Realtime changes on the specific proposals row to
 * receive progress updates as they happen.
 */
async function updateProposalProgress(
  supabase: any,
  proposalId: string | null,
  step: string,
  percent: number,
  message: string
) {
  if (!proposalId) return
  try {
    // Read current brand_config so we can merge progress into it
    const { data: current } = await supabase
      .from('proposals')
      .select('brand_config')
      .eq('id', proposalId)
      .maybeSingle()

    const brandConfig = current?.brand_config || {}
    brandConfig._generation_progress = {
      step,
      percent,
      message,
      updated_at: new Date().toISOString(),
    }

    // Map percent to the allowed generation_status values
    let generationStatus: string
    if (percent >= 100) {
      generationStatus = 'complete'
    } else if (step === 'failed') {
      generationStatus = 'failed'
    } else if (percent > 0) {
      generationStatus = 'processing'
    } else {
      generationStatus = 'pending'
    }

    await supabase
      .from('proposals')
      .update({
        generation_status: generationStatus,
        brand_config: brandConfig,
      })
      .eq('id', proposalId)

    console.log(`📊 Proposal ${proposalId} progress: ${step} (${percent}%) - ${message}`)
  } catch (err) {
    console.warn('Failed to update proposal progress:', err)
  }
}

// =============================================================================
// Chunked Transcript Processing Utilities (REL-001 / REL-002)
// =============================================================================

/** Approximate character-to-token ratio (1 token ~ 4 chars for English text) */
const CHARS_PER_TOKEN = 4

/** Default max tokens per chunk. ~15,000 tokens = ~60,000 chars */
const DEFAULT_CHUNK_MAX_TOKENS = 15000

/** Character threshold that triggers chunked processing */
const CHUNK_CHAR_THRESHOLD = DEFAULT_CHUNK_MAX_TOKENS * CHARS_PER_TOKEN // 60,000 chars

/**
 * Split a long transcript into chunks at sentence boundaries.
 *
 * The function tries to break on sentence-ending punctuation (. ! ?) followed
 * by whitespace.  If no sentence boundary is found within the allowed window it
 * falls back to the nearest paragraph break (\n\n), then line break (\n), then
 * a hard cut at maxChars.
 *
 * @param text       The full transcript text
 * @param maxTokens  Maximum approximate tokens per chunk (default 15 000)
 * @returns          Array of text chunks, each <= maxChars characters
 */
function chunkTranscript(text: string, maxTokens: number = DEFAULT_CHUNK_MAX_TOKENS): string[] {
  const maxChars = maxTokens * CHARS_PER_TOKEN

  // Fast path: text fits in a single chunk
  if (text.length <= maxChars) {
    return [text]
  }

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining.trim())
      break
    }

    // Search for the best split point within maxChars
    let splitAt = -1

    // 1) Try sentence boundary (. ! ? followed by whitespace) — search backwards
    //    from maxChars to 70% of maxChars to keep chunks reasonably large.
    const searchStart = Math.floor(maxChars * 0.7)
    for (let i = maxChars; i >= searchStart; i--) {
      const ch = remaining[i - 1] // character just before potential split
      if ((ch === '.' || ch === '!' || ch === '?') && /\s/.test(remaining[i] || '')) {
        splitAt = i
        break
      }
    }

    // 2) Fallback: paragraph break (\n\n)
    if (splitAt === -1) {
      const paragraphIdx = remaining.lastIndexOf('\n\n', maxChars)
      if (paragraphIdx > searchStart) {
        splitAt = paragraphIdx + 2 // include the double newline in the first chunk
      }
    }

    // 3) Fallback: line break (\n)
    if (splitAt === -1) {
      const lineIdx = remaining.lastIndexOf('\n', maxChars)
      if (lineIdx > searchStart) {
        splitAt = lineIdx + 1
      }
    }

    // 4) Last resort: hard cut at maxChars
    if (splitAt === -1) {
      splitAt = maxChars
    }

    chunks.push(remaining.substring(0, splitAt).trim())
    remaining = remaining.substring(splitAt).trim()
  }

  console.log(`chunkTranscript: split ${text.length} chars into ${chunks.length} chunks (maxTokens=${maxTokens})`)
  return chunks
}

/**
 * Process an array of text chunks in parallel.
 *
 * Each chunk is passed to `processor`.  All promises run concurrently via
 * Promise.allSettled so that individual failures do not prevent other chunks
 * from completing.  Failed chunks are logged and their error messages are
 * included in the result array prefixed with "[CHUNK_ERROR]" so the caller can
 * decide how to handle partial failures.
 *
 * @param chunks     Array of text chunks to process
 * @param processor  Async function that processes a single chunk and returns a string
 * @returns          Array of result strings (same order as input chunks)
 */
async function processChunksInParallel(
  chunks: string[],
  processor: (chunk: string) => Promise<string>,
): Promise<string[]> {
  console.log(`processChunksInParallel: processing ${chunks.length} chunks in parallel`)
  const startTime = Date.now()

  const settled = await Promise.allSettled(chunks.map((chunk, idx) => {
    console.log(`  chunk ${idx + 1}/${chunks.length}: ${chunk.length} chars`)
    return processor(chunk)
  }))

  const results: string[] = settled.map((outcome, idx) => {
    if (outcome.status === 'fulfilled') {
      return outcome.value
    }
    const errMsg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
    console.error(`  chunk ${idx + 1} failed: ${errMsg}`)
    return `[CHUNK_ERROR] Chunk ${idx + 1} failed: ${errMsg}`
  })

  const elapsed = Date.now() - startTime
  const failedCount = settled.filter(s => s.status === 'rejected').length
  console.log(`processChunksInParallel: completed in ${elapsed}ms (${failedCount} failures)`)

  return results
}

/** HTTP status codes that should NOT be retried (client errors) */
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 422])

/**
 * Custom error class that carries an HTTP status code for non-retryable errors.
 */
class NonRetryableError extends Error {
  public readonly statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'NonRetryableError'
    this.statusCode = statusCode
  }
}

/**
 * Retry an async function with exponential backoff.
 *
 * Non-retryable errors (those with `statusCode` in NON_RETRYABLE_STATUS_CODES,
 * or instances of `NonRetryableError`) fail immediately without consuming
 * remaining retries.
 *
 * On final failure the returned error includes the attempt count for
 * observability.
 *
 * @param fn       The async function to execute
 * @param retries  Maximum number of retry attempts (default 3)
 * @param delays   Array of millisecond delays between retries (default [1000, 3000, 9000])
 * @returns        The resolved value of `fn`
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delays: number[] = [1000, 3000, 9000],
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Non-retryable errors fail immediately
      if (error instanceof NonRetryableError) {
        console.error(`retryWithBackoff: non-retryable error on attempt ${attempt + 1}: ${lastError.message}`)
        throw lastError
      }
      if ((error as any)?.statusCode && NON_RETRYABLE_STATUS_CODES.has((error as any).statusCode)) {
        console.error(`retryWithBackoff: non-retryable status ${(error as any).statusCode} on attempt ${attempt + 1}: ${lastError.message}`)
        throw lastError
      }

      // If retries exhausted, break
      if (attempt >= retries) {
        break
      }

      // Wait before next attempt
      const delay = delays[Math.min(attempt, delays.length - 1)]
      console.log(`retryWithBackoff: attempt ${attempt + 1}/${retries + 1} failed, retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  // All retries exhausted — augment error with attempt count
  const finalError = new Error(
    `${lastError?.message || 'Unknown error'} [failed after ${retries + 1} attempts]`
  )
  ;(finalError as any).attempts = retries + 1
  ;(finalError as any).cause = lastError
  throw finalError
}

// =============================================================================
// Structured JSON Output Validation & Parsing (REL-003)
// =============================================================================

/**
 * Validate that an object conforms to the ProposalSections schema.
 */
function validateProposalSections(output: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!output || typeof output !== 'object') {
    errors.push('Output must be a JSON object')
    return { valid: false, errors }
  }

  if (!Array.isArray(output.sections)) {
    errors.push('Output must contain a "sections" array')
    return { valid: false, errors }
  }

  const validTypes = ['cover', 'executive_summary', 'problem', 'solution', 'approach', 'timeline', 'pricing', 'terms', 'custom']

  for (let i = 0; i < output.sections.length; i++) {
    const section = output.sections[i]
    if (!section.id) errors.push(`Section ${i}: missing "id"`)
    if (!section.type || !validTypes.includes(section.type)) errors.push(`Section ${i}: invalid "type" (got "${section.type}")`)
    if (!section.title) errors.push(`Section ${i}: missing "title"`)
    if (typeof section.content !== 'string') errors.push(`Section ${i}: "content" must be a string`)
    if (typeof section.order !== 'number') errors.push(`Section ${i}: "order" must be a number`)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Convert raw HTML/text content into structured ProposalSection[] by splitting
 * on h1/h2 headings. This is a deterministic fallback when AI does not return
 * structured JSON.
 */
function convertHtmlToSections(html: string): ProposalSection[] {
  const sections: ProposalSection[] = []

  // Split by h1 or h2 tags
  const parts = html.split(/<h[12][^>]*>/i)

  // Map common heading patterns to section types
  const typePatterns: Record<string, RegExp> = {
    'cover': /cover|title\s*page/i,
    'executive_summary': /executive\s*summary|overview|summary/i,
    'problem': /problem|challenge|issue|pain\s*point/i,
    'solution': /solution|approach|recommendation|proposed/i,
    'approach': /methodology|approach|process|how\s*we/i,
    'timeline': /timeline|schedule|phases|milestones|implementation\s*plan/i,
    'pricing': /pricing|cost|investment|budget|fees/i,
    'terms': /terms|conditions|legal|agreement|next\s*steps/i,
  }

  let order = 0
  for (const part of parts) {
    if (!part.trim()) continue

    // Extract title from closing h1/h2 tag content
    const titleMatch = part.match(/^(.*?)<\/h[12]>/i)
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : `Section ${order + 1}`
    const content = titleMatch ? part.slice(titleMatch[0].length).trim() : part.trim()

    if (!content && !title) continue

    // Detect section type from title
    let type: ProposalSection['type'] = 'custom'
    for (const [sType, pattern] of Object.entries(typePatterns)) {
      if (pattern.test(title)) {
        type = sType as ProposalSection['type']
        break
      }
    }

    sections.push({
      id: `section-${order}`,
      type,
      title,
      content: content || '',
      order: order++
    })
  }

  // If no sections found (no h1/h2 tags), try splitting by markdown headings
  if (sections.length === 0) {
    const mdParts = html.split(/^#{1,2}\s+/m)
    const mdHeadings = html.match(/^#{1,2}\s+(.+)$/gm) || []

    if (mdParts.length > 1) {
      // First part before any heading
      if (mdParts[0].trim()) {
        sections.push({
          id: 'section-0',
          type: 'cover',
          title: 'Introduction',
          content: mdParts[0].trim(),
          order: order++
        })
      }

      for (let i = 1; i < mdParts.length; i++) {
        const headingRaw = mdHeadings[i - 1] || ''
        const headingTitle = headingRaw.replace(/^#+\s+/, '').trim() || `Section ${order + 1}`
        const sectionContent = mdParts[i].trim()

        let type: ProposalSection['type'] = 'custom'
        for (const [sType, pattern] of Object.entries(typePatterns)) {
          if (pattern.test(headingTitle)) {
            type = sType as ProposalSection['type']
            break
          }
        }

        sections.push({
          id: `section-${order}`,
          type,
          title: headingTitle,
          content: sectionContent,
          order: order++
        })
      }
    }
  }

  // If still no sections found, wrap entire content as single section
  if (sections.length === 0) {
    sections.push({
      id: 'section-0',
      type: 'custom',
      title: 'Proposal',
      content: html,
      order: 0
    })
  }

  return sections
}

/**
 * Parse AI output into structured ProposalSections, with a deterministic
 * fallback that splits raw HTML/markdown by headings.
 *
 * @param rawContent        The raw AI output (HTML, markdown, or JSON)
 * @param model             The model ID used for generation (stored in metadata)
 * @param _openRouterApiKey OpenRouter API key (reserved for future retry-with-stricter-prompt)
 * @param retryCount        Internal retry counter
 */
async function parseAndValidateAIOutput(
  rawContent: string,
  model: string,
  _openRouterApiKey: string,
  retryCount: number = 0
): Promise<ProposalSections> {
  // First try: parse the raw content as JSON if it looks like JSON
  let parsed: any = null

  // Try to extract JSON from the response (AI may wrap in markdown code blocks)
  const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/) || rawContent.match(/(\{[\s\S]*\})/)
  if (jsonMatch) {
    try {
      parsed = JSON.parse(jsonMatch[1])
    } catch (_e) {
      // Not valid JSON
    }
  }

  if (!parsed) {
    try {
      parsed = JSON.parse(rawContent)
    } catch (_e) {
      // Not JSON at all - need to convert
    }
  }

  // If we got JSON, validate it
  if (parsed) {
    const validation = validateProposalSections(parsed)
    if (validation.valid) {
      return {
        ...parsed,
        metadata: {
          generated_at: new Date().toISOString(),
          model,
          ...(parsed.metadata || {})
        }
      }
    }

    // Invalid structure - log and fall through to conversion
    if (retryCount === 0) {
      console.warn('AI output validation failed, falling back to HTML/markdown conversion:', validation.errors)
    }
  }

  // Convert raw HTML/text content into structured sections
  // This is a deterministic fallback - split by h1/h2 headings
  const sections = convertHtmlToSections(rawContent)

  return {
    sections,
    metadata: {
      generated_at: new Date().toISOString(),
      model,
      token_count: Math.ceil(rawContent.length / 4)
    }
  }
}

// =============================================================================
// End of Structured JSON Output Validation & Parsing
// =============================================================================

/**
 * Call OpenRouter to process a single text chunk and return the response text.
 *
 * This is a low-level helper used by the chunked transcript processing paths.
 * It includes proper error classification so `retryWithBackoff` can skip
 * non-retryable errors.
 */
async function callOpenRouterForChunk(
  openRouterApiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openRouterApiKey}`,
      'HTTP-Referer': 'https://sixtyseconds.video',
      'X-Title': 'Sixty Sales Dashboard Proposal Generation',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `OpenRouter API error: ${response.status} - ${errorText}`

    // Parse the error body for a friendlier message
    try {
      const errorData = JSON.parse(errorText)
      if (errorData.error?.message) {
        errorMessage = `OpenRouter error: ${errorData.error.message}`
      }
    } catch (_) {
      // keep raw errorMessage
    }

    // Non-retryable client errors
    if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
      throw new NonRetryableError(errorMessage, response.status)
    }

    // Retryable error (e.g. 429, 500, 502, 503)
    const err = new Error(errorMessage)
    ;(err as any).statusCode = response.status
    throw err
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || data.content?.[0]?.text || ''
  return content
}

/**
 * Process transcripts with chunking when they exceed the token threshold.
 *
 * For short transcripts this is a simple pass-through.  For long transcripts
 * the text is split into chunks, each chunk is processed independently (with
 * retry), and the partial results are stitched back together.
 *
 * @param transcriptsText  The concatenated transcript text
 * @param openRouterApiKey OpenRouter API key
 * @param model            Model ID to use
 * @param systemPrompt     System prompt for the AI
 * @param buildUserPrompt  Function that wraps a (possibly partial) transcript into the full user prompt
 * @param maxTokens        Max output tokens per AI call
 * @param stitchPrompt     Optional system prompt used for a final stitching pass when chunks > 1
 * @returns                The final generated content string
 */
async function processTranscriptWithChunking(
  transcriptsText: string,
  openRouterApiKey: string,
  model: string,
  systemPrompt: string,
  buildUserPrompt: (transcriptPart: string) => string,
  maxTokens: number,
  stitchPrompt?: string,
): Promise<{ content: string; chunked: boolean; chunkCount: number }> {
  // If transcript is short enough, process directly (no chunking)
  if (transcriptsText.length <= CHUNK_CHAR_THRESHOLD) {
    console.log(`processTranscriptWithChunking: transcript is ${transcriptsText.length} chars, processing directly (threshold: ${CHUNK_CHAR_THRESHOLD})`)
    const content = await retryWithBackoff(() =>
      callOpenRouterForChunk(openRouterApiKey, model, systemPrompt, buildUserPrompt(transcriptsText), maxTokens)
    )
    return { content, chunked: false, chunkCount: 1 }
  }

  // Transcript exceeds threshold — chunk it
  const chunks = chunkTranscript(transcriptsText)
  console.log(`processTranscriptWithChunking: transcript is ${transcriptsText.length} chars, chunked into ${chunks.length} pieces`)

  // Process each chunk with retry, in parallel
  const chunkResults = await processChunksInParallel(chunks, (chunk) =>
    retryWithBackoff(() =>
      callOpenRouterForChunk(
        openRouterApiKey,
        model,
        systemPrompt,
        buildUserPrompt(chunk),
        maxTokens,
      )
    )
  )

  // Check for partial failures
  const failedChunks = chunkResults.filter(r => r.startsWith('[CHUNK_ERROR]'))
  if (failedChunks.length > 0) {
    console.warn(`processTranscriptWithChunking: ${failedChunks.length}/${chunks.length} chunks failed`)
  }

  // Filter out failed chunks for stitching
  const successResults = chunkResults.filter(r => !r.startsWith('[CHUNK_ERROR]'))

  if (successResults.length === 0) {
    throw new Error(`All ${chunks.length} transcript chunks failed to process. ${failedChunks[0]}`)
  }

  // If only one successful result, return directly
  if (successResults.length === 1) {
    return { content: successResults[0], chunked: true, chunkCount: chunks.length }
  }

  // Stitch results together using an AI call for coherence
  const stitchSystemPrompt = stitchPrompt || `You are an expert editor. You will receive multiple partial analyses of a meeting transcript that were processed in chunks. Your job is to:

1. Merge the partial results into a single, coherent document
2. Remove any duplicate information that appears across chunks
3. Ensure smooth transitions between sections
4. Maintain consistent formatting and style throughout
5. Preserve all unique information from each chunk

Output ONLY the merged document. Do not add explanations or commentary about the merging process.`

  const stitchUserPrompt = `Merge the following ${successResults.length} partial analyses into a single coherent document:\n\n${successResults.map((r, i) => `--- PART ${i + 1} OF ${successResults.length} ---\n${r}`).join('\n\n')}`

  console.log(`processTranscriptWithChunking: stitching ${successResults.length} chunk results together`)
  const stitchedContent = await retryWithBackoff(() =>
    callOpenRouterForChunk(openRouterApiKey, model, stitchSystemPrompt, stitchUserPrompt, maxTokens)
  )

  return { content: stitchedContent, chunked: true, chunkCount: chunks.length }
}

// =============================================================================
// End of Chunked Transcript Processing Utilities
// =============================================================================

/**
 * Process a proposal generation job
 */
async function processJob(
  supabase: any,
  userId: string,
  jobId?: string
): Promise<Response> {
  let job: any = null
  try {
    // Get job (either specific or next pending)
    if (jobId) {
      const { data, error } = await supabase
        .from('proposal_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', userId)
        .single()
      
      if (error || !data) {
        throw new Error('Job not found')
      }
      job = data
    } else {
      // Get next pending job
      const { data, error } = await supabase.rpc('get_next_proposal_job')
      if (error || !data) {
        return new Response(
          JSON.stringify({ success: false, error: 'No pending jobs found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        )
      }
      job = data
    }

    // Update job status to processing
    await supabase
      .from('proposal_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', job.id)

    const { transcripts, goals, contact_name, company_name, focus_areas, length_target, word_limit, page_target, proposal_id: proposalId } = job.input_data

    // REL-004: Signal that generation has started
    await updateProposalProgress(supabase, proposalId, 'analyzing', 10, 'Analyzing input and loading templates...')

    // Get model settings
    const modelSettings = await getModelSettings(supabase)

    // Get templates
    const { data: templates } = await supabase
      .from('proposal_templates')
      .select('type, content')
      .eq('is_default', true)

    const goalsTemplate = templates?.find(t => t.type === 'goals')?.content || ''
    const sowTemplate = templates?.find(t => t.type === 'sow')?.content || ''
    const proposalTemplate = templates?.find(t => t.type === 'proposal')?.content || ''
    const designSystemTemplate = templates?.find(t => t.type === 'design_system')?.content || ''

    // Build prompts (same logic as sync version)
    let prompt = ''
    let systemPrompt = ''
    const action = job.action

    // Get current date for context
    const currentDate = new Date()
    const dateContext = `IMPORTANT CONTEXT - Current Date: ${currentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })} (${currentDate.toISOString().split('T')[0]})

Use this date as the reference for "today" when creating timelines, deadlines, or any date references in the proposal.
`

    // Track whether we need chunked processing (for large transcripts in generate_goals)
    let useChunkedProcessing = false
    let chunkedTranscriptsText = ''

    if (action === 'generate_goals') {
      systemPrompt = `${dateContext}

You are an expert business consultant who extracts strategic goals and objectives from sales call transcripts.
Your task is to analyze call transcripts and create a comprehensive Goals & Objectives document.

Use the following example structure as a reference for format and style:
${goalsTemplate}

Key requirements:
- Extract all strategic objectives mentioned in the calls
- Organize goals by category (Marketing, Operations, Revenue Growth, etc.)
- Include specific metrics and timelines where mentioned
- Maintain professional, clear language
- Structure similar to the example provided`

      const transcriptsText = Array.isArray(transcripts)
        ? transcripts.join('\n\n---\n\n')
        : transcripts || ''

      // Check if transcript exceeds chunk threshold
      if (transcriptsText.length > CHUNK_CHAR_THRESHOLD) {
        useChunkedProcessing = true
        chunkedTranscriptsText = transcriptsText
        console.log(`processJob: generate_goals transcript is ${transcriptsText.length} chars (> ${CHUNK_CHAR_THRESHOLD}), will use chunked processing`)
      }

      const focusAreasText = focus_areas && focus_areas.length > 0
        ? `\n\nFOCUS AREAS TO EMPHASIZE:\n${focus_areas.map((fa: string, idx: number) => `${idx + 1}. ${fa}`).join('\n')}\n\nPlease ensure these focus areas are prominently featured in the Goals & Objectives document.`
        : ''

      prompt = `Analyze the following sales call transcripts and create a comprehensive Goals & Objectives document.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Call Transcripts:
${transcriptsText}${focusAreasText}

Create a Goals & Objectives document following the structure and style of the example provided. Include all strategic objectives, immediate actions, success metrics, timelines, and any other relevant information from the calls.`

    } else if (action === 'generate_sow') {
      systemPrompt = `${dateContext}

You are an expert proposal writer who creates Statement of Work (SOW) documents in MARKDOWN FORMAT ONLY.

Your task is to transform a Goals & Objectives document into a comprehensive Statement of Work document.

ABSOLUTE REQUIREMENTS - NO EXCEPTIONS:
1. Output format MUST be PURE MARKDOWN (.md) - NO HTML WHATSOEVER
2. Start with markdown headers (# for main title, ## for sections)
3. Use markdown syntax ONLY:
   - # Header, ## Subheader, ### Sub-subheader
   - **bold text** for emphasis
   - - or * for bullet lists
   - 1. 2. 3. for numbered lists
   - [link text](url) for links
   - --- for horizontal rules
4. NEVER use HTML tags like <html>, <head>, <body>, <div>, <span>, <style>, <script>
5. NEVER include CSS styles or JavaScript
6. NEVER use HTML entities or HTML structure
7. The output should be a plain text markdown file that can be opened in any markdown viewer

Example SOW structure (in markdown):
${sowTemplate ? sowTemplate.substring(0, 1000) : '# Statement of Work\n\n## Introduction\n\n...'}

Key requirements:
- Create a professional Statement of Work document in MARKDOWN format
- Include all standard SOW sections (Introduction, Project Objectives, Proposed Solution, Pricing & Terms, etc.)
- Translate goals into actionable project phases and deliverables
- Maintain the same level of detail and professionalism as the example
- Include realistic timelines and pricing structures based on the goals
- Use ONLY Markdown syntax - NO HTML`

      const lengthGuidance = length_target === 'short' 
        ? 'Keep the document concise: under 1000 words, approximately 2 pages.'
        : length_target === 'long'
        ? 'Create a comprehensive document: over 2500 words, approximately 6+ pages.'
        : length_target === 'medium'
        ? 'Create a medium-length document: 1000-2500 words, approximately 3-5 pages.'
        : word_limit
        ? `Target approximately ${word_limit} words.`
        : page_target
        ? `Target approximately ${page_target} pages.`
        : ''

      const focusAreasText = focus_areas && focus_areas.length > 0
        ? `\n\nFOCUS AREAS TO EMPHASIZE:\n${focus_areas.map((fa: string, idx: number) => `${idx + 1}. ${fa}`).join('\n')}\n\nEnsure these focus areas receive appropriate attention in the SOW.`
        : ''

      prompt = `Transform the following Goals & Objectives document into a comprehensive Statement of Work.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Goals & Objectives:
${goals}${focusAreasText}${lengthGuidance ? `\n\nLENGTH REQUIREMENTS:\n${lengthGuidance}` : ''}

CRITICAL: Create a Statement of Work document in PURE MARKDOWN FORMAT. 

DO NOT:
- Use HTML tags (<html>, <head>, <body>, <div>, etc.)
- Include CSS styles or JavaScript
- Use HTML structure or formatting
- Output anything that looks like HTML

DO:
- Use markdown headers (# ## ###)
- Use markdown formatting (**bold**, *italic*, - lists)
- Output plain markdown text that can be saved as a .md file
- Follow the structure and style of the example provided
- Translate the goals into actionable project phases, deliverables, timelines, and pricing

Output ONLY markdown text starting with a # header.`

    } else if (action === 'generate_proposal') {
      // Check if design system template is just a file path reference
      const hasDesignSystemContent = designSystemTemplate && !designSystemTemplate.includes('See ') && designSystemTemplate.length > 100
      const designSystemFallback = !hasDesignSystemContent ? `
IMPORTANT DESIGN SYSTEM PRINCIPLES:
- Dark Mode: Deep dark backgrounds (#030712), glassmorphic cards (bg-gray-900/80 backdrop-blur-sm), premium glass surfaces with rgba(20, 28, 36, 0.6) and backdrop-filter: blur(16px)
- Typography: Inter font family, proper text hierarchy (h1: text-3xl font-bold, h2: text-2xl font-semibold, body: text-base)
- Colors: Primary blue (#3DA8F4), success emerald (#10B981), danger red (#EF4444), text colors (gray-100 primary, gray-300 secondary)
- Components: Glassmorphic cards with subtle borders (border-gray-700/50), smooth transitions, hover effects
- Buttons: Use glassmorphic styling with backdrop blur, proper contrast ratios
- Layout: Mobile-first responsive design, proper spacing and padding
` : ''

      systemPrompt = `${dateContext}

You are an expert web developer and proposal designer who creates beautiful, interactive HTML proposal presentations.
Your task is to transform a Goals & Objectives document into a modern, professional HTML proposal presentation tailored to the specific needs and context of the client.

CRITICAL INSTRUCTION: You must IMMEDIATELY output the complete HTML document. Do NOT:
- Ask for confirmation or clarification
- Ask "Would you like me to proceed?"
- Provide explanations before the HTML
- Output anything except the HTML document itself
Start your response with <!DOCTYPE html> and output ONLY the complete HTML.

Use the following HTML proposal example as a reference for structure, styling, and interactivity:
${proposalTemplate}

Use the following design system guidelines for styling:
${hasDesignSystemContent ? designSystemTemplate : designSystemFallback}

PROPOSAL STRUCTURE GUIDANCE (Adapt flexibly based on the Goals & Objectives):
Analyze the Goals & Objectives document carefully to determine what sections are relevant. Use this as a flexible guide, not a rigid template:

1.  **Opening Hook**: Start with a compelling insight, opportunity, or challenge relevant to THEIR specific situation (not generic).
2.  **Current State Analysis**: If relevant, show "What's Working" vs. "What's Missing" based on their actual goals. Skip if not applicable.
3.  **Proposed Solution/Methodology**: Present YOUR approach tailored to their specific needs. This could be:
    - A process/framework (for consulting/development)
    - A service delivery model (for services)
    - A product implementation plan (for products)
    - Or any other relevant structure based on their goals
4.  **Deliverables/Scope**: List concrete outputs, but ONLY what's relevant to their goals. Adapt the format (development milestones, service components, campaign assets, etc.)
5.  **Timeline/Phases**: If timelines are relevant, structure them appropriately (sprints, phases, months, etc.). Skip if not applicable.
6.  **Investment/Pricing**: Include if relevant. Format appropriately (project fee, retainer, one-time, etc.)
7.  **Why Us/Credibility**: Include if it adds value. Adapt to what matters for their context.
8.  **Next Steps/CTA**: Clear action items tailored to their decision process.

CRITICAL: Do NOT force-fit sections that don't apply. For example:
- A development proposal might focus on: Problem → Technical Approach → Architecture → Development Phases → Timeline → Investment
- A marketing proposal might focus on: Opportunity → Strategy → Campaigns → Deliverables → Timeline → Investment
- A consulting proposal might focus on: Challenge → Methodology → Phases → Outcomes → Investment

Key requirements:
- Create a complete, standalone HTML file with embedded CSS and JavaScript
- Use the glassmorphic dark theme design system
- Include smooth animations and transitions
- Make it interactive with navigation dots and keyboard controls
- Structure content into logical slides/sections that make sense for THIS specific proposal
- Ensure mobile responsiveness
- Include password protection if needed
- Use Tailwind CSS via CDN for styling
- Follow the design system's color tokens, typography, and component patterns
- Tailor every section to the specific Goals & Objectives provided - avoid generic content

STREAMING GENERATION GUIDANCE (CRITICAL FOR USER EXPERIENCE):
Generate the HTML in complete, logical blocks that build the proposal like a visual story:
1. Start with the complete <!DOCTYPE html>, <head> section, and opening <body> tag as one block
2. Generate each slide/section as a COMPLETE block (full <div class="slide">...</div>)
3. End with closing </body></html> tags as final block
4. Each section should be fully formed and visually complete before moving to the next
5. This allows the user to watch their proposal build up section by section in a visually appealing way
6. Think of it like assembling a beautiful presentation one slide at a time, not streaming raw code`

      const lengthGuidance = length_target === 'short' 
        ? 'Keep the proposal concise: under 1000 words, approximately 2 pages. Use fewer slides and more concise content.'
        : length_target === 'long'
        ? 'Create a comprehensive proposal: over 2500 words, approximately 6+ pages. Include detailed sections and multiple slides.'
        : length_target === 'medium'
        ? 'Create a medium-length proposal: 1000-2500 words, approximately 3-5 pages. Balance detail with conciseness.'
        : word_limit
        ? `Target approximately ${word_limit} words. Adjust slide count and content depth accordingly.`
        : page_target
        ? `Target approximately ${page_target} pages. Adjust slide count and content depth accordingly.`
        : ''

      const focusAreasText = focus_areas && focus_areas.length > 0
        ? `\n\nFOCUS AREAS TO EMPHASIZE:\n${focus_areas.map((fa: string, idx: number) => `${idx + 1}. ${fa}`).join('\n')}\n\nEnsure these focus areas receive prominent placement and detailed coverage in the proposal.`
        : ''

      prompt = `Transform the following Goals & Objectives document into a beautiful HTML proposal presentation.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Goals & Objectives:
${goals}${focusAreasText}${lengthGuidance ? `\n\nLENGTH REQUIREMENTS:\n${lengthGuidance}` : ''}

CRITICAL REQUIREMENTS:
- OUTPUT ONLY HTML - no questions, no confirmations, no explanations
- Start immediately with <!DOCTYPE html> - do not ask "Would you like me to proceed?"
- Create a COMPLETE, standalone HTML file with ALL tags properly closed
- The HTML must start with <!DOCTYPE html> and end with </html>
- ALL opening tags must have corresponding closing tags
- The HTML must be fully functional and renderable in a browser
- Ensure the file is complete - do not truncate or leave sections incomplete
- Include all CSS styles within <style> tags
- Include all JavaScript within <script> tags
- Use the design system guidelines for consistent styling
- The HTML should be a complete, standalone file that can be opened in a browser

STRUCTURE ADAPTATION:
- Analyze the Goals & Objectives above to determine what type of proposal this is (development, marketing, consulting, etc.)
- Adapt the structure from the example template to fit THIS specific proposal's needs
- Only include sections that are relevant to the Goals & Objectives
- Tailor all content to the specific client, company, and their stated goals
- Do NOT copy generic content - every section should be customized based on the Goals & Objectives
- Use the example template for styling and interactivity patterns, but adapt the content structure to match what makes sense for this proposal

BEGIN YOUR RESPONSE WITH <!DOCTYPE html> - NO OTHER TEXT BEFORE IT.`

    } else if (action === 'generate_email') {
      // Generate Email Proposal from Goals
      systemPrompt = `${dateContext}

You are an expert proposal writer who creates professional email proposals in MARKDOWN FORMAT ONLY.

Your task is to transform a Goals & Objectives document into a professional email proposal that can be sent directly to clients.

ABSOLUTE REQUIREMENTS - NO EXCEPTIONS:
1. Output format MUST be PURE MARKDOWN (.md) - NO HTML WHATSOEVER
2. Start with a subject line in the format: **Subject:** [Proposal Title]
3. Use markdown syntax ONLY:
   - **bold text** for emphasis
   - - or * for bullet lists
   - 1. 2. 3. for numbered lists
   - --- for horizontal rules (section separators)
4. NEVER use HTML tags
5. Structure as a professional email with:
   - Subject line
   - Personal greeting
   - Brief overview/introduction
   - Key points/deliverables
   - Pricing/investment (if relevant)
   - Next steps
   - Professional sign-off

Key requirements:
- Create a professional email proposal in MARKDOWN format
- Keep it concise and scannable (use bullet points and short paragraphs)
- Include all relevant information from the goals
- Make it personal and conversational but professional
- Use ONLY Markdown syntax - NO HTML`

      const lengthGuidance = length_target === 'short' 
        ? 'Keep the email concise: under 500 words, approximately 1 page.'
        : length_target === 'long'
        ? 'Create a comprehensive email: over 1000 words, approximately 2-3 pages. Include detailed sections.'
        : length_target === 'medium'
        ? 'Create a medium-length email: 500-1000 words, approximately 1-2 pages. Balance detail with conciseness.'
        : word_limit
        ? `Target approximately ${word_limit} words.`
        : page_target
        ? `Target approximately ${page_target} pages.`
        : ''

      const focusAreasText = focus_areas && focus_areas.length > 0
        ? `\n\nFOCUS AREAS TO EMPHASIZE:\n${focus_areas.map((fa: string, idx: number) => `${idx + 1}. ${fa}`).join('\n')}\n\nEnsure these focus areas receive appropriate attention in the email.`
        : ''

      prompt = `Transform the following Goals & Objectives document into a professional email proposal.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Goals & Objectives:
${goals}${focusAreasText}${lengthGuidance ? `\n\nLENGTH REQUIREMENTS:\n${lengthGuidance}` : ''}

CRITICAL: Create an email proposal in PURE MARKDOWN FORMAT. 

DO NOT:
- Use HTML tags (<html>, <head>, <body>, <div>, etc.)
- Include CSS styles or JavaScript
- Use HTML structure or formatting
- Output anything that looks like HTML

DO:
- Start with **Subject:** line
- Use markdown formatting (**bold**, *italic*, - lists)
- Output plain markdown text that can be copied into an email
- Translate the goals into a professional, scannable email format
- Keep paragraphs short and use bullet points for lists

Output ONLY markdown text starting with # header and **Subject:** line.`

    } else if (action === 'generate_markdown') {
      // Generate Markdown Proposal from Goals
      systemPrompt = `${dateContext}

You are an expert proposal writer who creates professional proposal documents in MARKDOWN FORMAT ONLY.

Your task is to transform a Goals & Objectives document into a clean, simple markdown proposal document.

ABSOLUTE REQUIREMENTS - NO EXCEPTIONS:
1. Output format MUST be PURE MARKDOWN (.md) - NO HTML WHATSOEVER
2. Start with markdown headers (# for main title, ## for sections)
3. Use markdown syntax ONLY:
   - # Header, ## Subheader, ### Sub-subheader
   - **bold text** for emphasis
   - - or * for bullet lists
   - 1. 2. 3. for numbered lists
   - [link text](url) for links
   - --- for horizontal rules
4. NEVER use HTML tags
5. Structure as a clean proposal document with:
   - Title
   - Introduction/Overview
   - Proposed Solution
   - Deliverables/Scope
   - Timeline (if relevant)
   - Pricing/Investment (if relevant)
   - Next Steps

Key requirements:
- Create a professional proposal document in MARKDOWN format
- Keep it simple and easy to read
- Include all relevant information from the goals
- Use ONLY Markdown syntax - NO HTML`

      const lengthGuidance = length_target === 'short' 
        ? 'Keep the document concise: under 1000 words, approximately 2 pages.'
        : length_target === 'long'
        ? 'Create a comprehensive document: over 2500 words, approximately 6+ pages.'
        : length_target === 'medium'
        ? 'Create a medium-length document: 1000-2500 words, approximately 3-5 pages.'
        : word_limit
        ? `Target approximately ${word_limit} words.`
        : page_target
        ? `Target approximately ${page_target} pages.`
        : ''

      const focusAreasText = focus_areas && focus_areas.length > 0
        ? `\n\nFOCUS AREAS TO EMPHASIZE:\n${focus_areas.map((fa: string, idx: number) => `${idx + 1}. ${fa}`).join('\n')}\n\nEnsure these focus areas receive appropriate attention in the proposal.`
        : ''

      prompt = `Transform the following Goals & Objectives document into a professional markdown proposal document.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Goals & Objectives:
${goals}${focusAreasText}${lengthGuidance ? `\n\nLENGTH REQUIREMENTS:\n${lengthGuidance}` : ''}

CRITICAL: Create a proposal document in PURE MARKDOWN FORMAT. 

DO NOT:
- Use HTML tags (<html>, <head>, <body>, <div>, etc.)
- Include CSS styles or JavaScript
- Use HTML structure or formatting
- Output anything that looks like HTML

DO:
- Use markdown headers (# ## ###)
- Use markdown formatting (**bold**, *italic*, - lists)
- Output plain markdown text that can be saved as a .md file
- Translate the goals into a clear, professional proposal format

Output ONLY markdown text starting with a # header.`

    }

    // Get OpenRouter API key (prefer user's personal key, modelSettings already retrieved above)
    const openRouterApiKey = await getOpenRouterApiKey(supabase, userId)

    // Select model based on action
    let model = modelSettings.goals_model
    if (action === 'generate_sow') model = modelSettings.sow_model
    else if (action === 'generate_proposal' || action === 'stream_proposal') model = modelSettings.proposal_model
    else if (action === 'generate_email' || action === 'generate_markdown') model = modelSettings.sow_model // Use SOW model for email/markdown
    else if (action === 'generate_goals') model = modelSettings.goals_model

    // Use appropriate token limits based on action
    const maxTokens = action === 'generate_proposal' ? 16384 : action === 'generate_goals' ? 8192 : 8192

    // REL-004: Focus areas identified, prompts built — ready to generate
    await updateProposalProgress(supabase, proposalId, 'focus_complete', 25, 'Focus areas identified')

    // --- Chunked processing path for large transcripts (generate_goals only) ---
    if (useChunkedProcessing && action === 'generate_goals') {
      console.log(`processJob: using chunked transcript processing for generate_goals`)

      // REL-004: Starting chunked content generation
      await updateProposalProgress(supabase, proposalId, 'generating', 40, 'Generating proposal content (chunked)...')

      const focusAreasText = focus_areas && focus_areas.length > 0
        ? `\n\nFOCUS AREAS TO EMPHASIZE:\n${focus_areas.map((fa: string, idx: number) => `${idx + 1}. ${fa}`).join('\n')}\n\nPlease ensure these focus areas are prominently featured in the Goals & Objectives document.`
        : ''

      const buildGoalsUserPrompt = (transcriptPart: string) => `Analyze the following sales call transcripts and create a comprehensive Goals & Objectives document.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Call Transcripts:
${transcriptPart}${focusAreasText}

Create a Goals & Objectives document following the structure and style of the example provided. Include all strategic objectives, immediate actions, success metrics, timelines, and any other relevant information from the calls.`

      try {
        const { content: chunkedContent, chunked, chunkCount } = await processTranscriptWithChunking(
          chunkedTranscriptsText,
          openRouterApiKey,
          model,
          systemPrompt,
          buildGoalsUserPrompt,
          maxTokens,
        )

        console.log(`processJob: chunked processing complete (${chunkCount} chunks, chunked=${chunked})`)

        // REL-004: Chunked content generated, now assembling
        await updateProposalProgress(supabase, proposalId, 'assembling', 80, 'Assembling final document...')

        // Parse and validate AI output into structured sections (REL-003)
        let chunkedSections: ProposalSections | null = null
        try {
          chunkedSections = await parseAndValidateAIOutput(chunkedContent, model, openRouterApiKey)
          console.log(`processJob: parsed chunked content into ${chunkedSections.sections.length} structured sections`)
        } catch (sectionsError) {
          console.warn('processJob: failed to parse chunked content into sections (non-fatal):', sectionsError)
        }

        // Create an SSE response that sends the final content (since chunked path is non-streaming)
        const encoder = new TextEncoder()
        const chunkStream = new ReadableStream({
          start(controller) {
            // Send the complete content as a single chunk then done
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: chunkedContent })}\n\n`))
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', content: chunkedContent })}\n\n`))
            controller.close()

            // REL-004: Mark proposal as complete (fire and forget)
            updateProposalProgress(supabase, proposalId, 'complete', 100, 'Proposal ready')
              .catch((err: Error) => console.warn('Proposal progress update failed (chunked):', err))

            // Update job (fire and forget)
            supabase
              .from('proposal_jobs')
              .update({
                status: 'completed',
                output_content: chunkedContent,
                ...(chunkedSections ? { sections: chunkedSections } : {}),
                output_usage: {
                  chunked: true,
                  chunk_count: chunkCount,
                },
                completed_at: new Date().toISOString(),
              })
              .eq('id', job.id)
              .then(() => console.log('Job updated successfully (chunked)'))
              .catch((err: Error) => console.error('Job update failed (chunked):', err))
          },
        })

        return new Response(chunkStream, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      } catch (chunkedError) {
        console.error('processJob: chunked processing failed:', chunkedError)
        const chunkedErrMsg = chunkedError instanceof Error ? chunkedError.message : 'Chunked processing error'

        // REL-004: Mark proposal as failed
        await updateProposalProgress(supabase, proposalId, 'failed', 0, chunkedErrMsg)

        // Update job with error
        await supabase
          .from('proposal_jobs')
          .update({
            status: 'failed',
            error_message: chunkedErrMsg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        return new Response(
          JSON.stringify({
            success: false,
            error: chunkedErrMsg,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }
    }

    // Determine if streaming should be used based on action
    // Proposals, SOW, email, markdown, and goals all stream when async mode is enabled
    const shouldStream = action === 'generate_proposal' || action === 'generate_sow' || action === 'stream_proposal' || action === 'generate_goals' || action === 'generate_email' || action === 'generate_markdown'
    
    // For streaming proposals and SOW, use SSE
    // Goals use streaming only if the job was created with stream: true (check input_data if needed)
    if (shouldStream) {
      // REL-004: Starting content generation via streaming
      await updateProposalProgress(supabase, proposalId, 'generating', 40, 'Generating proposal content...')

      // Use OpenRouter streaming API
      const streamResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterApiKey}`,
          'HTTP-Referer': 'https://sixtyseconds.video',
          'X-Title': 'Sixty Sales Dashboard Proposal Generation',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          stream: true,
        }),
      })

      if (!streamResponse.ok) {
        const errorText = await streamResponse.text()
        let errorMessage = `OpenRouter API error: ${streamResponse.status} - ${errorText}`
        
        // Parse error for better messaging
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.error?.metadata?.raw) {
            const rawError = errorData.error.metadata.raw
            if (rawError.includes('rate-limited')) {
              errorMessage = `Model is temporarily rate-limited. ${rawError.includes('add your own key') ? 'Consider adding your Anthropic API key to OpenRouter settings to increase rate limits.' : 'Please retry in a few moments.'}`
            } else if (rawError.includes('rate limit')) {
              errorMessage = `Rate limit exceeded. Please wait a moment and try again, or add your API key to OpenRouter for higher limits.`
            }
          } else if (errorData.error?.message) {
            errorMessage = `OpenRouter error: ${errorData.error.message}`
          }
        } catch (e) {
          // Keep original error message if parsing fails
        }
        
        throw new Error(errorMessage)
      }

      // Create a readable stream for SSE
      const encoder = new TextEncoder()
      let accumulatedContent = ''
      let totalInputTokens = 0
      let totalOutputTokens = 0

      const stream = new ReadableStream({
        async start(controller) {
          const reader = streamResponse.body?.getReader()
          const decoder = new TextDecoder()

          if (!reader) {
            controller.close()
            return
          }

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value, { stream: true })
              const lines = chunk.split('\n')

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim()
                  if (!data || data === '' || data === '[DONE]') continue
                  
                  try {
                    const parsed = JSON.parse(data)
                    
                    let streamComplete = false

                    // OpenRouter uses OpenAI-compatible format
                    if (parsed.choices && parsed.choices[0]) {
                      const delta = parsed.choices[0].delta
                      if (delta && delta.content) {
                        // Content chunk
                        accumulatedContent += delta.content
                        // Send chunk to client
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: delta.content })}\n\n`))
                      }

                      // Check for finish reason (end of stream)
                      if (parsed.choices[0].finish_reason) {
                        // Stream complete
                        if (parsed.usage) {
                          totalInputTokens = parsed.usage.prompt_tokens || 0
                          totalOutputTokens = parsed.usage.completion_tokens || 0
                        }
                        streamComplete = true
                      }
                    }

                    // Also handle Anthropic format for backward compatibility
                    if (parsed.type === 'message_start') {
                      // Message started
                    } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                      // Content chunk
                      accumulatedContent += parsed.delta.text
                      // Send chunk to client
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: parsed.delta.text })}\n\n`))
                    } else if (parsed.type === 'message_delta' && parsed.usage) {
                      // Usage information
                      totalInputTokens = parsed.usage.input_tokens || 0
                      totalOutputTokens = parsed.usage.output_tokens || 0
                    } else if (parsed.type === 'message_stop') {
                      streamComplete = true
                    }

                    // Process completion for both OpenAI and Anthropic formats
                    if (streamComplete) {
                      // REL-004: Content generation done, assembling final output
                      updateProposalProgress(supabase, proposalId, 'assembling', 80, 'Assembling final document...')
                        .catch((err: Error) => console.warn('Proposal progress update failed (assembling):', err))

                      let finalContent = accumulatedContent

                      if (action === 'generate_goals') {
                        // Goals don't need special processing - just clean
                        finalContent = finalContent.trim()
                      } else if (action === 'generate_sow' || action === 'generate_email' || action === 'generate_markdown') {
                        // For SOW, email, and markdown, ensure it's pure markdown - strip any HTML
                        finalContent = finalContent
                          .replace(/<!DOCTYPE[^>]*>/gi, '')
                          .replace(/<html[^>]*>/gi, '')
                          .replace(/<\/html>/gi, '')
                          .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
                          .replace(/<body[^>]*>/gi, '')
                          .replace(/<\/body>/gi, '')
                          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                          .replace(/<[^>]+>/g, '')
                          .trim()

                        // Remove markdown code block markers
                        finalContent = finalContent.replace(/^```\s*markdown\s*\n?/i, '')
                        finalContent = finalContent.replace(/^```\s*md\s*\n?/i, '')
                        finalContent = finalContent.replace(/^```\s*\n?/g, '')
                        finalContent = finalContent.replace(/\n?```\s*$/g, '')

                        // Ensure it starts with a markdown header or subject line
                        if (!finalContent.startsWith('#') && !finalContent.startsWith('**Subject:**')) {
                          const headerMatch = finalContent.match(/^[^#]*(#+\s+.*)$/m)
                          const subjectMatch = finalContent.match(/^[^*]*(\*\*Subject:\*\*.*)$/m)
                          if (headerMatch) {
                            finalContent = headerMatch[1] + '\n\n' + finalContent.substring(0, headerMatch.index).trim()
                          } else if (subjectMatch) {
                            finalContent = subjectMatch[1] + '\n\n' + finalContent.substring(0, subjectMatch.index).trim()
                          } else {
                            const defaultHeader = action === 'generate_email' 
                              ? '# Email Proposal\n\n**Subject:** Proposal - Ready for Review\n\n---\n\n'
                              : action === 'generate_markdown'
                              ? '# Proposal\n\n'
                              : '# Statement of Work\n\n'
                            finalContent = defaultHeader + finalContent
                          }
                        }
                      } else if (action === 'generate_proposal') {
                        // For proposals, clean HTML: remove all markdown artifacts
                        finalContent = finalContent
                          .replace(/^'''\s*HTML\s*\n?/gi, '')
                          .replace(/^```\s*HTML\s*\n?/gi, '')
                          .replace(/^```html\n?/gi, '')
                          .replace(/\n?```$/gi, '')
                          .replace(/^```\n?/gi, '')
                          .replace(/^html\s*/gi, '')
                          .trim()

                        // Remove any leading "html" text before DOCTYPE
                        if (finalContent.startsWith('html') && !finalContent.startsWith('html>')) {
                          finalContent = finalContent.replace(/^html\s*/i, '').trim()
                        }

                        // Find where actual HTML starts (DOCTYPE or <html)
                        const htmlStart = finalContent.search(/<!DOCTYPE|<html/i)
                        if (htmlStart > 0) {
                          finalContent = finalContent.substring(htmlStart)
                        }

                        // Ensure it starts with DOCTYPE
                        if (!finalContent.startsWith('<!DOCTYPE') && !finalContent.startsWith('<html')) {
                          const htmlMatch = finalContent.match(/<!DOCTYPE[\s\S]*<\/html>/i)
                          if (htmlMatch) {
                            finalContent = htmlMatch[0]
                          } else {
                            finalContent = '<!DOCTYPE html>\n' + finalContent
                          }
                        }

                        // Add CSS for page scrolling and centering
                        const scrollCSS = `
  /* Page scrolling and centering */
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow-x: hidden;
  }

  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    min-height: 100vh;
  }

  .container, main, [class*="container"] {
    max-width: 100%;
    width: 100%;
  }

  @media print {
    section, .slide {
      page-break-after: always;
    }
  }`

                        if (finalContent.includes('<style>')) {
                          finalContent = finalContent.replace(/(<style>)/i, `$1${scrollCSS}`)
                        } else if (finalContent.includes('</head>')) {
                          finalContent = finalContent.replace(/(<\/head>)/i, `<style>${scrollCSS}</style>$1`)
                        }
                      }

                      // Parse and validate AI output into structured sections (REL-003)
                      let streamSections: ProposalSections | null = null
                      try {
                        streamSections = await parseAndValidateAIOutput(finalContent, model, openRouterApiKey)
                        console.log(`processJob: parsed streamed content into ${streamSections.sections.length} structured sections`)
                      } catch (sectionsError) {
                        console.warn('processJob: failed to parse streamed content into sections (non-fatal):', sectionsError)
                      }

                      // Send completion event FIRST (don't block on job update)
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', content: finalContent })}\n\n`))
                      controller.close()

                      // REL-004: Mark proposal as complete (fire and forget)
                      updateProposalProgress(supabase, proposalId, 'complete', 100, 'Proposal ready')
                        .catch((err: Error) => console.warn('Proposal progress update failed (complete):', err))

                      // Update job with final content (non-blocking, fire and forget)
                      supabase
                        .from('proposal_jobs')
                        .update({
                          status: 'completed',
                          output_content: finalContent,
                          ...(streamSections ? { sections: streamSections } : {}),
                          output_usage: {
                            input_tokens: totalInputTokens,
                            output_tokens: totalOutputTokens,
                            total_tokens: totalInputTokens + totalOutputTokens,
                          },
                          completed_at: new Date().toISOString(),
                        })
                        .eq('id', job.id)
                        .then(() => console.log('Job updated successfully'))
                        .catch((err: Error) => console.error('Job update failed:', err))

                      return
                    }
                  } catch (e) {
                    // Skip invalid JSON or empty lines
                    continue
                  }
                }
              }
            }
          } catch (error) {
            const streamErrMsg = error instanceof Error ? error.message : 'Streaming error'

            // REL-004: Mark proposal as failed
            await updateProposalProgress(supabase, proposalId, 'failed', 0, streamErrMsg)

            // Update job with error
            await supabase
              .from('proposal_jobs')
              .update({
                status: 'failed',
                error_message: streamErrMsg,
                completed_at: new Date().toISOString(),
              })
              .eq('id', job.id)

            controller.error(error)
          }
        },
      })

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    // Non-streaming path (for SOW and goals) - should rarely be used now
    // REL-004: Starting non-streaming content generation
    await updateProposalProgress(supabase, proposalId, 'generating', 40, 'Generating proposal content...')

    // Wrapped in retryWithBackoff for transient error resilience (REL-002)
    const data = await retryWithBackoff(async () => {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterApiKey}`,
          'HTTP-Referer': 'https://sixtyseconds.video',
          'X-Title': 'Sixty Sales Dashboard Proposal Generation',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `OpenRouter API error: ${response.status} - ${errorText}`

        // Parse error for better messaging
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.error?.metadata?.raw) {
            const rawError = errorData.error.metadata.raw
            if (rawError.includes('rate-limited')) {
              errorMessage = `Model is temporarily rate-limited. ${rawError.includes('add your own key') ? 'Consider adding your Anthropic API key to OpenRouter settings to increase rate limits.' : 'Please retry in a few moments.'}`
            } else if (rawError.includes('rate limit')) {
              errorMessage = `Rate limit exceeded. Please wait a moment and try again, or add your API key to OpenRouter for higher limits.`
            }
          } else if (errorData.error?.message) {
            errorMessage = `OpenRouter error: ${errorData.error.message}`
          }
        } catch (e) {
          // Keep original error message if parsing fails
        }

        // Non-retryable client errors fail immediately
        if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
          throw new NonRetryableError(errorMessage, response.status)
        }

        // Retryable error (e.g. 429, 500, 502, 503)
        const err = new Error(errorMessage)
        ;(err as any).statusCode = response.status
        throw err
      }

      return await response.json()
    })

    // OpenRouter uses OpenAI-compatible format
    let generatedContent = data.choices?.[0]?.message?.content || data.content?.[0]?.text || ''
    const wasTruncated = data.choices?.[0]?.finish_reason === 'length' || data.stop_reason === 'max_tokens'
    const outputTokens = data.usage?.completion_tokens || data.usage?.output_tokens || 0
    
    // For SOW, email, and markdown, ensure it's pure markdown - strip any HTML that might have been generated
    if (action === 'generate_sow' || action === 'generate_email' || action === 'generate_markdown') {
      // Remove HTML tags and structure if present
      generatedContent = generatedContent
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<html[^>]*>/gi, '')
        .replace(/<\/html>/gi, '')
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<body[^>]*>/gi, '')
        .replace(/<\/body>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '') // Remove any remaining HTML tags
        .trim()
      
      // Ensure it starts with a markdown header or subject line, not HTML
      if (!generatedContent.startsWith('#') && !generatedContent.startsWith('**Subject:**')) {
        // Try to find the first markdown header
        const headerMatch = generatedContent.match(/^[^#]*(#+\s+.*)$/m)
        const subjectMatch = generatedContent.match(/^[^*]*(\*\*Subject:\*\*.*)$/m)
        if (headerMatch) {
          generatedContent = headerMatch[1] + '\n\n' + generatedContent.substring(0, headerMatch.index).trim()
        } else if (subjectMatch) {
          generatedContent = subjectMatch[1] + '\n\n' + generatedContent.substring(0, subjectMatch.index).trim()
        } else {
          // If no header found, add one based on action type
          const defaultHeader = action === 'generate_email' 
            ? '# Email Proposal\n\n**Subject:** Proposal - Ready for Review\n\n---\n\n'
            : action === 'generate_markdown'
            ? '# Proposal\n\n'
            : '# Statement of Work\n\n'
          generatedContent = defaultHeader + generatedContent
        }
      }
    }

    // Handle HTML tag closing if truncated
    let finalContent = generatedContent
    if (wasTruncated && action === 'generate_proposal') {
      const openTags = (generatedContent.match(/<[^/][^>]*>/g) || []).length
      const closeTags = (generatedContent.match(/<\/[^>]+>/g) || []).length
      
      if (openTags > closeTags) {
        const tagStack: string[] = []
        const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g
        let match
        
        while ((match = tagRegex.exec(generatedContent)) !== null) {
          if (match[0].startsWith('</')) {
            const tagName = match[1].toLowerCase()
            const lastIndex = tagStack.lastIndexOf(tagName)
            if (lastIndex !== -1) tagStack.splice(lastIndex, 1)
          } else if (!match[0].endsWith('/>')) {
            const tagName = match[1].toLowerCase()
            if (!['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tagName)) {
              tagStack.push(tagName)
            }
          }
        }
        
        if (tagStack.length > 0) {
          finalContent += '\n' + tagStack.reverse().map(tag => `</${tag}>`).join('\n')
          finalContent += '\n</body>\n</html>'
        }
      }
    }

    // Parse and validate AI output into structured sections (REL-003)
    let syncSections: ProposalSections | null = null
    try {
      syncSections = await parseAndValidateAIOutput(finalContent, model, openRouterApiKey)
      console.log(`processJob: parsed non-streaming content into ${syncSections.sections.length} structured sections`)
    } catch (sectionsError) {
      console.warn('processJob: failed to parse non-streaming content into sections (non-fatal):', sectionsError)
    }

    // REL-004: Assembling and completing
    await updateProposalProgress(supabase, proposalId, 'assembling', 80, 'Assembling final document...')

    // Update job with results
    await supabase
      .from('proposal_jobs')
      .update({
        status: 'completed',
        output_content: finalContent,
        ...(syncSections ? { sections: syncSections } : {}),
        output_usage: {
          input_tokens: data.usage?.input_tokens || 0,
          output_tokens: outputTokens,
          total_tokens: (data.usage?.input_tokens || 0) + outputTokens,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    // REL-004: Mark proposal as complete
    await updateProposalProgress(supabase, proposalId, 'complete', 100, 'Proposal ready')

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        status: 'completed',
        content: finalContent,
        usage: {
          input_tokens: data.usage?.input_tokens || 0,
          output_tokens: outputTokens,
          total_tokens: (data.usage?.input_tokens || 0) + outputTokens,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    const topLevelErrMsg = error instanceof Error ? error.message : 'Unknown error'

    // REL-004: Mark proposal as failed (extract proposalId from input_data if available)
    const topLevelProposalId = job?.input_data?.proposal_id || null
    await updateProposalProgress(supabase, topLevelProposalId, 'failed', 0, topLevelErrMsg)

    // Update job with error
    if (job && job.id) {
      await supabase
        .from('proposal_jobs')
        .update({
          status: 'failed',
          error_message: topLevelErrMsg,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id)
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let body: RequestBody
    let action: string
    
    try {
      body = await req.json() as RequestBody
      action = body.action
      console.log(`Received request for action: ${action}`)
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid request body. Expected JSON.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables')
      throw new Error('Server configuration error: Missing Supabase credentials')
    }

    // Support service role auth (orchestrator inter-function calls)
    const token = authHeader.replace('Bearer ', '')
    const isServiceRole = supabaseServiceKey && token === supabaseServiceKey

    let supabase
    let user: { id: string } | null = null

    if (isServiceRole) {
      // Service role: trust user_id from body
      const bodyUserId = body?.user_id || body?.context?.user_id
      if (!bodyUserId) {
        throw new Error('Service role calls must include user_id')
      }
      supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      user = { id: bodyUserId }
      console.log(`Service role auth for user: ${bodyUserId}`)
    } else {
      supabase = createClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          global: {
            headers: { Authorization: authHeader },
          },
        }
      )

      console.log('Fetching user from auth...')
      try {
        // Add timeout protection for auth call
        const authPromise = supabase.auth.getUser()
        const authTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Authentication timeout')), 15000) // 15 second timeout for reliability
        )

        const { data: userData, error: userError } = await Promise.race([authPromise, authTimeoutPromise]) as any

        if (userError) {
          console.error('Error fetching user:', userError)
          throw new Error(`Authentication error: ${userError.message}`)
        }

        user = userData?.user
      } catch (authError) {
        console.error('Exception during auth.getUser():', authError)
        if (authError instanceof Error && authError.message === 'Authentication timeout') {
          throw new Error('Authentication request timed out. Please try again.')
        }
        throw new Error(`Failed to authenticate: ${authError instanceof Error ? authError.message : 'Unknown error'}`)
      }
    }

    if (!user) {
      console.error('No user found after authentication')
      throw new Error('Unauthorized: User not found')
    }

    console.log(`Authenticated user: ${user.id}`)

    // Look up org and check credit balance for AI-generating actions
    let _costOrgId: string | null = null
    let _adminClient: ReturnType<typeof createClient> | null = null
    const aiActions = new Set(['analyze_focus_areas', 'generate_goals', 'generate_sow', 'generate_proposal', 'stream_proposal', 'process_job'])
    if (aiActions.has(action)) {
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (supabaseServiceKey) {
        _adminClient = createClient(supabaseUrl, supabaseServiceKey)
        const { data: membership } = await _adminClient
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()
        if (membership?.org_id) {
          _costOrgId = membership.org_id
          const balanceCheck = await checkCreditBalance(_adminClient, _costOrgId)
          if (!balanceCheck.allowed) {
            return new Response(
              JSON.stringify({ success: false, error: 'Insufficient credits' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 402 }
            )
          }
        }
      }
    }

    // Temporary action to fix database migration
    if (action === 'update_design_system') {
      try {
        console.log('Starting design system update...');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || supabaseAnonKey;
        
        const supabaseAdmin = createClient(
          supabaseUrl,
          serviceRoleKey,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false
            }
          }
        );

        const designSystemContent = `# Universal Design System
## Clean Light Mode + Premium Glassmorphic Dark Mode

> Production-ready design system for enterprise applications. Framework-agnostic with Inter font family, consistent backdrop blur effects, and comprehensive component patterns.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Installation](#installation)
4. [Theme System](#theme-system)
5. [Color Tokens](#color-tokens)
6. [Typography](#typography)
7. [Button System](#button-system)
8. [Form Components](#form-components)
9. [Layout Components](#layout-components)
10. [Data Display](#data-display)
11. [Feedback Components](#feedback-components)
12. [Navigation Patterns](#navigation-patterns)
13. [Customization Guide](#customization-guide)
14. [Framework Integration](#framework-integration)
15. [Best Practices](#best-practices)

---

## 🎯 Overview

### Design Philosophy

This design system provides:
- **Dual Theme Support**: Clean, minimal light mode and premium glassmorphic dark mode
- **Framework Agnostic**: Works with React, Vue, Svelte, vanilla JavaScript
- **Accessibility First**: WCAG AA compliant with proper contrast ratios
- **Performance Optimized**: Efficient backdrop blur usage and GPU acceleration
- **Developer Experience**: Clear patterns, copy-paste ready components
- **Customizable**: Easy to adapt brand colors, spacing, and styles

### Core Principles

**Light Mode Philosophy:**
- ✨ Pure white (#FFFFFF) and off-white (#FCFCFC) backgrounds
- 🎯 High contrast text (gray-900 primary, gray-700 secondary)
- 💪 Clean borders with gray-200 and gray-300
- 🎨 Minimal shadows, clean aesthetic
- 📱 Mobile-first responsive design

**Dark Mode Philosophy (Glassmorphism):**
- 🌑 Deep dark backgrounds (gray-950: #030712)
- ✨ Glassmorphic cards: \`bg-gray-900/80 backdrop-blur-sm\`
- 💎 Premium glass surfaces: \`rgba(20, 28, 36, 0.6)\` with \`backdrop-filter: blur(16px)\`
- 🔮 Subtle borders: \`border-gray-700/50\` with opacity
- ⚡ Smooth transitions and hover effects
- 🎭 Inset highlights: \`inset 0 1px 0 rgba(255, 255, 255, 0.05)\`

---

## 🎯 Color Tokens

### Light Mode

\`\`\`css
/* Backgrounds */
--bg-primary: #FFFFFF           /* Pure white */
--bg-secondary: #FCFCFC         /* Off-white */
--bg-tertiary: #F3F4F6          /* Gray-100 */

/* Borders */
--border-primary: #E5E7EB       /* Gray-200 */
--border-secondary: #D1D5DB     /* Gray-300 */

/* Text */
--text-primary: #111827         /* Gray-900 */
--text-secondary: #374151       /* Gray-700 */
--text-tertiary: #6B7280        /* Gray-500 */
--text-muted: #9CA3AF           /* Gray-400 */

/* Semantic */
--color-primary: #2563EB        /* Blue-600 */
--color-success: #059669        /* Emerald-600 */
--color-danger: #DC2626         /* Red-600 */
--color-warning: #D97706        /* Amber-600 */
--color-info: #7C3AED           /* Violet-600 */
\`\`\`

### Dark Mode (Glassmorphism)

\`\`\`css
/* Backgrounds */
--bg-primary: #030712           /* Gray-950 */
--bg-secondary: #111827         /* Gray-900 */
--bg-tertiary: #1F2937          /* Gray-800 */

/* Glassmorphism */
--surface-glass: rgba(17, 24, 39, 0.8)
--surface-glass-premium: rgba(20, 28, 36, 0.6)

/* Borders */
--border-primary: rgba(55, 65, 81, 0.5)     /* Gray-700/50 */
--border-secondary: rgba(75, 85, 99, 0.5)   /* Gray-600/50 */

/* Text */
--text-primary: #F3F4F6         /* Gray-100 */
--text-secondary: #D1D5DB       /* Gray-300 */
--text-tertiary: #9CA3AF        /* Gray-400 */
--text-muted: #6B7280           /* Gray-500 */

/* Semantic */
--color-primary: #3DA8F4        /* Blue-400 */
--color-success: #10B981        /* Emerald-500 */
--color-danger: #EF4444         /* Red-500 */
--color-warning: #F59E0B        /* Amber-500 */
--color-info: #8B5CF6           /* Violet-500 */
\`\`\`

---

## 🎯 Design Tokens

| Element | Light Mode | Dark Mode |
|---------|-----------|-----------|
| Page BG | \`#FFFFFF\` | \`#030712\` |
| Card BG | \`white + shadow-sm\` | \`gray-900/80 + backdrop-blur-sm\` |
| Border | \`gray-200\` | \`gray-700/50\` |
| Text Primary | \`gray-900\` | \`gray-100\` |
| Text Secondary | \`gray-700\` | \`gray-300\` |
| Text Tertiary | \`gray-500\` | \`gray-400\` |
| Primary Color | \`blue-600\` | \`blue-400\` |
| Success | \`emerald-600\` | \`emerald-500\` |
| Danger | \`red-600\` | \`red-500\` |`;

        // 1. Try to find existing template
        const { data: existing } = await supabaseAdmin
          .from('proposal_templates')
          .select('id')
          .eq('type', 'design_system')
          .eq('is_default', true);
          
        if (existing && existing.length > 0) {
           console.log(`Found ${existing.length} existing templates. Updating the first one...`);
           // Update the first one
           const { error: updateError } = await supabaseAdmin
             .from('proposal_templates')
             .update({
               content: designSystemContent,
               name: 'Universal Design System',
               updated_at: new Date().toISOString()
             })
             .eq('id', existing[0].id);
             
           if (updateError) throw updateError;
           console.log('Updated existing template.');
        } else {
           console.log('No existing template found. Inserting...');
           const { error: insertError } = await supabaseAdmin
             .from('proposal_templates')
             .insert({
               type: 'design_system',
               content: designSystemContent,
               is_default: true,
               name: 'Universal Design System'
             });
             
           if (insertError) throw insertError;
           console.log('Inserted new template.');
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Design system template updated successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      } catch (e) {
        console.error('Update failed:', e);
        return new Response(
          JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    }

    // Handle job status check
    if (action === 'get_job_status') {
      try {
        const { job_id } = body as GetJobStatusRequest
        
        if (!job_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'job_id is required' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          )
        }
        
        console.log(`Checking job status for job_id: ${job_id}, user_id: ${user.id}`)
        
        // Add timeout protection for database query
        const queryPromise = supabase
          .from('proposal_jobs')
          .select('*')
          .eq('id', job_id)
          .eq('user_id', user.id)
          .maybeSingle() // Use maybeSingle() instead of single() to avoid throwing on no rows
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 10000) // 10 second timeout
        )
        
        const { data: job, error } = await Promise.race([queryPromise, timeoutPromise]) as any

        if (error) {
          console.error('Error fetching job:', error)
          // Handle specific error codes
          if (error.code === 'PGRST116') {
            return new Response(
              JSON.stringify({ success: false, error: 'Job not found' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
            )
          }
          return new Response(
            JSON.stringify({ success: false, error: `Database error: ${error.message}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          )
        }
        
        if (!job) {
          return new Response(
            JSON.stringify({ success: false, error: 'Job not found' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          )
        }

        return new Response(
          JSON.stringify({
            success: true,
            job: {
              id: job.id,
              status: job.status,
              content: job.output_content,
              usage: job.output_usage,
              error: job.error_message,
              created_at: job.created_at,
              completed_at: job.completed_at,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      } catch (error) {
        console.error('Error in get_job_status handler:', error)
        if (error instanceof Error && error.message === 'Database query timeout') {
          return new Response(
            JSON.stringify({ success: false, error: 'Request timed out. Please try again.' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 504 }
          )
        }
        throw error
      }
    }

    // Handle job processing (worker endpoint)
    if (action === 'process_job') {
      const { job_id } = body as ProcessJobRequest
      return await processJob(supabase, user.id, job_id)
    }

    // Handle focus area analysis
    if (action === 'analyze_focus_areas') {
      const { transcripts, contact_name, company_name } = body as AnalyzeFocusAreasRequest
      
      // Get model settings and OpenRouter API key (prefer user's personal key)
      const modelSettings = await getModelSettings(supabase)
      const openRouterApiKey = await getOpenRouterApiKey(supabase, user.id)

      // Fetch available models and find the correct Claude Haiku 4.5 model ID
      // Uses OPENROUTER_API_KEY from Edge Function secrets if user key not available
      console.log('🔍 Fetching available models from OpenRouter to find Claude Haiku 4.5...')
      const haikuModelId = await findClaudeHaiku45Model(openRouterApiKey)
      
      // Validate the model exists before using it
      const isValidModel = await validateModelId(haikuModelId, openRouterApiKey)
      
      if (!isValidModel) {
        console.warn(`⚠️  Model ${haikuModelId} validation failed, but proceeding with it anyway`)
        console.warn('   This may cause errors if the model ID is incorrect')
      } else {
        console.log(`✅ Using validated Claude Haiku model: ${haikuModelId}`)
      }

      const transcriptsText = Array.isArray(transcripts)
        ? transcripts.join('\n\n---\n\n')
        : transcripts || ''

      const focusAreaSystemPrompt = `You are an expert business analyst who identifies key focus areas from meeting transcripts.
Analyze the provided transcript and identify 5-10 key focus areas for a proposal or Statement of Work.

For each focus area, provide:
1. A concise title (5-8 words)
2. A brief description (20-40 words)
3. A category (Strategy, Technology, Operations, Marketing, Financial, Timeline, Deliverables, Risk Management)

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON - no explanatory text
- If the transcript lacks clear focus areas, infer reasonable ones from any business discussion
- Start your response with { and end with }

Return ONLY valid JSON (no markdown, no code blocks):
{
  "focus_areas": [
    {
      "id": "focus-1",
      "title": "Example Focus Area Title",
      "description": "Brief description of what this focus area covers and why it's important.",
      "category": "Strategy"
    }
  ]
}`

      /**
       * Helper to parse focus area JSON from an AI response string
       */
      const parseFocusAreaJson = (content: string): any => {
        let jsonContent = content.trim()

        // Remove markdown code blocks if present
        if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        }

        // Extract JSON object
        const firstBrace = jsonContent.indexOf('{')
        const lastBrace = jsonContent.lastIndexOf('}')

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonContent = jsonContent.substring(firstBrace, lastBrace + 1)
        }

        jsonContent = jsonContent.trim()
        console.log(`Extracted JSON length: ${jsonContent.length} characters`)
        console.log(`JSON preview: ${jsonContent.substring(0, 200)}...`)

        try {
          return JSON.parse(jsonContent)
        } catch (parseError) {
          console.error('JSON parse error:', parseError)
          console.error('Failed to parse content:', jsonContent.substring(0, 500))
          if (jsonContent.toLowerCase().includes('unable to') ||
              jsonContent.toLowerCase().includes('cannot find') ||
              jsonContent.toLowerCase().includes('not enough')) {
            throw new Error('The AI model could not analyze the transcript. Please try again - the transcript may need more context.')
          }
          throw new Error(`Failed to parse AI response. The model may have returned text instead of JSON. Please try again.`)
        }
      }

      try {
        console.log(`Using model: ${haikuModelId}`)
        console.log(`OpenRouter API key prefix: ${openRouterApiKey.substring(0, 10)}...`)
        console.log(`Transcript length: ${transcriptsText.length} chars (chunk threshold: ${CHUNK_CHAR_THRESHOLD})`)

        let allFocusAreas: any[] = []

        if (transcriptsText.length <= CHUNK_CHAR_THRESHOLD) {
          // Short transcript — single call with retry
          const buildPrompt = (text: string) => `Analyze the following meeting transcripts and identify 5-10 key focus areas that should be included in a proposal or Statement of Work.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Meeting Transcripts:
${text}

Focus on:
- Strategic objectives and goals mentioned
- Key challenges or pain points discussed
- Solutions or approaches proposed
- Important deliverables or outcomes
- Timeline or milestone discussions
- Budget or pricing considerations
- Risk factors or concerns raised
- Success metrics or KPIs mentioned

Return ONLY valid JSON with the focus_areas array. Start with { and end with }.`

          const content = await retryWithBackoff(
            () => callOpenRouterForChunk(openRouterApiKey, haikuModelId, focusAreaSystemPrompt, buildPrompt(transcriptsText), 4096),
            3,
            [5000, 10000, 20000], // Longer delays for rate limits on focus analysis
          )

          const parsed = parseFocusAreaJson(content)
          allFocusAreas = parsed.focus_areas || []
        } else {
          // Long transcript — chunk, process in parallel, merge focus areas
          const chunks = chunkTranscript(transcriptsText)
          console.log(`Focus area analysis: chunked ${transcriptsText.length} chars into ${chunks.length} chunks`)

          const chunkResults = await processChunksInParallel(chunks, (chunk) =>
            retryWithBackoff(
              () => callOpenRouterForChunk(
                openRouterApiKey,
                haikuModelId,
                focusAreaSystemPrompt,
                `Analyze the following meeting transcript excerpt and identify key focus areas.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Meeting Transcript (partial):
${chunk}

Return ONLY valid JSON with the focus_areas array. Start with { and end with }.`,
                4096,
              ),
              3,
              [5000, 10000, 20000],
            )
          )

          // Parse and merge focus areas from all chunks
          for (const result of chunkResults) {
            if (result.startsWith('[CHUNK_ERROR]')) {
              console.warn(`Skipping failed chunk: ${result}`)
              continue
            }
            try {
              const parsed = parseFocusAreaJson(result)
              if (parsed.focus_areas && Array.isArray(parsed.focus_areas)) {
                allFocusAreas.push(...parsed.focus_areas)
              }
            } catch (parseErr) {
              console.warn(`Failed to parse focus areas from chunk: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`)
            }
          }

          // Deduplicate focus areas by title similarity
          const seen = new Set<string>()
          allFocusAreas = allFocusAreas.filter((fa: any) => {
            const key = (fa.title || '').toLowerCase().trim()
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })

          // Re-number IDs
          allFocusAreas = allFocusAreas.map((fa: any, idx: number) => ({
            ...fa,
            id: `focus-${idx + 1}`,
          }))

          // Cap at 10 focus areas
          if (allFocusAreas.length > 10) {
            allFocusAreas = allFocusAreas.slice(0, 10)
          }
        }

        if (allFocusAreas.length === 0) {
          throw new Error('No focus areas could be extracted from the transcript. Please try again.')
        }

        // Log AI cost event (fire-and-forget)
        if (_adminClient && _costOrgId) {
          logAICostEvent(_adminClient, user.id, _costOrgId, 'openrouter', haikuModelId, 0, 0, 'content_generation').catch(() => {})
        }

        return new Response(
          JSON.stringify({
            success: true,
            focus_areas: allFocusAreas,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      } catch (error) {
        console.error('Error analyzing focus areas:', error)

        // Provide helpful error message for rate limits
        let errorMessage = error instanceof Error ? error.message : 'Failed to analyze focus areas'
        let statusCode = 500

        if (errorMessage.includes('rate limit') || errorMessage.includes('rate-limited') || errorMessage.includes('429')) {
          statusCode = 429 // Too Many Requests
          if (!errorMessage.includes('openrouter.ai/settings')) {
            errorMessage += '\n\nTo increase rate limits, add your Anthropic API key to OpenRouter at https://openrouter.ai/settings/integrations'
          }
        }

        return new Response(
          JSON.stringify({
            success: false,
            error: errorMessage,
            error_type: errorMessage.includes('rate limit') || errorMessage.includes('429') ? 'rate_limit' : 'unknown',
            help_url: errorMessage.includes('rate limit') ? 'https://openrouter.ai/settings/integrations' : undefined,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: statusCode }
        )
      }
    }

    // Handle generation requests
    const transcripts = (body as GenerateGoalsRequest | AnalyzeFocusAreasRequest).transcripts
    const goals = (body as GenerateSOWRequest | GenerateProposalRequest).goals
    const contact_name = (body as GenerateGoalsRequest | GenerateSOWRequest | GenerateProposalRequest | AnalyzeFocusAreasRequest).contact_name
    const company_name = (body as GenerateGoalsRequest | GenerateSOWRequest | GenerateProposalRequest | AnalyzeFocusAreasRequest).company_name
    const focus_areas = (body as GenerateGoalsRequest | GenerateSOWRequest | GenerateProposalRequest).focus_areas
    const length_target = (body as GenerateSOWRequest | GenerateProposalRequest).length_target
    const word_limit = (body as GenerateSOWRequest | GenerateProposalRequest).word_limit
    const page_target = (body as GenerateSOWRequest | GenerateProposalRequest).page_target
    const async = (body as GenerateProposalRequest | GenerateGoalsRequest).async
    const stream = (body as GenerateProposalRequest | GenerateGoalsRequest).stream
    // REL-004: Optional proposal_id for progress tracking via Supabase Realtime
    const proposal_id = (body as any).proposal_id

    // For proposals, SOW, and goals, ALWAYS use async mode to avoid timeouts
    // Goals now use streaming by default when async is enabled
    const useAsync = (action === 'generate_proposal' || action === 'stream_proposal' || action === 'generate_sow' || action === 'generate_email' || action === 'generate_markdown') || (action === 'generate_goals' && async !== false)
    // Streaming: proposals, SOW, email, markdown, and goals default to streaming when async is enabled
    const useStreaming = ((action === 'generate_proposal' || action === 'stream_proposal' || action === 'generate_sow' || action === 'generate_email' || action === 'generate_markdown') && stream !== false) || (action === 'generate_sow' && stream !== false) || (action === 'generate_goals' && (stream === true || (async === true && stream !== false)))

    if (useAsync) {
      // Create job and return immediately
      const inputData = {
        transcripts: action === 'generate_goals' ? transcripts : undefined,
        goals: action === 'generate_sow' || action === 'generate_proposal' || action === 'generate_email' || action === 'generate_markdown' ? goals : undefined,
        contact_name,
        company_name,
        focus_areas,
        length_target,
        word_limit,
        page_target,
        // REL-004: Pass proposal_id so processJob can stream progress to the proposals row
        proposal_id: proposal_id || undefined,
      }

      const { data: job, error: jobError } = await supabase
        .from('proposal_jobs')
        .insert({
          user_id: user.id,
          action,
          input_data: inputData,
          status: 'pending',
        })
        .select()
        .single()

      if (jobError || !job) {
        // For proposals, never fall back to sync - return error instead
        if (action === 'generate_proposal') {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Failed to create async job: ${jobError?.message || 'Unknown error'}. Please ensure the proposal_jobs table exists.`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          )
        }
        // For goals/SOW, fall back to sync if job creation fails
        console.warn('Job creation failed, falling back to sync mode:', jobError)
      } else {
        // For streaming proposals, SOW, email, markdown, and goals, process immediately and return stream
        if (useStreaming && (action === 'generate_proposal' || action === 'stream_proposal' || action === 'generate_sow' || action === 'generate_goals' || action === 'generate_email' || action === 'generate_markdown')) {
          // Process job with streaming
          return await processJob(supabase, user.id, job.id)
        }
        
        // For non-streaming, start processing asynchronously (don't await)
        // Use setTimeout to ensure the response is sent before processing starts
        // This prevents the Edge Function context from being terminated too early
        setTimeout(() => {
          processJob(supabase, user.id, job.id).catch(err => {
            console.error('Background job processing error:', err)
            // Update job status on error
            supabase
              .from('proposal_jobs')
              .update({
                status: 'failed',
                error_message: err instanceof Error ? err.message : 'Unknown error',
                completed_at: new Date().toISOString(),
              })
              .eq('id', job.id)
              .then(() => {
                console.log('Job status updated to failed')
              })
              .catch(updateErr => {
                console.error('Failed to update job status:', updateErr)
              })
          })
        }, 100) // Small delay to ensure response is sent

        // Log AI cost event (fire-and-forget — actual cost is logged by processJob as content is generated)
        if (_adminClient && _costOrgId) {
          logAICostEvent(_adminClient, user.id, _costOrgId, 'openrouter', 'anthropic/claude-3-5-sonnet-20241022', 0, 0, 'content_generation').catch(() => {})
        }

        return new Response(
          JSON.stringify({
            success: true,
            job_id: job.id,
            status: 'pending',
            message: 'Job created and processing started',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 202 }
        )
      }
    }

    // Synchronous path - ONLY for goals when async is explicitly disabled
    // Proposals and SOW should NEVER reach here (they use async/streaming)
    // Goals should also use async by default, but can fall back to sync if async: false
    if (action !== 'generate_goals') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Proposals and SOW must use async/streaming mode. This should not happen.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }
    
    // If we're here, it means goals generation with async: false (fallback sync mode)

    // Get model settings and OpenRouter API key (prefer user's personal key)
    const modelSettings = await getModelSettings(supabase)
    const openRouterApiKey = await getOpenRouterApiKey(supabase, user.id)

    // Get templates from database
    const { data: templates, error: templateError } = await supabase
      .from('proposal_templates')
      .select('type, content')
      .eq('is_default', true)

    if (templateError) {
      console.error('Error fetching templates:', templateError)
    }

    const goalsTemplate = templates?.find(t => t.type === 'goals')?.content || ''
    const sowTemplate = templates?.find(t => t.type === 'sow')?.content || ''
    const proposalTemplate = templates?.find(t => t.type === 'proposal')?.content || ''
    const designSystemTemplate = templates?.find(t => t.type === 'design_system')?.content || ''

    let prompt = ''
    let systemPrompt = ''

    // Get current date for context
    const currentDate = new Date()
    const dateContext = `IMPORTANT CONTEXT - Current Date: ${currentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })} (${currentDate.toISOString().split('T')[0]})

Use this date as the reference for "today" when creating timelines, deadlines, or any date references in the proposal.
`

    if (action === 'generate_goals') {
      // Generate Goals from transcripts
      systemPrompt = `${dateContext}

You are an expert business consultant who extracts strategic goals and objectives from sales call transcripts. 
Your task is to analyze call transcripts and create a comprehensive Goals & Objectives document.

Use the following example structure as a reference for format and style:
${goalsTemplate}

Key requirements:
- Extract all strategic objectives mentioned in the calls
- Organize goals by category (Marketing, Operations, Revenue Growth, etc.)
- Include specific metrics and timelines where mentioned
- Maintain professional, clear language
- Structure similar to the example provided`

      const transcriptsText = Array.isArray(transcripts) 
        ? transcripts.join('\n\n---\n\n') 
        : transcripts || ''

      const focusAreasText = focus_areas && focus_areas.length > 0
        ? `\n\nFOCUS AREAS TO EMPHASIZE:\n${focus_areas.map((fa: string, idx: number) => `${idx + 1}. ${fa}`).join('\n')}\n\nPlease ensure these focus areas are prominently featured in the Goals & Objectives document.`
        : ''

      prompt = `Analyze the following sales call transcripts and create a comprehensive Goals & Objectives document.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Call Transcripts:
${transcriptsText}${focusAreasText}

Create a Goals & Objectives document following the structure and style of the example provided. Include all strategic objectives, immediate actions, success metrics, timelines, and any other relevant information from the calls.`

    } else if (action === 'generate_sow') {
      // Generate SOW from Goals
      systemPrompt = `${dateContext}

You are an expert proposal writer who creates Statement of Work (SOW) documents in MARKDOWN FORMAT ONLY.

Your task is to transform a Goals & Objectives document into a comprehensive Statement of Work document.

ABSOLUTE REQUIREMENTS - NO EXCEPTIONS:
1. Output format MUST be PURE MARKDOWN (.md) - NO HTML WHATSOEVER
2. Start with markdown headers (# for main title, ## for sections)
3. Use markdown syntax ONLY:
   - # Header, ## Subheader, ### Sub-subheader
   - **bold text** for emphasis
   - - or * for bullet lists
   - 1. 2. 3. for numbered lists
   - [link text](url) for links
   - --- for horizontal rules
4. NEVER use HTML tags like <html>, <head>, <body>, <div>, <span>, <style>, <script>
5. NEVER include CSS styles or JavaScript
6. NEVER use HTML entities or HTML structure
7. The output should be a plain text markdown file that can be opened in any markdown viewer

Example SOW structure (in markdown):
${sowTemplate ? sowTemplate.substring(0, 1000) : '# Statement of Work\n\n## Introduction\n\n...'}

Key requirements:
- Create a professional Statement of Work document in MARKDOWN format
- Include all standard SOW sections (Introduction, Project Objectives, Proposed Solution, Pricing & Terms, etc.)
- Translate goals into actionable project phases and deliverables
- Maintain the same level of detail and professionalism as the example
- Include realistic timelines and pricing structures based on the goals
- Use ONLY Markdown syntax - NO HTML`

      const lengthGuidance = length_target === 'short' 
        ? 'Keep the document concise: under 1000 words, approximately 2 pages.'
        : length_target === 'long'
        ? 'Create a comprehensive document: over 2500 words, approximately 6+ pages.'
        : length_target === 'medium'
        ? 'Create a medium-length document: 1000-2500 words, approximately 3-5 pages.'
        : word_limit
        ? `Target approximately ${word_limit} words.`
        : page_target
        ? `Target approximately ${page_target} pages.`
        : ''

      const focusAreasText = focus_areas && focus_areas.length > 0
        ? `\n\nFOCUS AREAS TO EMPHASIZE:\n${focus_areas.map((fa: string, idx: number) => `${idx + 1}. ${fa}`).join('\n')}\n\nEnsure these focus areas receive appropriate attention in the SOW.`
        : ''

      prompt = `Transform the following Goals & Objectives document into a comprehensive Statement of Work.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Goals & Objectives:
${goals}${focusAreasText}${lengthGuidance ? `\n\nLENGTH REQUIREMENTS:\n${lengthGuidance}` : ''}

CRITICAL: Create a Statement of Work document in PURE MARKDOWN FORMAT. 

DO NOT:
- Use HTML tags (<html>, <head>, <body>, <div>, etc.)
- Include CSS styles or JavaScript
- Use HTML structure or formatting
- Output anything that looks like HTML

DO:
- Use markdown headers (# ## ###)
- Use markdown formatting (**bold**, *italic*, - lists)
- Output plain markdown text that can be saved as a .md file
- Follow the structure and style of the example provided
- Translate the goals into actionable project phases, deliverables, timelines, and pricing

Output ONLY markdown text starting with a # header.`

    } else if (action === 'generate_proposal') {
      // Generate HTML Proposal from Goals
      // Check if design system template is just a file path reference
      const hasDesignSystemContent = designSystemTemplate && !designSystemTemplate.includes('See ') && designSystemTemplate.length > 100
      const designSystemFallback = !hasDesignSystemContent ? `
IMPORTANT DESIGN SYSTEM PRINCIPLES:
- Dark Mode: Deep dark backgrounds (#030712), glassmorphic cards (bg-gray-900/80 backdrop-blur-sm), premium glass surfaces with rgba(20, 28, 36, 0.6) and backdrop-filter: blur(16px)
- Typography: Inter font family, proper text hierarchy (h1: text-3xl font-bold, h2: text-2xl font-semibold, body: text-base)
- Colors: Primary blue (#3DA8F4), success emerald (#10B981), danger red (#EF4444), text colors (gray-100 primary, gray-300 secondary)
- Components: Glassmorphic cards with subtle borders (border-gray-700/50), smooth transitions, hover effects
- Buttons: Use glassmorphic styling with backdrop blur, proper contrast ratios
- Layout: Mobile-first responsive design, proper spacing and padding
` : ''

      systemPrompt = `${dateContext}

You are an expert web developer and proposal designer who creates beautiful, interactive HTML proposal presentations.
Your task is to transform a Goals & Objectives document into a modern, professional HTML proposal presentation.

CRITICAL INSTRUCTION: You must IMMEDIATELY output the complete HTML document. Do NOT:
- Ask for confirmation or clarification
- Ask "Would you like me to proceed?"
- Provide explanations before the HTML
- Output anything except the HTML document itself
Start your response with <!DOCTYPE html> and output ONLY the complete HTML.

Use the following HTML proposal example as a reference for structure, styling, and interactivity:
${proposalTemplate}

Use the following design system guidelines for styling:
${hasDesignSystemContent ? designSystemTemplate : designSystemFallback}

Key requirements:
- Create a complete, standalone HTML file with embedded CSS and JavaScript
- Use the glassmorphic dark theme design system
- Include smooth animations and transitions
- Make it interactive with navigation dots and keyboard controls
- Structure content into logical slides/sections
- Ensure mobile responsiveness
- Include password protection if needed
- Use Tailwind CSS via CDN for styling
- Follow the design system's color tokens, typography, and component patterns

STREAMING GENERATION GUIDANCE (CRITICAL FOR USER EXPERIENCE):
Generate the HTML in complete, logical blocks that build the proposal like a visual story:
1. Start with the complete <!DOCTYPE html>, <head> section, and opening <body> tag as one block
2. Generate each slide/section as a COMPLETE block (full <div class="slide">...</div>)
3. End with closing </body></html> tags as final block
4. Each section should be fully formed and visually complete before moving to the next
5. This allows the user to watch their proposal build up section by section in a visually appealing way
6. Think of it like assembling a beautiful presentation one slide at a time, not streaming raw code`

      const lengthGuidance = length_target === 'short'
        ? 'Keep the proposal concise: under 1000 words, approximately 2 pages. Use fewer slides and more concise content.'
        : length_target === 'long'
        ? 'Create a comprehensive proposal: over 2500 words, approximately 6+ pages. Include detailed sections and multiple slides.'
        : length_target === 'medium'
        ? 'Create a medium-length proposal: 1000-2500 words, approximately 3-5 pages. Balance detail with conciseness.'
        : word_limit
        ? `Target approximately ${word_limit} words. Adjust slide count and content depth accordingly.`
        : page_target
        ? `Target approximately ${page_target} pages. Adjust slide count and content depth accordingly.`
        : ''

      const focusAreasText = focus_areas && focus_areas.length > 0
        ? `\n\nFOCUS AREAS TO EMPHASIZE:\n${focus_areas.map((fa: string, idx: number) => `${idx + 1}. ${fa}`).join('\n')}\n\nEnsure these focus areas receive prominent placement and detailed coverage in the proposal.`
        : ''

      prompt = `Transform the following Goals & Objectives document into a beautiful HTML proposal presentation.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Goals & Objectives:
${goals}${focusAreasText}${lengthGuidance ? `\n\nLENGTH REQUIREMENTS:\n${lengthGuidance}` : ''}

CRITICAL REQUIREMENTS:
- OUTPUT ONLY HTML - no questions, no confirmations, no explanations
- Start immediately with <!DOCTYPE html> - do not ask "Would you like me to proceed?"
- Create a COMPLETE, standalone HTML file with ALL tags properly closed
- The HTML must start with <!DOCTYPE html> and end with </html>
- ALL opening tags must have corresponding closing tags
- The HTML must be fully functional and renderable in a browser
- Ensure the file is complete - do not truncate or leave sections incomplete
- Include all CSS styles within <style> tags
- Include all JavaScript within <script> tags
- Follow the structure, styling, and interactivity of the example provided
- Use the design system guidelines for consistent styling
- The HTML should be a complete, standalone file that can be opened in a browser

BEGIN YOUR RESPONSE WITH <!DOCTYPE html> - NO OTHER TEXT BEFORE IT.`

    } else if (action === 'generate_email') {
      // Generate Email Proposal from Goals
      systemPrompt = `${dateContext}

You are an expert proposal writer who creates professional email proposals in MARKDOWN FORMAT ONLY.

Your task is to transform a Goals & Objectives document into a professional email proposal that can be sent directly to clients.

ABSOLUTE REQUIREMENTS - NO EXCEPTIONS:
1. Output format MUST be PURE MARKDOWN (.md) - NO HTML WHATSOEVER
2. Start with a subject line in the format: **Subject:** [Proposal Title]
3. Use markdown syntax ONLY:
   - **bold text** for emphasis
   - - or * for bullet lists
   - 1. 2. 3. for numbered lists
   - --- for horizontal rules (section separators)
4. NEVER use HTML tags
5. Structure as a professional email with:
   - Subject line
   - Personal greeting
   - Brief overview/introduction
   - Key points/deliverables
   - Pricing/investment (if relevant)
   - Next steps
   - Professional sign-off

Example email proposal structure:
# Email Proposal - [Client Name]

**Subject:** [Company Name] Partnership Proposal - Ready for Review

---

Hi [Client Name],

[Personal opening paragraph connecting to recent conversations]

**Quick Overview:**
- [Key point 1]
- [Key point 2]
- [Key point 3]

[Main content paragraphs]

**Next Steps:**
1. [Action item 1]
2. [Action item 2]
3. [Action item 3]

[Closing paragraph]

Best regards,

[Your Name]
[Title]
[Contact info]

---

*P.S. - [Optional additional note]*

Key requirements:
- Create a professional email proposal in MARKDOWN format
- Keep it concise and scannable (use bullet points and short paragraphs)
- Include all relevant information from the goals
- Make it personal and conversational but professional
- Use ONLY Markdown syntax - NO HTML`

      const lengthGuidance = length_target === 'short' 
        ? 'Keep the email concise: under 500 words, approximately 1 page.'
        : length_target === 'long'
        ? 'Create a comprehensive email: over 1000 words, approximately 2-3 pages. Include detailed sections.'
        : length_target === 'medium'
        ? 'Create a medium-length email: 500-1000 words, approximately 1-2 pages. Balance detail with conciseness.'
        : word_limit
        ? `Target approximately ${word_limit} words.`
        : page_target
        ? `Target approximately ${page_target} pages.`
        : ''

      const focusAreasText = focus_areas && focus_areas.length > 0
        ? `\n\nFOCUS AREAS TO EMPHASIZE:\n${focus_areas.map((fa: string, idx: number) => `${idx + 1}. ${fa}`).join('\n')}\n\nEnsure these focus areas receive appropriate attention in the email.`
        : ''

      prompt = `Transform the following Goals & Objectives document into a professional email proposal.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Goals & Objectives:
${goals}${focusAreasText}${lengthGuidance ? `\n\nLENGTH REQUIREMENTS:\n${lengthGuidance}` : ''}

CRITICAL: Create an email proposal in PURE MARKDOWN FORMAT. 

DO NOT:
- Use HTML tags (<html>, <head>, <body>, <div>, etc.)
- Include CSS styles or JavaScript
- Use HTML structure or formatting
- Output anything that looks like HTML

DO:
- Start with **Subject:** line
- Use markdown formatting (**bold**, *italic*, - lists)
- Output plain markdown text that can be copied into an email
- Follow the structure and style of the example provided
- Translate the goals into a professional, scannable email format
- Keep paragraphs short and use bullet points for lists

Output ONLY markdown text starting with # header and **Subject:** line.`

    } else if (action === 'generate_markdown') {
      // Generate Markdown Proposal from Goals
      systemPrompt = `${dateContext}

You are an expert proposal writer who creates professional proposal documents in MARKDOWN FORMAT ONLY.

Your task is to transform a Goals & Objectives document into a clean, simple markdown proposal document.

ABSOLUTE REQUIREMENTS - NO EXCEPTIONS:
1. Output format MUST be PURE MARKDOWN (.md) - NO HTML WHATSOEVER
2. Start with markdown headers (# for main title, ## for sections)
3. Use markdown syntax ONLY:
   - # Header, ## Subheader, ### Sub-subheader
   - **bold text** for emphasis
   - - or * for bullet lists
   - 1. 2. 3. for numbered lists
   - [link text](url) for links
   - --- for horizontal rules
4. NEVER use HTML tags
5. Structure as a clean proposal document with:
   - Title
   - Introduction/Overview
   - Proposed Solution
   - Deliverables/Scope
   - Timeline (if relevant)
   - Pricing/Investment (if relevant)
   - Next Steps

Example markdown proposal structure:
# Proposal: [Project Name]

## Overview

[Brief introduction]

## Proposed Solution

[Description of solution]

## Deliverables

- [Deliverable 1]
- [Deliverable 2]
- [Deliverable 3]

## Timeline

[Timeline information]

## Investment

[Pricing information]

## Next Steps

1. [Step 1]
2. [Step 2]
3. [Step 3]

Key requirements:
- Create a professional proposal document in MARKDOWN format
- Keep it simple and easy to read
- Include all relevant information from the goals
- Use ONLY Markdown syntax - NO HTML`

      const lengthGuidance = length_target === 'short' 
        ? 'Keep the document concise: under 1000 words, approximately 2 pages.'
        : length_target === 'long'
        ? 'Create a comprehensive document: over 2500 words, approximately 6+ pages.'
        : length_target === 'medium'
        ? 'Create a medium-length document: 1000-2500 words, approximately 3-5 pages.'
        : word_limit
        ? `Target approximately ${word_limit} words.`
        : page_target
        ? `Target approximately ${page_target} pages.`
        : ''

      const focusAreasText = focus_areas && focus_areas.length > 0
        ? `\n\nFOCUS AREAS TO EMPHASIZE:\n${focus_areas.map((fa: string, idx: number) => `${idx + 1}. ${fa}`).join('\n')}\n\nEnsure these focus areas receive appropriate attention in the proposal.`
        : ''

      prompt = `Transform the following Goals & Objectives document into a professional markdown proposal document.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Goals & Objectives:
${goals}${focusAreasText}${lengthGuidance ? `\n\nLENGTH REQUIREMENTS:\n${lengthGuidance}` : ''}

CRITICAL: Create a proposal document in PURE MARKDOWN FORMAT. 

DO NOT:
- Use HTML tags (<html>, <head>, <body>, <div>, etc.)
- Include CSS styles or JavaScript
- Use HTML structure or formatting
- Output anything that looks like HTML

DO:
- Use markdown headers (# ## ###)
- Use markdown formatting (**bold**, *italic*, - lists)
- Output plain markdown text that can be saved as a .md file
- Follow the structure and style of the example provided
- Translate the goals into a clear, professional proposal format

Output ONLY markdown text starting with a # header.`

    } else {
      console.error(`Unknown action received: ${action}`)
      return new Response(
        JSON.stringify({
          success: false,
          error: `Unknown action: ${action}. Supported actions: analyze_focus_areas, generate_goals, generate_sow, generate_proposal, generate_email, generate_markdown, get_job_status, process_job`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Call Claude Sonnet 4.5 for generation
    // This synchronous path only handles goals (SOW and proposals use async/streaming)
    const model = modelSettings.goals_model

    // Use reasonable token limits
    // Note: This synchronous path is only for goals (fallback when async: false), not proposals or SOW
    const maxTokens = 8192 // Reduced for sync path to avoid timeouts

    // --- Chunked processing for sync goals fallback (large transcripts) ---
    const syncTranscriptsText = Array.isArray(transcripts)
      ? transcripts.join('\n\n---\n\n')
      : (transcripts || '')

    if (action === 'generate_goals' && syncTranscriptsText.length > CHUNK_CHAR_THRESHOLD) {
      console.log(`Sync goals fallback: transcript is ${syncTranscriptsText.length} chars, using chunked processing`)

      const syncFocusAreasText = focus_areas && focus_areas.length > 0
        ? `\n\nFOCUS AREAS TO EMPHASIZE:\n${focus_areas.map((fa: string, idx: number) => `${idx + 1}. ${fa}`).join('\n')}\n\nPlease ensure these focus areas are prominently featured in the Goals & Objectives document.`
        : ''

      const buildSyncGoalsPrompt = (transcriptPart: string) => `Analyze the following sales call transcripts and create a comprehensive Goals & Objectives document.

${contact_name ? `Client: ${contact_name}` : ''}
${company_name ? `Company: ${company_name}` : ''}

Call Transcripts:
${transcriptPart}${syncFocusAreasText}

Create a Goals & Objectives document following the structure and style of the example provided. Include all strategic objectives, immediate actions, success metrics, timelines, and any other relevant information from the calls.`

      try {
        const { content: chunkedContent, chunkCount } = await processTranscriptWithChunking(
          syncTranscriptsText,
          openRouterApiKey,
          model,
          systemPrompt,
          buildSyncGoalsPrompt,
          maxTokens,
        )

        return new Response(
          JSON.stringify({
            success: true,
            content: chunkedContent,
            usage: {
              chunked: true,
              chunk_count: chunkCount,
            },
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      } catch (chunkedError) {
        console.error('Sync goals chunked processing failed:', chunkedError)
        return new Response(
          JSON.stringify({
            success: false,
            error: chunkedError instanceof Error ? chunkedError.message : 'Chunked processing error',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }
    }

    // Add timeout wrapper for synchronous requests (goals fallback only)
    // Proposals and SOW should never reach here - they use async mode
    // Increased timeout to 90 seconds for goals generation with focus areas
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 90000) // 90 seconds for sync requests

    try {
      // Wrapped in retryWithBackoff for transient error resilience (REL-002)
      const data = await retryWithBackoff(async () => {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterApiKey}`,
            'HTTP-Referer': 'https://sixtyseconds.video',
            'X-Title': 'Sixty Sales Dashboard Proposal Generation',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            max_tokens: maxTokens,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorText = await response.text()
          let errorMessage = `OpenRouter API error: ${response.status} - ${errorText}`

          // Parse error for better messaging
          try {
            const errorData = JSON.parse(errorText)
            if (errorData.error?.metadata?.raw) {
              const rawError = errorData.error.metadata.raw
              if (rawError.includes('rate-limited')) {
                errorMessage = `Model is temporarily rate-limited. ${rawError.includes('add your own key') ? 'Consider adding your Anthropic API key to OpenRouter settings to increase rate limits.' : 'Please retry in a few moments.'}`
              } else if (rawError.includes('rate limit')) {
                errorMessage = `Rate limit exceeded. Please wait a moment and try again, or add your API key to OpenRouter for higher limits.`
              }
            } else if (errorData.error?.message) {
              errorMessage = `OpenRouter error: ${errorData.error.message}`
            }
          } catch (e) {
            // Keep original error message if parsing fails
          }

          // Non-retryable client errors fail immediately
          if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
            throw new NonRetryableError(errorMessage, response.status)
          }

          // Retryable error (e.g. 429, 500, 502, 503)
          const err = new Error(errorMessage)
          ;(err as any).statusCode = response.status
          throw err
        }

        return await response.json()
      })

      clearTimeout(timeoutId)

      // OpenRouter uses OpenAI-compatible format
      let generatedContent = data.choices?.[0]?.message?.content || data.content?.[0]?.text || ''

      // Note: This synchronous path is only for goals generation
      // SOW and proposals use async/streaming mode, so HTML/Markdown processing is done there

      // Check if response was truncated (finish_reason === 'length' or stop_reason === 'max_tokens')
      const wasTruncated = data.choices?.[0]?.finish_reason === 'length' || data.stop_reason === 'max_tokens'
      const outputTokens = data.usage?.completion_tokens || data.usage?.output_tokens || 0

      return new Response(
        JSON.stringify({
          success: true,
          content: generatedContent,
          usage: {
            input_tokens: data.usage?.input_tokens || 0,
            output_tokens: outputTokens,
            total_tokens: data.usage?.input_tokens + outputTokens || 0,
          },
          ...(wasTruncated ? { warning: `Response reached token limit: ${outputTokens}/${maxTokens} tokens` } : {}),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        const actionName = action === 'generate_goals' ? 'Goals generation' : action === 'generate_sow' ? 'SOW generation' : 'Document generation'
        throw new Error(`Request timeout: ${actionName} took too long. Try reducing the input size or using async mode.`)
      }
      throw error
    }
  } catch (error) {
    console.error('Unhandled error in serve function:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

/**
 * Extract Content Topics Handler
 *
 * Analyzes meeting transcripts using Claude Haiku 4.5 to extract 5-10 marketable
 * discussion topics suitable for social media, blog posts, videos, and newsletters.
 *
 * Features:
 * - Smart caching (checks existing topics unless force_refresh)
 * - Timestamp extraction from transcript context
 * - Fathom URL generation with timestamp parameters
 * - Cost tracking and usage metrics
 * - Comprehensive error handling
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { logAICostEvent } from '../../_shared/costTracking.ts'
import { validateTranscript } from '../../_shared/transcriptValidation.ts'

// ============================================================================
// Types & Interfaces
// ============================================================================

interface RequestBody {
  meeting_id: string
  force_refresh?: boolean
}

interface Topic {
  title: string
  description: string
  timestamp_seconds: number
  fathom_url: string
}

interface ExtractionMetadata {
  model_used: string
  tokens_used: number
  cost_cents: number
  cached: boolean
}

interface SuccessResponse {
  success: true
  topics: Topic[]
  metadata: ExtractionMetadata
}

interface ErrorResponse {
  success: false
  error: string
  details?: string
}

interface ClaudeAPIResponse {
  topics: Array<{
    title: string
    description: string
    timestamp_seconds: number
  }>
}

// ============================================================================
// Constants
// ============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 4096
const TIMEOUT_MS = 30000

// Pricing: Claude Haiku 4.5 costs ~$0.25 per 1M input tokens, ~$1.25 per 1M output tokens
// Average transcript (~10K tokens input) + response (~1K tokens output) ≈ 0.4 cents
const INPUT_COST_PER_TOKEN = 0.25 / 1_000_000 // $0.25 per 1M tokens
const OUTPUT_COST_PER_TOKEN = 1.25 / 1_000_000 // $1.25 per 1M tokens

// ============================================================================
// Main Handler
// ============================================================================

export async function handleContentTopics(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  // Start timing
  const startTime = Date.now()

  try {
    // ========================================================================
    // 1. Request Validation
    // ========================================================================

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse<ErrorResponse>(
        { success: false, error: 'Missing authorization header' },
        401
      )
    }

    let body: RequestBody
    try {
      body = await req.json()
    } catch (error) {
      return jsonResponse<ErrorResponse>(
        { success: false, error: 'Invalid JSON in request body' },
        400
      )
    }

    const { meeting_id, force_refresh = false } = body

    if (!meeting_id || typeof meeting_id !== 'string') {
      return jsonResponse<ErrorResponse>(
        { success: false, error: 'Invalid meeting_id: must be a valid UUID string' },
        400
      )
    }
    // ========================================================================
    // 2. Initialize Supabase Client (with RLS using user's token)
    // ========================================================================

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get user from auth token for user_id
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse<ErrorResponse>(
        { success: false, error: 'Authentication failed', details: userError?.message },
        401
      )
    }

    const userId = user.id

    // ========================================================================
    // 3. Check Cache (unless force_refresh)
    // ========================================================================

    if (!force_refresh) {
      const { data: cachedTopics, error: cacheError } = await supabaseClient
        .from('meeting_content_topics')
        .select('topics, model_used, tokens_used, cost_cents, created_at')
        .eq('meeting_id', meeting_id)
        .is('deleted_at', null)
        .order('extraction_version', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (cachedTopics && !cacheError) {
        // Parse and validate cached topics
        const topics = await parseAndEnrichTopics(
          cachedTopics.topics as any,
          meeting_id,
          supabaseClient
        )

        const responseTime = Date.now() - startTime
        return jsonResponse<SuccessResponse>({
          success: true,
          topics,
          metadata: {
            model_used: cachedTopics.model_used,
            tokens_used: cachedTopics.tokens_used,
            cost_cents: cachedTopics.cost_cents,
            cached: true,
          },
        })
      }
    } else {
    }

    // ========================================================================
    // 4. Fetch Meeting and Verify Ownership (via RLS)
    // ========================================================================

    const { data: meeting, error: meetingError } = await supabaseClient
      .from('meetings')
      .select('id, title, transcript_text, share_url, meeting_start')
      .eq('id', meeting_id)
      .single()

    if (meetingError || !meeting) {
      return jsonResponse<ErrorResponse>(
        { success: false, error: 'Meeting not found or access denied' },
        404
      )
    }

    // ========================================================================
    // 5. Validate Transcript Availability
    // ========================================================================

    const transcriptValidation = validateTranscript(meeting.transcript_text)
    if (!transcriptValidation.valid) {
      return jsonResponse<ErrorResponse>(
        {
          success: false,
          error: transcriptValidation.error,
          details: transcriptValidation.details,
        },
        422
      )
    }
    // ========================================================================
    // 6. Call Claude API for Topic Extraction
    // ========================================================================

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      return jsonResponse<ErrorResponse>(
        { success: false, error: 'AI service not configured' },
        500
      )
    }

    const prompt = buildExtractionPrompt(meeting.transcript_text, meeting)

    let claudeResponse: ClaudeAPIResponse
    let tokensUsed = 0
    let inputTokens = 0
    let outputTokens = 0

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          temperature: 0.3, // Lower temperature for more consistent extraction
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        // Retry logic for specific errors
        if (response.status === 429 || response.status === 503) {
          return jsonResponse<ErrorResponse>(
            {
              success: false,
              error: 'AI service temporarily unavailable',
              details: 'Please try again in a few moments',
            },
            503,
            { 'Retry-After': '10' }
          )
        }

        throw new Error(`Claude API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      const content = data.content[0]?.text || ''

      inputTokens = data.usage?.input_tokens || 0
      outputTokens = data.usage?.output_tokens || 0
      tokensUsed = inputTokens + outputTokens
      // Parse Claude's JSON response
      claudeResponse = parseClaudeResponse(content)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return jsonResponse<ErrorResponse>(
          { success: false, error: 'Request timeout', details: 'AI processing took too long' },
          504
        )
      }

      return jsonResponse<ErrorResponse>(
        { success: false, error: 'AI service error', details: (error as Error).message },
        503,
        { 'Retry-After': '10' }
      )
    }

    // ========================================================================
    // 7. Calculate Cost
    // ========================================================================

    const costCents = Math.ceil(
      inputTokens * INPUT_COST_PER_TOKEN * 100 + outputTokens * OUTPUT_COST_PER_TOKEN * 100
    )

    // Log AI cost event (fire-and-forget)
    {
      const svcClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )
      const { data: mem } = await svcClient
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()
      logAICostEvent(
        svcClient, userId, mem?.org_id ?? null,
        'anthropic', MODEL,
        inputTokens, outputTokens,
        'extract_content_topics',
      ).catch((e: unknown) => console.warn('[extract-content-topics] cost log error:', e))
    }

    // ========================================================================
    // 8. Enrich Topics with Fathom URLs
    // ========================================================================

    const shareUrl = meeting.share_url || `https://app.fathom.video/meetings/${meeting_id}`
    const enrichedTopics: Topic[] = claudeResponse.topics.map((topic) => ({
      title: topic.title,
      description: topic.description,
      timestamp_seconds: topic.timestamp_seconds,
      fathom_url: `${shareUrl}?timestamp=${topic.timestamp_seconds}`,
    }))
    // ========================================================================
    // 9. Store in Database
    // ========================================================================

    // Use service role for insert to bypass RLS complications
    const supabaseServiceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if existing record exists to determine extraction_version
    const { data: existing } = await supabaseServiceClient
      .from('meeting_content_topics')
      .select('extraction_version')
      .eq('meeting_id', meeting_id)
      .is('deleted_at', null)
      .order('extraction_version', { ascending: false })
      .limit(1)
      .single()

    const extractionVersion = existing ? existing.extraction_version + 1 : 1

    const { error: insertError } = await supabaseServiceClient
      .from('meeting_content_topics')
      .insert({
        meeting_id,
        user_id: userId,
        topics: claudeResponse.topics, // Store raw topics (without fathom_url)
        model_used: MODEL,
        tokens_used: tokensUsed,
        cost_cents: costCents,
        extraction_version: extractionVersion,
        created_by: userId,
      })

    if (insertError) {
      return jsonResponse<ErrorResponse>(
        { success: false, error: 'Failed to store topics', details: insertError.message },
        500
      )
    }
    // ========================================================================
    // 10. Return Success Response
    // ========================================================================

    const responseTime = Date.now() - startTime
    return jsonResponse<SuccessResponse>({
      success: true,
      topics: enrichedTopics,
      metadata: {
        model_used: MODEL,
        tokens_used: tokensUsed,
        cost_cents: costCents,
        cached: false,
      },
    })
  } catch (error) {
    return jsonResponse<ErrorResponse>(
      { success: false, error: 'Internal server error', details: (error as Error).message },
      500
    )
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build the AI prompt for topic extraction
 */
function buildExtractionPrompt(transcript: string, meeting: any): string {
  const meetingDate = meeting.meeting_start
    ? new Date(meeting.meeting_start).toLocaleDateString()
    : 'Unknown'

  return `You are analyzing a business meeting transcript to identify marketable content opportunities.

MEETING CONTEXT:
- Title: ${meeting.title || 'Untitled Meeting'}
- Date: ${meetingDate}

MEETING TRANSCRIPT:
${transcript}

TASK:
Extract 5-10 discussion topics that would make compelling marketing content (social media posts, blog articles, video clips, newsletters).

For each topic, provide:
1. **Title**: Compelling, concise title (5-8 words) that captures the essence
2. **Description**: Clear summary (20-40 words) explaining the value and key insights
3. **Timestamp**: Approximate timestamp in seconds where this topic was discussed

FOCUS AREAS:
- Key insights and takeaways that provide value to an audience
- Interesting challenges and how they were solved
- Expert opinions, advice, and recommendations
- Actionable strategies and frameworks
- Customer success stories and case studies
- Industry trends and future predictions
- Thought-provoking questions and answers
- Surprising facts or counterintuitive insights

TIMESTAMP GUIDELINES:
- Look for explicit timestamp markers in transcript (e.g., "01:23", "at 5 minutes 42 seconds")
- If no explicit timestamps, estimate based on transcript position:
  * Beginning of transcript = 0-300 seconds
  * Early-middle = 300-600 seconds
  * Middle = 600-900 seconds
  * Late-middle = 900-1200 seconds
  * End = 1200+ seconds
- Be as accurate as possible; timestamps will be used for direct video links

QUALITY CRITERIA:
- Topics should be substantive (not just pleasantries or logistics)
- Prefer topics with broad appeal and shareable insights
- Avoid overly niche or inside-baseball topics unless exceptionally valuable
- Each topic should stand alone as a piece of content

RESPONSE FORMAT:
Respond with ONLY valid JSON (no markdown formatting, no code blocks):

{
  "topics": [
    {
      "title": "Building High-Performance Teams in Remote Environments",
      "description": "Practical strategies for maintaining team cohesion and productivity when working remotely, including communication frameworks and tool recommendations.",
      "timestamp_seconds": 245
    },
    {
      "title": "The Future of AI in Customer Service",
      "description": "Expert analysis of emerging AI technologies transforming customer support, with predictions for the next 2-3 years and implementation advice.",
      "timestamp_seconds": 890
    }
  ]
}

IMPORTANT:
- Return ONLY the JSON object, no other text or formatting
- Include 5-10 topics (aim for quality over quantity)
- Ensure all timestamps are integers (seconds)
- Make titles engaging and benefit-focused
- Keep descriptions concise but informative (20-40 words)`
}

/**
 * Parse and validate Claude's JSON response
 */
function parseClaudeResponse(content: string): ClaudeAPIResponse {
  try {
    // Remove markdown code blocks if present
    let jsonText = content.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '')
    }

    const parsed = JSON.parse(jsonText)

    // Validate structure
    if (!parsed.topics || !Array.isArray(parsed.topics)) {
      throw new Error('Response missing or invalid "topics" array')
    }

    if (parsed.topics.length === 0) {
      throw new Error('No topics extracted from transcript')
    }

    if (parsed.topics.length > 15) {
      parsed.topics = parsed.topics.slice(0, 10)
    }

    // Validate and normalize each topic
    const validatedTopics = parsed.topics.map((topic: any, index: number) => {
      if (!topic.title || typeof topic.title !== 'string') {
        throw new Error(`Topic ${index + 1} missing or invalid "title"`)
      }

      if (!topic.description || typeof topic.description !== 'string') {
        throw new Error(`Topic ${index + 1} missing or invalid "description"`)
      }

      if (
        topic.timestamp_seconds === undefined ||
        typeof topic.timestamp_seconds !== 'number' ||
        topic.timestamp_seconds < 0
      ) {
        throw new Error(`Topic ${index + 1} missing or invalid "timestamp_seconds"`)
      }

      return {
        title: topic.title.trim(),
        description: topic.description.trim(),
        timestamp_seconds: Math.floor(topic.timestamp_seconds),
      }
    })

    return { topics: validatedTopics }
  } catch (error) {
    throw new Error(`Failed to parse AI response: ${(error as Error).message}`)
  }
}

/**
 * Parse cached topics from database and enrich with Fathom URLs
 */
async function parseAndEnrichTopics(
  cachedTopics: any,
  meetingId: string,
  supabaseClient: any
): Promise<Topic[]> {
  // Fetch meeting share_url
  const { data: meeting } = await supabaseClient
    .from('meetings')
    .select('share_url')
    .eq('id', meetingId)
    .single()

  const shareUrl = meeting?.share_url || `https://app.fathom.video/meetings/${meetingId}`

  if (!Array.isArray(cachedTopics)) {
    throw new Error('Cached topics is not an array')
  }

  return cachedTopics.map((topic: any) => ({
    title: topic.title,
    description: topic.description,
    timestamp_seconds: topic.timestamp_seconds,
    fathom_url: `${shareUrl}?timestamp=${topic.timestamp_seconds}`,
  }))
}

/**
 * Helper to create JSON responses with consistent headers
 */
function jsonResponse<T>(
  data: T,
  status = 200,
  additionalHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      ...additionalHeaders,
    },
  })
}

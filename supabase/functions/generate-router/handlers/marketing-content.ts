/**
 * Handler: generate-marketing-content
 * Uses Claude to generate marketing content from meeting transcripts.
 * Imports prompts from the original function's prompts.ts.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.43.4'
import { buildContentPrompt } from '../../generate-marketing-content/prompts.ts'
import { checkCreditBalance, logAICostEvent, extractAnthropicUsage } from '../../_shared/costTracking.ts'

// ============================================================================
// Types & Interfaces
// ============================================================================

interface RequestBody {
  meeting_id: string
  content_type: 'social' | 'blog' | 'video' | 'email'
  selected_topic_indices: number[]
  regenerate?: boolean
}

interface Topic {
  title: string
  description: string
  timestamp_seconds: number
}

interface GeneratedContent {
  id: string
  title: string
  content: string
  content_type: string
  version: number
}

interface GenerationMetadata {
  model_used: string
  tokens_used: number
  cost_cents: number
  cached: boolean
  topics_used: number
}

interface SuccessResponse {
  success: true
  content: GeneratedContent
  metadata: GenerationMetadata
}

interface ErrorResponse {
  success: false
  error: string
  details?: string
}

// ============================================================================
// Constants
// ============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'claude-sonnet-4-5-20250929'
const MAX_TOKENS = 8192
const TIMEOUT_MS = 120000

const INPUT_COST_PER_TOKEN = 3.0 / 1_000_000
const OUTPUT_COST_PER_TOKEN = 15.0 / 1_000_000

const VALID_CONTENT_TYPES = ['social', 'blog', 'video', 'email'] as const

const EXCERPT_CONTEXT_CHARS = 1500

// ============================================================================
// Main Handler
// ============================================================================

export async function handleMarketingContent(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const startTime = Date.now()

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse<ErrorResponse>({ success: false, error: 'Missing authorization header' }, 401)
    }

    let body: RequestBody
    try {
      body = await req.json()
    } catch (error) {
      return jsonResponse<ErrorResponse>({ success: false, error: 'Invalid JSON in request body' }, 400)
    }

    const { meeting_id, content_type, selected_topic_indices, regenerate = false } = body

    if (!meeting_id || typeof meeting_id !== 'string') {
      return jsonResponse<ErrorResponse>({ success: false, error: 'Invalid meeting_id: must be a valid UUID string' }, 400)
    }

    if (!VALID_CONTENT_TYPES.includes(content_type)) {
      return jsonResponse<ErrorResponse>({ success: false, error: `Invalid content_type: must be one of ${VALID_CONTENT_TYPES.join(', ')}` }, 400)
    }

    if (!Array.isArray(selected_topic_indices) || selected_topic_indices.length === 0 ||
        !selected_topic_indices.every((idx) => typeof idx === 'number' && idx >= 0)) {
      return jsonResponse<ErrorResponse>({ success: false, error: 'Invalid selected_topic_indices: must be a non-empty array of non-negative integers' }, 400)
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return jsonResponse<ErrorResponse>({ success: false, error: 'Authentication failed', details: userError?.message }, 401)
    }

    const userId = user.id

    const { data: membership } = await supabaseClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    const orgId = membership?.org_id ?? null

    if (orgId) {
      const balanceCheck = await checkCreditBalance(supabaseClient, orgId)
      if (!balanceCheck.allowed) {
        return jsonResponse<ErrorResponse>({ success: false, error: 'Insufficient credits. Please top up to continue.' }, 402)
      }
    }

    if (!regenerate) {
      const { data: cachedContent, error: cacheError } = await supabaseClient
        .from('meeting_generated_content')
        .select('id, title, content, content_type, version, model_used, tokens_used, cost_cents, created_at')
        .eq('meeting_id', meeting_id)
        .eq('content_type', content_type)
        .eq('is_latest', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (cachedContent && !cacheError) {
        return jsonResponse<SuccessResponse>({
          success: true,
          content: {
            id: cachedContent.id, title: cachedContent.title,
            content: cachedContent.content, content_type: cachedContent.content_type,
            version: cachedContent.version,
          },
          metadata: {
            model_used: cachedContent.model_used, tokens_used: cachedContent.tokens_used,
            cost_cents: cachedContent.cost_cents, cached: true, topics_used: selected_topic_indices.length,
          },
        })
      }
    }

    const { data: meeting, error: meetingError } = await supabaseClient
      .from('meetings')
      .select('id, title, transcript_text, share_url, meeting_start')
      .eq('id', meeting_id)
      .single()

    if (meetingError || !meeting) {
      return jsonResponse<ErrorResponse>({ success: false, error: 'Meeting not found or access denied' }, 404)
    }

    if (!meeting.transcript_text || meeting.transcript_text.trim().length < 50) {
      return jsonResponse<ErrorResponse>({ success: false, error: 'This meeting does not have a transcript yet', details: 'Please wait for the transcript to be processed' }, 422)
    }

    const { data: topicsData, error: topicsError } = await supabaseClient
      .from('meeting_content_topics')
      .select('id, topics')
      .eq('meeting_id', meeting_id)
      .is('deleted_at', null)
      .order('extraction_version', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (topicsError || !topicsData) {
      return jsonResponse<ErrorResponse>({ success: false, error: 'No topics extracted for this meeting yet', details: 'Please run topic extraction first' }, 422)
    }

    const topicsExtractionId = topicsData.id
    const allTopics = topicsData.topics as Topic[]

    const invalidIndices = selected_topic_indices.filter((idx) => idx >= allTopics.length)
    if (invalidIndices.length > 0) {
      return jsonResponse<ErrorResponse>({ success: false, error: `Invalid topic indices: ${invalidIndices.join(', ')} (max index: ${allTopics.length - 1})` }, 400)
    }

    const selectedTopics = selected_topic_indices.map((idx) => allTopics[idx])

    const transcriptExcerpt = buildTranscriptExcerpt(meeting.transcript_text, selectedTopics)

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      return jsonResponse<ErrorResponse>({ success: false, error: 'AI service not configured' }, 500)
    }

    const fathomBaseUrl = meeting.share_url || `https://app.fathom.video/meetings/${meeting_id}`
    const meetingDate = meeting.meeting_start ? new Date(meeting.meeting_start).toLocaleDateString() : 'Unknown'

    const prompt = buildContentPrompt(content_type, {
      meetingTitle: meeting.title || 'Untitled Meeting',
      meetingDate, topics: selectedTopics, transcriptExcerpt, fathomBaseUrl,
    })

    let generatedText: string
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
          model: MODEL, max_tokens: MAX_TOKENS, temperature: 0.7,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        if (response.status === 429 || response.status === 503) {
          return jsonResponse<ErrorResponse>(
            { success: false, error: 'AI service temporarily unavailable', details: 'Please try again in a few moments' },
            503, { 'Retry-After': '10' }
          )
        }
        throw new Error(`Claude API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      generatedText = data.content[0]?.text || ''
      inputTokens = data.usage?.input_tokens || 0
      outputTokens = data.usage?.output_tokens || 0
      tokensUsed = inputTokens + outputTokens

      if (orgId) {
        await logAICostEvent(supabaseClient, userId, orgId, 'anthropic', MODEL, inputTokens, outputTokens, 'content_generation')
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return jsonResponse<ErrorResponse>({ success: false, error: 'Request timeout', details: 'AI processing took too long' }, 504)
      }
      return jsonResponse<ErrorResponse>(
        { success: false, error: 'AI service error', details: (error as Error).message },
        503, { 'Retry-After': '10' }
      )
    }

    const { title, content } = parseGeneratedContent(generatedText, content_type)

    const costCents = Math.ceil(
      inputTokens * INPUT_COST_PER_TOKEN * 100 + outputTokens * OUTPUT_COST_PER_TOKEN * 100
    )

    const supabaseServiceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: existing } = await supabaseServiceClient
      .from('meeting_generated_content')
      .select('id, version')
      .eq('meeting_id', meeting_id)
      .eq('content_type', content_type)
      .eq('is_latest', true)
      .is('deleted_at', null)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    const newVersion = existing ? existing.version + 1 : 1
    const parentId = existing?.id || null

    if (existing) {
      await supabaseServiceClient
        .from('meeting_generated_content')
        .update({ is_latest: false })
        .eq('id', existing.id)
    }

    const { data: insertedContent, error: insertError } = await supabaseServiceClient
      .from('meeting_generated_content')
      .insert({
        meeting_id, content_type, title, content,
        version: newVersion, parent_id: parentId, is_latest: true,
        model_used: MODEL, tokens_used: tokensUsed, cost_cents: costCents, created_by: userId,
      })
      .select('id')
      .single()

    if (insertError || !insertedContent) {
      return jsonResponse<ErrorResponse>({ success: false, error: 'Failed to store content', details: insertError?.message }, 500)
    }

    const contentId = insertedContent.id

    const topicLinks = selected_topic_indices.map((topicIndex) => ({
      generated_content_id: contentId,
      topics_extraction_id: topicsExtractionId,
      topic_index: topicIndex,
    }))

    await supabaseServiceClient.from('content_topic_links').insert(topicLinks)

    return jsonResponse<SuccessResponse>({
      success: true,
      content: { id: contentId, title, content, content_type, version: newVersion },
      metadata: { model_used: MODEL, tokens_used: tokensUsed, cost_cents: costCents, cached: false, topics_used: selectedTopics.length },
    })
  } catch (error) {
    return jsonResponse<ErrorResponse>({ success: false, error: 'Internal server error', details: (error as Error).message }, 500)
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildTranscriptExcerpt(transcript: string, topics: Topic[]): string {
  if (transcript.length <= 20000) {
    return transcript
  }
  return transcript.substring(0, 10000) + '\n\n[... transcript continues ...]'
}

function parseGeneratedContent(generatedText: string, contentType: string): { title: string; content: string } {
  const lines = generatedText.trim().split('\n')
  const headingMatch = lines.find((line) => line.match(/^#{1,2}\s+.+/))

  if (headingMatch) {
    const title = headingMatch.replace(/^#{1,2}\s+/, '').trim()
    const contentLines = lines.filter(line => line !== headingMatch)
    const content = contentLines.join('\n').trim()
    return { title, content }
  }

  if (contentType === 'social') {
    const firstLine = lines[0]?.trim() || 'Untitled Social Post'
    const title = firstLine.substring(0, 80)
    return { title, content: generatedText.trim() }
  }

  const defaultTitles = {
    social: 'Social Media Post',
    blog: 'Blog Article',
    video: 'Video Script',
    email: 'Email Newsletter',
  }

  return {
    title: defaultTitles[contentType as keyof typeof defaultTitles] || 'Generated Content',
    content: generatedText.trim(),
  }
}

function jsonResponse<T>(data: T, status = 200, additionalHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...additionalHeaders },
  })
}

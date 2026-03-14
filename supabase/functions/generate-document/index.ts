// supabase/functions/generate-document/index.ts
// DOC-003: Universal document generator — generates any of the 8 document types
// using Haiku + Brain context from meeting data.
//
// Auth: Service-role (internal call). Deploy with --no-verify-jwt on staging.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'
import {
  getDocumentTypeConfig,
  type DocumentType,
} from '../_shared/documents/documentTypeRegistry.ts'
import { getBrainContext } from '../_shared/skills/brainContextCache.ts'

// =============================================================================
// Constants
// =============================================================================

const LOG_PREFIX = '[generate-document]'
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const BRAIN_TABLES = ['contact_memory', 'deal_memory_events'] as const

// =============================================================================
// Types
// =============================================================================

interface GenerateDocumentRequest {
  document_type: DocumentType
  org_id: string
  user_id: string
  deal_id?: string
  contact_id?: string
  meeting_context: {
    summary: string
    next_steps: string
    transcript_excerpt?: string
  }
}

interface DocumentSection {
  type: string
  title: string
  content: string
}

// =============================================================================
// Validation
// =============================================================================

function validateRequest(body: unknown): { valid: true; data: GenerateDocumentRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' }
  }

  const b = body as Record<string, unknown>

  if (!b.document_type || typeof b.document_type !== 'string') {
    return { valid: false, error: 'document_type is required' }
  }

  if (!b.org_id || typeof b.org_id !== 'string') {
    return { valid: false, error: 'org_id is required' }
  }

  if (!b.user_id || typeof b.user_id !== 'string') {
    return { valid: false, error: 'user_id is required' }
  }

  if (!b.meeting_context || typeof b.meeting_context !== 'object') {
    return { valid: false, error: 'meeting_context is required' }
  }

  const mc = b.meeting_context as Record<string, unknown>
  if (!mc.summary || typeof mc.summary !== 'string') {
    return { valid: false, error: 'meeting_context.summary is required' }
  }
  if (!mc.next_steps || typeof mc.next_steps !== 'string') {
    return { valid: false, error: 'meeting_context.next_steps is required' }
  }

  // Validate document_type is known
  try {
    getDocumentTypeConfig(b.document_type as DocumentType)
  } catch {
    return { valid: false, error: `Unknown document_type: ${b.document_type}` }
  }

  return {
    valid: true,
    data: {
      document_type: b.document_type as DocumentType,
      org_id: b.org_id as string,
      user_id: b.user_id as string,
      deal_id: typeof b.deal_id === 'string' ? b.deal_id : undefined,
      contact_id: typeof b.contact_id === 'string' ? b.contact_id : undefined,
      meeting_context: {
        summary: mc.summary as string,
        next_steps: mc.next_steps as string,
        transcript_excerpt: typeof mc.transcript_excerpt === 'string' ? mc.transcript_excerpt : undefined,
      },
    },
  }
}

// =============================================================================
// Haiku Generation
// =============================================================================

async function callHaiku(
  systemPrompt: string,
  userMessage: string,
): Promise<{ sections: DocumentSection[]; duration_ms: number }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const startTime = Date.now()

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 4096,
      temperature: 0.3,
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
    console.error(`${LOG_PREFIX} Haiku API error (${response.status}):`, errorText)
    throw new Error(`Haiku API returned ${response.status}: ${errorText}`)
  }

  const result = await response.json()
  const duration_ms = Date.now() - startTime

  // Extract text content from the response
  const textBlock = result.content?.find((block: { type: string }) => block.type === 'text')
  if (!textBlock?.text) {
    throw new Error('Haiku returned no text content')
  }

  // Parse JSON from the response — handle markdown code blocks
  let jsonText = textBlock.text.trim()
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  let sections: DocumentSection[]
  try {
    sections = JSON.parse(jsonText)
  } catch (parseErr) {
    console.error(`${LOG_PREFIX} Failed to parse Haiku JSON output:`, jsonText.slice(0, 500))
    throw new Error(`Failed to parse Haiku output as JSON: ${(parseErr as Error).message}`)
  }

  if (!Array.isArray(sections)) {
    throw new Error('Haiku output is not a JSON array')
  }

  return { sections, duration_ms }
}

// =============================================================================
// User Message Builder
// =============================================================================

function buildUserMessage(
  req: GenerateDocumentRequest,
  brainFormatted: string,
  dealInfo: Record<string, unknown> | null,
  contactInfo: Record<string, unknown> | null,
): string {
  const parts: string[] = []

  parts.push('## Meeting Context')
  parts.push(`**Summary:** ${req.meeting_context.summary}`)
  parts.push(`**Next Steps:** ${req.meeting_context.next_steps}`)
  if (req.meeting_context.transcript_excerpt) {
    parts.push(`**Transcript Excerpt:** ${req.meeting_context.transcript_excerpt}`)
  }

  if (brainFormatted) {
    parts.push('')
    parts.push(brainFormatted)
  }

  if (dealInfo) {
    parts.push('')
    parts.push('## Deal Information')
    if (dealInfo.name) parts.push(`**Deal:** ${dealInfo.name}`)
    if (dealInfo.value) parts.push(`**Value:** ${dealInfo.value}`)
    if (dealInfo.stage) parts.push(`**Stage:** ${dealInfo.stage}`)
    if (dealInfo.company_name) parts.push(`**Company:** ${dealInfo.company_name}`)
  }

  if (contactInfo) {
    parts.push('')
    parts.push('## Contact Information')
    if (contactInfo.name) parts.push(`**Contact:** ${contactInfo.name}`)
    if (contactInfo.email) parts.push(`**Email:** ${contactInfo.email}`)
    if (contactInfo.company) parts.push(`**Company:** ${contactInfo.company}`)
    if (contactInfo.job_title) parts.push(`**Title:** ${contactInfo.job_title}`)
  }

  parts.push('')
  parts.push('Generate the document sections as a JSON array. Each section must have: { "type": "<section_name>", "title": "<display title>", "content": "<markdown content>" }')
  parts.push('Return ONLY the JSON array, no other text.')

  return parts.join('\n')
}

// =============================================================================
// Handler
// =============================================================================

serve(async (req: Request) => {
  // CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  // Only accept POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  try {
    // Parse and validate request
    const body = await req.json()
    const validation = validateRequest(body)
    if (!validation.valid) {
      return errorResponse(validation.error, req, 400)
    }
    const data = validation.data

    console.log(`${LOG_PREFIX} Generating ${data.document_type} for org=${data.org_id}`)

    // Get document type config
    const docConfig = getDocumentTypeConfig(data.document_type)

    // Initialize Supabase service-role client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Load Brain context (parallel with deal/contact info)
    const brainPromise = getBrainContext(
      data.org_id,
      data.contact_id ?? null,
      data.deal_id ?? null,
      data.user_id,
      [...BRAIN_TABLES],
      supabase,
    )

    // Load deal info if deal_id provided
    const dealPromise = data.deal_id
      ? supabase
          .from('deals')
          .select('name, value, stage, company_name')
          .eq('id', data.deal_id)
          .maybeSingle()
          .then(({ data: d }) => d)
      : Promise.resolve(null)

    // Load contact info if contact_id provided
    const contactPromise = data.contact_id
      ? supabase
          .from('contacts')
          .select('name, email, company, job_title')
          .eq('id', data.contact_id)
          .maybeSingle()
          .then(({ data: c }) => c)
      : Promise.resolve(null)

    const [brainResult, dealInfo, contactInfo] = await Promise.all([
      brainPromise,
      dealPromise,
      contactPromise,
    ])

    // Build the user message
    const userMessage = buildUserMessage(data, brainResult.formatted, dealInfo, contactInfo)

    // Call Haiku
    const { sections, duration_ms } = await callHaiku(docConfig.generationPrompt, userMessage)

    console.log(
      `${LOG_PREFIX} Generated ${sections.length} sections in ${duration_ms}ms for ${data.document_type}`,
    )

    // Store in proposals table
    const insertPayload: Record<string, unknown> = {
      type: 'proposal',
      content: sections.map((s) => `## ${s.title}\n${s.content}`).join('\n\n'),
      sections: sections,
      deal_id: data.deal_id ?? null,
      contact_id: data.contact_id ?? null,
      user_id: data.user_id,
      org_id: data.org_id,
      generation_status: 'ready',
      pipeline_version: 2,
      trigger_type: 'copilot',
      context_payload: {
        document_type: data.document_type,
        model_used: HAIKU_MODEL,
        generation_time_ms: duration_ms,
        meeting_context: data.meeting_context,
      },
    }

    // Try to set document_type column (added by DOC-005 migration).
    // If the column doesn't exist yet, the insert still succeeds without it.
    insertPayload.document_type = data.document_type

    const { data: proposal, error: insertError } = await supabase
      .from('proposals')
      .insert(insertPayload)
      .select('id')
      .single()

    if (insertError) {
      // If the error is about document_type column not existing, retry without it
      if (insertError.message?.includes('document_type')) {
        console.warn(`${LOG_PREFIX} document_type column not found, retrying without it`)
        delete insertPayload.document_type
        const { data: retryProposal, error: retryError } = await supabase
          .from('proposals')
          .insert(insertPayload)
          .select('id')
          .single()

        if (retryError) {
          console.error(`${LOG_PREFIX} Failed to store document (retry):`, retryError.message)
          return errorResponse(`Failed to store document: ${retryError.message}`, req, 500)
        }

        return jsonResponse(
          {
            document_id: retryProposal.id,
            document_type: data.document_type,
            sections,
            generation_time_ms: duration_ms,
          },
          req,
        )
      }

      console.error(`${LOG_PREFIX} Failed to store document:`, insertError.message)
      return errorResponse(`Failed to store document: ${insertError.message}`, req, 500)
    }

    return jsonResponse(
      {
        document_id: proposal.id,
        document_type: data.document_type,
        sections,
        generation_time_ms: duration_ms,
      },
      req,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`${LOG_PREFIX} Unhandled error:`, message)
    return errorResponse(message, req, 500)
  }
})

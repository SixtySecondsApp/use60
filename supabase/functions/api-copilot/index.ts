/// <reference path="../deno.d.ts" />

/**
 * Copilot API Edge Function
 *
 * Provides AI Copilot functionality with Google Gemini Flash:
 * - POST /api-copilot/chat - Main chat endpoint
 * - POST /api-copilot/actions/draft-email - Email draft endpoint
 * - GET /api-copilot/conversations/:id - Fetch conversation history
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { 
  createSuccessResponse,
  createErrorResponse,
  extractIdFromPath,
  isValidUUID
} from '../_shared/api-utils.ts'
import { 
  rateLimitMiddleware,
  RATE_LIMIT_CONFIGS
} from '../_shared/rateLimiter.ts'
import { logAICostEvent, extractAnthropicUsage } from '../_shared/costTracking.ts'
import { executeAction } from '../_shared/copilot_adapters/executeAction.ts'
import type { ExecuteActionName } from '../_shared/copilot_adapters/types.ts'
import { getOrCompilePersona, type CompiledPersona } from '../_shared/salesCopilotPersona.ts'

// Gemini API configuration (replacing Claude for copilot chat)
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GOOGLE_GEMINI_API_KEY') ?? ''
const GEMINI_MODEL = Deno.env.get('GEMINI_FLASH_MODEL') ?? Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// Legacy Anthropic config (kept for reference/fallback)
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const ANTHROPIC_VERSION = '2023-06-01'
const ANTHROPIC_VERSION_TOOLS = '2024-04-04'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''

interface ChatRequest {
  message: string
  conversationId?: string
  targetUserId?: string // Optional: for admins to query other users' performance
  context?: {
    userId: string
    currentView?: 'dashboard' | 'contact' | 'pipeline'
    contactId?: string
    dealIds?: string[]
    taskId?: string
    orgId?: string
    temporalContext?: TemporalContextPayload
  }
}

interface TemporalContextPayload {
  isoString?: string
  localeString?: string
  date?: string
  time?: string
  timezone?: string
  offsetMinutes?: number
}

interface DraftEmailRequest {
  contactId: string
  context: string
  tone: 'professional' | 'friendly' | 'concise'
}

interface CopilotMessage {
  role: 'user' | 'assistant'
  content: string
  recommendations?: any[]
}

interface ToolResult {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

interface ToolExecutionDetail {
  toolName: string
  args: any
  result: any
  latencyMs: number
  success: boolean
  error?: string
  capability?: string
  provider?: string
}

interface StructuredResponse {
  type: string
  summary?: string
  data?: any
  actions?: Array<{
    id: string
    label: string
    type: string
    icon: string
    callback: string
    params?: any
  }>
  metadata?: any
}

interface ContactData {
  id: string
  full_name?: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  title?: string
  company_id?: string
  companies?: {
    name?: string
  }
}

interface TaskData {
  id: string
  ticket_id?: string
  title: string
  description?: string
  type?: string
  priority?: string
  status?: string
  submitted_by?: string
  created_at?: string
  updated_at?: string
}

interface UserData {
  id: string
  email?: string
}

interface GmailMessageSummary {
  id: string
  threadId?: string
  subject: string
  snippet: string
  date: string
  direction: 'sent' | 'received' | 'unknown'
  from: string[]
  to: string[]
  historyId?: string
  link?: string
}

/**
 * Strip AI preamble/narration from skill test output.
 * Removes transitional phrases and meta-commentary that end users shouldn't see.
 * Uses aggressive strategy: skip all lines until first markdown header (# or ##).
 */
function stripSkillTestPreamble(content: string): string {
  if (!content) return content

  const lines = content.split('\n')

  // Find the first line that starts actual content (markdown header)
  let contentStartIndex = 0
  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim()

    // Content starts at first markdown header (# or ##)
    if (trimmedLine.startsWith('#')) {
      contentStartIndex = i
      break
    }

    // Also detect content if we see a markdown table header (| Column |)
    if (trimmedLine.startsWith('|') && trimmedLine.includes('|', 1)) {
      contentStartIndex = i
      break
    }

    // Also detect "**Bold Title**" format that indicates structured content
    if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
      contentStartIndex = i
      break
    }
  }

  // Return content from the detected start point
  return lines.slice(contentStartIndex).join('\n').trim()
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authenticate request using JWT token (not API key)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('Authorization header with Bearer token required', 401, 'UNAUTHORIZED')
    }

    const jwt = authHeader.replace('Bearer ', '')
    
    // Create Supabase client with anon key for JWT validation
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      },
      auth: {
        persistSession: false
      }
    })

    // Get user from JWT token
    const { data: { user }, error: authError } = await authClient.auth.getUser(jwt)
    
    if (authError || !user) {
      return createErrorResponse('Invalid or expired authentication token', 401, 'UNAUTHORIZED')
    }

    // Create service role client for database operations (bypasses RLS)
    const client = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      {
        // Include the user JWT so DB access remains correct even if service role is misconfigured in secrets.
        // This also ensures membership-gated queries in shared executors work reliably.
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      }
    )

    const user_id = user.id
    
    const url = new URL(req.url)
    // Filter out 'functions', 'v1', and function name from pathname (Supabase includes these)
    // The pathname will be like: /functions/v1/api-copilot/actions/generate-deal-email
    const pathParts = url.pathname
      .split('/')
      .filter(segment => segment && segment !== 'functions' && segment !== 'v1' && segment !== 'api-copilot')
    const endpoint = pathParts[0] || '' // 'chat', 'actions', 'conversations'
    const resourceId = pathParts[1] || '' // conversation ID, 'generate-deal-email', etc.
    
    // Debug logging for path parsing
    console.log('[API-COPILOT] Path parsing:', {
      fullPath: url.pathname,
      pathParts,
      endpoint,
      resourceId,
      method: req.method,
      allPathParts: url.pathname.split('/')
    })

    // Apply rate limiting (100 requests/hour for Copilot)
    // Create a client with anon key for rate limiting (it needs to check user auth)
    const rateLimitClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    })
    
    const rateLimitConfig = {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 100, // 100 requests per hour
      message: 'Rate limit exceeded. Please try again later.'
    }
    
    const rateLimitResponse = await rateLimitMiddleware(
      rateLimitClient,
      req,
      `api-copilot-${endpoint}`,
      rateLimitConfig
    )
    
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Route to appropriate handler
    console.log('[API-COPILOT] Attempting to route:', { 
      endpoint, 
      resourceId, 
      method: req.method,
      matchesChat: req.method === 'POST' && endpoint === 'chat',
      matchesDraftEmail: req.method === 'POST' && endpoint === 'actions' && resourceId === 'draft-email',
      matchesTestSkill: req.method === 'POST' && endpoint === 'actions' && resourceId === 'test-skill',
      matchesGenerateEmail: req.method === 'POST' && endpoint === 'actions' && resourceId === 'generate-deal-email',
      matchesConversations: req.method === 'GET' && endpoint === 'conversations' && resourceId
    })
    
    if (req.method === 'POST' && endpoint === 'chat') {
      return await handleChat(client, req, user_id)
    } else if (req.method === 'POST' && endpoint === 'actions' && resourceId === 'draft-email') {
      return await handleDraftEmail(client, req, user_id)
    } else if (req.method === 'POST' && endpoint === 'actions' && resourceId === 'regenerate-email-tone') {
      return await handleRegenerateEmailTone(client, req, user_id)
    } else if (req.method === 'POST' && endpoint === 'actions' && resourceId === 'test-skill') {
      return await handleTestSkill(client, req, user_id)
    } else if (req.method === 'POST' && endpoint === 'actions' && resourceId === 'generate-deal-email') {
      console.log('[API-COPILOT] ✅ Routing to handleGenerateDealEmail')
      return await handleGenerateDealEmail(client, req, user_id)
    } else if (req.method === 'GET' && endpoint === 'conversations' && resourceId) {
      return await handleGetConversation(client, resourceId, user_id)
    } else {
      console.log('[API-COPILOT] ❌ No route matched:', { 
        endpoint, 
        resourceId, 
        method: req.method,
        fullPath: url.pathname,
        pathParts
      })
      return createErrorResponse(
        `Endpoint not found. Received: ${req.method} ${endpoint || '(empty)'}/${resourceId || '(empty)'}. Full path: ${url.pathname}`,
        404,
        'NOT_FOUND'
      )
    }

  } catch (error) {
    return createErrorResponse(
      error.message || 'Internal server error',
      error.status || 500,
      'INTERNAL_ERROR'
    )
  }
})

/**
 * Handle chat requests
 */
async function handleChat(
  client: any,
  req: Request,
  userId: string
): Promise<Response> {
  const requestStartTime = Date.now()
  let analyticsData: any = {
    user_id: userId,
    request_type: 'chat',
    message_length: 0,
    response_length: 0,
    response_time_ms: 0,
    claude_api_time_ms: 0,
    tool_execution_time_ms: 0,
    tool_iterations: 0,
    tools_used: [],
    tools_success_count: 0,
    tools_error_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_cents: 0,
    status: 'success',
    has_context: false,
    context_type: null
  }

  try {
    const body: ChatRequest = await req.json()
    
    if (!body.message || !body.message.trim()) {
      return createErrorResponse('Message is required', 400, 'MISSING_MESSAGE')
    }

    analyticsData.message_length = body.message.length
    analyticsData.has_context = !!(body.context?.contactId || body.context?.dealIds || body.context?.currentView)
    if (body.context?.contactId) analyticsData.context_type = 'contact'
    else if (body.context?.dealIds?.length) analyticsData.context_type = 'deal'
    else if (body.context?.currentView) analyticsData.context_type = body.context.currentView
    
    // Ensure context exists with userId
    if (!body.context) {
      body.context = { userId }
    } else if (!body.context.userId) {
      body.context.userId = userId
    }

    // ---------------------------------------------------------------------------
    // Resolve org_id (prefer explicit orgId from client context, but validate membership)
    // ---------------------------------------------------------------------------
    try {
      const requestedOrgId = body.context?.orgId ? String(body.context.orgId) : null

      if (requestedOrgId) {
        const { data: membership, error: membershipError } = await client
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', userId)
          .eq('org_id', requestedOrgId)
          .maybeSingle()

        if (membershipError) {
          console.warn('[API-COPILOT] Failed to validate requested orgId (falling back):', membershipError)
        } else if (membership?.org_id) {
          body.context.orgId = String(membership.org_id)
        } else {
          // Requested orgId is not one of the user's orgs; fall back.
          body.context.orgId = undefined
        }
      }

      // If no valid requested orgId, pick first membership as default
      if (!body.context?.orgId) {
        const { data: membership } = await client
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (membership?.org_id) {
          body.context.orgId = String(membership.org_id)
        }
      }
    } catch (e) {
      // fail open: copilot should still work without org context
    }
    
    // Check if user is admin and validate targetUserId if provided
    const { data: currentUser } = await client
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single()
    
    const isAdmin = currentUser?.is_admin === true
    let targetUserId = userId // Default to current user
    
    // Try to extract user name from message for admin queries
    if (isAdmin) {
      console.log('[USER-EXTRACT] Admin detected, attempting to extract user from message...', {
        message: body.message.substring(0, 100),
        currentUserId: userId
      })
      const extractedUserId = await extractUserIdFromMessage(body.message, client, userId)
      if (extractedUserId && extractedUserId !== userId) {
        targetUserId = extractedUserId
        console.log('[USER-EXTRACT] ✅ Extracted target user ID:', extractedUserId)
      } else {
        console.log('[USER-EXTRACT] ⚠️ No user extracted or same as requesting user:', extractedUserId)
      }
    } else {
      console.log('[USER-EXTRACT] Not an admin, using own user ID:', userId)
    }
    
    console.log('[USER-EXTRACT] Final targetUserId:', targetUserId)
    
    // If targetUserId is explicitly provided, validate admin access
    if (body.targetUserId && body.targetUserId !== userId) {
      if (!isAdmin) {
        return createErrorResponse('Only admins can query other users\' performance', 403, 'PERMISSION_DENIED')
      }
      targetUserId = body.targetUserId
    }

    // Get or create conversation
    let conversationId = body.conversationId
    
    if (!conversationId || !isValidUUID(conversationId)) {
      // Create new conversation
      const { data: newConversation, error: convError } = await client
        .from('copilot_conversations')
        .insert({
          user_id: userId,
          title: body.message.substring(0, 100) // Use first 100 chars as title
        })
        .select()
        .single()

      if (convError) {
        return createErrorResponse('Failed to create conversation', 500, 'CONVERSATION_ERROR')
      }

      conversationId = newConversation.id
    } else {
      // Verify conversation belongs to user
      const { data: conversation, error: convError } = await client
        .from('copilot_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single()

      if (convError || !conversation) {
        return createErrorResponse('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
      }
    }

    // Save user message
    const { error: msgError } = await client
      .from('copilot_messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: body.message,
        metadata: body.context || {}
      })

    if (msgError) {
      console.error('[Copilot] Failed to save user message:', msgError.message);
      // Non-fatal: continue processing even if message save fails
      // The conversation will work but history may be incomplete
    }

    // Fetch conversation history for context
    const { data: messages, error: historyError } = await client
      .from('copilot_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20) // Last 20 messages for context

    if (historyError) {
      console.error('[Copilot] Failed to fetch conversation history:', historyError.message);
      // Non-fatal: continue with empty history - AI will respond without context
    }

    // Ensure messages is an array and format correctly
    const formattedMessages: CopilotMessage[] = (messages || []).map((msg: any) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content || '',
      recommendations: msg.metadata?.recommendations || []
    }))

    // Check if this is a performance query BEFORE calling Claude
    // This allows us to skip AI and go straight to structured response
    const messageLower = body.message.toLowerCase()
    const originalMessage = body.message

    // -------------------------------------------------------------------------
    // Deterministic confirmation handling (avoids UI "Select Contact" modal)
    // If the previous assistant message set a pending_action (e.g., run_sequence preview),
    // then a user reply like "yes" should execute the pending action directly.
    // -------------------------------------------------------------------------
    const isAffirmative = /^(yes|yep|yeah|y|ok|okay|sure|do it|go ahead|confirm|create it|create the task|yes create a task)/i.test(
      body.message.trim()
    )

    if (isAffirmative) {
      try {
        const { data: lastAssistant } = await client
          .from('copilot_messages')
          .select('content, metadata')
          .eq('conversation_id', conversationId)
          .eq('role', 'assistant')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const pending = (lastAssistant?.metadata as any)?.pending_action
        const content = String(lastAssistant?.content || '')
        const inferredPipelineFocus =
          content.includes('Pipeline Focus Tasks') || content.includes('seq-pipeline-focus-tasks')

        const pendingSequenceKey =
          pending?.type === 'run_sequence' && typeof pending.sequence_key === 'string'
            ? String(pending.sequence_key)
            : (inferredPipelineFocus ? 'seq-pipeline-focus-tasks' : null)

        // Safety: only allow confirmation execution for known demo sequences.
        const CONFIRMABLE_SEQUENCES = new Set([
          'seq-pipeline-focus-tasks',
          'seq-next-meeting-command-center',
          'seq-deal-rescue-pack',
          'seq-post-meeting-followup-pack',
          'seq-deal-map-builder',
          'seq-daily-focus-plan',
          'seq-followup-zero-inbox',
          'seq-deal-slippage-guardrails',
        ])

        if (pendingSequenceKey && CONFIRMABLE_SEQUENCES.has(pendingSequenceKey)) {
          const resolvedOrgId = body.context?.orgId ? String(body.context.orgId) : null
          const sequenceContext =
            pending?.sequence_context && typeof pending.sequence_context === 'object'
              ? pending.sequence_context
              : {}

          const result = await executeAction(
            client,
            userId,
            resolvedOrgId,
            'run_sequence',
            { sequence_key: pendingSequenceKey, is_simulation: false, sequence_context: sequenceContext }
          )

          const text = `Done — I ran ${pendingSequenceKey}.`

          return new Response(
            JSON.stringify({
              response: { type: 'text', content: text, recommendations: [] },
              conversationId,
              timestamp: new Date().toISOString(),
              tool_executions: [
                {
                  toolName: 'execute_action',
                  args: { action: 'run_sequence', params: { sequence_key: pendingSequenceKey, is_simulation: false, sequence_context: sequenceContext } },
                  result,
                  success: (result as any)?.success === true,
                },
              ],
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          )
        }
      } catch (err) {
        // Fail open - fall back to normal handling
      }
    }
    
    // ULTRA SIMPLE detection: If message contains "performance" anywhere, it's a performance query
    // This catches ALL variations: "Phil's performance", "show performance", "performance this week", etc.
    const hasPerformance = messageLower.includes('performance')
    const hasSalesCoach = messageLower.includes('sales coach')
    const hasHowAmIDoing = messageLower.includes('how am i doing')
    const hasHowIsMyPerformance = messageLower.includes('how is my performance')
    
    const isPerformanceQuery = hasPerformance || hasSalesCoach || hasHowAmIDoing || hasHowIsMyPerformance
    
    // ---------------------------------------------------------------------------
    // V1 Deterministic Workflow Router
    // Maps user intent to one of the 5 V1 workflows + meetings_for_period.
    // These bypass Gemini reasoning for consistent, reliable results.
    // ---------------------------------------------------------------------------
    const v1Route = routeToV1Workflow(messageLower, body.context?.temporalContext)
    
    // Legacy flags for backwards compatibility with existing code paths
    const isMeetingPrepQuery = v1Route?.workflow === 'next_meeting_prep'
    const isMeetingsForPeriodQuery = v1Route?.workflow === 'meetings_for_period'
    const isPostMeetingFollowUpPackQuery = v1Route?.workflow === 'post_meeting_followup'
    const isEmailZeroInboxQuery = v1Route?.workflow === 'email_zero_inbox'
    const isPipelineFocusQuery = v1Route?.workflow === 'pipeline_focus'
    const isCatchMeUpQuery = v1Route?.workflow === 'catch_me_up'
    
    // ---------------------------------------------------------------------------
    // Hybrid Escalation Rules (US-015)
    // Determine if request should escalate to agent-first (plan→execute) mode
    // Simple queries stay chat-first; complex queries trigger planning
    // ---------------------------------------------------------------------------
    const escalationDecision = analyzeEscalationCriteria(body.message, messageLower, body.context)
    analyticsData.escalation_decision = escalationDecision.decision
    analyticsData.escalation_reasons = escalationDecision.reasons.join(',')
    
    console.log('[ESCALATION] Hybrid escalation analysis:', {
      message: body.message.substring(0, 100),
      decision: escalationDecision.decision,
      reasons: escalationDecision.reasons,
      isAgent: escalationDecision.decision === 'agent',
      v1Route: v1Route?.workflow || null
    })
    
    console.log('[WORKFLOW-ROUTER] V1 workflow routing:', {
      message: body.message.substring(0, 100),
      v1Route: v1Route ? { workflow: v1Route.workflow, sequenceKey: v1Route.sequenceKey } : null,
      isPerformanceQuery,
      userId,
      isAdmin: currentUser?.is_admin,
      escalationDecision: escalationDecision.decision
    })
    
    // If it's a deterministic workflow (performance report or V1 workflow),
    // skip Gemini and go straight to structured response.
    let aiResponse: any = null
    let shouldSkipClaude = false
    
    if (isPerformanceQuery || v1Route) {
      shouldSkipClaude = true
      
      // Track workflow telemetry
      analyticsData.workflow_type = v1Route?.workflow || (isPerformanceQuery ? 'performance_query' : 'unknown')
      analyticsData.workflow_sequence_key = v1Route?.sequenceKey || null
      analyticsData.is_deterministic_workflow = true
      
      console.log('[WORKFLOW-ROUTER] ✅ Deterministic request detected - skipping Gemini API call', {
        isPerformanceQuery,
        v1Workflow: v1Route?.workflow || null,
        sequenceKey: v1Route?.sequenceKey || null
      })
      // Create a mock AI response for structured response processing
      aiResponse = {
        content: '', // Empty content since we'll use structured response
        recommendations: [],
        tools_used: [],
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    } else {
      console.log('[WORKFLOW-ROUTER] ❌ No V1 workflow matched - will call Gemini')
    }

    // Build context from user's CRM data
    let context = ''
    try {
      context = await buildContext(client, userId, body.context)
    } catch (contextError) {
      // Continue with empty context if buildContext fails
    }

    // Call Gemini API with function calling support (skip if performance query)
    const geminiStartTime = Date.now()
    if (!shouldSkipClaude) {
      console.log('[GEMINI] Calling Gemini API (not a performance query)')
      try {
        aiResponse = await callGeminiAPI(
          body.message,
          formattedMessages,
          context,
          client,
          userId,
          body.context?.orgId ? String(body.context.orgId) : null,
          analyticsData // Pass analytics data to track tool usage
        )
        analyticsData.claude_api_time_ms = Date.now() - geminiStartTime // Keep field name for analytics compatibility
        console.log('[GEMINI] Gemini API response received:', {
          contentLength: aiResponse.content?.length || 0,
          hasRecommendations: !!aiResponse.recommendations?.length,
          toolsUsed: aiResponse.tools_used || []
        })
      
      // Extract token counts and tool usage from response if available
      if (aiResponse.usage) {
        analyticsData.input_tokens = aiResponse.usage.input_tokens || 0
        analyticsData.output_tokens = aiResponse.usage.output_tokens || 0
        // Estimate cost: Gemini Flash pricing (approximate)
        // Input: $0.075 per 1M tokens, Output: $0.30 per 1M tokens
        const inputCost = (analyticsData.input_tokens / 1_000_000) * 0.075
        const outputCost = (analyticsData.output_tokens / 1_000_000) * 0.30
        analyticsData.estimated_cost_cents = (inputCost + outputCost) * 100

        // Log cost event for tracking
        try {
          // Get user's org_id
          const { data: membership } = await client
            .from('organization_memberships')
            .select('org_id')
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
            .limit(1)
            .single()

          if (membership?.org_id && aiResponse.usage.input_tokens && aiResponse.usage.output_tokens) {
            // Use the cost tracking helper function
            await logAICostEvent(
              client,
              userId,
              membership.org_id,
              'gemini',
              GEMINI_MODEL, // Copilot uses Gemini Flash
              aiResponse.usage.input_tokens,
              aiResponse.usage.output_tokens,
              'copilot',
              {
                tool_iterations: aiResponse.tool_iterations || 0,
                tools_used: aiResponse.tools_used || [],
                conversation_id: conversationId,
              }
            )
          }
        } catch (err) {
          // Silently fail - cost tracking is optional
          if (err instanceof Error && !err.message.includes('relation') && !err.message.includes('does not exist')) {
            console.warn('[Copilot] Error in cost logging:', err)
          }
        }
      }
      if (aiResponse.tools_used) {
        analyticsData.tools_used = aiResponse.tools_used
        analyticsData.tool_iterations = aiResponse.tool_iterations || 0
        analyticsData.tools_success_count = aiResponse.tools_success_count || 0
        analyticsData.tools_error_count = aiResponse.tools_error_count || 0
        analyticsData.tool_execution_time_ms = aiResponse.tool_execution_time_ms || 0
      }
    } catch (claudeError) {
      analyticsData.status = 'error'
      analyticsData.error_type = 'claude_api_error'
      analyticsData.error_message = claudeError.message || String(claudeError)
      analyticsData.claude_api_time_ms = Date.now() - geminiStartTime
      throw new Error(`Claude API call failed: ${claudeError.message || String(claudeError)}`)
    }
    } else {
      // Skip Claude for performance queries - structured response will handle it
      analyticsData.claude_api_time_ms = 0
      console.log('[CLAUDE] ⏭️ Skipped Claude API call (performance query detected)')
    }

    // Save assistant message (skip if we're using structured response)
    if (!shouldSkipClaude) {
      // Store lightweight execution metadata for follow-up confirmations (e.g., "Yes, create it")
      let pendingAction: any = null
      try {
        // IMPORTANT: tool executions are tracked in `aiResponse.tool_executions` (computed server-side),
        // not on the Claude response object.
        const execs = Array.isArray(aiResponse.tool_executions) ? aiResponse.tool_executions : []
        const lastRunSequence = execs
          .filter((t: any) => t?.toolName === 'execute_action' && t?.args?.action === 'run_sequence')
          .slice(-1)[0]

        if (lastRunSequence?.args?.params?.sequence_key && lastRunSequence?.args?.params?.is_simulation === true) {
          pendingAction = {
            type: 'run_sequence',
            sequence_key: String(lastRunSequence.args.params.sequence_key),
            sequence_context: lastRunSequence.args.params.sequence_context || {},
            is_simulation: false,
            created_at: new Date().toISOString(),
          }
        }
      } catch {
        pendingAction = null
      }

      const { error: assistantMsgError } = await client
        .from('copilot_messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: aiResponse.content,
          metadata: {
            recommendations: aiResponse.recommendations || [],
            pending_action: pendingAction || undefined
          }
        })

      if (assistantMsgError) {
      }
    }

    // Update conversation updated_at
    await client
      .from('copilot_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    // Calculate final metrics
    analyticsData.response_time_ms = Date.now() - requestStartTime
    analyticsData.response_length = aiResponse.content?.length || 0
    analyticsData.conversation_id = conversationId

    // Log analytics (non-blocking)
    logCopilotAnalytics(client, analyticsData).catch(err => {
      // Don't fail the request if analytics logging fails
    })

    // Detect intent and structure response if appropriate
    // If we skipped Claude for a deterministic request, we MUST generate structured response
    let structuredResponse: StructuredResponse | null = null
    if (shouldSkipClaude) {
      try {
        if (isPerformanceQuery) {
          console.log('[STRUCTURED] Generating structured response for performance query...', {
            targetUserId,
            requestingUserId: userId,
            message: body.message.substring(0, 50)
          })
          structuredResponse = await structureSalesCoachResponse(
            client,
            targetUserId,
            '', // No AI content since we skipped Claude
            body.message,
            userId // Pass requesting user ID for permission checks
          )
        } else if (isMeetingPrepQuery) {
          // Standardize on the sequence-based workflow (consistent with "deals to focus on"):
          // Run the Next Meeting Command Center sequence in simulation mode, then render the rich panel.
          const resolvedOrgId = body.context?.orgId ? String(body.context.orgId) : null
          console.log('[STRUCTURED] Generating structured response for next-meeting command center (sequence)...', {
            targetUserId,
            orgId: resolvedOrgId
          })

          const t0 = Date.now()
          const result = await executeAction(
            client,
            targetUserId,
            resolvedOrgId,
            'run_sequence',
            { sequence_key: 'seq-next-meeting-command-center', is_simulation: true, sequence_context: {} }
          )
          const latencyMs = Date.now() - t0
          const capability = (result as any)?.capability
          const provider = (result as any)?.provider
          aiResponse.tool_executions = [
            {
              toolName: 'execute_action',
              args: { action: 'run_sequence', params: { sequence_key: 'seq-next-meeting-command-center', is_simulation: true, sequence_context: {} } },
              result,
              latencyMs,
              success: (result as any)?.success === true,
              capability,
              provider,
            },
          ]

          structuredResponse = await detectAndStructureResponse(
            body.message,
            '',
            client,
            targetUserId,
            [],
            userId,
            body.context,
            aiResponse.tool_executions
          )
        } else if (isPostMeetingFollowUpPackQuery) {
          const resolvedOrgId = body.context?.orgId ? String(body.context.orgId) : null
          console.log('[STRUCTURED] Generating structured response for post-meeting follow-up pack (sequence)...', {
            targetUserId,
            orgId: resolvedOrgId
          })

          const t0 = Date.now()
          const result = await executeAction(
            client,
            targetUserId,
            resolvedOrgId,
            'run_sequence',
            { sequence_key: 'seq-post-meeting-followup-pack', is_simulation: true, sequence_context: {} }
          )
          const latencyMs = Date.now() - t0
          const capability = (result as any)?.capability
          const provider = (result as any)?.provider
          aiResponse.tool_executions = [
            {
              toolName: 'execute_action',
              args: { action: 'run_sequence', params: { sequence_key: 'seq-post-meeting-followup-pack', is_simulation: true, sequence_context: {} } },
              result,
              latencyMs,
              success: (result as any)?.success === true,
              capability,
              provider,
            },
          ]

          structuredResponse = await detectAndStructureResponse(
            body.message,
            '',
            client,
            targetUserId,
            [],
            userId,
            body.context,
            aiResponse.tool_executions
          )
        } else if (isMeetingsForPeriodQuery) {
          const period = getMeetingsForPeriodPeriod(messageLower)
          const timezone = body.context?.temporalContext?.timezone
            ? String(body.context.temporalContext.timezone)
            : 'UTC'

          console.log('[STRUCTURED] Generating structured response for meetings list...', {
            targetUserId,
            period,
            timezone,
          })

          const t0 = Date.now()
          const result = await executeAction(
            client,
            targetUserId,
            body.context?.orgId ? String(body.context.orgId) : null,
            'get_meetings_for_period',
            { period, timezone, include_context: true, limit: 20 }
          )
          const latencyMs = Date.now() - t0

          // Attach deterministic tool telemetry so the UI can show a real tool trail
          const capability = (result as any)?.capability
          const provider = (result as any)?.provider
          aiResponse.tool_executions = [
            {
              toolName: 'execute_action',
              args: { action: 'get_meetings_for_period', params: { period, timezone, include_context: true, limit: 20 } },
              result,
              latencyMs,
              success: (result as any)?.success === true,
              capability,
              provider,
            },
          ]

          structuredResponse = await detectAndStructureResponse(
            body.message,
            '',
            client,
            targetUserId,
            [], // toolsUsed
            userId,
            body.context,
            aiResponse.tool_executions
          )
        } else if (isEmailZeroInboxQuery) {
          // ---------------------------------------------------------------------------
          // Email Zero Inbox - seq-followup-zero-inbox
          // ---------------------------------------------------------------------------
          const resolvedOrgId = body.context?.orgId ? String(body.context.orgId) : null
          console.log('[WORKFLOW-ROUTER] Generating structured response for email zero inbox (sequence)...', {
            targetUserId,
            orgId: resolvedOrgId
          })

          const t0 = Date.now()
          const result = await executeAction(
            client,
            targetUserId,
            resolvedOrgId,
            'run_sequence',
            { sequence_key: 'seq-followup-zero-inbox', is_simulation: true, sequence_context: {} }
          )
          const latencyMs = Date.now() - t0
          const capability = (result as any)?.capability
          const provider = (result as any)?.provider
          aiResponse.tool_executions = [
            {
              toolName: 'execute_action',
              args: { action: 'run_sequence', params: { sequence_key: 'seq-followup-zero-inbox', is_simulation: true, sequence_context: {} } },
              result,
              latencyMs,
              success: (result as any)?.success === true,
              capability,
              provider,
            },
          ]

          structuredResponse = await detectAndStructureResponse(
            body.message,
            '',
            client,
            targetUserId,
            [],
            userId,
            body.context,
            aiResponse.tool_executions
          )
        } else if (isPipelineFocusQuery) {
          // ---------------------------------------------------------------------------
          // Pipeline Focus - seq-pipeline-focus-tasks
          // ---------------------------------------------------------------------------
          const resolvedOrgId = body.context?.orgId ? String(body.context.orgId) : null
          console.log('[WORKFLOW-ROUTER] Generating structured response for pipeline focus (sequence)...', {
            targetUserId,
            orgId: resolvedOrgId
          })

          const t0 = Date.now()
          const result = await executeAction(
            client,
            targetUserId,
            resolvedOrgId,
            'run_sequence',
            { sequence_key: 'seq-pipeline-focus-tasks', is_simulation: true, sequence_context: { period: 'this_week' } }
          )
          const latencyMs = Date.now() - t0
          const capability = (result as any)?.capability
          const provider = (result as any)?.provider
          aiResponse.tool_executions = [
            {
              toolName: 'execute_action',
              args: { action: 'run_sequence', params: { sequence_key: 'seq-pipeline-focus-tasks', is_simulation: true, sequence_context: { period: 'this_week' } } },
              result,
              latencyMs,
              success: (result as any)?.success === true,
              capability,
              provider,
            },
          ]

          structuredResponse = await detectAndStructureResponse(
            body.message,
            '',
            client,
            targetUserId,
            [],
            userId,
            body.context,
            aiResponse.tool_executions
          )
        } else if (isCatchMeUpQuery) {
          // ---------------------------------------------------------------------------
          // Catch Me Up - seq-catch-me-up (daily brief)
          // ---------------------------------------------------------------------------
          const resolvedOrgId = body.context?.orgId ? String(body.context.orgId) : null
          console.log('[WORKFLOW-ROUTER] Generating structured response for catch me up (sequence)...', {
            targetUserId,
            orgId: resolvedOrgId
          })

          const t0 = Date.now()
          const result = await executeAction(
            client,
            targetUserId,
            resolvedOrgId,
            'run_sequence',
            { sequence_key: 'seq-catch-me-up', is_simulation: true, sequence_context: {} }
          )
          const latencyMs = Date.now() - t0
          
          // Log detailed result for debugging
          console.log('[WORKFLOW-ROUTER] seq-catch-me-up result:', {
            success: (result as any)?.success,
            hasData: !!(result as any)?.data,
            error: (result as any)?.error,
            dataKeys: (result as any)?.data ? Object.keys((result as any).data) : [],
            finalOutputKeys: (result as any)?.data?.final_output?.outputs ? Object.keys((result as any).data.final_output.outputs) : [],
          })
          
          const capability = (result as any)?.capability
          const provider = (result as any)?.provider
          aiResponse.tool_executions = [
            {
              toolName: 'execute_action',
              args: { action: 'run_sequence', params: { sequence_key: 'seq-catch-me-up', is_simulation: true, sequence_context: {} } },
              result,
              latencyMs,
              success: (result as any)?.success === true,
              capability,
              provider,
            },
          ]

          structuredResponse = await detectAndStructureResponse(
            body.message,
            '',
            client,
            targetUserId,
            [],
            userId,
            body.context,
            aiResponse.tool_executions
          )
        } else {
          structuredResponse = null
        }
        console.log('[STRUCTURED] ✅ Structured response generated:', {
          type: structuredResponse?.type,
          hasData: !!structuredResponse?.data,
          summary: structuredResponse?.summary?.substring(0, 100)
        })
      } catch (error) {
        // REL-002: Fall back to Gemini when V1 workflow fails
        console.error('[STRUCTURED] ❌ V1 workflow error, falling back to Gemini:', error)

        // Log fallback event for monitoring
        console.log('[FALLBACK] ⚠️ V1 → Gemini fallback triggered', {
          v1Workflow: v1Route?.workflow || (isPerformanceQuery ? 'performance_query' : 'unknown'),
          sequenceKey: v1Route?.sequenceKey || null,
          error: error instanceof Error ? error.message : String(error),
        })

        // Track fallback in analytics
        analyticsData.v1_fallback_triggered = true
        analyticsData.v1_fallback_reason = error instanceof Error ? error.message : String(error)

        // Reset to call Gemini
        shouldSkipClaude = false

        try {
          console.log('[FALLBACK] Calling Gemini API after V1 failure...')
          const geminiStartTime = Date.now()
          aiResponse = await callGeminiAPI(
            body.message,
            formattedMessages,
            context,
            client,
            userId,
            body.context?.orgId ? String(body.context.orgId) : null,
            analyticsData
          )
          analyticsData.claude_api_time_ms = Date.now() - geminiStartTime
          console.log('[FALLBACK] ✅ Gemini API response received after fallback:', {
            contentLength: aiResponse.content?.length || 0,
            hasRecommendations: !!aiResponse.recommendations?.length,
          })

          // Generate structured response from Gemini output
          structuredResponse = await detectAndStructureResponse(
            body.message,
            aiResponse.content,
            client,
            targetUserId,
            aiResponse.tools_used || [],
            userId,
            body.context,
            aiResponse.tool_executions || []
          )
        } catch (fallbackError) {
          // Both V1 and Gemini failed - return graceful error
          console.error('[FALLBACK] ❌ Both V1 and Gemini failed:', fallbackError)
          analyticsData.gemini_fallback_failed = true
          analyticsData.gemini_fallback_error = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          structuredResponse = null
        }
      }
    } else {
      console.log('[STRUCTURED] Using normal detection (not a performance query)')
      // For other queries, use normal detection
      structuredResponse = await detectAndStructureResponse(
        body.message, // Pass original message for limit extraction
        aiResponse.content,
        client,
        targetUserId, // Use targetUserId (may be different user if admin querying)
        aiResponse.tools_used || [],
        userId, // Pass requesting user ID for permission checks
        body.context,
        aiResponse.tool_executions || [] // Pass detailed tool execution metadata
      )
      if (structuredResponse) {
        console.log('[STRUCTURED] ✅ Structured response generated via detection:', structuredResponse.type)
      } else {
        console.log('[STRUCTURED] ⚠️ No structured response generated via detection')
      }
    }

    // Return response in the format expected by the frontend
    // If we have a structured response, prioritize it over text content
    // REL-002: If deterministic flow couldn't produce a structured response, fail gracefully
    if (shouldSkipClaude && !structuredResponse) {
      const fallbackTriggered = (analyticsData as any).v1_fallback_triggered === true
      const geminiAlsoFailed = (analyticsData as any).gemini_fallback_failed === true

      console.error('[RESPONSE] ❌ ERROR: Failed to generate response', {
        targetUserId,
        userId,
        message: body.message,
        fallbackTriggered,
        geminiAlsoFailed,
      })

      // Surface the underlying tool error when available (helps debugging without breaking UI)
      let toolError: string | null = null
      try {
        const execs = Array.isArray(aiResponse?.tool_executions) ? aiResponse.tool_executions : []
        const lastExec = execs.slice(-1)[0] as any
        const err = lastExec?.result?.error
        if (!err) {
          toolError = null
        } else if (typeof err === 'string') {
          toolError = err
        } else if (err && typeof err === 'object') {
          const anyErr = err as any
          toolError =
            (typeof anyErr.message === 'string' && anyErr.message) ||
            (typeof anyErr.error === 'string' && anyErr.error) ||
            (typeof anyErr.details === 'string' && anyErr.details) ||
            (typeof anyErr.hint === 'string' && anyErr.hint) ||
            (() => { try { return JSON.stringify(anyErr) } catch { return '[error object]' } })()
        } else {
          toolError = String(err)
        }
      } catch {
        toolError = null
      }

      // Graceful error message based on what failed (return 200 so the UI doesn't hard-fail)
      const errorMessage = geminiAlsoFailed
        ? 'I’m having trouble processing that request right now. Please try again in a moment.'
        : toolError
          ? `I couldn’t pull that data right now (${toolError}).`
          : 'I couldn’t generate that response right now. Please try again.'

      return new Response(JSON.stringify({
        response: {
          type: 'text',
          content: errorMessage,
          recommendations: [],
          structuredResponse: undefined
        },
        conversationId,
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }
    
    const responseType = structuredResponse 
      ? structuredResponse.type 
      : (aiResponse?.recommendations?.length > 0 ? 'recommendations' : 'text')
    
    const responseContent = structuredResponse 
      ? (structuredResponse.summary || `I've analyzed ${targetUserId !== userId ? 'their' : 'your'} performance data.`)
      : (aiResponse?.content || '')

    // For deterministic (skip-model) flows, persist the assistant message so:
    // - The user can see it in History
    // - Confirmation replies like "Confirm" can execute pending sequences (pending_action)
    if (shouldSkipClaude) {
      try {
        const execs = Array.isArray(aiResponse?.tool_executions) ? aiResponse.tool_executions : []
        let pendingAction: any = null

        const lastRunSequence = execs
          .filter((t: any) => t?.toolName === 'execute_action' && t?.args?.action === 'run_sequence')
          .slice(-1)[0]

        if (lastRunSequence?.args?.params?.sequence_key && lastRunSequence?.args?.params?.is_simulation === true) {
          pendingAction = {
            type: 'run_sequence',
            sequence_key: String(lastRunSequence.args.params.sequence_key),
            sequence_context: lastRunSequence.args.params.sequence_context || {},
            is_simulation: false,
            created_at: new Date().toISOString(),
          }
        }

        await client
          .from('copilot_messages')
          .insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: responseContent,
            metadata: {
              recommendations: [],
              pending_action: pendingAction || undefined,
              structuredResponse: structuredResponse || undefined,
            },
          })
      } catch {
        // Fail open - history persistence is non-critical
      }
    }
    
    const responsePayload = {
      response: {
        type: responseType,
        content: responseContent,
        recommendations: aiResponse?.recommendations || [],
        structuredResponse: structuredResponse || undefined
      },
      conversationId,
      timestamp: new Date().toISOString(),
      tool_executions: aiResponse?.tool_executions || []
    }
    
    // Track workflow completion telemetry
    if (structuredResponse) {
      analyticsData.structured_response_type = structuredResponse.type
      analyticsData.has_structured_response = true
      analyticsData.workflow_step_count = aiResponse?.tool_executions?.length || 0
      analyticsData.workflow_completed = true
      analyticsData.workflow_duration_ms = Date.now() - requestStartTime
      
      // Track confirmation potential for preview flows
      const isPreviewFlow = (structuredResponse.data as any)?.isSimulation === true
      analyticsData.is_preview_flow = isPreviewFlow
      analyticsData.pending_action_created = !!(
        aiResponse?.tool_executions?.some((t: any) => 
          t?.args?.params?.is_simulation === true
        )
      )
    }
    
    // Debug logging
    console.log('[RESPONSE] 📤 Returning response payload:', {
      type: responseType,
      hasStructuredResponse: !!structuredResponse,
      structuredResponseType: structuredResponse?.type,
      contentLength: responseContent.length,
      hasData: !!structuredResponse?.data,
      summary: structuredResponse?.summary?.substring(0, 100)
    })

    // Log updated analytics with workflow data (non-blocking)
    logCopilotAnalytics(client, analyticsData).catch(() => {})

    // Log to copilot_executions for execution history replay (non-blocking)
    logExecutionHistory(client, {
      organization_id: body.context?.orgId ? String(body.context.orgId) : null,
      user_id: userId,
      user_message: body.message,
      response_text: responseContent,
      success: true,
      tools_used: aiResponse?.tool_executions?.map((t: any) => t.toolName) || [],
      tool_call_count: aiResponse?.tool_executions?.length || 0,
      duration_ms: Date.now() - requestStartTime,
      input_tokens: analyticsData.input_tokens || 0,
      output_tokens: analyticsData.output_tokens || 0,
      structured_response: structuredResponse || null,
      skill_key: extractSkillKeyFromExecutions(aiResponse?.tool_executions) || null,
      sequence_key: extractSequenceKeyFromExecutions(aiResponse?.tool_executions) || null,
    }).catch(() => {})

    // Log final response payload
    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    // Update analytics with error info and categorization
    analyticsData.status = 'error'
    analyticsData.error_type = error.name || 'UnknownError'
    analyticsData.error_message = error.message || 'Unknown error'
    analyticsData.response_time_ms = Date.now() - requestStartTime
    analyticsData.workflow_completed = false
    
    // Categorize errors for dashboard filtering
    const errorMsg = (error.message || '').toLowerCase()
    if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
      analyticsData.error_category = 'timeout'
    } else if (errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
      analyticsData.error_category = 'rate_limit'
    } else if (errorMsg.includes('auth') || errorMsg.includes('unauthorized') || errorMsg.includes('forbidden')) {
      analyticsData.error_category = 'auth'
    } else if (errorMsg.includes('not found') || errorMsg.includes('pgrst116')) {
      analyticsData.error_category = 'not_found'
    } else if (errorMsg.includes('validation') || errorMsg.includes('invalid')) {
      analyticsData.error_category = 'validation'
    } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
      analyticsData.error_category = 'network'
    } else {
      analyticsData.error_category = 'internal'
    }

    // Log error analytics (non-blocking)
    logCopilotAnalytics(client, analyticsData).catch(() => {})

    const errorMessage = error.message || 'Unknown error'
    return createErrorResponse(
      `Failed to process chat request: ${errorMessage}`,
      500,
      'CHAT_ERROR',
      { stack: error.stack, name: error.name }
    )
  }
}

/**
 * Log Copilot analytics to database
 */
async function logCopilotAnalytics(client: any, analytics: any): Promise<void> {
  try {
    await client
      .from('copilot_analytics')
      .insert({
        user_id: analytics.user_id,
        conversation_id: analytics.conversation_id || null,
        request_type: analytics.request_type,
        message_length: analytics.message_length,
        response_length: analytics.response_length,
        response_time_ms: analytics.response_time_ms,
        claude_api_time_ms: analytics.claude_api_time_ms,
        tool_execution_time_ms: analytics.tool_execution_time_ms,
        tool_iterations: analytics.tool_iterations,
        tools_used: analytics.tools_used || [],
        tools_success_count: analytics.tools_success_count,
        tools_error_count: analytics.tools_error_count,
        estimated_cost_cents: analytics.estimated_cost_cents,
        input_tokens: analytics.input_tokens,
        output_tokens: analytics.output_tokens,
        status: analytics.status,
        error_type: analytics.error_type || null,
        error_message: analytics.error_message || null,
        has_context: analytics.has_context,
        context_type: analytics.context_type || null,
        // Workflow telemetry fields (US-014)
        workflow_type: analytics.workflow_type || null,
        workflow_sequence_key: analytics.workflow_sequence_key || null,
        is_deterministic_workflow: analytics.is_deterministic_workflow || false,
        structured_response_type: analytics.structured_response_type || null,
        has_structured_response: analytics.has_structured_response || false,
        workflow_step_count: analytics.workflow_step_count || 0,
        workflow_duration_ms: analytics.workflow_duration_ms || 0,
        workflow_completed: analytics.workflow_completed || false,
        is_preview_flow: analytics.is_preview_flow || false,
        pending_action_created: analytics.pending_action_created || false,
        error_category: analytics.error_category || null
      })
  } catch (error) {
    // Don't throw - analytics logging should never break the request
  }
}

/**
 * Extract the primary skill_key from tool executions
 */
function extractSkillKeyFromExecutions(toolExecutions?: any[]): string | null {
  if (!toolExecutions?.length) return null
  for (const exec of toolExecutions) {
    if (exec?.args?.action === 'run_skill' && exec?.args?.params?.skill_key) {
      return String(exec.args.params.skill_key)
    }
    // For individual skill tool calls
    if (exec?.skillKey) return String(exec.skillKey)
  }
  return null
}

/**
 * Extract the sequence_key from tool executions
 */
function extractSequenceKeyFromExecutions(toolExecutions?: any[]): string | null {
  if (!toolExecutions?.length) return null
  for (const exec of toolExecutions) {
    if (exec?.args?.action === 'run_sequence' && exec?.args?.params?.sequence_key) {
      return String(exec.args.params.sequence_key)
    }
  }
  return null
}

/**
 * Log execution to copilot_executions table for execution history replay.
 * Non-blocking — errors are swallowed so the main response is never affected.
 */
async function logExecutionHistory(client: any, data: {
  organization_id: string | null,
  user_id: string,
  user_message: string,
  response_text: string,
  success: boolean,
  tools_used: string[],
  tool_call_count: number,
  duration_ms: number,
  input_tokens: number,
  output_tokens: number,
  structured_response: any,
  skill_key: string | null,
  sequence_key: string | null,
}): Promise<void> {
  try {
    if (!data.organization_id || !data.user_id) return

    const { error } = await client
      .from('copilot_executions')
      .insert({
        organization_id: data.organization_id,
        user_id: data.user_id,
        user_message: data.user_message,
        execution_mode: 'agent',
        model: 'gemini-2.0-flash',
        response_text: data.response_text?.slice(0, 5000),
        success: data.success,
        tools_used: data.tools_used,
        tool_call_count: data.tool_call_count,
        started_at: new Date(Date.now() - data.duration_ms).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: data.duration_ms,
        input_tokens: data.input_tokens,
        output_tokens: data.output_tokens,
        total_tokens: (data.input_tokens || 0) + (data.output_tokens || 0),
        structured_response: data.structured_response,
        skill_key: data.skill_key,
        sequence_key: data.sequence_key,
      })

    if (error) {
      console.error('[logExecutionHistory] Insert error:', error)
      return
    }

    // Prune old structured responses to keep only last 5 per skill/sequence
    if (data.structured_response && (data.skill_key || data.sequence_key)) {
      await client.rpc('prune_old_structured_responses', {
        p_skill_key: data.skill_key || null,
        p_sequence_key: data.sequence_key || null,
      }).catch((err: any) => {
        console.error('[logExecutionHistory] Prune error (non-fatal):', err)
      })
    }
  } catch (error) {
    // Don't throw - execution history logging should never break the request
    console.error('[logExecutionHistory] Exception:', error)
  }
}

/**
 * Handle email draft requests
 */
async function handleDraftEmail(
  client: any,
  req: Request,
  userId: string
): Promise<Response> {
  try {
    const body: DraftEmailRequest = await req.json()
    
    if (!body.contactId || !isValidUUID(body.contactId)) {
      return createErrorResponse('Valid contactId is required', 400, 'INVALID_CONTACT_ID')
    }

    // Verify contact belongs to user
    const { data: contact, error: contactError } = await client
      .from('contacts')
      .select('id, first_name, last_name, email, company_id, companies:company_id(name)')
      .eq('id', body.contactId)
      .eq('owner_id', userId)
      .single()

    if (contactError || !contact) {
      return createErrorResponse('Contact not found', 404, 'CONTACT_NOT_FOUND')
    }

    // Fetch recent activities for context
    const { data: activities } = await client
      .from('activities')
      .select('type, details, date')
      .eq('contact_id', body.contactId)
      .order('date', { ascending: false })
      .limit(5)

    // Fetch related deals
    const { data: deals } = await client
      .from('deals')
      .select('id, name, value, stage_id, deal_stages(name)')
      .eq('primary_contact_id', body.contactId)
      .order('created_at', { ascending: false })
      .limit(3)

    // Fetch user's writing style from AI personalization settings
    const { data: writingStyle } = await client
      .from('user_writing_styles')
      .select('name, tone_description, examples, style_metadata')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle()

    // Build email context
    const emailContext = {
      contact: {
        name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        email: contact.email,
        company: contact.companies?.name || 'their company'
      },
      recentActivities: activities || [],
      deals: deals || [],
      context: body.context || 'Follow-up email'
    }

    // Generate email with Claude using user's writing style
    const emailDraft = await generateEmailDraft(emailContext, body.tone, writingStyle)

    return new Response(JSON.stringify({
      subject: emailDraft.subject,
      body: emailDraft.body,
      suggestedSendTime: emailDraft.suggestedSendTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return createErrorResponse('Failed to draft email', 500, 'EMAIL_DRAFT_ERROR')
  }
}

/**
 * Handle email tone regeneration
 * POST /api-copilot/actions/regenerate-email-tone
 * 
 * Takes an existing email and regenerates it with a different tone,
 * using the user's writing style as the base and adjusting from there.
 */
async function handleRegenerateEmailTone(
  client: any,
  req: Request,
  userId: string
): Promise<Response> {
  try {
    const body = await req.json()
    const { currentEmail, newTone, context } = body
    
    if (!currentEmail?.body || !newTone) {
      return createErrorResponse('currentEmail and newTone are required', 400, 'INVALID_REQUEST')
    }
    
    console.log('[REGENERATE-TONE] Starting tone adjustment:', { newTone, hasContext: !!context })
    
    // Fetch user's writing style and profile
    const [{ data: writingStyle }, { data: userProfile }] = await Promise.all([
      client
        .from('user_writing_styles')
        .select('name, tone_description, examples, style_metadata')
        .eq('user_id', userId)
        .eq('is_default', true)
        .maybeSingle(),
      client
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', userId)
        .maybeSingle()
    ])
    
    const userName = userProfile 
      ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || userProfile.email?.split('@')[0] || 'Your Name'
      : 'Your Name'
    
    // Build style instruction from user's writing style
    let baseStyleInstruction = 'The user writes in a balanced, professional style.'
    if (writingStyle) {
      const styleParts: string[] = []
      styleParts.push(`USER'S BASE WRITING STYLE:`)
      styleParts.push(`- Style: ${writingStyle.name}`)
      styleParts.push(`- Natural tone: ${writingStyle.tone_description}`)
      
      const meta = writingStyle.style_metadata as any
      if (meta?.tone_characteristics) {
        styleParts.push(`- Characteristics: ${meta.tone_characteristics}`)
      }
      if (meta?.vocabulary_profile) {
        styleParts.push(`- Vocabulary: ${meta.vocabulary_profile}`)
      }
      if (meta?.greeting_style) {
        styleParts.push(`- Greeting style: ${meta.greeting_style}`)
      }
      if (meta?.signoff_style) {
        styleParts.push(`- Sign-off style: ${meta.signoff_style}`)
      }
      
      baseStyleInstruction = styleParts.join('\n')
    }
    
    // Tone adjustment instructions
    const toneAdjustments: Record<string, string> = {
      professional: `Make this email MORE FORMAL than the user's natural style:
- Use more business-appropriate language
- Be more structured and polished
- Keep greetings and sign-offs professional
- Maintain the same key points but with elevated formality`,
      
      friendly: `Make this email MORE CASUAL AND WARM than the user's natural style:
- Add more warmth and personality
- Use slightly more relaxed language
- Keep it personable and approachable
- Maintain the same key points but with a friendlier touch`,
      
      concise: `Make this email SHORTER AND MORE DIRECT than the user's natural style:
- Cut any unnecessary words or pleasantries
- Get straight to the point
- Keep only essential information
- Make it scannable and action-oriented`
    }
    
    const toneInstruction = toneAdjustments[newTone] || toneAdjustments.professional

    // Build context section if available
    let contextSection = ''
    if (context) {
      const contextParts: string[] = []
      if (context.contactName) {
        contextParts.push(`Recipient: ${context.contactName}`)
      }
      if (context.lastInteraction) {
        contextParts.push(`Last interaction: ${context.lastInteraction}`)
      }
      if (context.dealValue) {
        contextParts.push(`Deal value: $${context.dealValue}`)
      }
      if (context.keyPoints && context.keyPoints.length > 0) {
        contextParts.push(`Key points to maintain:\n${context.keyPoints.map((p: string) => `- ${p}`).join('\n')}`)
      }
      if (contextParts.length > 0) {
        contextSection = `\nORIGINAL CONTEXT (preserve this information):\n${contextParts.join('\n')}\n`
      }
    }

    const prompt = `Adjust the tone of this email while keeping the same meaning, context, and key points.

${baseStyleInstruction}

TONE ADJUSTMENT REQUIRED:
${toneInstruction}
${contextSection}
CURRENT EMAIL TO ADJUST:
Subject: ${currentEmail.subject}
---
${currentEmail.body}
---

SENDER NAME: ${userName}
RECIPIENT: ${context?.contactName || 'the recipient'}

CRITICAL REQUIREMENTS:
1. Keep ALL the same information, meeting references, action items, and key points
2. Only adjust the tone/style as requested - DO NOT remove content
3. Keep the greeting style appropriate for the new tone
4. Sign off with "${userName}" (never use placeholders like "[Your Name]")
5. If the email mentions specific dates, names, or action items - KEEP THEM ALL
6. The adjusted email should be roughly the same length (unless "concise" is requested)

Return ONLY a JSON object:
{"subject": "adjusted subject", "body": "adjusted email body with proper greeting and sign-off"}`

    // Call Gemini
    if (!GEMINI_API_KEY) {
      return createErrorResponse('AI service not configured', 500, 'AI_NOT_CONFIGURED')
    }
    
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 1000,
            responseMimeType: 'application/json'
          }
        })
      }
    )

    if (!geminiResponse.ok) {
      console.error('[REGENERATE-TONE] Gemini API error:', geminiResponse.status)
      return createErrorResponse('Failed to regenerate email', 500, 'AI_ERROR')
    }

    const geminiData = await geminiResponse.json()
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
    
    try {
      const emailJson = JSON.parse(responseText)
      if (emailJson.subject && emailJson.body) {
        console.log('[REGENERATE-TONE] ✅ Successfully regenerated email with', newTone, 'tone')
        return new Response(JSON.stringify({
          subject: emailJson.subject,
          body: emailJson.body,
          tone: newTone
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    } catch (parseError) {
      // Try to extract JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const emailJson = JSON.parse(jsonMatch[0])
          if (emailJson.subject && emailJson.body) {
            return new Response(JSON.stringify({
              subject: emailJson.subject,
              body: emailJson.body,
              tone: newTone
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          }
        } catch (e) {
          // Fall through to error
        }
      }
    }
    
    return createErrorResponse('Failed to parse regenerated email', 500, 'PARSE_ERROR')
    
  } catch (error) {
    console.error('[REGENERATE-TONE] Error:', error)
    return createErrorResponse('Failed to regenerate email tone', 500, 'REGENERATE_ERROR')
  }
}

/**
 * Handle skill testing requests (admin/dev console)
 *
 * POST /api-copilot/actions/test-skill
 *
 * Supports optional entity context for testing skills with real data:
 * - entity_type: 'contact' | 'deal' | 'email' | 'activity' | 'meeting'
 * - entity_test_mode: 'good' | 'average' | 'bad' | 'custom'
 * - {entity_type}_id: UUID of the entity
 * - {entity_type}_context: Entity-specific context object
 *
 * Legacy contact-specific fields are also supported for backwards compatibility.
 */
async function handleTestSkill(
  client: any,
  req: Request,
  userId: string
): Promise<Response> {
  try {
    const body = await req.json()
    const skillKey = body?.skill_key ? String(body.skill_key).trim() : ''
    const testInput = body?.test_input ? String(body.test_input) : ''
    const mode = body?.mode ? String(body.mode) : 'readonly'

    // Entity type detection (new generic approach)
    const entityType = body?.entity_type ? String(body.entity_type) : null
    const entityTestMode = body?.entity_test_mode ? String(body.entity_test_mode) : null

    // Get entity ID and context based on entity type
    let entityId: string | null = null
    let entityContext: any = null

    if (entityType) {
      entityId = body?.[`${entityType}_id`] ? String(body[`${entityType}_id`]) : null
      entityContext = body?.[`${entityType}_context`] || null
    }

    // Legacy contact support (backwards compatibility)
    const contactId = body?.contact_id ? String(body.contact_id) : null
    const contactTestMode = body?.contact_test_mode ? String(body.contact_test_mode) : null
    const contactContext = body?.contact_context || null

    if (!skillKey) {
      return createErrorResponse('skill_key is required', 400, 'INVALID_SKILL_KEY')
    }

    // Build message parts
    // Get today's date for context
    const today = new Date()
    const todayFormatted = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    const todayISO = today.toISOString().split('T')[0]

    const messageParts = [
      `SKILL TEST MODE: ${mode}`,
      ``,
      `TODAY'S DATE: ${todayISO} (${todayFormatted})`,
      `IMPORTANT: When generating dates for tasks, milestones, deadlines, or any future events, ensure ALL dates are in the future relative to today (${todayISO}). Do not use past dates.`,
      ``,
      `CRITICAL OUTPUT RULES - READ CAREFULLY:`,
      `- Your output goes DIRECTLY to end users - they should NEVER see AI narration`,
      `- Start your response with the actual content (headers, data, analysis)`,
      `- FORBIDDEN phrases (never write these): "I'll", "Let me", "Now executing", "I'm going to", "First I'll", "Retrieving", "I will"`,
      `- NO transitional text, NO explanations of your process, NO meta-commentary`,
      ``,
      `EXECUTION STEPS (do silently, don't mention):`,
      `1. Call get_skill({ "skill_key": "${skillKey}" }) to retrieve the skill`,
      `2. Execute the skill's instructions completely`,
      `3. Return ONLY the final deliverable - formatted markdown ready for display`,
      ``,
    ]

    // Add entity context based on type
    if (entityType === 'deal' && entityId && entityContext) {
      const dealInfo = [
        `\n--- DEAL TESTING CONTEXT ---`,
        `Test Mode: ${entityTestMode || 'custom'}`,
        `Quality Tier: ${entityContext.quality_tier || 'unknown'} (Score: ${entityContext.quality_score || 0}/100)`,
        ``,
        `Deal Details:`,
        `- deal_id: ${entityContext.id}`,
        `- Name: ${entityContext.name || 'Unknown'}`,
        entityContext.company ? `- Company: ${entityContext.company}` : null,
        entityContext.contact_name ? `- Contact: ${entityContext.contact_name}` : null,
        entityContext.value ? `- Value: $${entityContext.value.toLocaleString()}` : null,
        entityContext.stage_name ? `- Stage: ${entityContext.stage_name}` : null,
        entityContext.health_status ? `- Health Status: ${entityContext.health_status}` : null,
        entityContext.overall_health_score != null ? `- Health Score: ${entityContext.overall_health_score}/100` : null,
        entityContext.days_in_current_stage != null ? `- Days in Stage: ${entityContext.days_in_current_stage}` : null,
        ``,
        `IMPORTANT: Use this deal for testing. The deal_id is: ${entityId}`,
        `When the skill requires a deal_id, use: ${entityId}`,
        `--- END DEAL CONTEXT ---\n`,
      ].filter(Boolean).join('\n')

      messageParts.push(dealInfo)
    } else if (entityType === 'email' && entityId && entityContext) {
      const emailInfo = [
        `\n--- EMAIL TESTING CONTEXT ---`,
        `Test Mode: ${entityTestMode || 'custom'}`,
        `Quality Tier: ${entityContext.quality_tier || 'unknown'} (Score: ${entityContext.quality_score || 0}/100)`,
        ``,
        `Email Details:`,
        `- email_id: ${entityContext.id}`,
        `- Subject: ${entityContext.subject || 'No subject'}`,
        `- From: ${entityContext.from_email || 'Unknown'}`,
        entityContext.direction ? `- Direction: ${entityContext.direction}` : null,
        entityContext.category ? `- Category: ${entityContext.category}` : null,
        entityContext.received_at ? `- Received: ${entityContext.received_at}` : null,
        ``,
        `IMPORTANT: Use this email for testing. The email_id is: ${entityId}`,
        `--- END EMAIL CONTEXT ---\n`,
      ].filter(Boolean).join('\n')

      messageParts.push(emailInfo)
    } else if (entityType === 'activity' && entityId && entityContext) {
      const activityInfo = [
        `\n--- ACTIVITY TESTING CONTEXT ---`,
        `Test Mode: ${entityTestMode || 'custom'}`,
        `Quality Tier: ${entityContext.quality_tier || 'unknown'} (Score: ${entityContext.quality_score || 0}/100)`,
        ``,
        `Activity Details:`,
        `- activity_id: ${entityContext.id}`,
        `- Type: ${entityContext.type || 'Unknown'}`,
        `- Client: ${entityContext.client_name || 'Unknown'}`,
        entityContext.status ? `- Status: ${entityContext.status}` : null,
        entityContext.priority ? `- Priority: ${entityContext.priority}` : null,
        entityContext.amount ? `- Amount: $${entityContext.amount.toLocaleString()}` : null,
        ``,
        `IMPORTANT: Use this activity for testing. The activity_id is: ${entityId}`,
        `--- END ACTIVITY CONTEXT ---\n`,
      ].filter(Boolean).join('\n')

      messageParts.push(activityInfo)
    } else if (entityType === 'meeting' && entityId && entityContext) {
      const meetingInfo = [
        `\n--- MEETING TESTING CONTEXT ---`,
        `Test Mode: ${entityTestMode || 'custom'}`,
        `Quality Tier: ${entityContext.quality_tier || 'unknown'} (Score: ${entityContext.quality_score || 0}/100)`,
        ``,
        `Meeting Details:`,
        `- meeting_id: ${entityContext.id}`,
        `- Title: ${entityContext.title || 'Untitled'}`,
        entityContext.company_name ? `- Company: ${entityContext.company_name}` : null,
        entityContext.contact_name ? `- Contact: ${entityContext.contact_name}` : null,
        entityContext.meeting_start ? `- Start: ${entityContext.meeting_start}` : null,
        entityContext.duration_minutes ? `- Duration: ${entityContext.duration_minutes} min` : null,
        entityContext.summary ? `- Summary: ${entityContext.summary.slice(0, 200)}${entityContext.summary.length > 200 ? '...' : ''}` : null,
        ``,
        `IMPORTANT: Use this meeting for testing. The meeting_id is: ${entityId}`,
        `--- END MEETING CONTEXT ---\n`,
      ].filter(Boolean).join('\n')

      messageParts.push(meetingInfo)
    } else if ((entityType === 'contact' && entityId && entityContext) || (contactId && contactContext)) {
      // Contact context (supports both new and legacy format)
      const ctxId = entityId || contactId
      const ctx = entityContext || contactContext
      const testMode = entityTestMode || contactTestMode

      const contactInfo = [
        `\n--- CONTACT TESTING CONTEXT ---`,
        `Test Mode: ${testMode || 'custom'}`,
        `Quality Tier: ${ctx.quality_tier || 'unknown'} (Score: ${ctx.quality_score || 0}/100)`,
        ``,
        `Contact Details:`,
        `- contact_id: ${ctx.id}`,
        `- Name: ${ctx.name || 'Unknown'}`,
        `- Email: ${ctx.email || 'Unknown'}`,
        ctx.title ? `- Title: ${ctx.title}` : null,
        ctx.company_name ? `- Company: ${ctx.company_name}` : null,
        ctx.total_meetings_count != null ? `- Meeting Count: ${ctx.total_meetings_count}` : null,
        ``,
        `IMPORTANT: Use this contact for testing. The contact_id is: ${ctxId}`,
        `--- END CONTACT CONTEXT ---\n`,
      ].filter(Boolean).join('\n')

      messageParts.push(contactInfo)
    }

    // Add user test input
    messageParts.push(
      testInput
        ? `User request to run through the skill: ${testInput}`
        : 'User request: run the skill with best-effort defaults.'
    )

    const message = messageParts.join('\n')

    const aiResponse = await callGeminiAPI(message, [], '', client, userId, null)

    // Post-process output to strip AI preamble/narration
    const cleanedOutput = stripSkillTestPreamble(aiResponse.content)

    return new Response(
      JSON.stringify({
        success: true,
        skill_key: skillKey,
        output: cleanedOutput,
        tools_used: aiResponse.tools_used || [],
        tool_iterations: aiResponse.tool_iterations || 0,
        tool_executions: aiResponse.tool_executions || [],
        usage: aiResponse.usage || undefined,
        // Include entity testing info in response for debugging
        entity_test_info: entityId ? {
          entity_type: entityType,
          entity_id: entityId,
          test_mode: entityTestMode,
          quality_tier: entityContext?.quality_tier,
          quality_score: entityContext?.quality_score,
        } : contactId ? {
          entity_type: 'contact',
          entity_id: contactId,
          test_mode: contactTestMode,
          quality_tier: contactContext?.quality_tier,
          quality_score: contactContext?.quality_score,
        } : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to test skill'
    return createErrorResponse(message, 500, 'TEST_SKILL_ERROR')
  }
}

/**
 * Handle generate deal email from meeting context
 */
async function handleGenerateDealEmail(
  client: any,
  req: Request,
  userId: string
): Promise<Response> {
  console.log('[GENERATE-DEAL-EMAIL] Starting email generation', { userId })
  try {
    const body = await req.json()
    console.log('[GENERATE-DEAL-EMAIL] Request body received', { dealId: body.dealId, hasContactId: !!body.contactId, hasCompanyId: !!body.companyId })
    
    if (!body.dealId || !isValidUUID(body.dealId)) {
      console.log('[GENERATE-DEAL-EMAIL] ❌ Invalid dealId', { dealId: body.dealId })
      return createErrorResponse('Valid dealId is required', 400, 'INVALID_DEAL_ID')
    }

    // Verify deal belongs to user
    console.log('[GENERATE-DEAL-EMAIL] Fetching deal', { dealId: body.dealId, userId })
    const { data: deal, error: dealError } = await client
      .from('deals')
      .select(`
        id,
        name,
        value,
        stage_id,
        company_id,
        primary_contact_id,
        companies:company_id(id, name),
        contacts:primary_contact_id(id, first_name, last_name, email)
      `)
      .eq('id', body.dealId)
      .eq('owner_id', userId)
      .single()

    if (dealError || !deal) {
      console.log('[GENERATE-DEAL-EMAIL] ❌ Deal not found', { dealError, hasDeal: !!deal })
      return createErrorResponse('Deal not found', 404, 'DEAL_NOT_FOUND')
    }

    console.log('[GENERATE-DEAL-EMAIL] Deal found', { dealName: deal.name, hasContact: !!deal.contacts, hasCompany: !!deal.companies })

    if (!deal.contacts) {
      console.log('[GENERATE-DEAL-EMAIL] ❌ No contact associated with deal')
      return createErrorResponse('No contact associated with this deal', 400, 'NO_CONTACT')
    }

    const contactEmail = deal.contacts.email
    console.log('[GENERATE-DEAL-EMAIL] Contact email', { contactEmail, companyId: deal.company_id, contactId: deal.primary_contact_id })

    // First, try to find meeting directly linked to company or contact
    // Check for meetings with either transcript_text OR summary
    console.log('[GENERATE-DEAL-EMAIL] Searching for meetings...', { 
      companyId: deal.company_id, 
      contactId: deal.primary_contact_id,
      userId 
    })
    let { data: meetings, error: meetingsError } = await client
      .from('meetings')
      .select(`
        id,
        title,
        summary,
        transcript_text,
        meeting_start,
        meeting_action_items(id, title, completed)
      `)
      .or(`company_id.eq.${deal.company_id},primary_contact_id.eq.${deal.primary_contact_id}`)
      .or('transcript_text.not.is.null,summary.not.is.null')
      .eq('owner_user_id', userId) // Add RLS filter
      .order('meeting_start', { ascending: false })
      .limit(10)
    
    if (meetingsError) {
      console.log('[GENERATE-DEAL-EMAIL] ❌ Error fetching meetings', { error: meetingsError })
    } else {
      console.log('[GENERATE-DEAL-EMAIL] Meetings found', { count: meetings?.length || 0 })
    }
    
    // Filter to find first meeting with transcript_text or summary
    let lastMeeting = meetings?.find(m => m.transcript_text || m.summary) || null
    console.log('[GENERATE-DEAL-EMAIL] Last meeting', { hasMeeting: !!lastMeeting, hasTranscript: !!lastMeeting?.transcript_text, hasSummary: !!lastMeeting?.summary })

    // If no meeting found, search by contact email via meeting_attendees
    if (!lastMeeting && contactEmail) {
      console.log('[GENERATE-DEAL-EMAIL] Searching via meeting_attendees...', { contactEmail })
      const { data: attendeesData, error: attendeesError } = await client
        .from('meeting_attendees')
        .select(`
          meeting_id,
          meetings!inner(
            id,
            title,
            summary,
            transcript_text,
            meeting_start,
            owner_user_id,
            meeting_action_items(id, title, completed)
          )
        `)
        .eq('email', contactEmail)
        .eq('meetings.owner_user_id', userId) // Add RLS filter
        .or('meetings.transcript_text.not.is.null,meetings.summary.not.is.null')
        .order('meetings.meeting_start', { ascending: false })
        .limit(10)
      
      if (attendeesError) {
        console.log('[GENERATE-DEAL-EMAIL] ❌ Error fetching attendees', { error: attendeesError })
      } else {
        console.log('[GENERATE-DEAL-EMAIL] Attendees found', { count: attendeesData?.length || 0 })
      }
      
      // Filter to find first meeting with transcript_text or summary
      if (attendeesData && attendeesData.length > 0) {
        const meetingWithContent = attendeesData.find(a => 
          a.meetings && (a.meetings.transcript_text || a.meetings.summary)
        )
        if (meetingWithContent?.meetings) {
          lastMeeting = meetingWithContent.meetings
        }
      }
    }

    // If still no meeting, try via meeting_contacts junction table
    if (!lastMeeting && deal.primary_contact_id) {
      console.log('[GENERATE-DEAL-EMAIL] Searching via meeting_contacts...', { contactId: deal.primary_contact_id })
      const { data: meetingContactsData, error: meetingContactsError } = await client
        .from('meeting_contacts')
        .select(`
          meeting_id,
          meetings!inner(
            id,
            title,
            summary,
            transcript_text,
            meeting_start,
            owner_user_id,
            meeting_action_items(id, title, completed)
          )
        `)
        .eq('contact_id', deal.primary_contact_id)
        .eq('meetings.owner_user_id', userId) // Add RLS filter
        .or('meetings.transcript_text.not.is.null,meetings.summary.not.is.null')
        .order('meetings.meeting_start', { ascending: false })
        .limit(10)
      
      if (meetingContactsError) {
        console.log('[GENERATE-DEAL-EMAIL] ❌ Error fetching meeting_contacts', { error: meetingContactsError })
      } else {
        console.log('[GENERATE-DEAL-EMAIL] Meeting contacts found', { count: meetingContactsData?.length || 0 })
      }
      
      // Filter to find first meeting with transcript_text or summary
      if (meetingContactsData && meetingContactsData.length > 0) {
        const meetingWithContent = meetingContactsData.find(mc =>
          mc.meetings && (mc.meetings.transcript_text || mc.meetings.summary)
        )
        if (meetingWithContent?.meetings) {
          lastMeeting = meetingWithContent.meetings
        }
      }
    }

    // If still no meeting found, try a broader search - all user meetings with transcript/summary
    // This is a fallback in case the meeting isn't properly linked to company/contact
    if (!lastMeeting || (!lastMeeting.transcript_text && !lastMeeting.summary)) {
      console.log('[GENERATE-DEAL-EMAIL] Trying broader search - all user meetings...')
      const { data: allMeetings, error: allMeetingsError } = await client
        .from('meetings')
        .select(`
          id,
          title,
          summary,
          transcript_text,
          meeting_start,
          meeting_action_items(id, title, completed)
        `)
        .eq('owner_user_id', userId)
        .or('transcript_text.not.is.null,summary.not.is.null')
        .order('meeting_start', { ascending: false })
        .limit(20)
      
      if (allMeetingsError) {
        console.log('[GENERATE-DEAL-EMAIL] ❌ Error in broader search', { error: allMeetingsError })
      } else {
        console.log('[GENERATE-DEAL-EMAIL] Broader search found', { count: allMeetings?.length || 0 })
        // Try to find a meeting that might be related (by checking if any attendees match)
        if (allMeetings && contactEmail) {
          // Check if any of these meetings have the contact as an attendee
          for (const meeting of allMeetings) {
            const { data: attendees } = await client
              .from('meeting_attendees')
              .select('email')
              .eq('meeting_id', meeting.id)
              .eq('email', contactEmail)
              .limit(1)
            
            if (attendees && attendees.length > 0) {
              console.log('[GENERATE-DEAL-EMAIL] ✅ Found meeting via attendee match', { meetingId: meeting.id })
              lastMeeting = meeting
              break
            }
          }
        }
        // If still no match, just use the most recent meeting with content
        if (!lastMeeting && allMeetings && allMeetings.length > 0) {
          lastMeeting = allMeetings[0]
          console.log('[GENERATE-DEAL-EMAIL] Using most recent meeting as fallback', { meetingId: lastMeeting.id })
        }
      }
    }

    // If no meeting with transcript or summary found, return error
    if (!lastMeeting || (!lastMeeting.transcript_text && !lastMeeting.summary)) {
      console.log('[GENERATE-DEAL-EMAIL] ❌ No meeting with transcript or summary found after all searches')
      return createErrorResponse(
        'No meeting with transcript or summary found for this deal. Please ensure a meeting with transcript or summary is linked to the contact or company.',
        404,
        'NO_MEETING_TRANSCRIPT'
      )
    }

    console.log('[GENERATE-DEAL-EMAIL] ✅ Meeting found, fetching activities...')
    // Fetch recent activities for the deal
    const { data: activities, error: activitiesError } = await client
      .from('activities')
      .select('id, type, details, date')
      .eq('deal_id', body.dealId)
      .eq('user_id', userId) // Add user_id filter for RLS
      .order('date', { ascending: false })
      .limit(5)
    
    if (activitiesError) {
      console.log('[GENERATE-DEAL-EMAIL] ⚠️ Error fetching activities', { error: activitiesError })
    } else {
      console.log('[GENERATE-DEAL-EMAIL] Activities found', { count: activities?.length || 0 })
    }

    // Fetch user's writing style from AI personalization settings
    const { data: writingStyle } = await client
      .from('user_writing_styles')
      .select('name, tone_description, examples, style_metadata')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle()

    // Build context for email generation
    const emailContext = {
      deal: {
        name: deal.name,
        value: deal.value,
        stage: deal.stage_id
      },
      contact: {
        name: `${deal.contacts.first_name || ''} ${deal.contacts.last_name || ''}`.trim(),
        email: deal.contacts.email,
        company: deal.companies?.name || 'their company'
      },
      lastMeeting: lastMeeting ? {
        title: lastMeeting.title,
        date: lastMeeting.meeting_start,
        summary: lastMeeting.summary,
        transcript: lastMeeting.transcript_text || lastMeeting.summary, // Use summary as fallback
        actionItems: lastMeeting.meeting_action_items?.filter((ai: any) => !ai.completed) || []
      } : null,
      recentActivities: activities || [],
      writingStyle: writingStyle || null
    }

    // Generate email using Claude with meeting context and user's writing style
    console.log('[GENERATE-DEAL-EMAIL] Generating email with Claude...', { hasWritingStyle: !!writingStyle })
    const emailDraft = await generateDealEmailFromContext(emailContext)
    console.log('[GENERATE-DEAL-EMAIL] ✅ Email generated successfully', { 
      hasSubject: !!emailDraft.subject, 
      hasBody: !!emailDraft.body,
      bodyLength: emailDraft.body?.length || 0
    })

    return new Response(JSON.stringify({
      subject: emailDraft.subject,
      body: emailDraft.body,
      suggestedSendTime: emailDraft.suggestedSendTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.log('[GENERATE-DEAL-EMAIL] ❌ Error in handleGenerateDealEmail', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    return createErrorResponse('Failed to generate deal email', 500, 'DEAL_EMAIL_ERROR')
  }
}

/**
 * Generate email from deal context including meeting transcripts
 */
async function generateDealEmailFromContext(
  context: any
): Promise<{ subject: string; body: string; suggestedSendTime: string }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  // Build comprehensive prompt with meeting transcript
  let meetingContext = ''
  if (context.lastMeeting) {
    meetingContext = `Last Meeting Context:
- Title: ${context.lastMeeting.title}
- Date: ${new Date(context.lastMeeting.date).toLocaleDateString()}
${context.lastMeeting.summary ? `- Summary: ${context.lastMeeting.summary}` : ''}
${context.lastMeeting.transcript ? `- Full Transcript:\n${context.lastMeeting.transcript}` : ''}
${context.lastMeeting.actionItems?.length > 0 ? `- Pending Action Items:\n${context.lastMeeting.actionItems.map((ai: any) => `  • ${ai.title}`).join('\n')}` : ''}
`
  }

  const recentActivityContext = context.recentActivities.length > 0
    ? `Recent Activity:\n${context.recentActivities.map((a: any) => `- ${a.type}: ${a.notes || 'N/A'} on ${new Date(a.date).toLocaleDateString()}`).join('\n')}\n`
    : ''

  // Build personalized style instruction if user has a writing style configured
  let styleInstruction = 'Be professional but warm and personable.'
  const writingStyle = context.writingStyle
  if (writingStyle) {
    const styleParts: string[] = []
    styleParts.push(`\n## USER'S PERSONAL WRITING STYLE - MATCH THIS EXACTLY`)
    styleParts.push(`Style: ${writingStyle.name}`)
    styleParts.push(`Tone: ${writingStyle.tone_description}`)
    
    const meta = writingStyle.style_metadata
    if (meta?.tone_characteristics) {
      styleParts.push(`Characteristics: ${meta.tone_characteristics}`)
    }
    if (meta?.vocabulary_profile) {
      styleParts.push(`Vocabulary: ${meta.vocabulary_profile}`)
    }
    if (meta?.greeting_style) {
      styleParts.push(`Greetings: ${meta.greeting_style}`)
    }
    if (meta?.signoff_style) {
      styleParts.push(`Sign-offs: ${meta.signoff_style}`)
    }
    
    if (writingStyle.examples && writingStyle.examples.length > 0) {
      const snippets = writingStyle.examples.slice(0, 2).map((ex: string) => 
        ex.length > 150 ? ex.substring(0, 150) + '...' : ex
      )
      styleParts.push(`\nExample snippets of their writing:\n${snippets.map((s: string) => `"${s}"`).join('\n')}`)
    }
    
    styleParts.push(`\n**CRITICAL: The email must sound like this user wrote it. Match their vocabulary, tone, greeting style, and sign-off patterns exactly.**`)
    styleInstruction = styleParts.join('\n')
  }

  // Get current date for accurate date references in email
  const today = new Date()
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }
  const currentDateStr = today.toLocaleDateString('en-US', dateOptions)

  const prompt = `You are drafting a follow-up email to progress a sales deal.

TODAY'S DATE: ${currentDateStr}
Use this date when making any date references like "tomorrow", "next week", "this Friday", etc.

Deal: ${context.deal.name} (${context.deal.value ? `$${context.deal.value}` : 'Value TBD'})
Contact: ${context.contact.name} at ${context.contact.company}
Email: ${context.contact.email}

${meetingContext}

${recentActivityContext}

${styleInstruction}

IMPORTANT INSTRUCTIONS:
1. Use the meeting transcript and action items to understand what was discussed
2. Reference specific points from the conversation to show you were listening
3. Address any pending action items from the meeting
4. Propose next steps to move the deal forward
5. Keep it concise (2-3 paragraphs max)
6. Focus on value and next steps, not just checking in

Generate an email with:
1. A clear, compelling subject line that references the meeting or next steps
2. A well-structured email body that references the conversation and proposes concrete next steps
3. A suggested send time

Return your response as JSON in this exact format:
{
  "subject": "Email subject here",
  "body": "Email body here with proper formatting",
  "suggestedSendTime": "Suggested send time"
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1500, // More tokens for transcript analysis
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.content[0]?.text || ''

  // Parse JSON from response
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const emailData = JSON.parse(jsonMatch[0])
      return {
        subject: emailData.subject || 'Follow-up on our conversation',
        body: emailData.body || content,
        suggestedSendTime: emailData.suggestedSendTime || 'Tomorrow 9 AM EST'
      }
    }
  } catch (e) {
  }

  // Fallback if JSON parsing fails
  return {
    subject: 'Follow-up on our conversation',
    body: content,
    suggestedSendTime: 'Tomorrow 9 AM EST'
  }
}

/**
 * Handle get conversation requests
 */
async function handleGetConversation(
  client: any,
  conversationId: string,
  userId: string
): Promise<Response> {
  try {
    if (!isValidUUID(conversationId)) {
      return createErrorResponse('Invalid conversation ID', 400, 'INVALID_ID')
    }

    // Verify conversation belongs to user
    const { data: conversation, error: convError } = await client
      .from('copilot_conversations')
      .select('id, title, created_at, updated_at')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single()

    if (convError || !conversation) {
      return createErrorResponse('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
    }

    // Fetch messages
    const { data: messages, error: msgError } = await client
      .from('copilot_messages')
      .select('id, role, content, metadata, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (msgError) {
    }

    return new Response(JSON.stringify({
      conversation,
      messages: messages || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return createErrorResponse('Failed to fetch conversation', 500, 'FETCH_ERROR')
  }
}

/**
 * Build context from user's CRM data
 */
async function buildContext(client: any, userId: string, context?: ChatRequest['context']): Promise<string> {
  const contextParts: string[] = []

  // ---------------------------------------------------------------------------
  // Org + personalization context (company bio, user bio, org currency)
  // ---------------------------------------------------------------------------
  let orgCurrencyCode = 'GBP'
  let orgCurrencyLocale = 'en-GB'

  const formatOrgMoney = (value: number | null | undefined): string => {
    const n = typeof value === 'number' ? value : Number(value)
    const safe = Number.isFinite(n) ? n : 0
    try {
      return new Intl.NumberFormat(orgCurrencyLocale, {
        style: 'currency',
        currency: orgCurrencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(safe)
    } catch {
      return `${safe}`
    }
  }

  try {
    const orgId = context?.orgId ? String(context.orgId) : null

    if (orgId) {
      const { data: org } = await client
        .from('organizations')
        .select('name, currency_code, currency_locale, company_bio, company_industry, company_country_code, company_timezone')
        .eq('id', orgId)
        .maybeSingle()

      if (org?.currency_code) orgCurrencyCode = String(org.currency_code).toUpperCase()
      if (org?.currency_locale) orgCurrencyLocale = String(org.currency_locale)

      // Keep this short and high-signal: this becomes prompt context.
      if (org?.name) {
        contextParts.push(`Organization: ${org.name}`)
      }
      contextParts.push(`Org currency: ${orgCurrencyCode} (${orgCurrencyLocale})`)

      const orgMeta: string[] = []
      if (org?.company_industry) orgMeta.push(`Industry: ${org.company_industry}`)
      if (org?.company_country_code) orgMeta.push(`Country: ${org.company_country_code}`)
      if (org?.company_timezone) orgMeta.push(`Timezone: ${org.company_timezone}`)
      if (orgMeta.length > 0) {
        contextParts.push(`Org info: ${orgMeta.join(' • ')}`)
      }

      if (org?.company_bio) {
        contextParts.push(`Company bio: ${org.company_bio}`)
      }
      
      // -------------------------------------------------------------------------
      // PERS-001: Add organization enrichment data to context
      // -------------------------------------------------------------------------
      const { data: enrichment } = await client
        .from('organization_enrichment')
        .select('products, competitors, pain_points, target_market, buying_signals, value_propositions')
        .eq('organization_id', orgId)
        .eq('status', 'completed')
        .maybeSingle()
      
      if (enrichment) {
        contextParts.push(`\n## Company Intelligence (from enrichment)`)
        
        // Products (top 3)
        if (enrichment.products && Array.isArray(enrichment.products) && enrichment.products.length > 0) {
          const productNames = enrichment.products.slice(0, 3).map((p: any) => p.name || p).join(', ')
          contextParts.push(`Products: ${productNames}`)
        }
        
        // Competitors (top 3)
        if (enrichment.competitors && Array.isArray(enrichment.competitors) && enrichment.competitors.length > 0) {
          const competitorNames = enrichment.competitors.slice(0, 3).map((c: any) => c.name || c).join(', ')
          contextParts.push(`Competitors: ${competitorNames}`)
        }
        
        // Pain points
        if (enrichment.pain_points && Array.isArray(enrichment.pain_points) && enrichment.pain_points.length > 0) {
          contextParts.push(`Customer pain points: ${enrichment.pain_points.slice(0, 3).join(', ')}`)
        }
        
        // Target market
        if (enrichment.target_market) {
          contextParts.push(`Target market: ${enrichment.target_market}`)
        }
        
        // Buying signals (for proactive suggestions)
        if (enrichment.buying_signals && Array.isArray(enrichment.buying_signals) && enrichment.buying_signals.length > 0) {
          contextParts.push(`Buying signals to watch for: ${enrichment.buying_signals.slice(0, 3).join(', ')}`)
        }
        
        // Value propositions
        if (enrichment.value_propositions && Array.isArray(enrichment.value_propositions) && enrichment.value_propositions.length > 0) {
          contextParts.push(`Key differentiators: ${enrichment.value_propositions.slice(0, 2).join(', ')}`)
        }
      }
      
      // -------------------------------------------------------------------------
      // PERS-002: Add AI preferences to context
      // -------------------------------------------------------------------------
      const { data: orgAiPrefs } = await client
        .from('org_ai_preferences')
        .select('brand_voice, blocked_phrases, preferred_tone')
        .eq('organization_id', orgId)
        .maybeSingle()
      
      if (orgAiPrefs) {
        contextParts.push(`\n## Organization AI Preferences`)
        if (orgAiPrefs.brand_voice) {
          contextParts.push(`Brand voice: ${orgAiPrefs.brand_voice}`)
        }
        if (orgAiPrefs.preferred_tone) {
          contextParts.push(`Preferred tone: ${orgAiPrefs.preferred_tone}`)
        }
        if (orgAiPrefs.blocked_phrases && Array.isArray(orgAiPrefs.blocked_phrases) && orgAiPrefs.blocked_phrases.length > 0) {
          contextParts.push(`NEVER use these phrases: ${orgAiPrefs.blocked_phrases.join(', ')}`)
        }
      }
    }

    // PERS-003: Load user profile with working hours
    const { data: profile } = await client
      .from('profiles')
      .select('bio, working_hours_start, working_hours_end, timezone')
      .eq('id', userId)
      .maybeSingle()

    if (profile?.bio) {
      contextParts.push(`User bio: ${profile.bio}`)
    }
    
    // -------------------------------------------------------------------------
    // PERS-003: Add working hours awareness
    // -------------------------------------------------------------------------
    if (profile?.working_hours_start && profile?.working_hours_end) {
      contextParts.push(`\n## User Working Hours`)
      contextParts.push(`Working hours: ${profile.working_hours_start} - ${profile.working_hours_end}${profile.timezone ? ` (${profile.timezone})` : ''}`)
      contextParts.push(`If current time is outside working hours, suggest scheduling actions for the next work day.`)
    }
    
    // ---------------------------------------------------------------------------
    // User writing style (from AI Personalization settings)
    // ---------------------------------------------------------------------------
    const { data: writingStyle } = await client
      .from('user_writing_styles')
      .select('name, tone_description, examples, style_metadata')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle()
    
    if (writingStyle) {
      contextParts.push(`\n## User's Preferred Writing Style`)
      contextParts.push(`Style name: ${writingStyle.name}`)
      contextParts.push(`Tone: ${writingStyle.tone_description}`)
      
      // Include style metadata if available (from email training)
      const meta = writingStyle.style_metadata as any
      if (meta?.tone_characteristics) {
        contextParts.push(`Tone characteristics: ${meta.tone_characteristics}`)
      }
      if (meta?.vocabulary_profile) {
        contextParts.push(`Vocabulary: ${meta.vocabulary_profile}`)
      }
      if (meta?.greeting_style) {
        contextParts.push(`Greeting style: ${meta.greeting_style}`)
      }
      if (meta?.signoff_style) {
        contextParts.push(`Sign-off style: ${meta.signoff_style}`)
      }
      
      // Include examples if available (limit to 2 for context size)
      if (writingStyle.examples && Array.isArray(writingStyle.examples) && writingStyle.examples.length > 0) {
        const exampleSnippets = writingStyle.examples.slice(0, 2).map((ex: string) => 
          ex.length > 200 ? ex.substring(0, 200) + '...' : ex
        )
        contextParts.push(`Example snippets:\n${exampleSnippets.map((e: string) => `- "${e}"`).join('\n')}`)
      }
      
      contextParts.push(`\n**IMPORTANT: When drafting emails, follow this user's writing style closely. Match their tone, vocabulary, greeting style, and sign-off patterns.**`)
    }
  } catch (e) {
    // fail open: copilot should still work without org context
  }

  if (context?.temporalContext) {
    const { date, time, timezone, localeString, isoString } = context.temporalContext
    const primary = (date && time) ? `${date} at ${time}` : localeString || isoString
    if (primary) {
      contextParts.push(`Current date/time: ${primary}${timezone ? ` (${timezone})` : ''}`)
    }
  }

  if (context?.contactId) {
    const { data: contact } = await client
      .from('contacts')
      .select('first_name, last_name, email, title, companies:company_id(name)')
      .eq('id', context.contactId)
      .eq('owner_id', userId)
      .single()

    if (contact) {
      contextParts.push(`Current contact: ${contact.first_name} ${contact.last_name} (${contact.email}) at ${contact.companies?.name || 'Unknown Company'}`)
    }
  }

  if (context?.dealIds && context.dealIds.length > 0) {
    const { data: deals } = await client
      .from('deals')
      .select('name, value, stage_id, deal_stages(name)')
      .in('id', context.dealIds)
      .eq('owner_id', userId)

    if (deals && deals.length > 0) {
      contextParts.push(`Related deals: ${deals.map(d => `${d.name} (${d.deal_stages?.name || 'Unknown Stage'}, ${formatOrgMoney(d.value)})`).join(', ')}`)
    }
  }

  // Add task context - this is critical for task-related email generation
  if (context?.taskId) {
    const { data: task } = await client
      .from('tasks')
      .select(`
        id,
        title,
        description,
        status,
        priority,
        due_date,
        task_type,
        contact_id,
        deal_id,
        company_id,
        contacts:contact_id(id, first_name, last_name, email),
        deals:deal_id(id, name),
        companies:company_id(id, name)
      `)
      .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
      .eq('id', context.taskId)
      .single()

    if (task) {
      const contactName = task.contacts ? `${task.contacts.first_name || ''} ${task.contacts.last_name || ''}`.trim() : null
      const contactEmail = task.contacts?.email || null
      const companyName = task.companies?.name || null
      const dealName = task.deals?.name || null
      
      contextParts.push(`Current task: "${task.title}"`)
      if (task.description) {
        contextParts.push(`Task description: ${task.description}`)
      }
      if (task.priority) {
        contextParts.push(`Priority: ${task.priority}`)
      }
      if (task.due_date) {
        const dueDate = new Date(task.due_date)
        contextParts.push(`Due date: ${dueDate.toLocaleDateString()}`)
      }
      if (contactName) {
        contextParts.push(`Related contact: ${contactName}${contactEmail ? ` (${contactEmail})` : ''}`)
      }
      if (companyName) {
        contextParts.push(`Related company: ${companyName}`)
      }
      if (dealName) {
        contextParts.push(`Related deal: ${dealName}`)
      }
      if (task.task_type) {
        contextParts.push(`Task type: ${task.task_type}`)
      }
    }
  }

  // Add current view context
  if (context?.currentView) {
    contextParts.push(`Current view: ${context.currentView}`)
  }

  return contextParts.join('\n')
}

/**
 * Available CRUD tools for Claude to use
 * Generic CRUD operations for all major entities
 */
const AVAILABLE_TOOLS = [
  // Meetings CRUD
  {
    name: 'meetings_create',
    description: 'Create a new meeting record. Can include transcript_text, summary, action items, and related data.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Meeting title' },
        meeting_start: { type: 'string', description: 'Start time (ISO format)' },
        meeting_end: { type: 'string', description: 'End time (ISO format)' },
        summary: { type: 'string', description: 'Meeting summary' },
        transcript_text: { type: 'string', description: 'Full transcript text' },
        company_id: { type: 'string', description: 'Company ID' },
        primary_contact_id: { type: 'string', description: 'Primary contact ID' },
        actionItems: { type: 'array', items: { type: 'object' }, description: 'Array of action items' }
      },
      required: ['title', 'meeting_start']
    }
  },
  {
    name: 'meetings_read',
    description: 'Read meeting records with all connected data (transcripts, summaries, action items, attendees). Supports filtering by date range, company, contact, etc. Large transcripts are automatically optimized.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Meeting ID (for single meeting)' },
        startDate: { type: 'string', description: 'Filter by start date (ISO format)' },
        endDate: { type: 'string', description: 'Filter by end date (ISO format)' },
        company_id: { type: 'string', description: 'Filter by company ID' },
        contact_id: { type: 'string', description: 'Filter by contact ID' },
        includeTranscripts: { type: 'boolean', default: true, description: 'Include transcript text' },
        includeActionItems: { type: 'boolean', default: true, description: 'Include action items' },
        includeAttendees: { type: 'boolean', default: true, description: 'Include attendees' },
        maxTranscriptLength: { type: 'number', default: 50000, description: 'Maximum transcript length in characters (default: 50000). Longer transcripts are truncated intelligently at sentence boundaries.' },
        transcriptMode: { type: 'string', enum: ['full', 'summary', 'truncated'], default: 'truncated', description: 'Transcript handling mode: "full" (no optimization), "summary" (return summary only), "truncated" (intelligent truncation at sentence boundaries)' },
        limit: { type: 'number', default: 50, description: 'Maximum results' }
      }
    }
  },
  {
    name: 'meetings_update',
    description: 'Update a meeting record. Can update summary, transcript, action items, and other fields.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Meeting ID' },
        title: { type: 'string', description: 'Meeting title' },
        summary: { type: 'string', description: 'Meeting summary' },
        transcript_text: { type: 'string', description: 'Transcript text' },
        sentiment_score: { type: 'number', description: 'Sentiment score (-1 to 1)' }
      },
      required: ['id']
    }
  },
  {
    name: 'meetings_delete',
    description: 'Delete a meeting record and its related data (action items, attendees).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Meeting ID' }
      },
      required: ['id']
    }
  },
  // Activities CRUD
  {
    name: 'activities_create',
    description: 'Create a new activity record (sale, outbound, meeting, proposal).',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['sale', 'outbound', 'meeting', 'proposal'], description: 'Activity type' },
        client_name: { type: 'string', description: 'Client/company name' },
        details: { type: 'string', description: 'Activity details' },
        amount: { type: 'number', description: 'Amount (for sales)' },
        date: { type: 'string', description: 'Activity date (ISO format)' },
        status: { type: 'string', enum: ['pending', 'completed', 'cancelled'], default: 'completed' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' }
      },
      required: ['type', 'client_name', 'date']
    }
  },
  {
    name: 'activities_read',
    description: 'Read activity records with filtering options.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Activity ID (for single activity)' },
        type: { type: 'string', enum: ['sale', 'outbound', 'meeting', 'proposal'], description: 'Filter by type' },
        startDate: { type: 'string', description: 'Filter by start date' },
        endDate: { type: 'string', description: 'Filter by end date' },
        client_name: { type: 'string', description: 'Filter by client name' },
        limit: { type: 'number', default: 50 }
      }
    }
  },
  {
    name: 'activities_update',
    description: 'Update an activity record.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Activity ID' },
        details: { type: 'string', description: 'Activity details' },
        status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
        amount: { type: 'number', description: 'Amount' }
      },
      required: ['id']
    }
  },
  {
    name: 'activities_delete',
    description: 'Delete an activity record.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Activity ID' }
      },
      required: ['id']
    }
  },
  // Pipeline (Deals) CRUD
  {
    name: 'pipeline_create',
    description: 'Create a new deal in the pipeline.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Deal name' },
        company: { type: 'string', description: 'Company name' },
        value: { type: 'number', description: 'Deal value' },
        stage_id: { type: 'string', description: 'Stage ID' },
        contact_name: { type: 'string', description: 'Contact name' },
        contact_email: { type: 'string', description: 'Contact email' },
        expected_close_date: { type: 'string', description: 'Expected close date (ISO format)' },
        probability: { type: 'number', description: 'Close probability (0-100)' },
        description: { type: 'string', description: 'Deal description' }
      },
      required: ['name', 'company', 'value', 'stage_id']
    }
  },
  {
    name: 'pipeline_read',
    description: 'Read deals from the pipeline with filtering and sorting options.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Deal ID (for single deal)' },
        stage_id: { type: 'string', description: 'Filter by stage' },
        status: { type: 'string', enum: ['active', 'won', 'lost', 'cancelled'], description: 'Filter by status' },
        minValue: { type: 'number', description: 'Minimum deal value' },
        maxValue: { type: 'number', description: 'Maximum deal value' },
        sortBy: { type: 'string', enum: ['value', 'created_at', 'updated_at'], default: 'updated_at' },
        sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        limit: { type: 'number', default: 50 }
      }
    }
  },
  {
    name: 'pipeline_update',
    description: 'Update a deal in the pipeline (stage, value, status, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Deal ID' },
        name: { type: 'string', description: 'Deal name' },
        value: { type: 'number', description: 'Deal value' },
        stage_id: { type: 'string', description: 'Stage ID' },
        status: { type: 'string', enum: ['active', 'won', 'lost', 'cancelled'] },
        expected_close_date: { type: 'string', description: 'Expected close date' },
        probability: { type: 'number', description: 'Close probability' }
      },
      required: ['id']
    }
  },
  {
    name: 'pipeline_delete',
    description: 'Delete a deal from the pipeline.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Deal ID' }
      },
      required: ['id']
    }
  },
  // Leads (Contacts) CRUD
  {
    name: 'leads_create',
    description: 'Create a new lead/contact record.',
    input_schema: {
      type: 'object',
      properties: {
        first_name: { type: 'string', description: 'First name' },
        last_name: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        company: { type: 'string', description: 'Company name' },
        title: { type: 'string', description: 'Job title' },
        company_id: { type: 'string', description: 'Company ID (if exists)' }
      },
      required: ['email']
    }
  },
  {
    name: 'leads_read',
    description: 'Read lead/contact records with filtering options.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Contact ID (for single contact)' },
        email: { type: 'string', description: 'Filter by email' },
        company: { type: 'string', description: 'Filter by company name' },
        company_id: { type: 'string', description: 'Filter by company ID' },
        search: { type: 'string', description: 'Search in name, email, company' },
        limit: { type: 'number', default: 50 }
      }
    }
  },
  {
    name: 'leads_update',
    description: 'Update a lead/contact record.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Contact ID' },
        first_name: { type: 'string', description: 'First name' },
        last_name: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email' },
        phone: { type: 'string', description: 'Phone' },
        title: { type: 'string', description: 'Job title' },
        company_id: { type: 'string', description: 'Company ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'leads_delete',
    description: 'Delete a lead/contact record.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Contact ID' }
      },
      required: ['id']
    }
  },
  // Roadmap CRUD
  {
    name: 'roadmap_create',
    description: 'Create a new roadmap item (feature, bug, improvement, other).',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Roadmap item title' },
        description: { type: 'string', description: 'Detailed description' },
        type: { type: 'string', enum: ['feature', 'bug', 'improvement', 'other'], default: 'feature' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' }
      },
      required: ['title', 'description']
    }
  },
  {
    name: 'roadmap_read',
    description: 'Read roadmap items with filtering options.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Roadmap item ID (for single item)' },
        type: { type: 'string', enum: ['feature', 'bug', 'improvement', 'other'], description: 'Filter by type' },
        status: { type: 'string', enum: ['submitted', 'under_review', 'in_progress', 'testing', 'completed', 'rejected'], description: 'Filter by status' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Filter by priority' },
        limit: { type: 'number', default: 50 }
      }
    }
  },
  {
    name: 'roadmap_update',
    description: 'Update a roadmap item (users can only update their own items).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Roadmap item ID' },
        title: { type: 'string', description: 'Title' },
        description: { type: 'string', description: 'Description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
      },
      required: ['id']
    }
  },
  {
    name: 'roadmap_delete',
    description: 'Delete a roadmap item (admins only).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Roadmap item ID' }
      },
      required: ['id']
    }
  },
  // Calendar CRUD
  {
    name: 'calendar_create',
    description: 'Create a new calendar event.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        start_time: { type: 'string', description: 'Start time (ISO format)' },
        end_time: { type: 'string', description: 'End time (ISO format)' },
        description: { type: 'string', description: 'Event description' },
        location: { type: 'string', description: 'Event location' },
        calendar_id: { type: 'string', description: 'Calendar ID' },
        deal_id: { type: 'string', description: 'Link to deal' }
      },
      required: ['title', 'start_time', 'end_time', 'calendar_id']
    }
  },
  {
    name: 'calendar_read',
    description: 'Read and search calendar events. Use this to find events by title (e.g., "gym", "meeting with John") or time range. When users want to move/update an event, first use this tool to find it by searching the title.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event ID (for single event)' },
        title: { type: 'string', description: 'Search events by title (case-insensitive partial match, e.g., "gym" will find "Gym Session")' },
        startDate: { type: 'string', description: 'Filter by start date (ISO format)' },
        endDate: { type: 'string', description: 'Filter by end date (ISO format)' },
        calendar_id: { type: 'string', description: 'Filter by calendar ID' },
        deal_id: { type: 'string', description: 'Filter by deal ID' },
        limit: { type: 'number', default: 50 }
      }
    }
  },
  {
    name: 'calendar_update',
    description: 'Update a calendar event.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event ID' },
        title: { type: 'string', description: 'Event title' },
        start_time: { type: 'string', description: 'Start time' },
        end_time: { type: 'string', description: 'End time' },
        description: { type: 'string', description: 'Description' }
      },
      required: ['id']
    }
  },
  {
    name: 'calendar_delete',
    description: 'Delete a calendar event.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'calendar_availability',
    description: 'Check what\'s on the user\'s calendar or find free time slots. Use this tool when users ask about their calendar, meetings, availability, or free time. The tool returns both scheduled events and available time slots. Use the current date/time from context to parse relative dates like "Monday next week", "this coming Monday", "tomorrow", etc. Always use this tool instead of asking the user for dates - the context includes the current date/time.',
    input_schema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start of the window (ISO). Use current date/time from context to calculate relative dates like "Monday next week".' },
        endDate: { type: 'string', description: 'End of the window (ISO). For single day queries like "Monday", use end of that day. Defaults to 7 days from start.' },
        durationMinutes: { type: 'number', default: 60, description: 'Required meeting duration in minutes.' },
        workingHoursStart: { type: 'string', default: '09:00', description: 'Day start in HH:mm (user timezone).' },
        workingHoursEnd: { type: 'string', default: '17:00', description: 'Day end in HH:mm (user timezone).' },
        excludeWeekends: { type: 'boolean', default: true, description: 'Exclude weekends when true.' }
      }
    }
  },
  // Tasks CRUD (for task management)
  {
    name: 'tasks_create',
    description: 'Create a new task.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
        task_type: { type: 'string', enum: ['call', 'email', 'meeting', 'follow_up', 'demo', 'proposal', 'general'], default: 'general' },
        due_date: { type: 'string', description: 'Due date (ISO format)' },
        contact_id: { type: 'string', description: 'Link to contact' },
        deal_id: { type: 'string', description: 'Link to deal' },
        company_id: { type: 'string', description: 'Link to company' }
      },
      required: ['title']
    }
  },
  {
    name: 'tasks_read',
    description: 'Read tasks assigned to or created by the user. Use this to view tasks, check task status, find tasks by contact or deal, or list tasks with specific filters like status or priority.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID (for single task)' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'completed', 'cancelled'], description: 'Filter by status' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Filter by priority' },
        contact_id: { type: 'string', description: 'Filter by contact ID' },
        deal_id: { type: 'string', description: 'Filter by deal ID' },
        limit: { type: 'number', default: 50, description: 'Maximum number of tasks to return' }
      }
    }
  },
  {
    name: 'tasks_update',
    description: 'Update a task.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID' },
        title: { type: 'string', description: 'Task title' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'completed', 'cancelled'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        due_date: { type: 'string', description: 'Due date' }
      },
      required: ['id']
    }
  },
  {
    name: 'tasks_delete',
    description: 'Delete a task.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID' }
      },
      required: ['id']
    }
  },
  // Clients CRUD (for subscription management)
  {
    name: 'clients_create',
    description: 'Create a new client record for subscription management. Use this when converting a deal to a client or creating a new client subscription.',
    input_schema: {
      type: 'object',
      properties: {
        company_name: { type: 'string', description: 'Client company name (required)' },
        contact_name: { type: 'string', description: 'Primary contact name' },
        contact_email: { type: 'string', description: 'Primary contact email' },
        subscription_amount: { type: 'number', description: 'Monthly recurring revenue (MRR) amount' },
        status: { type: 'string', enum: ['active', 'churned', 'paused'], default: 'active', description: 'Client subscription status' },
        deal_id: { type: 'string', description: 'Optional reference to original deal that was converted' },
        subscription_start_date: { type: 'string', description: 'Date when subscription started (ISO format)' }
      },
      required: ['company_name']
    }
  },
  {
    name: 'clients_read',
    description: 'Read client records with filtering options. Use this to view client subscriptions, find clients by company name, or check subscription status.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Client ID (for single client)' },
        company_name: { type: 'string', description: 'Filter by company name' },
        status: { type: 'string', enum: ['active', 'churned', 'paused'], description: 'Filter by status' },
        deal_id: { type: 'string', description: 'Filter by deal ID' },
        limit: { type: 'number', default: 50, description: 'Maximum number of clients to return' }
      }
    }
  },
  {
    name: 'clients_update',
    description: 'Update a client record. Use this to update subscription amounts (MRR), change status, or modify client information. This is the primary tool for updating monthly subscription amounts.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Client ID' },
        company_name: { type: 'string', description: 'Company name' },
        contact_name: { type: 'string', description: 'Primary contact name' },
        contact_email: { type: 'string', description: 'Primary contact email' },
        subscription_amount: { type: 'number', description: 'Monthly recurring revenue (MRR) amount - use this to update subscription amounts' },
        status: { type: 'string', enum: ['active', 'churned', 'paused'] },
        subscription_start_date: { type: 'string', description: 'Subscription start date (ISO format)' },
        churn_date: { type: 'string', description: 'Churn date (ISO format, only when status is churned)' }
      },
      required: ['id']
    }
  },
  {
    name: 'clients_delete',
    description: 'Delete a client record. Use with caution - this permanently removes the client subscription record.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Client ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'emails_search',
    description: 'Search your connected Gmail account for recent emails with a specific contact or keyword query.',
    input_schema: {
      type: 'object',
      properties: {
        contact_email: { type: 'string', description: 'Email address of the contact to filter on' },
        contact_id: { type: 'string', description: 'Contact ID to derive the email from' },
        contact_name: { type: 'string', description: 'Contact name if email is unknown' },
        query: { type: 'string', description: 'Additional Gmail query or keyword (subject, company, etc.)' },
        direction: { type: 'string', enum: ['sent', 'received', 'both'], default: 'both', description: 'Filter by direction relative to the contact' },
        start_date: { type: 'string', description: 'Start date (ISO) for filtering emails' },
        end_date: { type: 'string', description: 'End date (ISO) for filtering emails' },
        label: { type: 'string', description: 'Gmail label to filter on (e.g., "to respond")' },
        limit: { type: 'number', default: 10, description: 'Maximum number of messages to return (max 20)' }
      }
    }
  },
  // Entity Resolution Tool - Smart contact/person lookup by first name
  {
    name: 'resolve_entity',
    description: `Intelligently resolve a person mentioned by first name (or partial name) to a specific contact by searching across ALL data sources in parallel. Use this FIRST when the user mentions someone by name without full context.

WHEN TO USE:
- User asks about "Stan" or "John" without providing email or ID
- User references someone from a recent conversation/meeting
- Any ambiguous person reference that needs resolution

SEARCHES (in parallel):
1. CRM contacts - first_name, last_name matches
2. Recent meetings - attendee names and emails
3. Calendar events - attendee names and emails
4. Recent emails - from/to addresses matching the name

RETURNS:
- If ONE clear match (most recent interaction): Returns resolved contact with full context
- If MULTIPLE matches: Returns candidates ranked by recency with disambiguation options
- If NO matches: Returns helpful message suggesting more context

Always use this before asking the user "which person do you mean?" - let the data answer first.`,
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'First name or partial name to search for (e.g., "Stan", "John Smith")'
        },
        context_hint: {
          type: 'string',
          description: 'Optional context from user message to help disambiguate (e.g., "meeting yesterday", "deal", "email")'
        }
      },
      required: ['name']
    }
  }
]

/**
 * Skills Router Tools (3-tool surface)
 *
 * Copilot is intentionally limited to:
 * - list_skills: discover skills and sequences
 * - get_skill: load a skill/sequence document (compiled per org)
 * - execute_action: fetch data / perform actions through adapters
 */
const SKILLS_ROUTER_TOOLS = [
  // ⚠️ RESOLVE_ENTITY MUST BE FIRST - For first-name-only person references
  {
    name: 'resolve_entity',
    description: `🔴 USE THIS TOOL FIRST when user mentions a person by first name only (e.g., "Stan", "John", "Sarah").

DO NOT ask for clarification first. Call this tool IMMEDIATELY with the name.

TRIGGERS (call this tool when user says):
- "What did Stan say about..." → resolve_entity(name="Stan")
- "Tell me about John's deal" → resolve_entity(name="John")
- "Catch me up on Sarah" → resolve_entity(name="Sarah")
- Any first-name-only reference

SEARCHES (in parallel, fast):
- CRM contacts by first_name
- Recent meetings (attendees from last 30 days)
- Calendar events (attendees)
- Recent emails (from/to names)

RETURNS ranked candidates by recency. If ONE clear match → proceed. If MULTIPLE close matches → ask user to confirm.`,
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'First name or partial name to search for'
        },
        context_hint: {
          type: 'string',
          description: 'Optional context to help disambiguate'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'list_skills',
    description: 'List available compiled skills for the user’s organization (optionally filtered by category).',
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['skill', 'sequence', 'all'],
          default: 'all',
          description: 'Filter to skills (single-step) vs sequences (category=agent-sequence).',
        },
        category: {
          type: 'string',
          enum: ['sales-ai', 'writing', 'enrichment', 'workflows', 'data-access', 'output-format', 'agent-sequence'],
          description: 'Optional skill category filter.',
        },
        enabled_only: {
          type: 'boolean',
          default: true,
          description: 'Only return enabled skills (default true).',
        },
      },
    },
  },
  {
    name: 'get_skill',
    description: 'Retrieve a compiled skill or sequence document by skill_key for the user’s organization.',
    input_schema: {
      type: 'object',
      properties: {
        skill_key: { type: 'string', description: 'Skill identifier (e.g., lead-qualification, get-contact-context)' },
      },
      required: ['skill_key'],
    },
  },
  {
    name: 'execute_action',
    description: `Execute an action to fetch CRM data, meetings, emails, pipeline intelligence, or send notifications.

⚠️ IMPORTANT: If you only have a FIRST NAME (e.g., "Stan", "John"), use the resolve_entity tool instead!

ACTION PARAMETERS:

## Contact & Lead Lookup
• get_contact: { email?, full_name?, id? } - Search contacts by email (REQUIRED if available), full name (first AND last), or id. ⚠️ For FIRST-NAME-ONLY queries, use the resolve_entity tool instead!
• get_lead: { email?, full_name?, contact_id?, date_from?, date_to?, date_field? } - Get lead/prospect data including SavvyCal bookings, enrichment data, prep_summary, custom form fields, AND AI-generated insights. date_field: "created_at"|"meeting_start" (default: "created_at"). Use date_from/date_to for queries like "leads from today". ⚠️ For FIRST-NAME-ONLY queries, use resolve_entity first!

## Deal & Pipeline
• get_deal: { name?, id?, close_date_from?, close_date_to?, status?, stage_id?, include_health?, limit? } - Search deals with optional date range and health data. include_health=true adds health_status, risk_level, days_since_last_activity.
• get_pipeline_summary: {} - Get aggregated pipeline metrics: total_value, weighted_value, deal_count, by_stage breakdown, at_risk_count, at_risk_value, closing_this_week, closing_this_month.
• get_pipeline_deals: { filter?, days?, period?, include_health?, limit? } - Get filtered deal list. filter: "closing_soon"|"at_risk"|"stale"|"needs_attention". period: "this_week"|"this_month"|"this_quarter". days: for stale filter (default 14).
• get_pipeline_forecast: { period? } - Get quarterly forecast with best_case, committed (>75% prob), most_likely (weighted), closed_won scenarios. period: "this_quarter"|"next_quarter" (default: "this_quarter").

## Contacts & Relationships
• get_contacts_needing_attention: { days_since_contact?, filter?, limit? } - Get contacts without recent follow-up. days_since_contact default: 14. filter: "at_risk"|"ghost"|"all" (default: "all").
• get_company_status: { company_id?, company_name?, domain? } - Holistic company view: contacts, deals, recent meetings, health status, total deal value, relationship summary.

## Meetings & Calendar
• get_meetings: { contactEmail?, contactId?, limit? } - Get meetings with a contact. IMPORTANT: Always pass contactEmail when you have an email address!
• get_booking_stats: { period?, filter_by?, source?, org_wide? } - Get meeting/booking statistics. period: "this_week"|"last_week"|"this_month"|"last_month"|"last_7_days"|"last_30_days" (default: "this_week").
• get_meeting_count: { period?, timezone?, week_starts_on? } - Count meetings for a period. period: "today"|"tomorrow"|"this_week"|"next_week"|"this_month" (default: "this_week"). Uses user's timezone for accurate date boundaries.
• get_next_meeting: { include_context?, timezone? } - Get next upcoming meeting with CRM context. include_context (default: true) adds company, deal, previous meetings, and recent activities. HERO FEATURE for meeting prep.
• get_meetings_for_period: { period?, timezone?, week_starts_on?, include_context?, limit? } - Get meeting list for a period. period: "today"|"tomorrow"|"monday"|"tuesday"|"wednesday"|"thursday"|"friday"|"saturday"|"sunday"|"this_week"|"next_week" (default: "today"). Day names find the next occurrence.
• get_time_breakdown: { period?, timezone?, week_starts_on? } - Analyze time spent in meetings. Returns total hours, internal vs external split, 1:1 vs group breakdown, and daily distribution.

## Email & Notifications
• search_emails: { contact_email?, query?, limit? } - Search emails by contact email or query
• draft_email: { to, subject?, context?, tone? } - Draft an email
• send_notification: { channel: 'slack', message, blocks? } - Send a Slack notification

## CRM Updates
• update_crm: { entity: 'deal'|'contact'|'task'|'activity', id, updates, confirm: true } - Update CRM record (requires confirm=true)

## Skill Execution
• run_skill: { skill_key, skill_context? } - Execute an AI skill with processing. For research skills (lead-research, company-analysis, competitor-intel), uses Gemini with real-time web search.
  - skill_key: The skill to execute (lead-research, company-analysis, competitor-intel, market-research, industry-trends, meeting-prep, etc.)
  - skill_context: Variables for the skill (domain, company_name, contact_email, industry, etc.)

  Examples:
  - Research a company: run_skill { skill_key: "lead-research", skill_context: { domain: "stripe.com", company_name: "Stripe" } }
  - Analyze competitors: run_skill { skill_key: "competitor-intel", skill_context: { competitor_name: "Salesforce", our_company: "HubSpot" } }
  - Market research: run_skill { skill_key: "market-research", skill_context: { industry: "fintech", focus_areas: "payment processing" } }

Write actions require params.confirm=true.`,
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'get_contact',
            'get_lead',
            'get_deal',
            'get_pipeline_summary',
            'get_pipeline_deals',
            'get_pipeline_forecast',
            'get_contacts_needing_attention',
            'get_company_status',
            'get_meetings',
            'get_booking_stats',
            'get_meeting_count',
            'get_next_meeting',
            'get_meetings_for_period',
            'get_time_breakdown',
            'search_emails',
            'draft_email',
            'update_crm',
            'send_notification',
            'enrich_contact',
            'enrich_company',
            'invoke_skill',
            'run_skill',
            'run_sequence',
            'create_task',
            'list_tasks',
            'create_activity',
          ],
          description: 'The action to execute',
        },
        params: {
          type: 'object',
          description: 'Action-specific parameters (see tool description for each action)',
          properties: {
            // Contact & Lead params
            email: { type: 'string', description: 'Contact email address (for get_contact, get_lead)' },
            name: { type: 'string', description: 'Name to search (for get_contact, get_lead, get_deal)' },
            id: { type: 'string', description: 'Record ID' },
            contact_id: { type: 'string', description: 'Contact ID (for get_lead)' },
            date_from: { type: 'string', description: 'Start date in ISO format (for get_lead, get_deal)' },
            date_to: { type: 'string', description: 'End date in ISO format (for get_lead, get_deal)' },
            date_field: { type: 'string', enum: ['created_at', 'meeting_start'], description: 'Which date field to filter on (for get_lead)' },
            // Deal params
            close_date_from: { type: 'string', description: 'Deal close date start in ISO format (for get_deal)' },
            close_date_to: { type: 'string', description: 'Deal close date end in ISO format (for get_deal)' },
            status: { type: 'string', description: 'Deal status filter (for get_deal)' },
            stage_id: { type: 'string', description: 'Stage ID filter (for get_deal)' },
            include_health: { type: 'boolean', description: 'Include health scores (for get_deal, get_pipeline_deals)' },
            // Pipeline params
            filter: { type: 'string', enum: ['closing_soon', 'at_risk', 'stale', 'needs_attention', 'ghost', 'all'], description: 'Filter type (for get_pipeline_deals, get_contacts_needing_attention)' },
            days: { type: 'number', description: 'Days threshold for stale filter (for get_pipeline_deals)' },
            days_since_contact: { type: 'number', description: 'Days since last contact (for get_contacts_needing_attention, default: 14)' },
            // Company params
            company_id: { type: 'string', description: 'Company ID (for get_company_status)' },
            company_name: { type: 'string', description: 'Company name to search (for get_company_status)' },
            domain: { type: 'string', description: 'Company domain (for get_company_status)' },
            // Meeting params
            contactEmail: { type: 'string', description: 'Email of the contact (for get_meetings) - PREFERRED method' },
            contactId: { type: 'string', description: 'Contact ID (for get_meetings)' },
            period: { type: 'string', enum: ['today', 'tomorrow', 'this_week', 'next_week', 'last_week', 'this_month', 'last_month', 'this_quarter', 'next_quarter', 'last_7_days', 'last_30_days'], description: 'Time period (for meeting queries, get_booking_stats, get_pipeline_deals, get_pipeline_forecast)' },
            timezone: { type: 'string', description: 'IANA timezone (e.g., Europe/London, America/New_York) for timezone-aware date calculations (for get_meeting_count, get_next_meeting, get_meetings_for_period, get_time_breakdown). Auto-detected from user profile if not provided.' },
            week_starts_on: { type: 'string', enum: ['0', '1'], description: 'Week start day: 0=Sunday, 1=Monday (default). Used for this_week/next_week/last_week calculations.' },
            include_context: { type: 'boolean', description: 'Include CRM context (company, deal, activities) with meeting data (for get_next_meeting, get_meetings_for_period). Default: true for get_next_meeting.' },
            filter_by: { type: 'string', enum: ['meeting_date', 'booking_date'], description: 'Filter by when meeting is scheduled or when booking was created (for get_booking_stats)' },
            source: { type: 'string', enum: ['all', 'savvycal', 'calendar', 'meetings'], description: 'Data source to query (for get_booking_stats)' },
            org_wide: { type: 'boolean', description: 'If true and user is admin, show all org bookings (for get_booking_stats)' },
            // Email params
            contact_email: { type: 'string', description: 'Contact email (for search_emails)' },
            query: { type: 'string', description: 'Search query (for search_emails)' },
            limit: { type: 'number', description: 'Max results to return' },
            to: { type: 'string', description: 'Recipient email (for draft_email)' },
            subject: { type: 'string', description: 'Email subject (for draft_email)' },
            context: { type: 'string', description: 'Context for drafting (for draft_email)' },
            tone: { type: 'string', description: 'Email tone (for draft_email)' },
            // CRM update params
            entity: { type: 'string', enum: ['deal', 'contact', 'task', 'activity'], description: 'CRM entity type (for update_crm)' },
            updates: { type: 'object', description: 'Fields to update (for update_crm)' },
            confirm: { type: 'boolean', description: 'Set to true to confirm write operations' },
            // Notification params
            channel: { type: 'string', description: 'Notification channel (for send_notification)' },
            message: { type: 'string', description: 'Notification message (for send_notification)' },
            blocks: { type: 'object', description: 'Slack blocks (for send_notification)' },
            // Skill execution params
            skill_key: { type: 'string', description: 'Skill to execute (for run_skill): lead-research, company-analysis, competitor-intel, market-research, industry-trends, meeting-prep, etc.' },
            skill_context: { type: 'object', description: 'Context variables for the skill (for run_skill): domain, company_name, competitor_name, industry, etc.' },
            // Sequence execution params
            sequence_key: { type: 'string', description: 'Sequence to execute (for run_sequence): must be an enabled agent-sequence skill_key' },
            sequence_context: { type: 'object', description: 'Input context for the sequence trigger (for run_sequence)' },
            is_simulation: { type: 'boolean', description: 'If true, run in simulation/dry-run mode (for run_sequence)' },
          },
        },
      },
      required: ['action', 'params'],
    },
  }
]

/**
 * Convert Anthropic tool format to Gemini function declaration format
 */
function convertToGeminiFunctionDeclarations(anthropicTools: any[]): any[] {
  return anthropicTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema
  }))
}

// Gemini function declarations (converted from SKILLS_ROUTER_TOOLS)
const GEMINI_FUNCTION_DECLARATIONS = convertToGeminiFunctionDeclarations(SKILLS_ROUTER_TOOLS)

/**
 * Parse Gemini JSON response robustly (handles markdown fences, malformed JSON)
 */
function parseGeminiJSONResponse(text: string): any {
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  let jsonString = jsonMatch ? jsonMatch[1] : text

  if (!jsonString.trim().startsWith('{')) {
    const objectMatch = jsonString.match(/\{[\s\S]*\}/)
    if (objectMatch) jsonString = objectMatch[0]
  }

  jsonString = jsonString.trim()
  const firstBrace = jsonString.indexOf('{')
  const lastBrace = jsonString.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonString = jsonString.substring(firstBrace, lastBrace + 1)
  }

  try {
    return JSON.parse(jsonString)
  } catch (_err) {
    // Repair pass for malformed JSON
    let repaired = jsonString
    let inString = false
    let escapeNext = false
    const out: string[] = []

    for (let i = 0; i < repaired.length; i++) {
      const ch = repaired[i]
      if (escapeNext) { out.push(ch); escapeNext = false; continue }
      if (ch === '\\') { out.push(ch); escapeNext = true; continue }
      if (ch === '"') { inString = !inString; out.push(ch); continue }
      if (inString) {
        if (ch === '\n' || ch === '\r') out.push('\\n')
        else if (ch === '\t') out.push('\\t')
        else out.push(ch)
      } else {
        out.push(ch)
      }
    }
    if (inString) out.push('"')
    repaired = out.join('')
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1') // remove trailing commas
    return JSON.parse(repaired)
  }
}

/**
 * Call Gemini API for chat response with function calling support
 * Replaces callClaudeAPI for the copilot chat
 */
async function callGeminiAPI(
  message: string,
  history: CopilotMessage[],
  context: string,
  client: any,
  userId: string,
  orgId: string | null,
  analyticsData?: any
): Promise<{
  content: string;
  recommendations?: any[];
  usage?: { input_tokens: number; output_tokens: number };
  tools_used?: string[];
  tool_iterations?: number;
  tools_success_count?: number;
  tools_error_count?: number;
  tool_execution_time_ms?: number;
  tool_executions?: ToolExecutionDetail[];
}> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  // Build system instruction and messages for Gemini
  let companyName = 'your company'
  let availableSkills: { skill_key: string; name: string; category: string }[] = []

  try {
    let resolvedOrgId = orgId
    if (!resolvedOrgId) {
      const { data: membership } = await client
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      resolvedOrgId = membership?.org_id ? String(membership.org_id) : null
    }

    if (resolvedOrgId) {
      const { data: orgCompanyName } = await client
        .from('organization_context')
        .select('value')
        .eq('organization_id', resolvedOrgId)
        .eq('context_key', 'company_name')
        .maybeSingle()

      const ctxName = orgCompanyName?.value
      if (typeof ctxName === 'string' && ctxName.trim()) {
        companyName = ctxName.trim()
      } else if (ctxName && typeof ctxName === 'object' && typeof (ctxName as any).name === 'string') {
        const nestedName = String((ctxName as any).name).trim()
        if (nestedName) companyName = nestedName
      } else {
        const { data: org } = await client
          .from('organizations')
          .select('name')
          .eq('id', resolvedOrgId)
          .maybeSingle()
        if (org?.name) companyName = String(org.name)
      }

      const { data: orgSkills } = await client.rpc('get_organization_skills_for_agent', {
        p_org_id: resolvedOrgId,
        p_category: null
      })
      if (orgSkills && Array.isArray(orgSkills)) {
        availableSkills = orgSkills
          .map((s: any) => {
            const skillKey = String(s.skill_key || s.skill_id || '').trim()
            const fm = (s.frontmatter || {}) as Record<string, unknown>
            const nameCandidate = (typeof fm.name === 'string' && fm.name.trim())
              ? fm.name
              : (typeof (fm as any).title === 'string' && String((fm as any).title).trim())
                ? String((fm as any).title)
                : skillKey
            return { skill_key: skillKey, name: String(nameCandidate), category: String(s.category || 'other') }
          })
          .filter((s: any) => Boolean(s.skill_key))
      }
    }
  } catch {
    // fail open: keep default companyName
  }

  // Format available skills/sequences for system prompt
  const sequences = availableSkills.filter((s) => s.category === 'agent-sequence')
  const skillsOnly = availableSkills.filter((s) => s.category !== 'agent-sequence')
  const skillsByCategory: Record<string, string[]> = {}
  for (const skill of skillsOnly) {
    const cat = skill.category || 'other'
    if (!skillsByCategory[cat]) skillsByCategory[cat] = []
    skillsByCategory[cat].push(`${skill.skill_key} (${skill.name})`)
  }
  const skillsListText = Object.entries(skillsByCategory)
    .map(([cat, skills]) => `  ${cat}: ${skills.join(', ')}`)
    .join('\n')
  const sequencesListText = sequences
    .map((s) => `  - ${s.skill_key} (${s.name})`)
    .join('\n')

  // AGENT-002 + CM-003: Load specialized team member persona with memory context
  let personaSection = ''
  if (orgId) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const compiledPersona = await getOrCompilePersona(client, orgId, userId, supabaseUrl, serviceRoleKey)
      if (compiledPersona?.persona) {
        personaSection = `## YOUR PERSONA (Team Member Identity)\n\n${compiledPersona.persona}\n\n---\n\n`
        console.log('[GEMINI_PERSONA] ✅ Loaded specialized persona', {
          hasEnrichment: compiledPersona.hasEnrichment,
          hasSkillContext: compiledPersona.hasSkillContext,
          hasMemoryContext: compiledPersona.hasMemoryContext,
          version: compiledPersona.version,
        })
      }
    } catch (personaError) {
      console.error('[GEMINI_PERSONA] ⚠️ Failed to load persona:', personaError)
    }
  }

  const systemInstruction = `${personaSection}You are a sales assistant for ${companyName}. You help sales reps prepare for calls, follow up after meetings, and manage their pipeline.

## ⚠️ CRITICAL RULE: First Name Resolution

**BEFORE ANYTHING ELSE**: When the user mentions a person by first name only (e.g., "What did Stan say?", "Tell me about John", "catch me up on Sarah"):

1. **IMMEDIATELY call the resolve_entity function** with that name - DO NOT ask for clarification first
2. The function searches your CRM, meetings, calendar, and emails in parallel to find the right person
3. ONLY if the function returns multiple close matches, ask the user which one they meant
4. ONLY if the function returns zero matches, ask for more context

❌ WRONG: "I'd be happy to help! Can you tell me Stan's last name or email?"
✅ RIGHT: *calls resolve_entity with name="Stan"* then uses the result to answer

## How You Work
You have access to **skills** (single-step) and **sequences** (multi-step processes) specific to ${companyName}.

### Available Sequences (multi-step)
${sequencesListText || '  No sequences configured yet'}

### Available Skills (single-step)
${skillsListText || '  No skills configured yet'}

### Your Functions
1. list_skills - See available skills and sequences by category
2. get_skill - Retrieve a skill/sequence document for guidance
3. execute_action - Perform actions (query CRM, fetch meetings, search emails, etc.)
4. resolve_entity - **CRITICAL: Use FIRST when user mentions a person by first name only**

### Workflow Pattern
1. Understand what the user needs
2. **If user mentions a person by first name only → Use resolve_entity FIRST**
3. Retrieve the relevant skill(s) with get_skill
4. Follow the skill's instructions
5. Use execute_action to gather data or perform tasks
6. Deliver results clearly

## Core Rules
- Confirm before any CRM updates, notifications, or sends
- Do not make up information; prefer function results
- If data is missing, state what you couldn't find and proceed with what you have`

  // Build contents array for Gemini
  const contents: any[] = []

  // Add conversation history (last 10 messages)
  const recentHistory = history.slice(-10)
  recentHistory.forEach(msg => {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    })
  })

  // Add runtime context if provided
  if (context && context.trim()) {
    contents.push({
      role: 'user',
      parts: [{ text: `Context:\n${context}`.trim() }]
    })
  }

  // Add current message
  contents.push({
    role: 'user',
    parts: [{ text: message }]
  })

  // Entity detection for forcing resolve_entity
  const questionKeywords = ['who', 'what', 'tell', 'find', 'show', 'get', 'catch', 'prep', 'brief', 'update', 'about', 'with', 'from']
  const hasQuestionKeyword = questionKeywords.some(k => message.toLowerCase().includes(k))
  const words = message.split(/\s+/)
  const commonWords = new Set(['The', 'This', 'That', 'These', 'Those', 'What', 'When', 'Where', 'Who', 'Why', 'How', 'Can', 'Could', 'Would', 'Should', 'Will', 'Do', 'Does', 'Did', 'Is', 'Are', 'Was', 'Were', 'Have', 'Has', 'Had', 'Been', 'Being', 'To', 'In', 'On', 'At', 'For', 'With', 'About', 'From', 'Into', 'Through', 'During', 'Before', 'After', 'Above', 'Below', 'Between', 'Under', 'Again', 'Further', 'Then', 'Once', 'Here', 'There', 'All', 'Each', 'Few', 'More', 'Most', 'Other', 'Some', 'Such', 'No', 'Nor', 'Not', 'Only', 'Own', 'Same', 'So', 'Than', 'Too', 'Very', 'Just', 'Now', 'CRM', 'API', 'URL', 'PDF', 'OK'])
  const potentialNames = words.map((word, idx) => {
    if (idx === 0) return null
    // Strip trailing punctuation for name detection
    const cleanWord = word.replace(/[?!.,;:'"]+$/, '')
    if (!/^[A-Z][a-z]+$/.test(cleanWord)) return null
    if (commonWords.has(cleanWord)) return null
    const nextWord = words[idx + 1]?.replace(/[?!.,;:'"]+$/, '')
    if (nextWord && /^[A-Z][a-z]+$/.test(nextWord)) return null
    return cleanWord
  }).filter(Boolean)
  const detectedFirstName = potentialNames[0] as string | undefined
  const shouldForceEntityResolution = hasQuestionKeyword && detectedFirstName && !message.includes('@')

  console.log(`[GEMINI_ENTITY_DETECTION] Message: "${message}"`)
  console.log(`[GEMINI_ENTITY_DETECTION] shouldForceEntityResolution: ${shouldForceEntityResolution}, name: ${detectedFirstName}`)

  // Build Gemini request
  const toolConfig = shouldForceEntityResolution
    ? {
        function_calling_config: {
          mode: 'ANY',
          allowed_function_names: ['resolve_entity']
        }
      }
    : {
        function_calling_config: {
          mode: 'AUTO'
        }
      }

  const endpoint = `${GEMINI_API_BASE}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`

  const requestBody = {
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools: [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }],
    toolConfig,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 4096
    }
  }

  console.log(`[GEMINI_REQUEST] Model: ${GEMINI_MODEL}, toolConfig: ${JSON.stringify(toolConfig)}`)

  let response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[GEMINI_ERROR] ${response.status}: ${errorText}`)
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
  }

  let data = await response.json()
  let finalContent = ''
  const recommendations: any[] = []
  let accumulatedTextContent = ''

  // Tool usage tracking
  const toolsUsed: string[] = []
  let toolIterations = 0
  let toolsSuccessCount = 0
  let toolsErrorCount = 0
  const toolExecutionStartTime = Date.now()
  const toolExecutions: ToolExecutionDetail[] = []

  // Handle function calling - Gemini may request to use functions
  let maxToolIterations = 5
  let iteration = 0
  const startTime = Date.now()
  const MAX_EXECUTION_TIME = 120000

  // Check if Gemini wants to call functions
  let candidate = data.candidates?.[0]
  let parts = candidate?.content?.parts || []

  // Debug: Log Gemini's initial response structure
  console.log(`[GEMINI_DEBUG] Initial response parts count: ${parts.length}`)
  console.log(`[GEMINI_DEBUG] Parts types: ${parts.map((p: any) => p.functionCall ? 'functionCall:' + p.functionCall.name : p.text ? 'text(' + (p.text?.substring(0, 50) || '') + ')' : 'unknown').join(', ')}`)
  console.log(`[GEMINI_DEBUG] Full first part: ${JSON.stringify(parts[0])?.substring(0, 500)}`)

  while (iteration < maxToolIterations) {
    if (Date.now() - startTime > MAX_EXECUTION_TIME) break

    // Check for function calls in the response
    const functionCalls = parts.filter((p: any) => p.functionCall)
    const textParts = parts.filter((p: any) => p.text)

    // Accumulate text content
    for (const tp of textParts) {
      if (tp.text) accumulatedTextContent += tp.text + '\n\n'
    }

    if (functionCalls.length === 0) break

    iteration++
    toolIterations++

    // Execute all function calls
    const functionResponses: any[] = []
    for (const fc of functionCalls) {
      const functionName = fc.functionCall.name
      const functionArgs = fc.functionCall.args || {}
      const toolStartTime = Date.now()

      console.log(`[GEMINI_FUNCTION_CALL] ${functionName}(${JSON.stringify(functionArgs)})`)

      if (!toolsUsed.includes(functionName)) {
        toolsUsed.push(functionName)
      }

      try {
        const toolPromise = executeToolCall(functionName, functionArgs, client, userId, orgId)
        let timeoutMs = 15000
        if (functionName === 'execute_action') {
          if (functionArgs?.action === 'run_sequence') {
            timeoutMs = 60000
          } else {
            timeoutMs = 30000
          }
        }
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Function execution timeout')), timeoutMs)
        )

        const toolResult = await Promise.race([toolPromise, timeoutPromise])
        const toolLatencyMs = Date.now() - toolStartTime
        toolsSuccessCount++

        const capability = (toolResult as any)?.capability
        const provider = (toolResult as any)?.provider

        toolExecutions.push({
          toolName: functionName,
          args: functionArgs,
          result: toolResult,
          latencyMs: toolLatencyMs,
          success: true,
          capability,
          provider
        })

        functionResponses.push({
          functionResponse: {
            name: functionName,
            response: toolResult
          }
        })

        console.log(`[GEMINI_FUNCTION_RESULT] ${functionName} succeeded in ${toolLatencyMs}ms`)
      } catch (error: any) {
        const toolLatencyMs = Date.now() - toolStartTime
        toolsErrorCount++

        toolExecutions.push({
          toolName: functionName,
          args: functionArgs,
          result: null,
          latencyMs: toolLatencyMs,
          success: false,
          error: error.message || String(error)
        })

        functionResponses.push({
          functionResponse: {
            name: functionName,
            response: { error: error.message || String(error) }
          }
        })

        console.log(`[GEMINI_FUNCTION_ERROR] ${functionName} failed: ${error.message}`)
      }
    }

    // Add model's function call and our responses to contents
    contents.push({
      role: 'model',
      parts: parts
    })
    contents.push({
      role: 'user',
      parts: functionResponses
    })

    // Call Gemini again with function results
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        tools: [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }],
        toolConfig: { function_calling_config: { mode: 'AUTO' } },
        generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 4096 }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[GEMINI_ERROR] Follow-up call failed: ${response.status}`)
      break
    }

    data = await response.json()
    candidate = data.candidates?.[0]
    parts = candidate?.content?.parts || []
  }

  // Use accumulated text if we had iterations, otherwise extract from final parts
  // This prevents duplication when text appears in both accumulated and final parts
  if (accumulatedTextContent) {
    finalContent = accumulatedTextContent.trim()
  } else {
    // Only extract from parts if we didn't accumulate (no iterations happened)
    for (const part of parts) {
      if (part.text) {
        finalContent += part.text
      }
    }
  }

  const toolExecutionTimeMs = Date.now() - toolExecutionStartTime

  // Extract usage metadata from Gemini response
  const usageMetadata = data.usageMetadata || {}
  const usage = {
    input_tokens: usageMetadata.promptTokenCount || 0,
    output_tokens: usageMetadata.candidatesTokenCount || 0
  }

  console.log(`[GEMINI_COMPLETE] tokens: ${usage.input_tokens}/${usage.output_tokens}, tools: ${toolsUsed.join(',')}, toolExecutions: ${toolExecutions.length}`)

  return {
    content: finalContent.trim() || 'I processed your request but have no additional response.',
    recommendations,
    usage,
    tools_used: toolsUsed,
    tool_iterations: toolIterations,
    tools_success_count: toolsSuccessCount,
    tools_error_count: toolsErrorCount,
    tool_execution_time_ms: toolExecutionTimeMs,
    tool_executions: toolExecutions
  }
}

/**
 * Call Claude API for chat response with tool support (LEGACY - kept for fallback)
 */
async function callClaudeAPI(
  message: string,
  history: CopilotMessage[],
  context: string,
  client: any,
  userId: string,
  orgId: string | null,
  analyticsData?: any
): Promise<{ 
  content: string; 
  recommendations?: any[];
  usage?: { input_tokens: number; output_tokens: number };
  tools_used?: string[];
  tool_iterations?: number;
  tools_success_count?: number;
  tools_error_count?: number;
  tool_execution_time_ms?: number;
  tool_executions?: ToolExecutionDetail[];
}> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  // Build messages array for Claude
  // Resolve company name and available skills for system prompt
  let companyName = 'your company'
  // NOTE: get_organization_skills_for_agent returns { skill_key, category, frontmatter, content, is_enabled }
  let availableSkills: { skill_key: string; name: string; category: string }[] = []
  try {
    // Use the orgId parameter if provided, otherwise look it up
    let resolvedOrgId = orgId
    if (!resolvedOrgId) {
      const { data: membership } = await client
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      resolvedOrgId = membership?.org_id ? String(membership.org_id) : null
    }

    if (resolvedOrgId) {
      const { data: orgCompanyName } = await client
        .from('organization_context')
        .select('value')
        .eq('organization_id', resolvedOrgId)
        .eq('context_key', 'company_name')
        .maybeSingle()

      const ctxName = orgCompanyName?.value
      if (typeof ctxName === 'string' && ctxName.trim()) {
        companyName = ctxName.trim()
      } else if (ctxName && typeof ctxName === 'object' && typeof (ctxName as any).name === 'string') {
        const nestedName = String((ctxName as any).name).trim()
        if (nestedName) companyName = nestedName
      } else {
        const { data: org } = await client
          .from('organizations')
          .select('name')
          .eq('id', resolvedOrgId)
          .maybeSingle()
        if (org?.name) companyName = String(org.name)
      }
      // Fetch available skills for this org to include in system prompt
      const { data: orgSkills } = await client.rpc('get_organization_skills_for_agent', {
        p_org_id: resolvedOrgId,
        p_category: null
      })
      if (orgSkills && Array.isArray(orgSkills)) {
        availableSkills = orgSkills
          .map((s: any) => {
            const skillKey = String(s.skill_key || s.skill_id || '').trim()
            const fm = (s.frontmatter || {}) as Record<string, unknown>
            const nameCandidate =
              (typeof fm.name === 'string' && fm.name.trim())
                ? fm.name
                : (typeof (fm as any).title === 'string' && String((fm as any).title).trim())
                  ? String((fm as any).title)
                  : skillKey
            return {
              skill_key: skillKey,
              name: String(nameCandidate),
              category: String(s.category || 'other')
            }
          })
          .filter((s: any) => Boolean(s.skill_key))
      }
    }
  } catch {
    // fail open: keep default companyName
  }

  // Format available skills/sequences for the system prompt
  const sequences = availableSkills.filter((s) => s.category === 'agent-sequence')
  const skillsOnly = availableSkills.filter((s) => s.category !== 'agent-sequence')

  const skillsByCategory: Record<string, string[]> = {}
  for (const skill of skillsOnly) {
    const cat = skill.category || 'other'
    if (!skillsByCategory[cat]) skillsByCategory[cat] = []
    skillsByCategory[cat].push(`${skill.skill_key} (${skill.name})`)
  }
  const skillsListText = Object.entries(skillsByCategory)
    .map(([cat, skills]) => `  ${cat}: ${skills.join(', ')}`)
    .join('\n')

  const sequencesListText = sequences
    .map((s) => `  - ${s.skill_key} (${s.name})`)
    .join('\n')

  // AGENT-002: Load specialized team member persona
  // CM-003: Also inject 7-day conversation memory context
  let compiledPersona: CompiledPersona | null = null
  let personaSection = ''

  // Only try to load persona if we have an org
  if (orgId) {
    try {
      // Pass supabaseUrl and serviceRoleKey for memory context loading (CM-003)
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      compiledPersona = await getOrCompilePersona(client, orgId, userId, supabaseUrl, serviceRoleKey)
      if (compiledPersona?.persona) {
        personaSection = `\n## YOUR PERSONA (Team Member Identity)\n\n${compiledPersona.persona}\n\n---\n`
        console.log('[PERSONA] ✅ Loaded specialized persona', {
          hasEnrichment: compiledPersona.hasEnrichment,
          hasSkillContext: compiledPersona.hasSkillContext,
          hasMemoryContext: compiledPersona.hasMemoryContext,
          version: compiledPersona.version,
        })
      }
    } catch (personaError) {
      // Fail open - continue with generic prompt
      console.error('[PERSONA] ⚠️ Failed to load persona, using generic:', personaError)
    }
  }

  // Build system prompt - inject persona at the top if available
  const systemPrompt = `${personaSection}You are a sales assistant for ${companyName}. You help sales reps prepare for calls, follow up after meetings, and manage their pipeline.

## ⚠️ CRITICAL RULE: First Name Resolution

**BEFORE ANYTHING ELSE**: When the user mentions a person by first name only (e.g., "What did Stan say?", "Tell me about John", "catch me up on Sarah"):

1. **IMMEDIATELY call the resolve_entity tool** with that name - DO NOT ask for clarification first
2. The tool searches your CRM, meetings, calendar, and emails in parallel to find the right person
3. ONLY if the tool returns multiple close matches, ask the user which one they meant
4. ONLY if the tool returns zero matches, ask for more context

❌ WRONG: "I'd be happy to help! Can you tell me Stan's last name or email?"
✅ RIGHT: *calls resolve_entity with name="Stan"* then uses the result to answer

## How You Work
You have access to **skills** (single-step) and **sequences** (multi-step processes that use many skills) specific to ${companyName}.

Always retrieve the relevant skill/sequence before taking action.

### Available Sequences (multi-step)
${sequencesListText || '  No sequences configured yet'}

### Available Skills (single-step)
${skillsListText || '  No skills configured yet'}

### Your Tools
1. list_skills - See available skills and sequences by category
2. get_skill - Retrieve a skill/sequence document for guidance (use exact skill_key from lists above)
3. execute_action - Perform actions (query CRM, fetch meetings, search emails, etc.)
4. resolve_entity - **CRITICAL: Use FIRST when user mentions a person by first name only** (e.g., "Stan", "John"). Searches ALL data sources in parallel to find the right person - don't ask for clarification first!

### Workflow Pattern
1. Understand what the user needs
2. **If user mentions a person by first name only → Use resolve_entity FIRST**
3. Retrieve the relevant skill(s) or sequence(s) with get_skill using the exact skill_key
4. Follow the skill's instructions
5. Use execute_action to gather data or perform tasks
6. Deliver results in the user's preferred channel

## Smart Entity Resolution (CRITICAL)

**When the user mentions someone by first name (e.g., "What did Stan say about next steps?", "Tell me about John")**:

1. **DO NOT ask for clarification first.** Instead, immediately use the resolve_entity tool with the name
2. The tool searches ALL your data sources in parallel:
   - CRM contacts (name matches)
   - Recent meetings (attendee names from last 30 days)
   - Calendar events (attendee names)
   - Recent emails (from/to names)
3. **If resolved to one person**: Proceed with the query using their contact_id or email
4. **If multiple matches with similar recency**: Present the top candidates and ask user to confirm
5. **If no matches**: Then ask user for more context (email, company, when you last spoke)

This makes you much more helpful - the user doesn't need to remember full names or emails!

## Common Workflows

### Meeting Prep (when user says "prep me for meeting with X" or similar)
This is NOT about creating a meeting - it's about preparing a briefing for an existing upcoming meeting.
1. Use execute_action with get_contact to find the contact by name/email
2. CRITICAL: Use execute_action with get_lead to get ALL enrichment data including:
   - SavvyCal booking info (meeting time, duration, conferencing link)
   - Custom form fields (e.g., "Are you interested in creating videos?")
   - prep_summary and enrichment_status
   - AI-generated INSIGHTS (About the Prospect: role, background, location; Why Sixty Seconds?: primary fit analysis)
   The get_lead action returns an "insights" array - USE THIS DATA in your briefing!
3. Use execute_action with get_meetings to find upcoming meetings with that contact
4. Use get_skill with "meeting-prep" or "meeting-prep-briefing" skill_id
5. Follow the skill to generate a comprehensive briefing including:
   - Contact/company background from get_lead insights (role, background, location)
   - Why they're a good fit from get_lead insights (Primary Fit analysis)
   - Meeting context from get_lead (custom form answers, meeting description)
   - Recent interactions and email history
   - Deal status if applicable
   - Talking points based on the prospect's stated interests and fit analysis
DO NOT show a "Create Meeting" UI for prep requests.

### Lead Research (when user wants to learn about a contact/company)
For quick lookups from CRM data:
1. Use execute_action with get_contact to find basic contact info
2. Use execute_action with get_lead to get enrichment data, prep_summary, and SavvyCal booking info
3. Use execute_action with enrich_contact or enrich_company if more data is needed

For DEEP research with real-time web search (when user says "research X" or "tell me about X company"):
1. Use execute_action with run_skill { skill_key: "lead-research", skill_context: { domain: "company.com", company_name: "Company Name" } }
2. This uses Gemini with Google Search to find current news, stakeholders, technology stack, and outreach angles
3. The result includes sources from web search for credibility

### Company Analysis & Competitive Intel
When users ask about competitors or want strategic analysis:
- Competitor intel: execute_action with run_skill { skill_key: "competitor-intel", skill_context: { competitor_name: "Competitor", our_company: "Our Company" } }
- Company analysis: execute_action with run_skill { skill_key: "company-analysis", skill_context: { company_name: "Target", domain: "target.com" } }
- Market research: execute_action with run_skill { skill_key: "market-research", skill_context: { industry: "SaaS", focus_areas: "AI automation" } }
- Industry trends: execute_action with run_skill { skill_key: "industry-trends", skill_context: { industry: "fintech", time_frame: "90" } }

These skills use real-time web search and return structured JSON with sources.

### Pipeline Queries (when user asks about deals, pipeline, or forecasts)

**"What deals are closing this week/month?"**
- Use execute_action with get_pipeline_deals { filter: "closing_soon", period: "this_week" } or { period: "this_month" }

**"Show me stale opportunities" or "deals with no activity"**
- Use execute_action with get_pipeline_deals { filter: "stale", days: 14 } (adjust days as needed)

**"What's my pipeline value?" or "Pipeline summary"**
- Use execute_action with get_pipeline_summary {} for total_value, weighted_value, by_stage breakdown

**"Which leads came in today?"**
- Use execute_action with get_lead { date_from: "YYYY-MM-DD", date_to: "YYYY-MM-DD" } using today's date

**"Who haven't I followed up with?" or "Contacts needing attention"**
- Use execute_action with get_contacts_needing_attention { days_since_contact: 14 }

**"Show me deals at risk" or "At-risk opportunities"**
- Use execute_action with get_pipeline_deals { filter: "at_risk", include_health: true }

**"What's my forecast for this quarter?"**
- Use execute_action with get_pipeline_forecast { period: "this_quarter" }

**"What's the status with [company]?"**
- Use execute_action with get_company_status { company_name: "X" } for holistic view

### Pipeline Focus Task Scheduling (when user says "Help me schedule tasks to engage deals I should focus on" or similar)
Prefer running the **seq-pipeline-focus-tasks** sequence:
1. Run execute_action with run_sequence { sequence_key: "seq-pipeline-focus-tasks", is_simulation: true, sequence_context: { period: "this_week" } }
2. Show the user the task preview (title, checklist, due_date) and the selected top deals
3. Ask for confirmation before creating tasks
4. If user confirms, re-run execute_action with run_sequence { sequence_key: "seq-pipeline-focus-tasks", is_simulation: false, sequence_context: { period: "this_week" } }

### Post-Meeting Follow-Up Pack (when user says "generate my follow-up pack" / "send recap" / "Slack update + tasks")
Prefer running the **seq-post-meeting-followup-pack** sequence:
1. Run execute_action with run_sequence { sequence_key: "seq-post-meeting-followup-pack", is_simulation: true, sequence_context: {} }
2. Show the user the email + Slack + task previews
3. Ask for confirmation before sending/posting/creating
4. If user confirms, re-run execute_action with run_sequence { sequence_key: "seq-post-meeting-followup-pack", is_simulation: false, sequence_context: {} }

### Deal Mutual Action Plan (MAP) Builder (when user says "build a mutual action plan / MAP for deal X")
Prefer running the **seq-deal-map-builder** sequence:
1. Run execute_action with run_sequence { sequence_key: "seq-deal-map-builder", is_simulation: true, sequence_context: { deal_id: "..." } }
2. Show the milestones + task preview
3. Ask for confirmation before creating the task
4. If user confirms, re-run execute_action with run_sequence { sequence_key: "seq-deal-map-builder", is_simulation: false, sequence_context: { deal_id: "..." } }

### Daily Focus Plan (when user says "what should I do today?" / "show me my priorities" / "daily plan")
Prefer running the **seq-daily-focus-plan** sequence:
1. Run execute_action with run_sequence { sequence_key: "seq-daily-focus-plan", is_simulation: true, sequence_context: {} }
2. Show priorities, next best actions, and top task preview
3. Ask for confirmation before creating the task
4. If user confirms, re-run execute_action with run_sequence { sequence_key: "seq-daily-focus-plan", is_simulation: false, sequence_context: {} }

### Follow-Up Zero Inbox (when user says "what follow-ups am I missing?" / "check my emails" / "unanswered emails")
Prefer running the **seq-followup-zero-inbox** sequence:
1. Run execute_action with run_sequence { sequence_key: "seq-followup-zero-inbox", is_simulation: true, sequence_context: {} }
2. Show threads needing response, reply drafts, and follow-up task preview
3. Ask for confirmation before creating the task
4. If user confirms, re-run execute_action with run_sequence { sequence_key: "seq-followup-zero-inbox", is_simulation: false, sequence_context: {} }

### Deal Slippage Guardrails (when user says "what deals are at risk?" / "show me at-risk deals" / "deal slippage")
Prefer running the **seq-deal-slippage-guardrails** sequence:
1. Run execute_action with run_sequence { sequence_key: "seq-deal-slippage-guardrails", is_simulation: true, sequence_context: {} }
2. Show risk radar, rescue actions, rescue task preview, and Slack update preview
3. Ask for confirmation before creating the task and posting Slack update
4. If user confirms, re-run execute_action with run_sequence { sequence_key: "seq-deal-slippage-guardrails", is_simulation: false, sequence_context: {} }

### Catch Me Up / Status Summary (when user says "catch me up" / "what did I miss?" / "status update" / "what's happening?")
Gather data from multiple sources and present a **well-formatted markdown summary**:

1. **Gather Today's Context:**
   - Use execute_action with get_meetings_for_period { period: "today" } for today's schedule
   - Use execute_action with get_pipeline_deals { filter: "stale" } for deals needing attention
   - Use execute_action with get_contacts_needing_attention { days_since_contact: 7 } for follow-ups due
   - Use execute_action with get_pipeline_summary {} for current pipeline snapshot

2. **Format your response with these EXACT markdown sections:**

## 📊 This Week's Snapshot
- **Pipeline Value:** $X total, $Y weighted
- **Deals Closing Soon:** X deals worth $Y
- **Stale Opportunities:** X deals with no recent activity
- **Follow-ups Overdue:** X contacts need attention

## 📅 Today's Schedule
| Time | Meeting | Company | Prep Status |
|------|---------|---------|-------------|
| 9:00 AM | Call with **John Smith** | Acme Corp | ✅ Ready |
| 2:30 PM | Demo for **Jane Doe** | TechStart | ⚠️ Needs prep |

## ✅ Priority Actions
1. **Follow up with Stan** at Acme Corp - last contact 10 days ago
2. **Prepare for 2:30 PM demo** with TechStart - review their requirements
3. **Update Globex deal** - close date is tomorrow, confirm status

## 💡 Key Insights
- Your **weighted pipeline is up 12%** from last week
- **3 deals** moved to negotiation stage
- Consider reaching out to dormant contacts at **BigCorp** and **MegaInc**

**IMPORTANT Formatting Rules:**
- Use **bold** for names, numbers, and key metrics
- Use bullet points (•) for lists within sections
- Use numbered lists (1. 2. 3.) for priority actions
- Use tables for schedules with clear columns
- Use emoji sparingly: 📊 📅 ✅ 💡 ⚠️ for section headers only
- Keep each section concise - max 5-7 items per section

## Core Rules
- Confirm before any CRM updates, notifications, or sends (execute_action write actions require params.confirm=true)
- Do not make up information; prefer tool results
- If data is missing, state what you couldn't find and proceed with what you have

## Response Voice & Personality (CRITICAL)

You are a TEAM MEMBER, not a generic AI assistant. Your responses should feel like Slack messages from a smart, helpful colleague.

### Tone Guidelines
- **Casual & Direct**: Like texting a work friend who's really good at their job
- **First Name**: Always address the user by first name when you have it
- **Time-Aware Greetings**:
  - Morning (5am-12pm): "Morning!" "Hey!" "Good morning!"
  - Afternoon (12pm-5pm): "Hey!" "Quick update:" "Here's the rundown:"
  - Evening (5pm-10pm): "Working late?" "End of day check:" "Wrapping up?"
  - Late night (10pm-5am): "Burning the midnight oil?" "Late night hustle!"
- **Sparse Emojis**: Use sparingly for visual clarity:
  - 📊 for pipeline/data summaries
  - ⚠️ for warnings/overdue items
  - ✅ for completed/healthy items
  - 🎯 for goals/targets
  - 📅 for calendar/schedule
  - 💰 for revenue/deals
- **Short Paragraphs**: Max 2-3 sentences per thought
- **Scannable Structure**: Use bold, bullets, and whitespace

### Response Format Rules

**NEVER return wall-of-text responses.** Always structure your output.

For data-heavy responses (tasks, deals, meetings, contacts):
\`\`\`
Hey {name}! {time_aware_greeting}

{emoji} **{Section Title}** — {one-line summary}
• {Item 1 with key details}
• {Item 2 with key details}

{emoji} **{Section Title}** — {one-line summary}
• {Item 1}
• {Item 2}

[Action Button] [Action Button]

{Optional follow-up question or offer}
\`\`\`

**Example - Tasks needing attention:**
\`\`\`
Hey Andrew! 👋 Working late? Here's the quick rundown:

📊 **Deals** — All clear, nothing urgent!

⚠️ **Tasks** — 11 need attention
• 3 overdue (oldest: Oct 30)
• 8 due this week

[View All Tasks] [Show Overdue Only]

Want me to help prioritize these?
\`\`\`

### What NOT to do
❌ "I'd be happy to help! Here's a summary of what needs your attention..."
❌ Long paragraphs with inline lists
❌ Starting every response with "I"
❌ Generic greetings like "Hello! How can I assist you today?"
❌ Repeating the user's question back to them`

  const messages: any[] = []

  // Add conversation history (last 10 messages for context)
  const recentHistory = history.slice(-10)
  recentHistory.forEach(msg => {
    messages.push({
      role: msg.role,
      content: msg.content
    })
  })

  // Add runtime context (short, high-signal) as a separate user message
  if (context && context.trim()) {
    messages.push({
      role: 'user',
      content: `Context:\n${context}`.trim(),
    })
  }

  // Add current message
  messages.push({
    role: 'user',
    content: message
  })

  // ============================================================================
  // SMART ENTITY DETECTION: Force resolve_entity for first-name-only queries
  // ============================================================================
  // Detects standalone first names in questions about people
  // E.g., "What did Stan say...", "Tell me about John...", "Catch me up on Sarah"

  // Check if message has question/action keywords suggesting a person query
  const questionKeywords = ['what', 'tell', 'find', 'show', 'get', 'catch', 'prep', 'brief', 'update', 'about', 'with', 'from'];
  const hasQuestionKeyword = questionKeywords.some(k => message.toLowerCase().includes(k));

  // Find capitalized words that could be first names (not at sentence start, not common words)
  const words = message.split(/\s+/);
  const commonWords = new Set(['The', 'This', 'That', 'These', 'Those', 'What', 'When', 'Where', 'Who', 'Why', 'How', 'Can', 'Could', 'Would', 'Should', 'Will', 'Do', 'Does', 'Did', 'Is', 'Are', 'Was', 'Were', 'Have', 'Has', 'Had', 'Been', 'Being', 'To', 'In', 'On', 'At', 'For', 'With', 'About', 'From', 'Into', 'Through', 'During', 'Before', 'After', 'Above', 'Below', 'Between', 'Under', 'Again', 'Further', 'Then', 'Once', 'Here', 'There', 'All', 'Each', 'Few', 'More', 'Most', 'Other', 'Some', 'Such', 'No', 'Nor', 'Not', 'Only', 'Own', 'Same', 'So', 'Than', 'Too', 'Very', 'Just', 'Now', 'CRM', 'API', 'URL', 'PDF', 'OK']);

  // Find potential first names: capitalized words not at position 0, not common words
  const potentialNames = words.filter((word, idx) => {
    if (idx === 0) return false; // Skip first word (sentence start)
    if (!/^[A-Z][a-z]+$/.test(word)) return false; // Must be capitalized word
    if (commonWords.has(word)) return false; // Skip common words
    // Check if followed by another capitalized word (would be last name)
    const nextWord = words[idx + 1];
    if (nextWord && /^[A-Z][a-z]+$/.test(nextWord)) return false; // Has last name, not first-name-only
    return true;
  });

  const detectedFirstName = potentialNames[0];

  // Determine if we should force resolve_entity tool
  const shouldForceEntityResolution = hasQuestionKeyword &&
    detectedFirstName &&
    !message.includes('@'); // Not an email address

  // Debug: Log entity detection details
  console.log(`[ENTITY_DETECTION] Message: "${message}"`)
  console.log(`[ENTITY_DETECTION] hasQuestionKeyword: ${hasQuestionKeyword}`)
  console.log(`[ENTITY_DETECTION] potentialNames: ${JSON.stringify(potentialNames)}`)
  console.log(`[ENTITY_DETECTION] detectedFirstName: ${detectedFirstName}`)
  console.log(`[ENTITY_DETECTION] shouldForceEntityResolution: ${shouldForceEntityResolution}`)

  // Build request body
  const requestBody: Record<string, any> = {
    model: 'claude-haiku-4-5', // Claude Haiku 4.5 for fast, cost-effective MCP tool execution
    max_tokens: 4096,
    system: systemPrompt,
    tools: SKILLS_ROUTER_TOOLS,
    messages
  }

  // Force resolve_entity tool when first-name-only detected
  if (shouldForceEntityResolution) {
    requestBody.tool_choice = { type: 'tool', name: 'resolve_entity' }
    console.log(`[ENTITY_RESOLUTION] 🔴 FORCING resolve_entity tool for "${detectedFirstName}"`)
  }

  console.log(`[API_REQUEST] tool_choice: ${JSON.stringify(requestBody.tool_choice || 'auto')}`)

  // Use newer API version when tool_choice is set (required for tool_choice support)
  const apiVersion = requestBody.tool_choice ? ANTHROPIC_VERSION_TOOLS : ANTHROPIC_VERSION
  console.log(`[API_REQUEST] Using API version: ${apiVersion}`)

  // Log request for debugging (without sensitive data)
  // Call Claude Haiku 4.5 with tools (faster and cheaper for MCP requests)
  // Full API ID: claude-haiku-4-5@20251001
  // API Alias: claude-haiku-4-5
  let response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': apiVersion
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorDetails = errorText
    try {
      const errorJson = JSON.parse(errorText)
      errorDetails = JSON.stringify(errorJson, null, 2)
    } catch (e) {
      // Not JSON, use text as-is
    }
    throw new Error(`Claude API error: ${response.status} - ${errorDetails}`)
  }

  let data = await response.json()
  let finalContent = ''
  const recommendations: any[] = []
  let accumulatedTextContent = '' // Accumulate text content from all iterations
  
  // Tool usage tracking
  const toolsUsed: string[] = []
  let toolIterations = 0
  let toolsSuccessCount = 0
  let toolsErrorCount = 0
  const toolExecutionStartTime = Date.now()
  const toolExecutions: ToolExecutionDetail[] = [] // Detailed execution tracking

  // Handle tool use - Claude may request to use tools
  let maxToolIterations = 5 // Prevent infinite loops
  let iteration = 0
  const startTime = Date.now()
  // NOTE: Sequences can legitimately take longer than single-step tools.
  // Keep a hard cap to avoid runaway loops, but allow demo-grade sequences to complete.
  const MAX_EXECUTION_TIME = 120000 // 120 seconds max execution time

  while (data.stop_reason === 'tool_use' && data.content && iteration < maxToolIterations) {
    // Check timeout
    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
      break
    }

    iteration++
    const toolCalls: any[] = []
    let textContent = ''

    // Process tool calls
    for (const contentItem of data.content) {
      if (contentItem.type === 'text') {
        textContent += contentItem.text + '\n\n'
      } else if (contentItem.type === 'tool_use') {
        toolCalls.push(contentItem)
      }
    }

    // Accumulate text content from this iteration
    if (textContent) {
      accumulatedTextContent += textContent
    }

    // Execute all tool calls
    if (toolCalls.length > 0) {
      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: data.content
      })

      // Execute tools and collect results with timeout protection
      const toolResults: ToolResult[] = []
      for (const toolCall of toolCalls) {
        const toolStartTime = Date.now()
        try {
          // Track tool usage
          if (!toolsUsed.includes(toolCall.name)) {
            toolsUsed.push(toolCall.name)
          }
          
          // Add timeout wrapper for tool execution.
          // execute_action calls may hit external services/APIs and need more time.
          // run_sequence needs the most time as it runs multi-step workflows.
          const toolPromise = executeToolCall(toolCall.name, toolCall.input, client, userId, orgId)
          let timeoutMs = 15000 // default 15s for simple tools
          if (toolCall?.name === 'execute_action') {
            if (toolCall?.input?.action === 'run_sequence') {
              timeoutMs = 60000 // 60s for sequences
            } else {
              timeoutMs = 30000 // 30s for other execute_action calls (may hit external APIs)
            }
          }
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Tool execution timeout')), timeoutMs)
          )
          
          const toolResult = await Promise.race([toolPromise, timeoutPromise])
          const toolLatencyMs = Date.now() - toolStartTime
          toolsSuccessCount++
          
          // Extract capability/provider from result if available
          const capability = (toolResult as any)?.capability;
          const provider = (toolResult as any)?.provider;
          
          // Track detailed execution metadata
          toolExecutions.push({
            toolName: toolCall.name,
            args: toolCall.input,
            result: toolResult,
            latencyMs: toolLatencyMs,
            success: true,
            capability,
            provider
          })
          
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify(toolResult)
          })
        } catch (error: any) {
          const toolLatencyMs = Date.now() - toolStartTime
          toolsErrorCount++
          
          // Track failed execution metadata
          toolExecutions.push({
            toolName: toolCall.name,
            args: toolCall.input,
            result: null,
            latencyMs: toolLatencyMs,
            success: false,
            error: error.message || String(error)
          })
          
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            is_error: true,
            content: JSON.stringify({ error: error.message || String(error) })
          })
        }
      }
      
      toolIterations++

      // Add tool results to messages
      messages.push({
        role: 'user',
        content: toolResults
      })

      // Call Claude Haiku 4.5 again with tool results
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5', // Claude Haiku 4.5 for fast, cost-effective MCP tool execution
          max_tokens: 4096,
          system: systemPrompt,
          tools: SKILLS_ROUTER_TOOLS,
          messages
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        break
      }

      data = await response.json()
    } else {
      break
    }
  }

  // Add any accumulated text content from tool use iterations
  if (accumulatedTextContent) {
    finalContent += accumulatedTextContent
  }

  // Extract final text response
  if (data.content) {
    for (const contentItem of data.content) {
      if (contentItem.type === 'text') {
        finalContent += contentItem.text
      }
    }
  }

  if (!finalContent) {
    finalContent = 'I apologize, but I could not generate a response.'
  }

  // Extract usage information from Claude API response
  const usage = data.usage ? {
    input_tokens: data.usage.input_tokens || 0,
    output_tokens: data.usage.output_tokens || 0
  } : undefined

  const toolExecutionTimeMs = Date.now() - toolExecutionStartTime

  return { 
    content: finalContent.trim(), 
    recommendations,
    usage,
    tools_used: toolsUsed,
    tool_iterations: toolIterations,
    tools_success_count: toolsSuccessCount,
    tools_error_count: toolsErrorCount,
    tool_execution_time_ms: toolExecutionTimeMs,
    tool_executions: toolExecutions
  }
}

/**
 * Execute a tool call - routes to appropriate CRUD handler
 */
async function executeToolCall(
  toolName: string,
  args: any,
  client: any,
  userId: string,
  orgId: string | null
): Promise<any> {
  // ---------------------------------------------------------------------------
  // Skills Router (3-tool surface)
  // ---------------------------------------------------------------------------
  if (toolName === 'list_skills' || toolName === 'get_skill' || toolName === 'execute_action') {
    // Resolve org_id (prefer orgId from request context; otherwise fall back to first membership)
    let resolvedOrgId = orgId
    if (!resolvedOrgId) {
      const { data: membership, error: membershipError } = await client
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (membershipError) {
        throw new Error(`Failed to resolve organization: ${membershipError.message}`)
      }

      resolvedOrgId = membership?.org_id ? String(membership.org_id) : null
    }

    if (!resolvedOrgId) {
      throw new Error('No organization found for user')
    }

    if (toolName === 'list_skills') {
      const category = args?.category ? String(args.category) : null
      const enabledOnly = args?.enabled_only !== false
      const kind = args?.kind ? String(args.kind) : 'all' // 'skill' | 'sequence' | 'all'

      if (enabledOnly) {
        const { data: skills, error } = await client.rpc('get_organization_skills_for_agent', {
          p_org_id: resolvedOrgId,
        })
        if (error) throw new Error(`Failed to list skills: ${error.message}`)

        const filtered = (skills || [])
          .filter((s: any) => (!category ? true : s.category === category))
          .filter((s: any) => {
            if (kind === 'sequence') return s.category === 'agent-sequence'
            if (kind === 'skill') return s.category !== 'agent-sequence'
            return true
          })
        return {
          success: true,
          count: filtered.length,
          skills: filtered.map((s: any) => ({
            skill_key: s.skill_key,
            kind: s.category === 'agent-sequence' ? 'sequence' : 'skill',
            category: s.category,
            name: s.frontmatter?.name,
            description: s.frontmatter?.description,
            triggers: s.frontmatter?.triggers || [],
            step_count: Array.isArray(s.frontmatter?.sequence_steps) ? s.frontmatter.sequence_steps.length : undefined,
            is_enabled: s.is_enabled ?? true,
          })),
        }
      }

      // enabled_only=false: include disabled org skills via join on platform_skill_id
      const { data: rows, error } = await client
        .from('organization_skills')
        .select(
          `
          skill_id,
          is_enabled,
          compiled_frontmatter,
          compiled_content,
          platform_skill_version,
          platform_skills:platform_skill_id(category, frontmatter, content_template, is_active)
        `
        )
        .eq('organization_id', resolvedOrgId)
        .eq('is_active', true)

      if (error) throw new Error(`Failed to list skills: ${error.message}`)

      const all = (rows || [])
        .filter((r: any) => (r.platform_skills?.is_active ?? true) === true)
        .map((r: any) => ({
          skill_key: r.skill_id,
          category: r.platform_skills?.category || 'uncategorized',
          frontmatter: r.compiled_frontmatter || r.platform_skills?.frontmatter || {},
          content: r.compiled_content || r.platform_skills?.content_template || '',
          is_enabled: r.is_enabled ?? true,
          version: r.platform_skill_version ?? 1,
        }))
        .filter((s: any) => (!category ? true : s.category === category))
        .filter((s: any) => {
          if (kind === 'sequence') return s.category === 'agent-sequence'
          if (kind === 'skill') return s.category !== 'agent-sequence'
          return true
        })

      return {
        success: true,
        count: all.length,
        skills: all.map((s: any) => ({
          skill_key: s.skill_key,
          kind: s.category === 'agent-sequence' ? 'sequence' : 'skill',
          category: s.category,
          name: s.frontmatter?.name,
          description: s.frontmatter?.description,
          triggers: s.frontmatter?.triggers || [],
          step_count: Array.isArray(s.frontmatter?.sequence_steps) ? s.frontmatter.sequence_steps.length : undefined,
          is_enabled: s.is_enabled ?? true,
        })),
      }
    }

    if (toolName === 'get_skill') {
      const skillKey = args?.skill_key ? String(args.skill_key) : null
      if (!skillKey) throw new Error('skill_key is required')

      // Prefer enabled compiled skills first
      const { data: skills, error } = await client.rpc('get_organization_skills_for_agent', {
        p_org_id: resolvedOrgId,
      })
      if (error) throw new Error(`Failed to get skill: ${error.message}`)

      const found = (skills || []).find((s: any) => s.skill_key === skillKey)
      if (found) {
        return {
          success: true,
          skill: {
            skill_key: found.skill_key,
            kind: found.category === 'agent-sequence' ? 'sequence' : 'skill',
            category: found.category,
            frontmatter: found.frontmatter || {},
            content: found.content || '',
            step_count: Array.isArray(found.frontmatter?.sequence_steps)
              ? found.frontmatter.sequence_steps.length
              : undefined,
            is_enabled: found.is_enabled ?? true,
          },
        }
      }

      // Fallback: allow fetching disabled skill by joining organization_skills -> platform_skills
      const { data: row, error: rowError } = await client
        .from('organization_skills')
        .select(
          `
          skill_id,
          is_enabled,
          compiled_frontmatter,
          compiled_content,
          platform_skill_version,
          platform_skills:platform_skill_id(category, frontmatter, content_template, is_active)
        `
        )
        .eq('organization_id', resolvedOrgId)
        .eq('skill_id', skillKey)
        .eq('is_active', true)
        .maybeSingle()

      if (rowError) throw new Error(`Failed to get skill: ${rowError.message}`)
      if (!row || (row.platform_skills?.is_active ?? true) !== true) {
        return { success: true, skill: null }
      }

      return {
        success: true,
        skill: {
          skill_key: row.skill_id,
          kind: row.platform_skills?.category === 'agent-sequence' ? 'sequence' : 'skill',
          category: row.platform_skills?.category || 'uncategorized',
          frontmatter: row.compiled_frontmatter || row.platform_skills?.frontmatter || {},
          content: row.compiled_content || row.platform_skills?.content_template || '',
          step_count: Array.isArray((row.compiled_frontmatter || row.platform_skills?.frontmatter)?.sequence_steps)
            ? (row.compiled_frontmatter || row.platform_skills?.frontmatter).sequence_steps.length
            : undefined,
          is_enabled: row.is_enabled ?? true,
        },
      }
    }

    if (toolName === 'execute_action') {
      const action = args?.action as ExecuteActionName
      const params = (args?.params || {}) as Record<string, unknown>
      return await executeAction(client, userId, resolvedOrgId, action, params)
    }
  }

  // ---------------------------------------------------------------------------
  // Entity Resolution Tool - Smart contact lookup by first name
  // ---------------------------------------------------------------------------
  if (toolName === 'resolve_entity') {
    return await handleResolveEntity(args, client, userId, orgId)
  }

  // Parse entity and operation from tool name (e.g., "meetings_create" -> entity: "meetings", operation: "create")
  const parts = toolName.split('_')
  if (parts.length < 2) {
    throw new Error(`Invalid tool name format: ${toolName}`)
  }

  const operation = parts.pop()! // Last part is the operation (create, read, update, delete)
  const entity = parts.join('_') // Everything else is the entity name

  // Route to appropriate handler
  switch (entity) {
    case 'meetings':
      return await handleMeetingsCRUD(operation, args, client, userId)
    
    case 'activities':
      return await handleActivitiesCRUD(operation, args, client, userId)
    
    case 'pipeline':
      return await handlePipelineCRUD(operation, args, client, userId)
    
    case 'leads':
      return await handleLeadsCRUD(operation, args, client, userId)
    
    case 'roadmap':
      return await handleRoadmapCRUD(operation, args, client, userId)
    
    case 'calendar':
      return await handleCalendarCRUD(operation, args, client, userId)
    
    case 'tasks':
      return await handleTasksCRUD(operation, args, client, userId)
    
    case 'clients':
      return await handleClientsCRUD(operation, args, client, userId)

    case 'emails':
      return await handleEmailsTool(operation, args, client, userId)
    
    default:
      throw new Error(`Unknown entity: ${entity}`)
  }
}

/**
 * Entity Resolution Handler
 *
 * Searches multiple data sources in parallel to resolve a person by first name.
 * Returns either a resolved contact (if one clear match) or disambiguation candidates.
 */
interface RecentInteraction {
  type: 'meeting' | 'email' | 'calendar'
  date: string // ISO date
  title: string
  description?: string
  snippet?: string // Transcript snippet or email preview
  url?: string // Link to view more
}

interface EntityCandidate {
  id: string
  type: 'contact' | 'meeting_attendee' | 'calendar_attendee' | 'email_participant'
  first_name: string
  last_name?: string
  full_name: string
  email?: string
  company_name?: string
  title?: string
  phone?: string
  source: string
  last_interaction: string // ISO date
  last_interaction_type: string // 'meeting' | 'email' | 'calendar' | 'crm'
  last_interaction_description?: string
  recency_score: number // Higher = more recent (0-100)
  contact_id?: string // If resolved to a CRM contact
  crm_url?: string // Link to contact in CRM
  recent_interactions?: RecentInteraction[] // Rich context from various sources
}

interface ResolveEntityResult {
  success: boolean
  resolved: boolean
  message: string
  search_summary: {
    name_searched: string
    sources_searched: string[]
    total_candidates: number
    search_steps: Array<{ source: string; status: 'complete' | 'no_results'; count: number }>
  }
  contact?: EntityCandidate // The resolved contact if clear winner
  candidates?: EntityCandidate[] // Multiple candidates for disambiguation
  disambiguation_needed?: boolean
  disambiguation_reason?: string
}

/**
 * Fetch rich context for a resolved contact
 * Includes recent meetings with transcript snippets, emails, and calendar events
 */
async function fetchRichContactContext(
  contact: EntityCandidate,
  client: any,
  userId: string,
  appUrl: string = 'https://app.use60.com'
): Promise<{ crm_url?: string; recent_interactions: RecentInteraction[] }> {
  const recentInteractions: RecentInteraction[] = []
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Generate CRM URL if we have a contact_id
  const crm_url = contact.contact_id
    ? `${appUrl}/crm/contacts/${contact.contact_id}`
    : undefined

  // Fetch in parallel for performance
  const promises: Promise<void>[] = []

  // 1. Fetch recent meetings with this contact (by email or contact_id)
  promises.push((async () => {
    try {
      // Search by contact_id in meeting_attendees
      let meetingIds: string[] = []

      if (contact.contact_id) {
        const { data: attendees } = await client
          .from('meeting_attendees')
          .select('meeting_id')
          .eq('contact_id', contact.contact_id)
          .limit(10)

        if (attendees) {
          meetingIds = attendees.map((a: any) => a.meeting_id)
        }
      }

      // Also search by email
      if (contact.email && meetingIds.length < 5) {
        const { data: emailAttendees } = await client
          .from('meeting_attendees')
          .select('meeting_id')
          .eq('email', contact.email)
          .limit(10)

        if (emailAttendees) {
          const newIds = emailAttendees.map((a: any) => a.meeting_id)
          meetingIds = [...new Set([...meetingIds, ...newIds])]
        }
      }

      if (meetingIds.length === 0) return

      // Fetch meeting details with transcript snippets
      const { data: meetings } = await client
        .from('meetings')
        .select('id, title, start_time, summary, transcript_text')
        .eq('owner_user_id', userId)
        .in('id', meetingIds.slice(0, 5))
        .gte('start_time', thirtyDaysAgo)
        .order('start_time', { ascending: false })
        .limit(5)

      if (meetings) {
        for (const meeting of meetings) {
          // Extract a relevant snippet from transcript (first 200 chars or summary)
          let snippet = meeting.summary || ''
          if (!snippet && meeting.transcript_text) {
            snippet = meeting.transcript_text.substring(0, 200) + '...'
          }

          recentInteractions.push({
            type: 'meeting',
            date: meeting.start_time,
            title: meeting.title || 'Meeting',
            description: `Meeting with ${contact.full_name}`,
            snippet: snippet || undefined,
            url: `${appUrl}/meetings/${meeting.id}`
          })
        }
      }
    } catch (e) {
      console.error('[RICH_CONTEXT] Error fetching meetings:', e)
    }
  })())

  // 2. Fetch recent calendar events with this contact
  promises.push((async () => {
    try {
      if (!contact.email) return

      const { data: events } = await client
        .from('calendar_events')
        .select('id, title, start_time, attendees')
        .eq('user_id', userId)
        .gte('start_time', thirtyDaysAgo)
        .order('start_time', { ascending: false })
        .limit(20)

      if (!events) return

      // Filter events that include this contact
      for (const event of events) {
        const attendees = event.attendees as Array<{ email?: string; displayName?: string }> | null
        if (!attendees) continue

        const hasContact = attendees.some(a =>
          a.email?.toLowerCase() === contact.email?.toLowerCase()
        )

        if (hasContact) {
          recentInteractions.push({
            type: 'calendar',
            date: event.start_time,
            title: event.title || 'Calendar Event',
            description: `Scheduled event with ${contact.full_name}`,
            url: `${appUrl}/meetings?date=${event.start_time.split('T')[0]}`
          })

          if (recentInteractions.filter(i => i.type === 'calendar').length >= 3) break
        }
      }
    } catch (e) {
      console.error('[RICH_CONTEXT] Error fetching calendar events:', e)
    }
  })())

  // 3. Fetch recent emails with this contact (from synced emails table if exists)
  promises.push((async () => {
    try {
      if (!contact.email) return

      // Check for synced emails in email_messages table
      const { data: emails } = await client
        .from('email_messages')
        .select('id, subject, date, snippet, thread_id')
        .eq('user_id', userId)
        .or(`from_email.eq.${contact.email},to_email.cs.{${contact.email}}`)
        .gte('date', thirtyDaysAgo)
        .order('date', { ascending: false })
        .limit(5)

      if (emails) {
        for (const email of emails) {
          recentInteractions.push({
            type: 'email',
            date: email.date,
            title: email.subject || 'Email',
            description: `Email with ${contact.full_name}`,
            snippet: email.snippet || undefined
          })
        }
      }
    } catch (e) {
      // email_messages table may not exist, that's ok
      console.log('[RICH_CONTEXT] Skipping emails (table may not exist)')
    }
  })())

  await Promise.all(promises)

  // Sort all interactions by date (most recent first)
  recentInteractions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return {
    crm_url,
    recent_interactions: recentInteractions.slice(0, 10) // Top 10 most recent
  }
}

async function handleResolveEntity(
  args: any,
  client: any,
  userId: string,
  orgId: string | null
): Promise<ResolveEntityResult> {
  const name = args?.name ? String(args.name).trim() : ''
  const contextHint = args?.context_hint ? String(args.context_hint).trim() : ''

  if (!name) {
    return {
      success: false,
      resolved: false,
      message: 'Name is required for entity resolution',
      search_summary: {
        name_searched: '',
        sources_searched: [],
        total_candidates: 0,
        search_steps: []
      }
    }
  }

  // Parse name into first/last
  const nameParts = name.split(/\s+/)
  const firstName = nameParts[0]
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null

  console.log('[ENTITY_RESOLUTION] Starting entity resolution:', {
    name,
    firstName,
    lastName,
    userId,
    orgId,
    contextHint
  })

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Calculate recency score (0-100, higher = more recent)
  const calcRecencyScore = (dateStr: string | null | undefined): number => {
    if (!dateStr) return 0
    const date = new Date(dateStr)
    const daysSince = Math.max(0, (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    // Score: 100 for today, decays to 0 over 30 days
    return Math.max(0, Math.round(100 - (daysSince / 30) * 100))
  }

  const candidates: EntityCandidate[] = []
  const searchSteps: Array<{ source: string; status: 'complete' | 'no_results'; count: number }> = []

  // ---------------------------------------------------------------------------
  // 1. Search CRM Contacts (parallel)
  // ---------------------------------------------------------------------------
  const contactsPromise = (async () => {
    try {
      console.log('[ENTITY_RESOLUTION] Searching contacts with:', { firstName, lastName, userId })

      let query = client
        .from('contacts')
        .select(`
          id,
          first_name,
          last_name,
          email,
          phone,
          title,
          company_id,
          companies:company_id (name),
          updated_at,
          created_at
        `)
        .eq('owner_id', userId) // CRITICAL: contacts uses owner_id, NOT user_id
        .ilike('first_name', `${firstName}%`)
        .order('updated_at', { ascending: false })
        .limit(10)

      if (lastName) {
        query = query.ilike('last_name', `${lastName}%`)
      }

      const { data: contacts, error } = await query

      console.log('[ENTITY_RESOLUTION] Contacts query result:', {
        contactsFound: contacts?.length || 0,
        error: error?.message || null,
        firstContact: contacts?.[0] ? { id: contacts[0].id, first_name: contacts[0].first_name } : null
      })

      if (error || !contacts || contacts.length === 0) {
        searchSteps.push({ source: 'CRM Contacts', status: 'no_results', count: 0 })
        return
      }

      searchSteps.push({ source: 'CRM Contacts', status: 'complete', count: contacts.length })

      for (const contact of contacts) {
        const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
        const companyName = (contact.companies as { name?: string } | null)?.name || undefined

        candidates.push({
          id: contact.id,
          type: 'contact',
          first_name: contact.first_name || '',
          last_name: contact.last_name || undefined,
          full_name: fullName || contact.email || 'Unknown',
          email: contact.email || undefined,
          phone: contact.phone || undefined,
          company_name: companyName,
          title: contact.title || undefined,
          source: 'CRM',
          last_interaction: contact.updated_at || contact.created_at,
          last_interaction_type: 'crm',
          last_interaction_description: 'CRM record updated',
          recency_score: calcRecencyScore(contact.updated_at || contact.created_at),
          contact_id: contact.id
        })
      }
    } catch (e) {
      searchSteps.push({ source: 'CRM Contacts', status: 'no_results', count: 0 })
    }
  })()

  // ---------------------------------------------------------------------------
  // 2. Search Recent Meetings (parallel) - attendee names
  // ---------------------------------------------------------------------------
  const meetingsPromise = (async () => {
    try {
      // Search meetings by attendee name - join through meeting_attendees
      const { data: meetings, error } = await client
        .from('meetings')
        .select(`
          id,
          title,
          start_time,
          meeting_attendees!inner (
            id,
            name,
            email,
            contact_id
          )
        `)
        .eq('owner_user_id', userId)
        .gte('start_time', thirtyDaysAgo.toISOString())
        .order('start_time', { ascending: false })
        .limit(50)

      if (error || !meetings || meetings.length === 0) {
        searchSteps.push({ source: 'Recent Meetings', status: 'no_results', count: 0 })
        return
      }

      // Filter attendees by name match
      let matchCount = 0
      for (const meeting of meetings) {
        const attendees = meeting.meeting_attendees as Array<{
          id: string
          name?: string
          email?: string
          contact_id?: string
        }>

        for (const attendee of attendees) {
          if (!attendee.name) continue

          const attendeeNameLower = attendee.name.toLowerCase()
          const searchNameLower = firstName.toLowerCase()

          // Match if first name matches or full name contains the search
          if (attendeeNameLower.startsWith(searchNameLower) ||
              attendeeNameLower.includes(searchNameLower)) {

            const nameParts = attendee.name.split(/\s+/)
            matchCount++

            candidates.push({
              id: attendee.id,
              type: 'meeting_attendee',
              first_name: nameParts[0] || '',
              last_name: nameParts.slice(1).join(' ') || undefined,
              full_name: attendee.name,
              email: attendee.email || undefined,
              source: 'Meeting',
              last_interaction: meeting.start_time,
              last_interaction_type: 'meeting',
              last_interaction_description: `Meeting: ${meeting.title}`,
              recency_score: calcRecencyScore(meeting.start_time),
              contact_id: attendee.contact_id || undefined
            })
          }
        }
      }

      searchSteps.push({
        source: 'Recent Meetings',
        status: matchCount > 0 ? 'complete' : 'no_results',
        count: matchCount
      })
    } catch (e) {
      searchSteps.push({ source: 'Recent Meetings', status: 'no_results', count: 0 })
    }
  })()

  // ---------------------------------------------------------------------------
  // 3. Search Calendar Events (parallel) - attendee names
  // ---------------------------------------------------------------------------
  const calendarPromise = (async () => {
    try {
      // Search calendar events in the past 30 days or next 7 days
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      const { data: events, error } = await client
        .from('calendar_events')
        .select(`
          id,
          title,
          start_time,
          attendees
        `)
        .eq('user_id', userId)
        .gte('start_time', thirtyDaysAgo.toISOString())
        .lte('start_time', sevenDaysFromNow.toISOString())
        .order('start_time', { ascending: false })
        .limit(50)

      if (error || !events || events.length === 0) {
        searchSteps.push({ source: 'Calendar Events', status: 'no_results', count: 0 })
        return
      }

      // Search attendees for name match
      let matchCount = 0
      for (const event of events) {
        const attendees = event.attendees as Array<{
          email?: string
          displayName?: string
          responseStatus?: string
        }> | null

        if (!attendees) continue

        for (const attendee of attendees) {
          const displayName = attendee.displayName || ''
          const email = attendee.email || ''

          // Extract name from email if no display name
          const nameFromEmail = email.split('@')[0]?.replace(/[._-]/g, ' ') || ''
          const searchIn = (displayName || nameFromEmail).toLowerCase()
          const searchNameLower = firstName.toLowerCase()

          if (searchIn.includes(searchNameLower)) {
            const nameParts = (displayName || nameFromEmail).split(/\s+/)
            matchCount++

            candidates.push({
              id: `${event.id}-${email}`,
              type: 'calendar_attendee',
              first_name: nameParts[0] || '',
              last_name: nameParts.slice(1).join(' ') || undefined,
              full_name: displayName || nameFromEmail || email,
              email: email || undefined,
              source: 'Calendar',
              last_interaction: event.start_time,
              last_interaction_type: 'calendar',
              last_interaction_description: `Calendar: ${event.title}`,
              recency_score: calcRecencyScore(event.start_time)
            })
          }
        }
      }

      searchSteps.push({
        source: 'Calendar Events',
        status: matchCount > 0 ? 'complete' : 'no_results',
        count: matchCount
      })
    } catch (e) {
      searchSteps.push({ source: 'Calendar Events', status: 'no_results', count: 0 })
    }
  })()

  // ---------------------------------------------------------------------------
  // 4. Search Recent Emails (parallel) - from/to matching name
  // ---------------------------------------------------------------------------
  const emailsPromise = (async () => {
    try {
      // Check if user has Gmail connected
      const { data: integration } = await client
        .from('user_integrations')
        .select('id, access_token')
        .eq('user_id', userId)
        .eq('provider', 'gmail')
        .maybeSingle()

      if (!integration?.access_token) {
        searchSteps.push({ source: 'Recent Emails', status: 'no_results', count: 0 })
        return
      }

      // Search emails using Gmail API - simplified search by name
      // Note: Gmail API search is limited, we search by name keyword
      const searchQuery = encodeURIComponent(`${firstName} newer_than:30d`)
      const gmailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${searchQuery}&maxResults=20`

      const gmailResponse = await fetch(gmailUrl, {
        headers: {
          'Authorization': `Bearer ${integration.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!gmailResponse.ok) {
        searchSteps.push({ source: 'Recent Emails', status: 'no_results', count: 0 })
        return
      }

      const gmailData = await gmailResponse.json()
      const messageIds = (gmailData.messages || []).slice(0, 10).map((m: any) => m.id)

      if (messageIds.length === 0) {
        searchSteps.push({ source: 'Recent Emails', status: 'no_results', count: 0 })
        return
      }

      // Fetch message details for from/to extraction
      let matchCount = 0
      for (const msgId of messageIds) {
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
        const msgResponse = await fetch(msgUrl, {
          headers: { 'Authorization': `Bearer ${integration.access_token}` }
        })

        if (!msgResponse.ok) continue

        const msgData = await msgResponse.json()
        const headers = msgData.payload?.headers || []
        const fromHeader = headers.find((h: any) => h.name === 'From')?.value || ''
        const toHeader = headers.find((h: any) => h.name === 'To')?.value || ''
        const subjectHeader = headers.find((h: any) => h.name === 'Subject')?.value || ''
        const dateHeader = headers.find((h: any) => h.name === 'Date')?.value || ''

        // Parse from header: "John Doe <john@example.com>" or "john@example.com"
        const parseEmailHeader = (header: string): { name: string; email: string } | null => {
          const match = header.match(/^(?:"?([^"<]+)"?\s*)?<?([^>]+@[^>]+)>?$/)
          if (match) {
            return { name: match[1]?.trim() || '', email: match[2]?.trim() || '' }
          }
          return null
        }

        const fromParsed = parseEmailHeader(fromHeader)
        const toParsed = parseEmailHeader(toHeader)

        // Check if name matches in from or to
        const searchNameLower = firstName.toLowerCase()
        const participants = [fromParsed, toParsed].filter(Boolean) as Array<{ name: string; email: string }>

        for (const participant of participants) {
          const nameLower = participant.name.toLowerCase()
          const emailNamePart = participant.email.split('@')[0]?.toLowerCase() || ''

          if (nameLower.includes(searchNameLower) || emailNamePart.includes(searchNameLower)) {
            const nameParts = participant.name.split(/\s+/)
            matchCount++

            candidates.push({
              id: `email-${msgId}-${participant.email}`,
              type: 'email_participant',
              first_name: nameParts[0] || emailNamePart,
              last_name: nameParts.slice(1).join(' ') || undefined,
              full_name: participant.name || participant.email,
              email: participant.email,
              source: 'Email',
              last_interaction: dateHeader ? new Date(dateHeader).toISOString() : now.toISOString(),
              last_interaction_type: 'email',
              last_interaction_description: `Email: ${subjectHeader}`,
              recency_score: calcRecencyScore(dateHeader ? new Date(dateHeader).toISOString() : null)
            })
          }
        }
      }

      searchSteps.push({
        source: 'Recent Emails',
        status: matchCount > 0 ? 'complete' : 'no_results',
        count: matchCount
      })
    } catch (e) {
      searchSteps.push({ source: 'Recent Emails', status: 'no_results', count: 0 })
    }
  })()

  // ---------------------------------------------------------------------------
  // Wait for all searches to complete in parallel
  // ---------------------------------------------------------------------------
  await Promise.all([contactsPromise, meetingsPromise, calendarPromise, emailsPromise])

  // ---------------------------------------------------------------------------
  // Deduplicate and score candidates
  // ---------------------------------------------------------------------------
  // Group by email (if available) or by full_name to deduplicate
  const deduped = new Map<string, EntityCandidate>()

  for (const candidate of candidates) {
    const key = candidate.email?.toLowerCase() || candidate.full_name.toLowerCase()
    const existing = deduped.get(key)

    if (!existing) {
      deduped.set(key, candidate)
    } else {
      // Keep the one with higher recency score, but merge contact_id if available
      if (candidate.recency_score > existing.recency_score) {
        deduped.set(key, {
          ...candidate,
          contact_id: candidate.contact_id || existing.contact_id
        })
      } else if (candidate.contact_id && !existing.contact_id) {
        existing.contact_id = candidate.contact_id
      }
    }
  }

  const sortedCandidates = Array.from(deduped.values())
    .sort((a, b) => b.recency_score - a.recency_score)

  const totalCandidates = sortedCandidates.length

  // ---------------------------------------------------------------------------
  // Determine resolution outcome
  // ---------------------------------------------------------------------------
  if (totalCandidates === 0) {
    return {
      success: true,
      resolved: false,
      message: `No matches found for "${name}". Try providing more context like their email, company, or when you last interacted.`,
      search_summary: {
        name_searched: name,
        sources_searched: ['CRM Contacts', 'Recent Meetings', 'Calendar Events', 'Recent Emails'],
        total_candidates: 0,
        search_steps: searchSteps
      }
    }
  }

  if (totalCandidates === 1) {
    // Clear single match - fetch rich context
    const resolvedContact = sortedCandidates[0]
    const richContext = await fetchRichContactContext(resolvedContact, client, userId)

    // Enhance contact with rich context
    resolvedContact.crm_url = richContext.crm_url
    resolvedContact.recent_interactions = richContext.recent_interactions

    return {
      success: true,
      resolved: true,
      message: `Found ${resolvedContact.full_name}${resolvedContact.company_name ? ` at ${resolvedContact.company_name}` : ''}${resolvedContact.title ? ` (${resolvedContact.title})` : ''} (${resolvedContact.source})`,
      search_summary: {
        name_searched: name,
        sources_searched: ['CRM Contacts', 'Recent Meetings', 'Calendar Events', 'Recent Emails'],
        total_candidates: 1,
        search_steps: searchSteps
      },
      contact: resolvedContact
    }
  }

  // Multiple candidates - check if there's a clear winner by recency
  const topCandidate = sortedCandidates[0]
  const secondCandidate = sortedCandidates[1]
  const recencyGap = topCandidate.recency_score - secondCandidate.recency_score

  // If the top candidate has significantly higher recency (>20 point gap), auto-resolve
  if (recencyGap > 20) {
    // Fetch rich context for the top candidate
    const richContext = await fetchRichContactContext(topCandidate, client, userId)

    // Enhance contact with rich context
    topCandidate.crm_url = richContext.crm_url
    topCandidate.recent_interactions = richContext.recent_interactions

    return {
      success: true,
      resolved: true,
      message: `Found ${topCandidate.full_name}${topCandidate.company_name ? ` at ${topCandidate.company_name}` : ''}${topCandidate.title ? ` (${topCandidate.title})` : ''} - your most recent interaction (${topCandidate.last_interaction_description})`,
      search_summary: {
        name_searched: name,
        sources_searched: ['CRM Contacts', 'Recent Meetings', 'Calendar Events', 'Recent Emails'],
        total_candidates: totalCandidates,
        search_steps: searchSteps
      },
      contact: topCandidate,
      candidates: sortedCandidates.slice(0, 5) // Include top 5 for reference
    }
  }

  // Multiple candidates with similar recency - need disambiguation
  // Fetch rich context for top 3 candidates in parallel to provide useful info
  const topCandidates = sortedCandidates.slice(0, 5)
  const richContextPromises = topCandidates.slice(0, 3).map(async (candidate) => {
    try {
      const richContext = await fetchRichContactContext(candidate, client, userId)
      candidate.crm_url = richContext.crm_url
      candidate.recent_interactions = richContext.recent_interactions
    } catch (e) {
      console.error('[ENTITY_RESOLUTION] Error fetching rich context for candidate:', e)
    }
  })

  await Promise.all(richContextPromises)

  return {
    success: true,
    resolved: false,
    message: `Found ${totalCandidates} people named "${firstName}". Which one did you mean?`,
    search_summary: {
      name_searched: name,
      sources_searched: ['CRM Contacts', 'Recent Meetings', 'Calendar Events', 'Recent Emails'],
      total_candidates: totalCandidates,
      search_steps: searchSteps
    },
    disambiguation_needed: true,
    disambiguation_reason: `Multiple contacts with similar recent activity (${topCandidate.full_name} and ${secondCandidate.full_name} both have recent interactions)`,
    candidates: topCandidates // Top 5 candidates with rich context for top 3
  }
}

/**
 * Generic CRUD Handlers
 */

// Meetings CRUD
async function handleMeetingsCRUD(operation: string, args: any, client: any, userId: string): Promise<any> {
  switch (operation) {
    case 'create': {
      const { title, meeting_start, meeting_end, summary, transcript_text, company_id, primary_contact_id, actionItems } = args
      
      const meetingData: any = {
        title,
        meeting_start,
        meeting_end,
        owner_user_id: userId,
        summary,
        transcript_text
      }
      
      if (company_id) meetingData.company_id = company_id
      if (primary_contact_id) meetingData.primary_contact_id = primary_contact_id
      if (meeting_end && meeting_start) {
        const start = new Date(meeting_start)
        const end = new Date(meeting_end)
        meetingData.duration_minutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60))
      }

      const { data: meeting, error } = await client
        .from('meetings')
        .insert(meetingData)
        .select()
        .single()

      if (error) throw new Error(`Failed to create meeting: ${error.message}`)

      // Create action items if provided
      if (actionItems && Array.isArray(actionItems) && meeting) {
        for (const item of actionItems) {
          await client
            .from('meeting_action_items')
            .insert({
              meeting_id: meeting.id,
              title: item.title,
              description: item.description,
              assignee_name: item.assignee_name,
              assignee_email: item.assignee_email,
              priority: item.priority || 'medium',
              deadline_at: item.deadline_at,
              completed: item.completed || false
            })
        }
      }

      return { success: true, meeting, message: `Meeting "${title}" created successfully` }
    }

    case 'read': {
      const { 
        id, 
        startDate, 
        endDate, 
        company_id, 
        contact_id, 
        includeTranscripts = true, 
        includeActionItems = true, 
        includeAttendees = true, 
        limit = 50,
        maxTranscriptLength = 50000, // Default: 50KB max transcript length
        transcriptMode = 'full' // 'full', 'summary', or 'truncated'
      } = args

      let query = client
        .from('meetings')
        .select(`
          id,
          title,
          meeting_start,
          meeting_end,
          duration_minutes,
          summary,
          ${includeTranscripts ? 'transcript_text,' : ''}
          transcript_doc_url,
          sentiment_score,
          sentiment_reasoning,
          talk_time_rep_pct,
          talk_time_customer_pct,
          talk_time_judgement,
          fathom_recording_id,
          share_url,
          company_id,
          primary_contact_id
        `)
        .eq('owner_user_id', userId)

      if (id) {
        query = query.eq('id', id).single()
      } else {
        if (startDate) query = query.gte('meeting_start', startDate)
        if (endDate) query = query.lte('meeting_start', endDate)
        if (company_id) query = query.eq('company_id', company_id)
        if (contact_id) query = query.eq('primary_contact_id', contact_id)
        query = query.order('meeting_start', { ascending: false }).limit(limit)
      }

      const { data: meetings, error } = await query

      if (error) throw new Error(`Failed to read meetings: ${error.message}`)

      const result = Array.isArray(meetings) ? meetings : [meetings]
      const meetingIds = result.map((m: any) => m.id).filter(Boolean)

      // Fetch related data
      let actionItems: any[] = []
      let attendees: any[] = []

      if (includeActionItems && meetingIds.length > 0) {
        const { data: items } = await client
          .from('meeting_action_items')
          .select('*')
          .in('meeting_id', meetingIds)

        actionItems = items || []
      }

      if (includeAttendees && meetingIds.length > 0) {
        const { data: atts } = await client
          .from('meeting_attendees')
          .select('*')
          .in('meeting_id', meetingIds)

        attendees = atts || []
      }

      // Combine data and optimize transcripts
      const enrichedMeetings = result.map((m: any) => {
        const meeting = {
          ...m,
          actionItems: actionItems.filter((ai: any) => ai.meeting_id === m.id),
          attendees: attendees.filter((att: any) => att.meeting_id === m.id)
        }

        // Optimize transcript text if present
        if (includeTranscripts && meeting.transcript_text) {
          meeting.transcript_text = optimizeTranscriptText(
            meeting.transcript_text,
            maxTranscriptLength,
            transcriptMode,
            meeting.summary
          )
          meeting.transcript_optimized = meeting.transcript_text.length < (m.transcript_text?.length || 0)
        }

        return meeting
      })

      return {
        success: true,
        meetings: id ? enrichedMeetings[0] : enrichedMeetings,
        count: enrichedMeetings.length
      }
    }

    case 'update': {
      const { id, ...updates } = args
      
      const { data, error } = await client
        .from('meetings')
        .update(updates)
        .eq('id', id)
        .eq('owner_user_id', userId)
        .select()
        .single()

      if (error) throw new Error(`Failed to update meeting: ${error.message}`)

      return { success: true, meeting: data, message: 'Meeting updated successfully' }
    }

    case 'delete': {
      const { id } = args
      
      const { error } = await client
        .from('meetings')
        .delete()
        .eq('id', id)
        .eq('owner_user_id', userId)

      if (error) throw new Error(`Failed to delete meeting: ${error.message}`)

      return { success: true, message: 'Meeting deleted successfully' }
    }

    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

// Activities CRUD
async function handleActivitiesCRUD(operation: string, args: any, client: any, userId: string): Promise<any> {
  switch (operation) {
    case 'create': {
      const { type, client_name, details, amount, date, status = 'completed', priority = 'medium' } = args
      
      const { data, error } = await client
        .from('activities')
        .insert({
          user_id: userId,
          type,
          client_name,
          details,
          amount,
          date: date || new Date().toISOString(),
          status,
          priority
        })
        .select()
        .single()

      if (error) throw new Error(`Failed to create activity: ${error.message}`)

      return { success: true, activity: data, message: 'Activity created successfully' }
    }

    case 'read': {
      const { id, type, startDate, endDate, client_name, limit = 50 } = args

      let query = client
        .from('activities')
        .select('*')
        .eq('user_id', userId)

      if (id) {
        query = query.eq('id', id).single()
      } else {
        if (type) query = query.eq('type', type)
        if (startDate) query = query.gte('date', startDate)
        if (endDate) query = query.lte('date', endDate)
        if (client_name) query = query.ilike('client_name', `%${client_name}%`)
        query = query.order('date', { ascending: false }).limit(limit)
      }

      const { data, error } = await query

      if (error) throw new Error(`Failed to read activities: ${error.message}`)

      return { success: true, activities: Array.isArray(data) ? data : [data], count: Array.isArray(data) ? data.length : 1 }
    }

    case 'update': {
      const { id, ...updates } = args
      
      const { data, error } = await client
        .from('activities')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()

      if (error) throw new Error(`Failed to update activity: ${error.message}`)

      return { success: true, activity: data, message: 'Activity updated successfully' }
    }

    case 'delete': {
      const { id } = args
      
      const { error } = await client
        .from('activities')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)

      if (error) throw new Error(`Failed to delete activity: ${error.message}`)

      return { success: true, message: 'Activity deleted successfully' }
    }

    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

// Pipeline (Deals) CRUD
async function handlePipelineCRUD(operation: string, args: any, client: any, userId: string): Promise<any> {
  switch (operation) {
    case 'create': {
      const { name, company, value, stage_id, contact_name, contact_email, expected_close_date, probability, description } = args
      
      const { data, error } = await client
        .from('deals')
        .insert({
          name,
          company,
          value,
          stage_id,
          owner_id: userId,
          contact_name,
          contact_email,
          expected_close_date,
          probability,
          description,
          status: 'active'
        })
        .select()
        .single()

      if (error) throw new Error(`Failed to create deal: ${error.message}`)

      return { success: true, deal: data, message: `Deal "${name}" created successfully` }
    }

    case 'read': {
      const { id, stage_id, status, minValue, maxValue, sortBy = 'updated_at', sortOrder = 'desc', limit = 50 } = args

      let query = client
        .from('deals')
        .select(`
          id,
          name,
          company,
          value,
          stage_id,
          status,
          expected_close_date,
          probability,
          created_at,
          updated_at,
          deal_stages(name)
        `)
        .eq('owner_id', userId)

      if (id) {
        query = query.eq('id', id).single()
      } else {
        if (stage_id) query = query.eq('stage_id', stage_id)
        if (status) query = query.eq('status', status)
        if (minValue) query = query.gte('value', minValue)
        if (maxValue) query = query.lte('value', maxValue)
        query = query.order(sortBy, { ascending: sortOrder === 'asc' }).limit(limit)
      }

      const { data, error } = await query

      if (error) throw new Error(`Failed to read deals: ${error.message}`)

      return { success: true, deals: Array.isArray(data) ? data : [data], count: Array.isArray(data) ? data.length : 1 }
    }

    case 'update': {
      const { id, ...updates } = args
      
      const { data, error } = await client
        .from('deals')
        .update(updates)
        .eq('id', id)
        .eq('owner_id', userId)
        .select()
        .single()

      if (error) throw new Error(`Failed to update deal: ${error.message}`)

      return { success: true, deal: data, message: 'Deal updated successfully' }
    }

    case 'delete': {
      const { id } = args
      
      const { error } = await client
        .from('deals')
        .delete()
        .eq('id', id)
        .eq('owner_id', userId)

      if (error) throw new Error(`Failed to delete deal: ${error.message}`)

      return { success: true, message: 'Deal deleted successfully' }
    }

    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

// Leads (Contacts) CRUD
async function handleLeadsCRUD(operation: string, args: any, client: any, userId: string): Promise<any> {
  switch (operation) {
    case 'create': {
      const { first_name, last_name, email, phone, company, title, company_id } = args
      
      const { data, error } = await client
        .from('contacts')
        .insert({
          first_name,
          last_name,
          email,
          phone,
          title,
          company_id,
          owner_id: userId
        })
        .select()
        .single()

      if (error) throw new Error(`Failed to create contact: ${error.message}`)

      return { success: true, contact: data, message: 'Contact created successfully' }
    }

    case 'read': {
      const { id, email, company, company_id, search, limit = 50 } = args

      let query = client
        .from('contacts')
        .select('*')
        .eq('owner_id', userId)

      if (id) {
        query = query.eq('id', id).single()
      } else {
        if (email) query = query.eq('email', email)
        if (company_id) query = query.eq('company_id', company_id)
        if (search) {
          query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
        }
        query = query.limit(limit)
      }

      const { data, error } = await query

      if (error) throw new Error(`Failed to read contacts: ${error.message}`)

      return { success: true, contacts: Array.isArray(data) ? data : [data], count: Array.isArray(data) ? data.length : 1 }
    }

    case 'update': {
      const { id, company, company_id, ...updates } = args
      
      // Resolve company name to company_id if company name provided
      let resolvedCompanyId = company_id
      if (company && !company_id) {
        // Try to find company by name in clients table first (CRM uses clients)
        let companyData = null
        let companyError = null
        
        // Try clients table first (most common in CRM)
        const clientsResult = await client
          .from('clients')
          .select('id')
          .ilike('company_name', `%${company}%`)
          .eq('owner_id', userId)
          .limit(1)
          .maybeSingle()
        
        if (clientsResult.data) {
          resolvedCompanyId = clientsResult.data.id
        } else {
          // Fallback to companies table if clients doesn't exist
          const companiesResult = await client
            .from('companies')
            .select('id')
            .ilike('name', `%${company}%`)
            .eq('owner_id', userId)
            .limit(1)
            .maybeSingle()
          
          if (companiesResult.data) {
            resolvedCompanyId = companiesResult.data.id
          } else {
            // If company not found, try creating it in clients table
            const { data: newCompany, error: createError } = await client
              .from('clients')
              .insert({
                company_name: company,
                owner_id: userId
              })
              .select('id')
              .single()
            
            if (!createError && newCompany) {
              resolvedCompanyId = newCompany.id
            }
          }
        }
      }
      
      // Build update object
      const updateData: any = { ...updates }
      if (resolvedCompanyId) {
        updateData.company_id = resolvedCompanyId
      }
      
      const { data, error } = await client
        .from('contacts')
        .update(updateData)
        .eq('id', id)
        .eq('owner_id', userId)
        .select()
        .single()

      if (error) throw new Error(`Failed to update contact: ${error.message}`)

      return { success: true, contact: data, message: 'Contact updated successfully' }
    }

    case 'delete': {
      const { id } = args
      
      const { error } = await client
        .from('contacts')
        .delete()
        .eq('id', id)
        .eq('owner_id', userId)

      if (error) throw new Error(`Failed to delete contact: ${error.message}`)

      return { success: true, message: 'Contact deleted successfully' }
    }

    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

// Roadmap CRUD
async function handleRoadmapCRUD(operation: string, args: any, client: any, userId: string): Promise<any> {
  switch (operation) {
    case 'create': {
      const { title, description, type = 'feature', priority = 'medium' } = args
      
      const { data, error } = await client
        .from('roadmap_suggestions')
        .insert({
          title,
          description,
          type,
          priority,
          submitted_by: userId,
          status: 'submitted'
        })
        .select()
        .single()

      if (error) throw new Error(`Failed to create roadmap item: ${error.message}`)

      return { success: true, roadmapItem: data, message: `Roadmap item "${title}" created successfully` }
    }

    case 'read': {
      const { id, type, status, priority, limit = 50 } = args

      let query = client
        .from('roadmap_suggestions')
        .select('*')

      if (id) {
        query = query.eq('id', id).single()
      } else {
        if (type) query = query.eq('type', type)
        if (status) query = query.eq('status', status)
        if (priority) query = query.eq('priority', priority)
        query = query.order('created_at', { ascending: false }).limit(limit)
      }

      const { data, error } = await query

      if (error) throw new Error(`Failed to read roadmap items: ${error.message}`)

      return { success: true, roadmapItems: Array.isArray(data) ? data : [data], count: Array.isArray(data) ? data.length : 1 }
    }

    case 'update': {
      const { id, ...updates } = args
      
      // Users can only update their own items
      const { data, error } = await client
        .from('roadmap_suggestions')
        .update(updates)
        .eq('id', id)
        .eq('submitted_by', userId)
        .select()
        .single()

      if (error) throw new Error(`Failed to update roadmap item: ${error.message}`)

      return { success: true, roadmapItem: data, message: 'Roadmap item updated successfully' }
    }

    case 'delete': {
      const { id } = args
      
      // Only admins can delete (or users can delete their own)
      const { error } = await client
        .from('roadmap_suggestions')
        .delete()
        .eq('id', id)
        .eq('submitted_by', userId)

      if (error) throw new Error(`Failed to delete roadmap item: ${error.message}`)

      return { success: true, message: 'Roadmap item deleted successfully' }
    }

    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

// Calendar CRUD
async function handleCalendarCRUD(operation: string, args: any, client: any, userId: string): Promise<any> {
  switch (operation) {
    case 'create': {
      const { title, start_time, end_time, description, location, calendar_id, deal_id } = args
      
      const { data, error } = await client
        .from('calendar_events')
        .insert({
          title,
          start_time,
          end_time,
          description,
          location,
          calendar_id,
          user_id: userId,
          deal_id,
          status: 'confirmed'
        })
        .select()
        .single()

      if (error) throw new Error(`Failed to create calendar event: ${error.message}`)

      return { success: true, event: data, message: 'Calendar event created successfully' }
    }

    case 'read': {
      const { id, title, startDate, endDate, calendar_id, deal_id, limit = 50 } = args

      console.log('[CALENDAR-READ] Query params:', {
        userId,
        id,
        title,
        startDate,
        endDate,
        calendar_id,
        deal_id,
        limit
      })

      console.log('[CALENDAR-READ] Date range query:', {
        startDateISO: startDate,
        endDateISO: endDate,
        startDateParsed: startDate ? new Date(startDate).toISOString() : null,
        endDateParsed: endDate ? new Date(endDate).toISOString() : null
      })

      // Check data freshness and log if sync may be needed
      // The hourly background sync will keep data current
      if (startDate && endDate) {
        const rangeStart = new Date(startDate)
        const rangeEnd = new Date(endDate)

        // Check when this range was last synced
        const { data: lastEvent } = await client
          .from('calendar_events')
          .select('updated_at')
          .eq('user_id', userId)
          .gte('start_time', rangeStart.toISOString())
          .lte('start_time', rangeEnd.toISOString())
          .order('updated_at', { ascending: false })
          .limit(1)
          .single()

        const lastUpdated = lastEvent ? new Date(lastEvent.updated_at) : null
        const minutesSinceUpdate = lastUpdated
          ? (Date.now() - lastUpdated.getTime()) / 1000 / 60
          : Infinity

        console.log('[CALENDAR-READ] Data freshness:', {
          lastUpdated: lastUpdated?.toISOString(),
          minutesSinceUpdate: minutesSinceUpdate.toFixed(1),
          isStale: minutesSinceUpdate > 60,
          note: 'Hourly background sync will update stale data'
        })
      }

      let query = client
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId)

      if (id) {
        query = query.eq('id', id).single()
      } else {
        if (title) query = query.ilike('title', `%${title}%`) // Case-insensitive partial match

        // Handle date range filtering for events
        // For events that span time, we need to find events that OVERLAP with the date range
        // An event overlaps if: event_start < range_end AND event_end > range_start
        if (startDate && endDate) {
          // Parse dates to ensure we have full timestamps
          const rangeStart = new Date(startDate)
          const rangeEnd = new Date(endDate)

          // If same date (or endDate is not later than startDate), assume single day query
          // Extend endDate to end of day to capture all events on that day
          if (rangeEnd.getTime() <= rangeStart.getTime()) {
            rangeEnd.setHours(23, 59, 59, 999)
          }

          console.log('[CALENDAR-READ] Adjusted date range:', {
            originalStart: startDate,
            originalEnd: endDate,
            adjustedStart: rangeStart.toISOString(),
            adjustedEnd: rangeEnd.toISOString()
          })

          // Events that overlap with our date range:
          // - Event starts before or during our range: start_time < rangeEnd
          // - Event ends after or during our range: end_time > rangeStart
          query = query.lt('start_time', rangeEnd.toISOString())
          query = query.gt('end_time', rangeStart.toISOString())
        } else if (startDate) {
          query = query.gte('start_time', startDate)
        } else if (endDate) {
          query = query.lte('start_time', endDate)
        }

        if (calendar_id) query = query.eq('calendar_id', calendar_id)
        if (deal_id) query = query.eq('deal_id', deal_id)
        query = query.order('start_time', { ascending: true }).limit(limit)
      }

      const { data, error } = await query

      if (error) {
        console.error('[CALENDAR-READ] Error:', error)
        throw new Error(`Failed to read calendar events: ${error.message}`)
      }

      console.log('[CALENDAR-READ] Found events:', {
        count: Array.isArray(data) ? data.length : (data ? 1 : 0),
        events: Array.isArray(data) ? data.map(e => ({ id: e.id, title: e.title, start: e.start_time, end: e.end_time })) : (data ? [{ id: data.id, title: data.title, start: data.start_time, end: data.end_time }] : [])
      })

      if (!data || (Array.isArray(data) && data.length === 0)) {
        console.log('[CALENDAR-READ] No events found. Query filters applied:', {
          hasTitle: !!title,
          hasStartDate: !!startDate,
          hasEndDate: !!endDate,
          hasCalendarId: !!calendar_id,
          hasDealId: !!deal_id
        })
      }

      return { success: true, events: Array.isArray(data) ? data : [data], count: Array.isArray(data) ? data.length : 1 }
    }

    case 'update': {
      const { id, ...updates } = args

      console.log('[CALENDAR-UPDATE] Updating event:', {
        userId,
        eventId: id,
        updates
      })

      const { data, error } = await client
        .from('calendar_events')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()

      if (error) {
        console.error('[CALENDAR-UPDATE] Error:', error)
        throw new Error(`Failed to update calendar event: ${error.message}`)
      }

      console.log('[CALENDAR-UPDATE] Success:', {
        eventId: data?.id,
        title: data?.title,
        newStartTime: data?.start_time,
        newEndTime: data?.end_time
      })

      return { success: true, event: data, message: 'Calendar event updated successfully' }
    }

    case 'delete': {
      const { id } = args
      
      const { error } = await client
        .from('calendar_events')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)

      if (error) throw new Error(`Failed to delete calendar event: ${error.message}`)

      return { success: true, message: 'Calendar event deleted successfully' }
    }

    case 'availability': {
      return await handleCalendarAvailability(args, client, userId)
    }

    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

/**
 * Ensure calendar is synced before querying
 * Checks user_sync_status and triggers sync if needed (stale or never synced)
 */
async function ensureCalendarSynced(
  client: any,
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<void> {
  try {
    // Get user sync status (handle case where table doesn't exist yet)
    let syncStatus: any = null
    try {
      const { data, error } = await client
        .from('user_sync_status')
        .select('calendar_last_synced_at, calendar_sync_token')
        .eq('user_id', userId)
        .maybeSingle()
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned (expected)
        console.error('[CALENDAR-SYNC] Error checking sync status:', error)
        // If table doesn't exist, error.code will be different - continue to sync anyway
      } else {
        syncStatus = data
      }
    } catch (tableError: any) {
      // Table might not exist if migration hasn't been applied
      console.log('[CALENDAR-SYNC] user_sync_status table may not exist, will attempt sync anyway')
    }

    // Check if sync is needed (never synced or > 5 minutes old)
    const needsSync = !syncStatus?.calendar_last_synced_at ||
      (Date.now() - new Date(syncStatus.calendar_last_synced_at).getTime()) > 5 * 60 * 1000

    if (needsSync) {
      console.log('[CALENDAR-SYNC] Triggering sync for user:', userId, {
        hasSyncStatus: !!syncStatus,
        lastSynced: syncStatus?.calendar_last_synced_at,
        syncToken: syncStatus?.calendar_sync_token ? 'present' : 'missing'
      })
      
      // Call google-calendar-sync edge function using service role
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      
      if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[CALENDAR-SYNC] Missing Supabase configuration')
        return
      }
      
      const syncResponse = await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'X-Internal-Call': 'true',
        },
        body: JSON.stringify({
          action: 'incremental-sync',
          syncToken: syncStatus?.calendar_sync_token,
          startDate,
          endDate,
          userId,
        }),
      })

      if (!syncResponse.ok) {
        const errorText = await syncResponse.text()
        let errorData: any = {}
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { message: errorText }
        }
        console.error('[CALENDAR-SYNC] Sync failed:', {
          status: syncResponse.status,
          statusText: syncResponse.statusText,
          error: errorData
        })
        // Don't throw - allow query to proceed with existing data
        return
      }

      const syncResult = await syncResponse.json()
      console.log('[CALENDAR-SYNC] Sync completed:', {
        success: syncResult.success,
        stats: syncResult.stats,
        syncToken: syncResult.syncToken ? 'present' : 'missing'
      })
    } else {
      console.log('[CALENDAR-SYNC] Sync not needed, last synced:', syncStatus?.calendar_last_synced_at)
    }
  } catch (error: any) {
    console.error('[CALENDAR-SYNC] Error checking/syncing calendar:', {
      message: error.message,
      stack: error.stack
    })
    // Don't throw - allow query to proceed with existing data
  }
}

// Calendar Availability
async function handleCalendarAvailability(args: any, client: any, userId: string): Promise<any> {
  const {
    startDate,
    endDate,
    durationMinutes = 60,
    workingHoursStart = '09:00',
    workingHoursEnd = '17:00',
    excludeWeekends = true
  } = args || {}

  // Ensure calendar is synced before querying
  await ensureCalendarSynced(client, userId, startDate, endDate)

  const timezone = await getUserTimezone(client, userId)
  const normalizedDuration = clampDurationMinutes(durationMinutes)
  const safeStartTime = normalizeTimeInput(workingHoursStart, '09:00')
  const safeEndTime = normalizeTimeInput(workingHoursEnd, '17:00')

  const now = new Date()
  const parsedStart = parseDateInput(startDate, now)
  const parsedEnd = parseDateInput(endDate, addDays(parsedStart, 7))

  let rangeStart = startOfZonedDay(parsedStart, timezone)
  let rangeEnd = endOfZonedDay(parsedEnd, timezone)
  const maxRangeDays = 30
  if (rangeEnd.getTime() - rangeStart.getTime() > maxRangeDays * 24 * 60 * 60 * 1000) {
    rangeEnd = endOfZonedDay(addDays(rangeStart, maxRangeDays), timezone)
  }
  if (rangeEnd <= rangeStart) {
    rangeEnd = endOfZonedDay(addDays(rangeStart, 1), timezone)
  }

  console.log('[CALENDAR-AVAILABILITY] Querying events:', {
    userId,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    timezone
  })

  // Query events that overlap with the time range
  // An event overlaps if: start_time < rangeEnd AND end_time > rangeStart
  // Also exclude deleted/cancelled events
  const { data: rawEvents, error } = await client
    .from('calendar_events')
    .select(`
      id,
      title,
      start_time,
      end_time,
      location,
      status,
      meeting_url,
      deal_id,
      contact_id,
      attendees:calendar_attendees(name, email)
    `)
    .eq('user_id', userId)
    .lt('start_time', rangeEnd.toISOString())
    .gt('end_time', rangeStart.toISOString())
    .neq('status', 'cancelled')
    .neq('sync_status', 'deleted')
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[CALENDAR-AVAILABILITY] Query error:', error)
    throw new Error(`Failed to read calendar events: ${error.message}`)
  }

  console.log('[CALENDAR-AVAILABILITY] Found events:', {
    count: rawEvents?.length || 0,
    events: rawEvents?.slice(0, 5).map((e: any) => ({
      title: e.title,
      start: e.start_time,
      end: e.end_time
    }))
  })

  let meetingFallbackEvents: any[] = []
  if (!rawEvents || rawEvents.length === 0) {
    const { data: meetingRows, error: meetingError } = await client
      .from('meetings')
      .select(`
        id,
        title,
        meeting_start,
        meeting_end,
        duration_minutes,
        owner_user_id,
        company_id,
        primary_contact_id
      `)
      .eq('owner_user_id', userId)
      .gte('meeting_start', rangeStart.toISOString())
      .lte('meeting_start', rangeEnd.toISOString())

    if (!meetingError && meetingRows && meetingRows.length > 0) {
      meetingFallbackEvents = meetingRows
        .filter(meeting => meeting.meeting_start)
        .map(meeting => {
          const startIso = meeting.meeting_start
          const endIso =
            meeting.meeting_end ||
            (meeting.meeting_start && meeting.duration_minutes
              ? new Date(new Date(meeting.meeting_start).getTime() + meeting.duration_minutes * 60000).toISOString()
              : meeting.meeting_start)

          return {
            id: `meeting-${meeting.id}`,
            title: meeting.title || 'Meeting',
            start_time: startIso,
            end_time: endIso,
            location: null,
            status: 'confirmed',
            meeting_url: null,
            deal_id: meeting.company_id,
            contact_id: meeting.primary_contact_id,
            attendees: [],
            source: 'meetings'
          }
        })
    }
  }

  const combinedEvents = [...(rawEvents || []), ...meetingFallbackEvents]

  const normalizedEvents = combinedEvents
    .map(event => {
      const start = new Date(event.start_time)
      const end = new Date(event.end_time)
      return {
        ...event,
        start,
        end
      }
    })
    .filter(event => !isNaN(event.start.getTime()) && !isNaN(event.end.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const availabilitySlots: Array<{ start: string; end: string; durationMinutes: number }> = []
  const allSlots: Array<{ start: Date; end: Date; durationMinutes: number; slotType: '60min' | '30min' }> = []

  let dayCursor = new Date(rangeStart)
  while (dayCursor <= rangeEnd) {
    const { weekday } = getZonedDateParts(dayCursor, timezone)
    if (!(excludeWeekends && (weekday === 0 || weekday === 6))) {
      const dayWorkStart = zonedTimeOnDate(dayCursor, safeStartTime, timezone)
      let dayWorkEnd = zonedTimeOnDate(dayCursor, safeEndTime, timezone)
      if (dayWorkEnd <= dayWorkStart) {
        dayWorkEnd = addMinutes(dayWorkStart, 8 * 60)
      }

      const overlappingEvents = normalizedEvents
        .map(event => ({
          start: new Date(Math.max(event.start.getTime(), dayWorkStart.getTime())),
          end: new Date(Math.min(event.end.getTime(), dayWorkEnd.getTime()))
        }))
        .filter(interval => interval.end > interval.start)

      const mergedBusy = mergeIntervals(overlappingEvents)

      // Calculate slots for both 60-min and 30-min durations
      // Strategy: Prioritize 60-min slots, fall back to 30-min for smaller gaps
      const freeSlots60 = calculateFreeSlotsForDay(dayWorkStart, dayWorkEnd, mergedBusy, 60)
      const freeSlots30 = calculateFreeSlotsForDay(dayWorkStart, dayWorkEnd, mergedBusy, 30)

      // Mark 60-min slots
      for (const slot of freeSlots60) {
        allSlots.push({ ...slot, slotType: '60min' })
      }

      // Add 30-min slots that don't overlap with 60-min slots (gaps 30-59 min)
      for (const slot30 of freeSlots30) {
        const overlapsWithSlot60 = freeSlots60.some(slot60 =>
          slot30.start.getTime() === slot60.start.getTime()
        )
        // Only add if it's a smaller gap (30-59 min) not covered by 60-min slots
        if (!overlapsWithSlot60 && slot30.durationMinutes < 60) {
          allSlots.push({ ...slot30, slotType: '30min' })
        }
      }
    }

    dayCursor = addDays(dayCursor, 1)
  }

  // Sort by start time
  allSlots.sort((a, b) => a.start.getTime() - b.start.getTime())

  const totalFreeMinutes = allSlots.reduce((sum, slot) => sum + slot.durationMinutes, 0)
  const totalBusyMinutes = normalizedEvents.reduce((sum, event) => {
    const diff = Math.max(0, event.end.getTime() - event.start.getTime())
    return sum + diff / 60000
  }, 0)

  for (const slot of allSlots.slice(0, 25)) {
    availabilitySlots.push({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      durationMinutes: slot.durationMinutes
    })
  }

  const busySlots = normalizedEvents.map(event => ({
    id: event.id,
    title: event.title || 'Busy',
    start: event.start.toISOString(),
    end: event.end.toISOString()
  }))

  return {
    success: true,
    availableSlots: availabilitySlots,
    totalAvailableSlots: allSlots.length,
    busySlots,
    events: combinedEvents,
    summary: {
      totalFreeMinutes,
      totalBusyMinutes,
      totalFreeHours: Number((totalFreeMinutes / 60).toFixed(1)),
      totalBusyHours: Number((totalBusyMinutes / 60).toFixed(1)),
      meetingCount: normalizedEvents.length
    },
    range: {
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString()
    },
    timezone,
    durationMinutes: normalizedDuration,
    workingHours: {
      start: safeStartTime,
      end: safeEndTime
    },
    excludeWeekends: !!excludeWeekends
  }
}

// Tasks CRUD
async function handleTasksCRUD(operation: string, args: any, client: any, userId: string): Promise<any> {
  switch (operation) {
    case 'create': {
      const { title, description, priority = 'medium', task_type = 'general', due_date, contact_id, deal_id, company_id } = args
      
      const taskData: any = {
        title,
        description,
        priority,
        task_type,
        created_by: userId,
        assigned_to: userId,
        status: 'todo'
      }

      if (due_date) taskData.due_date = due_date
      if (contact_id) taskData.contact_id = contact_id
      if (deal_id) taskData.deal_id = deal_id
      if (company_id) taskData.company_id = company_id

      const { data, error } = await client
        .from('tasks')
        .insert(taskData)
        .select()
        .single()

      if (error) throw new Error(`Failed to create task: ${error.message}`)

      return { success: true, task: data, message: `Task "${title}" created successfully` }
    }

    case 'read': {
      const { id, status, priority, contact_id, deal_id, limit = 50 } = args

      let query = client
        .from('tasks')
        .select('*')
        // Include tasks assigned to user OR created by user
        .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)

      if (id) {
        query = query.eq('id', id).single()
      } else {
        if (status) query = query.eq('status', status)
        if (priority) query = query.eq('priority', priority)
        if (contact_id) query = query.eq('contact_id', contact_id)
        if (deal_id) query = query.eq('deal_id', deal_id)
        query = query.order('created_at', { ascending: false }).limit(limit)
      }

      const { data, error } = await query

      if (error) throw new Error(`Failed to read tasks: ${error.message}`)

      return { success: true, tasks: Array.isArray(data) ? data : [data], count: Array.isArray(data) ? data.length : 1 }
    }

    case 'update': {
      const { id, ...updates } = args
      
      // First check if task exists and user has permission (assigned to or created by)
      const { data: existingTask, error: checkError } = await client
        .from('tasks')
        .select('id, assigned_to, created_by')
        .eq('id', id)
        .single()

      if (checkError || !existingTask) {
        throw new Error(`Task not found: ${id}`)
      }

      if (existingTask.assigned_to !== userId && existingTask.created_by !== userId) {
        throw new Error('You do not have permission to update this task')
      }
      
      const { data, error } = await client
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw new Error(`Failed to update task: ${error.message}`)

      return { success: true, task: data, message: 'Task updated successfully' }
    }

    case 'delete': {
      const { id } = args
      
      // First check if task exists and user has permission (assigned to or created by)
      const { data: existingTask, error: checkError } = await client
        .from('tasks')
        .select('id, assigned_to, created_by')
        .eq('id', id)
        .single()

      if (checkError || !existingTask) {
        throw new Error(`Task not found: ${id}`)
      }

      if (existingTask.assigned_to !== userId && existingTask.created_by !== userId) {
        throw new Error('You do not have permission to delete this task')
      }
      
      const { error } = await client
        .from('tasks')
        .delete()
        .eq('id', id)

      if (error) throw new Error(`Failed to delete task: ${error.message}`)

      return { success: true, message: 'Task deleted successfully' }
    }

    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

// Clients CRUD
async function handleClientsCRUD(operation: string, args: any, client: any, userId: string): Promise<any> {
  switch (operation) {
    case 'create': {
      const { company_name, contact_name, contact_email, subscription_amount, status = 'active', deal_id, subscription_start_date } = args
      
      if (!company_name) {
        throw new Error('Company name is required')
      }
      
      const clientData: any = {
        company_name,
        owner_id: userId,
        status
      }
      
      if (contact_name) clientData.contact_name = contact_name
      if (contact_email) clientData.contact_email = contact_email
      if (subscription_amount !== undefined) clientData.subscription_amount = subscription_amount
      if (deal_id) clientData.deal_id = deal_id
      if (subscription_start_date) {
        clientData.subscription_start_date = subscription_start_date
      } else {
        // Default to today if not provided
        clientData.subscription_start_date = new Date().toISOString().split('T')[0]
      }

      const { data, error } = await client
        .from('clients')
        .insert(clientData)
        .select()
        .single()

      if (error) throw new Error(`Failed to create client: ${error.message}`)

      return { success: true, client: data, message: `Client "${company_name}" created successfully` }
    }

    case 'read': {
      const { id, company_name, status, deal_id, limit = 50 } = args

      let query = client
        .from('clients')
        .select('*')
        .eq('owner_id', userId)

      if (id) {
        query = query.eq('id', id).single()
      } else {
        if (company_name) query = query.ilike('company_name', `%${company_name}%`)
        if (status) query = query.eq('status', status)
        if (deal_id) query = query.eq('deal_id', deal_id)
        query = query.order('created_at', { ascending: false }).limit(limit)
      }

      const { data, error } = await query

      if (error) throw new Error(`Failed to read clients: ${error.message}`)

      return { success: true, clients: Array.isArray(data) ? data : [data], count: Array.isArray(data) ? data.length : 1 }
    }

    case 'update': {
      const { id, ...updates } = args
      
      if (!id) {
        throw new Error('Client ID is required for update')
      }
      
      // Handle churn_date logic - if status is being set to churned, ensure churn_date is set
      if (updates.status === 'churned' && !updates.churn_date) {
        updates.churn_date = new Date().toISOString().split('T')[0]
      }
      // If status is changing away from churned, clear churn_date
      if (updates.status && updates.status !== 'churned' && updates.churn_date === undefined) {
        // Check current status first
        const { data: currentClient } = await client
          .from('clients')
          .select('status')
          .eq('id', id)
          .eq('owner_id', userId)
          .single()
        
        if (currentClient && currentClient.status === 'churned') {
          updates.churn_date = null
        }
      }
      
      const { data, error } = await client
        .from('clients')
        .update(updates)
        .eq('id', id)
        .eq('owner_id', userId)
        .select()
        .single()

      if (error) throw new Error(`Failed to update client: ${error.message}`)

      return { success: true, client: data, message: 'Client updated successfully' }
    }

    case 'delete': {
      const { id } = args
      
      const { error } = await client
        .from('clients')
        .delete()
        .eq('id', id)
        .eq('owner_id', userId)

      if (error) throw new Error(`Failed to delete client: ${error.message}`)

      return { success: true, message: 'Client deleted successfully' }
    }

    default:
      throw new Error(`Unknown operation: ${operation}`)
  }
}

// Emails tool (Gmail search)
async function handleEmailsTool(operation: string, args: any, client: any, userId: string): Promise<any> {
  if (operation !== 'search') {
    throw new Error(`Unknown operation for emails: ${operation}`)
  }

  const {
    contact_email,
    contact_id,
    contact_name,
    query,
    direction = 'both',
    start_date,
    end_date,
    limit = 10,
    label
  } = args || {}

  let resolvedContactId = contact_id || null
  let contactEmail: string | null = contact_email ? String(contact_email).trim() : null
  let contactName: string | null = contact_name ? String(contact_name).trim() : null

  if (!contactEmail && resolvedContactId) {
    const { data } = await client
      .from('contacts')
      .select('id, email, full_name')
      .eq('id', resolvedContactId)
      .eq('owner_id', userId)
      .maybeSingle()
    if (data) {
      contactEmail = data.email || contactEmail
      contactName = data.full_name || contactName
      resolvedContactId = data.id
    }
  }

  if (!contactEmail && contactName) {
    const { data } = await client
      .from('contacts')
      .select('id, email, full_name')
      .eq('owner_id', userId)
      .ilike('full_name', `%${contactName}%`)
      .maybeSingle()
    if (data) {
      contactEmail = data.email || contactEmail
      contactName = data.full_name || contactName
      resolvedContactId = data.id
    }
  }

  const normalizedDirection: 'sent' | 'received' | 'both' =
    direction === 'sent' || direction === 'received' ? direction : 'both'
  const sanitizedLimit = Math.min(Math.max(Number(limit) || 10, 1), 20)

  let messages: GmailMessageSummary[] = []
  let source: 'gmail' | 'activities' | 'none' = 'gmail'
  let warning: string | null = null

  // Check data freshness and log if sync may be needed
  try {
    let emailsQuery = client
      .from('emails')
      .select('updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);

    // Apply date range filter if provided
    if (start_date) {
      emailsQuery = emailsQuery.gte('received_at', start_date);
    }
    if (end_date) {
      emailsQuery = emailsQuery.lte('received_at', end_date);
    }

    const { data: lastEmail } = await emailsQuery.maybeSingle();

    const lastUpdated = lastEmail ? new Date(lastEmail.updated_at) : null;
    const minutesSinceUpdate = lastUpdated
      ? (Date.now() - lastUpdated.getTime()) / 1000 / 60
      : Infinity;

    console.log('[EMAIL-READ] Data freshness:', {
      lastUpdated: lastUpdated?.toISOString(),
      minutesSinceUpdate: minutesSinceUpdate.toFixed(1),
      isStale: minutesSinceUpdate > 60,
      note: 'Hourly background sync will update stale data',
      startDate: start_date,
      endDate: end_date
    });
  } catch (freshnessError) {
    console.error('[EMAIL-READ] Freshness check error (non-critical):', freshnessError);
  }

  try {
    const gmailResult = await searchGmailMessages(client, userId, {
      contactEmail,
      query: query || contactName || contactEmail || null,
      limit: sanitizedLimit,
      direction: normalizedDirection,
      startDate: start_date || null,
      endDate: end_date || null,
      label: label || null
    })
    messages = gmailResult.messages
  } catch (error) {
    warning = error.message || 'Unable to reach Gmail'
    console.error('[EMAILS_TOOL] Gmail search failed:', error)
    if (resolvedContactId) {
      messages = await fetchEmailActivitiesFallback(client, userId, resolvedContactId, sanitizedLimit)
      source = messages.length ? 'activities' : 'none'
    } else {
      source = 'none'
    }
  }

  return {
    success: true,
    source,
    warning,
    messages,
    matchedContact: {
      contact_id: resolvedContactId,
      contact_email: contactEmail,
      contact_name: contactName
    }
  }
}

/**
 * Optimize transcript text for large transcripts
 * Handles truncation intelligently at sentence boundaries
 */
function optimizeTranscriptText(
  transcript: string,
  maxLength: number = 50000,
  mode: 'full' | 'summary' | 'truncated' = 'truncated',
  summary?: string
): string {
  if (!transcript) return transcript

  // If transcript is within limits, return as-is
  if (transcript.length <= maxLength) {
    return transcript
  }

  // If mode is 'summary' and summary exists, return summary instead
  if (mode === 'summary' && summary) {
    return `[Summary Mode] ${summary}\n\n[Full transcript available but not included due to length]`
  }

  // Truncate intelligently at sentence boundaries
  const truncated = transcript.substring(0, maxLength)
  
  // Try to find a sentence boundary near the end
  const sentenceEndRegex = /[.!?]\s+/g
  let lastSentenceEnd = -1
  let match
  
  // Look for sentence endings in the last 20% of the truncated text
  const searchStart = Math.floor(maxLength * 0.8)
  const searchText = truncated.substring(searchStart)
  
  while ((match = sentenceEndRegex.exec(searchText)) !== null) {
    lastSentenceEnd = searchStart + match.index + match[0].length
  }
  
  // If we found a good sentence boundary (within last 10% of limit), use it
  if (lastSentenceEnd > maxLength * 0.9) {
    return truncated.substring(0, lastSentenceEnd) + 
           `\n\n[... transcript truncated: ${transcript.length - lastSentenceEnd} characters remaining ...]`
  }
  
  // Otherwise, find the last word boundary
  const lastSpace = truncated.lastIndexOf(' ')
  const lastNewline = truncated.lastIndexOf('\n')
  const cutPoint = Math.max(lastSpace, lastNewline)
  
  if (cutPoint > maxLength * 0.9) {
    return truncated.substring(0, cutPoint) + 
           `\n\n[... transcript truncated: ${transcript.length - cutPoint} characters remaining ...]`
  }
  
  // Fallback: hard truncate with warning
  return truncated + `\n\n[... transcript truncated: ${transcript.length - maxLength} characters remaining ...]`
}

// Note: Legacy functions removed - all operations now use CRUD handlers above
// The CRUD handlers provide full access to meetings with transcripts, action items, etc.

/**
 * Generate email draft using Claude (utility function for email generation)
 * Now supports user's personal writing style from AI personalization settings
 */
async function generateEmailDraft(
  context: any,
  tone: 'professional' | 'friendly' | 'concise',
  writingStyle?: {
    name: string;
    tone_description: string;
    examples?: string[];
    style_metadata?: any;
  } | null
): Promise<{ subject: string; body: string; suggestedSendTime: string }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  // Default tone instructions as fallback
  const defaultToneInstructions = {
    professional: 'Use a professional, business-appropriate tone. Be respectful and formal.',
    friendly: 'Use a warm, friendly tone. Be personable and conversational.',
    concise: 'Be brief and to the point. Get straight to the value proposition.'
  }

  // Build personalized style instruction if user has a writing style configured
  let styleInstruction = ''
  if (writingStyle) {
    const styleParts: string[] = []
    styleParts.push(`\n## USER'S PERSONAL WRITING STYLE`)
    styleParts.push(`Style: ${writingStyle.name}`)
    styleParts.push(`Tone: ${writingStyle.tone_description}`)
    
    const meta = writingStyle.style_metadata
    if (meta?.tone_characteristics) {
      styleParts.push(`Characteristics: ${meta.tone_characteristics}`)
    }
    if (meta?.vocabulary_profile) {
      styleParts.push(`Vocabulary: ${meta.vocabulary_profile}`)
    }
    if (meta?.greeting_style) {
      styleParts.push(`Greetings: ${meta.greeting_style}`)
    }
    if (meta?.signoff_style) {
      styleParts.push(`Sign-offs: ${meta.signoff_style}`)
    }
    
    if (writingStyle.examples && writingStyle.examples.length > 0) {
      const snippets = writingStyle.examples.slice(0, 2).map(ex => 
        ex.length > 150 ? ex.substring(0, 150) + '...' : ex
      )
      styleParts.push(`\nExample snippets of their writing:\n${snippets.map(s => `"${s}"`).join('\n')}`)
    }
    
    styleParts.push(`\n**CRITICAL: Match this user's writing style exactly. Use their vocabulary, tone, greeting style, and sign-off patterns. Make it sound like THEY wrote it.**`)
    styleInstruction = styleParts.join('\n')
  } else {
    // Fallback to generic tone
    styleInstruction = defaultToneInstructions[tone]
  }

  // Get current date for accurate date references in email
  const today = new Date()
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }
  const currentDateStr = today.toLocaleDateString('en-US', dateOptions)
  const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' })

  const prompt = `You are drafting a follow-up email for ${context.contact.name} at ${context.contact.company}.

TODAY'S DATE: ${currentDateStr} (${dayOfWeek})
Use this date when making any date references like "tomorrow", "next week", "this Friday", etc.

Context: ${context.context}

${context.recentActivities.length > 0 ? `Recent activities:\n${context.recentActivities.map((a: any) => `- ${a.type}: ${a.details || 'N/A'} on ${a.date}`).join('\n')}\n` : ''}

${context.deals.length > 0 ? `Related deals:\n${context.deals.map((d: any) => `- ${d.name}: $${d.value} (${d.deal_stages?.name || 'Unknown'})`).join('\n')}\n` : ''}

${styleInstruction}

Generate an email with:
1. A clear, compelling subject line
2. A well-structured email body (2-4 paragraphs)
3. A suggested send time (e.g., "Tomorrow 9 AM EST" or "Monday morning")

Return your response as JSON in this exact format:
{
  "subject": "Email subject here",
  "body": "Email body here with proper formatting",
  "suggestedSendTime": "Suggested send time"
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.content[0]?.text || ''

  // Parse JSON from response
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const emailData = JSON.parse(jsonMatch[0])
      return {
        subject: emailData.subject || 'Follow-up',
        body: emailData.body || content,
        suggestedSendTime: emailData.suggestedSendTime || 'Tomorrow 9 AM EST'
      }
    }
  } catch (e) {
  }

  // Fallback if JSON parsing fails
  return {
    subject: 'Follow-up',
    body: content,
    suggestedSendTime: 'Tomorrow 9 AM EST'
  }
}

/**
 * Gmail + Communication Helpers
 */
async function refreshGmailAccessToken(
  client: any,
  integrationId: string,
  userId: string,
  refreshToken?: string | null
): Promise<{ accessToken: string; expiresAt: string }> {
  if (!refreshToken) {
    throw new Error('No refresh token available for Gmail integration. Please reconnect your Google account.')
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials are not configured on the server.')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error?.message || 'Failed to refresh Gmail token')
  }

  const expiresAtDate = new Date()
  expiresAtDate.setSeconds(expiresAtDate.getSeconds() + (payload.expires_in || 3600))

  await client
    .from('google_integrations')
    .update({
      access_token: payload.access_token,
      expires_at: expiresAtDate.toISOString()
    })
    .eq('id', integrationId)

  return {
    accessToken: payload.access_token,
    expiresAt: expiresAtDate.toISOString()
  }
}

async function getGmailAccessToken(
  client: any,
  userId: string
): Promise<{ accessToken: string; integrationId: string }> {
  const { data: integration, error } = await client
    .from('google_integrations')
    .select('id, access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !integration) {
    throw new Error('Google integration not found. Connect your Gmail account in Settings.')
  }

  let accessToken = integration.access_token
  const expiresAt = integration.expires_at ? new Date(integration.expires_at) : null
  const needsRefresh = !accessToken || (expiresAt && expiresAt.getTime() <= Date.now() + 60_000)

  if (needsRefresh) {
    const refreshed = await refreshGmailAccessToken(client, integration.id, userId, integration.refresh_token)
    accessToken = refreshed.accessToken
  }

  return { accessToken, integrationId: integration.id }
}

function extractEmailsFromHeader(header?: string): string[] {
  if (!header) return []
  const matches = header.match(/[\w.+-]+@[\w.-]+\.\w+/g)
  if (!matches) return []
  return matches.map(email => email.trim())
}

function sanitizeSubject(subject?: string): string {
  if (!subject || !subject.trim()) return '(No subject)'
  return subject.trim()
}

function determineDirection(
  contactEmail: string | null,
  fromList: string[],
  toList: string[]
): 'sent' | 'received' | 'unknown' {
  if (!contactEmail) return 'unknown'
  const normalized = contactEmail.toLowerCase()
  if (fromList.some(email => email.toLowerCase() === normalized)) return 'received'
  if (toList.some(email => email.toLowerCase() === normalized)) return 'sent'
  return 'unknown'
}

function toUnixTimestamp(dateString?: string | null): number | null {
  if (!dateString) return null
  const parsed = new Date(dateString)
  if (isNaN(parsed.getTime())) return null
  return Math.floor(parsed.getTime() / 1000)
}

async function searchGmailMessages(
  client: any,
  userId: string,
  options: {
    contactEmail?: string | null
    query?: string | null
    limit?: number
    direction?: 'sent' | 'received' | 'both'
    startDate?: string | null
    endDate?: string | null
    label?: string | null
  }
): Promise<{ messages: GmailMessageSummary[]; source: 'gmail' }> {
  const { accessToken } = await getGmailAccessToken(client, userId)
  const limit = Math.min(Math.max(options.limit || 10, 1), 20)

  const qParts: string[] = []
  if (options.contactEmail) {
    const normalizedEmail = options.contactEmail.trim()
    if (options.direction === 'sent') {
      qParts.push(`to:${normalizedEmail}`)
    } else if (options.direction === 'received') {
      qParts.push(`from:${normalizedEmail}`)
    } else {
      qParts.push(`(from:${normalizedEmail} OR to:${normalizedEmail})`)
    }
  }

  if (options.query) {
    const safeQuery = options.query.replace(/"/g, '').trim()
    if (safeQuery) qParts.push(`"${safeQuery}"`)
  }

  if (options.label) {
    const safeLabel = options.label.replace(/"/g, '').trim()
    if (safeLabel) qParts.push(`label:"${safeLabel}"`)
  }

  const after = toUnixTimestamp(options.startDate || null)
  const before = toUnixTimestamp(options.endDate || null)
  if (after) qParts.push(`after:${after}`)
  if (before) qParts.push(`before:${before}`)

  const params = new URLSearchParams({
    maxResults: String(limit)
  })
  if (qParts.length > 0) {
    params.set('q', qParts.join(' '))
  }

  const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (listResponse.status === 404) {
    return { messages: [], source: 'gmail' }
  }

  const listPayload = await listResponse.json().catch(() => ({}))
  if (!listResponse.ok) {
    throw new Error(listPayload.error?.message || 'Failed to fetch Gmail messages')
  }

  const messageRefs = (listPayload.messages || []).slice(0, limit)
  if (messageRefs.length === 0) {
    return { messages: [], source: 'gmail' }
  }

  const baseHeaders = ['Subject', 'From', 'To', 'Date']

  const detailedResults = await Promise.allSettled(
    messageRefs.map(async (msg: any) => {
      const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`)
      detailUrl.searchParams.set('format', 'metadata')
      baseHeaders.forEach(header => detailUrl.searchParams.append('metadataHeaders', header))

      const detailResponse = await fetch(detailUrl.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })

      if (!detailResponse.ok) {
        return null
      }

      const detail = await detailResponse.json()
      const headerList = detail.payload?.headers || []
      const getHeader = (name: string) => headerList.find((h: any) => h.name === name)?.value || ''
      const subject = sanitizeSubject(getHeader('Subject'))
      const snippet = detail.snippet || ''
      const sentDate = getHeader('Date')
      const date = sentDate
        ? new Date(sentDate).toISOString()
        : detail.internalDate
          ? new Date(Number(detail.internalDate)).toISOString()
          : new Date().toISOString()
      const fromList = extractEmailsFromHeader(getHeader('From'))
      const toList = extractEmailsFromHeader(getHeader('To'))

      return {
        id: detail.id,
        threadId: detail.threadId,
        subject,
        snippet,
        date,
        from: fromList,
        to: toList,
        historyId: detail.historyId,
        direction: determineDirection(options.contactEmail || null, fromList, toList),
        link: detail.threadId ? `https://mail.google.com/mail/u/0/#inbox/${detail.threadId}` : undefined
      } as GmailMessageSummary
    })
  )

  const messages: GmailMessageSummary[] = []
  for (const result of detailedResults) {
    if (result.status === 'fulfilled' && result.value) {
      messages.push(result.value)
    }
  }

  return { messages, source: 'gmail' }
}

async function fetchEmailActivitiesFallback(
  client: any,
  userId: string,
  contactId?: string | null,
  limit: number = 10
): Promise<GmailMessageSummary[]> {
  if (!contactId) return []

  const { data, error } = await client
    .from('activities')
    .select('id, details, date')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .eq('type', 'email')
    .order('date', { ascending: false })
    .limit(limit)

  if (error || !data) {
    if (error) console.error('Error fetching fallback activities:', error)
    return []
  }

  return data.map((activity: any) => ({
    id: activity.id,
    subject: sanitizeSubject(activity.details?.substring(0, 80) || 'Email'),
    snippet: activity.details || '',
    date: activity.date,
    direction: 'unknown' as const,
    from: [],
    to: [],
    historyId: undefined,
    threadId: undefined,
    link: undefined
  }))
}

/**
 * Extract user ID from message by matching names
 * Looks for patterns like "Phil's performance", "show me John's", etc.
 */
async function extractUserIdFromMessage(
  message: string,
  client: any,
  requestingUserId: string
): Promise<string | null> {
  try {
    console.log('[EXTRACT-USER] Starting user extraction from message:', message.substring(0, 100))
    
    // Patterns to match: "Phil's performance", "show me John's", "how is Mike doing", etc.
    // More flexible patterns to catch various phrasings
    const namePatterns = [
      /(?:can you show|show me|how is|what is|tell me about|view|see|i'd like to see)\s+([A-Z][a-z]+)(?:'s|'|s)?\s+(?:performance|doing|performing|stats|data|results|sales|this week|this month)/i,
      /([A-Z][a-z]+)(?:'s|'|s)?\s+(?:performance|doing|performing|stats|data|results|sales|this week|this month)/i,
      /(?:for|about)\s+([A-Z][a-z]+)(?:\s|$)/i,
      /([A-Z][a-z]+)(?:'s|'|s)?\s+(?:performance|doing|performing|sales)/i,
      // Match "Phil's sales performance" or "Phil's performance this week"
      /([A-Z][a-z]+)(?:'s|'|s)?\s+(?:sales\s+)?performance/i
    ]
    
    let extractedName: string | null = null
    
    for (let i = 0; i < namePatterns.length; i++) {
      const pattern = namePatterns[i]
      const match = message.match(pattern)
      if (match && match[1]) {
        extractedName = match[1].trim()
        console.log('[EXTRACT-USER] ✅ Name extracted via pattern', i + 1, ':', extractedName)
        break
      }
    }
    
    if (!extractedName) {
      console.log('[EXTRACT-USER] ❌ No name extracted from message')
      return null
    }
    
    // Search for user by first name or last name
    console.log('[EXTRACT-USER] Searching for user with name:', extractedName)
    const { data: users, error } = await client
      .from('profiles')
      .select('id, first_name, last_name, email')
      .or(`first_name.ilike.%${extractedName}%,last_name.ilike.%${extractedName}%`)
      .limit(10)
    
    if (error) {
      console.error('[EXTRACT-USER] ❌ Database error:', error)
      return null
    }
    
    if (!users || users.length === 0) {
      console.log('[EXTRACT-USER] ❌ No users found matching name:', extractedName)
      return null
    }
    
    console.log('[EXTRACT-USER] Found', users.length, 'potential matches:', users.map(u => ({
      id: u.id,
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email
    })))
    
    // Exact match preferred, then partial match
    const exactMatch = users.find(u => 
      u.first_name?.toLowerCase() === extractedName.toLowerCase() ||
      u.last_name?.toLowerCase() === extractedName.toLowerCase()
    )
    
    if (exactMatch) {
      console.log('[EXTRACT-USER] ✅ Exact match found:', exactMatch.id, `${exactMatch.first_name} ${exactMatch.last_name}`)
      return exactMatch.id
    }
    
    // Return first match if only one
    if (users.length === 1) {
      console.log('[EXTRACT-USER] ✅ Single match found:', users[0].id)
      return users[0].id
    }
    
    // If multiple matches, try to find best match by checking full name
    const bestMatch = users.find(u => {
      const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase()
      return fullName.includes(extractedName.toLowerCase())
    })
    
    const selectedId = bestMatch?.id || users[0].id
    console.log('[EXTRACT-USER] ✅ Selected user ID:', selectedId, 'from', users.length, 'matches')
    return selectedId
  } catch (error) {
    console.error('[EXTRACT-USER] ❌ Exception during user extraction:', error)
    return null
  }
}

interface ContactResolutionResult {
  contact: ContactData | null
  contactEmail: string | null
  contactName: string | null
  searchTerm: string | null
}

async function resolveContactReference(
  client: any,
  userId: string,
  userMessage: string,
  context?: ChatRequest['context']
): Promise<ContactResolutionResult> {
  let contact: ContactData | null = null
  let contactEmail: string | null = null
  let contactName: string | null = null
  let searchTerm: string | null = null

  // Context contactId takes priority
  if (context?.contactId && isValidUUID(context.contactId)) {
    const { data } = await client
      .from('contacts')
      .select('id, first_name, last_name, full_name, email, company_id, companies:company_id(id, name)')
      .eq('id', context.contactId)
      .eq('owner_id', userId)
      .maybeSingle()
    if (data) {
      contact = data as ContactData
    }
  }

  const emailPattern = /[\w\.-]+@[\w\.-]+\.\w+/
  const emailMatch = userMessage.match(emailPattern)
  if (emailMatch) {
    contactEmail = emailMatch[0].toLowerCase()
    if (!contact) {
      const { data } = await client
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, company_id, companies:company_id(id, name)')
        .eq('email', contactEmail)
        .eq('owner_id', userId)
        .maybeSingle()
      if (data) {
        contact = data as ContactData
      }
    }
  }

  if (!contact) {
    const { nameCandidate, companyCandidate } = extractNameAndCompanyFromMessage(userMessage)
    if (nameCandidate) {
      searchTerm = nameCandidate
      let contactsQuery = client
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, company_id, companies:company_id(id, name)')
        .eq('owner_id', userId)
      const nameParts = nameCandidate.split(/\s+/).filter(Boolean)
      if (nameParts.length > 1) {
        const first = nameParts[0]
        const last = nameParts.slice(1).join(' ')
        contactsQuery = contactsQuery.or(`full_name.ilike.%${nameCandidate}%,first_name.ilike.%${first}%,last_name.ilike.%${last}%`)
      } else {
        contactsQuery = contactsQuery.or(`first_name.ilike.%${nameCandidate}%,full_name.ilike.%${nameCandidate}%`)
      }
      if (companyCandidate) {
        contactsQuery = contactsQuery.ilike('companies.name', `%${companyCandidate}%`)
      }
      const { data: contacts } = await contactsQuery.limit(5)
      if (contacts && contacts.length > 0) {
        contact = contacts[0] as ContactData
      }
    }
  }

  if (contact && contact.email) {
    contactEmail = contact.email
  }

  if (!contactName) {
    contactName = contact?.full_name || `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || searchTerm || contactEmail
  }

  return {
    contact,
    contactEmail,
    contactName,
    searchTerm
  }
}

function extractNameAndCompanyFromMessage(
  message: string
): { nameCandidate: string | null; companyCandidate: string | null } {
  const atPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+at\s+([A-Z][\w& ]+)/i
  const atMatch = message.match(atPattern)
  if (atMatch && atMatch[1]) {
    return {
      nameCandidate: atMatch[1].trim(),
      companyCandidate: atMatch[2]?.trim() || null
    }
  }

  const patterns = [
    /emails?\s+from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
    /emails?\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
    /with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
    /about\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
    /regarding\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match && match[1]) {
      return { nameCandidate: match[1].trim(), companyCandidate: null }
    }
  }

  return { nameCandidate: null, companyCandidate: null }
}

function extractEmailLimitFromMessage(message: string): number {
  const limitPattern = /last\s+(\d+)\s+emails?/i
  const fallbackPattern = /(\d+)\s+(?:recent|latest)\s+emails?/i
  const match = message.match(limitPattern) || message.match(fallbackPattern)
  if (match && match[1]) {
    const parsed = parseInt(match[1], 10)
    if (!isNaN(parsed)) {
      return Math.min(Math.max(parsed, 3), 20)
    }
  }
  return 10
}

function detectEmailDirection(messageLower: string): 'sent' | 'received' | 'both' {
  if (
    messageLower.includes('emails to') ||
    messageLower.includes('email to') ||
    messageLower.includes('that i sent') ||
    messageLower.includes('i sent') ||
    messageLower.includes('from me')
  ) {
    return 'sent'
  }
  if (
    messageLower.includes('emails from') ||
    messageLower.includes('email from') ||
    messageLower.includes('from ') && messageLower.includes('email')
  ) {
    return 'received'
  }
  return 'both'
}

function extractDateRangeFromMessage(
  messageLower: string
): { startDate?: string | null; endDate?: string | null } {
  const now = new Date()
  const startOfDay = (date: Date) => {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d
  }
  const endOfDay = (date: Date) => {
    const d = new Date(date)
    d.setHours(23, 59, 59, 999)
    return d
  }
  const subtractDays = (days: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - days)
    return d
  }

  if (messageLower.includes('today')) {
    return { startDate: startOfDay(now).toISOString(), endDate: endOfDay(now).toISOString() }
  }

  if (messageLower.includes('yesterday')) {
    const yesterday = subtractDays(1)
    return { startDate: startOfDay(yesterday).toISOString(), endDate: endOfDay(yesterday).toISOString() }
  }

  const daysMatch = messageLower.match(/last\s+(\d+)\s+days?/)
  if (daysMatch && daysMatch[1]) {
    const days = parseInt(daysMatch[1], 10)
    if (!isNaN(days)) {
      return { startDate: subtractDays(days).toISOString(), endDate: null }
    }
  }

  if (messageLower.includes('last week')) {
    return { startDate: subtractDays(7).toISOString(), endDate: null }
  }

  if (messageLower.includes('last two weeks')) {
    return { startDate: subtractDays(14).toISOString(), endDate: null }
  }

  if (messageLower.includes('last month')) {
    return { startDate: subtractDays(30).toISOString(), endDate: null }
  }

  return {}
}

function extractLabelFromMessage(message: string): string | null {
  const quotedLabel = message.match(/label\s+(?:named\s+)?["']([^"']+)["']/i)
  if (quotedLabel && quotedLabel[1]) {
    return quotedLabel[1].trim()
  }

  const simpleLabel = message.match(/label\s+(?:called\s+)?([A-Za-z0-9 \-_]+)/i)
  if (simpleLabel && simpleLabel[1]) {
    const label = simpleLabel[1].trim()
    if (label) {
      // Remove trailing question words
      return label.replace(/\?$/, '').trim()
    }
  }

  return null
}

/**
 * Check if a message is asking about calendar availability
 */
function isAvailabilityQuestion(messageLower: string): boolean {
  if (!messageLower) return false

  const triggerPhrases = [
    'when am i free',
    'when am i available',
    'when do i have time',
    'when can i meet',
    'find a free slot',
    'find availability',
    'free on',
    'free next',
    'available on',
    'available next',
    'do i have time',
    'open slots',
    'open time',
    'find time to meet',
    'find time next week'
  ]

  // Calendar event queries (what's on calendar, what meetings, etc.)
  const calendarEventPhrases = [
    'what\'s on my calendar',
    'what\'s on my schedule',
    'what meetings',
    'what events',
    'show me my calendar',
    'show me my schedule',
    'calendar on',
    'schedule on',
    'meetings on',
    'events on'
  ]

  const weekdayKeywords = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const containsTrigger = triggerPhrases.some(phrase => messageLower.includes(phrase))
  const containsCalendarEvent = calendarEventPhrases.some(phrase => messageLower.includes(phrase))
  const mentionsFree = messageLower.includes('free') || messageLower.includes('availability') || messageLower.includes('available')
  const mentionsWeekday = weekdayKeywords.some(day => messageLower.includes(day))
  const mentionsRelativeWeek = messageLower.includes('next week') || messageLower.includes('this week')
  
  return containsTrigger || containsCalendarEvent || (mentionsFree && (mentionsWeekday || mentionsRelativeWeek))
}

/**
 * Check if a message is asking for "prep/brief me on my next meeting".
 * We treat this as a deterministic workflow: find the next upcoming calendar event and generate a meeting_prep panel.
 */
function isNextMeetingPrepQuestion(messageLower: string): boolean {
  if (!messageLower) return false

  const hasNextMeeting = messageLower.includes('next meeting') || messageLower.includes('upcoming meeting')
  const hasPrepVerb =
    messageLower.includes('prep') ||
    messageLower.includes('prepare') ||
    messageLower.includes('brief') ||
    messageLower.includes('briefing')

  // Common exact phrasing from the UI
  if (messageLower.includes('prep me for my next meeting')) return true
  if (messageLower.includes('brief me on my next meeting')) return true

  return hasNextMeeting && hasPrepVerb
}

/**
 * Lightweight detection for "show/search my meetings" questions where the user
 * primarily wants their calendar meetings list for today/tomorrow.
 *
 * This is designed to be deterministic (skip model) because it’s a pure data fetch
 * + structured UI render.
 */
function isMeetingsForPeriodQuestion(messageLower: string): boolean {
  if (!messageLower) return false

  const mentionsMeetings =
    messageLower.includes('meeting') ||
    messageLower.includes('meetings') ||
    messageLower.includes('calendar') ||
    messageLower.includes('schedule') ||
    messageLower.includes('what do i have') ||
    messageLower.includes("what's on") ||
    messageLower.includes('what have i got')

  const intentPhrases = [
    'search meetings',
    'show meetings',
    'what meetings',
    'my meetings',
    'my calendar',
    'my schedule',
    "what's on my calendar",
    "what's on my schedule",
    'what do i have today',
    'what do i have tomorrow',
    'meetings today',
    'meetings tomorrow',
    'schedule today',
    'schedule tomorrow',
    'what about monday',
    'what about tuesday',
    'what about wednesday',
    'what about thursday',
    'what about friday',
    'what about saturday',
    'what about sunday',
  ]

  const hasIntent = intentPhrases.some((p) => messageLower.includes(p))
  
  // Time period detection - today, tomorrow, or day of week
  const timePeriods = ['today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'this week', 'next week']
  const mentionsTimePeriod = timePeriods.some(period => messageLower.includes(period))

  // If they clearly asked for meetings/schedule and anchored it to a time period, treat as deterministic.
  if (mentionsMeetings && mentionsTimePeriod) return true
  return mentionsMeetings && hasIntent
}

function getMeetingsForPeriodPeriod(messageLower: string): string {
  // Check for day of week first
  const dayOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .find(day => messageLower.includes(day))
  if (dayOfWeek) return dayOfWeek
  
  // Check for week periods
  if (messageLower.includes('this week')) return 'this_week'
  if (messageLower.includes('next week')) return 'next_week'
  
  // Default to today/tomorrow
  return messageLower.includes('tomorrow') ? 'tomorrow' : 'today'
}

/**
 * Detection for "create follow-ups" / "post-meeting follow-up pack" requests.
 * These map cleanly onto the demo-grade `seq-post-meeting-followup-pack` sequence.
 */
function isPostMeetingFollowUpPackQuestion(messageLower: string): boolean {
  if (!messageLower) return false

  const phrases = [
    'follow-up pack',
    'follow up pack',
    'post-meeting follow-up',
    'post meeting follow up',
    'post-meeting followup',
    'post meeting followup',
    'create follow-ups',
    'create follow ups',
    'write follow-up',
    'write follow up',
    'send follow-up',
    'send follow up',
    'send recap',
    'write recap',
    'after the meeting',
  ]

  return phrases.some((p) => messageLower.includes(p))
}

/**
 * Detection for "catch me up" / "brief me" / "what's happening" requests.
 * These trigger the seq-catch-me-up sequence for a time-aware daily briefing.
 */
function isCatchMeUpQuestion(messageLower: string): boolean {
  if (!messageLower) return false

  const phrases = [
    'catch me up',
    'catch up',
    'brief me',
    'bring me up to speed',
    "what's happening",
    "what's going on",
    'what did i miss',
    "what's new",
    'my day',
    'daily brief',
    'daily briefing',
    'morning brief',
    'morning briefing',
    'start my day',
    'end of day',
    'eod update',
    'eod summary',
    'wrap up my day',
  ]

  return phrases.some((p) => messageLower.includes(p))
}

/**
 * Detection for "email follow-ups" / "check my inbox" / "unanswered emails" requests.
 * These trigger the seq-followup-zero-inbox sequence for email triage and reply drafts.
 */
function isEmailZeroInboxQuestion(messageLower: string): boolean {
  if (!messageLower) return false

  const phrases = [
    'email follow-ups',
    'email follow ups',
    'email followups',
    'check my inbox',
    'check my emails',
    'unanswered emails',
    'emails i need to respond',
    'emails needing response',
    'emails i missed',
    'missed emails',
    'pending emails',
    'email backlog',
    'zero inbox',
    'inbox zero',
    'clear my inbox',
    'help with emails',
    'help me with emails',
    'what emails need',
    'which emails need',
    'emails to reply',
    'reply to emails',
  ]

  return phrases.some((p) => messageLower.includes(p))
}

/**
 * Detection for "what deals should I focus on" / "pipeline priorities" requests.
 * These trigger the seq-pipeline-focus-tasks sequence for deal prioritization.
 */
function isPipelineFocusQuestion(messageLower: string): boolean {
  if (!messageLower) return false

  // Explicit phrases first
  const phrases = [
    'deals should i focus',
    'deals to focus',
    'pipeline focus',
    'pipeline priorities',
    'which deals',
    'what deals need',
    'prioritize deals',
    'prioritize my deals',
    'deal priorities',
    'focus deals',
    'deals needing attention',
    'stale deals',
    'deals at risk',
    'deals closing soon',
    'high priority deals',
    'top deals',
    'help me with deals',
    // V1 workflow button text - "What needs attention?" quick action
    'what needs attention',
    'needs attention',
    'what should i focus on',
    'what do i need to focus on',
  ]

  if (phrases.some((p) => messageLower.includes(p))) return true

  // Composite detection: (deal/pipeline) + (focus/prioritize/attention)
  const hasDealOrPipeline = messageLower.includes('deal') || messageLower.includes('pipeline')
  const hasFocusIntent =
    messageLower.includes('focus') ||
    messageLower.includes('priorit') ||
    messageLower.includes('attention') ||
    messageLower.includes('should i')

  return hasDealOrPipeline && hasFocusIntent
}

// =============================================================================
// Hybrid Escalation Rules (US-015)
// Determines whether to use chat-first or agent-first (plan→execute) mode
// =============================================================================

interface EscalationDecision {
  decision: 'chat' | 'agent'
  reasons: string[]
  complexity: 'simple' | 'moderate' | 'complex'
}

/**
 * Analyze user message to determine if it should escalate to agent mode.
 * 
 * Escalation criteria:
 * - Multi-entity: Request involves multiple distinct entities (deals AND contacts AND tasks)
 * - Write operations: Request explicitly asks to create/update/delete data
 * - Multi-step: Request implies a sequence of dependent operations
 * - Conditional logic: Request has if/then/else requirements
 * 
 * Chat-first (simple) queries:
 * - Questions about data (read-only)
 * - V1 deterministic workflows
 * - Single entity focus
 * - Status/summary requests
 */
function analyzeEscalationCriteria(
  message: string, 
  messageLower: string, 
  context?: { contactId?: string; dealIds?: string[]; currentView?: string }
): EscalationDecision {
  const reasons: string[] = []
  let complexityScore = 0
  
  // ---------------------------------------------------------------------------
  // Multi-entity detection
  // ---------------------------------------------------------------------------
  const entityMentions = {
    contacts: /\b(contact|person|people|stakeholder|attendee|participant)\b/i.test(message),
    deals: /\b(deal|opportunity|pipeline|contract|proposal)\b/i.test(message),
    tasks: /\b(task|todo|action item|reminder|follow.?up)\b/i.test(message),
    emails: /\b(email|mail|message|send|draft)\b/i.test(message),
    meetings: /\b(meeting|call|event|calendar|schedule)\b/i.test(message),
    slack: /\b(slack|post|notify|alert|channel)\b/i.test(message)
  }
  
  const entityCount = Object.values(entityMentions).filter(Boolean).length
  if (entityCount >= 3) {
    reasons.push('multi-entity (3+ entity types)')
    complexityScore += 3
  } else if (entityCount === 2) {
    complexityScore += 1
  }
  
  // ---------------------------------------------------------------------------
  // Write operation detection
  // ---------------------------------------------------------------------------
  const writePatterns = [
    /\b(create|add|make|new|generate)\s+(a\s+)?(task|deal|contact|note|activity)/i,
    /\b(update|change|modify|edit|set)\s+(the\s+)?(status|stage|value|name|priority)/i,
    /\b(delete|remove|cancel|archive)\s+(the\s+)?(task|deal|meeting)/i,
    /\bsend\s+(an?\s+)?(email|message|slack|notification)/i,
    /\b(move|advance|push)\s+(the\s+)?deal/i,
    /\b(assign|reassign|transfer)\s+to\b/i
  ]
  
  const hasWriteOperation = writePatterns.some(p => p.test(message))
  if (hasWriteOperation) {
    reasons.push('write operation detected')
    complexityScore += 2
  }
  
  // ---------------------------------------------------------------------------
  // Multi-step operation detection
  // ---------------------------------------------------------------------------
  const multiStepPatterns = [
    /\band\s+then\b/i,
    /\bafter\s+that\b/i,
    /\bfirst\s+.+then\b/i,
    /\bfor\s+each\b/i,
    /\ball\s+(my\s+)?(contacts|deals|tasks)\b/i,
    /\bevery\s+(contact|deal|task)\b/i,
    /\bbulk\b/i,
    /\bbatch\b/i,
    /\bmultiple\s+(contacts|deals|tasks)\b/i
  ]
  
  const hasMultiStep = multiStepPatterns.some(p => p.test(message))
  if (hasMultiStep) {
    reasons.push('multi-step workflow')
    complexityScore += 2
  }
  
  // ---------------------------------------------------------------------------
  // Conditional logic detection
  // ---------------------------------------------------------------------------
  const conditionalPatterns = [
    /\bif\s+.+then\b/i,
    /\bwhen\s+.+notify\b/i,
    /\bunless\b/i,
    /\bdepending\s+on\b/i,
    /\bbased\s+on\s+(the|their)\b/i,
    /\bonly\s+if\b/i
  ]
  
  const hasConditional = conditionalPatterns.some(p => p.test(message))
  if (hasConditional) {
    reasons.push('conditional logic')
    complexityScore += 2
  }
  
  // ---------------------------------------------------------------------------
  // Chat-first (simple) indicators - reduce complexity score
  // ---------------------------------------------------------------------------
  const simplePatterns = [
    /^(what|who|when|where|how many|show me|tell me|list|find)\b/i,
    /\b(summary|overview|status|update me|catch me up)\b/i,
    /\?$/,  // Questions
  ]
  
  const isLikelySimple = simplePatterns.some(p => p.test(message.trim()))
  if (isLikelySimple && !hasWriteOperation) {
    complexityScore = Math.max(0, complexityScore - 1)
  }
  
  // ---------------------------------------------------------------------------
  // Decision logic
  // ---------------------------------------------------------------------------
  let complexity: 'simple' | 'moderate' | 'complex'
  let decision: 'chat' | 'agent'
  
  if (complexityScore >= 4) {
    complexity = 'complex'
    decision = 'agent'
    reasons.push('complexity threshold exceeded')
  } else if (complexityScore >= 2) {
    complexity = 'moderate'
    // Moderate complexity: use chat with sequence support
    decision = 'chat'
  } else {
    complexity = 'simple'
    decision = 'chat'
  }
  
  // If no specific reasons and simple, just indicate it's a basic query
  if (reasons.length === 0) {
    reasons.push('simple query')
  }
  
  return { decision, reasons, complexity }
}

/**
 * Unified V1 Workflow Router
 * Maps user intent to one of the 5 deterministic V1 workflows.
 * Returns null if no V1 workflow matches (falls back to Gemini reasoning).
 *
 * EXC-001: Enhanced with confidence scoring and synonym support.
 * Only routes to V1 workflows when confidence >= MEDIUM_THRESHOLD.
 */
interface V1WorkflowRoute {
  workflow: 'next_meeting_prep' | 'post_meeting_followup' | 'email_zero_inbox' | 'pipeline_focus' | 'catch_me_up' | 'meetings_for_period'
  sequenceKey: string
  sequenceContext: Record<string, any>
  confidence?: 'high' | 'medium' | 'low'
  matchedPatterns?: string[]
}

// EXC-001: Confidence scoring thresholds
const V1_CONFIDENCE_THRESHOLDS = {
  HIGH: 0.9,    // Exact phrase match or multiple strong indicators
  MEDIUM: 0.6,  // Strong composite match
  LOW: 0.3,     // Partial match - not sufficient for routing
} as const

// EXC-001: Synonym mappings for better intent detection
const V1_SYNONYMS = {
  meeting: ['meeting', 'call', 'session', 'appointment', 'sync', 'standup', 'catch-up'],
  prepare: ['prep', 'prepare', 'brief', 'brief me', 'get ready', 'prepare me', 'help me prepare'],
  next: ['next', 'upcoming', 'scheduled', "today's", "tomorrow's"],
  focus: ['focus', 'prioritize', 'priority', 'attention', 'important', 'urgent', 'critical'],
  deal: ['deal', 'deals', 'pipeline', 'opportunity', 'opportunities', 'prospect', 'prospects'],
  catchup: ['catch me up', 'catch up', 'brief me', 'bring me up to speed', 'what did i miss', "what's new", "what's happening"],
  email: ['email', 'emails', 'inbox', 'messages', 'mail'],
  followup: ['follow-up', 'follow up', 'followup', 'recap', 'after the meeting', 'post-meeting', 'debrief'],
}

/**
 * Calculate confidence score for V1 workflow match
 * Returns score 0-1 and list of matched patterns
 */
function calculateV1Confidence(
  messageLower: string,
  exactPhrases: string[],
  compositeCheck: () => boolean,
  synonymGroups: (keyof typeof V1_SYNONYMS)[]
): { score: number; matchedPatterns: string[]; confidence: 'high' | 'medium' | 'low' } {
  const matchedPatterns: string[] = []
  let score = 0

  // Check exact phrase matches (highest confidence boost)
  for (const phrase of exactPhrases) {
    if (messageLower.includes(phrase)) {
      matchedPatterns.push(`exact:"${phrase}"`)
      score += 0.5
    }
  }

  // Check synonym matches
  for (const group of synonymGroups) {
    const synonyms = V1_SYNONYMS[group]
    for (const synonym of synonyms) {
      if (messageLower.includes(synonym)) {
        matchedPatterns.push(`synonym:${group}:"${synonym}"`)
        score += 0.15
        break // Only count one match per synonym group
      }
    }
  }

  // Composite check bonus
  if (compositeCheck()) {
    matchedPatterns.push('composite')
    score += 0.2
  }

  // Cap score at 1.0
  score = Math.min(score, 1.0)

  // Determine confidence level
  let confidence: 'high' | 'medium' | 'low'
  if (score >= V1_CONFIDENCE_THRESHOLDS.HIGH) {
    confidence = 'high'
  } else if (score >= V1_CONFIDENCE_THRESHOLDS.MEDIUM) {
    confidence = 'medium'
  } else {
    confidence = 'low'
  }

  return { score, matchedPatterns, confidence }
}

function routeToV1Workflow(messageLower: string, temporalContext?: TemporalContextPayload): V1WorkflowRoute | null {
  // EXC-001: Enhanced routing with confidence scoring
  // Order matters - more specific checks first

  console.log('[V1-ROUTER] Checking message:', messageLower.substring(0, 100))

  // Track all workflow matches with confidence
  const candidates: Array<V1WorkflowRoute & { score: number }> = []

  // 1. Next Meeting Prep - with confidence scoring
  const nextMeetingExact = [
    'prep me for my next meeting',
    'brief me on my next meeting',
    'prepare me for my next meeting',
    'get me ready for my next meeting',
    'help me prepare for my next call',
  ]
  const nextMeetingConf = calculateV1Confidence(
    messageLower,
    nextMeetingExact,
    () => {
      const hasNext = V1_SYNONYMS.next.some(s => messageLower.includes(s))
      const hasMeeting = V1_SYNONYMS.meeting.some(s => messageLower.includes(s))
      const hasPrep = V1_SYNONYMS.prepare.some(s => messageLower.includes(s))
      return hasNext && hasMeeting && hasPrep
    },
    ['meeting', 'prepare', 'next']
  )

  if (nextMeetingConf.confidence !== 'low') {
    candidates.push({
      workflow: 'next_meeting_prep',
      sequenceKey: 'seq-next-meeting-command-center',
      sequenceContext: {},
      confidence: nextMeetingConf.confidence,
      matchedPatterns: nextMeetingConf.matchedPatterns,
      score: nextMeetingConf.score,
    })
  }

  // 2. Post-Meeting Follow-Up Pack - with confidence scoring
  const followUpExact = [
    'follow-up pack', 'follow up pack', 'followup pack',
    'post-meeting follow-up', 'post meeting follow up',
    'create follow-ups', 'create follow ups',
    'write follow-up', 'send follow-up', 'send recap', 'write recap',
    'after the meeting', 'post-meeting followup', 'debrief',
  ]
  const followUpConf = calculateV1Confidence(
    messageLower,
    followUpExact,
    () => {
      const hasFollowup = V1_SYNONYMS.followup.some(s => messageLower.includes(s))
      const hasMeeting = V1_SYNONYMS.meeting.some(s => messageLower.includes(s))
      return hasFollowup && hasMeeting
    },
    ['followup', 'meeting']
  )

  if (followUpConf.confidence !== 'low') {
    candidates.push({
      workflow: 'post_meeting_followup',
      sequenceKey: 'seq-post-meeting-followup-pack',
      sequenceContext: {},
      confidence: followUpConf.confidence,
      matchedPatterns: followUpConf.matchedPatterns,
      score: followUpConf.score,
    })
  }

  // 3. Email Zero Inbox - with confidence scoring
  const emailExact = [
    'email follow-ups', 'email follow ups', 'email followups',
    'check my inbox', 'check my emails', 'unanswered emails',
    'emails i need to respond', 'emails needing response',
    'emails i missed', 'missed emails', 'pending emails', 'email backlog',
    'zero inbox', 'inbox zero', 'clear my inbox',
    'help with emails', 'help me with emails',
    'what emails need', 'which emails need', 'emails to reply', 'reply to emails',
  ]
  const emailConf = calculateV1Confidence(
    messageLower,
    emailExact,
    () => {
      const hasEmail = V1_SYNONYMS.email.some(s => messageLower.includes(s))
      const hasAction = messageLower.includes('respond') || messageLower.includes('reply') ||
                        messageLower.includes('check') || messageLower.includes('clear') ||
                        messageLower.includes('help')
      return hasEmail && hasAction
    },
    ['email']
  )

  if (emailConf.confidence !== 'low') {
    candidates.push({
      workflow: 'email_zero_inbox',
      sequenceKey: 'seq-followup-zero-inbox',
      sequenceContext: {},
      confidence: emailConf.confidence,
      matchedPatterns: emailConf.matchedPatterns,
      score: emailConf.score,
    })
  }

  // 4. Pipeline Focus - with confidence scoring
  // Note: Combined queries like "deals or tasks" should route to catch_me_up instead
  const pipelineExact = [
    'deals should i focus', 'deals to focus', 'pipeline focus',
    'pipeline priorities', 'which deals', 'what deals need',
    'prioritize deals', 'prioritize my deals', 'deal priorities',
    'focus deals', 'deals needing attention', 'stale deals',
    'deals at risk', 'deals closing soon', 'high priority deals', 'top deals',
    'help me with deals', 'what needs attention', 'needs attention',
    'what should i focus on', 'what do i need to focus on',
    'which opportunities', 'prioritize my pipeline',
    // Enhanced: More "attention" variations
    'need my attention', 'needs my attention', 'require attention', 'require my attention',
    'deals need attention', 'deals requiring attention', 'deals that need',
  ]
  const pipelineConf = calculateV1Confidence(
    messageLower,
    pipelineExact,
    () => {
      const hasDeal = V1_SYNONYMS.deal.some(s => messageLower.includes(s))
      const hasFocus = V1_SYNONYMS.focus.some(s => messageLower.includes(s))
      return hasDeal && hasFocus
    },
    ['deal', 'focus']
  )

  if (pipelineConf.confidence !== 'low') {
    candidates.push({
      workflow: 'pipeline_focus',
      sequenceKey: 'seq-pipeline-focus-tasks',
      sequenceContext: { period: 'this_week' },
      confidence: pipelineConf.confidence,
      matchedPatterns: pipelineConf.matchedPatterns,
      score: pipelineConf.score,
    })
  }

  // 5. Catch Me Up (daily brief) - with confidence scoring
  // This handles combined queries about multiple entity types (deals + tasks + meetings)
  const catchUpExact = [
    'catch me up', 'catch up', 'bring me up to speed',
    "what's happening", "what's going on", 'what did i miss', "what's new",
    'my day', 'daily brief', 'daily briefing',
    'morning brief', 'morning briefing', 'start my day',
    'end of day', 'eod update', 'eod summary', 'wrap up my day',
    'give me the highlights', 'give me a summary', 'what happened',
    // Enhanced: Combined attention queries (deals AND tasks)
    'deals or tasks', 'tasks or deals', 'deals and tasks', 'tasks and deals',
    'what needs my attention today', 'what requires my attention',
    'what should i focus on today', 'my priorities today',
    'what do i need to do today', 'what should i do today',
    'show me my priorities', 'show me what needs attention',
    'quick rundown', 'quick update', 'quick summary',
  ]
  const catchUpConf = calculateV1Confidence(
    messageLower,
    catchUpExact,
    () => {
      const hasCatchup = V1_SYNONYMS.catchup.some(s => messageLower.includes(s))
      // Also trigger for combined queries: "deals or tasks", attention + today
      const hasBothDealsAndTasks = (messageLower.includes('deal') || messageLower.includes('pipeline')) &&
                                    messageLower.includes('task')
      const hasAttentionToday = (messageLower.includes('attention') || messageLower.includes('focus') ||
                                  messageLower.includes('priorit')) &&
                                 (messageLower.includes('today') || messageLower.includes('now'))
      return hasCatchup || hasBothDealsAndTasks || hasAttentionToday
    },
    ['catchup']
  )

  if (catchUpConf.confidence !== 'low') {
    candidates.push({
      workflow: 'catch_me_up',
      sequenceKey: 'seq-catch-me-up',
      sequenceContext: {},
      confidence: catchUpConf.confidence,
      matchedPatterns: catchUpConf.matchedPatterns,
      score: catchUpConf.score,
    })
  }

  // 6. Meetings for period (today/tomorrow) - using existing detection
  if (isMeetingsForPeriodQuestion(messageLower)) {
    const period = getMeetingsForPeriodPeriod(messageLower)
    const timezone = temporalContext?.timezone || 'UTC'
    candidates.push({
      workflow: 'meetings_for_period',
      sequenceKey: '', // Uses direct action, not sequence
      sequenceContext: { period, timezone },
      confidence: 'high', // Existing logic is reliable
      matchedPatterns: ['legacy:isMeetingsForPeriodQuestion'],
      score: 0.9,
    })
  }

  // EXC-001: Select best candidate based on confidence score
  if (candidates.length === 0) {
    console.log('[V1-ROUTER] ❌ No V1 workflow matched - will call Gemini')
    return null
  }

  // Sort by score descending, pick highest
  candidates.sort((a, b) => b.score - a.score)
  const bestMatch = candidates[0]

  // Only route if confidence is at least medium
  if (bestMatch.confidence === 'low') {
    console.log('[V1-ROUTER] ⚠️ Best match has low confidence, falling back to Gemini', {
      workflow: bestMatch.workflow,
      score: bestMatch.score,
      matchedPatterns: bestMatch.matchedPatterns,
    })
    return null
  }

  console.log('[V1-ROUTER] ✅ Matched workflow with confidence:', {
    workflow: bestMatch.workflow,
    confidence: bestMatch.confidence,
    score: bestMatch.score.toFixed(2),
    matchedPatterns: bestMatch.matchedPatterns,
    alternativeCandidates: candidates.slice(1).map(c => ({
      workflow: c.workflow,
      score: c.score.toFixed(2),
    })),
  })

  // Return without score property (internal tracking only)
  const { score: _score, ...result } = bestMatch
  return result
}

// ============================================================================
// PROACTIVE-001: Clarifying Questions Flow
// ============================================================================

interface ClarifyingOption {
  id: number
  action: string
  description: string
  sequenceKey?: string
  skillKey?: string
}

interface ClarifyingQuestionsResult {
  needsClarification: boolean
  entityName?: string
  entityType?: 'deal' | 'contact' | 'company' | 'meeting'
  options: ClarifyingOption[]
  prompt?: string
}

/**
 * Detects when a user request is ambiguous and needs clarification.
 * Returns options for the user to choose from.
 * 
 * Triggers:
 * - "Help me with X" where X is a deal/contact/company name
 * - Short requests that could mean multiple things
 * - Entity references without clear action intent
 */
function detectAmbiguousRequest(
  messageLower: string,
  originalMessage: string,
  availableSequences: { skill_key: string; name: string }[]
): ClarifyingQuestionsResult {
  const result: ClarifyingQuestionsResult = {
    needsClarification: false,
    options: [],
  }

  // Pattern 1: "Help me with [entity]" or "I need help with [entity]"
  const helpPatterns = [
    /(?:help|assist|work on|look at|check on|update me on)\s+(?:me\s+)?(?:with\s+)?(?:the\s+)?([a-z0-9\s]+?)(?:\s+deal|\s+contact|\s+company)?$/i,
    /(?:what about|how about|tell me about)\s+(?:the\s+)?([a-z0-9\s]+)$/i,
    /^([a-z0-9\s]+)(?:\s+deal|\s+contact)?\s*\??$/i, // Just a name like "Acme?" or "John deal?"
  ]

  for (const pattern of helpPatterns) {
    const match = originalMessage.match(pattern)
    if (match && match[1]) {
      const entityName = match[1].trim()
      
      // Skip if it's clearly a specific request
      if (entityName.length < 2 || entityName.length > 50) continue
      
      // Skip if it already contains action words
      const actionWords = ['prep', 'prepare', 'brief', 'follow', 'email', 'call', 'schedule', 'create', 'update', 'delete']
      if (actionWords.some(w => messageLower.includes(w))) continue
      
      result.needsClarification = true
      result.entityName = entityName
      
      // Determine entity type from context
      if (messageLower.includes('deal')) {
        result.entityType = 'deal'
      } else if (messageLower.includes('contact') || messageLower.includes('person')) {
        result.entityType = 'contact'
      } else if (messageLower.includes('company') || messageLower.includes('account')) {
        result.entityType = 'company'
      }
      
      // Generate contextual options based on entity type and available sequences
      result.options = generateClarifyingOptions(entityName, result.entityType, availableSequences)
      
      result.prompt = generateClarifyingPrompt(entityName, result.entityType, result.options)
      
      break
    }
  }

  // Pattern 2: Single word or very short requests (under 15 chars, no clear action)
  if (!result.needsClarification && messageLower.length < 15 && !messageLower.includes(' ')) {
    // Could be a name lookup - don't trigger clarification for these, 
    // let resolve_entity handle it
  }

  return result
}

function generateClarifyingOptions(
  entityName: string,
  entityType: 'deal' | 'contact' | 'company' | 'meeting' | undefined,
  availableSequences: { skill_key: string; name: string }[]
): ClarifyingOption[] {
  const options: ClarifyingOption[] = []
  
  if (entityType === 'deal' || !entityType) {
    // Deal-focused options
    options.push({
      id: 1,
      action: 'Review deal health',
      description: `Check the status and health of the ${entityName} deal`,
      sequenceKey: 'seq-deal-rescue-pack',
    })
    options.push({
      id: 2,
      action: 'Draft a follow-up email',
      description: `Write a follow-up email for the ${entityName} opportunity`,
      sequenceKey: 'seq-post-meeting-followup-pack',
    })
  }
  
  if (entityType === 'contact' || !entityType) {
    // Contact-focused options
    options.push({
      id: options.length + 1,
      action: 'Prep for a meeting',
      description: `Get briefed before meeting with ${entityName}`,
      sequenceKey: 'seq-next-meeting-command-center',
    })
    options.push({
      id: options.length + 1,
      action: 'Research this contact',
      description: `Get background and talking points for ${entityName}`,
      skillKey: 'lead-research',
    })
  }
  
  if (entityType === 'company' || !entityType) {
    // Company-focused options
    options.push({
      id: options.length + 1,
      action: 'Analyze this company',
      description: `Deep research on ${entityName}`,
      skillKey: 'company-analysis',
    })
    options.push({
      id: options.length + 1,
      action: 'Check competitor positioning',
      description: `How we compare to/position against ${entityName}`,
      skillKey: 'competitor-intel',
    })
  }
  
  // Re-number options sequentially
  return options.slice(0, 4).map((opt, idx) => ({ ...opt, id: idx + 1 }))
}

function generateClarifyingPrompt(
  entityName: string,
  entityType: 'deal' | 'contact' | 'company' | 'meeting' | undefined,
  options: ClarifyingOption[]
): string {
  const typeLabel = entityType || 'entity'
  
  let prompt = `I can help with **${entityName}**! What would you like to do?\n\n`
  
  for (const opt of options) {
    prompt += `${opt.id}. **${opt.action}** — ${opt.description}\n`
  }
  
  prompt += `\nJust reply with the number or tell me more about what you need.`
  
  return prompt
}

/**
 * Check if a message is a clarification response (e.g., "1", "option 2", "the first one")
 */
function isClarificationResponse(messageLower: string): { isResponse: boolean; selectedOption?: number } {
  // Direct number responses
  const numberMatch = messageLower.match(/^([1-4])$/)
  if (numberMatch) {
    return { isResponse: true, selectedOption: parseInt(numberMatch[1], 10) }
  }
  
  // "option X" or "number X"
  const optionMatch = messageLower.match(/(?:option|number|choice)\s*([1-4])/i)
  if (optionMatch) {
    return { isResponse: true, selectedOption: parseInt(optionMatch[1], 10) }
  }
  
  // "the first/second/third/fourth one"
  const ordinalMap: Record<string, number> = {
    first: 1, second: 2, third: 3, fourth: 4,
    '1st': 1, '2nd': 2, '3rd': 3, '4th': 4,
  }
  for (const [word, num] of Object.entries(ordinalMap)) {
    if (messageLower.includes(word)) {
      return { isResponse: true, selectedOption: num }
    }
  }
  
  return { isResponse: false }
}

/**
 * Detect intent from user message and structure response accordingly
 */
async function detectAndStructureResponse(
  userMessage: string,
  aiContent: string,
  client: any,
  userId: string,
  toolsUsed: string[] = [],
  requestingUserId?: string, // Admin user making the request
  context?: ChatRequest['context'],
  toolExecutions: ToolExecutionDetail[] = [] // Detailed tool execution metadata
): Promise<StructuredResponse | null> {
  const messageLower = userMessage.toLowerCase()
  
  // Store original message for limit extraction
  const originalMessage = userMessage

  // ---------------------------------------------------------------------------
  // OUTPUT FORMAT SELECTOR SKILL (platform_skills: output-format-selector)
  // ---------------------------------------------------------------------------
  // When keyword-based detection is insufficient, consult the output-format-selector
  // skill for optimal response type selection. The skill provides:
  // - Decision matrix mapping intent patterns to response types
  // - Time-awareness rules (morning/afternoon/evening briefings)
  // - Preview mode rules for write operations
  // - Sequence-to-response-type mappings
  //
  // To use: await executeSkillByKey('output-format-selector', { 
  //   userMessage, availableData: [...], timeOfDay 
  // })
  // Returns: { recommended_type, confidence, reasoning, required_data, preview_mode }
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Sequence-aware structured responses (demo-grade panels)
  // If Copilot ran a sequence, convert it into a rich structured panel with
  // links + confirm buttons (instead of relying on plain text).
  // ---------------------------------------------------------------------------
  if (toolExecutions && toolExecutions.length > 0) {
    console.log('[STRUCTURED] Processing toolExecutions:', {
      count: toolExecutions.length,
      tools: toolExecutions.map((e: any) => ({ 
        name: e.toolName, 
        success: e.success, 
        action: e.args?.action,
        hasResult: !!e.result 
      }))
    })
    
    // Find sequence executions - also include failed ones for better error handling
    const allSeqExecs = toolExecutions
      .filter((e) => e.toolName === 'execute_action' && (e as any).args?.action === 'run_sequence')
    
    const runSeqExec = allSeqExecs.slice(-1)[0] as any

    const seqKey = runSeqExec?.args?.params?.sequence_key
      ? String(runSeqExec.args.params.sequence_key)
      : null

    // Try multiple paths for the result data
    const seqResult = runSeqExec?.result?.data || runSeqExec?.result || null
    const finalOutputs = seqResult?.final_output?.outputs || seqResult?.outputs || null

    // Handle sequence results - check seqKey first, then try to extract outputs
    if (seqKey) {
      // Log for debugging
      console.log('[STRUCTURED] Processing sequence response:', { 
        seqKey, 
        runSeqSuccess: runSeqExec?.success,
        hasResult: !!seqResult,
        hasFinalOutputs: !!finalOutputs,
        outputKeys: finalOutputs ? Object.keys(finalOutputs) : [],
        resultKeys: seqResult ? Object.keys(seqResult) : [],
        resultError: runSeqExec?.result?.error || null
      })
      
      // Pipeline Focus Tasks
      if (seqKey === 'seq-pipeline-focus-tasks') {
        // Try multiple possible paths for deals data
        const dealsFromOutputs = finalOutputs?.pipeline_deals?.deals || 
                                  finalOutputs?.pipeline_deals ||
                                  seqResult?.pipeline_deals?.deals ||
                                  seqResult?.pipeline_deals ||
                                  []
        const deals = Array.isArray(dealsFromOutputs) ? dealsFromOutputs : []
        const topDeal = deals[0] || null
        const taskPreview = finalOutputs?.task_preview || seqResult?.task_preview || null

        console.log('[STRUCTURED] Pipeline Focus - extracted deals:', { 
          dealCount: deals.length, 
          hasTopDeal: !!topDeal,
          hasTaskPreview: !!taskPreview 
        })

        return {
          type: 'pipeline_focus_tasks',
          summary: deals.length > 0 
            ? `Here are the deals to focus on and the task I can create for you.`
            : 'Your pipeline looks healthy! No urgent deals need attention right now.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            deal: topDeal,
            taskPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'crm'],
          },
        }
      }

      // Deal Rescue Pack
      if (seqKey === 'seq-deal-rescue-pack') {
        const deal = Array.isArray(finalOutputs?.deal?.deals) ? finalOutputs.deal.deals[0] : null
        const plan = finalOutputs?.plan || null
        const taskPreview = finalOutputs?.task_previews || null

        return {
          type: 'deal_rescue_pack',
          summary: 'Here’s the deal diagnosis + rescue plan, and the task I can create.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            deal,
            plan,
            taskPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'crm'],
          },
        }
      }

      // Next Meeting Command Center
      if (seqKey === 'seq-next-meeting-command-center') {
        const nextMeeting = finalOutputs?.next_meeting?.meeting || null
        const prepTaskPreview = finalOutputs?.prep_task_preview || null

        return {
          type: 'next_meeting_command_center',
          summary: 'Here’s your next meeting brief and a prep checklist task ready to create.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            meeting: nextMeeting,
            brief: finalOutputs?.brief || null,
            prepTaskPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'calendar', 'crm'],
          },
        }
      }

      // Post-Meeting Follow-Up Pack
      if (seqKey === 'seq-post-meeting-followup-pack') {
        const meeting = Array.isArray(finalOutputs?.meeting_data?.meetings)
          ? finalOutputs.meeting_data.meetings[0]
          : null

        const contact = Array.isArray(finalOutputs?.contact_data?.contacts)
          ? finalOutputs.contact_data.contacts[0]
          : null

        return {
          type: 'post_meeting_followup_pack',
          summary: 'Here’s your follow-up pack (email, Slack update, and tasks) ready to send/create.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            meeting,
            contact,
            digest: finalOutputs?.digest || null,
            pack: finalOutputs?.pack || null,
            emailPreview: finalOutputs?.email_preview || null,
            slackPreview: finalOutputs?.slack_preview || null,
            taskPreview: finalOutputs?.task_preview || null,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'meetings', 'crm', 'email', 'messaging'],
          },
        }
      }

      // Deal MAP Builder
      if (seqKey === 'seq-deal-map-builder') {
        const deal = Array.isArray(finalOutputs?.deal?.deals) ? finalOutputs.deal.deals[0] : null
        const openTasks = finalOutputs?.open_tasks || null
        const plan = finalOutputs?.plan || null
        const taskPreview = finalOutputs?.task_previews || null

        return {
          type: 'deal_map_builder',
          summary: 'Here\'s a Mutual Action Plan (MAP) for this deal, with milestones and the top task ready to create.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            deal,
            openTasks,
            plan,
            taskPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'crm', 'tasks'],
          },
        }
      }

      // Daily Focus Plan
      if (seqKey === 'seq-daily-focus-plan') {
        const pipelineDeals = finalOutputs?.pipeline_deals || null
        const contactsNeedingAttention = finalOutputs?.contacts_needing_attention || null
        const openTasks = finalOutputs?.open_tasks || null
        const plan = finalOutputs?.plan || null
        const taskPreview = finalOutputs?.task_previews || null

        return {
          type: 'daily_focus_plan',
          summary: 'Here\'s your daily focus plan: priorities, next best actions, and the top task ready to create.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            pipelineDeals,
            contactsNeedingAttention,
            openTasks,
            plan,
            taskPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'crm', 'tasks'],
          },
        }
      }

      // Follow-Up Zero Inbox
      if (seqKey === 'seq-followup-zero-inbox') {
        const emailThreads = finalOutputs?.email_threads || null
        const triage = finalOutputs?.triage || null
        const replyDrafts = finalOutputs?.reply_drafts || null
        const emailPreview = finalOutputs?.email_preview || null
        const taskPreview = finalOutputs?.task_preview || null

        return {
          type: 'followup_zero_inbox',
          summary: 'Here are the email threads needing response, reply drafts, and a follow-up task ready to create.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            emailThreads,
            triage,
            replyDrafts,
            emailPreview,
            taskPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'email', 'crm', 'tasks'],
          },
        }
      }

      // Deal Slippage Guardrails
      if (seqKey === 'seq-deal-slippage-guardrails') {
        const atRiskDeals = finalOutputs?.at_risk_deals || null
        const diagnosis = finalOutputs?.diagnosis || null
        const taskPreview = finalOutputs?.task_preview || null
        const slackPreview = finalOutputs?.slack_preview || null

        return {
          type: 'deal_slippage_guardrails',
          summary: 'Here are the at-risk deals, rescue actions, and a rescue task + Slack update ready to create/post.',
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            atRiskDeals,
            diagnosis,
            taskPreview,
            slackPreview,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'crm', 'tasks', 'messaging'],
          },
        }
      }

      // Catch Me Up (Daily Brief) - US-004/US-005
      if (seqKey === 'seq-catch-me-up') {
        // Log what we received for debugging
        console.log('[STRUCTURED] seq-catch-me-up - finalOutputs keys:', finalOutputs ? Object.keys(finalOutputs) : 'null')
        console.log('[STRUCTURED] seq-catch-me-up - seqResult keys:', seqResult ? Object.keys(seqResult) : 'null')
        
        // Determine time of day for adaptive greeting
        const hour = new Date().getHours()
        const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
        
        // Extract data from sequence outputs with multiple fallback paths
        // The action results may be at different nesting levels
        const extractArray = (key: string, subKey: string) => {
          // Try finalOutputs.key.subKey first
          if (finalOutputs?.[key]?.[subKey] && Array.isArray(finalOutputs[key][subKey])) {
            return finalOutputs[key][subKey]
          }
          // Try finalOutputs.key directly if it's an array
          if (finalOutputs?.[key] && Array.isArray(finalOutputs[key])) {
            return finalOutputs[key]
          }
          // Try seqResult directly
          if (seqResult?.[key]?.[subKey] && Array.isArray(seqResult[key][subKey])) {
            return seqResult[key][subKey]
          }
          if (seqResult?.[key] && Array.isArray(seqResult[key])) {
            return seqResult[key]
          }
          return []
        }
        
        const meetingsToday = extractArray('meetings_today', 'meetings')
        const meetingsTomorrow = extractArray('meetings_tomorrow', 'meetings')
        const staleDeals = extractArray('stale_deals', 'deals')
        const closingSoonDeals = extractArray('closing_soon_deals', 'deals')
        const contactsNeedingAttention = extractArray('contacts_needing_attention', 'contacts')
        const pendingTasks = extractArray('pending_tasks', 'tasks')
        const dailyBrief = finalOutputs?.daily_brief || seqResult?.daily_brief || null
        
        console.log('[STRUCTURED] seq-catch-me-up - extracted counts:', {
          meetingsToday: meetingsToday.length,
          meetingsTomorrow: meetingsTomorrow.length,
          staleDeals: staleDeals.length,
          closingSoonDeals: closingSoonDeals.length,
          contacts: contactsNeedingAttention.length,
          tasks: pendingTasks.length,
        })
        
        // Merge stale and closing soon deals
        const priorityDeals = [...staleDeals, ...closingSoonDeals].slice(0, 5)
        
        // Generate greeting based on time of day
        const greeting = timeOfDay === 'morning' 
          ? "Good morning! Here's your day ahead."
          : timeOfDay === 'afternoon'
          ? "Here's your afternoon update."
          : "Wrapping up the day. Here's your summary."
        
        // Map meetings to expected format
        const schedule = meetingsToday.map((m: any) => ({
          id: m.id || '',
          title: m.title || m.summary || 'Meeting',
          startTime: m.start_time || m.meeting_start || '',
          endTime: m.end_time || m.meeting_end || '',
          attendees: m.attendees?.map((a: any) => a.email || a.name) || [],
          linkedDealId: m.deal_id || null,
          linkedDealName: m.deal_name || null,
          meetingUrl: m.meeting_url || m.conference_link || null,
        }))
        
        // Map deals to expected format
        const formattedDeals = priorityDeals.map((d: any) => ({
          id: d.id || '',
          name: d.name || '',
          value: d.value || d.amount || null,
          stage: d.stage_name || d.stage || null,
          daysStale: d.days_stale || d.days_since_activity || null,
          closeDate: d.expected_close_date || d.close_date || null,
          healthStatus: d.health_status || (d.days_stale > 7 ? 'stale' : 'healthy'),
          company: d.company_name || d.company || null,
          contactName: d.contact_name || null,
          contactEmail: d.contact_email || null,
        }))
        
        // Map contacts to expected format with rich action context
        const formattedContacts = contactsNeedingAttention.map((c: any) => ({
          id: c.id || '',
          name: c.full_name || c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
          email: c.email || null,
          company: c.company_name || c.company || null,
          lastContactDate: c.last_contact_date || c.last_activity_date || c.last_interaction_at || null,
          daysSinceContact: c.days_since_last_contact || null,
          healthStatus: c.health_status || 'unknown',
          riskLevel: c.risk_level || 'unknown',
          riskFactors: c.risk_factors || [],
          reason: c.reason || (c.risk_level === 'high' ? 'high risk' : c.health_status === 'ghost' ? 'going dark' : 'needs follow-up'),
        }))
        
        // Map tasks to expected format
        const formattedTasks = pendingTasks.map((t: any) => ({
          id: t.id || '',
          title: t.title || '',
          dueDate: t.due_date || null,
          priority: t.priority || 'medium',
          status: t.status || 'pending',
          linkedDealId: t.deal_id || null,
          linkedContactId: t.contact_id || null,
        }))
        
        // Generate summary
        const meetingCount = schedule.length
        const dealCount = formattedDeals.length
        const taskCount = formattedTasks.length
        const summary = dailyBrief?.summary || 
          `You have ${meetingCount} meeting${meetingCount !== 1 ? 's' : ''} today` +
          (dealCount > 0 ? `, ${dealCount} deal${dealCount !== 1 ? 's' : ''} needing attention` : '') +
          (taskCount > 0 ? `, and ${taskCount} pending task${taskCount !== 1 ? 's' : ''}` : '') +
          '.'

        return {
          type: 'daily_brief',
          summary,
          data: {
            sequenceKey: seqKey,
            isSimulation: seqResult?.is_simulation === true,
            executionId: seqResult?.execution_id,
            greeting,
            timeOfDay,
            schedule,
            priorityDeals: formattedDeals,
            contactsNeedingAttention: formattedContacts,
            tasks: formattedTasks,
            tomorrowPreview: timeOfDay === 'evening' ? meetingsTomorrow.map((m: any) => ({
              id: m.id || '',
              title: m.title || m.summary || 'Meeting',
              startTime: m.start_time || m.meeting_start || '',
            })) : undefined,
            summary,
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['sequence', 'calendar', 'crm', 'tasks'],
          },
        }
      }
    }
  }
  
  // ---------------------------------------------------------------------------
  // Meetings list (today/tomorrow) from get_meetings_for_period
  // ---------------------------------------------------------------------------
  if (toolExecutions && toolExecutions.length > 0) {
    const meetingsForPeriodExec = toolExecutions
      .filter((e: any) => e?.toolName === 'execute_action' && e?.success && e?.args?.action === 'get_meetings_for_period')
      .slice(-1)[0] as any

    const raw = meetingsForPeriodExec?.result?.data || null
    const rawMeetings = Array.isArray(raw?.meetings) ? raw.meetings : []

    if (raw && rawMeetings.length >= 0) {
      // Best-effort user domain detection for external/internal labeling
      let userEmailDomain: string | null = null
      try {
        const { data: profile } = await client
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .maybeSingle()
        const email = profile?.email ? String(profile.email) : ''
        const domain = email.includes('@') ? email.split('@')[1] : ''
        userEmailDomain = domain || null
      } catch {
        userEmailDomain = null
      }

      // Support today, tomorrow, and day-of-week periods
      const rawPeriod = raw?.period ? String(raw.period).toLowerCase() : 'today'
      const validPeriods = ['today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'this_week', 'next_week']
      const period = validPeriods.includes(rawPeriod) ? rawPeriod : 'today'
      
      // Generate human-readable label
      const periodLabels: Record<string, string> = {
        today: 'today',
        tomorrow: 'tomorrow',
        monday: 'Monday',
        tuesday: 'Tuesday',
        wednesday: 'Wednesday',
        thursday: 'Thursday',
        friday: 'Friday',
        saturday: 'Saturday',
        sunday: 'Sunday',
        this_week: 'this week',
        next_week: 'next week',
      }
      const periodLabel = periodLabels[period] || period

      const meetings = rawMeetings.map((m: any) => {
        const attendeesRaw = Array.isArray(m.attendees) ? m.attendees : []
        const organizerEmail = m.organizer_email ? String(m.organizer_email) : null

        const attendees = attendeesRaw
          .map((a: any) => {
            const email = a?.email ? String(a.email) : ''
            const name = a?.name ? String(a.name) : undefined

            const isOrganizer = organizerEmail ? email.toLowerCase() === organizerEmail.toLowerCase() : false
            const isExternal = userEmailDomain
              ? !email.toLowerCase().endsWith(`@${userEmailDomain.toLowerCase()}`)
              : false

            // Optional contact linking if available from include_context enrichment
            const ctx = Array.isArray(m.attendeeContext) ? m.attendeeContext : []
            const ctxMatch = ctx.find((x: any) => x?.email && String(x.email).toLowerCase() === email.toLowerCase())
            const crmContactId = ctxMatch?.contactId ? String(ctxMatch.contactId) : undefined

            return {
              email,
              name,
              isExternal,
              isOrganizer,
              crmContactId,
            }
          })
          .filter((a: any) => !!a.email)

        const hasExternal = attendees.some((a: any) => a.isExternal === true)
        const meetingType = hasExternal ? 'sales' : 'internal'

        const statusRaw = m?.status ? String(m.status) : 'confirmed'
        const status =
          statusRaw === 'tentative' ? 'tentative' :
          statusRaw === 'cancelled' ? 'cancelled' :
          'confirmed'

        return {
          id: String(m.id),
          source: 'google_calendar',
          title: m?.title ? String(m.title) : 'Meeting',
          startTime: String(m.startTime || m.start_time || ''),
          endTime: String(m.endTime || m.end_time || ''),
          durationMinutes: Number(m.durationMinutes || m.duration_minutes || 0) || 0,
          attendees,
          location: m?.location ? String(m.location) : undefined,
          meetingUrl: m?.meetingUrl ? String(m.meetingUrl) : undefined,
          meetingType,
          status,
        }
      })

      const totalDurationMinutes = meetings.reduce((sum: number, m: any) => sum + (Number(m.durationMinutes) || 0), 0)
      const external = meetings.filter((m: any) => m.meetingType === 'sales').length
      const internal = meetings.length - external

      return {
        type: 'meeting_list',
        summary: `Here are your meetings for ${periodLabel}.`,
        data: {
          meetings,
          period,
          periodLabel,
          totalCount: meetings.length,
          totalDurationMinutes,
          breakdown: {
            internal,
            external,
            withDeals: 0,
          },
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['calendar'],
        },
      }
    }
  }

  if (isAvailabilityQuestion(messageLower)) {
    const availabilityStructured = await structureCalendarAvailabilityResponse(
      client,
      userId,
      userMessage,
      context?.temporalContext
    )
    if (availabilityStructured) {
      return availabilityStructured
    }
  }

  // Check if calendar_read was used (for specific event searches)
  if (toolExecutions && toolExecutions.length > 0) {
    const calendarReadExecution = toolExecutions.find(exec =>
      exec.toolName === 'calendar_read' && exec.success
    )

    if (calendarReadExecution && calendarReadExecution.result) {
      console.log('[CALENDAR-SEARCH] Found calendar_read execution, structuring response')
      const calendarStructured = await structureCalendarSearchResponse(
        client,
        userId,
        calendarReadExecution.result,
        userMessage,
        context?.temporalContext
      )
      if (calendarStructured) {
        return calendarStructured
      }
    }
  }

  // FIRST: Check if there are successful write operations (create/update/delete) in tool executions
  // If so, generate an action summary response instead of defaulting to pipeline/task summaries
  if (toolExecutions && toolExecutions.length > 0) {
    const writeOperations = toolExecutions.filter(exec => {
      if (!exec.success) return false
      const toolName = exec.toolName
      // Check if it's a write operation (create, update, delete)
      return toolName.includes('_create') || toolName.includes('_update') || toolName.includes('_delete')
    })
    
    if (writeOperations.length > 0) {
      console.log('[ACTION-SUMMARY] Found write operations, generating action summary:', writeOperations.map(e => e.toolName))
      const actionSummary = await structureActionSummaryResponse(client, userId, writeOperations, userMessage)
      if (actionSummary) {
        return actionSummary
      }
    }
  }
  
  // FIRST: Detect email draft requests (check BEFORE task creation to avoid "follow-up email" triggering task creation)
  const isEmailDraftRequest =
    (messageLower.includes('draft') && messageLower.includes('email')) ||
    (messageLower.includes('write') && messageLower.includes('email')) ||
    (messageLower.includes('follow-up') && messageLower.includes('email')) ||
    (messageLower.includes('follow up') && messageLower.includes('email')) ||
    (messageLower.includes('followup') && messageLower.includes('email')) ||
    messageLower.includes('email to') ||
    messageLower.includes('compose email') ||
    (messageLower.includes('send') && messageLower.includes('email'))

  if (isEmailDraftRequest) {
    console.log('[EMAIL-DRAFT] Detected email draft request:', userMessage)
    const structured = await structureEmailDraftResponse(client, userId, userMessage, aiContent, context)
    if (structured) {
      return structured
    }
  }

  // Detect task creation requests (check before activity creation)
  // IMPORTANT: Exclude requests that mention "email" to prevent "follow-up email" from creating a task
  const taskCreationKeywords = [
    'create a task', 'add a task', 'new task', 'create task', 'add task',
    'remind me to', 'remind me', 'remind to', 'remind',
    'schedule a task', 'set a task', 'task to',
    'todo to', 'to-do to', 'follow up with', 'follow-up with',
    'follow up', 'follow-up', 'followup'
  ]

  // Pipeline-focus task requests should NOT go through the contact-based task creation flow.
  // These should be handled by Copilot tools/sequences (e.g. seq-pipeline-focus-tasks).
  const isPipelineFocusTaskRequest =
    (messageLower.includes('deal') || messageLower.includes('deals') || messageLower.includes('pipeline')) &&
    (messageLower.includes('focus') || messageLower.includes('priorit')) &&
    (messageLower.includes('schedule') || messageLower.includes('task') || messageLower.includes('tasks')) &&
    (messageLower.includes('engage') || messageLower.includes('outreach') || messageLower.includes('follow up') || messageLower.includes('follow-up'))

  // If user is responding with an affirmative confirmation ("yes", "ok", "confirm", etc),
  // do not route into the generic contact-based task creation flow. This avoids the
  // "Select Contact" modal when the intent is to confirm a previously previewed workflow.
  const isAffirmativeConfirmation =
    /^(yes|yep|yeah|y|ok|okay|sure|do it|go ahead|confirm|approved|create it|create the task|yes create|yes create a task)\b/i.test(
      userMessage.trim()
    )

  // Exclude if the message is about email (e.g., "follow-up email")
  const isAboutEmail = messageLower.includes('email')

  const isTaskCreationRequest =
    !isAboutEmail && !isPipelineFocusTaskRequest && !isAffirmativeConfirmation && (
      taskCreationKeywords.some(keyword => messageLower.includes(keyword)) ||
      (messageLower.includes('task') && (messageLower.includes('create') || messageLower.includes('add') || messageLower.includes('for') || messageLower.includes('to'))) ||
      (messageLower.includes('remind') && (messageLower.includes('to') || messageLower.includes('me') || messageLower.includes('about'))) ||
      (messageLower.includes('follow') && (messageLower.includes('up') || messageLower.includes('with'))) ||
      (messageLower.includes('reminder') && (messageLower.includes('for') || messageLower.includes('about')))
    )

  if (isTaskCreationRequest) {
    const structured = await structureTaskCreationResponse(client, userId, userMessage)
    return structured
  }
  
  // Detect meeting PREP requests - these should NOT trigger activity creation
  // User wants to prepare FOR a meeting, not CREATE a meeting
  const meetingPrepKeywords = [
    'prep me for', 'prep for', 'prepare me for', 'prepare for',
    'brief me for', 'briefing for', 'brief me on', 'brief on',
    'ready for meeting', 'ready me for', 'get ready for',
    'meeting prep', 'meeting briefing', 'meeting preparation',
    'help me prepare', 'what should i know'
  ]
  const isMeetingPrepRequest = meetingPrepKeywords.some(keyword => messageLower.includes(keyword)) ||
    (messageLower.includes('prep') && messageLower.includes('meeting')) ||
    (messageLower.includes('prepare') && messageLower.includes('meeting')) ||
    (messageLower.includes('brief') && messageLower.includes('meeting'))

  // Detect proposal/activity creation requests (check before other detections)
  // EXCLUDE meeting prep requests - those should go to AI for skill-based handling
  const proposalKeywords = ['add a proposal', 'create proposal', 'add proposal', 'proposal for', 'new proposal']
  const meetingKeywords = ['add a meeting', 'create meeting', 'add meeting', 'meeting with', 'new meeting']
  const saleKeywords = ['add a sale', 'create sale', 'add sale', 'sale for', 'new sale']
  const outboundKeywords = ['add outbound', 'create outbound', 'outbound for', 'new outbound']

  const isProposalRequest = proposalKeywords.some(keyword => messageLower.includes(keyword)) ||
    (messageLower.includes('proposal') && (messageLower.includes('add') || messageLower.includes('create') || messageLower.includes('for')))
  // isMeetingRequest now excludes prep/briefing requests - let AI handle those with skills
  const isMeetingRequest = !isMeetingPrepRequest && (meetingKeywords.some(keyword => messageLower.includes(keyword)) ||
    (messageLower.includes('meeting') && (messageLower.includes('add') || messageLower.includes('create') || messageLower.includes('with'))))
  const isSaleRequest = saleKeywords.some(keyword => messageLower.includes(keyword)) ||
    (messageLower.includes('sale') && (messageLower.includes('add') || messageLower.includes('create') || messageLower.includes('for')))
  const isOutboundRequest = outboundKeywords.some(keyword => messageLower.includes(keyword)) ||
    (messageLower.includes('outbound') && (messageLower.includes('add') || messageLower.includes('create') || messageLower.includes('for')))
  
  if (isProposalRequest || isMeetingRequest || isSaleRequest || isOutboundRequest) {
    const activityType = isProposalRequest ? 'proposal' : isMeetingRequest ? 'meeting' : isSaleRequest ? 'sale' : 'outbound'
    const structured = await structureActivityCreationResponse(client, userId, userMessage, activityType)
    return structured
  }
  
  // Detect pipeline-related queries
  // Note: General "prioritize" questions are handled by task detection first
  const isPipelineQuery = 
    messageLower.includes('pipeline') ||
    messageLower.includes('deal') ||
    messageLower.includes('deals') ||
    (messageLower.includes('what should i prioritize') && (messageLower.includes('pipeline') || messageLower.includes('deal'))) ||
    messageLower.includes('needs attention') ||
    messageLower.includes('at risk') ||
    messageLower.includes('pipeline health') ||
    (messageLower.includes('show me my') && (messageLower.includes('deal') || messageLower.includes('pipeline')))
  
  if (isPipelineQuery && !isPipelineFocusTaskRequest) {
    const structured = await structurePipelineResponse(client, userId, aiContent, userMessage)
    return structured
  }
  
  // NOTE: Email draft detection moved to top of function (before task creation detection)
  // to ensure "follow-up email" triggers email drafting, not task creation

  const emailHistoryKeywords = [
    'last email',
    'last emails',
    'recent email',
    'recent emails',
    'emails from',
    'emails with',
    'emails have',
    'emails did',
    'email history',
    'communication history',
    'email thread',
    'gmail',
    'inbox',
    'messages from',
    'latest emails',
    'label'
  ]

  const genericEmailQuery =
    messageLower.includes('email') && (
      messageLower.includes('show') ||
      messageLower.includes('find') ||
      messageLower.includes('list') ||
      messageLower.includes('last') ||
      messageLower.includes('past') ||
      messageLower.includes('recent') ||
      messageLower.includes('what') ||
      messageLower.includes('have i had') ||
      messageLower.includes('label') ||
      messageLower.includes('this evening') ||
      messageLower.includes('tonight') ||
      messageLower.includes('today') ||
      messageLower.includes('hours')
    )

  const wantsEmailHistory =
    emailHistoryKeywords.some(keyword => messageLower.includes(keyword)) ||
    genericEmailQuery

  if (wantsEmailHistory) {
    const structured = await structureCommunicationHistoryResponse(client, userId, userMessage, context)
    if (structured) {
      return structured
    }
  }
  
  // Detect calendar/meeting queries
  const weekdayKeywords = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const calendarBaseKeywords = [
    'meeting',
    'calendar',
    'schedule',
    'availability',
    'free time',
    'free slot',
    'free slots',
    'when am i free',
    'am i free',
    'when am i available',
    'when am i open',
    'available on',
    'available next',
    'find time',
    'find availability',
    'book time',
    'open slot',
    'free this',
    'free next',
    'free on'
  ]
  const mentionsWeekday = weekdayKeywords.some(keyword => messageLower.includes(keyword))
  const mentionsFreeOrAvailable = messageLower.includes('free') || messageLower.includes('available')
  const isCalendarQuery =
    calendarBaseKeywords.some(keyword => messageLower.includes(keyword)) ||
    (mentionsFreeOrAvailable && mentionsWeekday) ||
    (mentionsFreeOrAvailable && messageLower.includes('next week')) ||
    (mentionsFreeOrAvailable && messageLower.includes('this week'))

  if (isCalendarQuery) {
    const availabilityKeywords = [
      'when am i free',
      'free this',
      'free on',
      'find time',
      'find availability',
      'availability',
      'free time',
      'open slot',
      'book time',
      'available on',
      'next free',
      'available slots'
    ]

    const wantsAvailability =
      availabilityKeywords.some(keyword => messageLower.includes(keyword)) ||
      (messageLower.includes('free') && (messageLower.includes('when') || messageLower.includes('what'))) ||
      messageLower.includes('free on') ||
      messageLower.includes('open time')

    if (wantsAvailability) {
      const structured = await structureCalendarAvailabilityResponse(
        client, 
        userId, 
        userMessage,
        context?.temporalContext
      )
      if (structured) {
        return structured
      }
    }

    return null
  }
  
  // Detect task queries - more comprehensive detection
  const taskKeywords = [
    'task', 'tasks', 'todo', 'to-do', 'to do',
    'high priority task', 'priority task', 'urgent task',
    'my task', 'my tasks', 'list task', 'list tasks',
    'show task', 'show tasks', 'what task', 'what tasks',
    'due today', 'overdue', 'pending task', 'completed task',
    'task list', 'task summary', 'task overview'
  ]
  
  const hasTaskKeyword = taskKeywords.some(keyword => messageLower.includes(keyword))
  
  // Also check for task-related phrases
  // General "prioritize" questions default to tasks (more actionable day-to-day)
  const taskPhrases = [
    (messageLower.includes('list') && (messageLower.includes('task') || messageLower.includes('priority') || messageLower.includes('todo'))),
    (messageLower.includes('show') && (messageLower.includes('task') || messageLower.includes('my task') || messageLower.includes('priority'))),
    (messageLower.includes('what') && (messageLower.includes('task') || messageLower.includes('todo'))),
    (messageLower.includes('high priority') && (messageLower.includes('task') || messageLower.includes('show') || messageLower.includes('list'))),
    (messageLower.includes('urgent') && (messageLower.includes('task') || messageLower.includes('todo'))),
    messageLower.includes('due today'),
    messageLower.includes('overdue task'),
    messageLower.includes('task backlog'),
    // General prioritize questions default to tasks
    messageLower.includes('what should i prioritize'),
    messageLower.includes('prioritize today'),
    messageLower.includes('what to prioritize')
  ]
  
  const hasTaskPhrase = taskPhrases.some(phrase => phrase === true)
  
  if (hasTaskKeyword || hasTaskPhrase) {
    const structured = await structureTaskResponse(client, userId, aiContent, userMessage)
    return structured
  }
  
  // Detect activity queries (non-task activities)
  if (
    messageLower.includes('activity') ||
    messageLower.includes('activities') ||
    (messageLower.includes('follow-up') && !messageLower.includes('task'))
  ) {
    // Activity responses would be structured here
    return null
  }
  
  // Detect lead queries
  if (
    messageLower.includes('lead') ||
    messageLower.includes('new contact') ||
    messageLower.includes('qualification')
  ) {
    // Lead responses would be structured here
    return null
  }
  
  // Detect contact/email queries - check for email addresses or contact lookups
  const emailPattern = /[\w\.-]+@[\w\.-]+\.\w+/
  const hasEmail = emailPattern.test(userMessage)
  const contactKeywords = ['contact', 'person', 'about', 'info on', 'tell me about', 'show me', 'lookup', 'find']
  const hasContactKeyword = contactKeywords.some(keyword => messageLower.includes(keyword))
  
  if (hasEmail || (hasContactKeyword && (messageLower.includes('@') || messageLower.includes('email')))) {
    // Extract email from message if present
    const emailMatch = userMessage.match(emailPattern)
    const contactEmail = emailMatch ? emailMatch[0] : null
    
    const structured = await structureContactResponse(client, userId, aiContent, contactEmail, userMessage)
    return structured
  }
  
  // Detect roadmap creation queries
  if (
    messageLower.includes('roadmap') ||
    messageLower.includes('add a roadmap') ||
    messageLower.includes('create roadmap') ||
    messageLower.includes('roadmap item') ||
    toolsUsed.includes('roadmap_create')
  ) {
    const structured = await structureRoadmapResponse(client, userId, aiContent, userMessage)
    return structured
  }
  
  // Detect sales coach/performance queries
  // Check for performance-related keywords OR user name patterns with performance context
  const hasPerformanceKeyword = 
    messageLower.includes('performance') ||
    messageLower.includes('how am i doing') ||
    messageLower.includes('how is my performance') ||
    messageLower.includes('sales coach') ||
    (messageLower.includes('compare') && (messageLower.includes('month') || messageLower.includes('period'))) ||
    (messageLower.includes('this month') && messageLower.includes('last month')) ||
    (messageLower.includes('this week') && (messageLower.includes('performance') || messageLower.includes('doing') || messageLower.includes('stats') || messageLower.includes('sales')))
  
  // Check for user name + performance pattern (e.g., "Phil's performance", "show me John's stats")
  // More flexible patterns to catch "Can you show me Phil's performance this week"
  const userNamePerformancePatterns = [
    /([A-Z][a-z]+)(?:'s|'|s)?\s+(?:performance|doing|performing|stats|data|results|sales)(?:\s+this\s+(?:week|month))?/i,
    /(?:can you show|show me|how is|what is|tell me about|view|see|i'd like to see)\s+([A-Z][a-z]+)(?:'s|'|s)?\s+(?:performance|doing|performing|stats|data|results|sales)(?:\s+this\s+(?:week|month))?/i,
    /([A-Z][a-z]+)(?:'s|'|s)?\s+(?:sales\s+)?performance(?:\s+this\s+(?:week|month))?/i
  ]
  
  const hasUserNamePerformancePattern = userNamePerformancePatterns.some(pattern => pattern.test(userMessage))
  
  if (hasPerformanceKeyword || hasUserNamePerformancePattern) {
    const structured = await structureSalesCoachResponse(client, userId, aiContent, userMessage, requestingUserId)
    return structured
  }

  // ============================================================
  // FALLBACK CLASSIFIER - Apply output-format-selector logic
  // When no specific pattern matches, detect broad intent categories
  // and return basic structured responses instead of plain text
  // ============================================================

  // Broad intent category detection
  const intentCategories = {
    meetings: [
      'meeting', 'meetings', 'call', 'calls', 'calendar', 'schedule',
      'appointment', 'sync', 'check-in', 'standup', 'demo', 'presentation'
    ],
    deals: [
      'deal', 'deals', 'pipeline', 'opportunity', 'opportunities',
      'forecast', 'revenue', 'close', 'closing', 'quota', 'stage', 'stages'
    ],
    tasks: [
      'task', 'tasks', 'todo', 'to-do', 'to do', 'reminder', 'reminders',
      'action item', 'action items', 'overdue', 'due'
    ],
    contacts: [
      'contact', 'contacts', 'person', 'people', 'relationship', 'relationships',
      'stakeholder', 'stakeholders', 'decision maker', 'champion'
    ],
    emails: [
      'email', 'emails', 'inbox', 'reply', 'replies', 'follow-up', 'follow up',
      'draft', 'message', 'outreach', 'communication'
    ],
    activities: [
      'activity', 'activities', 'log', 'logged', 'call log', 'note', 'notes',
      'proposal', 'proposals', 'outbound'
    ]
  }

  // Find the dominant category
  let detectedCategory: string | null = null
  let maxMatches = 0

  for (const [category, keywords] of Object.entries(intentCategories)) {
    const matches = keywords.filter(kw => messageLower.includes(kw)).length
    if (matches > maxMatches) {
      maxMatches = matches
      detectedCategory = category
    }
  }

  // If we detected a category, return a basic structured response
  if (detectedCategory && maxMatches > 0) {
    // Map categories to basic response types
    const categoryToResponseType: Record<string, string> = {
      meetings: 'meeting_list',
      deals: 'pipeline',
      tasks: 'task',
      contacts: 'contact',
      emails: 'email',
      activities: 'activity_breakdown'
    }

    const responseType = categoryToResponseType[detectedCategory]

    // Create a basic structured wrapper for the AI content
    // This ensures formatting rules are applied even when specific patterns don't match
    return {
      type: responseType || 'text_with_links',
      summary: aiContent.slice(0, 200), // First 200 chars as summary
      data: {
        content: aiContent,
        category: detectedCategory,
        fallbackApplied: true
      },
      actions: [],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['fallback_classifier'],
        confidence: Math.min(100, maxMatches * 30), // Confidence based on keyword matches
        warning: 'Structured using fallback classification. Specific patterns may provide richer responses.',
        detectedIntent: detectedCategory
      }
    }
  }

  return null
}

/**
 * Structure activity creation response with contact search
 */
async function structureActivityCreationResponse(
  client: any,
  userId: string,
  userMessage: string,
  activityType: 'proposal' | 'meeting' | 'sale' | 'outbound'
): Promise<any> {
  try {
    // Extract contact name from message
    // Patterns: "add proposal for Paul Lima", "create meeting with John Smith", etc.
    const namePatterns = [
      /(?:for|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)/, // Full name pattern
      /(?:proposal|meeting|sale|outbound)\s+(?:for|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
    ]
    
    let contactName: string | null = null
    for (const pattern of namePatterns) {
      const match = userMessage.match(pattern)
      if (match && match[1]) {
        contactName = match[1].trim()
        break
      }
    }
    
    // Extract date information
    const todayPattern = /(?:for|on)\s+(?:today|now)/i
    const tomorrowPattern = /(?:for|on)\s+tomorrow/i
    const datePattern = /(?:for|on)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i
    
    let activityDate: string | null = null
    if (todayPattern.test(userMessage)) {
      activityDate = new Date().toISOString()
    } else if (tomorrowPattern.test(userMessage)) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      activityDate = tomorrow.toISOString()
    } else if (datePattern.test(userMessage)) {
      const dateMatch = userMessage.match(datePattern)
      if (dateMatch && dateMatch[1]) {
        // Try to parse the date
        const parsedDate = new Date(dateMatch[1])
        if (!isNaN(parsedDate.getTime())) {
          activityDate = parsedDate.toISOString()
        }
      }
    }
    
    // If no date specified, default to today
    if (!activityDate) {
      activityDate = new Date().toISOString()
    }
    
    // If no contact name found, return contact selection response
    if (!contactName) {
      return {
        type: 'contact_selection',
        summary: `I'd like to help you create a ${activityType}. Please select the contact:`,
        data: {
          activityType,
          activityDate,
          requiresContactSelection: true,
          prefilledName: '',
          prefilledEmail: ''
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['user_message']
        }
      }
    }
    
    // Search for contacts matching the name
    const nameParts = contactName.split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''
    
    // Build search query
    let contactsQuery = client
      .from('contacts')
      .select('id, first_name, last_name, full_name, email, company_id, companies:company_id(id, name)')
      .eq('owner_id', userId)
    
    // Search by first and last name
    if (firstName && lastName) {
      contactsQuery = contactsQuery.or(`first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%,full_name.ilike.%${contactName}%`)
    } else if (firstName) {
      contactsQuery = contactsQuery.or(`first_name.ilike.%${firstName}%,full_name.ilike.%${firstName}%`)
    } else {
      // If no name parts, search by full name
      contactsQuery = contactsQuery.ilike('full_name', `%${contactName}%`)
    }
    
    const { data: contacts, error: contactsError } = await contactsQuery.limit(10)
    
    if (contactsError) {
      console.error('Error searching contacts:', contactsError)
      // Return contact selection response on error
      return {
        type: 'contact_selection',
        summary: `I'd like to help you create a ${activityType} for ${contactName}. Please select the contact:`,
        data: {
          activityType,
          activityDate,
          requiresContactSelection: true,
          prefilledName: contactName,
          prefilledEmail: ''
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['user_message']
        }
      }
    }
    
    // If no contacts found or multiple contacts found, return contact selection response
    if (!contacts || contacts.length === 0 || contacts.length > 1) {
      return {
        type: 'contact_selection',
        summary: contacts && contacts.length > 1
          ? `I found ${contacts.length} contacts matching "${contactName}". Please select the correct one:`
          : `I couldn't find a contact matching "${contactName}". Please select or create a contact:`,
        data: {
          activityType,
          activityDate,
          requiresContactSelection: true,
          prefilledName: contactName,
          prefilledEmail: '',
          suggestedContacts: contacts || []
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['contacts_search'],
          matchCount: contacts?.length || 0
        }
      }
    }
    
    // Single contact found - return success response with contact info
    const contact = contacts[0]
    return {
      type: 'activity_creation',
      summary: `I found ${contact.full_name || `${contact.first_name} ${contact.last_name}`.trim()}. Ready to create the ${activityType}.`,
      data: {
        activityType,
        activityDate,
        contact: {
          id: contact.id,
          name: contact.full_name || `${contact.first_name} ${contact.last_name}`.trim(),
          email: contact.email,
          company: contact.companies?.name || null,
          companyId: contact.company_id || null
        },
        requiresContactSelection: false
      },
      actions: [
        {
          id: 'create-activity',
          label: `Create ${activityType.charAt(0).toUpperCase() + activityType.slice(1)}`,
          type: 'primary',
          callback: 'create_activity',
          params: {
            type: activityType,
            date: activityDate,
            contactId: contact.id
          }
        }
      ],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['contacts_search'],
        matchCount: 1
      }
    }
  } catch (error) {
    console.error('Error in structureActivityCreationResponse:', error)
    // Return contact selection response on error
    return {
      type: 'contact_selection',
      summary: `I'd like to help you create a ${activityType}. Please select the contact:`,
      data: {
        activityType,
        activityDate: new Date().toISOString(),
        requiresContactSelection: true,
        prefilledName: '',
        prefilledEmail: ''
      },
      actions: [],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['error_fallback']
      }
    }
  }
}

/**
 * Structure email draft response with AI-generated content
 * Generates a complete email draft with context, suggestions, and actions
 */
async function structureEmailDraftResponse(
  client: any,
  userId: string,
  userMessage: string,
  aiContent: string,
  context: any
): Promise<any> {
  try {
    console.log('[EMAIL-DRAFT] Structuring email draft response for:', userMessage)

    // Detect if user wants email based on their last meeting
    const hasLastMeetingReference =
      /last meeting|recent meeting|recent call|today'?s meeting|our meeting|our call|the meeting|my meeting/i.test(userMessage)

    console.log('[EMAIL-DRAFT] Has last meeting reference:', hasLastMeetingReference)

    // Extract contact/recipient information from message
    const namePatterns = [
      /(?:email|write|draft|send).*(?:to|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /follow[- ]?up.*(?:with|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:'s|about|regarding)/i
    ]

    let recipientName: string | null = null
    for (const pattern of namePatterns) {
      const match = userMessage.match(pattern)
      if (match && match[1]) {
        recipientName = match[1].trim()
        break
      }
    }

    // Search for matching contact
    let contact: any = null
    let contactEmail: string | null = null
    let companyName: string | null = null

    if (recipientName) {
      const nameParts = recipientName.split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      let contactsQuery = client
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, company_id, companies:company_id(id, name)')
        .eq('owner_id', userId)

      if (firstName && lastName) {
        contactsQuery = contactsQuery.or(`first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%,full_name.ilike.%${recipientName}%`)
      } else if (firstName) {
        contactsQuery = contactsQuery.or(`first_name.ilike.%${firstName}%,full_name.ilike.%${firstName}%`)
      }

      const { data: contacts } = await contactsQuery.limit(1)

      if (contacts && contacts.length > 0) {
        contact = contacts[0]
        contactEmail = contact.email
        companyName = contact.companies?.name || null
        recipientName = contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
      }
    }

    // If user references "last meeting", fetch it with transcript/summary
    let lastMeeting: any = null
    if (hasLastMeetingReference) {
      console.log('[EMAIL-DRAFT] Fetching last meeting with transcript for user:', userId)

      // First try: Look for meetings with transcript/summary (no date filter - get most recent)
      const { data: meetings, error: meetingError } = await client
        .from('meetings')
        .select(`
          id, title, summary, transcript_text, meeting_start,
          meeting_action_items(id, title, completed),
          meeting_attendees(name, email, is_external)
        `)
        .eq('owner_user_id', userId)
        .or('transcript_text.not.is.null,summary.not.is.null')
        .order('meeting_start', { ascending: false })
        .limit(5)

      if (meetingError) {
        console.error('[EMAIL-DRAFT] Error fetching last meeting:', meetingError)
      } else if (meetings && meetings.length > 0) {
        // Pick the first meeting that actually has content
        lastMeeting = meetings.find((m: any) => m.transcript_text || m.summary) || meetings[0]
        console.log('[EMAIL-DRAFT] Found last meeting:', lastMeeting.title, '- Has summary:', !!lastMeeting.summary, '- Has transcript:', !!lastMeeting.transcript_text, '- Date:', lastMeeting.meeting_start)
      } else {
        // Fallback: Get ANY recent meeting even without transcript/summary
        console.log('[EMAIL-DRAFT] No meetings with content, trying any recent meeting...')
        const { data: anyMeetings } = await client
          .from('meetings')
          .select(`
            id, title, summary, transcript_text, meeting_start,
            meeting_action_items(id, title, completed),
            meeting_attendees(name, email, is_external)
          `)
          .eq('owner_user_id', userId)
          .order('meeting_start', { ascending: false })
          .limit(1)
        
        if (anyMeetings && anyMeetings.length > 0) {
          lastMeeting = anyMeetings[0]
          console.log('[EMAIL-DRAFT] Using most recent meeting (no content):', lastMeeting.title)
        }
      }
      
      // Process attendees if we found a meeting
      if (lastMeeting) {
        console.log('[EMAIL-DRAFT] Processing meeting:', lastMeeting?.title, '- Has summary:', !!lastMeeting?.summary, '- Has transcript:', !!lastMeeting?.transcript_text)
        console.log('[EMAIL-DRAFT] Meeting attendees:', JSON.stringify(lastMeeting.meeting_attendees))

        // For "last meeting" requests, ALWAYS use meeting attendee as recipient (overwrite any previous)
        if (lastMeeting.meeting_attendees?.length > 0) {
          // First try to find explicitly marked external attendee
          let targetAttendee = lastMeeting.meeting_attendees.find((a: any) => a.is_external === true)

          // If no external flag, find any attendee with an email that looks external
          if (!targetAttendee) {
            // Get user's email to exclude them
            const { data: userProfile } = await client
              .from('profiles')
              .select('email')
              .eq('id', userId)
              .maybeSingle()

            const userEmail = userProfile?.email?.toLowerCase() || ''

            // Find first attendee that isn't the user
            targetAttendee = lastMeeting.meeting_attendees.find((a: any) =>
              a.email && a.email.toLowerCase() !== userEmail
            )

            console.log('[EMAIL-DRAFT] No is_external flag, searching for non-user attendee. User email:', userEmail)
          }

          if (targetAttendee && targetAttendee.email) {
            recipientName = targetAttendee.name || recipientName
            contactEmail = targetAttendee.email
            console.log('[EMAIL-DRAFT] Using meeting attendee as recipient:', recipientName, contactEmail)
          } else {
            console.log('[EMAIL-DRAFT] No suitable attendee found with email')
          }
        }
      } else {
        console.log('[EMAIL-DRAFT] No meetings found with transcript or summary')
      }
    }

    // Get last interaction with this contact if we found one
    let lastInteraction = 'No previous interaction recorded'
    let lastInteractionDate = ''

    // If we found a meeting via "last meeting" reference, use that as last interaction
    if (lastMeeting) {
      const meetingTitle = lastMeeting.title || 'Recent meeting'
      const meetingDate = lastMeeting.meeting_start
        ? new Date(lastMeeting.meeting_start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : 'recently'
      lastInteraction = `Meeting: ${meetingTitle} (${meetingDate})`
      lastInteractionDate = lastMeeting.meeting_start
    }

    if (contact?.id) {
      // Check for recent meetings
      const { data: recentMeetings } = await client
        .from('meetings')
        .select('id, title, start_time')
        .eq('owner_user_id', userId)
        .contains('attendee_emails', contact.email ? [contact.email] : [])
        .order('start_time', { ascending: false })
        .limit(1)

      if (recentMeetings && recentMeetings.length > 0) {
        const meeting = recentMeetings[0]
        lastInteraction = `Meeting: ${meeting.title}`
        lastInteractionDate = meeting.start_time
      }

      // Check for recent activities/communications
      const { data: recentActivities } = await client
        .from('activities')
        .select('id, type, notes, created_at')
        .eq('user_id', userId)
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (recentActivities && recentActivities.length > 0) {
        const activity = recentActivities[0]
        if (!lastInteractionDate || new Date(activity.created_at) > new Date(lastInteractionDate)) {
          lastInteraction = `${activity.type}: ${activity.notes?.substring(0, 50) || 'No details'}...`
          lastInteractionDate = activity.created_at
        }
      }
    }

    // Determine email tone
    let tone: 'professional' | 'friendly' | 'concise' = 'professional'
    if (/casual|friendly|informal/i.test(userMessage)) {
      tone = 'friendly'
    } else if (/brief|short|quick|concise/i.test(userMessage)) {
      tone = 'concise'
    }

    // Determine email purpose and generate subject/body
    let subject = 'Following up'
    let body = ''
    let keyPoints: string[] = []

    const isFollowUp = /follow[- ]?up/i.test(userMessage)
    const isMeetingRelated = /meeting|call|chat|discuss/i.test(userMessage)
    const isProposalRelated = /proposal|quote|pricing|offer/i.test(userMessage)

    // Helper function to extract key points from meeting
    const extractMeetingKeyPoints = (meeting: any): string[] => {
      const points: string[] = []

      // From summary - handle JSON format with markdown_formatted field
      if (meeting.summary) {
        let summaryText = meeting.summary

        // Try to parse as JSON if it looks like JSON
        if (typeof summaryText === 'string' && (summaryText.startsWith('{') || summaryText.startsWith('{'))) {
          try {
            const parsed = JSON.parse(summaryText)
            summaryText = parsed.markdown_formatted || parsed.summary || summaryText
          } catch (e) {
            // Not JSON, use as-is
            console.log('[EMAIL-DRAFT] Summary is not JSON, using raw text')
          }
        } else if (typeof summaryText === 'object' && summaryText.markdown_formatted) {
          summaryText = summaryText.markdown_formatted
        }

        // Extract key takeaways section if present
        const keyTakeawaysMatch = summaryText.match(/##\s*Key\s*Takeaways?\s*\n([\s\S]*?)(?=\n##|$)/i)
        if (keyTakeawaysMatch) {
          const takeawaysSection = keyTakeawaysMatch[1]
          // Extract bullet points, clean markdown links and formatting
          const bulletPoints = takeawaysSection
            .split('\n')
            .filter((l: string) => l.trim().match(/^[-*]\s+/))
            .map((l: string) => {
              // Remove bullet, links [text](url), and bold **text**
              return l
                .replace(/^[-*]\s+/, '')
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/^\*\*([^:]+):\*\*\s*/, '')
                .trim()
            })
            .filter((l: string) => l.length > 10 && l.length < 200)
            .slice(0, 4)
          points.push(...bulletPoints)
        }

        // Fallback: extract from Next Steps section
        if (points.length === 0) {
          const nextStepsMatch = summaryText.match(/##\s*Next\s*Steps?\s*\n([\s\S]*?)(?=\n##|$)/i)
          if (nextStepsMatch) {
            const stepsSection = nextStepsMatch[1]
            const stepPoints = stepsSection
              .split('\n')
              .filter((l: string) => l.trim().match(/^[-*]\s+/))
              .map((l: string) => l.replace(/^[-*]\s+/, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').trim())
              .filter((l: string) => l.length > 10 && l.length < 200)
              .slice(0, 3)
            points.push(...stepPoints)
          }
        }

        // Last fallback: extract Meeting Purpose
        if (points.length === 0) {
          const purposeMatch = summaryText.match(/##\s*Meeting\s*Purpose\s*\n([\s\S]*?)(?=\n##|$)/i)
          if (purposeMatch) {
            const purpose = purposeMatch[1]
              .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
              .replace(/\*\*([^*]+)\*\*/g, '$1')
              .trim()
            if (purpose.length > 10 && purpose.length < 200) {
              points.push(purpose)
            }
          }
        }

        console.log('[EMAIL-DRAFT] Extracted key points from summary:', points.length)
      }

      // From action items - include uncompleted ones
      if (meeting.meeting_action_items?.length > 0) {
        const actionItems = meeting.meeting_action_items
          .filter((item: any) => !item.completed)
          .slice(0, 3)
          .map((item: any) => item.title)
        points.push(...actionItems)
      }

      return points.length > 0 ? points : ['Discuss next steps', 'Review key decisions']
    }

    // Fetch user's writing style for personalized email generation
    const { data: writingStyle } = await client
      .from('user_writing_styles')
      .select('name, tone_description, examples, style_metadata')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle()
    
    // Fetch user's name for email signature
    const { data: userProfile } = await client
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .maybeSingle()
    
    const userName = userProfile 
      ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || userProfile.email?.split('@')[0] || 'Your Name'
      : 'Your Name'
    
    console.log('[EMAIL-DRAFT] User writing style found:', !!writingStyle, writingStyle?.name)
    console.log('[EMAIL-DRAFT] User name for signature:', userName)

    // Generate email based on meeting context if available
    if ((isFollowUp || hasLastMeetingReference) && lastMeeting && (lastMeeting.summary || lastMeeting.transcript_text)) {
      // USE AI to generate a proper email based on meeting content and user's writing style
      console.log('[EMAIL-DRAFT] Generating AI email from meeting transcript/summary')
      
      const meetingTitle = lastMeeting.title || 'our recent conversation'
      const meetingDate = lastMeeting.meeting_start
        ? new Date(lastMeeting.meeting_start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : 'recently'

      keyPoints = extractMeetingKeyPoints(lastMeeting)
      
      // Get uncompleted action items
      const uncompletedActions = lastMeeting.meeting_action_items?.filter((a: any) => !a.completed) || []
      
      // Build style instruction from user's writing style
      let styleInstruction = 'Write in a professional but warm and personable tone.'
      if (writingStyle) {
        const styleParts: string[] = []
        styleParts.push(`\n## USER'S PERSONAL WRITING STYLE - YOU MUST MATCH THIS EXACTLY`)
        styleParts.push(`Style: ${writingStyle.name}`)
        styleParts.push(`Tone: ${writingStyle.tone_description}`)
        
        const meta = writingStyle.style_metadata as any
        if (meta?.tone_characteristics) {
          styleParts.push(`Characteristics: ${meta.tone_characteristics}`)
        }
        if (meta?.vocabulary_profile) {
          styleParts.push(`Vocabulary: ${meta.vocabulary_profile}`)
        }
        if (meta?.greeting_style) {
          styleParts.push(`Greeting style: Use "${meta.greeting_style}" style greetings`)
        }
        if (meta?.signoff_style) {
          styleParts.push(`Sign-off style: Use "${meta.signoff_style}" style sign-offs`)
        }
        
        if (writingStyle.examples && Array.isArray(writingStyle.examples) && writingStyle.examples.length > 0) {
          const snippets = (writingStyle.examples as string[]).slice(0, 2).map((ex: string) => 
            ex.length > 200 ? ex.substring(0, 200) + '...' : ex
          )
          styleParts.push(`\nEXAMPLES OF HOW THIS USER WRITES:\n${snippets.map((s: string) => `"${s}"`).join('\n')}`)
        }
        
        styleParts.push(`\n**CRITICAL: The email MUST sound like this user wrote it. Copy their vocabulary, greeting style, sign-off patterns, and overall tone exactly.**`)
        styleInstruction = styleParts.join('\n')
      }

      // Get current date for accurate date references
      const today = new Date()
      const currentDateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

      // Prepare meeting content - prefer transcript but use summary as fallback
      let meetingContent = ''
      if (lastMeeting.transcript_text) {
        // Truncate transcript if too long (keep first 3000 chars for context)
        const transcript = lastMeeting.transcript_text.length > 3000 
          ? lastMeeting.transcript_text.substring(0, 3000) + '... [transcript truncated]'
          : lastMeeting.transcript_text
        meetingContent = `MEETING TRANSCRIPT:\n${transcript}`
      } else if (lastMeeting.summary) {
        let summaryText = lastMeeting.summary
        if (typeof summaryText === 'object' && summaryText.markdown_formatted) {
          summaryText = summaryText.markdown_formatted
        } else if (typeof summaryText === 'string' && summaryText.startsWith('{')) {
          try {
            const parsed = JSON.parse(summaryText)
            summaryText = parsed.markdown_formatted || parsed.summary || summaryText
          } catch (e) {
            // Use as-is
          }
        }
        meetingContent = `MEETING SUMMARY:\n${summaryText}`
      }

      // Adjust tone based on user's base style
      let toneAdjustment = ''
      if (tone === 'friendly') {
        toneAdjustment = `\nTONE ADJUSTMENT: Make this email slightly MORE casual and warm than the user's normal style. Add a friendly touch while keeping their voice.`
      } else if (tone === 'concise') {
        toneAdjustment = `\nTONE ADJUSTMENT: Make this email MORE brief and direct than the user's normal style. Cut any fluff, keep only essentials.`
      } else if (tone === 'professional') {
        toneAdjustment = `\nTONE ADJUSTMENT: Make this email slightly MORE formal than the user's normal style. Keep it polished and business-appropriate.`
      }

      const prompt = `You are writing a follow-up email after a meeting. Generate a personalized, context-aware email.

TODAY'S DATE: ${currentDateStr}

SENDER NAME: ${userName}
RECIPIENT: ${recipientName || 'the attendee'}
RECIPIENT EMAIL: ${contactEmail || 'unknown'}
MEETING TITLE: ${meetingTitle}
MEETING DATE: ${meetingDate}

${meetingContent}

${uncompletedActions.length > 0 ? `AGREED ACTION ITEMS:\n${uncompletedActions.map((a: any) => `- ${a.title}`).join('\n')}` : ''}

${styleInstruction}
${toneAdjustment}

INSTRUCTIONS:
1. Write a follow-up email that references SPECIFIC things discussed in the meeting
2. Mention any action items or next steps that were agreed upon
3. Be concise (2-3 paragraphs max)
4. Sound natural and human - NOT like a template
5. Include specific details from the conversation to show you were paying attention
6. Propose a clear next step
7. Sign off with the sender's actual name: "${userName}"

Return ONLY a JSON object in this exact format (no markdown, no code blocks):
{"subject": "Your subject line here", "body": "Full email body here"}

The body MUST include proper greeting and sign off with "${userName}" (not "[Your Name]" or placeholders).`

      try {
        // Use Gemini for email generation
        if (GEMINI_API_KEY) {
          console.log('[EMAIL-DRAFT] Calling Gemini to generate personalized email...')
          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 1000,
                  responseMimeType: 'application/json'
                }
              })
            }
          )

          if (geminiResponse.ok) {
            const geminiData = await geminiResponse.json()
            const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
            console.log('[EMAIL-DRAFT] Gemini response received, length:', responseText.length)
            
            try {
              const emailJson = JSON.parse(responseText)
              if (emailJson.subject && emailJson.body) {
                subject = emailJson.subject
                body = emailJson.body
                console.log('[EMAIL-DRAFT] ✅ AI-generated email parsed successfully')
              }
            } catch (parseError) {
              console.error('[EMAIL-DRAFT] Failed to parse Gemini response:', parseError)
              // Try to extract JSON from response
              const jsonMatch = responseText.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                try {
                  const emailJson = JSON.parse(jsonMatch[0])
                  if (emailJson.subject && emailJson.body) {
                    subject = emailJson.subject
                    body = emailJson.body
                    console.log('[EMAIL-DRAFT] ✅ AI-generated email extracted from response')
                  }
                } catch (e) {
                  console.error('[EMAIL-DRAFT] Could not extract JSON from response')
                }
              }
            }
          } else {
            console.error('[EMAIL-DRAFT] Gemini API error:', geminiResponse.status)
          }
        }
      } catch (aiError) {
        console.error('[EMAIL-DRAFT] AI email generation failed:', aiError)
      }

      // Fallback if AI generation failed
      if (!body || body.includes('[Add key')) {
        console.log('[EMAIL-DRAFT] Using fallback template with meeting context')
        let discussionPoints = ''
        if (keyPoints.length > 0) {
          discussionPoints = `\n\nKey points from our discussion:\n${keyPoints.map(p => `• ${p}`).join('\n')}`
        }

        let actionItemsSection = ''
        if (uncompletedActions.length > 0) {
          actionItemsSection = `\n\nAs discussed, here are the action items we agreed on:\n${uncompletedActions.slice(0, 4).map((a: any) => `• ${a.title}`).join('\n')}`
        }

        subject = `Following up on ${meetingTitle}`
        body = `Hi ${recipientName || '[Name]'},

Thank you for taking the time to meet with me on ${meetingDate}. I wanted to follow up on our conversation about ${meetingTitle.replace(/^Meeting with /i, '').replace(/^Call with /i, '')}.${discussionPoints}${actionItemsSection}

Please let me know if you have any questions or if there's anything else I can help with.

Best regards`
      }

      console.log('[EMAIL-DRAFT] Generated email from meeting context:', { meetingTitle, keyPointsCount: keyPoints.length, hasActionItems: uncompletedActions.length > 0, usedAI: !body.includes('Best regards') || body.length > 500 })
    } else if (isFollowUp && isMeetingRelated) {
      // No meeting found - try harder to find ANY recent meeting
      console.log('[EMAIL-DRAFT] No meeting with content found, trying broader search...')
      
      const { data: anyMeetings } = await client
        .from('meetings')
        .select('id, title, summary, transcript_text, meeting_start')
        .eq('owner_user_id', userId)
        .order('meeting_start', { ascending: false })
        .limit(5)
      
      console.log('[EMAIL-DRAFT] Broader search found meetings:', anyMeetings?.length || 0)
      if (anyMeetings) {
        anyMeetings.forEach((m: any) => {
          console.log('[EMAIL-DRAFT] - Meeting:', m.title, 'has_summary:', !!m.summary, 'has_transcript:', !!m.transcript_text)
        })
      }

      // Fallback if no meeting found but user mentioned meeting
      subject = `Following up on our recent conversation`
      keyPoints = ['Thank them for their time', 'Recap key discussion points', 'Outline next steps']
      body = `Hi ${recipientName || '[Name]'},

Thank you for taking the time to speak with me recently. I wanted to follow up on our conversation and ensure we're aligned on the next steps.

I'd love to hear your thoughts on what we discussed. Please let me know if you have any questions or if there's anything else I can help with.

Best regards`
    } else if (isFollowUp && isProposalRelated) {
      subject = `Following up on our proposal`
      keyPoints = ['Reference the proposal', 'Ask if they have questions', 'Offer to discuss further']
      body = `Hi ${recipientName || '[Name]'},

I wanted to follow up on the proposal I sent over. I hope you've had a chance to review it.

Please let me know if you have any questions or would like to discuss any aspect of the proposal in more detail.

Looking forward to hearing from you.

Best regards`
    } else if (isFollowUp) {
      subject = `Following up`
      keyPoints = ['Reference last interaction', 'State purpose clearly', 'Include call to action']
      body = `Hi ${recipientName || '[Name]'},

I hope this message finds you well. I wanted to follow up on our previous conversation.

[Add context from your last interaction]

Would you have time for a quick call this week to discuss further?

Best regards`
    } else {
      subject = 'Reaching out'
      keyPoints = ['Introduce yourself/purpose', 'Provide value proposition', 'Clear call to action']
      body = `Hi ${recipientName || '[Name]'},

I hope this email finds you well.

[State your purpose for reaching out]

I'd love to schedule a brief call to discuss how we might be able to help.

Best regards`
    }

    // Calculate best send time (business hours, avoid Monday morning and Friday afternoon)
    const now = new Date()
    let sendTime = new Date()
    const hour = now.getHours()
    const day = now.getDay()

    // If it's outside business hours, suggest next business day at 9am
    if (hour < 9 || hour > 17 || day === 0 || day === 6) {
      sendTime.setDate(sendTime.getDate() + (day === 6 ? 2 : day === 0 ? 1 : 0))
      sendTime.setHours(9, 0, 0, 0)
    } else {
      // Suggest sending in 30 minutes
      sendTime.setMinutes(sendTime.getMinutes() + 30)
    }

    const response = {
      type: 'email',
      summary: recipientName
        ? `Here's a draft email for ${recipientName}. Review and customize before sending.`
        : `Here's a draft email. Add recipient details and customize before sending.`,
      data: {
        email: {
          to: contactEmail ? [contactEmail] : [],
          cc: [],
          subject,
          body,
          tone,
          sendTime: sendTime.toISOString()
        },
        context: {
          contactName: recipientName || 'Unknown',
          lastInteraction,
          lastInteractionDate: lastInteractionDate || new Date().toISOString(),
          dealValue: undefined,
          keyPoints,
          warnings: recipientName ? undefined : ['No recipient specified - please add email address']
        },
        suggestions: [
          {
            label: 'Make it shorter',
            action: 'shorten' as const,
            description: 'Condense the email to key points only'
          },
          {
            label: 'Change tone to friendly',
            action: 'change_tone' as const,
            description: 'Make the email more casual and approachable'
          },
          {
            label: 'Add calendar link',
            action: 'add_calendar_link' as const,
            description: 'Include a scheduling link for easy booking'
          }
        ]
      },
      actions: [
        {
          label: 'Send Email',
          type: 'send_email',
          primary: true,
          disabled: !contactEmail
        },
        {
          label: 'Edit in Gmail',
          type: 'edit_in_gmail',
          href: contactEmail ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(contactEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : undefined
        },
        {
          label: 'Copy to Clipboard',
          type: 'copy_email'
        }
      ],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: contact ? ['contacts', 'meetings', 'activities'] : ['user_message'],
        contactId: contact?.id,
        recipientEmail: contactEmail
      }
    }

    console.log('[EMAIL-DRAFT] Generated email response for:', recipientName || 'unknown recipient')
    return response

  } catch (error) {
    console.error('[EMAIL-DRAFT] Error structuring email draft:', error)
    // Return a basic email template on error
    return {
      type: 'email',
      summary: 'Here\'s a draft email template. Customize it for your needs.',
      data: {
        email: {
          to: [],
          subject: 'Following up',
          body: `Hi [Name],

I hope this message finds you well. I wanted to follow up on our previous conversation.

[Add your message here]

Best regards`,
          tone: 'professional' as const
        },
        context: {
          contactName: 'Unknown',
          lastInteraction: 'Unable to retrieve',
          lastInteractionDate: new Date().toISOString(),
          keyPoints: ['Add recipient', 'Customize message', 'Review before sending'],
          warnings: ['Could not load contact information']
        },
        suggestions: []
      },
      actions: [],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['error_fallback']
      }
    }
  }
}

/**
 * Structure task creation response with contact search
 */
async function structureTaskCreationResponse(
  client: any,
  userId: string,
  userMessage: string
): Promise<any> {
  try {
    // Extract task title/description from message
    // Patterns: "create a task to follow up with Paul", "remind me to call John", etc.
    const taskTitlePatterns = [
      /(?:create|add|new|set).*task.*(?:to|for|about)\s+(.+)/i,
      /remind\s+me\s+(?:to\s+)?(?:follow\s+up\s+)?(?:with\s+)?(.+)/i,
      /remind\s+(?:me\s+)?(?:to\s+)?(?:follow\s+up\s+)?(?:with\s+)?(.+)/i,
      /task\s+to\s+(.+)/i,
      /follow\s+up\s+(?:with\s+)?(.+)/i,
      /follow-up\s+(?:with\s+)?(.+)/i,
      /(?:call|email|meet|contact|reach out to)\s+(.+)/i
    ]
    
    let taskTitle: string | null = null
    for (const pattern of taskTitlePatterns) {
      const match = userMessage.match(pattern)
      if (match && match[1]) {
        taskTitle = match[1].trim()
        // Remove date/time references and common phrases from title
        taskTitle = taskTitle
          .replace(/\s+(?:tomorrow|today|next week|in \d+ days?|on \w+day).*$/i, '')
          .replace(/\s+about\s+the\s+proposal.*$/i, '')
          .replace(/\s+regarding.*$/i, '')
          .trim()
        break
      }
    }
    
    // If no title found, try to extract from "remind me to [action]"
    if (!taskTitle) {
      const remindMatch = userMessage.match(/remind\s+me\s+(?:to\s+)?(.+?)(?:\s+tomorrow|\s+today|\s+about|$)/i)
      if (remindMatch && remindMatch[1]) {
        taskTitle = remindMatch[1].trim()
      } else {
        taskTitle = 'Follow-up task'
      }
    }
    
    // Extract contact name from message
    // Improved patterns to catch "remind me to follow up with Paul"
    const namePatterns = [
      /follow\s+up\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /follow-up\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /remind\s+me\s+(?:to\s+)?(?:follow\s+up\s+)?with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:with|to|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)/, // Full name pattern
      /([A-Z][a-z]+)(?:\s+tomorrow|\s+today|\s+next|\s+about|\s+regarding)/i // Single name before date/context
    ]
    
    let contactName: string | null = null
    for (const pattern of namePatterns) {
      const match = userMessage.match(pattern)
      if (match && match[1]) {
        contactName = match[1].trim()
        // Clean up the name - remove common words that might have been captured
        contactName = contactName
          .replace(/^(?:to|for|with|about|regarding)\s+/i, '')
          .replace(/\s+(?:tomorrow|today|next|about|the|proposal|regarding).*$/i, '')
          .trim()
        if (contactName && contactName.length > 1) {
          break
        }
      }
    }
    
    // Fallback: try to extract a capitalized name (likely a person's name)
    if (!contactName) {
      const capitalizedNameMatch = userMessage.match(/\b([A-Z][a-z]+)(?:\s+(?:tomorrow|today|about|the|proposal))?/i)
      if (capitalizedNameMatch && capitalizedNameMatch[1]) {
        const potentialName = capitalizedNameMatch[1]
        // Only use if it's not a common word
        const commonWords = ['remind', 'follow', 'create', 'add', 'task', 'tomorrow', 'today', 'about', 'the']
        if (!commonWords.includes(potentialName.toLowerCase())) {
          contactName = potentialName
        }
      }
    }
    
    // Extract date information
    const todayPattern = /(?:for|on|by)\s+(?:today|now)/i
    const tomorrowPattern = /(?:for|on|by)\s+tomorrow/i
    const nextWeekPattern = /(?:for|on|by)\s+next\s+week/i
    const daysPattern = /(?:in|for)\s+(\d+)\s+days?/i
    const datePattern = /(?:for|on|by)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i
    
    let dueDate: string | null = null
    if (todayPattern.test(userMessage)) {
      dueDate = new Date().toISOString()
    } else if (tomorrowPattern.test(userMessage)) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      dueDate = tomorrow.toISOString()
    } else if (nextWeekPattern.test(userMessage)) {
      const nextWeek = new Date()
      nextWeek.setDate(nextWeek.getDate() + 7)
      dueDate = nextWeek.toISOString()
    } else if (daysPattern.test(userMessage)) {
      const daysMatch = userMessage.match(daysPattern)
      if (daysMatch && daysMatch[1]) {
        const days = parseInt(daysMatch[1], 10)
        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + days)
        dueDate = futureDate.toISOString()
      }
    } else if (datePattern.test(userMessage)) {
      const dateMatch = userMessage.match(datePattern)
      if (dateMatch && dateMatch[1]) {
        const parsedDate = new Date(dateMatch[1])
        if (!isNaN(parsedDate.getTime())) {
          dueDate = parsedDate.toISOString()
        }
      }
    }
    
    // Extract priority
    let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
    if (/\burgent\b/i.test(userMessage) || /\bhigh priority\b/i.test(userMessage)) {
      priority = 'urgent'
    } else if (/\bhigh\b/i.test(userMessage) && !/\bhigh priority\b/i.test(userMessage)) {
      priority = 'high'
    } else if (/\blow\b/i.test(userMessage)) {
      priority = 'low'
    }
    
    // Extract task type
    let taskType: 'call' | 'email' | 'meeting' | 'follow_up' | 'demo' | 'proposal' | 'general' = 'follow_up'
    if (/\bcall\b/i.test(userMessage)) {
      taskType = 'call'
    } else if (/\bemail\b/i.test(userMessage)) {
      taskType = 'email'
    } else if (/\bmeeting\b/i.test(userMessage)) {
      taskType = 'meeting'
    } else if (/\bdemo\b/i.test(userMessage)) {
      taskType = 'demo'
    } else if (/\bproposal\b/i.test(userMessage)) {
      taskType = 'proposal'
    }
    
    // If no contact name found, return contact selection response
    if (!contactName) {
      return {
        type: 'contact_selection',
        summary: `I'd like to help you create a task. Please select the contact:`,
        data: {
          activityType: 'task',
          activityDate: dueDate || new Date().toISOString(),
          requiresContactSelection: true,
          prefilledName: '',
          prefilledEmail: '',
          taskTitle,
          taskType,
          priority
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['user_message']
        }
      }
    }
    
    // Search for contacts matching the name
    const nameParts = contactName.split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''
    
    // Build search query
    let contactsQuery = client
      .from('contacts')
      .select('id, first_name, last_name, full_name, email, company_id, companies:company_id(id, name)')
      .eq('owner_id', userId)
    
    // Search by first and last name
    if (firstName && lastName) {
      contactsQuery = contactsQuery.or(`first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%,full_name.ilike.%${contactName}%`)
    } else if (firstName) {
      contactsQuery = contactsQuery.or(`first_name.ilike.%${firstName}%,full_name.ilike.%${firstName}%`)
    } else {
      // If no name parts, search by full name
      contactsQuery = contactsQuery.ilike('full_name', `%${contactName}%`)
    }
    
    const { data: contacts, error: contactsError } = await contactsQuery.limit(10)
    
    if (contactsError) {
      console.error('Error searching contacts:', contactsError)
      // Return contact selection response on error
      return {
        type: 'contact_selection',
        summary: `I'd like to help you create a task for ${contactName}. Please select the contact:`,
        data: {
          activityType: 'task',
          activityDate: dueDate || new Date().toISOString(),
          requiresContactSelection: true,
          prefilledName: contactName,
          prefilledEmail: '',
          taskTitle,
          taskType,
          priority
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['user_message']
        }
      }
    }
    
    // Format contacts for frontend
    const formattedContacts = (contacts || []).map((contact: any) => ({
      id: contact.id,
      name: contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || 'Unknown',
      email: contact.email,
      company: contact.companies?.name || null
    }))
    
    // If no contacts found or multiple contacts found, return contact selection response
    if (!contacts || contacts.length === 0 || contacts.length > 1) {
      return {
        type: 'contact_selection',
        summary: contacts && contacts.length > 1
          ? `I found ${contacts.length} contacts matching "${contactName}". Please select the correct one:`
          : `I couldn't find a contact matching "${contactName}". Please select or create a contact:`,
        data: {
          activityType: 'task',
          activityDate: dueDate || new Date().toISOString(),
          requiresContactSelection: true,
          prefilledName: contactName,
          prefilledEmail: '',
          suggestedContacts: formattedContacts,
          taskTitle,
          taskType,
          priority
        },
        actions: [],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['contacts_search'],
          matchCount: contacts?.length || 0
        }
      }
    }
    
    // Single contact found - check if proposal is mentioned and search for proposals
    const contact = contacts[0]
    const mentionsProposal = /\bproposal\b/i.test(userMessage)
    
    // If proposal is mentioned, search for related proposals
    if (mentionsProposal) {
      // Search for proposals related to this contact
      // Try multiple search strategies: contact_id, client_name, contact_identifier
      let proposalsQuery = client
        .from('activities')
        .select(`
          id,
          type,
          client_name,
          details,
          amount,
          date,
          deal_id,
          company_id,
          contact_id,
          deals:deal_id(id, name, value, stage_id)
        `)
        .eq('user_id', userId)
        .eq('type', 'proposal')
      
      // Build OR query for multiple search criteria
      const searchConditions: string[] = []
      
      // Search by contact_id if available
      if (contact.id) {
        searchConditions.push(`contact_id.eq.${contact.id}`)
      }
      
      // Search by client_name matching contact name
      searchConditions.push(`client_name.ilike.%${contactName}%`)
      
      // Search by contact_identifier (email) if available
      if (contact.email) {
        searchConditions.push(`contact_identifier.ilike.%${contact.email}%`)
      }
      
      // Apply OR conditions
      if (searchConditions.length > 0) {
        proposalsQuery = proposalsQuery.or(searchConditions.join(','))
      }
      
      const { data: proposals, error: proposalsError } = await proposalsQuery
        .order('date', { ascending: false })
        .limit(10)
      
      if (!proposalsError && proposals && proposals.length > 0) {
        // Found proposals - return proposal selection response
        return {
          type: 'proposal_selection',
          summary: `I found ${proposals.length} proposal${proposals.length > 1 ? 's' : ''} for ${contact.full_name || `${contact.first_name} ${contact.last_name}`.trim()}. Please select the one to follow up on:`,
          data: {
            contact: {
              id: contact.id,
              name: contact.full_name || `${contact.first_name} ${contact.last_name}`.trim(),
              email: contact.email,
              company: contact.companies?.name || null,
              companyId: contact.company_id || null
            },
            proposals: proposals.map((proposal: any) => ({
              id: proposal.id,
              clientName: proposal.client_name,
              details: proposal.details,
              amount: proposal.amount,
              date: proposal.date,
              dealId: proposal.deal_id,
              dealName: proposal.deals?.name || null,
              dealValue: proposal.deals?.value || null
            })),
            taskTitle,
            taskType,
            priority,
            dueDate: dueDate || null
          },
          actions: [],
          metadata: {
            timeGenerated: new Date().toISOString(),
            dataSource: ['proposals_search'],
            proposalCount: proposals.length
          }
        }
      }
    }
    
    // No proposals found or proposal not mentioned - return task creation response
    return {
      type: 'task_creation',
      summary: `I found ${contact.full_name || `${contact.first_name} ${contact.last_name}`.trim()}. Ready to create the task.`,
      data: {
        title: taskTitle,
        description: `Task: ${taskTitle}`,
        dueDate: dueDate || null,
        priority,
        taskType,
        contact: {
          id: contact.id,
          name: contact.full_name || `${contact.first_name} ${contact.last_name}`.trim(),
          email: contact.email,
          company: contact.companies?.name || null,
          companyId: contact.company_id || null
        },
        requiresContactSelection: false
      },
      actions: [
        {
          id: 'create-task',
          label: 'Create Task',
          type: 'primary',
          callback: 'create_task',
          params: {
            title: taskTitle,
            dueDate: dueDate || null,
            contactId: contact.id,
            priority,
            taskType
          }
        }
      ],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['contacts_search'],
        matchCount: 1
      }
    }
  } catch (error) {
    console.error('Error in structureTaskCreationResponse:', error)
    // Return contact selection response on error
    return {
      type: 'contact_selection',
      summary: `I'd like to help you create a task. Please select the contact:`,
      data: {
        activityType: 'task',
        activityDate: new Date().toISOString(),
        requiresContactSelection: true,
        prefilledName: '',
        prefilledEmail: '',
        taskTitle: 'Follow-up task',
        taskType: 'follow_up',
        priority: 'medium'
      },
      actions: [],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['error_fallback']
      }
    }
  }
}

/**
 * Structure contact response with all connections
 */
async function structureContactResponse(
  client: any,
  userId: string,
  aiContent: string,
  contactEmail: string | null,
  userMessage: string
): Promise<StructuredResponse | null> {
  try {
    // Find contact by email or name
    let contact: ContactData | null = null
    
    if (contactEmail) {
      const { data: contactByEmail } = await client
        .from('contacts')
        .select(`
          id,
          first_name,
          last_name,
          full_name,
          email,
          phone,
          title,
          company_id,
          companies:company_id(id, name)
        `)
        .eq('email', contactEmail)
        .eq('owner_id', userId)
        .maybeSingle()
      
      contact = contactByEmail as ContactData | null
    }
    
    // If no contact found by email, try searching by name
    if (!contact) {
      const nameMatch = userMessage.match(/(?:about|info on|tell me about|show me|find|lookup)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
      if (nameMatch) {
        const nameParts = nameMatch[1].split(' ')
        const firstName = nameParts[0]
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null
        
        let query = client
          .from('contacts')
          .select(`
            id,
            first_name,
            last_name,
            full_name,
            email,
            phone,
            title,
            company_id,
            companies:company_id(id, name)
          `)
          .eq('first_name', firstName)
          .eq('owner_id', userId)
        
        if (lastName) {
          query = query.eq('last_name', lastName)
        }
        
        const { data: contactByName } = await query.maybeSingle()
        contact = contactByName as ContactData | null
      }
    }
    
    if (!contact) {
      return null // Let AI handle it as text response
    }
    
    const contactId = contact.id
    
    // Fetch all related data in parallel
    const [
      emailsResult,
      dealsResult,
      activitiesResult,
      meetingsResult,
      tasksResult
    ] = await Promise.allSettled([
      // Fetch recent emails - try Gmail integration first, fallback to activities
      (async () => {
        // Check if Gmail integration exists
        const { data: gmailIntegration } = await client
          .from('user_integrations')
          .select('id, access_token')
          .eq('user_id', userId)
          .eq('service', 'gmail')
          .eq('status', 'active')
          .maybeSingle()
        
        if (gmailIntegration && contact?.email) {
          try {
            // Fetch emails from Gmail API
            const gmailResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:${contact?.email || ''} OR to:${contact?.email || ''}&maxResults=10`,
              {
                headers: {
                  'Authorization': `Bearer ${gmailIntegration.access_token}`
                }
              }
            )
            
            if (gmailResponse.ok) {
              const gmailData = await gmailResponse.json()
              const messages = gmailData.messages || []
              
              // Fetch full message details for each
              const emailDetails = await Promise.all(
                messages.slice(0, 5).map(async (msg: any) => {
                  try {
                    const msgRes = await fetch(
                      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
                      {
                        headers: {
                          'Authorization': `Bearer ${gmailIntegration.access_token}`
                        }
                      }
                    )
                    if (!msgRes.ok) return null
                    const msgData = await msgRes.json()
                    
                    const headers = msgData.payload?.headers || []
                    const fromHeader = headers.find((h: any) => h.name === 'From')
                    const subjectHeader = headers.find((h: any) => h.name === 'Subject')
                    const dateHeader = headers.find((h: any) => h.name === 'Date')
                    
                    const snippet = msgData.snippet || ''
                    const direction = fromHeader?.value?.toLowerCase().includes(contact?.email?.toLowerCase() || '') ? 'sent' : 'received'
                    
                    return {
                      id: msg.id,
                      type: 'email',
                      notes: subjectHeader?.value || 'No subject',
                      date: dateHeader?.value ? new Date(dateHeader.value).toISOString() : new Date().toISOString(),
                      created_at: dateHeader?.value ? new Date(dateHeader.value).toISOString() : new Date().toISOString(),
                      snippet: snippet.substring(0, 200),
                      subject: subjectHeader?.value || 'No subject',
                      direction
                    }
                  } catch {
                    return null
                  }
                })
              )
              
              return { data: emailDetails.filter(Boolean), error: null }
            }
          } catch (error) {
            // Fallback to activities
          }
        }
        
        // Fallback: use activities that are emails
        return await client
          .from('activities')
          .select('id, type, details, date, created_at')
          .eq('contact_id', contactId)
          .eq('type', 'email')
          .order('date', { ascending: false })
          .limit(10)
      })(),
      
      // Fetch deals
      client
        .from('deals')
        .select(`
          id,
          name,
          value,
          stage_id,
          probability,
          expected_close_date,
          deal_stages:stage_id(name)
        `)
        .or(`primary_contact_id.eq.${contactId},contact_email.eq.${contact.email}`)
        .eq('owner_id', userId)
        .order('created_at', { ascending: false }),
      
      // Fetch activities
      client
        .from('activities')
        .select('id, type, details, date')
        .eq('contact_id', contactId)
        .order('date', { ascending: false })
        .limit(10),
      
      // Fetch meetings
      client
        .from('meetings')
        .select(`
          id,
          title,
          summary,
          meeting_start,
          transcript_text
        `)
        .or(`primary_contact_id.eq.${contactId},company_id.eq.${contact.company_id}`)
        .eq('owner_user_id', userId)
        .order('meeting_start', { ascending: false })
        .limit(10),
      
      // Fetch tasks
      client
        .from('tasks')
        .select('id, title, status, priority, due_date')
        .eq('contact_id', contactId)
        .in('status', ['todo', 'in_progress'])
        .order('due_date', { ascending: true })
        .limit(10)
    ])
    
    const emails = emailsResult.status === 'fulfilled' ? emailsResult.value.data || [] : []
    const deals = dealsResult.status === 'fulfilled' ? dealsResult.value.data || [] : []
    const activities = activitiesResult.status === 'fulfilled' ? activitiesResult.value.data || [] : []
    const meetings = meetingsResult.status === 'fulfilled' ? meetingsResult.value.data || [] : []
    const tasks = tasksResult.status === 'fulfilled' ? tasksResult.value.data || [] : []
    
    // Format emails
    const emailSummaries = emails.slice(0, 5).map((email: any) => ({
      id: email.id,
      subject: email.subject || email.notes?.substring(0, 50) || 'Email',
      summary: email.snippet || email.notes?.substring(0, 200) || '',
      date: email.date || email.created_at,
      direction: email.direction || 'sent',
      snippet: email.snippet || email.notes?.substring(0, 100)
    }))
    
    // Format deals
    const formattedDeals = deals.map((deal: any) => {
      // Calculate health score (simplified)
      const daysSinceUpdate = deal.updated_at 
        ? Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24))
        : 30
      const healthScore = Math.max(0, 100 - (daysSinceUpdate * 2) - (100 - deal.probability))
      
      return {
        id: deal.id,
        name: deal.name,
        value: deal.value || 0,
        stage: deal.deal_stages?.name || 'Unknown',
        probability: deal.probability || 0,
        closeDate: deal.expected_close_date,
        healthScore: Math.round(healthScore)
      }
    })
    
    // Format activities
    const formattedActivities = activities.slice(0, 10).map((activity: any) => ({
      id: activity.id,
      type: activity.type,
      notes: activity.details, // Use 'details' field from activities table
      date: activity.date
    }))
    
    // Format meetings
    const formattedMeetings = meetings.map((meeting: any) => ({
      id: meeting.id,
      title: meeting.title || 'Meeting',
      date: meeting.meeting_start,
      summary: meeting.summary,
      hasTranscript: !!meeting.transcript_text
    }))
    
    // Format tasks
    const formattedTasks = tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.due_date
    }))
    
    // Calculate metrics
    const activeDeals = formattedDeals.filter((d: any) => d.probability > 0 && d.probability < 100)
    const totalDealValue = formattedDeals.reduce((sum: number, d: any) => sum + (d.value || 0), 0)
    const upcomingMeetings = formattedMeetings.filter((m: any) => {
      const meetingDate = new Date(m.date)
      return meetingDate >= new Date()
    })
    
    const metrics = {
      totalDeals: formattedDeals.length,
      totalDealValue,
      activeDeals: activeDeals.length,
      recentEmails: emailSummaries.length,
      upcomingMeetings: upcomingMeetings.length,
      pendingTasks: formattedTasks.length
    }
    
    // Generate summary
    const summary = `Here's everything I found about ${contact.full_name || contact.first_name || contact.email}:`
    
    // Generate actions
    const actions: Array<{
      id: string
      label: string
      type: string
      icon: string
      callback: string
      params?: any
    }> = []
    if (formattedDeals.length > 0) {
      actions.push({
        id: 'view-deals',
        label: `View ${formattedDeals.length} Deal${formattedDeals.length > 1 ? 's' : ''}`,
        type: 'primary' as const,
        icon: 'briefcase',
        callback: `/crm/contacts/${contactId}`
      })
    }
    if (formattedTasks.length > 0) {
      actions.push({
        id: 'view-tasks',
        label: `View ${formattedTasks.length} Task${formattedTasks.length > 1 ? 's' : ''}`,
        type: 'secondary' as const,
        icon: 'check-circle',
        callback: `/crm/tasks?contact=${contactId}`
      })
    }
    
    return {
      type: 'contact',
      summary,
      data: {
        contact: {
          id: contact.id,
          name: contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          company: contact.companies?.name,
          companyId: contact.company_id
        },
        emails: emailSummaries,
        deals: formattedDeals,
        activities: formattedActivities,
        meetings: formattedMeetings,
        tasks: formattedTasks,
        metrics
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['contacts', 'deals', 'activities', 'meetings', 'tasks'],
        confidence: 90
      }
    }
  } catch (error) {
    return null
  }
}

/**
 * Structure communication history response (emails)
 */
async function structureCommunicationHistoryResponse(
  client: any,
  userId: string,
  userMessage: string,
  context?: ChatRequest['context']
): Promise<StructuredResponse | null> {
  try {
    const messageLower = userMessage.toLowerCase()
    const { contact, contactEmail, contactName, searchTerm } = await resolveContactReference(client, userId, userMessage, context)
    const contactId = contact?.id || null
    const labelFilter = extractLabelFromMessage(userMessage)
    const limit = extractEmailLimitFromMessage(userMessage)
    const direction = detectEmailDirection(messageLower)
    const { startDate, endDate } = extractDateRangeFromMessage(messageLower)

    let emails: GmailMessageSummary[] = []
    const dataSource: string[] = []
    let warning: string | null = null

    try {
      const gmailResult = await searchGmailMessages(client, userId, {
        contactEmail,
        query: contactEmail ? null : searchTerm || null,
        limit,
        direction,
        startDate: startDate || null,
        endDate: endDate || null,
        label: labelFilter || null
      })
      emails = gmailResult.messages
      dataSource.push('gmail')
    } catch (error) {
      warning = error.message || 'Unable to reach Gmail'
      console.error('[COMM-HISTORY] Gmail fetch failed:', error)
      if (contact?.id) {
        const fallback = await fetchEmailActivitiesFallback(client, userId, contact.id, limit)
        if (fallback.length) {
          emails = fallback
          dataSource.push('activities')
        }
      }
    }

    const sortedEmails = [...emails].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const communications = sortedEmails.map(email => ({
      id: email.id,
      type: 'email' as const,
      subject: email.subject,
      summary: email.snippet,
      date: email.date,
      direction: email.direction,
      participants: [...new Set([...email.from, ...email.to])]
    }))

    const timeline = sortedEmails.map(email => ({
      id: `${email.id}-timeline`,
      date: email.date,
      type: 'email',
      title: `${email.direction === 'received' ? 'Received' : email.direction === 'sent' ? 'Sent' : 'Email'}: ${email.subject}`,
      description: email.snippet,
      relatedTo: contactName || contactEmail || searchTerm || undefined
    }))

    const mostRecent = sortedEmails[0]
    const emailsSent = sortedEmails.filter(email => email.direction === 'sent').length
    const summaryStats = {
      totalCommunications: communications.length,
      emailsSent,
      callsMade: 0,
      meetingsHeld: 0,
      lastContact: mostRecent?.date,
      communicationFrequency: communications.length >= limit
        ? 'high'
        : communications.length >= Math.max(3, Math.floor(limit / 2))
          ? 'medium'
          : 'low'
    }

    const overdueFollowUps: Array<{
      id: string
      type: 'email'
      title: string
      dueDate: string
      daysOverdue: number
      contactId?: string
      contactName?: string
      dealId?: string
      dealName?: string
    }> = []
    if (contactId && mostRecent) {
      const daysSince = Math.floor((Date.now() - new Date(mostRecent.date).getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince >= 5) {
        overdueFollowUps.push({
          id: `followup-${mostRecent.id}`,
          type: 'email',
          title: `Follow up with ${contactName || 'this contact'}`,
          dueDate: mostRecent.date,
          daysOverdue: daysSince,
          contactId,
          contactName: contactName || undefined
        })
      }
    }

    const nextActions: Array<{
      id: string
      type: 'email'
      title: string
      dueDate?: string
      priority: 'high' | 'medium' | 'low'
      contactId?: string
      contactName?: string
      dealId?: string
      dealName?: string
    }> = []
    if (contactId) {
      nextActions.push({
        id: 'send-follow-up',
        type: 'email',
        title: `Draft a follow-up to ${contactName || 'this contact'}`,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        priority: 'high',
        contactId,
        contactName: contactName || undefined
      })
    }

    const actions: Array<{
      id: string
      label: string
      type: 'primary' | 'secondary' | 'tertiary'
      icon: string
      callback: string
      params?: any
    }> = []
    if (contactId) {
      actions.push({
        id: 'view-contact',
        label: 'Open Contact',
        type: 'primary',
        icon: 'user',
        callback: `/crm/contacts/${contactId}`
      })
      actions.push({
        id: 'create-follow-up-task',
        label: 'Create Follow-up Task',
        type: 'secondary',
        icon: 'check-square',
        callback: 'create_task',
        params: {
          title: `Follow up with ${contactName || 'contact'}`,
          contactId,
          taskType: 'email',
          priority: 'high'
        }
      })
    }
    if (mostRecent?.link) {
      actions.push({
        id: 'open-gmail-thread',
        label: 'Open in Gmail',
        type: 'tertiary',
        icon: 'mail',
        callback: mostRecent.link
      })
    }

    const scopeDescription = labelFilter
      ? `tagged "${labelFilter}"`
      : contactName
        ? `with ${contactName}`
        : contactEmail
          ? `with ${contactEmail}`
          : 'from your inbox'

    const summary = communications.length
      ? `Here are the last ${communications.length} emails ${scopeDescription}.`
      : warning
        ? `I couldn't load Gmail data ${scopeDescription}: ${warning}.`
        : `I couldn't find any recent emails ${scopeDescription}.`

    return {
      type: 'communication_history',
      summary,
      data: {
        contactId,
        contactName: contactName || undefined,
        communications,
        timeline,
        overdueFollowUps,
        nextActions,
        summary: summaryStats
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: dataSource.length ? dataSource : ['gmail_unavailable'],
        totalCount: communications.length,
        warning
      }
    }
  } catch (error) {
    console.error('[COMM-HISTORY] Failed to structure response:', error)
    return null
  }
}

/**
 * Structure pipeline response from deals data
 */
async function structurePipelineResponse(
  client: any,
  userId: string,
  aiContent: string,
  userMessage?: string
): Promise<any> {
  try {
    // Fetch all active deals
    const { data: deals, error } = await client
      .from('deals')
      .select(`
        id,
        name,
        value,
        stage_id,
        status,
        expected_close_date,
        probability,
        created_at,
        updated_at,
        deal_stages(name)
      `)
      .eq('owner_id', userId)  // Correct column name is owner_id
      .eq('status', 'active')
      .order('value', { ascending: false })

    if (error) {
      return null
    }
    
    if (!deals || deals.length === 0) {
      return null
    }
    // Calculate health scores and categorize deals
    const now = new Date()
    const criticalDeals: any[] = []
    const highPriorityDeals: any[] = []
    const healthyDeals: any[] = []
    const dataIssues: any[] = []

    let totalValue = 0
    let dealsAtRisk = 0
    let closingThisWeek = 0
    let totalHealthScore = 0

    for (const deal of deals) {
      totalValue += deal.value || 0
      
      // Calculate health score (0-100)
      const daysSinceUpdate = Math.floor((now.getTime() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24))
      const daysUntilClose = deal.expected_close_date 
        ? Math.floor((new Date(deal.expected_close_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null
      
      // Health score factors
      const recencyScore = Math.max(0, 100 - daysSinceUpdate * 5) // Lose 5 points per day
      const probabilityScore = deal.probability || 0
      const valueScore = Math.min(100, (deal.value || 0) / 1000) // 1 point per $1k, max 100
      
      const healthScore = Math.round((recencyScore * 0.4 + probabilityScore * 0.4 + valueScore * 0.2))
      totalHealthScore += healthScore

      // Check for data issues
      if (!deal.expected_close_date) {
        dataIssues.push({
          type: 'missing_close_date',
          dealId: deal.id,
          dealName: deal.name,
          description: 'No close date set'
        })
      }
      
      if (deal.probability < 30) {
        dataIssues.push({
          type: 'low_probability',
          dealId: deal.id,
          dealName: deal.name,
          description: `Low probability (${deal.probability}%)`
        })
      }
      
      if (daysSinceUpdate > 30) {
        dataIssues.push({
          type: 'stale_deal',
          dealId: deal.id,
          dealName: deal.name,
          description: `No updates in ${daysSinceUpdate} days`
        })
      }

      // Determine urgency
      let urgency: 'critical' | 'high' | 'medium' | 'low' = 'medium'
      let reason = ''

      // Critical: High value, closing soon, or low health
      if (daysUntilClose !== null && daysUntilClose <= 7 && daysUntilClose >= 0) {
        closingThisWeek++
        if (deal.value >= 10000 || healthScore < 50) {
          urgency = 'critical'
          reason = `Closing in ${daysUntilClose} days with ${healthScore} health score`
          criticalDeals.push({
            id: deal.id,
            name: deal.name,
            value: deal.value,
            stage: deal.deal_stages?.name || 'Unknown',
            probability: deal.probability || 0,
            closeDate: deal.expected_close_date,
            daysUntilClose,
            healthScore,
            urgency,
            reason
          })
          dealsAtRisk++
          continue
        }
      }

      // High priority: High value, no close date, or been in stage too long
      if (
        deal.value >= 10000 ||
        (!deal.expected_close_date && daysSinceUpdate > 14) ||
        healthScore < 60
      ) {
        urgency = 'high'
        if (!deal.expected_close_date) {
          reason = `No close date set, been in ${deal.deal_stages?.name || 'current'} stage ${daysSinceUpdate} days`
        } else if (daysSinceUpdate > 14) {
          reason = `No recent activity (${daysSinceUpdate} days since update)`
        } else {
          reason = `Health score of ${healthScore} needs attention`
        }
        highPriorityDeals.push({
          id: deal.id,
          name: deal.name,
          value: deal.value,
          stage: deal.deal_stages?.name || 'Unknown',
          probability: deal.probability || 0,
          closeDate: deal.expected_close_date,
          daysUntilClose,
          healthScore,
          urgency,
          reason
        })
        if (healthScore < 60) dealsAtRisk++
        continue
      }

      // Healthy deals
      healthyDeals.push({
        id: deal.id,
        name: deal.name,
        value: deal.value,
        stage: deal.deal_stages?.name || 'Unknown',
        probability: deal.probability || 0,
        closeDate: deal.expected_close_date,
        daysUntilClose,
        healthScore,
        urgency: 'low',
        reason: 'On track'
      })
    }

    const avgHealthScore = deals.length > 0 ? Math.round(totalHealthScore / deals.length) : 0

    // Generate summary
    const summary = `I've analyzed your pipeline. Here's what needs attention:`

    // Generate actions
    const actions: Array<{
      id: string
      label: string
      type: string
      icon: string
      callback: string
      params?: any
    }> = []
    if (criticalDeals.length > 0) {
      actions.push({
        id: 'focus-critical',
        label: `Focus on ${criticalDeals[0].name}`,
        type: 'primary',
        icon: 'target',
        callback: '/api/copilot/actions/focus-deal',
        params: { dealId: criticalDeals[0].id }
      })
    }
    
    const dealsWithoutCloseDate = deals.filter(d => !d.expected_close_date).length
    if (dealsWithoutCloseDate > 0) {
      actions.push({
        id: 'set-close-dates',
        label: `Set Close Dates (${dealsWithoutCloseDate} deals)`,
        type: 'secondary',
        icon: 'calendar',
        callback: '/api/copilot/actions/bulk-update-dates'
      })
    }

    // Check if user asked for a specific number - if not, show stats first
    // Extract number from user message (e.g., "show me 5 deals" -> 5)
    let requestedNumber: number | null = null;
    if (userMessage) {
      const numberPatterns = [
        /(?:show|list|get|find|display)\s+(?:me\s+)?(\d+)\s+(?:deal|deals)/i,
        /(\d+)\s+(?:deal|deals|high\s+priority)/i,
        /(?:first|top)\s+(\d+)/i
      ];
      
      for (const pattern of numberPatterns) {
        const match = userMessage.match(pattern);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (num > 0 && num <= 100) {
            requestedNumber = num;
            break;
          }
        }
      }
    }
    
    // Show stats first if no specific number requested and there are many deals
    const showStatsFirst = !requestedNumber && (criticalDeals.length + highPriorityDeals.length) > 10;

    return {
      type: 'pipeline',
      summary,
      data: {
        criticalDeals: criticalDeals.slice(0, 10), // Limit to top 10
        highPriorityDeals: highPriorityDeals.slice(0, 10),
        healthyDeals: healthyDeals.slice(0, 5), // Show a few healthy ones
        dataIssues: dataIssues.slice(0, 10),
        metrics: {
          totalValue,
          totalDeals: deals.length,
          avgHealthScore,
          dealsAtRisk,
          closingThisWeek
        },
        showStatsFirst
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['deals', 'deal_stages'],
        confidence: 85
      }
    }
  } catch (error) {
    return null
  }
}

/**
 * Extract number from user message (e.g., "show me 3 tasks" -> 3)
 */
function extractTaskLimit(message: string): number | null {
  const numberPatterns = [
    /(?:show|list|get|find|display)\s+(?:me\s+)?(\d+)\s+(?:task|todo)/i,
    /(\d+)\s+(?:task|todo|high\s+priority\s+task)/i,
    /(?:first|top)\s+(\d+)/i
  ];
  
  for (const pattern of numberPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num <= 100) { // Reasonable limit
        return num;
      }
    }
  }
  
  return null;
}

/**
 * Structure task response from tasks data
 */
async function structureTaskResponse(
  client: any,
  userId: string,
  aiContent: string,
  userMessage?: string
): Promise<StructuredResponse | null> {
  // Store original message for summary enhancement
  const originalMessage = userMessage
  try {
    // Extract requested limit from user message
    const requestedLimit = userMessage ? extractTaskLimit(userMessage) : null;
    const limitPerCategory = requestedLimit || 5; // Default to 5 if no specific number requested
    // Fetch tasks assigned to or created by user
    const { data: tasks, error } = await client
      .from('tasks')
      .select(`
        id,
        title,
        description,
        status,
        priority,
        due_date,
        task_type,
        created_at,
        updated_at,
        contact_id,
        deal_id,
        company_id,
        meeting_id,
        contacts:contact_id(id, first_name, last_name),
        deals:deal_id(id, name),
        companies:company_id(id, name),
        meetings:meeting_id(id, title)
      `)
      .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
      .order('priority', { ascending: false })
      .order('due_date', { ascending: true })

    if (error) {
      return null
    }
    
    if (!tasks || tasks.length === 0) {
      return null
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    const urgentTasks: any[] = []
    const highPriorityTasks: any[] = []
    const dueToday: any[] = []
    const overdue: any[] = []
    const upcoming: any[] = []
    const completed: any[] = []

    let totalTasks = tasks.length
    let urgentCount = 0
    let highPriorityCount = 0
    let dueTodayCount = 0
    let overdueCount = 0
    let completedToday = 0

    for (const task of tasks) {
      // Skip completed tasks unless specifically requested
      if (task.status === 'completed') {
        const completedDate = new Date(task.updated_at)
        if (completedDate >= today) {
          completedToday++
          completed.push({
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            dueDate: task.due_date,
            isOverdue: false,
            taskType: task.task_type || 'general',
            contactId: task.contact_id,
            contactName: task.contacts ? `${task.contacts.first_name || ''} ${task.contacts.last_name || ''}`.trim() : undefined,
            dealId: task.deal_id,
            dealName: task.deals?.name,
            companyId: task.company_id,
            companyName: task.companies?.name,
            meetingId: task.meeting_id,
            meetingName: task.meetings?.title,
            createdAt: task.created_at,
            updatedAt: task.updated_at
          })
        }
        continue
      }

      // Calculate days until due
      let daysUntilDue: number | undefined
      let isOverdue = false
      if (task.due_date) {
        const dueDate = new Date(task.due_date)
        // Only calculate if date is valid
        if (!isNaN(dueDate.getTime())) {
          const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
          daysUntilDue = Math.floor((dueDateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          // Only mark as overdue if it's reasonably in the past (not more than 1 year)
          // This prevents false positives from data errors
          isOverdue = daysUntilDue < 0 && daysUntilDue > -365
        }
      }

      const taskItem = {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueDate: task.due_date,
        daysUntilDue,
        isOverdue,
        taskType: task.task_type || 'general',
        contactId: task.contact_id,
        contactName: task.contacts ? `${task.contacts.first_name || ''} ${task.contacts.last_name || ''}`.trim() : undefined,
        dealId: task.deal_id,
        dealName: task.deals?.name,
        companyId: task.company_id,
        companyName: task.companies?.name,
        meetingId: task.meeting_id,
        meetingName: task.meetings?.title,
        createdAt: task.created_at,
        updatedAt: task.updated_at
      }

      // Count metrics first
      if (task.priority === 'urgent') urgentCount++
      if (task.priority === 'high') highPriorityCount++

      // Categorize tasks (overdue takes precedence)
      if (isOverdue) {
        overdue.push(taskItem)
        overdueCount++
      } else if (daysUntilDue === 0) {
        dueToday.push(taskItem)
        dueTodayCount++
      } else if (task.priority === 'urgent') {
        urgentTasks.push(taskItem)
      } else if (task.priority === 'high') {
        highPriorityTasks.push(taskItem)
      } else if (daysUntilDue !== undefined && daysUntilDue > 0 && daysUntilDue <= 7) {
        upcoming.push(taskItem)
      }
    }

    // Calculate completion rate
    const activeTasks = tasks.filter(t => t.status !== 'completed').length
    const completionRate = totalTasks > 0 ? Math.round((completedToday / totalTasks) * 100) : 0

    // Generate summary - for general prioritize questions, mention both tasks and pipeline
    let summary = `I've analyzed your tasks. Here's what needs your attention:`
    
    // If this is a general "prioritize" question, enhance the summary
    if (originalMessage && (
      originalMessage.toLowerCase().includes('what should i prioritize') ||
      originalMessage.toLowerCase().includes('prioritize today')
    )) {
      summary = `I've analyzed your tasks for today. Here's what needs your immediate attention. You may also want to check your pipeline for deals that need follow-up.`
    }

    // Generate actions
    const actions: Array<{
      id: string
      label: string
      type: string
      icon: string
      callback: string
      params?: any
    }> = []
    if (overdue.length > 0) {
      actions.push({
        id: 'focus-overdue',
        label: `Focus on ${overdue.length} Overdue Task${overdue.length > 1 ? 's' : ''}`,
        type: 'primary',
        icon: 'alert-circle',
        callback: '/crm/tasks?filter=overdue'
      })
    }
    
    if (dueToday.length > 0) {
      actions.push({
        id: 'view-due-today',
        label: `View ${dueToday.length} Due Today`,
        type: 'secondary',
        icon: 'calendar',
        callback: '/crm/tasks?filter=due_today'
      })
    }

    if (urgentTasks.length > 0) {
      actions.push({
        id: 'view-urgent',
        label: `View ${urgentTasks.length} Urgent Task${urgentTasks.length > 1 ? 's' : ''}`,
        type: 'secondary',
        icon: 'flag',
        callback: '/crm/tasks?filter=urgent'
      })
    }

    // Use the limit extracted from user message or default
    // If user asked for a specific number, prioritize showing that many total across all categories
    // Otherwise, show up to limitPerCategory per category
    
    let urgentLimit = limitPerCategory;
    let highPriorityLimit = limitPerCategory;
    let dueTodayLimit = limitPerCategory;
    let overdueLimit = limitPerCategory;
    let upcomingLimit = limitPerCategory;
    
    // If user specified a number, distribute it intelligently
    if (requestedLimit) {
      // Prioritize: overdue > due today > urgent > high priority > upcoming
      const totalRequested = requestedLimit;
      overdueLimit = Math.min(overdue.length, Math.max(1, Math.ceil(totalRequested * 0.3)));
      dueTodayLimit = Math.min(dueToday.length, Math.max(1, Math.ceil(totalRequested * 0.25)));
      urgentLimit = Math.min(urgentTasks.length, Math.max(1, Math.ceil(totalRequested * 0.2)));
      highPriorityLimit = Math.min(highPriorityTasks.length, Math.max(1, Math.ceil(totalRequested * 0.15)));
      const remaining = totalRequested - overdueLimit - dueTodayLimit - urgentLimit - highPriorityLimit;
      upcomingLimit = Math.max(0, Math.min(upcoming.length, remaining));
      
      // Ensure we don't exceed the requested total
      const currentTotal = overdueLimit + dueTodayLimit + urgentLimit + highPriorityLimit + upcomingLimit;
      if (currentTotal > totalRequested) {
        // Reduce from least priority category
        const excess = currentTotal - totalRequested;
        upcomingLimit = Math.max(0, upcomingLimit - excess);
      }
    }
    
    // Show stats first if no specific number requested and there are many tasks
    const showStatsFirst = !requestedLimit && (urgentTasks.length + highPriorityTasks.length + overdue.length + dueToday.length) > 10;

    return {
      type: 'task',
      summary,
      data: {
        urgentTasks: urgentTasks.slice(0, urgentLimit),
        highPriorityTasks: highPriorityTasks.slice(0, highPriorityLimit),
        dueToday: dueToday.slice(0, dueTodayLimit),
        overdue: overdue.slice(0, overdueLimit),
        upcoming: upcoming.slice(0, upcomingLimit),
        completed: completed.slice(0, 3), // Show fewer completed
        showStatsFirst,
        metrics: {
          totalTasks,
          urgentCount,
          highPriorityCount,
          dueTodayCount,
          overdueCount,
          completedToday,
          completionRate
        }
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['tasks', 'contacts', 'deals', 'companies'],
        confidence: 90
      }
    }
  } catch (error) {
    return null
  }
}

/**
 * Structure calendar event search results for Copilot UI
 */
async function structureCalendarSearchResponse(
  client: any,
  userId: string,
  calendarReadResult: any,
  userMessage: string,
  temporalContext?: TemporalContextPayload
): Promise<StructuredResponse | null> {
  try {
    const timezone = await getUserTimezone(client, userId)
    const currentDate = temporalContext?.isoString
      ? new Date(temporalContext.isoString)
      : new Date()

    // Extract events from the calendar_read result
    const events = calendarReadResult?.events || []

    if (events.length === 0) {
      return null // Let AI respond with "no events found"
    }

    console.log('[CALENDAR-SEARCH] Structuring response for', events.length, 'events')

    // Map events to the format expected by CalendarResponse component
    const meetings = events.map((event: any) => {
      const startTime = event.start_time
      const endTime = event.end_time
      const startDateObj = new Date(startTime)
      let status: 'past' | 'today' | 'upcoming' = 'upcoming'

      if (startDateObj.getTime() < currentDate.getTime()) {
        status = 'past'
      } else if (isSameZonedDay(startDateObj, timezone, currentDate)) {
        status = 'today'
      }

      const attendees = (event.attendees || []).map((att: any) => ({
        name: att.name || att.email || 'Attendee',
        email: att.email || ''
      }))

      return {
        id: event.id,
        title: event.title || 'Calendar Event',
        attendees,
        startTime,
        endTime,
        status,
        location: event.location || undefined,
        hasPrepBrief: false,
        dealId: event.deal_id || undefined,
        contactId: event.contact_id || undefined
      }
    })

    // Generate appropriate summary
    const summary = events.length === 1
      ? `I found your ${events[0].title || 'event'}.`
      : `I found ${events.length} event${events.length === 1 ? '' : 's'}.`

    // Add relevant actions
    const actions: Array<{
      id: string
      label: string
      type: 'primary' | 'secondary' | 'tertiary'
      icon: string
      callback: string
      params?: any
    }> = [
      {
        id: 'open-calendar',
        label: 'Open Calendar',
        type: 'primary',
        icon: 'calendar',
        callback: '/calendar'
      }
    ]

    return {
      type: 'calendar',
      summary,
      data: {
        meetings,
        availability: [] // No availability slots for search results
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['calendar_events'],
        timezone,
        eventCount: events.length
      }
    }
  } catch (error) {
    console.error('[CALENDAR-SEARCH] Error structuring response:', error)
    return null
  }
}

/**
 * Deterministic "next meeting prep" response.
 * Finds the user's next upcoming calendar event and returns a meeting_prep structured response
 * that the frontend can render as the Meeting Prep panel.
 */
async function structureNextMeetingPrepResponse(
  client: any,
  userId: string,
  orgId: string | null,
  temporalContext?: TemporalContextPayload
): Promise<StructuredResponse | null> {
  try {
    const now = temporalContext?.isoString ? new Date(temporalContext.isoString) : new Date()
    const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    // Fetch next upcoming event from our locally-synced calendar_events table.
    // Include events that match org_id OR have null org_id (personal calendar events)
    // This ensures personal calendar events aren't filtered out when querying in org context.
    console.log('[MEETING-PREP] Querying next meeting:', {
      userId,
      orgId,
      now: now.toISOString(),
      windowEnd: windowEnd.toISOString()
    })

    let eventQuery = client
      .from('calendar_events')
      .select(
        'id, title, start_time, end_time, location, description, meeting_url, html_link, raw_data, contact_id, deal_id, company_id, org_id'
      )
      .eq('user_id', userId)
      .gt('start_time', now.toISOString())
      .lt('start_time', windowEnd.toISOString())

    // Include events that match org_id OR have null org_id (personal calendar events)
    if (orgId) {
      eventQuery = eventQuery.or(`org_id.eq.${orgId},org_id.is.null`)
    }

    // Apply ordering and limit after all filters
    eventQuery = eventQuery
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle()

    const { data: event, error: eventError } = await eventQuery

    console.log('[MEETING-PREP] Query result:', {
      found: !!event,
      eventId: event?.id,
      eventTitle: event?.title,
      eventStart: event?.start_time,
      eventOrgId: event?.org_id,
      error: eventError?.message
    })
    if (eventError) throw new Error(`Failed to load next meeting: ${eventError.message}`)

    if (!event) {
      return {
        type: 'calendar',
        summary: 'No upcoming meetings found in the next 30 days.',
        data: { meetings: [], availability: [] },
        actions: [
          {
            id: 'open-calendar',
            label: 'Open Calendar',
            type: 'primary',
            icon: 'calendar',
            callback: '/calendar',
          },
        ],
        metadata: {
          timeGenerated: new Date().toISOString(),
          dataSource: ['calendar_events'],
          range: { start: now.toISOString(), end: windowEnd.toISOString() },
        },
      }
    }

    // Resolve user email for attendee filtering
    const { data: profile } = await client
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle()
    const userEmail = profile?.email ? String(profile.email).toLowerCase() : null

    const rawAttendees = event.raw_data?.attendees || []
    const attendees = (rawAttendees || [])
      .map((a: any) => ({
        name: a?.displayName || a?.email || 'Attendee',
        email: a?.email || '',
      }))
      .filter((a: any) => a.email || a.name)
      .slice(0, 25)

    // Pick a best-effort "counterparty" attendee (not the user) to infer contact if needed
    const counterpartyEmail =
      attendees.find((a: any) => a.email && userEmail && String(a.email).toLowerCase() !== userEmail)?.email ||
      attendees.find((a: any) => a.email)?.email ||
      null

    // Resolve contact (prefer explicit link, then infer by attendee email)
    let contactRow: any = null

    if (event.contact_id) {
      let contactQuery = client
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, company_id, title, phone')
        .eq('id', event.contact_id)
        .eq('owner_id', userId)  // CRITICAL: contacts uses owner_id, NOT user_id
        .maybeSingle()
      if (orgId) contactQuery = contactQuery.eq('org_id', orgId)

      const { data: c, error: cErr } = await contactQuery
      if (cErr) throw new Error(`Failed to load linked contact: ${cErr.message}`)
      contactRow = c
    }

    if (!contactRow && counterpartyEmail) {
      let inferredQuery = client
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, company_id, title, phone')
        .eq('owner_id', userId)  // CRITICAL: contacts uses owner_id, NOT user_id
        .ilike('email', counterpartyEmail)
        .maybeSingle()
      if (orgId) inferredQuery = inferredQuery.eq('org_id', orgId)

      const { data: c2 } = await inferredQuery
      contactRow = c2
    }

    const contactName =
      contactRow?.full_name ||
      `${contactRow?.first_name || ''} ${contactRow?.last_name || ''}`.trim() ||
      counterpartyEmail ||
      'Unknown contact'

    // Company name (optional)
    let companyName: string | undefined = undefined
    if (contactRow?.company_id) {
      let companyQuery = client.from('companies').select('name').eq('id', contactRow.company_id).maybeSingle()
      if (orgId) companyQuery = companyQuery.eq('org_id', orgId)
      const { data: co } = await companyQuery
      if (co?.name) companyName = String(co.name)
    }

    // Deal context (optional)
    let dealInfo: any = undefined
    if (event.deal_id) {
      let dealQuery = client
        .from('deals')
        .select('id, name, value, stage_id, probability, owner_id')
        .eq('id', event.deal_id)
        .eq('owner_id', userId)
        .maybeSingle()
      if (orgId) dealQuery = dealQuery.eq('org_id', orgId)

      const { data: dealRow } = await dealQuery

      if (dealRow?.id) {
        // Best-effort stage name
        let stageName = String(dealRow.stage_id || 'Unknown')
        if (dealRow.stage_id) {
          const { data: stageRow } = await client
            .from('deal_stages')
            .select('name')
            .eq('id', dealRow.stage_id)
            .maybeSingle()
          if (stageRow?.name) stageName = String(stageRow.name)
        }

        dealInfo = {
          id: String(dealRow.id),
          name: String(dealRow.name || 'Deal'),
          value: Number(dealRow.value || 0),
          stage: stageName,
          probability: Number(dealRow.probability || 0),
          closeDate: undefined,
          healthScore: 50,
        }
      }
    }

    const meeting = {
      id: String(event.id),
      title: String(event.title || 'Meeting'),
      startTime: String(event.start_time),
      endTime: String(event.end_time),
      attendees,
      location: event.location || undefined,
      description: event.description || undefined,
    }

    const contact = {
      id: String(contactRow?.id || ''),
      name: contactName,
      email: String(contactRow?.email || counterpartyEmail || ''),
      company: companyName,
      title: contactRow?.title || undefined,
      phone: contactRow?.phone || undefined,
    }

    // ==========================================
    // ENHANCED PREP DATA: Fetch rich context
    // ==========================================
    
    // Fetch last interactions (activities + meetings)
    const lastInteractions: Array<{
      id: string
      type: 'email' | 'call' | 'meeting' | 'note'
      date: string
      summary: string
      keyPoints?: string[]
    }> = []
    
    // Track action items mentioned in transcripts/summaries for completion checking
    const mentionedActionItems: Array<{
      text: string
      meetingId: string
      meetingTitle: string
      meetingDate: string
      completed: boolean
    }> = []
    
    if (companyName || contactRow?.id) {
      // Get recent activities
      let activitiesQuery = client
        .from('activities')
        .select('id, type, notes, created_at, client_name')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
      
      if (orgId) {
        activitiesQuery = activitiesQuery.eq('org_id', orgId)
      }
      // Prefer contact_id filter if available (more specific), otherwise use company name
      if (contactRow?.id) {
        activitiesQuery = activitiesQuery.eq('contact_id', contactRow.id)
      } else if (companyName) {
        activitiesQuery = activitiesQuery.ilike('company_name', `%${companyName}%`)
      }
      
      const { data: activities } = await activitiesQuery
      
      if (activities) {
        for (const act of activities) {
          lastInteractions.push({
            id: String(act.id),
            type: act.type === 'meeting' ? 'meeting' : act.type === 'call' ? 'call' : act.type === 'email' ? 'email' : 'note',
            date: new Date(act.created_at).toISOString(),
            summary: act.notes || `${act.type} with ${act.client_name || contactName}`,
          })
        }
      }
      
      // Get recent meetings with structured summaries and transcripts
      let meetingsQuery = client
        .from('meetings')
        .select(`
          id,
          title,
          start_time,
          notes,
          summary,
          transcript_text,
          owner_user_id,
          meeting_structured_summaries (
            topics_discussed,
            objections_raised,
            outcome_signals
          ),
          meeting_action_items (
            id,
            title,
            completed
          )
        `)
        .eq('owner_user_id', userId)
        .order('start_time', { ascending: false })
        .limit(5)
      
      if (orgId) {
        meetingsQuery = meetingsQuery.eq('org_id', orgId)
      }
      // Prefer contact_id filter if available (more specific), otherwise use company name in title
      if (contactRow?.id) {
        meetingsQuery = meetingsQuery.eq('contact_id', contactRow.id)
      } else if (companyName) {
        meetingsQuery = meetingsQuery.ilike('title', `%${companyName}%`)
      }
      
      const { data: recentMeetings } = await meetingsQuery
      
      if (recentMeetings) {
        for (const m of recentMeetings) {
          // Skip the current meeting
          if (String(m.id) === String(event.id)) continue
          
          const structuredSummary = (m as any).meeting_structured_summaries?.[0]
          const topics = structuredSummary?.topics_discussed || []
          const keyTopics = topics.slice(0, 3)
          
          // Extract action items from transcript/summary
          const transcriptText = m.transcript_text || m.summary || ''
          if (transcriptText) {
            // Look for patterns like "I said I would:", "I will:", "I'll:", "I promised to:", etc.
            const actionItemPatterns = [
              /(?:I said I would|I will|I'll|I promised to|I committed to|I agreed to)[:;]\s*([^\.\n]+)/gi,
              /(?:I'm going to|I'm planning to|I intend to)[:;]\s*([^\.\n]+)/gi,
              /(?:action item|next step|follow up)[:;]\s*([^\.\n]+)/gi,
            ]
            
            for (const pattern of actionItemPatterns) {
              const matches = transcriptText.matchAll(pattern)
              for (const match of matches) {
                if (match[1]) {
                  const actionText = match[1].trim()
                  // Check if this action item exists in meeting_action_items and is completed
                  const meetingActionItems = (m as any).meeting_action_items || []
                  const matchingActionItem = meetingActionItems.find((ai: any) => 
                    actionText.toLowerCase().includes(ai.title.toLowerCase()) || 
                    ai.title.toLowerCase().includes(actionText.toLowerCase())
                  )
                  
                  mentionedActionItems.push({
                    text: actionText,
                    meetingId: String(m.id),
                    meetingTitle: m.title || 'Meeting',
                    meetingDate: new Date(m.start_time).toISOString(),
                    completed: matchingActionItem?.completed || false,
                  })
                }
              }
            }
          }
          
          // Also check structured action items from meeting_action_items
          const meetingActionItems = (m as any).meeting_action_items || []
          for (const ai of meetingActionItems) {
            // Only include if it's mentioned in transcript/summary or if it's a user-created action item
            const mentionedInText = transcriptText.toLowerCase().includes(ai.title.toLowerCase())
            if (mentionedInText || !transcriptText) {
              mentionedActionItems.push({
                text: ai.title,
                meetingId: String(m.id),
                meetingTitle: m.title || 'Meeting',
                meetingDate: new Date(m.start_time).toISOString(),
                completed: ai.completed || false,
              })
            }
          }
          
          // Build summary from structured data if available
          let summaryText = m.summary || m.notes || m.title || 'Meeting'
          if (keyTopics.length > 0) {
            summaryText += ` - Topics: ${keyTopics.join(', ')}`
          }
          
          lastInteractions.push({
            id: String(m.id),
            type: 'meeting',
            date: new Date(m.start_time).toISOString(),
            summary: summaryText,
            keyPoints: keyTopics,
          })
        }
      }
      
      // Also check tasks table for completed action items
      if (mentionedActionItems.length > 0 && (contactRow?.id || dealInfo?.id)) {
        let tasksQuery = client
          .from('tasks')
          .select('id, title, status')
          .eq('user_id', userId)
          .eq('status', 'done')
          .limit(20)
        
        if (orgId) tasksQuery = tasksQuery.eq('org_id', orgId)
        if (contactRow?.id) tasksQuery = tasksQuery.eq('contact_id', contactRow.id)
        if (dealInfo?.id) tasksQuery = tasksQuery.eq('deal_id', dealInfo.id)
        
        const { data: completedTasks } = await tasksQuery
        if (completedTasks) {
          // Match mentioned action items with completed tasks
          for (const mentioned of mentionedActionItems) {
            const matchingTask = completedTasks.find((t: any) =>
              mentioned.text.toLowerCase().includes(t.title.toLowerCase()) ||
              t.title.toLowerCase().includes(mentioned.text.toLowerCase())
            )
            if (matchingTask && !mentioned.completed) {
              mentioned.completed = true
            }
          }
        }
      }
    }
    
    // Sort by date (most recent first) and limit to 5
    lastInteractions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const lastInteractionsFinal = lastInteractions.slice(0, 5)
    
    // Fetch deal risk signals
    const risks: string[] = []
    if (dealInfo?.id) {
      let risksQuery = client
        .from('deal_risk_signals')
        .select('title, description, severity')
        .eq('deal_id', dealInfo.id)
        .eq('status', 'active')
        .order('severity', { ascending: false })
        .limit(5)
      
      if (orgId) risksQuery = risksQuery.eq('org_id', orgId)
      
      const { data: riskSignals } = await risksQuery
      if (riskSignals) {
        for (const signal of riskSignals) {
          const severity = signal.severity === 'critical' ? '🚨' : signal.severity === 'high' ? '⚠️' : ''
          risks.push(`${severity} ${signal.title || signal.description || 'Risk identified'}`)
        }
      }
    }
    
    // Fetch action items (tasks related to contact/deal)
    const actionItems: Array<{
      id: string
      title: string
      status: 'pending' | 'completed'
      assignedTo?: string
      dueDate?: string
      fromMeeting?: string
    }> = []
    
    if (contactRow?.id || dealInfo?.id) {
      // Build base query with type assertion for proper inference
      type TaskRow = { id: string; title: string; status: string; due_date: string | null; assigned_to: string | null; contact_id: string | null; deal_id: string | null }
      
      let baseQuery = client
        .from('tasks')
        .select('id, title, status, due_date, assigned_to, contact_id, deal_id')
        .eq('user_id', userId)
        .in('status', ['todo', 'in_progress'])
        .order('due_date', { ascending: true })
        .limit(5)
      
      if (orgId) {
        baseQuery = baseQuery.eq('org_id', orgId)
      }
      // Filter by contact_id or deal_id (can match either)
      if (contactRow?.id && dealInfo?.id) {
        baseQuery = baseQuery.or(`contact_id.eq.${contactRow.id},deal_id.eq.${dealInfo.id}`)
      } else if (contactRow?.id) {
        baseQuery = baseQuery.eq('contact_id', contactRow.id)
      } else if (dealInfo?.id) {
        baseQuery = baseQuery.eq('deal_id', dealInfo.id)
      }
      
      const { data: tasks } = await baseQuery as { data: TaskRow[] | null }
      if (tasks) {
        for (const task of tasks) {
          actionItems.push({
            id: String(task.id),
            title: String(task.title),
            status: task.status === 'done' ? 'completed' : 'pending',
            dueDate: task.due_date ? new Date(task.due_date).toISOString() : undefined,
          })
        }
      }
    }
    
    // Calculate relationship duration and previous meetings count
    let relationshipDuration = '—'
    let previousMeetings = 0
    let lastMeetingDate: string | undefined = undefined
    
    if (contactRow?.id) {
      // Get contact creation date
      const { data: contactData } = await client
        .from('contacts')
        .select('created_at')
        .eq('id', contactRow.id)
        .maybeSingle()
      
      if (contactData?.created_at) {
        const contactCreated = new Date(contactData.created_at)
        const daysSince = Math.floor((now.getTime() - contactCreated.getTime()) / (1000 * 60 * 60 * 24))
        if (daysSince < 30) relationshipDuration = `${daysSince} days`
        else if (daysSince < 365) relationshipDuration = `${Math.floor(daysSince / 30)} months`
        else relationshipDuration = `${Math.floor(daysSince / 365)} years`
      }
      
      // Count previous meetings
      let meetingsCountQuery = client
        .from('meetings')
        .select('id, start_time', { count: 'exact' })
        .eq('owner_user_id', userId)
        .eq('contact_id', contactRow.id)
        .lt('start_time', event.start_time)
      
      if (orgId) {
        meetingsCountQuery = meetingsCountQuery.eq('org_id', orgId)
      }
      
      const { data: prevMeetings, count } = await meetingsCountQuery
      previousMeetings = count || 0
      
      // Get last meeting date
      if (prevMeetings && prevMeetings.length > 0) {
        const sorted = prevMeetings.sort((a: any, b: any) => 
          new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
        )
        lastMeetingDate = sorted[0].start_time
      }
    }
    
    // Generate talking points and discovery questions using Claude (if API key available)
    let talkingPoints: string[] = []
    let discoveryQuestions: string[] = []
    let opportunities: string[] = []
    
    if (ANTHROPIC_API_KEY) {
      try {
        // Build context for AI
        const contextParts: string[] = []
        if (meeting.title) contextParts.push(`Meeting: ${meeting.title}`)
        if (companyName) contextParts.push(`Company: ${companyName}`)
        if (dealInfo) {
          contextParts.push(`Deal: ${dealInfo.name} - Stage: ${dealInfo.stage} - Value: ${dealInfo.value}`)
        }
        if (lastInteractionsFinal.length > 0) {
          contextParts.push(`Recent interactions: ${lastInteractionsFinal.slice(0, 3).map(i => i.summary).join('; ')}`)
        }
        if (risks.length > 0) {
          contextParts.push(`Risks: ${risks.slice(0, 3).join('; ')}`)
        }
        
        // Add action items context - mention completed ones
        const completedActionItems = mentionedActionItems.filter(ai => ai.completed)
        const pendingActionItems = mentionedActionItems.filter(ai => !ai.completed)
        
        if (completedActionItems.length > 0) {
          contextParts.push(`Completed action items from previous meetings: ${completedActionItems.slice(0, 3).map(ai => `"${ai.text}" (from ${ai.meetingTitle})`).join('; ')}`)
        }
        if (pendingActionItems.length > 0) {
          contextParts.push(`Pending action items: ${pendingActionItems.slice(0, 3).map(ai => `"${ai.text}" (from ${ai.meetingTitle})`).join('; ')}`)
        }
        
        const context = contextParts.join('\n')
        
        // Generate talking points and discovery questions in one call
        const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1000,
            temperature: 0.5,
            system: 'You are a sales preparation assistant. Generate specific, actionable talking points and discovery questions for an upcoming meeting. When action items from previous meetings have been completed, acknowledge them naturally (e.g., "I mentioned I would do X, and I\'ve completed it"). Return ONLY valid JSON.',
            messages: [{
              role: 'user',
              content: `Generate meeting prep for this meeting:

${context}

Generate:
1. 3-4 specific talking points that address risks, move the deal forward, and build on previous conversations. If there are completed action items, naturally acknowledge them (e.g., "I said I would: {action_item} and I have completed it").
2. 3-4 discovery questions appropriate for the deal stage (if applicable) or general discovery
3. 2-3 opportunities or positive signals to leverage

Return JSON: {
  "talkingPoints": ["point1", "point2", "point3"],
  "discoveryQuestions": ["question1", "question2", "question3"],
  "opportunities": ["opportunity1", "opportunity2"]
}`
            }],
          }),
        })
        
        if (aiResponse.ok) {
          const result = await aiResponse.json()
          const content = result.content[0]?.text
          const parsed = JSON.parse(content)
          talkingPoints = parsed.talkingPoints || []
          discoveryQuestions = parsed.discoveryQuestions || []
          opportunities = parsed.opportunities || []
        }
      } catch (error) {
        console.error('[MEETING-PREP] Error generating AI content:', error)
      }
    }
    
    // Fallback talking points if AI failed
    if (talkingPoints.length === 0) {
      talkingPoints = [
        'Review any previous discussions and follow up on open items',
        'Understand their current priorities and challenges',
        'Identify next steps to move the conversation forward',
      ]
      if (risks.length > 0) {
        talkingPoints.unshift('Address any timeline or budget concerns directly')
      }
    }
    
    // Fallback discovery questions if AI failed
    if (discoveryQuestions.length === 0) {
      if (dealInfo?.stage) {
        const stageLower = dealInfo.stage.toLowerCase()
        if (stageLower.includes('sql') || stageLower.includes('qualification')) {
          discoveryQuestions = [
            'What specific challenges are you trying to solve?',
            'Who else is involved in this decision?',
            'What does your timeline look like?',
          ]
        } else if (stageLower.includes('opportunity') || stageLower.includes('proposal')) {
          discoveryQuestions = [
            'What feedback do you have on the proposal?',
            'Are there any concerns we haven\'t addressed?',
            'Who else needs to see this before you can move forward?',
          ]
        } else {
          discoveryQuestions = [
            'What are your main priorities for this call?',
            'What questions do you have for us?',
            'What would make this meeting successful for you?',
          ]
        }
      } else {
        discoveryQuestions = [
          'What are your main priorities for this call?',
          'What questions do you have for us?',
          'What would make this meeting successful for you?',
        ]
      }
    }
    
    // Fallback opportunities if AI failed
    if (opportunities.length === 0 && dealInfo) {
      opportunities = [
        `Deal is in ${dealInfo.stage} stage with ${dealInfo.probability}% probability`,
        `Deal value: ${dealInfo.value}`,
      ]
    }

    return {
      type: 'meeting_prep',
      summary: `Meeting prep: ${meeting.title}`,
      data: {
        meeting,
        contact,
        deal: dealInfo,
        lastInteractions: lastInteractionsFinal,
        talkingPoints,
        discoveryQuestions,
        actionItems,
        risks,
        opportunities,
        context: {
          relationshipDuration,
          previousMeetings,
          lastMeetingDate,
          dealStage: dealInfo?.stage,
          dealValue: dealInfo?.value,
        },
      },
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['calendar_events', 'activities', 'meetings', 'tasks', 'deal_risk_signals'],
      },
    }
  } catch (error) {
    console.error('[MEETING-PREP] Error structuring next meeting prep response:', error)
    return null
  }
}

/**
 * Structure calendar availability info for Copilot UI
 */
async function structureCalendarAvailabilityResponse(
  client: any,
  userId: string,
  userMessage?: string,
  temporalContext?: TemporalContextPayload
): Promise<StructuredResponse | null> {
  try {
    const timezone = await getUserTimezone(client, userId)
    // Use temporal context date if available, otherwise fall back to current date
    const currentDate = temporalContext?.isoString 
      ? new Date(temporalContext.isoString) 
      : new Date()
    const request = inferAvailabilityRequestFromMessage(userMessage, timezone, currentDate)

    const availabilityResult = await handleCalendarAvailability(
      {
        startDate: request.start.toISOString(),
        endDate: request.end.toISOString(),
        durationMinutes: request.durationMinutes,
        workingHoursStart: request.workingHoursStart,
        workingHoursEnd: request.workingHoursEnd,
        excludeWeekends: request.excludeWeekends
      },
      client,
      userId
    )

    if (!availabilityResult) {
      return null
    }

    const now = currentDate
    const meetings = (availabilityResult.events || []).map((event: any) => {
      const startTime = event.start_time
      const endTime = event.end_time
      const startDateObj = new Date(startTime)
      let status: 'past' | 'today' | 'upcoming' = 'upcoming'
      if (startDateObj.getTime() < now.getTime()) {
        status = 'past'
      } else if (isSameZonedDay(startDateObj, timezone, currentDate)) {
        status = 'today'
      }

      const attendees = (event.attendees || []).map((att: any) => ({
        name: att.name || att.email || 'Attendee',
        email: att.email || ''
      }))

      return {
        id: event.id,
        title: event.title || 'Calendar Event',
        attendees,
        startTime,
        endTime,
        status,
        location: event.location || undefined,
        hasPrepBrief: false,
        dealId: event.deal_id || undefined,
        contactId: event.contact_id || undefined
      }
    }).slice(0, 10)

    const availabilitySlots = (availabilityResult.availableSlots || []).map((slot: any) => ({
      startTime: slot.start,
      endTime: slot.end,
      duration: slot.durationMinutes
    }))

    const slotSummary = availabilitySlots.length > 0
      ? formatAvailabilitySlotSummary(availabilitySlots[0], timezone)
      : null

    const summary = availabilitySlots.length > 0
      ? `You're free ${slotSummary}. I found ${availabilitySlots.length} open slot${availabilitySlots.length === 1 ? '' : 's'} ${request.description}.`
      : `No ${request.durationMinutes}-minute blocks are available ${request.description}. Try expanding the range or adjusting working hours.`

    const actions: Array<{
      id: string
      label: string
      type: 'primary' | 'secondary' | 'tertiary'
      icon: string
      callback: string
      params?: any
    }> = [
      {
        id: 'open-calendar',
        label: 'Open Calendar',
        type: 'primary',
        icon: 'calendar',
        callback: '/calendar'
      }
    ]

    if (availabilitySlots.length > 0) {
      actions.push({
        id: 'copy-availability',
        label: 'Copy availability summary',
        type: 'secondary',
        icon: 'clipboard',
        callback: 'copilot://copy-availability',
        params: {
          timezone,
          slots: availabilitySlots.slice(0, 3)
        }
      })
    }

    return {
      type: 'calendar',
      summary,
      data: {
        meetings,
        availability: availabilitySlots
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['calendar_events'],
        timezone,
        dateRange: availabilityResult.range,
        requestedDurationMinutes: availabilityResult.durationMinutes,
        workingHours: availabilityResult.workingHours,
        slotsEvaluated: availabilityResult.totalAvailableSlots,
        totalFreeMinutes: availabilityResult.summary?.totalFreeMinutes,
        totalBusyMinutes: availabilityResult.summary?.totalBusyMinutes
      }
    }
  } catch (error) {
    console.error('[STRUCTURED] Error building calendar availability response', error)
    return null
  }
}

/**
 * Shared helpers for calendar availability calculations
 */
function clampDurationMinutes(value: number): number {
  if (!value || Number.isNaN(value)) {
    return 60
  }
  return Math.min(240, Math.max(15, Math.round(value)))
}

function normalizeTimeInput(value: string | undefined, fallback: string): string {
  const pattern = /^([01]?\d|2[0-3]):([0-5]\d)$/
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (pattern.test(trimmed)) {
      const [hours, minutes] = trimmed.split(':')
      return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
    }
  }
  return fallback
}

function parseDateInput(value?: string, fallback?: Date): Date {
  if (value) {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) {
      return parsed
    }
  }
  return fallback ? new Date(fallback) : new Date()
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date)
  result.setTime(result.getTime() + minutes * 60000)
  return result
}

function startOfZonedDay(date: Date, timeZone: string): Date {
  const parts = getZonedDateParts(date, timeZone)
  return zonedDateTimeToUtc(parts.year, parts.month, parts.day, 0, 0, 0, timeZone)
}

function endOfZonedDay(date: Date, timeZone: string): Date {
  const parts = getZonedDateParts(date, timeZone)
  return zonedDateTimeToUtc(parts.year, parts.month, parts.day, 23, 59, 59, timeZone)
}

function zonedTimeOnDate(date: Date, timeString: string, timeZone: string): Date {
  const parts = getZonedDateParts(date, timeZone)
  const [hours = '0', minutes = '0'] = timeString.split(':')
  const hourNum = Math.min(23, Math.max(0, parseInt(hours, 10) || 0))
  const minuteNum = Math.min(59, Math.max(0, parseInt(minutes, 10) || 0))
  return zonedDateTimeToUtc(parts.year, parts.month, parts.day, hourNum, minuteNum, 0, timeZone)
}

function getZonedDateParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; weekday: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  })

  const partValues: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      partValues[part.type] = part.value
    }
  }

  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6
  }

  const weekday = weekdayMap[(partValues.weekday || '').slice(0, 3).toLowerCase()] ?? 0

  return {
    year: Number(partValues.year),
    month: Number(partValues.month),
    day: Number(partValues.day),
    weekday
  }
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const offsetMinutes = getTimezoneOffsetMinutes(timeZone, utcDate)
  return new Date(utcDate.getTime() - offsetMinutes * 60000)
}

function getTimezoneOffsetMinutes(timeZone: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

  const partValues: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      partValues[part.type] = part.value
    }
  }

  const asUTC = Date.UTC(
    Number(partValues.year),
    Number(partValues.month) - 1,
    Number(partValues.day),
    Number(partValues.hour),
    Number(partValues.minute),
    Number(partValues.second)
  )

  return (asUTC - date.getTime()) / 60000
}

function mergeIntervals(intervals: Array<{ start: Date; end: Date }>): Array<{ start: Date; end: Date }> {
  if (!intervals.length) {
    return []
  }
  const sorted = intervals
    .map(interval => ({
      start: new Date(interval.start.getTime()),
      end: new Date(interval.end.getTime())
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const merged: Array<{ start: Date; end: Date }> = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]
    if (current.start <= last.end) {
      if (current.end > last.end) {
        last.end = current.end
      }
    } else {
      merged.push(current)
    }
  }
  return merged
}

function calculateFreeSlotsForDay(
  dayStart: Date,
  dayEnd: Date,
  busyIntervals: Array<{ start: Date; end: Date }>,
  durationMinutes: number
): Array<{ start: Date; end: Date; durationMinutes: number }> {
  const available: Array<{ start: Date; end: Date; durationMinutes: number }> = []
  const merged = mergeIntervals(busyIntervals)
  let cursor = new Date(dayStart)

  for (const interval of merged) {
    if (interval.start > cursor) {
      const gapMinutes = (interval.start.getTime() - cursor.getTime()) / 60000
      if (gapMinutes >= durationMinutes) {
        available.push({
          start: new Date(cursor),
          end: new Date(interval.start),
          durationMinutes: gapMinutes
        })
      }
    }
    if (interval.end > cursor) {
      cursor = new Date(interval.end)
    }
  }

  if (cursor < dayEnd) {
    const gapMinutes = (dayEnd.getTime() - cursor.getTime()) / 60000
    if (gapMinutes >= durationMinutes) {
      available.push({
        start: new Date(cursor),
        end: new Date(dayEnd),
        durationMinutes: gapMinutes
      })
    }
  }

  return available
}

async function getUserTimezone(client: any, userId: string): Promise<string> {
  // Priority order:
  // 1. Calendar integration (most accurate - detected from Google Calendar)
  // 2. user_settings.preferences.timezone
  // 3. profiles.timezone (if exists)
  // 4. Default to Europe/London (UK timezone with automatic DST handling)

  try {
    // First, check calendar_calendars for timezone detected from Google Calendar
    const { data: calendarData, error: calendarError } = await client
      .from('calendar_calendars')
      .select('timezone')
      .eq('user_id', userId)
      .eq('external_id', 'primary')
      .maybeSingle()
    
    if (!calendarError && calendarData?.timezone) {
      console.log('[TIMEZONE] Using timezone from calendar integration:', calendarData.timezone)
      return calendarData.timezone
    }
  } catch (_err) {
    // Ignore errors - table might not exist or column might not exist
  }

  try {
    // Check user_settings preferences
    const { data: settingsData, error: settingsError } = await client
      .from('user_settings')
      .select('preferences')
      .eq('user_id', userId)
      .maybeSingle()
    
    if (!settingsError && settingsData?.preferences?.timezone) {
      const tz = settingsData.preferences.timezone
      console.log('[TIMEZONE] Using timezone from user_settings:', tz)
      return tz
    }
  } catch (_err) {
    // Ignore errors
  }

  try {
    // Check profiles table (if exists)
    const { data: profileData, error: profileError } = await client
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle()
    
    if (!profileError && profileData?.timezone) {
      console.log('[TIMEZONE] Using timezone from profiles:', profileData.timezone)
      return profileData.timezone
    }
  } catch (_err) {
    // Ignore missing column or table errors
  }

  // Default to Europe/London (UK timezone - automatically handles daylight savings)
  console.log('[TIMEZONE] Using default timezone: Europe/London')
  return 'Europe/London'
}

interface AvailabilityRequestDetails {
  start: Date
  end: Date
  durationMinutes: number
  workingHoursStart: string
  workingHoursEnd: string
  excludeWeekends: boolean
  description: string
}

function inferAvailabilityRequestFromMessage(
  message: string | undefined,
  timeZone: string,
  currentDate: Date = new Date()
): AvailabilityRequestDetails {
  const lower = (message || '').toLowerCase()
  const duration = extractDurationFromMessage(lower) ?? 60
  const workingHoursStart = lower.includes('early morning') ? '08:00' : '09:00'
  const workingHoursEnd = lower.includes('evening') ? '19:00' : '17:00'
  const excludeWeekends = !(lower.includes('weekend') || lower.includes('weekends'))

  let description = 'over the next week'
  let start = startOfZonedDay(currentDate, timeZone)
  let end = endOfZonedDay(addDays(start, 6), timeZone)

  if (lower.includes('today')) {
    start = startOfZonedDay(currentDate, timeZone)
    end = endOfZonedDay(currentDate, timeZone)
    return {
      start,
      end,
      durationMinutes: duration,
      workingHoursStart,
      workingHoursEnd,
      excludeWeekends,
      description: `today (${formatHumanReadableRange(start, end, timeZone)})`
    }
  }

  if (lower.includes('tomorrow')) {
    const tomorrow = addDays(currentDate, 1)
    start = startOfZonedDay(tomorrow, timeZone)
    end = endOfZonedDay(tomorrow, timeZone)
    return {
      start,
      end,
      durationMinutes: duration,
      workingHoursStart,
      workingHoursEnd,
      excludeWeekends,
      description: `tomorrow (${formatHumanReadableRange(start, end, timeZone)})`
    }
  }

  if (lower.includes('next week')) {
    const nextWeekStart = startOfWeekZoned(addDays(currentDate, 7), timeZone)
    start = nextWeekStart
    end = endOfWeekZoned(nextWeekStart, timeZone)
    return {
      start,
      end,
      durationMinutes: duration,
      workingHoursStart,
      workingHoursEnd,
      excludeWeekends,
      description: `next week (${formatHumanReadableRange(start, end, timeZone)})`
    }
  }

  if (lower.includes('this week')) {
    start = startOfWeekZoned(currentDate, timeZone)
    end = endOfWeekZoned(start, timeZone)
    return {
      start,
      end,
      durationMinutes: duration,
      workingHoursStart,
      workingHoursEnd,
      excludeWeekends,
      description: `this week (${formatHumanReadableRange(start, end, timeZone)})`
    }
  }

  const dayMap: Array<{ key: string; index: number }> = [
    { key: 'sunday', index: 0 },
    { key: 'monday', index: 1 },
    { key: 'tuesday', index: 2 },
    { key: 'wednesday', index: 3 },
    { key: 'thursday', index: 4 },
    { key: 'friday', index: 5 },
    { key: 'saturday', index: 6 }
  ]

  for (const day of dayMap) {
    if (lower.includes(day.key)) {
      const preferNextWeek = lower.includes('next week') || lower.includes(`next ${day.key}`) || lower.includes('this coming')
      const dayDate = getNextWeekdayDate(day.index, preferNextWeek, timeZone, currentDate)
      start = startOfZonedDay(dayDate, timeZone)
      end = endOfZonedDay(dayDate, timeZone)
      return {
        start,
        end,
        durationMinutes: duration,
        workingHoursStart,
        workingHoursEnd,
        excludeWeekends,
        description: `on ${formatHumanReadableRange(start, end, timeZone)}`
      }
    }
  }

  return {
    start,
    end,
    durationMinutes: duration,
    workingHoursStart,
    workingHoursEnd,
    excludeWeekends,
    description
  }
}

function extractDurationFromMessage(messageLower: string): number | null {
  if (!messageLower) return null
  const durationMatch = messageLower.match(/(\d+)\s*(?:-?\s*)(minute|minutes|min|mins|hour|hours|hr|hrs)/)
  if (durationMatch && durationMatch[1]) {
    const value = parseInt(durationMatch[1], 10)
    if (!isNaN(value)) {
      if (durationMatch[2].includes('hour') || durationMatch[2].includes('hr')) {
        return clampDurationMinutes(value * 60)
      }
      return clampDurationMinutes(value)
    }
  }
  if (messageLower.includes('half hour') || messageLower.includes('half-hour')) {
    return 30
  }
  if (messageLower.includes('quarter hour') || messageLower.includes('quarter-hour')) {
    return 15
  }
  return null
}

function startOfWeekZoned(date: Date, timeZone: string): Date {
  const start = startOfZonedDay(date, timeZone)
  const { weekday } = getZonedDateParts(date, timeZone)
  const daysToSubtract = (weekday + 6) % 7
  return addDays(start, -daysToSubtract)
}

function endOfWeekZoned(startOfWeek: Date, timeZone: string): Date {
  return endOfZonedDay(addDays(startOfWeek, 6), timeZone)
}

function getNextWeekdayDate(targetDay: number, preferNextWeek: boolean, timeZone: string, currentDate: Date = new Date()): Date {
  const todayStart = startOfZonedDay(currentDate, timeZone)
  const { weekday } = getZonedDateParts(todayStart, timeZone)
  let daysAhead = (targetDay - weekday + 7) % 7
  if (daysAhead === 0 && !preferNextWeek) {
    return todayStart
  }
  if (preferNextWeek) {
    daysAhead = daysAhead === 0 ? 7 : daysAhead + 7
  }
  return addDays(todayStart, daysAhead || 7)
}

function isSameZonedDay(date: Date, timeZone: string, currentDate: Date = new Date()): boolean {
  const partsA = getZonedDateParts(date, timeZone)
  const partsB = getZonedDateParts(currentDate, timeZone)
  return partsA.year === partsB.year && partsA.month === partsB.month && partsA.day === partsB.day
}

function formatHumanReadableRange(start: Date, end: Date, timeZone: string): string {
  const startFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
  const endFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric'
  })
  const sameDay = isSameZonedDay(start, timeZone) && isSameZonedDay(end, timeZone)
  if (sameDay) {
    return startFormatter.format(start)
  }
  return `${startFormatter.format(start)} and ${endFormatter.format(end)}`
}

function formatAvailabilitySlotSummary(
  slot: { startTime: string; endTime: string },
  timeZone: string
): string {
  const start = new Date(slot.startTime)
  const end = new Date(slot.endTime)
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit'
  })
  return `${dayFormatter.format(start)} at ${timeFormatter.format(start)} – ${timeFormatter.format(end)}`
}

/**
 * Structure roadmap response from roadmap creation
 */
async function structureRoadmapResponse(
  client: any,
  userId: string,
  aiContent: string,
  userMessage: string
): Promise<any | null> {
  try {
    // Try to extract roadmap item from AI content (tool result may be in the content)
    // Look for JSON in the content that matches roadmap item structure
    let roadmapItem: TaskData | null = null
    
    // Try to parse roadmap item from AI content
    try {
      // Look for JSON objects in the content
      const jsonMatch = aiContent.match(/\{[\s\S]*"roadmapItem"[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.roadmapItem) {
          roadmapItem = parsed.roadmapItem
        } else if (parsed.success && parsed.roadmapItem) {
          roadmapItem = parsed.roadmapItem
        }
      }
    } catch (e) {
      // JSON parsing failed, continue to fetch from DB
    }
    
    // If not found in content, fetch the most recent roadmap item created by user
    if (!roadmapItem) {
      const { data: recentItems, error } = await client
        .from('roadmap_suggestions')
        .select('*')
        .eq('submitted_by', userId)
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (error || !recentItems || recentItems.length === 0) {
        return null
      }
      
      roadmapItem = recentItems[0] as TaskData
    }
    
    if (!roadmapItem) {
      return null
    }
    
    // Extract title from user message if available
    const titleMatch = userMessage.match(/roadmap item for:\s*(.+)/i) || 
                      userMessage.match(/add.*roadmap.*for:\s*(.+)/i) ||
                      userMessage.match(/create.*roadmap.*for:\s*(.+)/i)
    
    const summary = titleMatch 
      ? `I'll create a roadmap item for: ${titleMatch[1].trim()}`
      : `I've successfully created a roadmap item.`
    
    return {
      type: 'roadmap',
      summary: summary || 'Roadmap item created successfully',
      data: {
        roadmapItem: {
          id: roadmapItem.id,
          ticket_id: roadmapItem.ticket_id || null,
          title: roadmapItem.title,
          description: roadmapItem.description || null,
          type: roadmapItem.type || 'feature',
          priority: roadmapItem.priority || 'medium',
          status: roadmapItem.status || 'submitted',
          submitted_by: roadmapItem.submitted_by,
          created_at: roadmapItem.created_at,
          updated_at: roadmapItem.updated_at
        },
        success: true,
        message: `Roadmap item "${roadmapItem.title}" created successfully`
      },
      actions: [
        {
          id: 'view-roadmap',
          label: 'View Roadmap',
          type: 'secondary' as const,
          icon: 'file-text',
          callback: '/admin/roadmap',
          params: {}
        }
      ],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['roadmap_suggestions'],
        confidence: 95
      }
    }
  } catch (error) {
    return null
  }
}

/**
 * Structure action summary response from successful tool executions
 * Groups create/update/delete operations and presents them in a user-friendly format
 */
async function structureActionSummaryResponse(
  client: any,
  userId: string,
  writeOperations: ToolExecutionDetail[],
  userMessage: string
): Promise<StructuredResponse | null> {
  try {
    const actions: Array<{
      id: string
      label: string
      type: string
      icon: string
      callback: string
      params?: any
    }> = []
    
    const actionItems: Array<{
      entityType: string
      operation: string
      entityId?: string
      entityName?: string
      details?: string
      success: boolean
    }> = []
    
    let dealsUpdated = 0
    let clientsUpdated = 0
    let tasksCreated = 0
    let activitiesCreated = 0
    let contactsUpdated = 0
    let calendarEventsUpdated = 0
    
    // Process each write operation
    for (const exec of writeOperations) {
      const [entity, operation] = exec.toolName.split('_')
      const result = exec.result
      
      if (!result || !result.success) continue
      
      let entityType = entity
      let entityId: string | undefined
      let entityName: string | undefined
      let details: string | undefined
      
      // Extract entity information based on operation type
      if (operation === 'create') {
        if (entity === 'pipeline' && result.deal) {
          entityType = 'deal'
          entityId = result.deal.id
          entityName = result.deal.name || result.deal.company
          dealsUpdated++
        } else if (entity === 'clients' && result.client) {
          entityType = 'client'
          entityId = result.client.id
          entityName = result.client.company_name
          if (result.client.subscription_amount) {
            details = `Subscription: £${parseFloat(result.client.subscription_amount).toLocaleString()}/month`
          }
          clientsUpdated++
        } else if (entity === 'tasks' && result.task) {
          entityType = 'task'
          entityId = result.task.id
          entityName = result.task.title
          tasksCreated++
        } else if (entity === 'activities' && result.activity) {
          entityType = 'activity'
          entityId = result.activity.id
          entityName = result.activity.client_name || result.activity.type
          activitiesCreated++
        } else if (entity === 'leads' && result.contact) {
          entityType = 'contact'
          entityId = result.contact.id
          entityName = result.contact.full_name || result.contact.email
          if (result.contact.company_id) {
            details = `Created contact with company link`
          }
          contactsUpdated++
        } else if (entity === 'calendar' && result.event) {
          entityType = 'calendar_event'
          entityId = result.event.id
          entityName = result.event.title
          // Format the event time
          if (result.event.start_time) {
            const startTime = new Date(result.event.start_time)
            const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            details = `Scheduled for ${dateStr} at ${timeStr}`
          } else {
            details = 'Event created successfully'
          }
          calendarEventsUpdated++
        }
      } else if (operation === 'update') {
        if (entity === 'pipeline' && result.deal) {
          entityType = 'deal'
          entityId = result.deal.id
          entityName = result.deal.name || result.deal.company
          // Check if status was updated to 'won'
          if (exec.args.status === 'won') {
            details = 'Marked as closed won'
          } else {
            details = 'Updated successfully'
          }
          dealsUpdated++
        } else if (entity === 'clients' && result.client) {
          entityType = 'client'
          entityId = result.client.id
          entityName = result.client.company_name
          if (exec.args.subscription_amount !== undefined) {
            details = `Subscription updated to £${parseFloat(exec.args.subscription_amount).toLocaleString()}/month`
          } else {
            details = 'Updated successfully'
          }
          clientsUpdated++
        } else if (entity === 'leads' && result.contact) {
          entityType = 'contact'
          entityId = result.contact.id
          entityName = result.contact.full_name || result.contact.email || result.contact.first_name
          // Try to detect what was updated
          if (exec.args.company_id || exec.args.company) {
            details = `Company updated to ${exec.args.company || 'linked company'}`
          } else {
            details = 'Contact updated successfully'
          }
          contactsUpdated++
        } else if (entity === 'calendar' && result.event) {
          entityType = 'calendar_event'
          entityId = result.event.id
          entityName = result.event.title
          // Try to detect what was updated
          if (exec.args.start_time || exec.args.end_time) {
            const startTime = exec.args.start_time ? new Date(exec.args.start_time) : null
            if (startTime) {
              const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              details = `Rescheduled to ${timeStr}`
            } else {
              details = 'Event updated successfully'
            }
          } else {
            details = 'Event updated successfully'
          }
          calendarEventsUpdated++
        }
      }
      
      if (entityId) {
        actionItems.push({
          entityType,
          operation,
          entityId,
          entityName,
          details,
          success: true
        })
      }
    }
    
    // Generate summary text
    const actionCounts: string[] = []
    if (dealsUpdated > 0) actionCounts.push(`${dealsUpdated} deal${dealsUpdated > 1 ? 's' : ''}`)
    if (clientsUpdated > 0) actionCounts.push(`${clientsUpdated} client${clientsUpdated > 1 ? 's' : ''}`)
    if (contactsUpdated > 0) actionCounts.push(`${contactsUpdated} contact${contactsUpdated > 1 ? 's' : ''}`)
    if (tasksCreated > 0) actionCounts.push(`${tasksCreated} task${tasksCreated > 1 ? 's' : ''}`)
    if (activitiesCreated > 0) actionCounts.push(`${activitiesCreated} activit${activitiesCreated > 1 ? 'ies' : 'y'}`)
    if (calendarEventsUpdated > 0) actionCounts.push(`${calendarEventsUpdated} calendar event${calendarEventsUpdated > 1 ? 's' : ''}`)
    
    const summary = actionCounts.length > 0
      ? `I've successfully completed your request. Updated ${actionCounts.join(', ')}.`
      : "I've completed the requested actions."
    
    // Generate quick actions
    if (dealsUpdated > 0) {
      actions.push({
        id: 'view-pipeline',
        label: 'View Pipeline',
        type: 'primary',
        icon: 'briefcase',
        callback: '/crm/pipeline'
      })
    }
    
    if (clientsUpdated > 0) {
      actions.push({
        id: 'view-clients',
        label: 'View Clients',
        type: 'secondary',
        icon: 'users',
        callback: '/crm/clients'
      })
    }
    
    if (contactsUpdated > 0) {
      actions.push({
        id: 'view-contacts',
        label: 'View Contacts',
        type: 'secondary',
        icon: 'users',
        callback: '/crm/contacts'
      })
    }
    
    if (tasksCreated > 0) {
      actions.push({
        id: 'view-tasks',
        label: 'View Tasks',
        type: 'secondary',
        icon: 'check-circle',
        callback: '/crm/tasks'
      })
    }

    if (calendarEventsUpdated > 0) {
      actions.push({
        id: 'view-calendar',
        label: 'View Calendar',
        type: 'secondary',
        icon: 'calendar',
        callback: '/calendar'
      })
    }

    return {
      type: 'action_summary',
      summary,
      data: {
        actionsCompleted: actionItems.length,
        actionItems,
        metrics: {
          dealsUpdated,
          clientsUpdated,
          contactsUpdated,
          tasksCreated,
          activitiesCreated,
          calendarEventsUpdated
        }
      },
      actions,
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['tool_executions'],
        confidence: 100
      }
    }
  } catch (error) {
    console.error('[ACTION-SUMMARY] Error generating action summary:', error)
    return null
  }
}

/**
 * Structure sales coach response with performance analysis
 */
async function structureSalesCoachResponse(
  client: any,
  userId: string,
  aiContent: string,
  userMessage: string,
  requestingUserId?: string
): Promise<StructuredResponse | null> {
  try {
    console.log('[SALES-COACH] Starting structureSalesCoachResponse:', {
      userId,
      requestingUserId,
      userMessage: userMessage.substring(0, 100),
      isAdminQuery: requestingUserId && requestingUserId !== userId
    })
    
    // Check if requesting user is admin (if different from target user)
    const isAdminQuery = requestingUserId && requestingUserId !== userId
    let targetUserName = 'You'
    
    if (isAdminQuery) {
      console.log('[SALES-COACH] Admin query detected, verifying permissions...')
      // Verify requesting user is admin
      const { data: requestingUser } = await client
        .from('profiles')
        .select('is_admin')
        .eq('id', requestingUserId)
        .single()
      
      if (!requestingUser?.is_admin) {
        console.log('[SALES-COACH] ❌ Permission denied - requesting user is not admin')
        return null // Permission denied
      }
      
      console.log('[SALES-COACH] ✅ Admin permission verified')
      
      // Get target user's name for display
      const { data: targetUser } = await client
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', userId)
        .single()
      
      if (targetUser) {
        targetUserName = targetUser.first_name && targetUser.last_name
          ? `${targetUser.first_name} ${targetUser.last_name}`
          : targetUser.email || 'User'
        console.log('[SALES-COACH] Target user name:', targetUserName)
      } else {
        console.log('[SALES-COACH] ⚠️ Target user not found:', userId)
      }
    }
    
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const currentDay = now.getDate()
    
    // Previous month (same day)
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1
    const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December']
    
    // Calculate date ranges
    const currentStart = new Date(currentYear, currentMonth, 1)
    const currentEnd = new Date(currentYear, currentMonth, currentDay, 23, 59, 59)
    const previousStart = new Date(previousYear, previousMonth, 1)
    const previousEnd = new Date(previousYear, previousMonth, currentDay, 23, 59, 59)
    
    console.log('[SALES-COACH] Date ranges calculated:', {
      current: { start: currentStart.toISOString(), end: currentEnd.toISOString() },
      previous: { start: previousStart.toISOString(), end: previousEnd.toISOString() },
      targetUserId: userId
    })
    
    // Fetch deals for current month
    console.log('[SALES-COACH] Fetching current month deals for user:', userId)
    const { data: currentDeals, error: currentDealsError } = await client
      .from('deals')
      .select('id, name, value, stage, close_date, created_at')
      .eq('user_id', userId)
      .gte('created_at', currentStart.toISOString())
      .lte('created_at', currentEnd.toISOString())
      .order('close_date', { ascending: false })
    
    if (currentDealsError) {
      console.error('[SALES-COACH] ❌ Error fetching current deals:', currentDealsError)
    } else {
      console.log('[SALES-COACH] ✅ Current month deals fetched:', currentDeals?.length || 0)
    }
    
    // Fetch deals for previous month
    console.log('[SALES-COACH] Fetching previous month deals for user:', userId)
    const { data: previousDeals, error: previousDealsError } = await client
      .from('deals')
      .select('id, name, value, stage, close_date, created_at')
      .eq('user_id', userId)
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString())
      .order('close_date', { ascending: false })
    
    if (previousDealsError) {
      console.error('[SALES-COACH] ❌ Error fetching previous deals:', previousDealsError)
    } else {
      console.log('[SALES-COACH] ✅ Previous month deals fetched:', previousDeals?.length || 0)
    }
    
    // Fetch activities for current month
    console.log('[SALES-COACH] Fetching current month activities for user:', userId)
    const { data: currentActivities, error: currentActivitiesError } = await client
      .from('activities')
      .select('id, type, created_at')
      .eq('user_id', userId)
      .gte('created_at', currentStart.toISOString())
      .lte('created_at', currentEnd.toISOString())
    
    if (currentActivitiesError) {
      console.error('[SALES-COACH] ❌ Error fetching current activities:', currentActivitiesError)
    } else {
      console.log('[SALES-COACH] ✅ Current month activities fetched:', currentActivities?.length || 0)
    }
    
    // Fetch activities for previous month
    console.log('[SALES-COACH] Fetching previous month activities for user:', userId)
    const { data: previousActivities, error: previousActivitiesError } = await client
      .from('activities')
      .select('id, type, created_at')
      .eq('user_id', userId)
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString())
    
    if (previousActivitiesError) {
      console.error('[SALES-COACH] ❌ Error fetching previous activities:', previousActivitiesError)
    } else {
      console.log('[SALES-COACH] ✅ Previous month activities fetched:', previousActivities?.length || 0)
    }
    
    // Fetch meetings for current month
    console.log('[SALES-COACH] Fetching current month meetings for user:', userId)
    const { data: currentMeetings, error: currentMeetingsError } = await client
      .from('meetings')
      .select('id, created_at')
      .eq('owner_user_id', userId)
      .gte('created_at', currentStart.toISOString())
      .lte('created_at', currentEnd.toISOString())
    
    if (currentMeetingsError) {
      console.error('[SALES-COACH] ❌ Error fetching current meetings:', currentMeetingsError)
    } else {
      console.log('[SALES-COACH] ✅ Current month meetings fetched:', currentMeetings?.length || 0)
    }
    
    // Fetch meetings for previous month
    console.log('[SALES-COACH] Fetching previous month meetings for user:', userId)
    const { data: previousMeetings, error: previousMeetingsError } = await client
      .from('meetings')
      .select('id, created_at')
      .eq('owner_user_id', userId)
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString())
    
    if (previousMeetingsError) {
      console.error('[SALES-COACH] ❌ Error fetching previous meetings:', previousMeetingsError)
    } else {
      console.log('[SALES-COACH] ✅ Previous month meetings fetched:', previousMeetings?.length || 0)
    }
    
    // Calculate metrics
    const currentClosed = (currentDeals || []).filter(d => d.stage === 'Signed' && d.close_date)
    const previousClosed = (previousDeals || []).filter(d => d.stage === 'Signed' && d.close_date)
    
    const currentRevenue = currentClosed.reduce((sum, d) => sum + (d.value || 0), 0)
    const previousRevenue = previousClosed.reduce((sum, d) => sum + (d.value || 0), 0)
    
    const currentMeetingsCount = (currentMeetings || []).length
    const previousMeetingsCount = (previousMeetings || []).length
    
    const currentOutbound = (currentActivities || []).filter(a => a.type === 'outbound').length
    const previousOutbound = (previousActivities || []).filter(a => a.type === 'outbound').length
    
    const currentTotalActivities = (currentActivities || []).length
    const previousTotalActivities = (previousActivities || []).length
    
    const currentAvgDealValue = currentClosed.length > 0 ? currentRevenue / currentClosed.length : 0
    const previousAvgDealValue = previousClosed.length > 0 ? previousRevenue / previousClosed.length : 0
    
    // Get active pipeline value
    const { data: activeDeals } = await client
      .from('deals')
      .select('id, name, value, stage')
      .eq('user_id', userId)
      .in('stage', ['SQL', 'Opportunity', 'Verbal'])
    
    const pipelineValue = (activeDeals || []).reduce((sum, d) => sum + (d.value || 0), 0)
    
    // Calculate comparisons
    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0
      return ((current - previous) / previous) * 100
    }
    
    const salesChange = calculateChange(currentRevenue, previousRevenue)
    const activitiesChange = calculateChange(currentTotalActivities, previousTotalActivities)
    const pipelineChange = 0 // Would need previous pipeline value
    
    const salesComparison = {
      current: currentRevenue,
      previous: previousRevenue,
      change: salesChange,
      changeType: salesChange > 0 ? 'increase' : salesChange < 0 ? 'decrease' : 'neutral',
      verdict: salesChange > 0 
        ? `Significantly Better - You've closed ${formatCurrency(currentRevenue)} in ${monthNames[currentMonth]} vs ${formatCurrency(previousRevenue)} in ${monthNames[previousMonth]} at the same point.`
        : salesChange < 0
        ? `Below Pace - You closed ${formatCurrency(currentRevenue)} vs ${formatCurrency(previousRevenue)} in ${monthNames[previousMonth]}.`
        : 'Similar performance to previous month.'
    }
    
    const activitiesComparison = {
      current: currentTotalActivities,
      previous: previousTotalActivities,
      change: activitiesChange,
      changeType: activitiesChange > 0 ? 'increase' : activitiesChange < 0 ? 'decrease' : 'neutral',
      verdict: activitiesChange > 0
        ? `Higher Activity - ${currentTotalActivities} activities vs ${previousTotalActivities} in ${monthNames[previousMonth]}.`
        : activitiesChange < 0
        ? `Slightly Below Pace - ${currentTotalActivities} activities vs ${previousTotalActivities} in ${monthNames[previousMonth]}.`
        : 'Similar activity level to previous month.'
    }
    
    const pipelineComparison = {
      current: pipelineValue,
      previous: pipelineValue, // Would need to fetch previous
      change: 0,
      changeType: 'neutral' as const,
      verdict: `Strong pipeline with ${formatCurrency(pipelineValue)} in active opportunities.`
    }
    
    // Determine overall performance
    let overall: 'significantly_better' | 'better' | 'similar' | 'worse' | 'significantly_worse' = 'similar'
    if (salesChange > 50) overall = 'significantly_better'
    else if (salesChange > 0) overall = 'better'
    else if (salesChange < -50) overall = 'significantly_worse'
    else if (salesChange < 0) overall = 'worse'
    
    // Generate insights
    const insights: Array<{
      id: string
      type: 'positive' | 'warning' | 'opportunity'
      title: string
      description: string
      impact: 'high' | 'medium' | 'low'
    }> = []
    
    if (currentRevenue > previousRevenue) {
      insights.push({
        id: 'revenue-growth',
        type: 'positive' as const,
        title: 'Revenue Generation',
        description: `You're ahead on closed sales in ${monthNames[currentMonth]} (+${formatCurrency(currentRevenue - previousRevenue)} vs ${monthNames[previousMonth]}).`,
        impact: 'high' as const
      })
    }
    
    if (currentTotalActivities < previousTotalActivities) {
      insights.push({
        id: 'activity-pace',
        type: 'warning' as const,
        title: 'Activity Level',
        description: `${monthNames[previousMonth]} had higher activity volume - you may want to maintain that pace.`,
        impact: 'medium' as const
      })
    }
    
    if (activeDeals && activeDeals.length > 0) {
      const highValueDeals = activeDeals.filter(d => (d.value || 0) >= 8000)
      if (highValueDeals.length > 0) {
        insights.push({
          id: 'opportunity-quality',
          type: 'opportunity' as const,
          title: 'Opportunity Quality',
          description: `Strong pipeline with ${highValueDeals.length} $8K+ deals in Opportunity stage.`,
          impact: 'high' as const
        })
      }
    }
    
    // Generate recommendations
    const recommendations: Array<{
      id: string
      priority: 'high' | 'medium' | 'low'
      title: string
      description: string
      actionItems: string[]
    }> = []
    
    if (activeDeals && activeDeals.length > 0) {
      recommendations.push({
        id: 'focus-opportunities',
        priority: 'high' as const,
        title: 'Focus on High-Value Opportunities',
        description: 'Keep the momentum on the $8K+ opportunities in your pipeline.',
        actionItems: [
          'Review and prioritize high-value deals',
          'Schedule follow-ups for Opportunity stage deals',
          'Move deals from Opportunity to closure'
        ]
      })
    }
    
    if (currentTotalActivities < previousTotalActivities) {
      recommendations.push({
        id: 'increase-activity',
        priority: 'medium' as const,
        title: 'Maintain Activity Pace',
        description: 'Maintain or increase outbound activity to match previous month\'s pace.',
        actionItems: [
          'Schedule more outbound calls',
          'Increase email outreach',
          'Set daily activity goals'
        ]
      })
    }
    
    console.log('[SALES-COACH] Calculating metrics...', {
      currentClosed: currentClosed.length,
      previousClosed: previousClosed.length,
      currentRevenue,
      previousRevenue,
      currentMeetingsCount,
      previousMeetingsCount,
      currentTotalActivities,
      previousTotalActivities,
      pipelineValue
    })
    
    const response = {
      type: 'sales_coach',
      summary: isAdminQuery 
        ? `${targetUserName}'s performance comparison: ${monthNames[currentMonth]} ${currentYear} (through day ${currentDay}) vs ${monthNames[previousMonth]} ${previousYear} (through day ${currentDay})`
        : `Performance comparison: ${monthNames[currentMonth]} ${currentYear} (through day ${currentDay}) vs ${monthNames[previousMonth]} ${previousYear} (through day ${currentDay})`,
      data: {
        comparison: {
          sales: salesComparison,
          activities: activitiesComparison,
          pipeline: pipelineComparison,
          overall
        },
        metrics: {
          currentMonth: {
            closedDeals: currentClosed.length,
            totalRevenue: currentRevenue,
            averageDealValue: currentAvgDealValue,
            meetings: currentMeetingsCount,
            outboundActivities: currentOutbound,
            totalActivities: currentTotalActivities,
            pipelineValue,
            deals: (currentDeals || []).map(d => ({
              id: d.id,
              name: d.name,
              value: d.value || 0,
              stage: d.stage,
              closedDate: d.close_date
            }))
          },
          previousMonth: {
            closedDeals: previousClosed.length,
            totalRevenue: previousRevenue,
            averageDealValue: previousAvgDealValue,
            meetings: previousMeetingsCount,
            outboundActivities: previousOutbound,
            totalActivities: previousTotalActivities,
            pipelineValue: 0, // Would need to fetch
            deals: (previousDeals || []).map(d => ({
              id: d.id,
              name: d.name,
              value: d.value || 0,
              stage: d.stage,
              closedDate: d.close_date
            }))
          }
        },
        insights,
        recommendations,
        period: {
          current: { month: monthNames[currentMonth], year: currentYear, day: currentDay },
          previous: { month: monthNames[previousMonth], year: previousYear, day: currentDay }
        }
      },
      actions: [],
      metadata: {
        timeGenerated: new Date().toISOString(),
        dataSource: ['deals', 'activities', 'meetings'],
        confidence: 90
      }
    }
    
    console.log('[SALES-COACH] ✅ Response generated successfully:', {
      type: response.type,
      hasData: !!response.data,
      hasComparison: !!response.data?.comparison,
      hasMetrics: !!response.data?.metrics,
      hasInsights: !!response.data?.insights?.length,
      hasRecommendations: !!response.data?.recommendations?.length,
      summary: response.summary?.substring(0, 100)
    })
    
    return response
  } catch (error) {
    console.error('[SALES-COACH] ❌ Exception in structureSalesCoachResponse:', error)
    return null
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

/**
 * Extract recommendations from AI response (simple implementation)
 */
function extractRecommendations(content: string): any[] {
  // Simple extraction - in production, you might want Claude to return structured JSON
  // or use a more sophisticated parsing approach
  const recommendations: any[] = []
  
  // Look for action items in the response
  const actionPatterns = [
    /(?:suggest|recommend|consider|you should|next step)[\s\S]{0,200}/gi
  ]
  
  // This is a placeholder - you'd want more sophisticated parsing
  // or have Claude return structured recommendations
  
  return recommendations
}

// force rebuild 1767298228

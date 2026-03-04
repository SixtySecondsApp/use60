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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, corsHeaders as staticCorsHeaders } from '../_shared/corsHelper.ts';
import { resolveModel, recordSuccess, recordFailure } from '../_shared/modelRouter.ts';
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
import { logAICostEvent, extractAnthropicUsage, checkCreditBalance } from '../_shared/costTracking.ts'
import { executeAction } from '../_shared/copilot_adapters/executeAction.ts'
import type { ExecuteActionName } from '../_shared/copilot_adapters/types.ts'
import { getOrCompilePersona, type CompiledPersona } from '../_shared/salesCopilotPersona.ts'
import {
  detectAndStructureResponse,
  structureSalesCoachResponse,
  clampDurationMinutes,
  normalizeTimeInput,
  parseDateInput,
  addDays,
  addMinutes,
  startOfZonedDay,
  endOfZonedDay,
  zonedTimeOnDate,
  getZonedDateParts,
  mergeIntervals,
  calculateFreeSlotsForDay,
  getUserTimezone,
  type ChatRequestContext,
} from '../_shared/structuredResponseDetector.ts'

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
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

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
  const corsHeaders = getCorsHeaders(req);
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

    // Check credit balance before proceeding
    if (body.context?.orgId) {
      const creditCheck = await checkCreditBalance(client, String(body.context.orgId));
      if (!creditCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: 'insufficient_credits',
            message: creditCheck.message || 'Your organization has run out of AI credits. Please top up to continue.',
            balance: creditCheck.balance,
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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
  const corsHeaders = getCorsHeaders(req);
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
  const corsHeaders = getCorsHeaders(req);
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

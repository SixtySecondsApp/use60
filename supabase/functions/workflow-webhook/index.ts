import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"
import { captureException } from "../_shared/sentryEdge.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Check if an error is an HTML gateway error (e.g., Cloudflare 500)
 */
function isHtmlGatewayError(error: any): boolean {
  const message = String(error?.message || '')
  return (
    message.includes('<html>') ||
    message.includes('<!DOCTYPE') ||
    message.includes('Internal Server Error') ||
    message.includes('502 Bad Gateway') ||
    message.includes('503 Service Unavailable') ||
    message.includes('504 Gateway Timeout')
  )
}

/**
 * Parse error message for better user feedback
 */
function parseErrorMessage(error: any): string {
  const rawMessage = String(error?.message || error || 'Unknown error')
  if (isHtmlGatewayError(error)) {
    return 'Database temporarily unavailable. Please try again.'
  }
  if (rawMessage.length > 200) {
    return rawMessage.substring(0, 200) + '... (truncated)'
  }
  return rawMessage
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Execute database operation with retry for gateway errors
 */
async function executeWithRetry<T>(
  operation: () => Promise<{ data: T | null; error: any }>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<{ data: T | null; error: any }> {
  let lastError: any = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await operation()

    if (!result.error) {
      return result
    }

    if (isHtmlGatewayError(result.error)) {
      lastError = result.error
      console.warn(
        `[workflow-webhook] Gateway error on attempt ${attempt + 1}/${maxRetries}, retrying...`
      )
      await sleep(initialDelayMs * Math.pow(2, attempt))
      continue
    }

    return result
  }

  return { data: null, error: lastError }
}

// Make this function publicly accessible (no auth required)
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Use service role key to bypass RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    )

    // Get workflow ID from URL path
    const url = new URL(req.url)
    const workflowId = url.pathname.split('/').pop()
    
    if (!workflowId) {
      throw new Error('Workflow ID is required in the URL path')
    }

    // Get the workflow configuration - explicitly select columns we need
    let { data: workflow, error: workflowError } = await supabase
      .from('user_automation_rules')
      .select('id, user_id, rule_name, is_active')
      .eq('id', workflowId)
      .single()

    // If workflow doesn't exist and it's our test workflow ID, create it
    if ((workflowError || !workflow) && workflowId === 'b224bdca-7bfa-4bc3-b30e-68e0045a64f8') {
      // Create a default workflow for testing
      const defaultWorkflow = {
        id: workflowId,
        user_id: 'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459', // Default user ID
        rule_name: 'Sales Analysis Workflow (Auto-created)',
        rule_description: 'Auto-created for testing Fathom webhook',
        trigger_type: 'webhook',
        trigger_conditions: { webhook: true },
        action_type: 'create_task',
        action_params: {},
        is_active: true,
        execution_order: 1
      }
      
      const { data: newWorkflow, error: createError } = await supabase
        .from('user_automation_rules')
        .insert(defaultWorkflow)
        .select()
        .single()
      
      if (createError) {
        throw new Error(`Workflow not found and could not create: ${createError.message}`)
      }
      
      workflow = newWorkflow
    } else if (workflowError) {
      throw new Error(`Failed to fetch workflow: ${workflowError.message}`)
    }
    
    if (!workflow) {
      throw new Error('Workflow not found')
    }

    if (!workflow.is_active) {
      // Try to activate the workflow
      const { error: updateError } = await supabase
        .from('user_automation_rules')
        .update({ is_active: true })
        .eq('id', workflowId)
      
      if (!updateError) {
        workflow.is_active = true
      } else {
        throw new Error('Workflow is not active')
      }
    }

    // Parse the incoming payload
    const payload = await req.json()
    // Detect payload type
    let payloadType = 'unknown'

    // Check for explicit payload type field first
    if (payload.payload_type) {
      payloadType = payload.payload_type
    }
    // Check for Fathom webhook event types
    else if (payload.event_type === 'call.ready' || payload.event === 'call.ready') {
      payloadType = 'call_ready'
    }
    // Then check for specific payload structures
    else if (payload.transcript || payload.transcript_plaintext) {
      payloadType = 'transcript'
    } else if (payload.action_item) {
      payloadType = 'action_items'
    } else if (payload.ai_summary || payload.summary ||
               (payload.topic && payload.participants && payload.duration)) {
      // If it has topic, participants, and duration, it's likely a summary
      payloadType = 'summary'
    }

    // Extract Fathom meeting ID (shareId)
    let fathomId = extractFathomId(payload)
    
    if (!fathomId) {
      throw new Error('Could not extract Fathom meeting ID from payload')
    }

    // Create workflow execution record
    const { data: execution, error: execError } = await supabase
      .from('workflow_executions')
      .insert({
        workflow_id: workflowId,
        user_id: workflow.user_id,
        trigger_type: 'webhook',
        trigger_data: {
          payload_type: payloadType,
          fathom_id: fathomId,
          raw_payload: payload
        },
        execution_status: 'pending',
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (execError) throw execError

    // Process based on payload type
    let result = null
    try {
      switch (payloadType) {
        case 'call_ready':
          // Trigger API sync for this specific call
          result = await processCallReadyWebhook(supabase, payload, fathomId, workflow.user_id)
          break
        case 'summary':
          result = await processSummaryPayload(supabase, payload, fathomId, workflow.user_id)
          break
        case 'transcript':
          result = await processTranscriptPayload(supabase, payload, fathomId, workflow.user_id)
          break
        case 'action_items':
          result = await processActionItemsPayload(supabase, payload, fathomId, workflow.user_id)
          break
        default:
          throw new Error(`Unsupported payload type: ${payloadType}`)
      }

      // Update execution status
      await supabase
        .from('workflow_executions')
        .update({
          execution_status: 'success',
          completed_at: new Date().toISOString(),
          action_results: result
        })
        .eq('id', execution.id)

    } catch (processError) {
      // Update execution status on error
      await supabase
        .from('workflow_executions')
        .update({
          execution_status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: processError.message
        })
        .eq('id', execution.id)
      
      throw processError
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        execution_id: execution.id,
        payload_type: payloadType,
        fathom_id: fathomId,
        result: result
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    await captureException(error, {
      tags: {
        function: 'workflow-webhook',
        integration: 'fathom',
      },
    });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

function extractFathomId(payload: any): string | null {
  // Try various fields to find the Fathom ID
  if (payload.shareId) return payload.shareId
  if (payload.share_id) return payload.share_id
  if (payload.fathom_recording_id) return payload.fathom_recording_id
  
  // Try to extract from URLs
  const urlFields = [
    payload.recording?.recording_share_url,
    payload.action_item?.recording_playback_url,
    payload.transcript_url,
    payload.share_url
  ]
  
  for (const url of urlFields) {
    if (url) {
      const match = url.match(/share\/([^\/\?]+)/)
      if (match) return match[1]
    }
  }
  
  return null
}

async function processSummaryPayload(supabase: any, payload: any, fathomId: string, userId: string) {
  // Resolve org_id for multi-tenant uniqueness (best-effort; required for upsert conflict target)
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const orgId = membership?.org_id || null
  if (!orgId) {
    throw new Error('Missing org_id for meeting upsert')
  }

  // Upsert meeting record with all summary data
  const meetingData = {
    org_id: orgId,
    fathom_recording_id: fathomId,
    title: payload.meeting?.title || payload.meeting_title,
    share_url: payload.recording?.recording_share_url,
    calls_url: payload.recording?.recording_url,
    meeting_start: payload.meeting?.scheduled_start_time || payload.meeting_start,
    meeting_end: payload.meeting?.scheduled_end_time || payload.meeting_end,
    duration_minutes: payload.recording?.recording_duration_in_minutes || payload.duration,
    owner_user_id: userId,
    owner_email: payload.fathom_user?.email || payload.owner_email,
    team_name: payload.fathom_user?.team || payload.team,
    summary: payload.ai_summary || payload.summary,
    // Store embed URL for iframe widget
    fathom_embed_url: payload.recording?.recording_share_url,
    // AI training metadata
    ai_training_metadata: {
      sentiment_score: payload.sentiment_score,
      coach_rating: payload.coach_rating,
      coach_summary: payload.coach_summary,
      talk_time_rep_pct: payload.talk_time_rep_pct,
      talk_time_customer_pct: payload.talk_time_customer_pct,
      talk_time_judgement: payload.talk_time_judgement,
      external_domains: payload.meeting?.external_domains,
      has_external_invitees: payload.meeting?.has_external_invitees
    },
    updated_at: new Date().toISOString()
  }

  const { data: meeting, error } = await executeWithRetry(() =>
    supabase
      .from('meetings')
      .upsert(meetingData, {
        onConflict: 'org_id,fathom_recording_id'
      })
      .select()
      .single()
  )

  if (error) {
    throw new Error(`Failed to upsert meeting: ${parseErrorMessage(error)}`)
  }

  // Process attendees if available
  if (payload.meeting?.invitees && meeting) {
    for (const invitee of payload.meeting.invitees) {
      await supabase
        .from('meeting_attendees')
        .upsert({
          meeting_id: meeting.id,
          name: invitee.name,
          email: invitee.email,
          is_external: invitee.is_external || !invitee.email.endsWith('@sixtyseconds.video')
        }, {
          onConflict: 'meeting_id,email'
        })
    }
  }

  return { meeting_id: meeting.id, action: 'meeting_upserted' }
}

async function processTranscriptPayload(supabase: any, payload: any, fathomId: string, userId: string) {
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const orgId = membership?.org_id || null

  // First, ensure meeting exists
  const { data: existingMeeting } = await supabase
    .from('meetings')
    .select('id')
    .eq('fathom_recording_id', fathomId)
    .eq('org_id', orgId)
    .single()

  let meetingId = existingMeeting?.id

  if (!meetingId) {
    // Create basic meeting record if it doesn't exist
    const { data: newMeeting, error } = await supabase
      .from('meetings')
      .insert({
        org_id: orgId,
        fathom_recording_id: fathomId,
        title: payload.meeting?.title || 'Meeting Transcript',
        meeting_start: payload.meeting?.scheduled_start_time,
        meeting_end: payload.meeting?.scheduled_end_time,
        owner_user_id: userId,
        owner_email: payload.fathom_user?.email,
        team_name: payload.fathom_user?.team
      })
      .select()
      .single()
    
    if (error) throw error
    meetingId = newMeeting.id
  }

  // Create Google Doc from transcript
  const docUrl = await createGoogleDoc(payload.transcript || payload.transcript_plaintext, fathomId, payload.meeting?.title)

  // Update meeting with transcript doc URL
  const { error: updateError } = await supabase
    .from('meetings')
    .update({
      transcript_doc_url: docUrl,
      updated_at: new Date().toISOString()
    })
    .eq('id', meetingId)

  if (updateError) throw updateError

  return { 
    meeting_id: meetingId, 
    action: 'transcript_processed',
    google_doc_url: docUrl
  }
}

async function processActionItemsPayload(supabase: any, payload: any, fathomId: string, userId: string) {
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const orgId = membership?.org_id || null

  // Get meeting by Fathom ID
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id')
    .eq('fathom_recording_id', fathomId)
    .eq('org_id', orgId)
    .single()

  if (!meeting) {
    throw new Error(`Meeting not found for Fathom ID: ${fathomId}`)
  }

  // Process all action items in the payload
  const actionItems = Array.isArray(payload.action_item) ? payload.action_item : [payload.action_item].filter(Boolean)
  const results = []

  // Get workflow configuration for action item processing
  const { data: workflow } = await supabase
    .from('user_automation_rules')
    .select('action_config')
    .eq('id', payload.workflow_id)
    .single()

  for (const item of actionItems) {
    // Process action item with AI classification using workflow config
    const actionItemData = await classifyActionItem({ ...payload, action_item: item }, userId, workflow)
    
    // Determine if this is a sales rep task or prospect task
    const isSalesRepTask = actionItemData.is_sales_rep_task

    // Insert action item (always stored in meeting_action_items)
    // CRITICAL: Explicitly set synced_to_task=false to prevent automatic task creation
    const { data: actionItem, error } = await supabase
      .from('meeting_action_items')
      .insert({
        meeting_id: meeting.id,
        title: item.item || actionItemData.title,
        assignee_name: item.owner || payload.assignee?.name,
        assignee_email: payload.assignee?.email,
        priority: actionItemData.priority,
        category: actionItemData.category,
        deadline_at: item.due_date || actionItemData.deadline,
        completed: item.completed || false,
        ai_generated: item.ai_generated || false,
        is_sales_rep_task: isSalesRepTask, // New field to track task type
        synced_to_task: false, // Explicitly prevent automatic task creation
        task_id: null, // No task created yet - manual creation only
        timestamp_seconds: parseTimestamp(item.recording_timestamp),
        playback_url: item.recording_playback_url
      })
      .select()
      .single()

    if (error) throw error

    // Automatic task creation is intentionally disabled.
    // Reps will review action items in the UI and create tasks manually.
    results.push({
      action_item_id: actionItem.id,
      task_id: null,
      is_sales_rep_task: isSalesRepTask
    })
  }

  return { 
    meeting_id: meeting.id,
    action_items: results,
    action: 'action_items_processed'
  }
}

async function classifyActionItem(payload: any, defaultUserId: string, workflowConfig?: any) {
  // Get configuration from workflow or use defaults
  const config = workflowConfig?.action_config || {}
  
  // Priority is now just text values for the tasks table
  // We keep priority_id mapping for backward compatibility with other systems
  const priorityMap = config.priority_mapping || {
    urgent: 'eeb122d5-d850-4381-b914-2ad09e48421b',
    high: '42641fa1-9e6c-48fd-8c08-ada611ccc92a',
    medium: 'e6153e53-d1c7-431a-afde-cd7c21b02ebb',
    low: '1c00bc94-5358-4348-aaf3-cb2baa4747c4'
  }

  // Sales rep user mapping (configurable)
  const salesRepMap = config.user_mapping || {
    'Andrew Bryce': 'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459',
    'Steve Gibson': 'e4bb01b1-51ea-425a-ac74-0e5b5fd585c1',
    'Phil': 'e783d627-bbc6-4fac-b7d0-3913cb45b4b8',
    'andrew.bryce@sixtyseconds.video': 'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459',
    'steve.gibson@sixtyseconds.video': 'e4bb01b1-51ea-425a-ac74-0e5b5fd585c1',
    'phil@sixtyseconds.video': 'e783d627-bbc6-4fac-b7d0-3913cb45b4b8'
  }

  // Categories (configurable)
  const categories = config.categories || [
    'Call', 'Email', 'Whatsapp / Text', 'LinkedIn Message', 
    'LinkedIn Connection', 'Proposal', 'Send Information'
  ]
  
  // Get action item details
  const assigneeEmail = payload.action_item?.owner_email || payload.assignee?.email || ''
  const assigneeName = payload.action_item?.owner || payload.assignee?.name || ''
  const description = payload.action_item?.item || payload.action_item?.description || ''
  const dueDate = payload.action_item?.due_date || payload.due_date
  const meetingDate = payload.meeting_end || payload.endedAt || new Date().toISOString()
  
  // Enhanced priority analysis using GPT-4o logic
  let priority = 'medium'
  let priority_id = priorityMap.medium
  
  const descLower = description.toLowerCase()
  
  // Priority detection with enhanced keywords
  if (descLower.includes('urgent') || descLower.includes('asap') || 
      descLower.includes('immediately') || descLower.includes('critical')) {
    priority = 'urgent'
    priority_id = priorityMap.urgent
  } else if (descLower.includes('important') || descLower.includes('priority') ||
             descLower.includes('soon') || descLower.includes('quickly')) {
    priority = 'high'
    priority_id = priorityMap.high
  } else if (descLower.includes('whenever') || descLower.includes('no rush') ||
             descLower.includes('when possible')) {
    priority = 'low'
    priority_id = priorityMap.low
  }
  
  // Enhanced category classification
  let category = 'Send Information' // default
  
  // Check for specific category keywords
  if (descLower.includes('call') || descLower.includes('phone') || 
      descLower.includes('meeting') || descLower.includes('discuss')) {
    category = 'Call'
  } else if (descLower.includes('email') || descLower.includes('send') && 
             descLower.includes('@')) {
    category = 'Email'
  } else if (descLower.includes('proposal') || descLower.includes('quote') ||
             descLower.includes('pricing')) {
    category = 'Proposal'
  } else if (descLower.includes('linkedin') || descLower.includes('connect')) {
    if (descLower.includes('message')) {
      category = 'LinkedIn Message'
    } else {
      category = 'LinkedIn Connection'
    }
  } else if (descLower.includes('whatsapp') || descLower.includes('text') ||
             descLower.includes('sms')) {
    category = 'Whatsapp / Text'
  } else if (descLower.includes('send') || descLower.includes('share') ||
             descLower.includes('provide')) {
    category = 'Send Information'
  }
  
  // Intelligent deadline calculation based on priority and context
  let deadline_days = 3 // default
  
  if (dueDate) {
    // If explicit due date provided, calculate days from meeting date
    const meeting = new Date(meetingDate)
    const due = new Date(dueDate)
    deadline_days = Math.ceil((due.getTime() - meeting.getTime()) / (1000 * 60 * 60 * 24))
  } else {
    // Calculate based on priority and keywords
    if (priority === 'urgent') {
      deadline_days = 1
    } else if (priority === 'high') {
      deadline_days = 2
    } else if (priority === 'low') {
      deadline_days = 7
    }
    
    // Check for time-specific keywords
    if (descLower.includes('today')) {
      deadline_days = 0
    } else if (descLower.includes('tomorrow')) {
      deadline_days = 1
    } else if (descLower.includes('this week')) {
      deadline_days = Math.max(1, 5 - new Date().getDay()) // Days until Friday
    } else if (descLower.includes('next week')) {
      deadline_days = 7
    } else if (descLower.includes('monday')) {
      deadline_days = calculateDaysUntilDay(1, meetingDate)
    } else if (descLower.includes('tuesday')) {
      deadline_days = calculateDaysUntilDay(2, meetingDate)
    } else if (descLower.includes('wednesday')) {
      deadline_days = calculateDaysUntilDay(3, meetingDate)
    } else if (descLower.includes('thursday')) {
      deadline_days = calculateDaysUntilDay(4, meetingDate)
    } else if (descLower.includes('friday')) {
      deadline_days = calculateDaysUntilDay(5, meetingDate)
    }
  }
  
  // Calculate actual deadline date accounting for weekends
  const deadline = calculateDeadline(deadline_days, meetingDate)
  
  // Determine if this is a sales rep task or prospect task
  let is_sales_rep_task = false
  let user_id = defaultUserId
  
  // Check if assignee is a known sales rep
  if (salesRepMap[assigneeName]) {
    is_sales_rep_task = true
    user_id = salesRepMap[assigneeName]
  } else if (salesRepMap[assigneeEmail]) {
    is_sales_rep_task = true
    user_id = salesRepMap[assigneeEmail]
  } else if (assigneeEmail) {
    // Check if email domain is internal
    const emailDomain = assigneeEmail.split('@')[1]
    if (emailDomain && (emailDomain.includes('sixtyseconds') || emailDomain.includes('sixty'))) {
      is_sales_rep_task = true
      user_id = defaultUserId
    } else {
      is_sales_rep_task = false
    }
  } else {
    // Use enhanced keyword detection
    const salesRepKeywords = ['we need to', 'i need to', 'i will', 'we will', 
                              'send proposal', 'follow up', 'reach out', 'prepare']
    const prospectKeywords = ['you need to', 'please provide', 'client will', 
                              'customer should', 'you will', 'your team']
    
    if (salesRepKeywords.some(keyword => descLower.includes(keyword))) {
      is_sales_rep_task = true
      user_id = defaultUserId
    } else if (prospectKeywords.some(keyword => descLower.includes(keyword))) {
      is_sales_rep_task = false
    } else {
      // Default to sales rep task if unclear
      is_sales_rep_task = true
      user_id = defaultUserId
    }
  }

  return {
    title: description || 'Action Item',
    priority,
    priority_id,
    category,
    deadline,
    deadline_days,
    user_id,
    is_sales_rep_task,
    create_task: is_sales_rep_task,
    // Additional metadata for tracking
    classification_metadata: {
      meeting_date: meetingDate,
      original_due_date: dueDate,
      assignee_name: assigneeName,
      assignee_email: assigneeEmail,
      priority_reason: getPriorityReason(descLower, priority),
      category_confidence: getCategoryConfidence(descLower, category)
    }
  }
}

// Helper function to calculate days until a specific day of week
function calculateDaysUntilDay(targetDay: number, fromDate: string): number {
  const from = new Date(fromDate)
  const currentDay = from.getDay()
  let daysUntil = targetDay - currentDay
  
  // If target day is in the past this week, add 7 days
  if (daysUntil <= 0) {
    daysUntil += 7
  }
  
  return daysUntil
}

// Helper function to get priority reasoning
function getPriorityReason(description: string, priority: string): string {
  if (priority === 'urgent') {
    if (description.includes('urgent')) return 'Contains "urgent"'
    if (description.includes('asap')) return 'Contains "ASAP"'
    if (description.includes('immediately')) return 'Contains "immediately"'
    return 'Critical keywords detected'
  } else if (priority === 'high') {
    if (description.includes('important')) return 'Contains "important"'
    if (description.includes('priority')) return 'Contains "priority"'
    return 'High priority keywords detected'
  } else if (priority === 'low') {
    return 'Low priority or relaxed timeline detected'
  }
  return 'Default priority'
}

// Helper function to get category confidence
function getCategoryConfidence(description: string, category: string): number {
  // Return confidence score 0-100 based on keyword matches
  const categoryKeywords = {
    'Call': ['call', 'phone', 'meeting', 'discuss'],
    'Email': ['email', 'send', 'mail'],
    'Proposal': ['proposal', 'quote', 'pricing'],
    'LinkedIn Message': ['linkedin', 'message'],
    'LinkedIn Connection': ['linkedin', 'connect'],
    'Whatsapp / Text': ['whatsapp', 'text', 'sms'],
    'Send Information': ['send', 'share', 'provide', 'information']
  }
  
  const keywords = categoryKeywords[category] || []
  const matches = keywords.filter(kw => description.includes(kw)).length
  return Math.min(100, matches * 25 + 25) // Base 25% + 25% per match
}

function calculateDeadline(days: number, fromDate?: string): string {
  const deadline = fromDate ? new Date(fromDate) : new Date()
  let daysAdded = 0
  
  while (daysAdded < days) {
    deadline.setDate(deadline.getDate() + 1)
    // Skip weekends
    if (deadline.getDay() !== 0 && deadline.getDay() !== 6) {
      daysAdded++
    }
  }
  
  return deadline.toISOString()
}

function parseTimestamp(timestamp: string): number {
  if (!timestamp) return 0
  
  const parts = timestamp.split(':').map(p => parseInt(p))
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  return parseInt(timestamp) || 0
}

/**
 * Process call.ready webhook from Fathom
 * Triggers API sync to pull full meeting data
 */
async function processCallReadyWebhook(supabase: any, payload: any, callId: string, userId: string) {
  // Create a temporary auth token for the user to call sync function
  // Using service role to create a token that can authenticate as the user
  const { data: tokenData, error: tokenError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: payload.fathom_user?.email || payload.owner_email,
  })

  if (tokenError || !tokenData) {
  }

  // Call the fathom-sync Edge Function to pull this specific call
  const syncUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/fathom-sync`

  try {
    // Create a service role supabase client for the sync call
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user's active integration to determine auth token
    const { data: integration } = await serviceSupabase
      .from('fathom_integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (!integration) {
      throw new Error('No active Fathom integration found for user')
    }

    const syncResponse = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
        'X-User-Id': userId, // Pass user ID for the sync function
      },
      body: JSON.stringify({
        sync_type: 'webhook',
        call_id: callId,
        user_id: userId, // Explicitly pass user ID
        limit: 1,
      }),
    })

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text()
      throw new Error(`Sync failed: ${syncResponse.status} - ${errorText}`)
    }

    const syncResult = await syncResponse.json()
    return {
      action: 'webhook_sync_triggered',
      call_id: callId,
      sync_result: syncResult,
    }
  } catch (error) {
    // Fallback: Just update sync state to indicate webhook was received
    await supabase
      .from('fathom_sync_state')
      .upsert({
        user_id: userId,
        sync_status: 'error',
        last_sync_error: `Webhook received but sync failed: ${error.message}`,
      }, {
        onConflict: 'user_id',
      })

    throw error
  }
}

async function createGoogleDoc(transcript: string, fathomId: string, title?: string): Promise<string> {
  // This is a placeholder - in production, you would integrate with Google Docs API
  // For now, we'll return a mock URL that indicates where the doc would be stored
  const docTitle = `${title || 'Meeting'} - Transcript - ${fathomId}`
  const mockDocUrl = `https://docs.google.com/document/d/mock-${fathomId}/edit`

  // In production, you would:
  // 1. Use Google Docs API to create a new document
  // 2. Format the transcript with timestamps and speakers
  // 3. Set sharing permissions for AI system access
  // 4. Return the actual document URL
  return mockDocUrl
}
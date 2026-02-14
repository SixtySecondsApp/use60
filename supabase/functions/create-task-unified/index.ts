import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { addBreadcrumb, captureException } from '../_shared/sentryEdge.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Unified Task Creation from Action Items
 *
 * Purpose: Single edge function for both automatic and manual task creation
 * Modes:
 *   - auto: Tasks created based on user's importance preferences
 *   - manual: Tasks created from user-selected action items (bulk support)
 *
 * Features:
 *   - Importance-based filtering (High/Medium/Low)
 *   - Bulk task creation
 *   - Bidirectional sync (task ↔ action item)
 *   - Fixed assignment logic (no mis-assignments)
 *   - Stale deadline detection and recalculation
 */

interface CreateTaskRequest {
  mode: 'auto' | 'manual'
  action_item_ids: string[]
  source: 'ai_suggestion' | 'action_item' | 'call_action_item'
}

interface CreateTaskResponse {
  success: boolean
  tasks_created: number
  tasks: any[]
  errors?: Array<{ action_item_id: string, error: string }>
}

function clampNewTaskDueDate(args: {
  proposed: string | null
  anchorIso: string | null
  now: Date
}): { dueDateIso: string; originalDueDateIso: string | null; wasClamped: boolean } {
  const { proposed, anchorIso, now } = args

  const proposedDate = proposed ? new Date(proposed) : null
  const anchorDate = anchorIso ? new Date(anchorIso) : null

  const proposedValid = proposedDate && !isNaN(proposedDate.getTime())
  const anchorValid = anchorDate && !isNaN(anchorDate.getTime())

  // If proposed date is valid and in the future, use it.
  if (proposedValid && proposedDate!.getTime() >= now.getTime()) {
    return {
      dueDateIso: proposedDate!.toISOString(),
      originalDueDateIso: proposedDate!.toISOString(),
      wasClamped: false,
    }
  }

  // If proposed is in the past, compute an offset from the anchor when possible.
  let offsetDays = 3
  if (proposedValid && anchorValid) {
    const diffDays = (proposedDate!.getTime() - anchorDate!.getTime()) / (1000 * 60 * 60 * 24)
    // If diff is negative or suspiciously large, fall back to 3 days.
    if (Number.isFinite(diffDays) && diffDays > 0) {
      offsetDays = Math.round(diffDays)
    }
  }

  // Clamp offset to 1..30 days to avoid absurd schedules from bad dates
  offsetDays = Math.max(1, Math.min(30, offsetDays))

  const next = new Date(now)
  next.setDate(next.getDate() + offsetDays)

  return {
    dueDateIso: next.toISOString(),
    originalDueDateIso: proposedValid ? proposedDate!.toISOString() : null,
    wasClamped: true,
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

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

    const token = authHeader.replace('Bearer ', '')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const isServiceRole = token === serviceKey

    // Parse request body first (needed for service role user_id)
    const body = await req.json() as CreateTaskRequest & { context?: { user_id?: string } }
    const { mode, action_item_ids, source } = body

    let user: { id: string } | null = null

    if (isServiceRole) {
      // Service role calls (from orchestrator) pass user_id in context
      const userId = body.context?.user_id
      if (!userId) {
        throw new Error('Service role calls must include context.user_id')
      }
      user = { id: userId }
    } else {
      const { data: { user: authUser }, error: userError } = await supabase.auth.getUser(token)
      if (userError || !authUser) {
        throw new Error('Unauthorized')
      }
      user = authUser
    }

    if (!action_item_ids || action_item_ids.length === 0) {
      throw new Error('action_item_ids is required')
    }

    if (!mode || !['auto', 'manual'].includes(mode)) {
      throw new Error('mode must be "auto" or "manual"')
    }

    if (!source || !['ai_suggestion', 'action_item', 'call_action_item'].includes(source)) {
      throw new Error('source must be "ai_suggestion", "action_item", or "call_action_item"')
    }

    console.log(`[create-task-unified] Processing ${action_item_ids.length} items in ${mode} mode from ${source}`)

    // Get user's auto-sync preferences (for auto mode)
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('preferences')
      .eq('user_id', user.id)
      .single()

    const autoSyncPrefs = userSettings?.preferences?.task_auto_sync || {
      enabled: false,
      importance_levels: ['high'],
      confidence_threshold: 0.8
    }

    console.log(`[create-task-unified] User auto-sync preferences:`, autoSyncPrefs)

    // Get action items from appropriate table
    const tableName =
      source === 'ai_suggestion'
        ? 'next_action_suggestions'
        : source === 'call_action_item'
          ? 'call_action_items'
          : 'meeting_action_items'

    // Avoid deep generic instantiation in Supabase client typing.
    // (Runtime behavior unchanged.)
    const sb: any = supabase

    // We fetch raw action items and enrich with meeting/call context below.
    const { data: actionItems, error: fetchError } = await sb
      .from(tableName)
      .select(`*`)
      .in('id', action_item_ids)

    if (fetchError) {
      console.error(`[create-task-unified] Error fetching action items:`, fetchError)
      throw new Error(`Action items not found: ${fetchError.message}`)
    }

    if (!actionItems || actionItems.length === 0) {
      console.warn(`[create-task-unified] No action items found for IDs:`, action_item_ids)
      return new Response(
        JSON.stringify({
          success: true,
          tasks_created: 0,
          tasks: [],
          errors: []
        } as CreateTaskResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const tasksCreated: any[] = []
    const errors: Array<{ action_item_id: string, error: string }> = []

    async function loadMeetingContext(meetingId: string) {
      const { data } = await sb
        .from('meetings')
        .select('id, title, company_id, primary_contact_id, owner_user_id, meeting_start')
        .eq('id', meetingId)
        .maybeSingle()
      return data || null
    }

    async function loadCallContext(callId: string) {
      const { data } = await sb
        .from('calls')
        .select('id, org_id, started_at, owner_user_id, owner_email, company_id, contact_id, deal_id')
        .eq('id', callId)
        .maybeSingle()
      return data || null
    }

    // Process each action item
    for (const actionItem of actionItems) {
      try {
        console.log(`[create-task-unified] Processing action item ${actionItem.id} (importance: ${actionItem.importance})`)

        // Enrich meeting/call context (needed for assignment + linking)
        let meetingCtx: any = null
        let callCtx: any = null

        if (source === 'ai_suggestion') {
          // Suggestions can be for multiple activity types.
          const activityType = String(actionItem.activity_type || '').toLowerCase()
          if (activityType === 'meeting' && actionItem.activity_id) {
            meetingCtx = await loadMeetingContext(actionItem.activity_id)
          } else if (activityType === 'call' && actionItem.activity_id) {
            callCtx = await loadCallContext(actionItem.activity_id)
          }
        } else if (source === 'call_action_item') {
          if (actionItem.call_id) {
            callCtx = await loadCallContext(actionItem.call_id)
          }
        } else {
          // meeting_action_items
          if (actionItem.meeting_id) {
            meetingCtx = await loadMeetingContext(actionItem.meeting_id)
          }
        }

        // MODE-SPECIFIC LOGIC
        if (mode === 'auto') {
          // Auto mode: Check if importance matches user preferences
          if (!autoSyncPrefs.enabled) {
            console.log(`[create-task-unified] Skipping ${actionItem.id} - auto-sync disabled`)
            continue
          }

          if (!autoSyncPrefs.importance_levels.includes(actionItem.importance)) {
            console.log(`[create-task-unified] Skipping ${actionItem.id} - importance ${actionItem.importance} not in ${autoSyncPrefs.importance_levels}`)
            continue
          }

          // Check confidence threshold (if applicable)
          if (actionItem.confidence_score && actionItem.confidence_score < autoSyncPrefs.confidence_threshold) {
            console.log(`[create-task-unified] Skipping ${actionItem.id} - confidence ${actionItem.confidence_score} below threshold ${autoSyncPrefs.confidence_threshold}`)
            continue
          }
        }
        // Manual mode: No filtering, user explicitly selected these items
        console.log(`[create-task-unified] ${mode} mode - proceeding with task creation for ${actionItem.id}`)

        // Check if task already exists (prevent duplicates)
        // Use different query based on source type
        let existingTask = null
        if (source === 'ai_suggestion') {
          // For AI suggestions, check metadata->>'suggestion_id'
          const { data } = await supabase
            .from('tasks')
            .select('id')
            .eq('source', 'ai_suggestion')
            .contains('metadata', { suggestion_id: actionItem.id })
            .maybeSingle()
          existingTask = data
        } else if (source === 'call_action_item') {
          const { data } = await supabase
            .from('tasks')
            .select('id')
            .eq('call_action_item_id', actionItem.id)
            .maybeSingle()
          existingTask = data
        } else {
          // For meeting action items, check meeting_action_item_id FK
          const { data } = await supabase
            .from('tasks')
            .select('id')
            .eq('meeting_action_item_id', actionItem.id)
            .maybeSingle()
          existingTask = data
        }

        if (existingTask) {
          console.log(`[create-task-unified] Task already exists for action item ${actionItem.id}`)
          continue
        }

        // Determine assignee with strict validation
        let assignedTo: string | null = null

        if (actionItem.assignee_email) {
          // Try exact match first
          const { data: exactMatch } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', actionItem.assignee_email)
            .maybeSingle()

          if (exactMatch) {
            assignedTo = exactMatch.id
            console.log(`[create-task-unified] Found exact match for ${actionItem.assignee_email}`)
          } else {
            // Try fuzzy match (case-insensitive, trim whitespace)
            const cleanEmail = actionItem.assignee_email.toLowerCase().trim()
            const { data: fuzzyMatch } = await supabase
              .from('profiles')
              .select('id, email')
              .ilike('email', cleanEmail)
              .maybeSingle()

            if (fuzzyMatch) {
              assignedTo = fuzzyMatch.id
              console.log(`[create-task-unified] Found fuzzy match for ${cleanEmail}`)
            }
          }
        }

        // Fallback to source owner (NOT current user!)
        if (!assignedTo) {
          const fallbackOwner =
            (meetingCtx && meetingCtx.owner_user_id) ||
            (callCtx && callCtx.owner_user_id) ||
            null
          if (fallbackOwner) {
            assignedTo = fallbackOwner
            console.log(`[create-task-unified] Falling back to activity owner: ${assignedTo}`)
          }
        }

        // If still no valid assignee, REFUSE to create task
        if (!assignedTo) {
          const error = `Cannot assign task - assignee not found in system (${actionItem.assignee_email || 'no email'})`
          console.warn(`[create-task-unified] ${error}`)
          errors.push({
            action_item_id: actionItem.id,
            error
          })
          continue
        }

        // Calculate due date (with strict normalization to avoid “wrong year” / past-date bugs)
        let dueDate = null
        const now = new Date()

        const rawProposed = (actionItem.due_date || actionItem.deadline_at || actionItem.recommended_deadline || null) as string | null
        const anchorIso =
          (meetingCtx?.meeting_start as string | null) ||
          (callCtx?.started_at as string | null) ||
          null

        const normalized = clampNewTaskDueDate({
          proposed: rawProposed,
          anchorIso,
          now
        })

        dueDate = normalized.dueDateIso
        if (normalized.wasClamped) {
          console.log(
            `[create-task-unified] Due date clamped from ${rawProposed || 'null'} to ${dueDate} (anchor=${anchorIso || 'none'})`
          )
        }

        // Map category to task_type
        const taskTypeMapping: Record<string, string> = {
          'follow_up': 'follow_up',
          'follow-up': 'follow_up',
          'proposal': 'proposal',
          'demo': 'demo',
          'meeting': 'meeting',
          'research': 'research',
          'internal': 'internal'
        }
        const taskType = taskTypeMapping[actionItem.category?.toLowerCase() || ''] || 'follow_up'

        // Create the task with appropriate forward link based on source type
        // IMPORTANT: Two different linking patterns:
        // 1. AI suggestions: Link via metadata->>'suggestion_id' (no FK constraint)
        // 2. Meeting action items: Link via meeting_action_item_id FK
        const meetingTitle = meetingCtx?.title || null
        const callLabel = callCtx?.started_at
          ? `Call (${new Date(callCtx.started_at).toISOString().slice(0, 10)})`
          : 'Call'

        const taskDescriptionHeader =
          source === 'call_action_item'
            ? `Action item from call: ${callLabel}`
            : meetingTitle
              ? `Action item from meeting: ${meetingTitle}`
              : `Action item from ${source}`

        const { data: newTask, error: taskError } = await supabase
          .from('tasks')
          .insert({
            title: actionItem.title || actionItem.description,
            description: `${taskDescriptionHeader}\n\n${actionItem.description || ''}`,
            due_date: dueDate,
            priority: actionItem.priority || 'medium',
            status: actionItem.completed ? 'completed' : 'pending',
            task_type: taskType,
            assigned_to: assignedTo,
            created_by: user.id,
            company_id: meetingCtx?.company_id || callCtx?.company_id || null,
            contact_id: meetingCtx?.primary_contact_id || callCtx?.contact_id || null,
            deal_id: callCtx?.deal_id || null,
            meeting_id: meetingCtx?.id || (source === 'action_item' ? actionItem.meeting_id : null),
            call_id: callCtx?.id || null,
            // Only set FK for the matching source type
            meeting_action_item_id: source === 'action_item' ? actionItem.id : null,
            call_action_item_id: source === 'call_action_item' ? actionItem.id : null,
            source:
              source === 'ai_suggestion'
                ? 'ai_suggestion'
                : source === 'call_action_item'
                  ? 'justcall_action_item'
                  : 'fathom_action_item',
            importance: actionItem.importance,  // Store importance
            metadata: {
              action_item_id: actionItem.id,
              suggestion_id: source === 'ai_suggestion' ? actionItem.id : null,
              fathom_meeting_id: meetingCtx?.id || (source === 'action_item' ? actionItem.meeting_id : null),
              call_id: callCtx?.id || (source === 'call_action_item' ? actionItem.call_id : null),
              confidence_score: actionItem.confidence_score,
              recording_timestamp: actionItem.recording_timestamp,
              recording_playback_url: actionItem.recording_playback_url,
              original_due_date: normalized.originalDueDateIso,
              due_date_was_clamped: normalized.wasClamped
            }
          })
          .select()
          .single()

        if (taskError) {
          console.error(`[create-task-unified] Failed to create task for ${actionItem.id}:`, taskError)
          errors.push({
            action_item_id: actionItem.id,
            error: `Failed to create task: ${taskError.message}`
          })
          continue
        }

        console.log(`[create-task-unified] Created task ${newTask.id} for action item ${actionItem.id}`)

        // Update action item with linked_task_id and sync status
        const { error: updateError } = await supabase
          .from(tableName)
          .update({
            linked_task_id: newTask.id,
            synced_to_task: true,
            sync_status: 'synced',
            updated_at: new Date().toISOString()
          })
          .eq('id', actionItem.id)

        if (updateError) {
          console.error(`[create-task-unified] Failed to update action item ${actionItem.id}:`, updateError)
          // Don't fail the request - task was created successfully
        } else {
          console.log(`[create-task-unified] Updated action item ${actionItem.id} with linked_task_id`)
        }

        tasksCreated.push(newTask)

      } catch (itemError) {
        console.error(`[create-task-unified] Error processing action item ${actionItem.id}:`, itemError)
        errors.push({
          action_item_id: actionItem.id,
          error: itemError instanceof Error ? itemError.message : 'Unknown error'
        })
      }
    }

    console.log(`[create-task-unified] Completed: Created ${tasksCreated.length} tasks, ${errors.length} errors`)

    return new Response(
      JSON.stringify({
        success: true,
        tasks_created: tasksCreated.length,
        tasks: tasksCreated,
        errors: errors.length > 0 ? errors : undefined
      } as CreateTaskResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error(`[create-task-unified] Fatal error:`, error)

    // Capture error to Sentry
    await captureException(error, {
      tags: {
        function: 'create-task-unified',
      },
    })

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

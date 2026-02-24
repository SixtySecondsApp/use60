/**
 * Generate More Actions Edge Function
 *
 * Manual extraction of additional action items from meeting transcripts
 * with intelligent deduplication based on existing tasks.
 *
 * Features:
 * - Fetches existing tasks to avoid duplicates
 * - Provides context to AI about what's already tracked
 * - Generates 5-10 additional deeper action items
 * - Creates tasks directly (unified system)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkCreditBalance, logAICostEvent } from '../_shared/costTracking.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  meetingId: string
  maxActions?: number
}

interface ExistingTask {
  id: string
  title: string
  description: string
}

interface GeneratedAction {
  title: string
  description: string
  task_type: string
  priority: string
  estimated_days_to_complete: number
  timestamp_seconds?: number
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { meetingId, maxActions = 7 }: RequestBody = await req.json()

    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: meetingId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get authenticated user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // Fetch meeting with transcript
    const { data: meeting, error: meetingError } = await supabaseClient
      .from('meetings')
      .select(`
        id,
        title,
        transcript_text,
        summary,
        owner_user_id,
        company_id,
        primary_contact_id,
        companies:companies!fk_meetings_company_id(id, name),
        contacts:contacts!primary_contact_id(id, first_name, last_name, full_name, email)
      `)
      .eq('id', meetingId)
      .single()

    if (meetingError || !meeting) {
      return new Response(
        JSON.stringify({ error: 'Meeting not found or missing transcript' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!meeting.transcript_text) {
      return new Response(
        JSON.stringify({ error: 'Meeting transcript not available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get org for credit check
    const { data: membership } = await supabaseClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    const orgId = membership?.org_id ?? null

    if (orgId) {
      const balanceCheck = await checkCreditBalance(supabaseClient, orgId)
      if (!balanceCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Insufficient credits. Please top up to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Fetch existing tasks for this meeting (for deduplication)
    const { data: existingTasks } = await supabaseClient
      .from('tasks')
      .select('id, title, description')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: false })

    const existingTaskList: ExistingTask[] = existingTasks || []
    // Generate additional actions with Claude
    const newActions = await generateAdditionalActions(
      meeting,
      existingTaskList,
      maxActions
    )

    // Log AI cost event
    if (orgId) {
      const model = Deno.env.get('CLAUDE_MODEL') || 'claude-haiku-4-5-20251001'
      await logAICostEvent(
        supabaseClient, user.id, orgId, 'anthropic', model,
        0, 0, 'task_execution'
      )
    }

    if (!newActions || newActions.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No additional actions generated',
          tasks: [],
          count: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create tasks directly
    const createdTasks = await createTasksFromActions(
      supabaseClient,
      newActions,
      meeting,
      user.id
    )
    return new Response(
      JSON.stringify({
        tasks: createdTasks,
        count: createdTasks.length,
        message: `Generated ${createdTasks.length} additional action items`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Generate additional actions using Claude with deduplication context
 */
async function generateAdditionalActions(
  meeting: any,
  existingTasks: ExistingTask[],
  maxActions: number
): Promise<GeneratedAction[]> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    throw new Error('AI service not configured')
  }

  // Build list of existing tasks for deduplication
  const existingTasksContext = existingTasks.length > 0
    ? existingTasks.map(t => `- ${t.title}`).join('\n')
    : 'None yet - this is the first extraction'

  const companyName = meeting.companies?.name || 'the company'
  const contactName = meeting.contacts?.full_name || 'the contact'

  const systemPrompt = `You are an expert sales AI assistant specialized in deep meeting analysis.

Your task is to find ADDITIONAL action items that haven't been captured yet. Go deeper than surface-level tasks.

Focus on:
- Internal research and preparation tasks
- Follow-up items on specific topics discussed
- Documentation and sharing actions
- Coordination with internal teams
- Technical or product-specific follow-ups
- Competitive intelligence gathering
- ROI/business case preparation
- Stakeholder mapping and engagement

Return ${maxActions} specific, actionable tasks that are DIFFERENT from what's already tracked.

For each action:
1. Task type - MUST be one of: call, email, meeting, follow_up, proposal, demo, general
2. Clear title (action-oriented)
3. Detailed description (why it matters, context from meeting)
4. Priority (low, medium, high, urgent)
5. Estimated days to deadline (1-14 days, based on urgency)
6. Optional: timestamp_seconds if you can identify when this topic was discussed

Return ONLY valid JSON array.`

  const userPrompt = `Meeting: "${meeting.title}"
Company: ${companyName}
Contact: ${contactName}

ALREADY TRACKED (DO NOT DUPLICATE):
${existingTasksContext}

FULL MEETING TRANSCRIPT:
${meeting.transcript_text}

Generate ${maxActions} ADDITIONAL action items that:
1. Are NOT duplicates of existing tasks
2. Cover deeper details, follow-ups, or preparation work
3. Are specific and actionable
4. Have clear business value

Return as JSON array:
[
  {
    "title": "Research competitor pricing model mentioned",
    "description": "Client compared our pricing to Competitor X. Research their pricing structure and prepare comparison doc highlighting our advantages. Mentioned around 15min mark.",
    "task_type": "general",
    "priority": "high",
    "estimated_days_to_complete": 2,
    "timestamp_seconds": 900
  }
]`
  const model = Deno.env.get('CLAUDE_MODEL') || 'claude-haiku-4-5-20251001'
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 3072,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error('AI service error')
  }

  const responseData = await response.json()
  let aiResponse = responseData.content[0]?.text || '[]'

  // Strip markdown code blocks
  const codeBlockMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) {
    aiResponse = codeBlockMatch[1].trim()
  }

  try {
    const actions = JSON.parse(aiResponse)
    return Array.isArray(actions) ? actions : []
  } catch (parseError) {
    return []
  }
}

/**
 * Create tasks from generated actions
 */
async function createTasksFromActions(
  supabase: any,
  actions: GeneratedAction[],
  meeting: any,
  userId: string
): Promise<any[]> {
  const createdTasks = []

  for (const action of actions) {
    try {
      // Calculate due date
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + (action.estimated_days_to_complete || 3))

      const taskData = {
        title: action.title,
        description: action.description,
        task_type: action.task_type || 'general',
        priority: action.priority || 'medium',
        due_date: dueDate.toISOString(),
        status: 'pending',
        assigned_to: userId,
        created_by: userId,
        meeting_id: meeting.id,
        company_id: meeting.company_id,
        contact_id: meeting.primary_contact_id,
        source: 'manual_extraction',
        metadata: {
          timestamp_seconds: action.timestamp_seconds,
          generated_via: 'generate-more-actions',
          extraction_date: new Date().toISOString()
        }
      }

      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert(taskData)
        .select()
        .single()

      if (taskError) {
        continue
      }

      createdTasks.push(task)
    } catch (error) {
    }
  }

  return createdTasks
}

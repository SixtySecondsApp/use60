import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { analyzeTranscriptWithClaude, deduplicateActionItems } from '../fathom-sync/aiAnalysis.ts'
import { logAICostEvent, extractAnthropicUsage, checkCreditBalance } from '../_shared/costTracking.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  meetingId: string
  rerun?: boolean
}

async function ensureTranscriptAvailable(supabaseClient: any, authHeader: string, meetingId: string) {
  // Attempt to fetch transcript via existing edge function. This function will no-op if already present.
  try {
    const functionsBase = Deno.env.get('SUPABASE_URL')
    if (!functionsBase) return

    const res = await fetch(`${functionsBase}/functions/v1/fetch-transcript`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ meetingId }),
    })

    // 200 OK or 202 Accepted are fine; otherwise just proceed
    if (!res.ok && res.status !== 202) {
      // Log but don't fail hard; analysis may still proceed if transcript already present
      const txt = await res.text().catch(() => '')
    }
  } catch (e) {
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { meetingId }: RequestBody = await req.json()
    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: 'meetingId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Detect if caller is using the service role key (e.g., from orchestrator)
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const isServiceRole = !!serviceRoleKey && token === serviceRoleKey

    // Use service-role client when called from orchestrator (bypasses RLS properly)
    // Otherwise use anon-key client with user auth (respects RLS)
    const supabaseClient = isServiceRole
      ? createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          serviceRoleKey,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )
      : createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: authHeader } } }
        )

    // Load meeting with minimal fields we need (including owner_user_id for extraction rules)
    const { data: meeting, error: meetingErr } = await supabaseClient
      .from('meetings')
      .select('id, title, meeting_start, transcript_text, owner_email, owner_user_id')
      .eq('id', meetingId)
      .single()

    if (meetingErr || !meeting) {
      return new Response(
        JSON.stringify({ error: 'Meeting not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Ensure transcript exists (best-effort)
    if (!meeting.transcript_text) {
      await ensureTranscriptAvailable(supabaseClient, authHeader, meetingId)
    }

    // Re-fetch to get latest transcript_text after ensure step
    const { data: meeting2 } = await supabaseClient
      .from('meetings')
      .select('id, title, meeting_start, transcript_text, owner_email, owner_user_id')
      .eq('id', meetingId)
      .single()

    const transcriptText = meeting2?.transcript_text || meeting.transcript_text || ''

    if (!transcriptText || transcriptText.trim().length < 10) {
      return new Response(
        JSON.stringify({ itemsCreated: 0, message: 'Transcript not available yet' }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get org for credit check
    const { data: membership } = await supabaseClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', meeting.owner_user_id || '')
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

    // Analyze transcript for action items using existing analyzer (with extraction rules - Phase 6.3)
    // Use service role client for extraction rules lookup (bypasses RLS)
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
    
    const analysis = await analyzeTranscriptWithClaude(
      transcriptText,
      {
        id: meeting.id,
        title: meeting.title,
        meeting_start: meeting.meeting_start,
        owner_email: meeting.owner_email,
      },
      supabaseService,
      meeting2?.owner_user_id || meeting.owner_user_id
    )

    // Log AI cost event for transcript analysis
    const ownerUserId = meeting2?.owner_user_id || meeting.owner_user_id
    if (ownerUserId && orgId) {
      await logAICostEvent(
        supabaseService, ownerUserId, orgId, 'anthropic', 'claude-haiku-4-5-20251001',
        0, 0, 'task_execution'
      )
    }

    // Optional: also consider any existing Fathom action items to deduplicate
    // We don't have Fathom payload here, so dedupe against DB by title and timestamp
    const aiItems = analysis.actionItems

    let createdCount = 0
    for (const item of aiItems) {
      const title = String(item.title || '').trim()
      if (!title) continue

      // Check for existing similar item in DB for this meeting
      const { data: existing } = await supabaseClient
        .from('meeting_action_items')
        .select('id')
        .eq('meeting_id', meetingId)
        .eq('title', title)
        .limit(1)

      if (existing && existing.length > 0) {
        continue
      }

      // Map AI fields to DB schema
      const deadline_at = item.deadline ? new Date(item.deadline).toISOString() : null
      const priority = item.priority || 'medium'
      const category = item.category || 'other'

      // Assign to owner by default for rep tasks (if no email present)
      const assignee_email = item.assignedToEmail || meeting.owner_email || null
      const assignee_name = item.assignedTo || null

      const insertPayload: Record<string, any> = {
        meeting_id: meetingId,
        title,
        assignee_name,
        assignee_email,
        priority,
        category,
        deadline_at,
        completed: false,
        ai_generated: true,
        ai_confidence: item.confidence ?? null,
        synced_to_task: false, // Explicitly prevent automatic task creation
        task_id: null, // No task created yet - manual creation only
        timestamp_seconds: null,
        playback_url: null,
      }

      const { error: insertErr } = await supabaseClient
        .from('meeting_action_items')
        .insert(insertPayload)

      if (!insertErr) {
        createdCount++
      } else {
      }
    }

    return new Response(
      JSON.stringify({ itemsCreated: createdCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})



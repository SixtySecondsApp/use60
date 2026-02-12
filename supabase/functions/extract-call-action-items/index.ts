import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { analyzeTranscriptWithClaude } from '../_shared/aiAnalysis.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  callId: string
  rerun?: boolean
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

    const { callId }: RequestBody = await req.json()
    if (!callId) {
      return new Response(
        JSON.stringify({ error: 'callId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // RLS client with caller token (org access enforced via policies)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Load call minimal fields we need
    const { data: call, error: callErr } = await supabaseClient
      .from('calls')
      .select('id, org_id, started_at, transcript_text, owner_email, owner_user_id, from_number, to_number, direction')
      .eq('id', callId)
      .single()

    if (callErr || !call) {
      return new Response(
        JSON.stringify({ error: 'Call not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const transcriptText = String(call.transcript_text || '')
    if (!transcriptText || transcriptText.trim().length < 10) {
      return new Response(
        JSON.stringify({ itemsCreated: 0, message: 'Transcript not available yet' }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use service role for extraction rules lookup inside analyzer (bypasses RLS)
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Build a meeting-like context for shared analyzer
    const direction = call.direction ? String(call.direction) : 'call'
    const from = call.from_number ? String(call.from_number) : 'unknown'
    const to = call.to_number ? String(call.to_number) : 'unknown'
    const title = `Call (${direction}) ${from} → ${to}`

    const analysis = await analyzeTranscriptWithClaude(
      transcriptText,
      {
        id: call.id,
        title,
        meeting_start: call.started_at,
        owner_email: call.owner_email,
      },
      supabaseService,
      call.owner_user_id
    )

    const aiItems = analysis.actionItems || []

    let createdCount = 0
    for (const item of aiItems) {
      const itemTitle = String(item.title || '').trim()
      if (!itemTitle) continue

      // Insert with unique(call_id,title) constraint for best-effort dedupe
      const deadline_at = item.deadline ? new Date(item.deadline).toISOString() : null
      const priority = item.priority || 'medium'
      const category = item.category || 'general'
      const confidence = typeof item.confidence === 'number' ? item.confidence : null

      // Map priority → importance (used by auto-sync preferences)
      const importance =
        priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'medium'

      const assignee_email = item.assignedToEmail || call.owner_email || null
      const assignee_name = item.assignedTo || null

      const insertPayload: Record<string, any> = {
        org_id: call.org_id,
        call_id: callId,
        title: itemTitle,
        description: null,
        assignee_name,
        assignee_email,
        priority,
        category,
        deadline_at,
        importance,
        confidence_score: confidence,
        ai_generated: true,
        completed: false,
        timestamp_seconds: null,
        playback_url: null,
        synced_to_task: false,
        sync_status: 'pending',
        linked_task_id: null,
      }

      const { error: insertErr } = await supabaseClient
        .from('call_action_items')
        .insert(insertPayload)

      if (!insertErr) {
        createdCount++
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














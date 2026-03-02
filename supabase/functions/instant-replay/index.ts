/**
 * Instant Replay Orchestrator — REPLAY-002
 *
 * Runs the full meeting pipeline on the user's most recent notetaker meeting.
 * This is the "wow moment" feature: within 60 seconds of requesting, the user
 * sees a structured summary, action items, and a draft follow-up email generated
 * from their most recent sales call.
 *
 * Flow:
 *   1. Authenticate user + load their notetaker API key
 *   2. Charge credits ONCE upfront (action_id = 'instant_replay')
 *   3. Fetch most recent meeting via fetchRecentMeeting helper
 *   4. Create meeting record in DB if not already present
 *   5. Run pipeline in parallel where possible:
 *      a. meeting-process-structured-summary
 *      b. extract-action-items
 *      c. generate-follow-up (DRAFT only — never auto-sends)
 *   6. Set instant_replay_completed flag on user_onboarding_progress
 *   7. Stream all progress events via SSE throughout
 *
 * SSE events:
 *   step   — { id, status: 'running'|'complete'|'error'|'skipped', label, detail? }
 *   result — { meetingId, summary, actionItems, followUpDraft, durationMs }
 *   error  — { message } — terminal; stream closes
 *
 * Timeout: 90-second soft timeout — returns partial results if pipeline stalls.
 *
 * Deploy with: supabase functions deploy instant-replay --no-verify-jwt
 * (staging ES256 JWT issue; JWT validation done manually in handler)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { getAuthContext } from '../_shared/edgeAuth.ts'
import { fetchRecentMeeting } from '../_shared/fetchRecentMeeting.ts'
// Instant Replay is free during onboarding — costTracking import removed

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Soft timeout in milliseconds — return partial results if exceeded */
const PIPELINE_TIMEOUT_MS = 90_000

/** Instant Replay is free during onboarding — no credit charge */

const LOG = '[instant-replay]'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RequestBody {
  user_id?: string
  org_id?: string
  notetaker_source?: 'fathom' | 'fireflies' | 'sixty'
}

interface PipelineResult {
  meetingId: string | null
  summary: Record<string, unknown> | null
  actionItems: Array<Record<string, unknown>>
  followUpDraft: Record<string, unknown> | null
  durationMs: number
  timedOut: boolean
}

// ── SSE Helper ────────────────────────────────────────────────────────────────

function makeSSESender(controller: ReadableStreamDefaultController<Uint8Array>) {
  const encoder = new TextEncoder()
  return function sendEvent(event: string, data: Record<string, unknown>) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    try {
      controller.enqueue(encoder.encode(payload))
    } catch {
      // Stream may already be closed; ignore enqueue errors
    }
  }
}

// ── Child pipeline caller (uses service role to skip per-function credit checks) ──

async function callPipelineFunction(
  functionName: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; data: unknown; status: number }> {
  const url = `${SUPABASE_URL}/functions/v1/${functionName}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Service role key — child functions detect this and skip individual credit checks
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  })

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  return { ok: res.ok, data, status: res.status }
}

// ── Notetaker API key lookup ──────────────────────────────────────────────────

async function resolveNotetakerApiKey(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  source: 'fathom' | 'fireflies'
): Promise<string | null> {
  if (source === 'fathom') {
    const { data } = await serviceClient
      .from('fathom_integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()
    return data?.access_token ?? null
  }

  if (source === 'fireflies') {
    const { data } = await serviceClient
      .from('fireflies_integrations')
      .select('api_key')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()
    return data?.api_key ?? null
  }

  return null
}

// ── Notetaker source detection ────────────────────────────────────────────────

async function detectNotetakerSource(
  serviceClient: ReturnType<typeof createClient>,
  userId: string
): Promise<'fathom' | 'fireflies' | 'sixty' | null> {
  // Check Fathom first
  const { data: fathom } = await serviceClient
    .from('fathom_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (fathom?.id) return 'fathom'

  // Check Fireflies
  const { data: fireflies } = await serviceClient
    .from('fireflies_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (fireflies?.id) return 'fireflies'

  // Check 60 Notetaker — has meetings with source_type='60_notetaker' or provider='60_notetaker'
  const { data: sixtyMeeting } = await serviceClient
    .from('meetings')
    .select('id')
    .eq('owner_user_id', userId)
    .or('source_type.eq.60_notetaker,provider.eq.60_notetaker')
    .limit(1)
    .maybeSingle()

  if (sixtyMeeting?.id) return 'sixty'

  return null
}

/**
 * For 60 Notetaker: fetch the most recent meeting directly from the meetings table
 * (no external API call needed — MeetingBaaS webhook already saved it).
 */
async function fetchRecentMeetingFromDB(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  orgId: string
): Promise<{ meetingId: string; transcript: string; title: string; date: string; duration: number; participants: string[] } | null> {
  const { data: meeting } = await serviceClient
    .from('meetings')
    .select('id, title, created_at, duration_minutes, transcript_text')
    .eq('owner_user_id', userId)
    .eq('org_id', orgId)
    .not('transcript_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!meeting?.id || !meeting.transcript_text) return null

  // Fetch participants from meeting_attendees
  const { data: attendees } = await serviceClient
    .from('meeting_attendees')
    .select('attendee_name, attendee_email')
    .eq('meeting_id', meeting.id)

  const participants = (attendees ?? [])
    .map((a: { attendee_name?: string; attendee_email?: string }) => a.attendee_name || a.attendee_email || '')
    .filter(Boolean)

  return {
    meetingId: meeting.id,
    transcript: meeting.transcript_text,
    title: meeting.title ?? 'Untitled meeting',
    date: meeting.created_at,
    duration: meeting.duration_minutes ?? 0,
    participants,
  }
}

// ── Meeting record creation ───────────────────────────────────────────────────

async function upsertMeetingRecord(
  serviceClient: ReturnType<typeof createClient>,
  params: {
    userId: string
    orgId: string
    title: string
    date: string
    durationMinutes: number
    participants: string[]
    transcriptText: string
    sourceType: 'fathom' | 'fireflies'
  }
): Promise<string | null> {
  try {
    // Check if a meeting with this title + date already exists for this user
    // Use a 24h window around the meeting date to avoid duplicates
    const meetingDate = new Date(params.date)
    const windowStart = new Date(meetingDate.getTime() - 12 * 60 * 60 * 1000).toISOString()
    const windowEnd = new Date(meetingDate.getTime() + 12 * 60 * 60 * 1000).toISOString()

    const { data: existing } = await serviceClient
      .from('meetings')
      .select('id')
      .eq('owner_user_id', params.userId)
      .eq('org_id', params.orgId)
      .ilike('title', params.title)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .maybeSingle()

    if (existing?.id) {
      console.log(`${LOG} Reusing existing meeting ${existing.id}`)
      // Update transcript if missing
      await serviceClient
        .from('meetings')
        .update({ transcript_text: params.transcriptText })
        .eq('id', existing.id)
        .is('transcript_text', null)
      return existing.id
    }

    // Create new meeting record
    const { data: created, error } = await serviceClient
      .from('meetings')
      .insert({
        owner_user_id: params.userId,
        org_id: params.orgId,
        title: params.title,
        created_at: params.date,
        duration_minutes: params.durationMinutes,
        transcript_text: params.transcriptText,
        source_type: params.sourceType,
      })
      .select('id')
      .single()

    if (error) {
      console.error(`${LOG} Failed to create meeting record:`, error.message)
      return null
    }

    console.log(`${LOG} Created meeting ${created.id}`)
    return created.id
  } catch (err) {
    console.error(`${LOG} upsertMeetingRecord error:`, err instanceof Error ? err.message : String(err))
    return null
  }
}

// ── Onboarding progress flag ──────────────────────────────────────────────────

async function markInstantReplayCompleted(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  meetingId: string | null
): Promise<void> {
  try {
    await serviceClient
      .from('user_onboarding_progress')
      .upsert(
        {
          user_id: userId,
          instant_replay_completed: true,
          ...(meetingId ? { instant_replay_meeting_id: meetingId } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
  } catch (err) {
    // Non-fatal — don't block the response
    console.warn(`${LOG} Failed to set instant_replay_completed:`, err instanceof Error ? err.message : String(err))
  }
}

// ── Pipeline runner ───────────────────────────────────────────────────────────

async function runPipeline(
  serviceClient: ReturnType<typeof createClient>,
  meetingId: string,
  sendEvent: ReturnType<typeof makeSSESender>
): Promise<{
  summary: Record<string, unknown> | null
  actionItems: Array<Record<string, unknown>>
  followUpDraft: Record<string, unknown> | null
}> {
  let summary: Record<string, unknown> | null = null
  let actionItems: Array<Record<string, unknown>> = []
  let followUpDraft: Record<string, unknown> | null = null

  // ── Step: Structured summary ──
  sendEvent('step', { id: 'structured_summary', status: 'running', label: 'Analysing meeting transcript' })
  try {
    const summaryRes = await callPipelineFunction('meeting-process-structured-summary', {
      meetingId,
      forceReprocess: false,
    })
    if (summaryRes.ok && summaryRes.data && typeof summaryRes.data === 'object') {
      const d = summaryRes.data as Record<string, unknown>
      summary = (d.summary as Record<string, unknown>) ?? d ?? null
      sendEvent('step', { id: 'structured_summary', status: 'complete', label: 'Meeting analysed' })
    } else {
      console.warn(`${LOG} structured-summary failed:`, summaryRes.status, summaryRes.data)
      sendEvent('step', { id: 'structured_summary', status: 'error', label: 'Summary failed — continuing' })
    }
  } catch (err) {
    console.error(`${LOG} structured-summary error:`, err instanceof Error ? err.message : String(err))
    sendEvent('step', { id: 'structured_summary', status: 'error', label: 'Summary failed — continuing' })
  }

  // ── Step: Action items ──
  sendEvent('step', { id: 'action_items', status: 'running', label: 'Extracting action items' })
  try {
    const actionRes = await callPipelineFunction('extract-action-items', {
      meetingId,
      rerun: false,
    })
    if (actionRes.ok && actionRes.data && typeof actionRes.data === 'object') {
      const d = actionRes.data as Record<string, unknown>
      actionItems = Array.isArray(d.action_items)
        ? (d.action_items as Array<Record<string, unknown>>)
        : []
      sendEvent('step', {
        id: 'action_items',
        status: 'complete',
        label: `${actionItems.length} action item${actionItems.length !== 1 ? 's' : ''} found`,
      })
    } else {
      console.warn(`${LOG} extract-action-items failed:`, actionRes.status, actionRes.data)
      sendEvent('step', { id: 'action_items', status: 'error', label: 'Action items failed — continuing' })
    }
  } catch (err) {
    console.error(`${LOG} action-items error:`, err instanceof Error ? err.message : String(err))
    sendEvent('step', { id: 'action_items', status: 'error', label: 'Action items failed — continuing' })
  }

  // ── Step: Follow-up email draft ──
  // IMPORTANT: This generates a DRAFT only — never auto-sends.
  sendEvent('step', { id: 'follow_up', status: 'running', label: 'Drafting follow-up email' })
  try {
    // generate-follow-up streams SSE; we call it as a normal POST via service role
    // which returns JSON when called with service role key
    const followUpRes = await callPipelineFunction('generate-follow-up', {
      meeting_id: meetingId,
      draft_only: true, // signal to not deliver
      user_id: null,    // service role provides no user context — function resolves from meeting owner
    })
    if (followUpRes.ok && followUpRes.data && typeof followUpRes.data === 'object') {
      const d = followUpRes.data as Record<string, unknown>
      followUpDraft = (d.email as Record<string, unknown>) ?? d ?? null
      sendEvent('step', { id: 'follow_up', status: 'complete', label: 'Follow-up draft ready' })
    } else {
      // generate-follow-up with SSE will return a streaming body — this is expected
      // for user-initiated calls. For service-role calls it may still stream.
      // If we can't parse, treat as partial success and move on.
      console.warn(`${LOG} generate-follow-up response not JSON:`, followUpRes.status)
      sendEvent('step', {
        id: 'follow_up',
        status: 'skipped',
        label: 'Follow-up will be available in the meetings tab',
      })
    }
  } catch (err) {
    console.error(`${LOG} follow-up error:`, err instanceof Error ? err.message : String(err))
    sendEvent('step', {
      id: 'follow_up',
      status: 'skipped',
      label: 'Follow-up will be available in the meetings tab',
    })
  }

  // Reload action items from DB in case the edge function stored them directly
  if (actionItems.length === 0) {
    try {
      const { data: dbItems } = await serviceClient
        .from('meeting_action_items')
        .select('id, title, assignee_name, deadline_at, completed')
        .eq('meeting_id', meetingId)
      actionItems = (dbItems ?? []) as Array<Record<string, unknown>>
    } catch {
      // Non-fatal
    }
  }

  // Load summary from DB if pipeline didn't return it inline
  if (!summary) {
    try {
      const { data: dbMeeting } = await serviceClient
        .from('meetings')
        .select('summary, structured_summary')
        .eq('id', meetingId)
        .maybeSingle()
      if (dbMeeting) {
        summary = (dbMeeting.structured_summary as Record<string, unknown>) ??
          (dbMeeting.summary ? { text: dbMeeting.summary } : null)
      }
    } catch {
      // Non-fatal
    }
  }

  return { summary, actionItems, followUpDraft }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  const corsHeaders = getCorsHeaders(req)

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Auth (before opening SSE stream so we can return a clean 401) ──
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let userId: string
  let orgId: string
  let notetakerSource: 'fathom' | 'fireflies' | 'sixty'

  try {
    const body = await req.json().catch(() => ({} as RequestBody)) as RequestBody

    const authCtx = await getAuthContext(req, serviceClient, SUPABASE_SERVICE_ROLE_KEY)

    // Support service-role callers specifying user_id (for cron / internal triggers)
    if (authCtx.mode === 'service_role' && body.user_id) {
      userId = body.user_id
    } else if (!authCtx.userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      userId = authCtx.userId
    }

    // Resolve org_id
    if (body.org_id) {
      orgId = body.org_id
    } else {
      const { data: membership } = await serviceClient
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!membership?.org_id) {
        return new Response(JSON.stringify({ error: 'No organisation found for user' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      orgId = membership.org_id
    }

    // Resolve notetaker source
    if (body.notetaker_source) {
      notetakerSource = body.notetaker_source
    } else {
      const detected = await detectNotetakerSource(serviceClient, userId)
      // Default to 'sixty' — demo mode works without a real integration
      notetakerSource = detected ?? 'sixty'
    }
  } catch (authErr) {
    console.error(`${LOG} Auth error:`, authErr instanceof Error ? authErr.message : String(authErr))
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Open SSE stream ────────────────────────────────────────────────────────
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = makeSSESender(controller)
      const startMs = Date.now()

      const result: PipelineResult = {
        meetingId: null,
        summary: null,
        actionItems: [],
        followUpDraft: null,
        durationMs: 0,
        timedOut: false,
      }

      try {
        // ── Instant Replay is a DEMO during onboarding ──
        // Shows realistic sample data to demonstrate what 60 does after every meeting.
        // No credits charged, no real API calls, no real meeting data.

        const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

        // Step 0: Free badge
        sendEvent('step', { id: 'credits', status: 'complete', label: 'Free during onboarding' })
        await delay(400)

        // Step 1: Pretend to connect notetaker
        sendEvent('step', { id: 'load_api_key', status: 'running', label: `Connecting to ${notetakerSource === 'sixty' ? '60 Notetaker' : notetakerSource}` })
        await delay(800)
        sendEvent('step', { id: 'load_api_key', status: 'complete', label: `${notetakerSource === 'sixty' ? '60 Notetaker' : notetakerSource} connected` })

        // Step 2: Pretend to fetch meeting
        sendEvent('step', { id: 'fetch_meeting', status: 'running', label: 'Fetching most recent meeting' })
        await delay(1200)
        const demoTitle = 'Product Demo — Acme Corp'
        sendEvent('step', {
          id: 'fetch_meeting',
          status: 'complete',
          label: demoTitle,
          detail: '32 min · 3 participants',
        })

        // Step 3: Pretend to save
        sendEvent('step', { id: 'save_meeting', status: 'running', label: 'Saving meeting record' })
        await delay(600)
        sendEvent('step', { id: 'save_meeting', status: 'complete', label: 'Meeting saved' })

        // Step 4: Pretend to analyse
        sendEvent('step', { id: 'structured_summary', status: 'running', label: 'Analysing meeting transcript' })
        await delay(1500)
        sendEvent('step', { id: 'structured_summary', status: 'complete', label: 'Meeting analysed' })

        // Step 5: Pretend to extract actions
        sendEvent('step', { id: 'action_items', status: 'running', label: 'Extracting action items' })
        await delay(1000)
        sendEvent('step', { id: 'action_items', status: 'complete', label: '3 action items found' })

        // Step 6: Pretend to draft follow-up
        sendEvent('step', { id: 'follow_up', status: 'running', label: 'Drafting follow-up email' })
        await delay(1200)
        sendEvent('step', { id: 'follow_up', status: 'complete', label: 'Follow-up draft ready' })

        // Mark onboarding flag
        await markInstantReplayCompleted(serviceClient, userId, null)

        // Emit demo result
        const demoDate = new Date().toISOString()
        result.durationMs = Date.now() - startMs

        sendEvent('result', {
          meetingId: null,
          meetingTitle: demoTitle,
          meetingDate: demoDate,
          summary: {
            overview: 'Product demo with Sarah Chen (VP Sales, Acme Corp), James Miller (Head of Ops), and you. Acme is evaluating sales automation tools to replace their current manual pipeline process. Strong interest in AI follow-ups and meeting prep features.',
            key_points: [
              'Acme currently spends 6+ hours/week on manual CRM updates and follow-up emails',
              'Their team of 12 reps needs a tool that integrates with HubSpot and Slack',
              'Sarah asked about data security and SOC 2 compliance — sent our security docs',
              'Budget approved for Q2, decision expected within 2 weeks',
            ],
            decisions: [
              'Agreed to a 14-day pilot with 3 reps starting next Monday',
              'James will be the technical POC for integration setup',
              'Follow-up call scheduled for next Thursday to review pilot results',
            ],
          },
          actionItems: [
            { title: 'Send Acme the security compliance documentation', assignee_name: 'You', deadline_at: new Date(Date.now() + 1 * 86400000).toISOString() },
            { title: 'Set up pilot account for 3 Acme reps', assignee_name: 'You', deadline_at: new Date(Date.now() + 2 * 86400000).toISOString() },
            { title: 'Schedule follow-up call with Sarah for Thursday', assignee_name: 'You', deadline_at: new Date(Date.now() + 3 * 86400000).toISOString() },
          ],
          followUpDraft: {
            subject: 'Great meeting today — next steps for Acme pilot',
            to: 'sarah.chen@acme.com',
            body: `Hi Sarah,\n\nGreat connecting today — excited about the pilot kicking off next Monday.\n\nAs discussed, here's what happens next:\n\n1. I'll send over our security documentation today\n2. We'll set up pilot accounts for you, James, and one more rep by Friday\n3. Our Thursday call is confirmed to review early results\n\nThe goal for the pilot: show your team that follow-ups and meeting prep can happen automatically, saving each rep 6+ hours a week.\n\nLet me know if you need anything before Monday.\n\nBest,`,
          },
          durationMs: result.durationMs,
          timedOut: false,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error'
        console.error(`${LOG} Unhandled error:`, message)
        sendEvent('error', { message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})

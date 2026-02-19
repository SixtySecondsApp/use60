/**
 * Reprocess Pending Meetings Edge Function
 *
 * Purpose: Reprocess meetings that are stuck with pending/failed statuses
 * Handles: transcripts, summaries, thumbnails, AI indexing, and AI analysis
 *
 * AI Analysis:
 *   - Generates sentiment score from transcript using Claude (not Fathom's API)
 *   - Generates talk time analysis, coaching insights, and action items
 *   - Independent of Fathom's summary endpoint - works even with expired tokens
 *
 * Uses per-user Fathom integration (not org-level)
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { fetchTranscriptFromFathom, fetchSummaryFromFathom } from '../_shared/fathomTranscript.ts'
import { analyzeTranscriptWithClaude, deduplicateActionItems, type TranscriptAnalysis } from '../fathom-sync/aiAnalysis.ts'

interface ReprocessRequest {
  mode: 'diagnose' | 'reprocess'
  limit?: number
  types?: Array<'transcript' | 'summary' | 'thumbnail' | 'ai_index' | 'ai_analysis'>
  meeting_ids?: string[]
  // Admin mode: allows service role key to process on behalf of a user
  admin_user_id?: string
}

interface MeetingStatus {
  id: string
  title: string
  meeting_start: string
  meeting_end: string | null
  duration_seconds: number | null
  fathom_recording_id: string | null
  owner_user_id: string
  thumbnail_status: string | null
  transcript_status: string | null
  summary_status: string | null
  transcript_fetch_attempts: number | null
  has_transcript: boolean
  has_summary: boolean
  has_thumbnail: boolean
  is_short_meeting: boolean
  short_meeting_reason: string | null
}

// Meetings under 60 seconds are considered "short" and may not have transcripts
const SHORT_MEETING_THRESHOLD_SECONDS = 60

interface DiagnoseResult {
  total_pending: number
  short_meetings_count: number
  by_status: {
    transcript_pending: number
    transcript_failed: number
    transcript_too_short: number
    summary_pending: number
    summary_failed: number
    thumbnail_pending: number
    thumbnail_failed: number
  }
  meetings: MeetingStatus[]
}

/**
 * Calculate meeting duration in seconds
 */
function calculateDurationSeconds(startTime: string | null, endTime: string | null): number | null {
  if (!startTime || !endTime) return null
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  if (isNaN(start) || isNaN(end)) return null
  return Math.round((end - start) / 1000)
}

/**
 * Determine if meeting is too short for transcription
 */
function isShortMeeting(durationSeconds: number | null): boolean {
  if (durationSeconds === null) return false
  return durationSeconds < SHORT_MEETING_THRESHOLD_SECONDS
}

/**
 * Get reason why meeting might not have transcript
 */
function getShortMeetingReason(durationSeconds: number | null): string | null {
  if (durationSeconds === null) return null
  if (durationSeconds < 10) {
    return 'Meeting was less than 10 seconds - likely no audio'
  }
  if (durationSeconds < 30) {
    return 'Meeting was less than 30 seconds - may not have enough audio for transcription'
  }
  if (durationSeconds < SHORT_MEETING_THRESHOLD_SECONDS) {
    return 'Meeting was less than 1 minute - transcript may be unavailable'
  }
  return null
}

interface ReprocessResult {
  meeting_id: string
  title: string
  duration_seconds: number | null
  is_short_meeting: boolean
  short_meeting_reason: string | null
  transcript: { success: boolean; message: string; skipped?: boolean } | null
  summary: { success: boolean; message: string; skipped?: boolean } | null
  thumbnail: { success: boolean; message: string } | null
  ai_index: { success: boolean; message: string } | null
  ai_analysis: { success: boolean; message: string; sentiment_score?: number } | null
}

/**
 * Refresh OAuth access token if expired
 */
async function refreshAccessToken(supabase: any, integration: any): Promise<string> {
  const now = new Date()
  const expiresAt = new Date(integration.token_expires_at)

  // Check if token is expired or will expire within 5 minutes
  const bufferMs = 5 * 60 * 1000
  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    return integration.access_token
  }

  const clientId = Deno.env.get('FATHOM_CLIENT_ID')
  const clientSecret = Deno.env.get('FATHOM_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    throw new Error('Missing Fathom OAuth configuration for token refresh')
  }

  const tokenParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: integration.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const tokenResponse = await fetch('https://fathom.video/external/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Token refresh failed: ${errorText}`)
  }

  const tokenData = await tokenResponse.json()
  const expiresIn = tokenData.expires_in || 3600
  const newTokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  await supabase
    .from('fathom_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || integration.refresh_token,
      token_expires_at: newTokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id)

  return tokenData.access_token
}

/**
 * Generate thumbnail for a meeting
 */
async function generateThumbnail(
  meeting: { id: string; fathom_recording_id: string; fathom_share_url?: string },
  supabase: any
): Promise<{ success: boolean; message: string }> {
  try {
    // Use share_url if available, otherwise fall back to recording URL format
    // Note: Use fathom.video (not app.fathom.video) as the AWS Lambda thumbnail API
    // can't resolve the app subdomain
    const shareUrl = meeting.fathom_share_url || `https://fathom.video/recording/${meeting.fathom_recording_id}`

    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-video-thumbnail-v2`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          recording_id: meeting.fathom_recording_id,
          share_url: shareUrl,
          fathom_embed_url: `https://fathom.video/embed/${meeting.fathom_recording_id}`,
          meeting_id: meeting.id,
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, message: `Thumbnail API error: ${errorText}` }
    }

    const data = await response.json()

    // Update status
    const isPlaceholder = data.thumbnail_url?.includes('dummyimage.com')
    await supabase
      .from('meetings')
      .update({
        thumbnail_url: data.thumbnail_url,
        thumbnail_status: isPlaceholder ? 'pending' : 'complete',
      })
      .eq('id', meeting.id)

    return {
      success: !isPlaceholder,
      message: isPlaceholder ? 'Placeholder generated (will retry)' : 'Thumbnail generated successfully',
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Queue meeting for AI indexing
 */
async function queueForAIIndex(
  meetingId: string,
  userId: string,
  supabase: any
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from('meeting_index_queue')
      .upsert({
        meeting_id: meetingId,
        user_id: userId,
        priority: 5,
        attempts: 0,
        max_attempts: 3,
        created_at: new Date().toISOString(),
      }, { onConflict: 'meeting_id' })

    if (error) {
      return { success: false, message: error.message }
    }

    return { success: true, message: 'Queued for AI indexing' }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error) }
  }
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse body first to check for admin mode
    const body: ReprocessRequest = await req.json().catch(() => ({ mode: 'diagnose' }))
    const { mode = 'diagnose', limit = 50, types = ['transcript', 'summary', 'thumbnail', 'ai_index', 'ai_analysis'], meeting_ids, admin_user_id } = body

    let userId: string

    // Check for admin mode (service role key with admin_user_id)
    const authHeader = req.headers.get('Authorization') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    // Check if the token in the header matches the service role key
    const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    const trimmedServiceRoleKey = serviceRoleKey.trim()
    const isServiceRoleToken = tokenFromHeader === trimmedServiceRoleKey

    if (admin_user_id && isServiceRoleToken) {
      // Admin mode: verify service role key matches and use provided user_id
      console.log(`🔐 Admin mode ACTIVATED: processing for user ${admin_user_id}`)
      userId = admin_user_id
    } else if (admin_user_id && tokenFromHeader.length > 100) {
      // Fallback admin mode: If we have admin_user_id and a long token (JWT),
      // verify using the admin client that the user exists
      console.log(`🔐 Admin mode (fallback): verifying user ${admin_user_id} exists`)
      const { data: userProfile, error: profileError } = await adminClient
        .from('profiles')
        .select('id')
        .eq('id', admin_user_id)
        .maybeSingle()

      if (profileError || !userProfile) {
        console.log(`❌ Admin mode fallback FAILED: user ${admin_user_id} not found`)
        return new Response(JSON.stringify({ error: 'Unauthorized - admin user not found' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.log(`✅ Admin mode fallback: user ${admin_user_id} verified`)
      userId = admin_user_id
    } else {
      if (admin_user_id) {
        console.log(`⚠️ Admin mode FAILED: token mismatch (token length: ${tokenFromHeader.length}, expected: ${trimmedServiceRoleKey.length})`)
      }
      // Normal user authentication
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      )

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      userId = user.id
    }

    // Get user's Fathom integration
    const { data: integration, error: integrationError } = await adminClient
      .from('fathom_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()

    if (integrationError) {
      return new Response(JSON.stringify({ error: `Database error: ${integrationError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build query for pending meetings
    let query = adminClient
      .from('meetings')
      .select(`
        id,
        title,
        meeting_start,
        meeting_end,
        fathom_recording_id,
        share_url,
        owner_user_id,
        owner_email,
        org_id,
        thumbnail_status,
        transcript_status,
        summary_status,
        transcript_fetch_attempts,
        transcript_text,
        summary,
        thumbnail_url,
        sentiment_score,
        talk_time_rep_pct
      `)
      .eq('owner_user_id', userId)
      .not('fathom_recording_id', 'is', null)
      .order('meeting_start', { ascending: false })

    if (meeting_ids && meeting_ids.length > 0) {
      query = query.in('id', meeting_ids)
    } else {
      // Filter for pending/failed statuses
      query = query.or(
        'thumbnail_status.in.(pending,processing,failed),' +
        'transcript_status.in.(pending,processing,failed),' +
        'summary_status.in.(pending,processing,failed)'
      )
    }

    const { data: meetings, error: meetingsError } = await query.limit(limit)

    if (meetingsError) {
      return new Response(JSON.stringify({ error: `Query error: ${meetingsError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DIAGNOSE MODE - Just return status
    if (mode === 'diagnose') {
      // Deduplicate meetings by fathom_recording_id (keep most recent by meeting_start)
      // This handles cases where duplicate rows exist in the database
      const meetingsByRecordingId = new Map<string, any>()
      for (const m of (meetings || [])) {
        const recordingId = m.fathom_recording_id
        if (!recordingId) continue

        const existing = meetingsByRecordingId.get(recordingId)
        if (!existing || new Date(m.meeting_start) > new Date(existing.meeting_start)) {
          meetingsByRecordingId.set(recordingId, m)
        }
      }
      const uniqueMeetings = Array.from(meetingsByRecordingId.values())

      const statuses: MeetingStatus[] = uniqueMeetings.map((m: any) => {
        const durationSeconds = calculateDurationSeconds(m.meeting_start, m.meeting_end)
        const isShort = isShortMeeting(durationSeconds)
        return {
          id: m.id,
          title: m.title || 'Untitled',
          meeting_start: m.meeting_start,
          meeting_end: m.meeting_end,
          duration_seconds: durationSeconds,
          fathom_recording_id: m.fathom_recording_id,
          owner_user_id: m.owner_user_id,
          thumbnail_status: m.thumbnail_status,
          transcript_status: m.transcript_status,
          summary_status: m.summary_status,
          transcript_fetch_attempts: m.transcript_fetch_attempts,
          has_transcript: !!m.transcript_text,
          has_summary: !!m.summary,
          has_thumbnail: !!m.thumbnail_url && !m.thumbnail_url.includes('dummyimage.com'),
          is_short_meeting: isShort,
          short_meeting_reason: getShortMeetingReason(durationSeconds),
        }
      })

      const shortMeetings = statuses.filter(s => s.is_short_meeting)

      const diagnoseResult: DiagnoseResult = {
        total_pending: statuses.length,
        short_meetings_count: shortMeetings.length,
        by_status: {
          transcript_pending: statuses.filter(s => s.transcript_status === 'pending' && !s.is_short_meeting).length,
          transcript_failed: statuses.filter(s => s.transcript_status === 'failed').length,
          transcript_too_short: shortMeetings.filter(s => !s.has_transcript).length,
          summary_pending: statuses.filter(s => s.summary_status === 'pending' && !s.is_short_meeting).length,
          summary_failed: statuses.filter(s => s.summary_status === 'failed').length,
          thumbnail_pending: statuses.filter(s => s.thumbnail_status === 'pending').length,
          thumbnail_failed: statuses.filter(s => s.thumbnail_status === 'failed').length,
        },
        meetings: statuses,
      }

      return new Response(JSON.stringify({
        success: true,
        mode: 'diagnose',
        has_fathom_integration: !!integration,
        result: diagnoseResult,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // REPROCESS MODE
    if (!integration) {
      return new Response(JSON.stringify({
        error: 'No active Fathom integration found. Please connect Fathom first.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Refresh token if needed
    let accessToken: string
    try {
      accessToken = await refreshAccessToken(adminClient, integration)
    } catch (error) {
      return new Response(JSON.stringify({
        error: `Failed to refresh Fathom token: ${error instanceof Error ? error.message : String(error)}`,
        recommendation: 'Please reconnect your Fathom account',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: ReprocessResult[] = []

    // Deduplicate meetings by fathom_recording_id for reprocessing (keep most recent)
    const meetingsToProcess = new Map<string, any>()
    for (const m of (meetings || [])) {
      const recordingId = m.fathom_recording_id
      if (!recordingId) continue
      const existing = meetingsToProcess.get(recordingId)
      if (!existing || new Date(m.meeting_start) > new Date(existing.meeting_start)) {
        meetingsToProcess.set(recordingId, m)
      }
    }

    for (const meeting of meetingsToProcess.values()) {
      const durationSeconds = calculateDurationSeconds(meeting.meeting_start, meeting.meeting_end)
      const isShort = isShortMeeting(durationSeconds)
      const shortReason = getShortMeetingReason(durationSeconds)

      const result: ReprocessResult = {
        meeting_id: meeting.id,
        title: meeting.title || 'Untitled',
        duration_seconds: durationSeconds,
        is_short_meeting: isShort,
        short_meeting_reason: shortReason,
        transcript: null,
        summary: null,
        thumbnail: null,
        ai_index: null,
        ai_analysis: null,
      }

      // Process transcript if needed
      if (types.includes('transcript') &&
          (meeting.transcript_status === 'pending' || meeting.transcript_status === 'failed' || !meeting.transcript_text)) {

        // For very short meetings (<10s), mark as too_short and skip API call
        if (durationSeconds !== null && durationSeconds < 10) {
          console.log(`⏱️ Meeting ${meeting.id} is too short (${durationSeconds}s) - marking as too_short`)
          await adminClient
            .from('meetings')
            .update({ transcript_status: 'too_short' })
            .eq('id', meeting.id)
          result.transcript = {
            success: false,
            message: shortReason || 'Meeting too short for transcript',
            skipped: true
          }
        } else if (isShort) {
          // For short meetings (10-60s), still try but expect it might fail
          console.log(`⏱️ Meeting ${meeting.id} is short (${durationSeconds}s) - attempting transcript anyway`)
          try {
            await adminClient
              .from('meetings')
              .update({ transcript_status: 'processing' })
              .eq('id', meeting.id)

            const transcript = await fetchTranscriptFromFathom(accessToken, meeting.fathom_recording_id)

            if (transcript) {
              await adminClient
                .from('meetings')
                .update({
                  transcript_text: transcript,
                  transcript_status: 'complete',
                  last_transcript_fetch_at: new Date().toISOString(),
                })
                .eq('id', meeting.id)
              result.transcript = { success: true, message: `Fetched ${transcript.length} characters (short meeting)` }
            } else {
              // Mark as too_short since it's likely the reason
              await adminClient
                .from('meetings')
                .update({ transcript_status: 'too_short' })
                .eq('id', meeting.id)
              result.transcript = {
                success: false,
                message: shortReason || 'Meeting too short - no transcript available',
                skipped: true
              }
            }
          } catch (error) {
            await adminClient
              .from('meetings')
              .update({ transcript_status: 'too_short' })
              .eq('id', meeting.id)
            result.transcript = {
              success: false,
              message: shortReason || 'Meeting too short for transcript',
              skipped: true
            }
          }
        } else {
          // Normal meeting - process as usual
          try {
            console.log(`📄 Fetching transcript for meeting ${meeting.id}`)

            await adminClient
              .from('meetings')
              .update({ transcript_status: 'processing' })
              .eq('id', meeting.id)

            const transcript = await fetchTranscriptFromFathom(accessToken, meeting.fathom_recording_id)

            if (transcript) {
              await adminClient
                .from('meetings')
                .update({
                  transcript_text: transcript,
                  transcript_status: 'complete',
                  last_transcript_fetch_at: new Date().toISOString(),
                })
                .eq('id', meeting.id)

              result.transcript = { success: true, message: `Fetched ${transcript.length} characters` }
            } else {
              await adminClient
                .from('meetings')
                .update({ transcript_status: 'pending' })
                .eq('id', meeting.id)

              result.transcript = { success: false, message: 'Transcript not yet available from Fathom' }
            }
          } catch (error) {
            await adminClient
              .from('meetings')
              .update({ transcript_status: 'failed' })
              .eq('id', meeting.id)

            result.transcript = { success: false, message: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      // Process summary if needed
      if (types.includes('summary') &&
          (meeting.summary_status === 'pending' || meeting.summary_status === 'failed' || !meeting.summary)) {

        // For very short meetings, skip summary too
        if (durationSeconds !== null && durationSeconds < 10) {
          await adminClient
            .from('meetings')
            .update({ summary_status: 'too_short' })
            .eq('id', meeting.id)
          result.summary = {
            success: false,
            message: shortReason || 'Meeting too short for summary',
            skipped: true
          }
        } else if (isShort && !meeting.transcript_text && !result.transcript?.success) {
          // Short meeting without transcript - skip summary
          await adminClient
            .from('meetings')
            .update({ summary_status: 'too_short' })
            .eq('id', meeting.id)
          result.summary = {
            success: false,
            message: 'No transcript available for summary (short meeting)',
            skipped: true
          }
        } else {
          try {
            console.log(`📝 Fetching summary for meeting ${meeting.id}`)

            await adminClient
              .from('meetings')
              .update({ summary_status: 'processing' })
              .eq('id', meeting.id)

            const summaryData = await fetchSummaryFromFathom(accessToken, meeting.fathom_recording_id)

            if (summaryData?.summary) {
              // Fathom returns { summary: { template_name, markdown_formatted } } or { summary: "string" }
              let summaryValue: string
              if (typeof summaryData.summary === 'string') {
                summaryValue = summaryData.summary
              } else if (summaryData.summary.markdown_formatted) {
                summaryValue = JSON.stringify(summaryData.summary)
              } else {
                summaryValue = String(summaryData.summary)
              }

              await adminClient
                .from('meetings')
                .update({
                  summary: summaryValue,
                  summary_status: 'complete',
                  sentiment_score: summaryData.sentiment_score,
                  coach_summary: summaryData.coach_summary,
                  talk_time_rep_pct: summaryData.talk_time_rep_pct,
                  talk_time_customer_pct: summaryData.talk_time_customer_pct,
                  talk_time_judgement: summaryData.talk_time_judgement,
                })
                .eq('id', meeting.id)

              result.summary = { success: true, message: 'Summary fetched successfully' }
            } else {
              // If short meeting and no summary, mark as too_short
              if (isShort) {
                await adminClient
                  .from('meetings')
                  .update({ summary_status: 'too_short' })
                  .eq('id', meeting.id)
                result.summary = {
                  success: false,
                  message: 'Summary not available (short meeting)',
                  skipped: true
                }
              } else {
                await adminClient
                  .from('meetings')
                  .update({ summary_status: 'pending' })
                  .eq('id', meeting.id)
                result.summary = { success: false, message: 'Summary not yet available from Fathom' }
              }
            }
          } catch (error) {
            await adminClient
              .from('meetings')
              .update({ summary_status: 'failed' })
              .eq('id', meeting.id)

            result.summary = { success: false, message: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      // Process thumbnail if needed - ALWAYS try for short meetings too (video still exists)
      if (types.includes('thumbnail') &&
          (meeting.thumbnail_status === 'pending' || meeting.thumbnail_status === 'failed' ||
           !meeting.thumbnail_url || meeting.thumbnail_url.includes('dummyimage.com'))) {
        result.thumbnail = await generateThumbnail(
          { id: meeting.id, fathom_recording_id: meeting.fathom_recording_id, fathom_share_url: meeting.share_url },
          adminClient
        )
      }

      // Run AI analysis if transcript exists and sentiment not already generated
      // This generates sentiment from the transcript itself (independent of Fathom's API)
      if (types.includes('ai_analysis')) {
        const hasTranscript = meeting.transcript_text || result.transcript?.success
        const hasAIAnalysis = meeting.sentiment_score !== null || meeting.talk_time_rep_pct !== null

        if (!hasTranscript) {
          if (isShort) {
            result.ai_analysis = { success: false, message: 'Short meeting - no transcript for AI analysis' }
          } else {
            result.ai_analysis = { success: false, message: 'No transcript available for AI analysis' }
          }
        } else if (hasAIAnalysis) {
          result.ai_analysis = {
            success: true,
            message: 'AI analysis already complete',
            sentiment_score: meeting.sentiment_score
          }
        } else {
          try {
            console.log(`🤖 Running AI analysis for meeting ${meeting.id}`)

            // Get transcript text - either from DB or just fetched
            const transcriptText = meeting.transcript_text ||
              (result.transcript?.success ? await adminClient
                .from('meetings')
                .select('transcript_text')
                .eq('id', meeting.id)
                .single()
                .then(r => r.data?.transcript_text) : null)

            if (!transcriptText) {
              result.ai_analysis = { success: false, message: 'Could not retrieve transcript for analysis' }
            } else {
              const analysis: TranscriptAnalysis = await analyzeTranscriptWithClaude(
                transcriptText,
                {
                  id: meeting.id,
                  title: meeting.title,
                  meeting_start: meeting.meeting_start,
                  owner_email: meeting.owner_email,
                },
                adminClient,
                meeting.owner_user_id || userId,
                meeting.org_id
              )

              // Update meeting with AI metrics
              await adminClient
                .from('meetings')
                .update({
                  talk_time_rep_pct: analysis.talkTime.repPct,
                  talk_time_customer_pct: analysis.talkTime.customerPct,
                  talk_time_judgement: analysis.talkTime.assessment,
                  sentiment_score: analysis.sentiment.score,
                  sentiment_reasoning: analysis.sentiment.reasoning,
                  coach_rating: analysis.coaching.rating,
                  coach_summary: JSON.stringify({
                    summary: analysis.coaching.summary,
                    strengths: analysis.coaching.strengths,
                    improvements: analysis.coaching.improvements,
                    evaluationBreakdown: analysis.coaching.evaluationBreakdown,
                  }),
                })
                .eq('id', meeting.id)

              // Store AI-generated action items
              if (analysis.actionItems && analysis.actionItems.length > 0) {
                const existingActionItems: any[] = []
                const uniqueAIActionItems = deduplicateActionItems(analysis.actionItems, existingActionItems)

                for (const item of uniqueAIActionItems) {
                  await adminClient
                    .from('meeting_action_items')
                    .insert({
                      meeting_id: meeting.id,
                      title: item.title,
                      description: item.title,
                      priority: item.priority,
                      category: item.category,
                      assignee_name: item.assignedTo || null,
                      assignee_email: item.assignedToEmail || null,
                      deadline_at: item.deadline ? new Date(item.deadline).toISOString() : null,
                      ai_generated: true,
                      ai_confidence: item.confidence,
                      needs_review: item.confidence < 0.8,
                      completed: false,
                      synced_to_task: false,
                      task_id: null,
                      timestamp_seconds: null,
                      playback_url: null,
                    })
                }
                console.log(`✅ Stored ${uniqueAIActionItems.length} AI-generated action items for meeting ${meeting.id}`)
              }

              result.ai_analysis = {
                success: true,
                message: `AI analysis complete - sentiment: ${(analysis.sentiment.score * 100).toFixed(0)}%, coach rating: ${analysis.coaching.rating}/10`,
                sentiment_score: analysis.sentiment.score
              }
              console.log(`✅ AI analysis complete for meeting ${meeting.id}: sentiment=${analysis.sentiment.score}`)
            }
          } catch (error) {
            console.error(`❌ AI analysis failed for meeting ${meeting.id}:`, error)
            result.ai_analysis = {
              success: false,
              message: error instanceof Error ? error.message : String(error)
            }
          }
        }
      }

      // Queue for AI indexing if transcript exists
      if (types.includes('ai_index')) {
        const hasTranscript = meeting.transcript_text || result.transcript?.success
        if (hasTranscript) {
          result.ai_index = await queueForAIIndex(meeting.id, userId, adminClient)
        } else if (isShort) {
          result.ai_index = { success: false, message: 'Short meeting - no transcript for indexing' }
        } else {
          result.ai_index = { success: false, message: 'No transcript available for indexing' }
        }
      }

      results.push(result)

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    const successCount = results.filter(r =>
      (r.transcript?.success ?? true) &&
      (r.summary?.success ?? true) &&
      (r.thumbnail?.success ?? true) &&
      (r.ai_analysis?.success ?? true)
    ).length

    return new Response(JSON.stringify({
      success: true,
      mode: 'reprocess',
      total_processed: results.length,
      successful: successCount,
      failed: results.length - successCount,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in reprocess-pending-meetings:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

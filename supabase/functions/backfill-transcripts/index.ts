/**
 * Backfill Transcripts Edge Function
 *
 * Purpose: Fetch transcripts from Fathom API for existing meetings that have
 * recording IDs but no transcript_text.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { fetchTranscriptFromFathom } from '../_shared/fathomTranscript.ts'

const BATCH_SIZE = 20

interface BackfillResult {
  meeting_id: string
  recording_id: string
  success: boolean
  message: string
  transcript_length?: number
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let limit = BATCH_SIZE
    let requestedOrgId: string | null = null
    let refetchExisting = false  // When true, re-fetches transcripts that lack [HH:MM:SS] timestamps
    try {
      const body = await req.json()
      limit = Math.min(body.limit || BATCH_SIZE, 50)
      requestedOrgId = body.org_id || null
      refetchExisting = body.refetch_existing === true
    } catch {}

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Use requested org_id if provided, otherwise fall back to first membership
    let orgId = requestedOrgId
    if (!orgId) {
      const { data: membership, error: membershipError } = await adminClient
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (membershipError || !membership) {
        return new Response(JSON.stringify({ error: 'User is not a member of any organization' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      orgId = membership.org_id
    }

    // Verify user has access to this org
    const { data: membership, error: membershipError } = await adminClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (membershipError || !membership) {
      return new Response(JSON.stringify({ error: 'User is not a member of this organization' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Look up org-level Fathom integration
    const { data: integration, error: integrationError } = await adminClient
      .from('fathom_org_integrations')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle()

    if (integrationError || !integration) {
      return new Response(JSON.stringify({ error: 'No active Fathom integration found for your organization' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Get access token from org credentials table
    const { data: credentials, error: credsError } = await adminClient
      .from('fathom_org_credentials')
      .select('access_token, token_expires_at')
      .eq('org_id', orgId)
      .maybeSingle()

    if (credsError) {
      console.error('Failed to fetch credentials:', credsError)
      return new Response(JSON.stringify({ error: 'Failed to get Fathom credentials' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!credentials?.access_token) {
      return new Response(JSON.stringify({ error: 'No valid Fathom access token available. Please reconnect Fathom.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Check if token is expired
    if (credentials.token_expires_at) {
      const expiresAt = new Date(credentials.token_expires_at)
      if (expiresAt < new Date()) {
        return new Response(JSON.stringify({ error: 'Fathom access token expired. Please reconnect Fathom or wait for automatic refresh.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    const accessToken = credentials.access_token

    // Debug: Log token and org details
    console.log(`[backfill] org_id: ${orgId}`)
    console.log(`[backfill] Token length: ${accessToken.length}`)
    console.log(`[backfill] Token start: ${accessToken.substring(0, 20)}...`)
    console.log(`[backfill] Token end: ...${accessToken.substring(accessToken.length - 20)}`)
    console.log(`[backfill] Token has whitespace: ${accessToken !== accessToken.trim()}`)

    // Build query: either missing transcripts or existing ones needing timestamp re-fetch
    let meetingsQuery = adminClient
      .from('meetings')
      .select('id, fathom_recording_id, owner_user_id, org_id, transcript_text')
      .eq('org_id', orgId)
      .not('fathom_recording_id', 'is', null)
      .order('meeting_start', { ascending: false })
      .limit(limit)

    if (refetchExisting) {
      // Re-fetch all Fathom transcripts (to get timestamps in new format)
      meetingsQuery = meetingsQuery.not('transcript_text', 'is', null)
      console.log(`[backfill] Refetch mode: re-fetching existing transcripts with timestamps`)
    } else {
      // Default: only missing transcripts
      meetingsQuery = meetingsQuery.is('transcript_text', null)
    }

    const { data: meetings, error: queryError } = await meetingsQuery

    if (queryError) {
      return new Response(JSON.stringify({ error: 'Failed to query meetings', details: queryError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!meetings || meetings.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No meetings found needing transcripts', processed: 0, results: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    console.log(`Processing ${meetings.length} meetings for transcript backfill`)

    const results: BackfillResult[] = []

    for (const meeting of meetings) {
      const recordingId = meeting.fathom_recording_id

      if (!recordingId || recordingId.startsWith('test-') || !/^\d+$/.test(recordingId)) {
        results.push({ meeting_id: meeting.id, recording_id: recordingId || 'none', success: false, message: 'Invalid or test recording ID' })
        continue
      }

      try {
        console.log(`[backfill] Fetching transcript for meeting ${meeting.id} (recording ${recordingId})`)
        console.log(`[backfill] Using token: ${accessToken.substring(0, 20)}...`)

        let transcript: string | null = null
        let fetchError: string | null = null

        try {
          transcript = await fetchTranscriptFromFathom(accessToken, recordingId)
        } catch (e) {
          fetchError = e instanceof Error ? e.message : String(e)
          console.error(`[backfill] Error fetching transcript: ${fetchError}`)
        }

        if (!transcript) {
          results.push({
            meeting_id: meeting.id,
            recording_id: recordingId,
            success: false,
            message: fetchError || 'Transcript not available from Fathom (null returned)'
          })
          continue
        }

        const { error: updateError } = await adminClient.from('meetings').update({
          transcript_text: transcript,
          updated_at: new Date().toISOString()
        }).eq('id', meeting.id)

        if (updateError) {
          results.push({ meeting_id: meeting.id, recording_id: recordingId, success: false, message: `Failed to save: ${updateError.message}` })
          continue
        }

        await adminClient.from('meeting_index_queue').upsert({
          meeting_id: meeting.id,
          user_id: meeting.owner_user_id,
          priority: 5,
          attempts: 0,
          max_attempts: 3
        }, { onConflict: 'meeting_id,user_id' })

        results.push({ meeting_id: meeting.id, recording_id: recordingId, success: true, message: 'Transcript fetched', transcript_length: transcript.length })
        await new Promise(resolve => setTimeout(resolve, 300))

      } catch (error) {
        results.push({ meeting_id: meeting.id, recording_id: recordingId, success: false, message: error instanceof Error ? error.message : String(error) })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${results.length} meetings`,
      processed: results.length,
      succeeded: successCount,
      failed: failCount,
      results
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Error in backfill-transcripts:', error)
    return new Response(JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

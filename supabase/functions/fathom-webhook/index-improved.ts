import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Fathom Unified Webhook Handler - IMPROVED VERSION
 *
 * Changes:
 * 1. Case-insensitive email matching
 * 2. Better error logging
 * 3. Ensures user_id is never null
 */

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Get request metadata for logging
  const timestamp = new Date().toISOString()
  const requestId = crypto.randomUUID().substring(0, 8)

  try {
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

    // Parse webhook payload
    const payload = await req.json()

    console.log(`[${requestId}] Webhook received:`, {
      recording_id: payload.recording_id || payload.id,
      recorded_by: payload.recorded_by?.email,
      timestamp
    })

    // Extract recording ID from payload
    const recordingId = payload.recording_id ||
                       payload.id ||
                       extractRecordingIdFromUrl(payload.share_url || payload.url)

    if (!recordingId) {
      console.error(`[${requestId}] Missing recording_id in payload`)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing recording_id in webhook payload'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Determine user_id from recorded_by email
    let userId: string | null = null
    const recordedByEmail = payload.recorded_by?.email

    console.log(`[${requestId}] Looking up user by email:`, recordedByEmail)

    if (recordedByEmail) {
      // IMPROVED: Case-insensitive email lookup
      const { data: integration, error: integrationError } = await supabase
        .from('fathom_integrations')
        .select('user_id, fathom_user_email, is_active, created_at')
        .ilike('fathom_user_email', recordedByEmail)  // ← Case-insensitive
        .eq('is_active', true)
        .single()

      if (integrationError) {
        console.warn(`[${requestId}] Integration lookup error:`, integrationError.message)
      }

      if (integration) {
        userId = integration.user_id
        console.log(`[${requestId}] Found user via integration:`, userId)
      } else {
        console.log(`[${requestId}] No integration found, trying auth.users fallback`)

        // Try auth.users as fallback with case-insensitive match
        const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()

        if (usersError) {
          console.error(`[${requestId}] Auth.users lookup error:`, usersError.message)
        } else {
          const matchedUser = users.find(u =>
            u.email?.toLowerCase() === recordedByEmail.toLowerCase()
          )

          if (matchedUser) {
            userId = matchedUser.id
            console.log(`[${requestId}] Found user via auth.users:`, userId)
          } else {
            console.error(`[${requestId}] No user found for email:`, recordedByEmail)
            console.log(`[${requestId}] Available emails:`, users.map(u => u.email))
          }
        }
      }
    } else {
      console.error(`[${requestId}] No recorded_by.email in payload`)
    }

    if (!userId) {
      const errorMsg = `Unable to determine user_id from webhook payload. Email: ${recordedByEmail || 'missing'}`
      console.error(`[${requestId}] ${errorMsg}`)

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMsg,
          recorded_by_email: recordedByEmail,
          request_id: requestId
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`[${requestId}] Calling fathom-sync for user:`, userId)

    // Call the main fathom-sync function with webhook mode
    const syncUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/fathom-sync`
    const syncStartTime = Date.now()

    const syncResponse = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sync_type: 'webhook',
        user_id: userId,  // ← This is now guaranteed to be non-null
        webhook_payload: payload,
      }),
    })

    const syncDuration = Date.now() - syncStartTime

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text()
      console.error(`[${requestId}] Sync failed (${syncResponse.status}):`, errorText)
      throw new Error(`Sync failed: ${errorText}`)
    }

    const syncResult = await syncResponse.json()
    console.log(`[${requestId}] Sync succeeded in ${syncDuration}ms`)

    // Check if meeting was created and if transcript is missing - enqueue retry job
    try {
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .select('id, transcript_text, fathom_recording_id')
        .eq('fathom_recording_id', String(recordingId))
        .eq('owner_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!meetingError && meeting && !meeting.transcript_text) {
        console.log(`[${requestId}] Enqueueing transcript retry job for meeting ${meeting.id}`)

        const { data: retryJobId, error: enqueueError } = await supabase
          .rpc('enqueue_transcript_retry', {
            p_meeting_id: meeting.id,
            p_user_id: userId,
            p_recording_id: String(recordingId),
            p_initial_attempt_count: 1,
          })

        if (enqueueError) {
          console.error(`[${requestId}] Failed to enqueue retry job:`, enqueueError.message)
        } else {
          console.log(`[${requestId}] Enqueued retry job ${retryJobId}`)
        }
      } else if (meeting && meeting.transcript_text) {
        console.log(`[${requestId}] Transcript already available`)
      }
    } catch (error) {
      console.error(`[${requestId}] Error checking/enqueueing retry job:`, error instanceof Error ? error.message : String(error))
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook processed successfully',
        recording_id: recordingId,
        user_id: userId,
        request_id: requestId,
        sync_duration_ms: syncDuration,
        sync_result: syncResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error(`[${requestId}] WEBHOOK ERROR:`, errorMessage)
    if (errorStack) {
      console.error(`[${requestId}] Stack:`, errorStack)
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        request_id: requestId || undefined,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

/**
 * Helper: Extract recording ID from Fathom URL
 */
function extractRecordingIdFromUrl(url?: string): string | null {
  if (!url) return null

  try {
    // Extract from share URL: https://fathom.video/share/xyz123
    const shareMatch = url.match(/share\/([^\/\?]+)/)
    if (shareMatch) return shareMatch[1]

    // Extract from calls URL: https://fathom.video/calls/123456
    const callsMatch = url.match(/calls\/(\d+)/)
    if (callsMatch) return callsMatch[1]

    return null
  } catch {
    return null
  }
}

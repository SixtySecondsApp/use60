import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"
import { hmacSha256Hex, timingSafeEqual } from '../_shared/use60Signing.ts'
import { addBreadcrumb, captureException, withSentry } from '../_shared/sentryEdge.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Fathom Unified Webhook Handler
 *
 * Purpose: Receive webhook events from Fathom when recordings are ready
 * This endpoint processes the complete meeting payload and triggers sync
 *
 * Webhook Event: recording.ready (or similar - check Fathom docs)
 * Payload: Complete meeting object with transcript, summary, action items
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
    // External release hardening:
    // Require either a valid internal proxy signature (preferred) OR a service-role bearer token.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const authHeader = req.headers.get('Authorization') || ''
    const proxySecret = Deno.env.get('FATHOM_WEBHOOK_PROXY_SECRET') ?? ''

    const use60Ts = req.headers.get('X-Use60-Timestamp') || ''
    const use60Sig = req.headers.get('X-Use60-Signature') || ''

    const allowServiceRole = serviceRoleKey && authHeader.trim() === `Bearer ${serviceRoleKey}`
    let allowProxySig = false

    // Read body as text once (needed for signature verification and JSON parsing)
    const rawBody = await req.text()

    if (proxySecret && use60Ts && use60Sig.startsWith('v1=')) {
      const expected = await hmacSha256Hex(proxySecret, `v1:${use60Ts}:${rawBody}`)
      const provided = use60Sig.slice('v1='.length).trim()
      allowProxySig = timingSafeEqual(expected, provided)
    }

    if (!allowServiceRole && !allowProxySig) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized webhook' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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

    // Parse webhook payload
    const payload = JSON.parse(rawBody)

    // Org routing (preferred): allow org_id in query string so webhook URLs can be org-specific.
    const url = new URL(req.url)
    const orgId = url.searchParams.get('org_id')

    // Enhanced logging with full payload structure
    // Log raw payload for debugging (first 1000 chars)
    const payloadStr = JSON.stringify(payload, null, 2)
    // Extract recording ID from payload
    // Try multiple possible field names based on Fathom's API
    const recordingId = payload.recording_id ||
                       payload.id ||
                       extractRecordingIdFromUrl(payload.share_url || payload.url)

    if (!recordingId) {
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
    // Preferred org-scoped sync: if org_id is provided, route directly to that org.
    if (orgId) {
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
          org_id: orgId,
          webhook_payload: payload,
        }),
      })

      const syncDuration = Date.now() - syncStartTime

      if (syncResponse.ok) {
        const syncResult = await syncResponse.json()
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Webhook processed successfully',
            recording_id: recordingId,
            org_id: orgId,
            request_id: requestId,
            sync_duration_ms: syncDuration,
            sync_result: syncResult,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Backwards-compatible fallback: if org-scoped sync failed, try legacy user lookup by email
      const errorText = await syncResponse.text()
      console.warn(`[fathom-webhook] Org-scoped sync failed (${syncResponse.status}). Falling back to legacy user routing.`, errorText.substring(0, 200))
    }

    // Legacy: Determine user_id from recorded_by email
    let userId: string | null = null
    const recordedByEmail = payload.recorded_by?.email

    if (recordedByEmail) {
      // Look up user by email in fathom_integrations table
      const { data: integration, error: integrationError } = await supabase
        .from('fathom_integrations')
        .select('user_id, fathom_user_email, is_active, created_at')
        .eq('fathom_user_email', recordedByEmail)
        .eq('is_active', true)
        .maybeSingle()

      if (integrationError) {
      }

      if (integration) {
        userId = integration.user_id
      } else {
        // Try auth.users as fallback
        const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()

        if (usersError) {
        }

        const matchedUser = users.find(u => u.email === recordedByEmail)

        if (matchedUser) {
          userId = matchedUser.id
        } else {
        }
      }
    } else {
    }

    if (!userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unable to determine user_id from webhook payload'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

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
        user_id: userId,
        // Preserve org_id if it was provided so fathom-sync can use it for limits/ownership
        org_id: orgId || undefined,
        // Pass the entire webhook payload as the call object
        // The sync function will process it directly
        webhook_payload: payload,
      }),
    })

    const syncDuration = Date.now() - syncStartTime

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text()
      throw new Error(`Sync failed: ${errorText}`)
    }

    const syncResult = await syncResponse.json()

    // Check if meeting was created and if transcript is missing - enqueue retry job
    try {
      // Find the meeting by recording ID
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .select('id, transcript_text, fathom_recording_id')
        .eq('fathom_recording_id', String(recordingId))
        .eq('owner_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!meetingError && meeting && !meeting.transcript_text) {
        // Transcript not available - enqueue retry job
        console.log(`📋 Enqueueing transcript retry job for meeting ${meeting.id} (recording: ${recordingId})`)
        
        const { data: retryJobId, error: enqueueError } = await supabase
          .rpc('enqueue_transcript_retry', {
            p_meeting_id: meeting.id,
            p_user_id: userId,
            p_recording_id: String(recordingId),
            p_initial_attempt_count: 1, // Initial webhook attempt counts as attempt 1
          })

        if (enqueueError) {
          console.error(`⚠️  Failed to enqueue retry job: ${enqueueError.message}`)
        } else {
          console.log(`✅ Enqueued retry job ${retryJobId} for meeting ${meeting.id}`)
        }
      } else if (meeting && meeting.transcript_text) {
        console.log(`✅ Transcript already available for meeting ${meeting.id}`)
      }
    } catch (error) {
      // Non-fatal - log but don't fail the webhook
      console.error(`⚠️  Error checking/enqueueing retry job:`, error instanceof Error ? error.message : String(error))
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

    // Capture error to Sentry with context
    await captureException(error, {
      tags: {
        function: 'fathom-webhook',
        request_id: requestId,
      },
      extra: {
        request_id: requestId,
        timestamp: timestamp,
      },
    })

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

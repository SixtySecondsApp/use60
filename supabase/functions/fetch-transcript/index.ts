import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { fetchTranscriptFromFathom } from '../_shared/fathomTranscript.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function createGoogleDocForTranscript(
  supabase: any,
  userId: string,
  meetingId: string,
  title: string,
  plaintext: string
): Promise<string | null> {
  try {
    // Get user's Google integration
    const { data: googleIntegration, error: googleError } = await supabase
      .from('integrations')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .single()

    if (googleError || !googleIntegration) {
      return null
    }

    // Create Google Doc
    const docResponse = await fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleIntegration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    })

    if (!docResponse.ok) {
      return null
    }

    const doc = await docResponse.json()
    // Add transcript content to the doc
    await fetch(
      `https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleIntegration.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: plaintext,
              },
            },
          ],
        }),
      }
    )

    const docUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`
    return docUrl
  } catch (error) {
    return null
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse payload early so we can fallback to meeting owner if needed
    const body = await req.json()
    const meetingId: string | undefined = body.meetingId ?? body.meeting_id
    const explicitUserId: string | undefined = body.user_id ?? body.userId

    if (!meetingId) {
      throw new Error('Missing meetingId parameter')
    }

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    let userId: string | null = null
    let usingServiceRole = false

    const { data: userResult, error: userError } = await supabase.auth.getUser(token)

    if (!userError && userResult?.user) {
      userId = userResult.user.id
    } else {
      const { data: meetingOwner, error: ownerError } = await supabase
        .from('meetings')
        .select('owner_user_id')
        .eq('id', meetingId)
        .single()

      if (ownerError || !meetingOwner?.owner_user_id) {
        throw new Error('Invalid user token (meeting owner lookup failed)')
      }

      if (explicitUserId && explicitUserId !== meetingOwner.owner_user_id) {
        throw new Error('Invalid user token (explicit user mismatch)')
      }

      userId = meetingOwner.owner_user_id
      usingServiceRole = true
    }

    if (!userId) {
      throw new Error('Unable to resolve user for transcript fetch')
    }

    if (!meetingId) {
      throw new Error('Missing meetingId parameter')
    }
    // Get meeting details
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, fathom_recording_id, title, transcript_text, transcript_doc_url, owner_user_id')
      .eq('id', meetingId)
      .single()

    if (meetingError || !meeting) {
      throw new Error('Meeting not found or access denied')
    }

    // Enforce ownership only for user-scoped calls
    if (!usingServiceRole && meeting.owner_user_id !== userId) {
      throw new Error('Meeting not found or access denied')
    }

    // Check if transcript already exists
    if (meeting.transcript_text) {
      return new Response(
        JSON.stringify({
          success: true,
          transcript: meeting.transcript_text,
          transcript_doc_url: meeting.transcript_doc_url,
          cached: true,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Get Fathom integration
    const { data: fathomIntegration, error: integrationError } = await supabase
      .from('fathom_integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (integrationError || !fathomIntegration) {
      throw new Error('Fathom integration not found')
    }

    // Fetch transcript from Fathom
    const transcriptText = await fetchTranscriptFromFathom(
      fathomIntegration.access_token,
      meeting.fathom_recording_id
    )

    if (!transcriptText) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Transcript not yet available - still processing',
          processing: true,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 202, // Accepted but not ready
        }
      )
    }

    // Create Google Doc if user has Google integration
    let transcriptDocUrl = meeting.transcript_doc_url
    if (!transcriptDocUrl) {
      transcriptDocUrl = await createGoogleDocForTranscript(
        supabase,
        userId,
        meeting.id,
        `Transcript • ${meeting.title || 'Meeting'}`,
        transcriptText
      )
    }

    // Update meeting with transcript
    const { error: updateError } = await supabase
      .from('meetings')
      .update({
        transcript_text: transcriptText,
        transcript_doc_url: transcriptDocUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', meetingId)

    if (updateError) {
      throw updateError
    }

    // Clear any pending retry jobs for this meeting
    try {
      await supabase.rpc('complete_transcript_retry_job', { p_meeting_id: meetingId })
      console.log(`✅ Cleared retry jobs for meeting ${meetingId}`)
    } catch (error) {
      // Non-fatal - log but don't fail
      console.error(`⚠️  Failed to clear retry jobs:`, error instanceof Error ? error.message : String(error))
    }

    return new Response(
      JSON.stringify({
        success: true,
        transcript: transcriptText,
        transcript_doc_url: transcriptDocUrl,
        cached: false,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

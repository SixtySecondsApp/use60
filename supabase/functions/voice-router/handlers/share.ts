import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"
import { getCorsHeaders } from '../../_shared/corsHelper.ts'

interface ShareRequest {
  recording_id: string
  enable: boolean
}

/**
 * Voice Share Handler
 *
 * Toggle public sharing on/off for a voice recording.
 * When enabled, returns the public share URL.
 *
 * Required Environment Variables:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */
export async function handleShare(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user from auth token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { recording_id, enable }: ShareRequest = await req.json()

    if (!recording_id) {
      return new Response(
        JSON.stringify({ error: 'recording_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the recording and verify ownership
    const { data: recording, error: recordingError } = await supabase
      .from('voice_recordings')
      .select('id, user_id, share_token, is_public')
      .eq('id', recording_id)
      .single()

    if (recordingError || !recording) {
      return new Response(
        JSON.stringify({ error: 'Recording not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user owns the recording
    if (recording.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (enable) {
      // Enable sharing
      const { data: updated, error: updateError } = await supabase
        .from('voice_recordings')
        .update({ is_public: true })
        .eq('id', recording_id)
        .select('share_token')
        .single()

      if (updateError) {
        console.error('Error enabling sharing:', updateError)
        return new Response(
          JSON.stringify({ error: 'Failed to enable sharing' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Construct the share URL
      // Use the app URL from environment or default to app.use60.com
      const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com'
      const shareUrl = `${appUrl}/share/voice/${updated.share_token}`

      console.log('Sharing enabled for recording:', recording_id)

      return new Response(
        JSON.stringify({
          success: true,
          share_url: shareUrl,
          share_token: updated.share_token,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Disable sharing
      const { error: updateError } = await supabase
        .from('voice_recordings')
        .update({ is_public: false })
        .eq('id', recording_id)

      if (updateError) {
        console.error('Error disabling sharing:', updateError)
        return new Response(
          JSON.stringify({ error: 'Failed to disable sharing' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log('Sharing disabled for recording:', recording_id)

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error: unknown) {
    const corsHeaders = getCorsHeaders(req)
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Voice share error:', error)
    return new Response(
      JSON.stringify({
        error: message,
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

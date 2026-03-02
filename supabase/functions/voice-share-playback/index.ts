import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { S3Client } from "https://deno.land/x/s3_lite_client@0.7.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Voice Share Playback Edge Function
 *
 * Generates a presigned S3 URL for public audio playback.
 * Verifies the recording is publicly shared via share_token.
 * No authentication required - uses share_token for access.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role (for public access)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { share_token } = await req.json()

    if (!share_token) {
      return new Response(
        JSON.stringify({ error: 'share_token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch recording by share token - must be public
    const { data: recording, error: recordingError } = await supabase
      .from('voice_recordings')
      .select('id, audio_url, is_public, share_token')
      .eq('share_token', share_token)
      .eq('is_public', true)
      .maybeSingle()

    if (recordingError || !recording) {
      return new Response(
        JSON.stringify({ error: 'Recording not found or not shared' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const audioUrl = recording.audio_url
    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: 'No audio URL found for recording' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Increment view count
    await supabase.rpc('increment_voice_recording_views', {
      p_share_token: share_token
    })

    // S3 configuration
    const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')
    const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')
    const awsRegion = Deno.env.get('AWS_REGION') || 'eu-west-2'
    const awsBucket = Deno.env.get('AWS_S3_BUCKET') || 'user-upload'

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      return new Response(
        JSON.stringify({ error: 'AWS credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract S3 key from URL
    let s3Key: string
    try {
      const url = new URL(audioUrl)
      s3Key = url.pathname.substring(1) // Remove leading slash
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid audio URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const s3Client = new S3Client({
      endPoint: `s3.${awsRegion}.amazonaws.com`,
      region: awsRegion,
      accessKey: awsAccessKeyId,
      secretKey: awsSecretAccessKey,
      bucket: awsBucket,
      useSSL: true,
    })

    // Generate presigned URL (1 hour expiry)
    const presignedUrl = await s3Client.presignedGetObject(s3Key, {
      expirySeconds: 3600,
    })

    return new Response(
      JSON.stringify({
        success: true,
        url: presignedUrl,
        expires_in: 3600,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Share playback error:', error)
    return new Response(
      JSON.stringify({ error: message, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

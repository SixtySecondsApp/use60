import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { S3Client } from "https://deno.land/x/s3_lite_client@0.7.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Voice Presigned URL Edge Function
 *
 * Generates a presigned S3 URL for audio playback.
 * Verifies user has access to the recording before generating URL.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get auth token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user from token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { recording_id } = await req.json()

    if (!recording_id) {
      return new Response(
        JSON.stringify({ error: 'recording_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch recording to verify access and get audio_url
    const { data: recording, error: recordingError } = await supabase
      .from('voice_recordings')
      .select('audio_url, org_id, user_id')
      .eq('id', recording_id)
      .maybeSingle()

    if (recordingError || !recording) {
      return new Response(
        JSON.stringify({ error: 'Recording not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user belongs to the org that owns this recording
    const { data: membership } = await supabase
      .from('org_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('org_id', recording.org_id)
      .maybeSingle()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const audioUrl = recording.audio_url
    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: 'No audio URL found for recording' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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
    // URL format: https://{bucket}.s3.{region}.amazonaws.com/{key}
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
    console.error('Presigned URL error:', error)
    return new Response(
      JSON.stringify({ error: message, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

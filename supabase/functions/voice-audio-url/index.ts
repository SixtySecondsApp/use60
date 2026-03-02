import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { S3Client } from "https://deno.land/x/s3_lite_client@0.7.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AudioUrlRequest {
  recording_id: string
  share_token?: string
}

/**
 * Voice Audio URL Edge Function
 *
 * Generates presigned URLs for private S3 audio files.
 * Supports both authenticated access (owner) and public access (via share_token).
 *
 * Required Environment Variables:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_S3_BUCKET (defaults to use60-application)
 * - AWS_REGION (defaults to eu-west-2)
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { recording_id, share_token }: AudioUrlRequest = await req.json()

    if (!recording_id) {
      return new Response(
        JSON.stringify({ error: 'recording_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let recording: {
      id: string
      audio_url: string
      user_id: string
      is_public?: boolean
      share_token?: string
    } | null = null

    // Check for share_token access (public sharing)
    if (share_token) {
      const { data, error } = await supabase
        .from('voice_recordings')
        .select('id, audio_url, user_id, is_public, share_token')
        .eq('id', recording_id)
        .eq('share_token', share_token)
        .eq('is_public', true)
        .maybeSingle()

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: 'Recording not found or not shared' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      recording = data
    } else {
      // Authenticated access - check auth token
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Missing authorization header' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify user from token
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: userError } = await supabase.auth.getUser(token)
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authorization token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get recording from database
      const { data, error: recordingError } = await supabase
        .from('voice_recordings')
        .select('id, audio_url, user_id')
        .eq('id', recording_id)
        .single()

      if (recordingError || !data) {
        return new Response(
          JSON.stringify({ error: 'Recording not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check if user has access to this recording
      if (data.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Access denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      recording = data
    }

    if (!recording) {
      return new Response(
        JSON.stringify({ error: 'Recording not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get AWS credentials
    const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')
    const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')
    const awsRegion = Deno.env.get('AWS_REGION') || 'eu-west-2'
    const awsBucket = Deno.env.get('AWS_S3_BUCKET') || 'use60-application'

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      return new Response(
        JSON.stringify({ error: 'Storage credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract S3 key from audio_url
    const audioUrlParts = recording.audio_url.match(/https:\/\/[^/]+\/(.+)$/)
    if (!audioUrlParts) {
      return new Response(
        JSON.stringify({ error: 'Invalid audio URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const s3Key = audioUrlParts[1]
    console.log('Generating presigned URL for S3 key:', s3Key)

    const s3Client = new S3Client({
      endPoint: `s3.${awsRegion}.amazonaws.com`,
      region: awsRegion,
      accessKey: awsAccessKeyId,
      secretKey: awsSecretAccessKey,
      bucket: awsBucket,
      useSSL: true,
    })

    // Generate a presigned URL valid for 1 hour
    const presignedUrl = await s3Client.presignedGetObject(s3Key, { expirySeconds: 3600 })
    console.log('Generated presigned URL for audio playback')

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
    console.error('Voice audio URL error:', error)
    return new Response(
      JSON.stringify({
        error: message,
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { S3Client } from "https://deno.land/x/s3_lite_client@0.7.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UploadRequest {
  audio_data: string // base64 encoded audio
  file_name: string // e.g., "recording-1234567890.webm"
  duration_seconds: number
  org_id: string
  title?: string
}

/**
 * Voice Upload Edge Function
 *
 * Uploads voice recordings to S3 and creates a record in the database.
 *
 * Required Environment Variables:
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_S3_BUCKET (S3 bucket name)
 * - AWS_REGION (optional, defaults to eu-west-2)
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
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

    const { audio_data, file_name, duration_seconds, org_id, title }: UploadRequest = await req.json()

    if (!audio_data || !file_name || !org_id) {
      return new Response(
        JSON.stringify({ error: 'audio_data, file_name, and org_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Convert base64 to buffer
    const base64Data = audio_data.replace(/^data:audio\/\w+;base64,/, '')
    const audioBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))

    // Determine content type from file extension
    const fileExt = file_name.split('.').pop()?.toLowerCase()
    let contentType = 'audio/webm'
    if (fileExt === 'mp3') {
      contentType = 'audio/mpeg'
    } else if (fileExt === 'wav') {
      contentType = 'audio/wav'
    } else if (fileExt === 'ogg') {
      contentType = 'audio/ogg'
    } else if (fileExt === 'm4a') {
      contentType = 'audio/mp4'
    }

    // S3 file path: voice-recordings/{org_id}/{file_name}
    const s3Key = `voice-recordings/${org_id}/${file_name}`

    const s3Client = new S3Client({
      endPoint: `s3.${awsRegion}.amazonaws.com`,
      region: awsRegion,
      accessKey: awsAccessKeyId,
      secretKey: awsSecretAccessKey,
      bucket: awsBucket,
      useSSL: true,
    })

    // Upload to S3
    await s3Client.putObject(s3Key, audioBuffer, {
      metadata: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400',
      },
    })

    // Construct S3 URL
    const s3Url = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`

    // Create voice recording record in database
    const { data: recording, error: dbError } = await supabase
      .from('voice_recordings')
      .insert({
        org_id,
        user_id: user.id,
        title: title || `Recording ${new Date().toLocaleDateString()}`,
        audio_url: s3Url,
        duration_seconds,
        file_name,
        file_size_bytes: audioBuffer.length,
        status: 'uploaded',
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return new Response(
        JSON.stringify({ error: 'Failed to save recording metadata', details: dbError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        recording_id: recording.id,
        audio_url: s3Url,
        file_name: file_name
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Voice upload error:', error)
    return new Response(
      JSON.stringify({
        error: message,
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TranscribeRequest {
  recording_id: string
}

interface GladiaTranscriptionResult {
  transcription: {
    utterances: Array<{
      speaker: number
      text: string
      start: number
      end: number
      confidence: number
    }>
    full_transcript: string
  }
  metadata: {
    audio_duration: number
    number_of_distinct_channels: number
  }
}

/**
 * Voice Transcribe Edge Function
 *
 * Transcribes voice recordings using Gladia API with speaker diarization.
 *
 * Required Environment Variables:
 * - GLADIA_API_KEY
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

    const { recording_id }: TranscribeRequest = await req.json()

    if (!recording_id) {
      return new Response(
        JSON.stringify({ error: 'recording_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get recording from database
    const { data: recording, error: recordingError } = await supabase
      .from('voice_recordings')
      .select('*')
      .eq('id', recording_id)
      .single()

    if (recordingError || !recording) {
      return new Response(
        JSON.stringify({ error: 'Recording not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has access to this recording
    if (recording.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update status to processing
    await supabase
      .from('voice_recordings')
      .update({ status: 'transcribing' })
      .eq('id', recording_id)

    // Get Gladia API key
    const gladiaApiKey = Deno.env.get('GLADIA_API_KEY')
    if (!gladiaApiKey) {
      await supabase
        .from('voice_recordings')
        .update({ status: 'failed', error_message: 'Gladia API key not configured' })
        .eq('id', recording_id)

      return new Response(
        JSON.stringify({ error: 'Transcription service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 1: Upload audio to Gladia
    console.log('Uploading audio to Gladia...')
    const uploadResponse = await fetch('https://api.gladia.io/v2/upload', {
      method: 'POST',
      headers: {
        'x-gladia-key': gladiaApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: recording.audio_url,
      }),
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error('Gladia upload failed:', errorText)
      await supabase
        .from('voice_recordings')
        .update({ status: 'failed', error_message: `Upload failed: ${errorText}` })
        .eq('id', recording_id)

      return new Response(
        JSON.stringify({ error: 'Failed to upload audio for transcription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const uploadResult = await uploadResponse.json()
    const audioUrl = uploadResult.audio_url

    // Step 2: Start transcription with speaker diarization
    console.log('Starting transcription with diarization...')
    const transcriptionResponse = await fetch('https://api.gladia.io/v2/transcription', {
      method: 'POST',
      headers: {
        'x-gladia-key': gladiaApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        diarization: true,
        diarization_config: {
          number_of_speakers: null, // Auto-detect
          min_speakers: 1,
          max_speakers: 6,
        },
        detect_language: true,
        enable_code_switching: false,
        summarization: true,
        summarization_config: {
          type: 'general',
        },
      }),
    })

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text()
      console.error('Gladia transcription request failed:', errorText)
      await supabase
        .from('voice_recordings')
        .update({ status: 'failed', error_message: `Transcription request failed: ${errorText}` })
        .eq('id', recording_id)

      return new Response(
        JSON.stringify({ error: 'Failed to start transcription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const transcriptionResult = await transcriptionResponse.json()
    const resultUrl = transcriptionResult.result_url

    // Step 3: Poll for results
    console.log('Polling for transcription results...')
    let result: GladiaTranscriptionResult | null = null
    let attempts = 0
    const maxAttempts = 60 // 5 minutes max wait (5 seconds * 60)

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds

      const pollResponse = await fetch(resultUrl, {
        headers: {
          'x-gladia-key': gladiaApiKey,
        },
      })

      if (!pollResponse.ok) {
        attempts++
        continue
      }

      const pollResult = await pollResponse.json()

      if (pollResult.status === 'done') {
        result = pollResult
        break
      } else if (pollResult.status === 'error') {
        console.error('Gladia transcription error:', pollResult.error)
        await supabase
          .from('voice_recordings')
          .update({ status: 'failed', error_message: pollResult.error || 'Transcription failed' })
          .eq('id', recording_id)

        return new Response(
          JSON.stringify({ error: 'Transcription failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      attempts++
    }

    if (!result) {
      await supabase
        .from('voice_recordings')
        .update({ status: 'failed', error_message: 'Transcription timed out' })
        .eq('id', recording_id)

      return new Response(
        JSON.stringify({ error: 'Transcription timed out' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 4: Process and save results
    console.log('Processing transcription results...')
    const utterances = result.transcription?.utterances || []
    const fullTranscript = result.transcription?.full_transcript || ''

    // Extract unique speakers
    const speakerSet = new Set(utterances.map(u => u.speaker))
    const speakers = Array.from(speakerSet).map((speakerId, index) => ({
      id: speakerId,
      name: `Speaker ${index + 1}`,
      initials: `S${index + 1}`,
    }))

    // Format transcript segments
    const transcriptSegments = utterances.map(u => ({
      speaker: `Speaker ${u.speaker + 1}`,
      speaker_id: u.speaker,
      text: u.text,
      start_time: u.start,
      end_time: u.end,
      confidence: u.confidence,
    }))

    // Update recording with transcription
    const { error: updateError } = await supabase
      .from('voice_recordings')
      .update({
        status: 'completed',
        transcript_text: fullTranscript,
        transcript_segments: transcriptSegments,
        speakers: speakers,
        language: result.transcription?.language || 'en',
        processed_at: new Date().toISOString(),
      })
      .eq('id', recording_id)

    if (updateError) {
      console.error('Failed to update recording:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to save transcription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        recording_id,
        transcript: fullTranscript,
        speakers: speakers,
        segments_count: transcriptSegments.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Voice transcribe error:', error)
    return new Response(
      JSON.stringify({
        error: message,
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

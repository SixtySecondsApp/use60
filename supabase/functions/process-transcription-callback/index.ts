// Process Transcription Callback
// Receives HMAC-signed results from lambda-transcribe.
// Saves transcript to recordings + meetings tables.
// Triggers process-ai-analysis for summary/coaching.
// On Lambda failure (retry_count >= 2), falls back to Gladia/Deepgram
// via process-recording edge function.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { syncRecordingToMeeting } from '../_shared/recordingCompleteSync.ts';

interface TranscriptionCallbackPayload {
  recording_id: string;
  status: 'success' | 'error';
  transcript_text?: string;
  transcript_json?: { utterances: unknown[] };
  transcript_utterances?: unknown[];
  duration_seconds?: number;
  language?: string;
  word_count?: number;
  speaker_count?: number;
  processing_seconds?: number;
  error?: string;
}

// Max Lambda retries before falling back to Gladia/Deepgram
const MAX_LAMBDA_RETRIES = 2;

/**
 * Verify HMAC-SHA256 signature from Lambda callback.
 */
async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return computed === signature;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verify callback signature
    const callbackSecret = Deno.env.get('LAMBDA_TRANSCRIBE_CALLBACK_SECRET');
    if (!callbackSecret) {
      throw new Error('LAMBDA_TRANSCRIBE_CALLBACK_SECRET not configured');
    }

    const body = await req.text();
    const signature = req.headers.get('X-Callback-Signature');

    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing signature header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isValid = await verifySignature(body, signature, callbackSecret);
    if (!isValid) {
      console.error('[TranscriptionCallback] Invalid signature');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: TranscriptionCallbackPayload = JSON.parse(body);
    const { recording_id, status } = payload;

    console.log(`[TranscriptionCallback] Received callback for recording: ${recording_id}, status: ${status}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (status === 'success') {
      // 2. Save transcript to recordings table
      const { error: updateError } = await supabase
        .from('recordings')
        .update({
          transcript_text: payload.transcript_text,
          transcript_json: payload.transcript_json,
          transcription_status: 'complete',
          transcription_provider: 'whisperx',
          transcription_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recording_id);

      if (updateError) {
        throw new Error(`Failed to update recording: ${updateError.message}`);
      }

      console.log(
        `[TranscriptionCallback] Recording updated: ${recording_id}, ` +
        `${payload.word_count} words, ${payload.speaker_count} speakers, ` +
        `${payload.processing_seconds}s processing`
      );

      // 3. Sync transcript to meetings table
      const { data: recording, error: fetchError } = await supabase
        .from('recordings')
        .select('bot_id')
        .eq('id', recording_id)
        .maybeSingle();

      if (fetchError) {
        console.error('[TranscriptionCallback] Could not fetch recording:', fetchError);
      }

      if (recording?.bot_id) {
        // Update meetings table with transcript
        const { error: meetingError } = await supabase
          .from('meetings')
          .update({
            transcript_text: payload.transcript_text,
            transcript_json: payload.transcript_json,
            updated_at: new Date().toISOString(),
          })
          .eq('bot_id', recording.bot_id)
          .eq('source_type', '60_notetaker');

        if (meetingError) {
          console.error('[TranscriptionCallback] Failed to update meeting:', meetingError);
        } else {
          console.log('[TranscriptionCallback] Meeting transcript synced');
        }

        // Sync S3 URLs to meetings table
        await syncRecordingToMeeting({
          recording_id,
          bot_id: recording.bot_id,
          supabase,
        });

        // 4. Trigger AI analysis (summary + coaching)
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        try {
          const analysisResponse = await fetch(`${supabaseUrl}/functions/v1/process-ai-analysis`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recording_id,
              bot_id: recording.bot_id,
            }),
          });

          if (!analysisResponse.ok) {
            const error = await analysisResponse.text();
            console.error('[TranscriptionCallback] process-ai-analysis failed:', error);
          } else {
            console.log('[TranscriptionCallback] AI analysis triggered successfully');
          }
        } catch (error) {
          console.error('[TranscriptionCallback] Failed to trigger AI analysis:', error);
          // Non-fatal - transcript is saved, AI analysis can be retried
        }
      }
    } else {
      // Handle Lambda transcription error
      console.error(`[TranscriptionCallback] Lambda transcription failed for ${recording_id}: ${payload.error}`);

      // Get current retry count
      const { data: currentRecording } = await supabase
        .from('recordings')
        .select('transcription_retry_count, bot_id, s3_video_url, s3_audio_url')
        .eq('id', recording_id)
        .maybeSingle();

      const retryCount = (currentRecording?.transcription_retry_count || 0) + 1;

      // Update recording with error
      await supabase
        .from('recordings')
        .update({
          transcription_status: 'failed',
          transcription_error: `Lambda: ${payload.error}`,
          transcription_retry_count: retryCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recording_id);

      // If exceeded Lambda retry limit, fall back to Gladia/Deepgram
      if (retryCount >= MAX_LAMBDA_RETRIES && currentRecording?.bot_id) {
        console.log(
          `[TranscriptionCallback] Lambda retries exhausted (${retryCount}/${MAX_LAMBDA_RETRIES}), ` +
          `falling back to Gladia/Deepgram via process-recording`
        );

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        try {
          const fallbackResponse = await fetch(`${supabaseUrl}/functions/v1/process-recording`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recording_id,
              bot_id: currentRecording.bot_id,
              video_url: currentRecording.s3_video_url,
              audio_url: currentRecording.s3_audio_url,
            }),
          });

          if (!fallbackResponse.ok) {
            const error = await fallbackResponse.text();
            console.error('[TranscriptionCallback] Fallback process-recording failed:', error);
          } else {
            console.log('[TranscriptionCallback] Fallback to Gladia/Deepgram triggered');

            // Update provider to track that we're using external API
            await supabase
              .from('recordings')
              .update({
                transcription_status: 'processing',
                transcription_error: `Lambda failed ${retryCount}x, falling back to external API`,
                updated_at: new Date().toISOString(),
              })
              .eq('id', recording_id);
          }
        } catch (error) {
          console.error('[TranscriptionCallback] Failed to trigger fallback:', error);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, recording_id, status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[TranscriptionCallback] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

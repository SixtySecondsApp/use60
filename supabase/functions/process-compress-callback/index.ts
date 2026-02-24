// Process Compress Callback
// Receives results from Lambda compression pipeline
// Updates recordings table, syncs to meetings, triggers thumbnail

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { LambdaClient, InvokeCommand } from 'npm:@aws-sdk/client-lambda@3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { syncRecordingToMeeting } from '../_shared/recordingCompleteSync.ts';

interface CompressCallbackPayload {
  recording_id: string;
  status: 'success' | 'failed';
  s3_video_url?: string;
  s3_audio_url?: string;
  s3_thumbnail_url?: string;
  video_size_bytes?: number;
  audio_size_bytes?: number;
  original_size_bytes?: number;
  compressed_size_bytes?: number;
  compression_ratio?: number;
  compression_duration_seconds?: number;
  duration_seconds?: number;
  error?: string;
}

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
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // 1. Verify callback signature
    const callbackSecret = Deno.env.get('COMPRESS_CALLBACK_SECRET');
    if (!callbackSecret) {
      throw new Error('COMPRESS_CALLBACK_SECRET not configured');
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
      console.error('[CompressCallback] Invalid signature');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: CompressCallbackPayload = JSON.parse(body);
    const { recording_id, status } = payload;

    console.log(`[CompressCallback] Received callback for recording: ${recording_id}, status: ${status}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (status === 'success') {
      // 2. Update recordings table with compressed results
      const totalSize = (payload.video_size_bytes || 0) + (payload.audio_size_bytes || 0);

      const { error: updateError } = await supabase
        .from('recordings')
        .update({
          s3_upload_status: 'complete',
          s3_upload_completed_at: new Date().toISOString(),
          s3_video_url: payload.s3_video_url,
          s3_audio_url: payload.s3_audio_url || null,
          thumbnail_url: payload.s3_thumbnail_url || null,
          s3_file_size_bytes: totalSize,
          original_size_bytes: payload.original_size_bytes,
          compressed_size_bytes: payload.compressed_size_bytes,
          compression_ratio: payload.compression_ratio,
          compression_duration_seconds: payload.compression_duration_seconds,
        })
        .eq('id', recording_id);

      if (updateError) {
        throw new Error(`Failed to update recording: ${updateError.message}`);
      }

      console.log(
        `[CompressCallback] Recording updated: ${recording_id}, ` +
        `${payload.original_size_bytes} → ${payload.compressed_size_bytes} bytes ` +
        `(${((payload.compression_ratio || 0) * 100).toFixed(1)}% of original)`
      );

      // 3. Get bot_id and transcript status for sync + retry
      const { data: recording, error: fetchError } = await supabase
        .from('recordings')
        .select('bot_id, transcript_text')
        .eq('id', recording_id)
        .single();

      if (fetchError || !recording?.bot_id) {
        console.error('[CompressCallback] Could not find bot_id for recording:', fetchError);
      } else {
        // 4. Sync S3 URLs to meetings table + thumbnail
        await syncRecordingToMeeting({
          recording_id,
          bot_id: recording.bot_id,
          supabase,
          thumbnail_url: payload.s3_thumbnail_url,
        });

        // 5. If no transcript yet, invoke Lambda transcribe (WhisperX)
        // This handles the case where MeetingBaaS transcript.ready webhook never arrives
        if (!recording.transcript_text) {
          console.log('[CompressCallback] No transcript found - invoking Lambda transcribe (WhisperX)');

          const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const callbackSecret = Deno.env.get('LAMBDA_TRANSCRIBE_CALLBACK_SECRET');
          const lambdaFunctionName = Deno.env.get('LAMBDA_TRANSCRIBE_FUNCTION_NAME') || 'use60-lambda-transcribe';

          if (!callbackSecret) {
            console.error('[CompressCallback] LAMBDA_TRANSCRIBE_CALLBACK_SECRET not configured, skipping transcription');
          } else {
            try {
              // Update transcription status to processing
              await supabase
                .from('recordings')
                .update({
                  transcription_status: 'processing',
                  transcription_started_at: new Date().toISOString(),
                })
                .eq('id', recording_id);

              const lambdaPayload = {
                recording_id,
                audio_url: payload.s3_audio_url || payload.s3_video_url,
                video_url: payload.s3_video_url,
                callback_url: `${supabaseUrl}/functions/v1/process-transcription-callback`,
                callback_secret: callbackSecret,
                language: 'en',
                model_size: 'medium',
              };

              const lambdaClient = new LambdaClient({
                region: Deno.env.get('AWS_REGION') || 'eu-west-2',
                credentials: {
                  accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
                  secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
                },
              });

              const invokeCommand = new InvokeCommand({
                FunctionName: lambdaFunctionName,
                InvocationType: 'Event', // Async - returns 202 immediately
                Payload: new TextEncoder().encode(JSON.stringify(lambdaPayload)),
              });

              const lambdaResponse = await lambdaClient.send(invokeCommand);
              console.log(
                `[CompressCallback] Lambda transcribe invoked (status: ${lambdaResponse.StatusCode}), ` +
                `recording: ${recording_id}`
              );
            } catch (error) {
              console.error('[CompressCallback] Failed to invoke Lambda transcribe:', error);
              // Non-fatal - recording data is saved, poll-transcription-queue will retry
              await supabase
                .from('recordings')
                .update({
                  transcription_status: 'failed',
                  transcription_error: `Lambda invoke failed: ${(error as Error).message}`,
                })
                .eq('id', recording_id);
            }
          }
        } else {
          console.log('[CompressCallback] Transcript already exists, skipping transcription');
        }
      }
    } else {
      // Handle failure
      console.error(`[CompressCallback] Lambda failed for ${recording_id}: ${payload.error}`);

      // Get current retry count
      const { data: currentRecording } = await supabase
        .from('recordings')
        .select('s3_upload_retry_count')
        .eq('id', recording_id)
        .single();

      const retryCount = (currentRecording?.s3_upload_retry_count || 0) + 1;

      await supabase
        .from('recordings')
        .update({
          s3_upload_status: 'failed',
          s3_upload_error_message: `Lambda compression failed: ${payload.error}`,
          s3_upload_retry_count: retryCount,
          s3_upload_last_retry_at: new Date().toISOString(),
        })
        .eq('id', recording_id);
    }

    return new Response(
      JSON.stringify({ success: true, recording_id, status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[CompressCallback] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

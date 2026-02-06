// Poll Transcription Queue
// Cron job that runs every 5 minutes to process pending/failed transcriptions
// Tier 1: Railway WhisperX (retries < 3)
// Tier 2: Fall back to Gladia/Deepgram via process-recording for retries >= 3

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// If a recording has been in 'processing' state for longer than this,
// it's considered stale (Railway likely failed without callback)
const STALE_PROCESSING_MINUTES = 30;

// Max Railway retries before falling back to Gladia/Deepgram
const MAX_RAILWAY_RETRIES = 3;

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[Transcription Queue] Polling for pending transcriptions...');

    const now = new Date();

    // Count pending transcriptions (S3 upload complete, no transcript)
    const { count: pendingCount } = await supabase
      .from('recordings')
      .select('id', { count: 'exact', head: true })
      .eq('transcription_status', 'pending')
      .eq('s3_upload_status', 'complete')
      .is('transcript_text', null);

    // Count failed transcriptions ready for retry
    const { count: failedCount } = await supabase
      .from('recordings')
      .select('id', { count: 'exact', head: true })
      .eq('transcription_status', 'failed');

    // Count currently processing (for monitoring)
    const { count: processingCount } = await supabase
      .from('recordings')
      .select('id', { count: 'exact', head: true })
      .eq('transcription_status', 'processing');

    console.log(
      `[Transcription Queue] Status: ${pendingCount || 0} pending, ${failedCount || 0} failed, ${processingCount || 0} processing`
    );

    // Detect and reset stale processing recordings (Lambda failed without callback)
    if (processingCount && processingCount > 0) {
      const staleThreshold = new Date(now.getTime() - STALE_PROCESSING_MINUTES * 60 * 1000);

      const { data: staleRecordings, error: staleError } = await supabase
        .from('recordings')
        .select('id, transcription_retry_count, transcription_started_at')
        .eq('transcription_status', 'processing')
        .lt('transcription_started_at', staleThreshold.toISOString());

      if (!staleError && staleRecordings && staleRecordings.length > 0) {
        console.warn(
          `[Transcription Queue] Found ${staleRecordings.length} stale processing recordings (>${STALE_PROCESSING_MINUTES}min)`
        );

        for (const stale of staleRecordings) {
          const retryCount = (stale.transcription_retry_count || 0) + 1;
          await supabase
            .from('recordings')
            .update({
              transcription_status: 'failed',
              transcription_error: `Railway processing timed out after ${STALE_PROCESSING_MINUTES} minutes`,
              transcription_retry_count: retryCount,
              updated_at: now.toISOString(),
            })
            .eq('id', stale.id);
          console.warn(`[Transcription Queue] Recording ${stale.id} marked failed (stale, retry ${retryCount})`);
        }
      }
    }

    // Fetch recordings needing transcription:
    // 1. Pending transcription with S3 upload complete
    // 2. Failed transcription (for retry or fallback)
    const { data: recordings, error: fetchError } = await supabase
      .from('recordings')
      .select('id, bot_id, s3_video_url, s3_audio_url, transcription_status, transcription_retry_count, transcription_error, updated_at')
      .or(
        'and(transcription_status.eq.pending,s3_upload_status.eq.complete,transcript_text.is.null),' +
        'transcription_status.eq.failed'
      )
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      throw new Error(`Failed to fetch recordings: ${fetchError.message}`);
    }

    if (!recordings || recordings.length === 0) {
      console.log('[Transcription Queue] No recordings to process');
      return new Response(
        JSON.stringify({
          message: 'No pending transcriptions',
          processed: 0,
          processing: processingCount || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Transcription Queue] Processing ${recordings.length} recordings`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const callbackSecret = Deno.env.get('LAMBDA_TRANSCRIBE_CALLBACK_SECRET');
    const railwayUrl = Deno.env.get('RAILWAY_TRANSCRIBE_URL') || 'https://transcriber-production-229c.up.railway.app';

    const results: Array<{ recording_id: string; success: boolean; action: string; error?: string }> = [];

    for (const recording of recordings) {
      const { id, bot_id, s3_video_url, s3_audio_url, transcription_retry_count } = recording;
      const retryCount = transcription_retry_count || 0;

      try {
        // Check exponential backoff for failed retries
        if (recording.transcription_status === 'failed' && recording.updated_at) {
          const lastUpdate = new Date(recording.updated_at);
          const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

          // Exponential backoff: 0, 5, 15 min
          const retryDelays = [0, 5, 15];
          const requiredDelay = retryDelays[Math.min(retryCount, retryDelays.length - 1)] || 15;

          if (minutesSinceUpdate < requiredDelay) {
            console.log(
              `[Transcription Queue] Recording ${id} not ready for retry ` +
              `(${minutesSinceUpdate.toFixed(1)}min < ${requiredDelay}min)`
            );
            continue;
          }
        }

        // No S3 audio or video URL available
        if (!s3_audio_url && !s3_video_url) {
          console.warn(`[Transcription Queue] Recording ${id} has no S3 URLs, skipping`);
          continue;
        }

        // TIER 1: Railway WhisperX (retries < MAX_RAILWAY_RETRIES)
        if (retryCount < MAX_RAILWAY_RETRIES && callbackSecret) {
          console.log(
            `[Transcription Queue] Tier 1: Railway transcribe for ${id} (attempt ${retryCount + 1}/${MAX_RAILWAY_RETRIES})`
          );

          await supabase
            .from('recordings')
            .update({
              transcription_status: 'processing',
              transcription_started_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('id', id);

          const railwayPayload = {
            recording_id: id,
            audio_url: s3_audio_url || s3_video_url,
            video_url: s3_video_url,
            callback_url: `${supabaseUrl}/functions/v1/process-transcription-callback`,
            callback_secret: callbackSecret,
            language: 'en',
            model_size: 'medium',
          };

          const railwayResponse = await fetch(`${railwayUrl}/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(railwayPayload),
          });

          if (!railwayResponse.ok) {
            const error = await railwayResponse.text();
            console.error(`[Transcription Queue] Railway invocation failed for ${id}:`, error);
            results.push({ recording_id: id, success: false, action: 'railway_failed', error });
          } else {
            console.log(`[Transcription Queue] Railway invoked (status: ${railwayResponse.status}) for ${id}`);
            results.push({ recording_id: id, success: true, action: 'railway_invoked' });
          }

        // TIER 2: Fallback to Gladia/Deepgram via process-recording
        } else if (retryCount >= MAX_RAILWAY_RETRIES && bot_id) {
          console.log(
            `[Transcription Queue] Tier 2: Falling back to Gladia/Deepgram for ${id} ` +
            `(Railway failed ${retryCount}x)`
          );

          await supabase
            .from('recordings')
            .update({
              transcription_status: 'processing',
              transcription_error: `Railway failed ${retryCount}x, falling back to external API`,
              updated_at: now.toISOString(),
            })
            .eq('id', id);

          const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-recording`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recording_id: id,
              bot_id,
              video_url: s3_video_url,
              audio_url: s3_audio_url,
            }),
          });

          if (!processResponse.ok) {
            const error = await processResponse.text();
            console.error(`[Transcription Queue] process-recording failed for ${id}:`, error);
            results.push({ recording_id: id, success: false, action: 'fallback_failed', error });
          } else {
            console.log(`[Transcription Queue] Fallback triggered for ${id}`);
            results.push({ recording_id: id, success: true, action: 'fallback_triggered' });
          }

        // Missing callbackSecret or bot_id for fallback
        } else {
          console.warn(
            `[Transcription Queue] Cannot process ${id}: ` +
            `callbackSecret=${!!callbackSecret}, retryCount=${retryCount}, bot_id=${bot_id}`
          );
          results.push({ recording_id: id, success: false, action: 'skipped', error: 'Missing configuration' });
        }
      } catch (error) {
        console.error(`[Transcription Queue] Error processing recording ${id}:`, error);
        results.push({ recording_id: id, success: false, action: 'error', error: (error as Error).message });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log(`[Transcription Queue] Complete: ${successCount} success, ${failureCount} failed`);

    return new Response(
      JSON.stringify({
        message: 'Queue processing complete',
        processed: recordings.length,
        success: successCount,
        failed: failureCount,
        processing: processingCount || 0,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Transcription Queue] Error:', error);
    return new Response(
      JSON.stringify({
        error: (error as Error).message,
        details: (error as Error).stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

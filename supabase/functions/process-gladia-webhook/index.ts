/**
 * Process Gladia Webhook
 *
 * Receives async transcription results from Gladia and triggers AI analysis.
 * This enables processing of long recordings without edge function timeouts.
 *
 * Webhook URL: https://{project}.supabase.co/functions/v1/process-gladia-webhook
 *
 * Flow:
 * 1. Gladia sends transcript when ready
 * 2. Save transcript to database
 * 3. Trigger AI analysis
 * 4. Update meeting record
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { legacyCorsHeaders as corsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { syncRecordingToMeeting } from '../_shared/recordingCompleteSync.ts';

interface GladiaWebhookPayload {
  id: string;
  status: 'processing' | 'done' | 'error';
  result?: {
    transcription: {
      full_transcript: string;
      utterances: Array<{
        speaker: number;
        start: number;
        end: number;
        text: string;
        confidence?: number;
      }>;
      speakers?: Array<{ id: number; count: number }>;
    };
    metadata?: {
      duration_seconds?: number;
    };
  };
  error?: string;
  // Note: recording_id and bot_id come from URL query params, not payload
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Parse URL query parameters (recording_id and bot_id encoded in callback URL)
    const url = new URL(req.url);
    const recordingId = url.searchParams.get('recording_id');
    const botId = url.searchParams.get('bot_id');

    const payload: GladiaWebhookPayload = await req.json();

    console.log('[ProcessGladiaWebhook] Received webhook:', {
      id: payload.id,
      status: payload.status,
      recording_id: recordingId,
      bot_id: botId,
    });

    // Validate recording_id from URL params
    if (!recordingId) {
      console.error('[ProcessGladiaWebhook] No recording_id in URL params');
      return new Response(
        JSON.stringify({ error: 'Missing recording_id in URL parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle error status
    if (payload.status === 'error') {
      console.error('[ProcessGladiaWebhook] Transcription failed:', payload.error);

      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: `Gladia transcription failed: ${payload.error || 'Unknown error'}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recordingId);

      // Sync to meetings table
      if (payload.metadata?.bot_id) {
        await supabase
          .from('meetings')
          .update({
            processing_status: 'failed',
            error_message: `Transcription failed: ${payload.error || 'Unknown error'}`,
            updated_at: new Date().toISOString(),
          })
          .eq('bot_id', botId)
          .eq('source_type', '60_notetaker');
      }

      return new Response(
        JSON.stringify({ success: false, error: payload.error }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle success - extract transcript
    if (payload.status === 'done' && payload.result?.transcription) {
      const transcription = payload.result.transcription;

      console.log('[ProcessGladiaWebhook] Transcription complete:', {
        utterances: transcription.utterances.length,
        transcript_length: transcription.full_transcript.length,
      });

      // Save transcript to recordings table
      await supabase
        .from('recordings')
        .update({
          status: 'processing', // Still processing - AI analysis pending
          transcript_json: transcription,
          transcript_text: transcription.full_transcript,
          meeting_duration_seconds: payload.result.metadata?.duration_seconds || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recordingId);

      // Sync to meetings table
      if (payload.metadata?.bot_id) {
        const durationMinutes = payload.result.metadata?.duration_seconds
          ? Math.round(payload.result.metadata.duration_seconds / 60)
          : null;

        // Get S3 URLs from recording (if upload complete)
        const { data: recording } = await supabase
          .from('recordings')
          .select('s3_upload_status, s3_video_url, s3_audio_url')
          .eq('id', recordingId)
          .single();

        const meetingUpdate: any = {
          transcript_text: transcription.full_transcript,
          transcript_json: transcription,
          duration_minutes: durationMinutes,
          processing_status: 'processing', // AI analysis pending
          updated_at: new Date().toISOString(),
        };

        // Sync S3 URLs if upload is complete
        if (recording?.s3_upload_status === 'complete') {
          console.log('[ProcessGladiaWebhook] Syncing S3 URLs to meetings table');
          meetingUpdate.video_url = recording.s3_video_url;
          meetingUpdate.audio_url = recording.s3_audio_url;
        }

        await supabase
          .from('meetings')
          .update(meetingUpdate)
          .eq('bot_id', botId)
          .eq('source_type', '60_notetaker');

        // Sync S3 URLs and trigger thumbnail generation (if S3 upload complete)
        await syncRecordingToMeeting({
          recording_id: recordingId,
          bot_id: botId,
          supabase,
        });
      }

      // Trigger AI analysis (lightweight, can run in edge function)
      console.log('[ProcessGladiaWebhook] Triggering AI analysis...');

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (supabaseUrl && serviceRoleKey) {
        try {
          const analysisResponse = await fetch(`${supabaseUrl}/functions/v1/process-ai-analysis`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recording_id: recordingId,
              bot_id: payload.metadata?.bot_id,
            }),
          });

          if (!analysisResponse.ok) {
            console.error('[ProcessGladiaWebhook] AI analysis failed:', await analysisResponse.text());
          } else {
            console.log('[ProcessGladiaWebhook] AI analysis triggered successfully');
          }
        } catch (error) {
          console.error('[ProcessGladiaWebhook] Failed to trigger AI analysis:', error);
          // Don't fail the webhook - transcript is saved, analysis can be retried
        }
      }

      return new Response(
        JSON.stringify({ success: true, recording_id: recordingId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Still processing
    console.log('[ProcessGladiaWebhook] Transcription still processing, waiting...');
    return new Response(
      JSON.stringify({ success: true, status: 'processing' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ProcessGladiaWebhook] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

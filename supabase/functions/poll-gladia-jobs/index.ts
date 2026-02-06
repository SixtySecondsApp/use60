/**
 * Poll Gladia Jobs
 *
 * Scheduled function (runs every 3 minutes) that polls Gladia for completed transcriptions.
 * This is necessary because Gladia doesn't actually fire webhooks despite accepting callback_url.
 *
 * Flow:
 * 1. Find all recordings with status='transcribing'
 * 2. For each, poll Gladia API to check job status
 * 3. If status='done', fetch full transcript and trigger webhook handler
 * 4. If status='error', mark recording as failed
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { legacyCorsHeaders as corsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

interface GladiaJobStatus {
  id: string;
  status: 'queued' | 'processing' | 'done' | 'error';
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
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const gladiaApiKey = Deno.env.get('GLADIA_API_KEY');
  if (!gladiaApiKey) {
    console.error('[PollGladiaJobs] Missing GLADIA_API_KEY');
    return new Response(
      JSON.stringify({ error: 'Missing Gladia API key' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Quick check: count recordings in transcribing state
    // This fast query exits immediately if there's nothing to process
    const { count, error: countError } = await supabase
      .from('recordings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'transcribing')
      .not('gladia_job_id', 'is', null);

    if (countError) {
      console.error('[PollGladiaJobs] Error checking recordings:', countError);
      return new Response(
        JSON.stringify({ error: 'Failed to check recordings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Exit immediately if nothing to process (saves compute time)
    if (!count || count === 0) {
      console.log('[PollGladiaJobs] No recordings in transcribing state - skipping');
      return new Response(
        JSON.stringify({ success: true, message: 'No recordings to poll', count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[PollGladiaJobs] Found ${count} recording(s) to poll`);

    // Now fetch full recordings data
    const { data: recordings, error: fetchError } = await supabase
      .from('recordings')
      .select('id, gladia_job_id, transcription_started_at, user_id, org_id')
      .eq('status', 'transcribing')
      .not('gladia_job_id', 'is', null)
      .order('transcription_started_at', { ascending: true });

    if (fetchError) {
      console.error('[PollGladiaJobs] Error fetching recordings:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch recordings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!recordings || recordings.length === 0) {
      // Race condition - count showed recordings but query returned none
      console.log('[PollGladiaJobs] No recordings found (race condition)');
      return new Response(
        JSON.stringify({ success: true, message: 'No recordings to poll', count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[PollGladiaJobs] Found ${recordings.length} recordings in transcribing state`);

    const results = {
      total: recordings.length,
      completed: 0,
      failed: 0,
      still_processing: 0,
      errors: [] as Array<{ recording_id: string; error: string }>,
    };

    // Poll Gladia for each recording
    for (const recording of recordings) {
      try {
        console.log(`[PollGladiaJobs] Polling Gladia job: ${recording.gladia_job_id}`);

        // Fetch job status from Gladia
        const gladiaResponse = await fetch(
          `https://api.gladia.io/v2/transcription/${recording.gladia_job_id}`,
          {
            headers: {
              'x-gladia-key': gladiaApiKey,
            },
          }
        );

        if (!gladiaResponse.ok) {
          console.error(`[PollGladiaJobs] Gladia API error for job ${recording.gladia_job_id}:`, await gladiaResponse.text());
          results.errors.push({
            recording_id: recording.id,
            error: `Gladia API error: ${gladiaResponse.status}`,
          });
          continue;
        }

        const jobStatus: GladiaJobStatus = await gladiaResponse.json();
        console.log(`[PollGladiaJobs] Job ${recording.gladia_job_id} status: ${jobStatus.status}`);

        // Handle completed transcription
        if (jobStatus.status === 'done' && jobStatus.result) {
          console.log(`[PollGladiaJobs] Job ${recording.gladia_job_id} completed, triggering webhook handler`);

          // Get bot_id from bot_deployments table
          const { data: deployment } = await supabase
            .from('bot_deployments')
            .select('bot_id')
            .eq('recording_id', recording.id)
            .maybeSingle();

          // Trigger the webhook handler with full Gladia response
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

          if (supabaseUrl && serviceRoleKey) {
            const webhookUrl = `${supabaseUrl}/functions/v1/process-gladia-webhook?recording_id=${recording.id}${deployment?.bot_id ? `&bot_id=${deployment.bot_id}` : ''}`;

            const webhookResponse = await fetch(webhookUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(jobStatus),
            });

            if (webhookResponse.ok) {
              console.log(`[PollGladiaJobs] Successfully triggered webhook for recording ${recording.id}`);
              results.completed++;
            } else {
              console.error(`[PollGladiaJobs] Webhook handler failed for recording ${recording.id}:`, await webhookResponse.text());
              results.errors.push({
                recording_id: recording.id,
                error: 'Webhook handler failed',
              });
            }
          }
        }
        // Handle failed transcription
        else if (jobStatus.status === 'error') {
          console.error(`[PollGladiaJobs] Job ${recording.gladia_job_id} failed:`, jobStatus.error);

          await supabase
            .from('recordings')
            .update({
              status: 'failed',
              error_message: `Gladia transcription failed: ${jobStatus.error || 'Unknown error'}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', recording.id);

          results.failed++;
        }
        // Still processing
        else {
          console.log(`[PollGladiaJobs] Job ${recording.gladia_job_id} still processing`);
          results.still_processing++;

          // Check if transcription has been running too long (>30 minutes)
          if (recording.transcription_started_at) {
            const startedAt = new Date(recording.transcription_started_at);
            const now = new Date();
            const minutesElapsed = (now.getTime() - startedAt.getTime()) / (1000 * 60);

            if (minutesElapsed > 30) {
              console.warn(`[PollGladiaJobs] Job ${recording.gladia_job_id} has been running for ${Math.round(minutesElapsed)} minutes`);
              // Don't fail it yet - Gladia can be slow for very long recordings
            }
          }
        }
      } catch (error) {
        console.error(`[PollGladiaJobs] Error processing recording ${recording.id}:`, error);
        results.errors.push({
          recording_id: recording.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log('[PollGladiaJobs] Polling complete:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[PollGladiaJobs] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

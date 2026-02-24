/**
 * Poll Stuck Bots
 *
 * Fallback mechanism for when MeetingBaaS webhooks are not delivered.
 * Queries bot_deployments for bots stuck in non-terminal states,
 * checks their status via MeetingBaaS API, and triggers processing
 * if the bot has completed.
 *
 * Can be invoked:
 * - Manually via service role key
 * - Via pg_cron scheduled job
 * - From frontend "refresh" button
 *
 * Optional body parameters:
 * - bot_id: string — poll a specific bot instead of all stuck bots
 * - max_age_hours: number — max age of bots to check (default: 24)
 * - stale_minutes: number — minutes since last update to consider stuck (default: 5)
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, PutObjectCommand, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { createMeetingBaaSClient } from '../_shared/meetingbaas.ts';
import { formatUtterancesToTranscriptText } from '../_shared/transcriptFormatter.ts';

// =============================================================================
// Types
// =============================================================================

interface StuckBot {
  bot_id: string;
  deployment_id: string;
  recording_id: string;
  org_id: string;
  user_id: string;
  deployment_status: string;
  recording_status: string;
  created_at: string;
  updated_at: string;
}

interface PollResult {
  bot_id: string;
  recording_id: string;
  previous_status: string;
  new_status: string;
  action: string;
  error?: string;
}

// =============================================================================
// S3 Upload (extracted from meetingbaas-webhook)
// =============================================================================

async function uploadRecordingToS3(
  recordingUrl: string,
  orgId: string,
  userId: string,
  recordingId: string
): Promise<{ success: boolean; storagePath?: string; storageUrl?: string; error?: string }> {
  console.log('[PollStuckBots] Downloading recording from MeetingBaaS...');

  try {
    const s3Client = new S3Client({
      region: Deno.env.get('AWS_REGION') || 'eu-west-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      },
    });

    const bucketName = Deno.env.get('AWS_S3_BUCKET') || 'use60-application';

    const response = await fetch(recordingUrl);
    if (!response.ok) {
      throw new Error(`Failed to download recording: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';
    let fileExtension = 'mp4';
    if (contentType.includes('webm')) {
      fileExtension = 'webm';
    } else if (contentType.includes('audio')) {
      fileExtension = contentType.includes('wav') ? 'wav' : 'mp3';
    }

    const s3Key = `meeting-recordings/${orgId}/${userId}/${recordingId}/recording.${fileExtension}`;
    console.log(`[PollStuckBots] Uploading to S3: ${s3Key}`);

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: uint8Array,
      ContentType: contentType,
      Metadata: {
        'org-id': orgId,
        'user-id': userId,
        'recording-id': recordingId,
      },
    }));

    const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    }), { expiresIn: 60 * 60 * 24 * 7 });

    console.log(`[PollStuckBots] S3 upload successful: ${s3Key}`);
    return { success: true, storagePath: s3Key, storageUrl: signedUrl };
  } catch (error) {
    console.error('[PollStuckBots] S3 upload error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Upload failed' };
  }
}

// =============================================================================
// Core Logic
// =============================================================================

async function processCompletedBot(
  supabase: ReturnType<typeof createClient>,
  bot: StuckBot,
  botData: Record<string, unknown>,
  meetingBaaSClient: ReturnType<typeof createMeetingBaaSClient>
): Promise<PollResult> {
  const result: PollResult = {
    bot_id: bot.bot_id,
    recording_id: bot.recording_id,
    previous_status: bot.deployment_status,
    new_status: 'completed',
    action: 'processing',
  };

  try {
    // Extract media URLs from bot data
    // MeetingBaaS v2 API returns various fields depending on bot status
    const videoUrl = (botData.video_url || botData.video || botData.mp4) as string | undefined;
    const audioUrl = (botData.audio_url || botData.audio) as string | undefined;
    const mediaUrl = videoUrl || audioUrl;

    // Extract participants/speakers for attendee resolution
    const participants = (botData.participants || botData.attendees) as Array<Record<string, unknown>> | undefined;
    const speakers = (botData.speakers) as Array<Record<string, unknown>> | undefined;

    // Extract timing info
    const joinedAt = (botData.joined_at || botData.start_time) as string | undefined;
    const exitedAt = (botData.exited_at || botData.end_time || botData.left_at) as string | undefined;
    const durationSeconds = (botData.duration_seconds || botData.duration) as number | undefined;

    console.log(`[PollStuckBots] Bot ${bot.bot_id} completed. Media: ${mediaUrl ? 'yes' : 'no'}, Participants: ${participants?.length || 0}, Speakers: ${speakers?.length || 0}`);

    // Get existing recording for attendees check
    const { data: recording } = await supabase
      .from('recordings')
      .select('attendees, recording_s3_key')
      .eq('id', bot.recording_id)
      .maybeSingle();

    // Resolve attendees from MeetingBaaS data (only if not already present)
    let resolvedAttendees: Array<{ email?: string; name?: string }> | null = null;
    const existingAttendees = recording?.attendees as Array<Record<string, unknown>> | null;

    if (!existingAttendees || existingAttendees.length === 0) {
      if (participants && participants.length > 0) {
        resolvedAttendees = participants.map((p) => ({
          name: (p.name || p.display_name || p.displayName || p.user_name || p.username) as string | undefined,
          email: (p.email || p.email_address) as string | undefined,
        })).filter(a => a.name || a.email);
        console.log(`[PollStuckBots] Extracted ${resolvedAttendees.length} attendees from participants`);
      }

      if ((!resolvedAttendees || resolvedAttendees.length === 0) && speakers && speakers.length > 0) {
        resolvedAttendees = speakers.map((s) => ({
          name: (s.name || s.display_name || s.displayName || s.speaker_name) as string | undefined,
          email: (s.email || s.email_address) as string | undefined,
        })).filter(a => a.name || a.email);
        console.log(`[PollStuckBots] Extracted ${resolvedAttendees.length} attendees from speakers`);
      }
    }

    // Upload to S3 if we have media and it's not already uploaded
    if (mediaUrl && !recording?.recording_s3_key) {
      const uploadResult = await uploadRecordingToS3(
        mediaUrl,
        bot.org_id,
        bot.user_id,
        bot.recording_id
      );

      const updateData: Record<string, unknown> = {
        meeting_start_time: joinedAt,
        meeting_end_time: exitedAt,
        meeting_duration_seconds: durationSeconds,
        status: 'processing',
        updated_at: new Date().toISOString(),
      };
      if (uploadResult.success) {
        updateData.recording_s3_key = uploadResult.storagePath;
        updateData.recording_s3_url = uploadResult.storageUrl;
      }
      if (resolvedAttendees && resolvedAttendees.length > 0) {
        updateData.attendees = resolvedAttendees;
      }
      await supabase
        .from('recordings')
        .update(updateData)
        .eq('id', bot.recording_id);
    } else {
      // Update recording with timing + attendees even without media upload
      const updateData: Record<string, unknown> = {
        meeting_start_time: joinedAt,
        meeting_end_time: exitedAt,
        meeting_duration_seconds: durationSeconds,
        status: 'processing',
        updated_at: new Date().toISOString(),
      };
      if (resolvedAttendees && resolvedAttendees.length > 0) {
        updateData.attendees = resolvedAttendees;
      }
      await supabase
        .from('recordings')
        .update(updateData)
        .eq('id', bot.recording_id);
    }

    // Update bot_deployments
    await supabase
      .from('bot_deployments')
      .update({
        status: 'completed',
        leave_time: exitedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bot.deployment_id);

    // Sync meeting status
    await supabase
      .from('meetings')
      .update({
        processing_status: 'processing',
        meeting_start: joinedAt,
        meeting_end: exitedAt,
        duration_minutes: durationSeconds ? Math.round(durationSeconds / 60) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('bot_id', bot.bot_id)
      .eq('source_type', '60_notetaker');

    // Step: Fetch and save transcript from MeetingBaaS before triggering process-recording
    // This ensures process-recording finds the transcript in DB (Priority 1)
    // and never needs to fall back to Gladia
    try {
      console.log(`[PollStuckBots] Fetching transcript from MeetingBaaS for bot ${bot.bot_id}...`);
      const { data: transcriptData, error: transcriptError } = await meetingBaaSClient.getTranscript(bot.bot_id);

      if (transcriptError || !transcriptData) {
        console.warn(`[PollStuckBots] Transcript fetch failed for bot ${bot.bot_id}:`, transcriptError?.message || 'No data');
      } else if (transcriptData.text) {
        const formattedText = transcriptData.utterances?.length > 0
          ? formatUtterancesToTranscriptText(transcriptData.utterances)
          : transcriptData.text;
        console.log(`[PollStuckBots] Transcript fetched (${formattedText.length} chars, ${transcriptData.utterances?.length || 0} utterances)`);
        await supabase
          .from('recordings')
          .update({
            transcript_text: formattedText,
            transcript_json: {
              text: transcriptData.text,
              utterances: transcriptData.utterances || [],
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', bot.recording_id);
      } else {
        console.warn(`[PollStuckBots] Transcript response empty for bot ${bot.bot_id}`);
      }
    } catch (transcriptErr) {
      console.warn(`[PollStuckBots] Transcript fetch error for bot ${bot.bot_id}:`, transcriptErr);
      // Non-fatal — process-recording will try MeetingBaaS API and Gladia as fallback
    }

    // Trigger process-recording
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-recording`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recording_id: bot.recording_id,
        bot_id: bot.bot_id,
        audio_url: audioUrl,
        video_url: videoUrl,
      }),
    });

    if (!processResponse.ok) {
      const errText = await processResponse.text();
      console.error(`[PollStuckBots] process-recording failed for ${bot.recording_id}:`, errText);
      result.action = 'processing_triggered_with_error';
      result.error = errText;
    } else {
      console.log(`[PollStuckBots] process-recording triggered for ${bot.recording_id}`);
      result.action = 'processing_triggered';
    }

    return result;
  } catch (error) {
    console.error(`[PollStuckBots] Error processing bot ${bot.bot_id}:`, error);
    result.action = 'error';
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}

async function processFailedBot(
  supabase: ReturnType<typeof createClient>,
  bot: StuckBot,
  botData: Record<string, unknown>
): Promise<PollResult> {
  const errorMessage = (botData.error_message || botData.error || 'Bot failed (detected by polling)') as string;

  await supabase
    .from('bot_deployments')
    .update({
      status: 'failed',
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bot.deployment_id);

  await supabase
    .from('recordings')
    .update({
      status: 'failed',
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bot.recording_id);

  await supabase
    .from('meetings')
    .update({
      processing_status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('bot_id', bot.bot_id)
    .eq('source_type', '60_notetaker');

  return {
    bot_id: bot.bot_id,
    recording_id: bot.recording_id,
    previous_status: bot.deployment_status,
    new_status: 'failed',
    action: 'marked_failed',
    error: errorMessage,
  };
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    const preflightResponse = handleCorsPreflightRequest(req);
    if (preflightResponse) return preflightResponse;
    return new Response(null, { status: 204 });
  }

  try {
    // Authenticate — requires service role key or valid user JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization', req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Use service role for DB operations
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse optional params
    let specificBotId: string | null = null;
    let maxAgeHours = 24;
    let staleMinutes = 5;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        specificBotId = body.bot_id || null;
        maxAgeHours = body.max_age_hours ?? 24;
        staleMinutes = body.stale_minutes ?? 5;
      } catch {
        // No body or invalid JSON — use defaults
      }
    }

    // Initialize MeetingBaaS client
    const meetingBaaSClient = createMeetingBaaSClient();

    // Find stuck bots
    let query = supabase
      .from('bot_deployments')
      .select(`
        id,
        bot_id,
        recording_id,
        org_id,
        status,
        created_at,
        updated_at
      `)
      .not('status', 'in', '("completed","failed","cancelled")')
      .gte('created_at', new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true })
      .limit(20); // Process max 20 at a time

    if (specificBotId) {
      query = query.eq('bot_id', specificBotId);
    } else {
      // Only check bots that haven't been updated recently
      query = query.lte('updated_at', new Date(Date.now() - staleMinutes * 60 * 1000).toISOString());
    }

    const { data: stuckDeployments, error: queryError } = await query;

    if (queryError) {
      console.error('[PollStuckBots] Query error:', queryError);
      return errorResponse(`Database error: ${queryError.message}`, req, 500);
    }

    if (!stuckDeployments || stuckDeployments.length === 0) {
      console.log('[PollStuckBots] No stuck bots found');
      return jsonResponse({ message: 'No stuck bots found', results: [] }, req);
    }

    console.log(`[PollStuckBots] Found ${stuckDeployments.length} stuck bot(s)`);

    // Get recording user_ids for S3 upload path
    const recordingIds = stuckDeployments.map(d => d.recording_id).filter(Boolean);
    const { data: recordings } = await supabase
      .from('recordings')
      .select('id, user_id')
      .in('id', recordingIds);

    const recordingUserMap = new Map(
      (recordings || []).map(r => [r.id, r.user_id])
    );

    const results: PollResult[] = [];

    for (const deployment of stuckDeployments) {
      if (!deployment.bot_id) {
        console.warn(`[PollStuckBots] Deployment ${deployment.id} has no bot_id, skipping`);
        continue;
      }

      const userId = recordingUserMap.get(deployment.recording_id);
      if (!userId) {
        console.warn(`[PollStuckBots] No user_id found for recording ${deployment.recording_id}, skipping`);
        continue;
      }

      const bot: StuckBot = {
        bot_id: deployment.bot_id,
        deployment_id: deployment.id,
        recording_id: deployment.recording_id,
        org_id: deployment.org_id,
        user_id: userId,
        deployment_status: deployment.status,
        recording_status: '', // Not needed for processing
        created_at: deployment.created_at,
        updated_at: deployment.updated_at,
      };

      console.log(`[PollStuckBots] Checking bot ${bot.bot_id} (deployment: ${bot.deployment_status}, age: ${Math.round((Date.now() - new Date(bot.created_at).getTime()) / 60000)}min)`);

      // Call MeetingBaaS API to get current bot status
      const { data: botStatusData, error: apiError } = await meetingBaaSClient.getBotStatus(bot.bot_id);

      if (apiError) {
        console.error(`[PollStuckBots] API error for bot ${bot.bot_id}:`, apiError);
        results.push({
          bot_id: bot.bot_id,
          recording_id: bot.recording_id,
          previous_status: bot.deployment_status,
          new_status: bot.deployment_status,
          action: 'api_error',
          error: apiError.message,
        });
        continue;
      }

      if (!botStatusData) {
        console.warn(`[PollStuckBots] No data returned for bot ${bot.bot_id}`);
        continue;
      }

      const botStatus = (botStatusData as Record<string, unknown>).status as string;
      console.log(`[PollStuckBots] Bot ${bot.bot_id} MeetingBaaS status: ${botStatus}`);

      // Determine if the bot is in a terminal state
      const terminalStatuses = ['completed', 'done', 'ready', 'recording_done', 'ended'];
      const failedStatuses = ['failed', 'error', 'kicked', 'timeout'];

      if (terminalStatuses.some(s => botStatus?.toLowerCase().includes(s))) {
        console.log(`[PollStuckBots] Bot ${bot.bot_id} is completed, processing...`);
        const pollResult = await processCompletedBot(supabase, bot, botStatusData as Record<string, unknown>, meetingBaaSClient);
        results.push(pollResult);
      } else if (failedStatuses.some(s => botStatus?.toLowerCase().includes(s))) {
        console.log(`[PollStuckBots] Bot ${bot.bot_id} has failed, updating status...`);
        const pollResult = await processFailedBot(supabase, bot, botStatusData as Record<string, unknown>);
        results.push(pollResult);
      } else {
        // Bot is still active — just update the deployment status if changed
        console.log(`[PollStuckBots] Bot ${bot.bot_id} still active (status: ${botStatus}), updating timestamp`);

        // Map MeetingBaaS status to our deployment status
        let newDeploymentStatus = bot.deployment_status;
        let newRecordingStatus: string | null = null;
        if (botStatus === 'joining_call' || botStatus === 'in_waiting_room') {
          newDeploymentStatus = 'joining';
          newRecordingStatus = 'bot_joining';
        } else if (botStatus === 'in_call_recording' || botStatus === 'in_call_not_recording') {
          newDeploymentStatus = 'in_meeting';
          newRecordingStatus = 'recording';
        } else if (botStatus === 'call_ended') {
          newDeploymentStatus = 'leaving';
          newRecordingStatus = 'processing';
        }

        // Update deployment timestamp (prevents re-polling too soon)
        await supabase
          .from('bot_deployments')
          .update({
            status: newDeploymentStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', bot.deployment_id);

        if (newRecordingStatus && newRecordingStatus !== bot.recording_status) {
          await supabase
            .from('recordings')
            .update({
              status: newRecordingStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', bot.recording_id);
        }

        results.push({
          bot_id: bot.bot_id,
          recording_id: bot.recording_id,
          previous_status: bot.deployment_status,
          new_status: newDeploymentStatus,
          action: 'still_active',
        });
      }
    }

    const summary = {
      total_checked: results.length,
      processing_triggered: results.filter(r => r.action.startsWith('processing_triggered')).length,
      marked_failed: results.filter(r => r.action === 'marked_failed').length,
      still_active: results.filter(r => r.action === 'still_active').length,
      errors: results.filter(r => r.action === 'api_error' || r.action === 'error').length,
    };

    console.log('[PollStuckBots] Summary:', JSON.stringify(summary));

    return jsonResponse({ summary, results }, req);
  } catch (error) {
    console.error('[PollStuckBots] Unexpected error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      req,
      500
    );
  }
});

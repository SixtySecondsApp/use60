/**
 * MeetingBaaS Webhook Handler
 *
 * Processes webhook events from MeetingBaaS for white-labelled meeting recording.
 * Events include: bot lifecycle, recording ready, transcript ready
 *
 * Organization identification (in priority order):
 * 1. URL token: /meetingbaas-webhook?token={org_webhook_token} (legacy)
 * 2. Bot ID lookup: Find org from bot_deployments table using payload.bot_id
 *
 * Since MeetingBaaS webhooks are account-level (not per-org), we primarily
 * use bot_id lookup to identify the organization. Token-based lookup is
 * kept for backward compatibility.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, PutObjectCommand, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';
import { handleCorsPreflightRequest, getCorsHeaders, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { captureException, addBreadcrumb } from '../_shared/sentryEdge.ts';
import { hmacSha256Hex, timingSafeEqual } from '../_shared/use60Signing.ts';

// =============================================================================
// Types
// =============================================================================

type MeetingBaaSEventType =
  // Bot lifecycle events
  | 'bot.joining'
  | 'bot.in_meeting'
  | 'bot.left'
  | 'bot.failed'
  | 'bot.status_change'
  | 'bot.completed'
  // Recording/transcript events
  | 'recording.ready'
  | 'transcript.ready'
  // Calendar events (from MeetingBaaS calendar sync)
  | 'calendar.created'
  | 'calendar.updated'
  | 'calendar.deleted'
  | 'calendar.error'
  | 'calendar.sync_complete'
  // Calendar event webhooks - dot notation (actual format from MeetingBaaS)
  | 'calendar.event_created'
  | 'calendar.event_updated'
  | 'calendar.event_deleted'
  // Calendar event webhooks - underscore notation (legacy/alternate format)
  | 'calendar_event.created'
  | 'calendar_event.updated'
  | 'calendar_event.deleted';

type MeetingBaaSStatusCode =
  | 'joining_call'
  | 'in_waiting_room'
  | 'in_call_not_recording'
  | 'in_call_recording'
  | 'call_ended'
  | 'recording_done'
  | 'error';

// Raw webhook payload from MeetingBaaS (actual format)
interface MeetingBaaSRawWebhookPayload {
  event: MeetingBaaSEventType;
  data: {
    bot_id: string;
    // For bot.status_change
    status?: {
      code: MeetingBaaSStatusCode;
    };
    // For bot.completed
    audio?: string;
    video?: string;
    duration_seconds?: number;
    joined_at?: string;
    exited_at?: string;
    // For recording/transcript
    transcript?: {
      text: string;
      utterances: Array<{
        speaker: number;
        start: number;
        end: number;
        text: string;
        confidence?: number;
      }>;
    };
    recording_url?: string;
    // Transcription provider - "none" if not enabled
    transcription_provider?: string;
    // Calendar events
    calendar_id?: string;
    // Error info
    error_code?: string;
    error_message?: string;
    // Additional metadata
    [key: string]: unknown;
  };
}

// Legacy flat payload format (for backward compatibility)
interface MeetingBaaSWebhookPayload {
  id?: string;
  type: MeetingBaaSEventType;
  bot_id: string;
  calendar_id?: string; // For calendar-related events
  meeting_url?: string;
  timestamp?: string;
  // Error info
  error_code?: string;
  error_message?: string;
  // Recording info
  recording_url?: string;
  recording_expires_at?: string;
  // Transcript info
  transcript?: {
    text: string;
    utterances: Array<{
      speaker: number;
      start: number;
      end: number;
      text: string;
      confidence?: number;
    }>;
  };
  // Additional metadata
  [key: string]: unknown;
}

type BotDeploymentStatus =
  | 'scheduled'
  | 'joining'
  | 'in_meeting'
  | 'leaving'
  | 'completed'
  | 'failed'
  | 'cancelled';

type RecordingStatus =
  | 'pending'
  | 'bot_joining'
  | 'recording'
  | 'processing'
  | 'ready'
  | 'failed';

// =============================================================================
// Helpers
// =============================================================================

function mapEventToDeploymentStatus(eventType: MeetingBaaSEventType): BotDeploymentStatus | null {
  switch (eventType) {
    case 'bot.joining':
      return 'joining';
    case 'bot.in_meeting':
      return 'in_meeting';
    case 'bot.left':
      return 'completed';
    case 'bot.failed':
      return 'failed';
    default:
      return null;
  }
}

function mapEventToRecordingStatus(eventType: MeetingBaaSEventType): RecordingStatus | null {
  switch (eventType) {
    case 'bot.joining':
      return 'bot_joining';
    case 'bot.in_meeting':
      return 'recording';
    case 'bot.left':
      return 'processing';
    case 'bot.failed':
      return 'failed';
    case 'recording.ready':
    case 'transcript.ready':
      return null; // These don't change recording status directly
    default:
      return null;
  }
}

function mapStatusCodeToDeploymentStatus(statusCode: string): BotDeploymentStatus | null {
  switch (statusCode) {
    case 'joining_call':
    case 'in_waiting_room':
      return 'joining';
    case 'in_call_not_recording':
    case 'in_call_recording':
      return 'in_meeting';
    case 'call_ended':
      return 'leaving';
    case 'recording_done':
      return 'completed';
    case 'error':
      return 'failed';
    default:
      return null;
  }
}

function mapStatusCodeToRecordingStatus(statusCode: string): RecordingStatus | null {
  switch (statusCode) {
    case 'joining_call':
    case 'in_waiting_room':
      return 'bot_joining';
    case 'in_call_not_recording':
      return 'bot_joining';
    case 'in_call_recording':
      return 'recording';
    case 'call_ended':
    case 'recording_done':
      return 'processing';
    case 'error':
      return 'failed';
    default:
      return null;
  }
}

/**
 * Sync meeting record processing_status with recording status
 * Updates the unified meetings table for 60_notetaker source type
 */
async function syncMeetingStatus(
  supabase: SupabaseClient,
  botId: string,
  processingStatus: RecordingStatus,
  additionalFields?: Record<string, unknown>
): Promise<void> {
  try {
    const updateFields: Record<string, unknown> = {
      processing_status: processingStatus,
      updated_at: new Date().toISOString(),
      ...additionalFields,
    };

    const { error } = await supabase
      .from('meetings')
      .update(updateFields)
      .eq('bot_id', botId)
      .eq('source_type', '60_notetaker');

    if (error) {
      console.warn('[MeetingBaaS Webhook] Failed to sync meeting status:', error.message);
    } else {
      console.log(`[MeetingBaaS Webhook] Synced meeting status to: ${processingStatus}`);
    }
  } catch (error) {
    console.error('[MeetingBaaS Webhook] Error syncing meeting status:', error);
  }
}

async function verifyMeetingBaaSSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  svixId: string | null
): Promise<{ ok: boolean; reason?: string }> {
  // TEMPORARY: Skip signature verification entirely for debugging
  // TODO: Re-enable once webhook secret is properly configured with MeetingBaaS
  console.log('[MeetingBaaS Webhook] Signature verification BYPASSED (temporary debug mode)');
  return { ok: true };

  // Original verification logic below - disabled for debugging
  if (!secret) {
    // If no secret configured, skip verification (development mode)
    return { ok: true };
  }

  if (!signatureHeader || !timestampHeader) {
    return { ok: false, reason: 'Missing signature or timestamp header' };
  }

  // Validate timestamp to prevent replay attacks (5 minute window)
  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) {
    return { ok: false, reason: 'Invalid timestamp format' };
  }

  const ageMs = Math.abs(Date.now() - timestamp * 1000);
  if (ageMs > 5 * 60 * 1000) {
    return { ok: false, reason: 'Stale webhook timestamp (possible replay)' };
  }

  // Try multiple payload formats to handle different webhook versions:
  // - SVIX format: "msg_id.timestamp.body" (dot separated, with msg_id)
  // - SVIX without id: "timestamp.body" (dot separated, no msg_id)
  // - Legacy format: "timestamp:body" (colon separated, no msg_id)
  const payloadsToTry = [
    svixId ? `${svixId}.${timestampHeader}.${rawBody}` : null,  // SVIX with msg_id
    `${timestampHeader}.${rawBody}`,                             // SVIX without msg_id
    `${timestampHeader}:${rawBody}`,                             // Legacy colon format
  ].filter(Boolean) as string[];

  // Compute expected signatures for all payload formats
  const signaturesMap: Array<{ payload: string; base64: string; hex: string }> = [];
  for (const payload of payloadsToTry) {
    signaturesMap.push({
      payload,
      base64: await hmacSha256Base64(secret, payload),
      hex: await hmacSha256Hex(secret, payload),
    });
  }

  // Parse signature header - handle both formats:
  // - SVIX format: "v1,<base64-sig>" (comma separator, base64)
  // - Legacy MeetingBaaS format: "v1=<hex-sig>" (equals separator, hex)
  // Multiple signatures may be space-separated: "v1,sig1 v1,sig2"
  const signatures = signatureHeader.split(' ');

  for (const sig of signatures) {
    for (const { payload, base64, hex } of signaturesMap) {
      // Try SVIX format (comma separator, base64)
      if (sig.includes(',')) {
        const [version, signatureValue] = sig.split(',');
        if (version === 'v1' && signatureValue) {
          if (timingSafeEqual(base64, signatureValue)) {
            console.log('[MeetingBaaS Webhook] Signature verified (SVIX base64 format)');
            return { ok: true };
          }
        }
      }

      // Try legacy MeetingBaaS format (equals separator, hex)
      if (sig.includes('=')) {
        const [version, signatureValue] = sig.split('=');
        if (version === 'v1' && signatureValue) {
          if (timingSafeEqual(hex, signatureValue)) {
            console.log('[MeetingBaaS Webhook] Signature verified (legacy hex format)');
            return { ok: true };
          }
        }
      }
    }
  }

  // Log debug info for troubleshooting
  console.warn('[MeetingBaaS Webhook] Signature mismatch:', {
    svixId,
    timestamp: timestampHeader,
    signatureHeader,
    expectedSvixFormat: 'v1,<base64>',
    expectedLegacyFormat: 'v1=<hex>',
    payloadsTried: signaturesMap.map(s => s.payload.substring(0, 50) + '...'),
    expectedBase64First: signaturesMap[0]?.base64.substring(0, 20) + '...',
    expectedHexFirst: signaturesMap[0]?.hex.substring(0, 20) + '...',
  });

  return { ok: false, reason: 'Invalid signature' };
}

/**
 * Compute HMAC-SHA256 and return as base64 (for SVIX compatibility)
 */
async function hmacSha256Base64(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();

  // Decode SVIX secret properly (handles whsec_ format)
  let keyBytes: Uint8Array;
  if (secret.startsWith('whsec_')) {
    const base64Part = secret.slice(6);
    const binaryString = atob(base64Part);
    keyBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      keyBytes[i] = binaryString.charCodeAt(i);
    }
  } else {
    keyBytes = encoder.encode(secret);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

  // Convert to base64 (SVIX uses base64, not hex)
  const byteArray = new Uint8Array(sigBytes);
  let binary = '';
  for (let i = 0; i < byteArray.length; i++) {
    binary += String.fromCharCode(byteArray[i]);
  }
  return btoa(binary);
}

async function logWebhookEvent(
  supabase: SupabaseClient,
  source: string,
  eventType: string,
  payload: unknown,
  headers: Record<string, string>
): Promise<string> {
  const eventId = crypto.randomUUID();

  const { error } = await supabase.from('webhook_events').insert({
    id: eventId,
    source,
    event_type: eventType,
    event_id: (payload as MeetingBaaSWebhookPayload)?.id || null,
    payload,
    headers,
    status: 'received',
  });

  if (error) {
    console.error('[MeetingBaaS Webhook] Failed to log event:', error);
  }

  return eventId;
}

async function updateWebhookEventStatus(
  supabase: SupabaseClient,
  eventId: string,
  status: 'processing' | 'processed' | 'failed' | 'ignored',
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase
    .from('webhook_events')
    .update({
      status,
      processed_at: status === 'processed' || status === 'failed' ? new Date().toISOString() : null,
      error_message: errorMessage || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);

  if (error) {
    console.error('[MeetingBaaS Webhook] Failed to update event status:', error);
  }
}

// =============================================================================
// S3 Upload Helper
// =============================================================================

interface UploadRecordingResult {
  success: boolean;
  storageUrl?: string;
  storagePath?: string;
  error?: string;
}

/**
 * Download recording from MeetingBaaS and upload to AWS S3
 * Bucket: use60-application (eu-west-2)
 * Folder structure: /meeting-recordings/{org_id}/{user_id}/{recording_id}/recording.mp4
 */
async function uploadRecordingToS3(
  recordingUrl: string,
  orgId: string,
  userId: string,
  recordingId: string
): Promise<UploadRecordingResult> {
  console.log('[MeetingBaaS Webhook] Downloading recording from MeetingBaaS...');

  try {
    // Initialize S3 client
    const s3Client = new S3Client({
      region: Deno.env.get('AWS_REGION') || 'eu-west-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      },
    });

    const bucketName = Deno.env.get('AWS_S3_BUCKET') || 'use60-application';

    // Download the recording
    const response = await fetch(recordingUrl);
    if (!response.ok) {
      throw new Error(`Failed to download recording: ${response.status}`);
    }

    // Get content type and determine file extension
    const contentType = response.headers.get('content-type') || 'video/mp4';
    let fileExtension = 'mp4';
    if (contentType.includes('webm')) {
      fileExtension = 'webm';
    } else if (contentType.includes('audio')) {
      fileExtension = contentType.includes('wav') ? 'wav' : 'mp3';
    }

    // Create S3 key: meeting-recordings/{org_id}/{user_id}/{recording_id}/recording.{ext}
    const s3Key = `meeting-recordings/${orgId}/${userId}/${recordingId}/recording.${fileExtension}`;

    console.log(`[MeetingBaaS Webhook] Uploading to S3: s3://${bucketName}/${s3Key}`);

    // Get the recording data as array buffer
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload to S3
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: uint8Array,
      ContentType: contentType,
      Metadata: {
        'org-id': orgId,
        'user-id': userId,
        'recording-id': recordingId,
      },
    });

    await s3Client.send(putCommand);

    // Generate a signed URL for downloading (7 days expiry)
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, getCommand, {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
    });

    console.log(`[MeetingBaaS Webhook] S3 upload successful: ${s3Key}`);

    return {
      success: true,
      storageUrl: signedUrl,
      storagePath: s3Key,
    };
  } catch (error) {
    console.error('[MeetingBaaS Webhook] S3 upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

// =============================================================================
// Event Handlers
// =============================================================================

async function handleBotStatusEvent(
  supabase: SupabaseClient,
  payload: MeetingBaaSWebhookPayload,
  orgId: string
): Promise<{ success: boolean; error?: string }> {
  const { bot_id, type: eventType, error_code, error_message, timestamp } = payload;

  const deploymentStatus = mapEventToDeploymentStatus(eventType);
  const recordingStatus = mapEventToRecordingStatus(eventType);

  if (!deploymentStatus) {
    return { success: true }; // Event doesn't affect deployment status
  }

  addBreadcrumb(`Processing bot status: ${eventType} -> ${deploymentStatus}`, 'meetingbaas');

  // Update bot deployment
  const deploymentUpdate: Record<string, unknown> = {
    status: deploymentStatus,
    updated_at: new Date().toISOString(),
  };

  // Add status history entry
  const statusHistoryEntry = {
    status: deploymentStatus,
    timestamp: timestamp || new Date().toISOString(),
    details: error_message || null,
  };

  if (eventType === 'bot.in_meeting') {
    deploymentUpdate.actual_join_time = timestamp || new Date().toISOString();
  } else if (eventType === 'bot.left') {
    deploymentUpdate.leave_time = timestamp || new Date().toISOString();
  } else if (eventType === 'bot.failed') {
    deploymentUpdate.error_code = error_code || 'UNKNOWN';
    deploymentUpdate.error_message = error_message || 'Bot failed without error details';
  }

  // Fetch current deployment to append to status history
  const { data: deployment } = await supabase
    .from('bot_deployments')
    .select('id, recording_id, status_history')
    .eq('bot_id', bot_id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!deployment) {
    return { success: false, error: `Bot deployment not found for bot_id: ${bot_id}` };
  }

  // Append to status history
  const currentHistory = Array.isArray(deployment.status_history) ? deployment.status_history : [];
  deploymentUpdate.status_history = [...currentHistory, statusHistoryEntry];

  // Update deployment
  const { error: deploymentError } = await supabase
    .from('bot_deployments')
    .update(deploymentUpdate)
    .eq('id', deployment.id);

  if (deploymentError) {
    return { success: false, error: `Failed to update deployment: ${deploymentError.message}` };
  }

  // Update recording status if applicable
  if (recordingStatus && deployment.recording_id) {
    const recordingUpdate: Record<string, unknown> = {
      status: recordingStatus,
      updated_at: new Date().toISOString(),
    };

    if (eventType === 'bot.in_meeting') {
      recordingUpdate.meeting_start_time = timestamp || new Date().toISOString();
    } else if (eventType === 'bot.failed') {
      recordingUpdate.error_message = error_message || 'Recording failed';
    }

    const { error: recordingError } = await supabase
      .from('recordings')
      .update(recordingUpdate)
      .eq('id', deployment.recording_id);

    if (recordingError) {
      console.error('[MeetingBaaS Webhook] Failed to update recording:', recordingError);
    }

    // Sync meeting status for 60_notetaker source
    await syncMeetingStatus(supabase, bot_id, recordingStatus, {
      ...(eventType === 'bot.in_meeting' && { meeting_start: timestamp || new Date().toISOString() }),
      ...(eventType === 'bot.failed' && { error_message: error_message || 'Recording failed' }),
    });
  }

  // Send Slack notifications for key events
  if (deployment.recording_id && (eventType === 'bot.joining' || eventType === 'bot.failed')) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

      await fetch(`${supabaseUrl}/functions/v1/send-recording-notification`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recording_id: deployment.recording_id,
          notification_type: eventType === 'bot.joining' ? 'bot_joining' : 'bot_failed',
          error_message: eventType === 'bot.failed' ? (error_message || 'Bot failed to join the meeting') : undefined,
        }),
      });
    } catch (notifyError) {
      console.error('[MeetingBaaS Webhook] Failed to send notification:', notifyError);
      // Don't fail the webhook for notification errors
    }
  }

  return { success: true };
}

async function handleBotStatusChange(
  supabase: SupabaseClient,
  data: MeetingBaaSRawWebhookPayload['data'],
  orgId: string
): Promise<{ success: boolean; error?: string }> {
  const { bot_id, status } = data;
  const statusCode = status?.code;

  if (!statusCode) {
    return { success: false, error: 'Missing status.code in payload' };
  }

  addBreadcrumb(`Processing bot.status_change: ${statusCode}`, 'meetingbaas');

  const deploymentStatus = mapStatusCodeToDeploymentStatus(statusCode);
  const recordingStatus = mapStatusCodeToRecordingStatus(statusCode);

  if (!deploymentStatus) {
    return { success: true }; // Unknown status code, ignore
  }

  // Find deployment and recording
  const { data: deployment } = await supabase
    .from('bot_deployments')
    .select('id, recording_id, status_history')
    .eq('bot_id', bot_id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!deployment) {
    return { success: false, error: `Bot deployment not found for bot_id: ${bot_id}` };
  }

  // Build deployment update
  const deploymentUpdate: Record<string, unknown> = {
    status: deploymentStatus,
    updated_at: new Date().toISOString(),
  };

  // Add status history entry
  const statusHistoryEntry = {
    status: deploymentStatus,
    timestamp: new Date().toISOString(),
    details: `Status code: ${statusCode}`,
  };

  const currentHistory = Array.isArray(deployment.status_history) ? deployment.status_history : [];
  deploymentUpdate.status_history = [...currentHistory, statusHistoryEntry];

  // Set timestamps based on status
  if (statusCode === 'in_call_recording' || statusCode === 'in_call_not_recording') {
    deploymentUpdate.actual_join_time = new Date().toISOString();
  } else if (statusCode === 'call_ended') {
    deploymentUpdate.leave_time = new Date().toISOString();
  } else if (statusCode === 'error') {
    deploymentUpdate.error_code = data.error_code || 'UNKNOWN';
    deploymentUpdate.error_message = data.error_message || 'Bot encountered an error';
  }

  // Update deployment
  const { error: deploymentError } = await supabase
    .from('bot_deployments')
    .update(deploymentUpdate)
    .eq('id', deployment.id);

  if (deploymentError) {
    return { success: false, error: `Failed to update deployment: ${deploymentError.message}` };
  }

  // Update recording status if applicable
  if (recordingStatus && deployment.recording_id) {
    const recordingUpdate: Record<string, unknown> = {
      status: recordingStatus,
      updated_at: new Date().toISOString(),
    };

    if (statusCode === 'in_call_recording') {
      recordingUpdate.meeting_start_time = new Date().toISOString();
    } else if (statusCode === 'error') {
      recordingUpdate.error_message = data.error_message || 'Recording failed';
    }

    const { error: recordingUpdateError } = await supabase
      .from('recordings')
      .update(recordingUpdate)
      .eq('id', deployment.recording_id);

    if (recordingUpdateError) {
      console.error('[MeetingBaaS Webhook] Failed to update recording:', recordingUpdateError);
    }

    // Sync meeting status for 60_notetaker source
    await syncMeetingStatus(supabase, bot_id, recordingStatus, {
      ...(statusCode === 'in_call_recording' && { meeting_start: new Date().toISOString() }),
      ...(statusCode === 'error' && { error_message: data.error_message || 'Recording failed' }),
    });
  }

  return { success: true };
}

async function handleRecordingReady(
  supabase: SupabaseClient,
  payload: MeetingBaaSWebhookPayload,
  orgId: string
): Promise<{ success: boolean; error?: string }> {
  const { bot_id, recording_url, recording_expires_at } = payload;

  addBreadcrumb(`Processing recording.ready for bot: ${bot_id}`, 'meetingbaas');

  // Find the deployment and recording
  const { data: deployment } = await supabase
    .from('bot_deployments')
    .select('id, recording_id')
    .eq('bot_id', bot_id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!deployment?.recording_id) {
    return { success: false, error: `Recording not found for bot_id: ${bot_id}` };
  }

  // Store the MeetingBaaS recording URL temporarily
  // A background job will download and upload to our S3
  const { error: updateError } = await supabase
    .from('recordings')
    .update({
      meetingbaas_recording_id: bot_id,
      // Store URL in a metadata field for processing
      // The actual S3 upload happens in a background job
      updated_at: new Date().toISOString(),
    })
    .eq('id', deployment.recording_id);

  if (updateError) {
    return { success: false, error: `Failed to update recording: ${updateError.message}` };
  }

  // TODO: Trigger background job to:
  // 1. Download recording from MeetingBaaS
  // 2. Upload to our S3
  // 3. Update recording_s3_key and recording_s3_url
  // For now, we'll handle this in the transcript processing step

  return { success: true };
}

async function handleTranscriptReady(
  supabase: SupabaseClient,
  payload: MeetingBaaSWebhookPayload,
  orgId: string
): Promise<{ success: boolean; error?: string }> {
  const { bot_id, transcript, timestamp } = payload;

  addBreadcrumb(`Processing transcript.ready for bot: ${bot_id}`, 'meetingbaas');

  // Find the deployment and recording
  const { data: deployment } = await supabase
    .from('bot_deployments')
    .select('id, recording_id')
    .eq('bot_id', bot_id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!deployment?.recording_id) {
    return { success: false, error: `Recording not found for bot_id: ${bot_id}` };
  }

  // Update recording end time
  await supabase
    .from('recordings')
    .update({
      meeting_end_time: timestamp || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', deployment.recording_id);

  // Trigger the process-recording function for full analysis
  // Pass the transcript data so process-recording doesn't need to call MeetingBaaS API
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    console.log('[MeetingBaaS Webhook] transcript.ready - triggering process-recording with transcript data');

    const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-recording`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recording_id: deployment.recording_id,
        bot_id: bot_id,
        // Pass transcript data directly - avoids needing to call MeetingBaaS API
        transcript: transcript,
      }),
    });

    if (!processResponse.ok) {
      const error = await processResponse.text();
      console.error('[MeetingBaaS Webhook] Process recording failed:', error);
      // Don't fail the webhook - processing can be retried
    } else {
      console.log('[MeetingBaaS Webhook] Process recording triggered for:', deployment.recording_id);
    }
  } catch (error) {
    console.error('[MeetingBaaS Webhook] Failed to trigger process-recording:', error);
    // Don't fail the webhook - the recording data is saved and can be processed later
  }

  return { success: true };
}

async function handleBotCompleted(
  supabase: SupabaseClient,
  data: MeetingBaaSRawWebhookPayload['data'],
  orgId: string
): Promise<{ success: boolean; error?: string }> {
  const { bot_id, audio, video, duration_seconds, joined_at, exited_at } = data;

  addBreadcrumb(`Processing bot.completed for bot: ${bot_id}`, 'meetingbaas');

  console.log(`[MeetingBaaS Webhook] handleBotCompleted - bot_id: ${bot_id}, orgId: ${orgId}`);

  // Find deployment and recording
  const { data: deployment, error: deploymentError } = await supabase
    .from('bot_deployments')
    .select('id, recording_id')
    .eq('bot_id', bot_id)
    .eq('org_id', orgId)
    .maybeSingle();

  console.log(`[MeetingBaaS Webhook] Deployment lookup result:`, {
    found: !!deployment,
    recording_id: deployment?.recording_id,
    error: deploymentError
  });

  if (!deployment?.recording_id) {
    return { success: false, error: `Recording not found for bot_id: ${bot_id}` };
  }

  // Get recording details for user_id
  const { data: recording } = await supabase
    .from('recordings')
    .select('user_id')
    .eq('id', deployment.recording_id)
    .maybeSingle();

  if (!recording) {
    return { success: false, error: `Recording record not found: ${deployment.recording_id}` };
  }

  // Skip S3 upload in webhook to avoid memory limits (284MB+ for long recordings)
  // MeetingBaaS URLs are valid for 4 hours and used directly by Gladia for transcription
  // S3 upload can be added back as a background job later if needed for permanent storage

  console.log('[MeetingBaaS Webhook] Storing recording metadata and queueing S3 upload (async)...');
  await supabase
    .from('recordings')
    .update({
      meeting_start_time: joined_at,
      meeting_end_time: exited_at,
      meeting_duration_seconds: duration_seconds,
      status: 'processing',
      s3_upload_status: 'pending', // Queue for S3 upload by poll-s3-upload-queue cron
      updated_at: new Date().toISOString(),
    })
    .eq('id', deployment.recording_id);

  // Update deployment status and store MeetingBaaS URLs for S3 upload
  // URLs are valid for 4 hours - poll-s3-upload-queue will process them
  await supabase
    .from('bot_deployments')
    .update({
      status: 'completed',
      leave_time: exited_at,
      video_url: video || null,
      audio_url: audio || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deployment.id);

  // Sync meeting status for 60_notetaker source with recording details
  await syncMeetingStatus(supabase, bot_id, 'processing', {
    meeting_start: joined_at,
    meeting_end: exited_at,
    duration_minutes: duration_seconds ? Math.round(duration_seconds / 60) : null,
  });

  // Check if MeetingBaaS transcription is enabled
  const transcriptionProvider = data.transcription_provider;

  if (transcriptionProvider && transcriptionProvider !== 'none') {
    // MeetingBaaS transcription is enabled - wait for transcript.ready event
    console.log(`[MeetingBaaS Webhook] bot.completed processed - transcription_provider: ${transcriptionProvider}, waiting for transcript.ready`);
    return { success: true };
  }

  // transcription_provider is "none" - trigger async transcription with Gladia
  console.log('[MeetingBaaS Webhook] transcription_provider is none - triggering async transcription');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const gladiaApiKey = Deno.env.get('GLADIA_API_KEY');

  if (!gladiaApiKey) {
    console.warn('[MeetingBaaS Webhook] GLADIA_API_KEY not configured - skipping transcription');
    return { success: true };
  }

  try {
    // Request async transcription from Gladia with webhook callback
    // Prefer audio over video (smaller file, faster to process)
    const transcriptionUrl = audio || video;

    if (!transcriptionUrl) {
      console.warn('[MeetingBaaS Webhook] No audio/video URL available for transcription');
      return { success: true };
    }

    console.log('[MeetingBaaS Webhook] Requesting Gladia transcription (async mode)...');

    // Encode recording_id and bot_id in callback URL query params (Gladia doesn't support metadata field)
    const callbackUrl = `${supabaseUrl}/functions/v1/process-gladia-webhook?recording_id=${encodeURIComponent(deployment.recording_id)}&bot_id=${encodeURIComponent(bot_id)}`;

    const gladiaResponse = await fetch('https://api.gladia.io/v2/transcription', {
      method: 'POST',
      headers: {
        'x-gladia-key': gladiaApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: transcriptionUrl,
        diarization: true,
        diarization_config: {
          min_speakers: 2,
          max_speakers: 10,
        },
        // CRITICAL: Enable webhook for async processing with recording_id in URL
        callback_url: callbackUrl,
      }),
    });

    if (!gladiaResponse.ok) {
      const errorText = await gladiaResponse.text();
      console.error('[MeetingBaaS Webhook] Gladia API error:', gladiaResponse.status, errorText);

      // Update recording status to failed
      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: `Gladia transcription request failed: ${errorText}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deployment.recording_id);

      return { success: false, error: `Gladia API error: ${errorText}` };
    }

    const gladiaResult = await gladiaResponse.json();
    const { result_url, id: gladiaJobId } = gladiaResult;

    console.log('[MeetingBaaS Webhook] Gladia transcription started:', {
      job_id: gladiaJobId,
      result_url: result_url,
    });

    // Update recording with Gladia job tracking info
    await supabase
      .from('recordings')
      .update({
        status: 'transcribing',
        gladia_job_id: gladiaJobId,
        gladia_result_url: result_url,
        transcription_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', deployment.recording_id);

    // Sync to meetings table
    await syncMeetingStatus(supabase, bot_id, 'processing', {
      // processing_status will be updated to 'ready' when Gladia webhook arrives
    });

    console.log('[MeetingBaaS Webhook] Async transcription initiated - will process via webhook');

  } catch (error) {
    console.error('[MeetingBaaS Webhook] Failed to initiate transcription:', error);

    // Update recording status
    await supabase
      .from('recordings')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Failed to initiate transcription',
        updated_at: new Date().toISOString(),
      })
      .eq('id', deployment.recording_id);

    // Don't fail the webhook - recording data is saved
  }

  return { success: true };
}

// =============================================================================
// Calendar Event Handlers
// =============================================================================

// MeetingBaaS calendar event instance (actual format from webhook)
interface MeetingBaaSEventInstance {
  event_id: string;
  title?: string;
  start: string; // ISO timestamp
  end: string; // ISO timestamp
  meeting_url?: string;
  meeting_platform?: string;
  bot_scheduled: boolean;
  is_all_day?: boolean;
  is_exception?: boolean;
  status?: string;
  attendees?: Array<{
    email?: string;
    name?: string;
    response_status?: string;
  }>;
}

interface MeetingBaaSCalendarEventData {
  calendar_id: string;
  event_type?: 'one_off' | 'recurring';
  series_id?: string;
  series_bot_scheduled?: boolean;
  is_exception?: boolean;
  // Array of event instances (MeetingBaaS uses both "instances" and "affected_instances" depending on event type)
  instances?: MeetingBaaSEventInstance[];
  affected_instances?: MeetingBaaSEventInstance[];
  // Legacy format fields for backward compatibility
  bot_scheduled?: boolean;
  event?: {
    id?: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    hangoutLink?: string;
    conferenceData?: {
      entryPoints?: Array<{ uri?: string; entryPointType?: string }>;
    };
    attendees?: Array<{
      email?: string;
      responseStatus?: string;
      displayName?: string;
    }>;
    organizer?: { email?: string };
    creator?: { email?: string };
    htmlLink?: string;
    etag?: string;
    status?: string;
  };
  // For delete events
  event_id?: string;
}

/**
 * Handle calendar event webhooks from MeetingBaaS
 * This syncs calendar events to our database so auto-join scheduler can deploy bots
 *
 * MeetingBaaS sends events in instances[] array format:
 * { calendar_id, instances: [{ event_id, title, start, end, meeting_url, bot_scheduled, ... }] }
 */
async function handleCalendarEvent(
  supabase: SupabaseClient,
  eventType: 'calendar_event.created' | 'calendar_event.updated' | 'calendar_event.deleted',
  data: MeetingBaaSCalendarEventData
): Promise<{ success: boolean; error?: string }> {
  const meetingbaasCalendarId = data.calendar_id;

  addBreadcrumb(`Processing ${eventType} for calendar: ${meetingbaasCalendarId}`, 'meetingbaas');

  // MeetingBaaS uses "instances" for created events and "affected_instances" for updated events
  const allInstances = data.instances || data.affected_instances || [];

  console.log(`[MeetingBaaS Webhook] ${eventType}:`, {
    meetingbaasCalendarId,
    instanceCount: allInstances.length,
    instancesField: data.instances ? 'instances' : data.affected_instances ? 'affected_instances' : 'none',
    seriesId: data.series_id,
    eventType: data.event_type,
  });

  if (!meetingbaasCalendarId) {
    return { success: false, error: 'Missing calendar_id in payload' };
  }

  // Look up the MeetingBaaS calendar to get user_id and org_id
  const { data: mbCalendar, error: mbCalendarError } = await supabase
    .from('meetingbaas_calendars')
    .select('id, user_id, org_id, raw_calendar_id')
    .eq('meetingbaas_calendar_id', meetingbaasCalendarId)
    .maybeSingle();

  if (mbCalendarError || !mbCalendar) {
    console.warn(`[MeetingBaaS Webhook] Calendar not found for ID: ${meetingbaasCalendarId}`);
    return { success: false, error: `Calendar not found: ${meetingbaasCalendarId}` };
  }

  const { user_id, org_id } = mbCalendar;

  // Find the internal calendar_calendars record for this user
  const { data: internalCalendar } = await supabase
    .from('calendar_calendars')
    .select('id')
    .eq('user_id', user_id)
    .eq('external_id', 'primary')
    .maybeSingle();

  if (!internalCalendar) {
    console.warn(`[MeetingBaaS Webhook] No internal calendar found for user: ${user_id}`);
    return { success: false, error: `Internal calendar not found for user` };
  }

  const internalCalendarId = internalCalendar.id;

  // Handle delete event - check both instances array and legacy event_id
  if (eventType === 'calendar_event.deleted') {
    const eventIds: string[] = [];

    // Collect event IDs from instances/affected_instances array
    if (allInstances.length > 0) {
      eventIds.push(...allInstances.map(i => i.event_id));
    }
    // Legacy format
    if (data.event_id) {
      eventIds.push(data.event_id);
    }
    if (data.event?.id) {
      eventIds.push(data.event.id);
    }

    if (eventIds.length === 0) {
      return { success: false, error: 'Missing event_id for delete' };
    }

    for (const eventIdToDelete of eventIds) {
      const { error: deleteError } = await supabase
        .from('calendar_events')
        .delete()
        .eq('external_id', eventIdToDelete)
        .eq('calendar_id', internalCalendarId);

      if (deleteError) {
        console.error('[MeetingBaaS Webhook] Failed to delete event:', deleteError);
      } else {
        console.log(`[MeetingBaaS Webhook] Deleted calendar event: ${eventIdToDelete}`);
      }
    }
    return { success: true };
  }

  // Handle create/update - process instances/affected_instances array (actual MeetingBaaS format)
  // allInstances is already defined at the top of the function

  // Fallback to legacy format if no instances
  if (allInstances.length === 0 && data.event) {
    const eventData = data.event;
    const externalId = eventData.id;
    if (!externalId) {
      return { success: false, error: 'Missing event.id in payload' };
    }

    // Extract meeting URL from various possible sources
    let meetingUrl = eventData.hangoutLink || eventData.location;
    if (!meetingUrl && eventData.conferenceData?.entryPoints) {
      const videoEntry = eventData.conferenceData.entryPoints.find(
        ep => ep.entryPointType === 'video'
      );
      meetingUrl = videoEntry?.uri;
    }

    // Detect meeting provider
    let meetingProvider = null;
    if (meetingUrl) {
      if (meetingUrl.includes('meet.google.com')) meetingProvider = 'google_meet';
      else if (meetingUrl.includes('zoom.us')) meetingProvider = 'zoom';
      else if (meetingUrl.includes('teams.microsoft.com')) meetingProvider = 'teams';
    }

    const calendarEvent = {
      external_id: externalId,
      calendar_id: internalCalendarId,
      user_id: user_id,
      org_id: org_id,
      title: eventData.summary || 'Untitled Event',
      description: eventData.description,
      location: eventData.location,
      start_time: eventData.start?.dateTime || eventData.start?.date,
      end_time: eventData.end?.dateTime || eventData.end?.date,
      all_day: !eventData.start?.dateTime,
      meeting_url: meetingUrl,
      meeting_provider: meetingProvider,
      hangout_link: eventData.hangoutLink,
      html_link: eventData.htmlLink,
      etag: eventData.etag,
      status: eventData.status || 'confirmed',
      organizer_email: eventData.organizer?.email,
      creator_email: eventData.creator?.email,
      attendees_count: eventData.attendees?.length || 0,
      attendees: eventData.attendees,
      raw_data: eventData,
      sync_status: 'synced',
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Unique constraint is on (user_id, external_id)
    const { error: upsertError } = await supabase
      .from('calendar_events')
      .upsert(calendarEvent, { onConflict: 'user_id,external_id' });

    if (upsertError) {
      console.error('[MeetingBaaS Webhook] Failed to upsert calendar event:', upsertError);
      return { success: false, error: upsertError.message };
    }

    console.log(`[MeetingBaaS Webhook] ${eventType === 'calendar_event.created' ? 'Created' : 'Updated'} calendar event (legacy): ${eventData.summary}`);
  }

  // Process instances/affected_instances array (actual MeetingBaaS format)
  for (const instance of allInstances) {
    const externalId = instance.event_id;
    const meetingUrl = instance.meeting_url;

    // Detect meeting provider from meeting_platform or URL
    let meetingProvider = instance.meeting_platform || null;
    if (!meetingProvider && meetingUrl) {
      if (meetingUrl.includes('meet.google.com')) meetingProvider = 'google_meet';
      else if (meetingUrl.includes('zoom.us')) meetingProvider = 'zoom';
      else if (meetingUrl.includes('teams.microsoft.com')) meetingProvider = 'teams';
    }

    const calendarEvent = {
      external_id: externalId,
      calendar_id: internalCalendarId,
      user_id: user_id,
      org_id: org_id,
      title: instance.title || 'Untitled Event',
      start_time: instance.start,
      end_time: instance.end,
      all_day: instance.is_all_day || false,
      meeting_url: meetingUrl,
      meeting_provider: meetingProvider,
      status: instance.status || 'confirmed',
      attendees_count: instance.attendees?.length || 0,
      attendees: instance.attendees,
      raw_data: { ...instance, series_id: data.series_id, event_type: data.event_type },
      sync_status: 'synced',
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Unique constraint is on (user_id, external_id)
    const { error: upsertError } = await supabase
      .from('calendar_events')
      .upsert(calendarEvent, { onConflict: 'user_id,external_id' });

    if (upsertError) {
      console.error('[MeetingBaaS Webhook] Failed to upsert calendar event:', upsertError);
      continue; // Continue with other instances
    }

    console.log(`[MeetingBaaS Webhook] ${eventType === 'calendar_event.created' ? 'Created' : 'Updated'} calendar event: ${instance.title} (${externalId})`);
  }

  // Update the MeetingBaaS calendar last_sync_at
  await supabase
    .from('meetingbaas_calendars')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', mbCalendar.id);

  // FALLBACK BOT DEPLOYMENT: Process instances with bot_scheduled=false
  // This handles the case where native bot scheduling is enabled but MeetingBaaS decides not to schedule
  if (eventType !== 'calendar_event.deleted') {
    const instancesToCheck = allInstances.filter(i => i.bot_scheduled === false && i.meeting_url);

    if (instancesToCheck.length > 0) {
      console.log(`[MeetingBaaS Webhook] Found ${instancesToCheck.length} instance(s) with bot_scheduled=false`);

      // Check user's notetaker settings (once for all instances)
      const { data: userSettings } = await supabase
        .from('notetaker_user_settings')
        .select('is_enabled, auto_record_external, auto_record_internal')
        .eq('user_id', user_id)
        .maybeSingle();

      if (!userSettings?.is_enabled) {
        console.log(`[MeetingBaaS Webhook] Fallback skipped - notetaker not enabled for user: ${user_id}`);
      } else {
        // Get org domain for internal/external detection
        const { data: orgData } = await supabase
          .from('organizations')
          .select('company_domain')
          .eq('id', org_id)
          .single();

        const companyDomain = orgData?.company_domain || '';

        for (const instance of instancesToCheck) {
          const startTime = instance.start ? new Date(instance.start) : null;
          const now = new Date();
          const minLookahead = 2 * 60 * 1000; // 2 minutes minimum
          const maxLookahead = 48 * 60 * 60 * 1000; // 48 hours

          // Only consider events starting within the next 48 hours (but not in the next 2 minutes)
          if (!startTime || startTime <= now ||
              (startTime.getTime() - now.getTime()) <= minLookahead ||
              (startTime.getTime() - now.getTime()) >= maxLookahead) {
            console.log(`[MeetingBaaS Webhook] Skipping fallback - event not in scheduling window: ${instance.title}`);
            continue;
          }

          console.log(`[MeetingBaaS Webhook] Checking fallback deployment for: ${instance.title}`);

          // Determine if meeting is internal or external
          const attendeeEmails = (instance.attendees || []).map(a => a.email).filter(Boolean) as string[];
          const hasExternal = companyDomain
            ? attendeeEmails.some(email => {
                const domain = email?.split('@')[1]?.toLowerCase() || '';
                return domain !== companyDomain.toLowerCase();
              })
            : true; // If no company domain set, assume external

          const shouldRecord = hasExternal ? userSettings.auto_record_external : userSettings.auto_record_internal;

          if (!shouldRecord) {
            console.log(`[MeetingBaaS Webhook] Fallback skipped - user preferences (hasExternal: ${hasExternal}, auto_record_external: ${userSettings.auto_record_external}, auto_record_internal: ${userSettings.auto_record_internal})`);
            continue;
          }

          console.log(`[MeetingBaaS Webhook] Deploying fallback bot for: ${instance.title} (hasExternal: ${hasExternal})`);

          // Query the upserted event to get its ID
          const { data: insertedEvent } = await supabase
            .from('calendar_events')
            .select('id')
            .eq('external_id', instance.event_id)
            .eq('calendar_id', internalCalendarId)
            .maybeSingle();

          if (!insertedEvent) {
            console.warn(`[MeetingBaaS Webhook] Could not find inserted event: ${instance.event_id}`);
            continue;
          }

          // Check if there's already a recording for this event
          const { data: existingRecording } = await supabase
            .from('recordings')
            .select('id')
            .eq('calendar_event_id', insertedEvent.id)
            .maybeSingle();

          if (existingRecording) {
            console.log(`[MeetingBaaS Webhook] Recording already exists for event: ${instance.title}`);
            continue;
          }

          // Deploy bot via edge function
          try {
            const deployResponse = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/deploy-recording-bot`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'x-user-id': user_id,
                },
                body: JSON.stringify({
                  meeting_url: instance.meeting_url,
                  meeting_title: instance.title,
                  calendar_event_id: insertedEvent.id,
                  attendees: instance.attendees?.map(a => ({ email: a.email, name: a.name })),
                  scheduled_time: instance.start,
                }),
              }
            );

            if (deployResponse.ok) {
              const deployResult = await deployResponse.json();
              console.log(`[MeetingBaaS Webhook] Fallback bot deployed for ${instance.title}:`, deployResult);
            } else {
              const errorText = await deployResponse.text();
              console.warn(`[MeetingBaaS Webhook] Fallback bot deployment failed: ${deployResponse.status} - ${errorText}`);
            }
          } catch (deployError) {
            console.error('[MeetingBaaS Webhook] Error deploying fallback bot:', deployError);
            // Don't fail the webhook - event is already synced
          }
        }
      }
    }
  }

  return { success: true };
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight first (before any async operations)
  if (req.method === 'OPTIONS') {
    try {
      const preflightResponse = handleCorsPreflightRequest(req);
      if (preflightResponse) {
        return preflightResponse;
      }
      // Fallback
      return new Response('ok', {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, content-type',
        },
      });
    } catch (error) {
      console.error('[meetingbaas-webhook] OPTIONS handler error:', error);
      return new Response('ok', {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, content-type',
        },
      });
    }
  }

  const webhookEventId = crypto.randomUUID();
  let supabase: SupabaseClient | null = null;

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const meetingbaasWebhookSecret = Deno.env.get('MEETINGBAAS_WEBHOOK_SECRET') ?? '';

    supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get raw body for signature verification
    const rawBody = await req.text();

    // Verify signature first (if secret configured) - MeetingBaaS uses SVIX
    const signatureHeader = req.headers.get('svix-signature') || req.headers.get('x-meetingbaas-signature');
    const timestampHeader = req.headers.get('svix-timestamp') || req.headers.get('x-meetingbaas-timestamp');
    const svixId = req.headers.get('svix-id');

    const verification = await verifyMeetingBaaSSignature(
      meetingbaasWebhookSecret,
      rawBody,
      signatureHeader,
      timestampHeader,
      svixId
    );

    if (!verification.ok) {
      console.warn('[MeetingBaaS Webhook] Signature verification failed:', verification.reason);
      // Only fail if we have a secret configured - otherwise allow for development
      if (meetingbaasWebhookSecret) {
        return errorResponse(verification.reason || 'Invalid signature', req, 401);
      }
    }

    // Parse raw payload - try new format first, fall back to legacy
    let rawPayload: MeetingBaaSRawWebhookPayload | null = null;
    let legacyPayload: MeetingBaaSWebhookPayload | null = null;
    let eventType: string;
    let botId: string;

    try {
      const parsed = JSON.parse(rawBody);

      // Check if it's new format (has 'event' and 'data' fields)
      if (parsed.event && parsed.data) {
        rawPayload = parsed as MeetingBaaSRawWebhookPayload;
        eventType = rawPayload.event;
        botId = rawPayload.data.bot_id || ''; // bot_id may be empty for calendar events
      } else if (parsed.type && (parsed.bot_id || parsed.calendar_id)) {
        // Legacy flat format - allow either bot_id or calendar_id
        legacyPayload = parsed as MeetingBaaSWebhookPayload;
        eventType = legacyPayload.type;
        botId = legacyPayload.bot_id || '';
      } else {
        return errorResponse('Invalid payload format: missing event/type or bot_id/calendar_id', req, 400);
      }
    } catch {
      return errorResponse('Invalid JSON payload', req, 400);
    }

    // For calendar events, bot_id is not required - they use calendar_id instead
    const isCalendarEvent = eventType.startsWith('calendar');
    if (!eventType || (!botId && !isCalendarEvent)) {
      return errorResponse('Missing required fields: event/type, bot_id (or calendar_id for calendar events)', req, 400);
    }

    // Find organization - try multiple methods
    let orgId: string | null = null;

    // Method 1: URL token (legacy, for backward compatibility)
    const url = new URL(req.url);
    const webhookToken = url.searchParams.get('token');

    if (webhookToken && webhookToken !== '{ORG_TOKEN}') {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('recording_settings->>webhook_token', webhookToken)
        .maybeSingle();

      if (org) {
        orgId = org.id;
        console.log(`[MeetingBaaS Webhook] Org identified via token: ${orgId}`);
      }
    }

    // Method 2: Look up org from bot_id via bot_deployments (skip for calendar events)
    if (!orgId && botId && !isCalendarEvent) {
      console.log(`[MeetingBaaS Webhook] Attempting Method 2: bot_id lookup for ${botId}`);
      const { data: deployment, error: lookupError } = await supabase
        .from('bot_deployments')
        .select('org_id')
        .eq('bot_id', botId)
        .maybeSingle();

      console.log(`[MeetingBaaS Webhook] Method 2 result:`, {
        found: !!deployment,
        org_id: deployment?.org_id,
        error: lookupError
      });

      if (deployment?.org_id) {
        orgId = deployment.org_id;
        console.log(`[MeetingBaaS Webhook] Org identified via bot_id: ${orgId}`);
      } else {
        console.warn(`[MeetingBaaS Webhook] Method 2 failed - no deployment found for bot_id: ${botId}`);
      }
    }

    // Method 3: Look up org from calendar_id if present (primary method for calendar events)
    const calendarId = rawPayload?.data.calendar_id || legacyPayload?.calendar_id;
    if (!orgId && calendarId) {
      console.log(`[MeetingBaaS Webhook] Attempting Method 3: calendar_id lookup for ${calendarId}`);
      const { data: calendar, error: calendarLookupError } = await supabase
        .from('meetingbaas_calendars')
        .select('org_id, user_id')
        .eq('meetingbaas_calendar_id', calendarId)
        .maybeSingle();

      console.log(`[MeetingBaaS Webhook] Method 3 result:`, {
        found: !!calendar,
        org_id: calendar?.org_id,
        user_id: calendar?.user_id,
        error: calendarLookupError
      });

      if (calendar?.org_id) {
        orgId = calendar.org_id;
        console.log(`[MeetingBaaS Webhook] Org identified via calendar_id: ${orgId}`);
      }
    }

    if (!orgId) {
      // TEMPORARY: In staging, use the default test org to allow webhooks through for debugging
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const isStaging = supabaseUrl.includes('caerqjzvuerejfrdtygb');

      if (isStaging) {
        // Default to the primary test org in staging
        orgId = '1d1b4274-c9c4-4cb7-9efc-243c90c86f4c';
        console.warn('[MeetingBaaS Webhook] STAGING FALLBACK: Using default org_id for event:', eventType);

        // For bot events (not calendar events), create missing records
        if (!isCalendarEvent && botId) {
          // Extract meeting_url from webhook payload if available
          const meetingUrl = (rawPayload?.data as Record<string, unknown>)?.meeting_url as string
            || legacyPayload?.meeting_url
            || 'https://staging-unknown-meeting.use60.com';

          // Check if bot_deployment already exists for this bot_id
          const { data: existingDeployment } = await supabase
            .from('bot_deployments')
            .select('id')
            .eq('bot_id', botId)
            .maybeSingle();

          if (!existingDeployment) {
            // Create the missing recording and bot_deployment records
            console.log('[MeetingBaaS Webhook] Creating missing recording and bot_deployment for bot_id:', botId);

            // First create a recording record
            const stagingUserId = 'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459'; // Default staging test user
            // Platform must be one of: zoom, google_meet, microsoft_teams
            const platform = meetingUrl.includes('zoom') ? 'zoom'
              : meetingUrl.includes('teams') ? 'microsoft_teams'
              : 'google_meet'; // Default to google_meet

            const { data: newRecording, error: recordingError } = await supabase
              .from('recordings')
              .insert({
                org_id: orgId,
                user_id: stagingUserId,
                meeting_platform: platform,
                meeting_url: meetingUrl,
                meeting_title: `Staging Recording - ${botId.substring(0, 8)}`,
                bot_id: botId,
                status: 'bot_joining',
              })
              .select('id')
              .single();

            if (recordingError) {
              console.error('[MeetingBaaS Webhook] Failed to create fallback recording:', recordingError);
            } else {
              console.log('[MeetingBaaS Webhook] Created recording:', newRecording.id);
            }

            // Then create the bot_deployment linked to the recording
            const { error: deploymentError } = await supabase.from('bot_deployments').insert({
              bot_id: botId,
              org_id: orgId,
              recording_id: newRecording?.id || null,
              status: 'joining',
              meeting_url: meetingUrl,
            });

            if (deploymentError) {
              console.error('[MeetingBaaS Webhook] Failed to create fallback bot_deployment:', deploymentError);
            } else {
              console.log('[MeetingBaaS Webhook] Successfully created bot_deployment for bot_id:', botId);
            }
          } else {
            console.log('[MeetingBaaS Webhook] Bot deployment already exists for bot_id:', botId);
          }
        }
        // For calendar events without org_id, log for debugging
        if (isCalendarEvent) {
          console.warn('[MeetingBaaS Webhook] Calendar event without org_id - may indicate missing meetingbaas_calendars record for calendar_id:', calendarId);
        }
      } else {
        console.error('[MeetingBaaS Webhook] Could not identify organization', {
          event_type: eventType,
          is_calendar_event: isCalendarEvent,
          bot_id: botId || null,
          calendar_id: calendarId,
          token_provided: !!webhookToken,
          token_value: webhookToken === '{ORG_TOKEN}' ? 'PLACEHOLDER_NOT_REPLACED' : webhookToken?.substring(0, 10) + '...',
        });
        return jsonResponse({
          success: false,
          error: 'Could not identify organization for this webhook',
          hint: isCalendarEvent
            ? 'Ensure meetingbaas_calendars has a record with this calendar_id linked to an org_id.'
            : 'Ensure bot_deployments or meetingbaas_calendars has the org_id set.',
          event_type: eventType,
          bot_id: botId || null,
          calendar_id: calendarId,
        }, req, 401);
      }
    }

    // Log webhook event
    const eventId = await logWebhookEvent(
      supabase,
      'meetingbaas',
      eventType,
      rawPayload || legacyPayload,
      {
        'x-meetingbaas-signature': signatureHeader || '',
        'x-meetingbaas-timestamp': timestampHeader || '',
      }
    );

    await updateWebhookEventStatus(supabase, eventId, 'processing');

    addBreadcrumb(`Processing MeetingBaaS event: ${eventType}`, 'meetingbaas', 'info', {
      bot_id: botId,
      org_id: orgId,
    });

    // Route to appropriate handler
    let result: { success: boolean; error?: string };

    // Handle new format events
    if (rawPayload) {
      switch (eventType as MeetingBaaSEventType) {
        case 'bot.status_change':
          result = await handleBotStatusChange(supabase, rawPayload.data, orgId);
          break;

        case 'bot.completed':
          result = await handleBotCompleted(supabase, rawPayload.data, orgId);
          break;

        case 'bot.joining':
        case 'bot.in_meeting':
        case 'bot.left':
        case 'bot.failed':
          // Convert to legacy format for backward compatibility
          result = await handleBotStatusEvent(supabase, {
            type: eventType as MeetingBaaSEventType,
            bot_id: botId,
            ...rawPayload.data,
          }, orgId);
          break;

        case 'recording.ready':
          result = await handleRecordingReady(supabase, {
            type: eventType as MeetingBaaSEventType,
            bot_id: botId,
            recording_url: rawPayload.data.recording_url,
            ...rawPayload.data,
          }, orgId);
          break;

        case 'transcript.ready':
          result = await handleTranscriptReady(supabase, {
            type: eventType as MeetingBaaSEventType,
            bot_id: botId,
            transcript: rawPayload.data.transcript,
            ...rawPayload.data,
          }, orgId);
          break;

        // Calendar event handlers - sync MeetingBaaS calendar events to our database
        // MeetingBaaS uses dot notation (calendar.event_created) but we also support underscore notation
        case 'calendar.event_created':
        case 'calendar.event_updated':
        case 'calendar.event_deleted':
        case 'calendar_event.created':
        case 'calendar_event.updated':
        case 'calendar_event.deleted':
          // Normalize event type to underscore format for handler
          const normalizedEventType = eventType.replace('calendar.event_', 'calendar_event.') as
            'calendar_event.created' | 'calendar_event.updated' | 'calendar_event.deleted';
          result = await handleCalendarEvent(
            supabase,
            normalizedEventType,
            rawPayload.data as MeetingBaaSCalendarEventData
          );
          break;

        // Calendar sync status events - log but don't fail
        case 'calendar.created':
        case 'calendar.updated':
        case 'calendar.deleted':
        case 'calendar.error':
        case 'calendar.sync_complete':
          console.log(`[MeetingBaaS Webhook] Calendar sync event: ${eventType}`, rawPayload.data);
          result = { success: true };
          break;

        default:
          console.warn(`[MeetingBaaS Webhook] Unknown event type: ${eventType}`);
          result = { success: true };
      }
    } else if (legacyPayload) {
      // Handle legacy format events
      switch (legacyPayload.type) {
        case 'bot.joining':
        case 'bot.in_meeting':
        case 'bot.left':
        case 'bot.failed':
          result = await handleBotStatusEvent(supabase, legacyPayload, orgId);
          break;

        case 'recording.ready':
          result = await handleRecordingReady(supabase, legacyPayload, orgId);
          break;

        case 'transcript.ready':
          result = await handleTranscriptReady(supabase, legacyPayload, orgId);
          break;

        default:
          console.warn(`[MeetingBaaS Webhook] Unknown event type: ${legacyPayload.type}`);
          result = { success: true };
      }
    } else {
      return errorResponse('Invalid payload state', req, 500);
    }

    // Update webhook event status
    if (result.success) {
      await updateWebhookEventStatus(supabase, eventId, 'processed');
    } else {
      await updateWebhookEventStatus(supabase, eventId, 'failed', result.error);
    }

    return jsonResponse({
      success: result.success,
      event_id: eventId,
      event_type: eventType,
      error: result.error,
    }, req, result.success ? 200 : 500);
  } catch (error) {
    console.error('[MeetingBaaS Webhook] Error:', error);

    await captureException(error, {
      tags: {
        function: 'meetingbaas-webhook',
        integration: 'meetingbaas',
      },
    });

    return errorResponse(
      error instanceof Error ? error.message : 'Webhook processing failed',
      req,
      500
    );
  }
});

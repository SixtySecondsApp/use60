/**
 * MeetingBaaS Webhook Simulator
 *
 * Simulates MeetingBaaS webhook events for E2E testing.
 * Used in test_data mode to validate the full recording workflow.
 *
 * Supported events:
 * - bot.status_change (joining, in_meeting, recording, etc.)
 * - bot.completed (recording finished)
 * - recording.ready (video URL available)
 * - transcript.ready (transcript available)
 *
 * This function either:
 * 1. Calls the actual meetingbaas-webhook handler (for full integration testing)
 * 2. Directly updates the database (for faster unit testing)
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, getCorsHeaders, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

// =============================================================================
// Types
// =============================================================================

type SimulatedEventType =
  | 'bot.status_change'
  | 'bot.joining'
  | 'bot.in_meeting'
  | 'bot.left'
  | 'bot.completed'
  | 'bot.failed'
  | 'recording.ready'
  | 'transcript.ready'
  | 'calendar.connected';

type BotStatusCode =
  | 'scheduled'
  | 'joining_call'
  | 'in_waiting_room'
  | 'in_call_not_recording'
  | 'in_call_recording'
  | 'call_ended'
  | 'recording_done'
  | 'error';

interface SimulateRequest {
  // Required fields
  event_type: SimulatedEventType;
  org_id: string;

  // Bot-related fields (for bot events)
  bot_id?: string;
  recording_id?: string;

  // Calendar-related fields (for calendar events)
  calendar_id?: string;

  // Event-specific fields
  status_code?: BotStatusCode;
  error_code?: string;
  error_message?: string;

  // Recording data (for bot.completed)
  video_url?: string;
  audio_url?: string;
  duration_seconds?: number;

  // Transcript data (for transcript.ready)
  transcript_text?: string;

  // Options
  mode?: 'direct' | 'webhook'; // direct = update DB, webhook = call actual handler
  delay_ms?: number; // Add artificial delay
}

interface SimulateResponse {
  success: boolean;
  event_type: string;
  bot_id?: string;
  recording_id?: string;
  error?: string;
  webhook_response?: unknown;
}

// =============================================================================
// Helpers
// =============================================================================

function generateMockTranscript(): {
  text: string;
  utterances: Array<{
    speaker: number;
    start: number;
    end: number;
    text: string;
    confidence: number;
  }>;
} {
  const utterances = [
    { speaker: 0, start: 0, end: 5, text: "Hello everyone, let's get started with today's meeting.", confidence: 0.95 },
    { speaker: 1, start: 6, end: 12, text: "Thanks for joining. I wanted to discuss our Q1 progress.", confidence: 0.92 },
    { speaker: 0, start: 13, end: 20, text: "Sure, let me pull up the numbers. We're tracking well against our targets.", confidence: 0.88 },
    { speaker: 1, start: 21, end: 28, text: "That's great to hear. What about the new product launch timeline?", confidence: 0.91 },
    { speaker: 0, start: 29, end: 38, text: "We're on track for April. The team has been working hard on the final features.", confidence: 0.89 },
    { speaker: 1, start: 39, end: 45, text: "Perfect. Let's schedule a follow-up next week to review the final details.", confidence: 0.94 },
  ];

  return {
    text: utterances.map(u => u.text).join(' '),
    utterances,
  };
}

function generateMockVideoUrl(recordingId: string): string {
  // In production, MeetingBaaS returns a presigned S3 URL
  // For testing, we return a placeholder that indicates it's simulated
  return `https://meetingbaas-mock.test/recordings/${recordingId}/video.mp4`;
}

function mapStatusCodeToDeploymentStatus(statusCode: BotStatusCode): string | null {
  switch (statusCode) {
    case 'scheduled':
      return 'scheduled';
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

function mapStatusCodeToRecordingStatus(statusCode: BotStatusCode): string | null {
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

// =============================================================================
// Direct Update Handlers (for faster testing)
// =============================================================================

async function handleBotStatusChangeDirect(
  supabase: SupabaseClient,
  request: SimulateRequest
): Promise<SimulateResponse> {
  const { bot_id, org_id, status_code, error_code, error_message } = request;

  if (!bot_id) {
    return { success: false, event_type: 'bot.status_change', error: 'bot_id is required' };
  }

  if (!status_code) {
    return { success: false, event_type: 'bot.status_change', error: 'status_code is required' };
  }

  const deploymentStatus = mapStatusCodeToDeploymentStatus(status_code);
  const recordingStatus = mapStatusCodeToRecordingStatus(status_code);

  // Find deployment
  const { data: deployment, error: findError } = await supabase
    .from('bot_deployments')
    .select('id, recording_id, status_history')
    .eq('bot_id', bot_id)
    .eq('org_id', org_id)
    .maybeSingle();

  if (findError || !deployment) {
    return {
      success: false,
      event_type: 'bot.status_change',
      error: `Bot deployment not found: ${findError?.message || 'Not found'}`,
    };
  }

  // Build update
  const update: Record<string, unknown> = {
    status: deploymentStatus,
    updated_at: new Date().toISOString(),
  };

  // Add timestamps based on status
  if (status_code === 'in_call_recording') {
    update.actual_join_time = new Date().toISOString();
  } else if (status_code === 'call_ended') {
    update.leave_time = new Date().toISOString();
  } else if (status_code === 'error') {
    update.error_code = error_code || 'SIMULATED_ERROR';
    update.error_message = error_message || 'Simulated error for testing';
  }

  // Append to status history
  const currentHistory = Array.isArray(deployment.status_history) ? deployment.status_history : [];
  update.status_history = [
    ...currentHistory,
    {
      status: deploymentStatus,
      timestamp: new Date().toISOString(),
      details: `Simulated: ${status_code}`,
    },
  ];

  // Update deployment
  const { error: updateError } = await supabase
    .from('bot_deployments')
    .update(update)
    .eq('id', deployment.id);

  if (updateError) {
    return {
      success: false,
      event_type: 'bot.status_change',
      error: `Failed to update deployment: ${updateError.message}`,
    };
  }

  // Update recording status if applicable
  if (recordingStatus && deployment.recording_id) {
    const recordingUpdate: Record<string, unknown> = {
      status: recordingStatus,
      updated_at: new Date().toISOString(),
    };

    if (status_code === 'in_call_recording') {
      recordingUpdate.meeting_start_time = new Date().toISOString();
    } else if (status_code === 'error') {
      recordingUpdate.error_message = error_message || 'Simulated error';
    }

    await supabase
      .from('recordings')
      .update(recordingUpdate)
      .eq('id', deployment.recording_id);
  }

  return {
    success: true,
    event_type: 'bot.status_change',
    bot_id,
    recording_id: deployment.recording_id,
  };
}

async function handleBotCompletedDirect(
  supabase: SupabaseClient,
  request: SimulateRequest
): Promise<SimulateResponse> {
  const { bot_id, org_id, video_url, audio_url, duration_seconds } = request;

  if (!bot_id) {
    return { success: false, event_type: 'bot.completed', error: 'bot_id is required' };
  }

  // Find deployment
  const { data: deployment, error: findError } = await supabase
    .from('bot_deployments')
    .select('id, recording_id')
    .eq('bot_id', bot_id)
    .eq('org_id', org_id)
    .maybeSingle();

  if (findError || !deployment?.recording_id) {
    return {
      success: false,
      event_type: 'bot.completed',
      error: `Recording not found: ${findError?.message || 'Not found'}`,
    };
  }

  const now = new Date().toISOString();

  // Update deployment to completed
  await supabase
    .from('bot_deployments')
    .update({
      status: 'completed',
      leave_time: now,
      updated_at: now,
    })
    .eq('id', deployment.id);

  // Update recording with video URL (simulated)
  const recordingUpdate: Record<string, unknown> = {
    status: 'processing',
    meeting_end_time: now,
    meeting_duration_seconds: duration_seconds || 300, // Default 5 minutes
    updated_at: now,
  };

  // Use provided URL or generate mock
  const mockVideoUrl = video_url || generateMockVideoUrl(deployment.recording_id);
  recordingUpdate.recording_s3_url = mockVideoUrl;
  recordingUpdate.recording_s3_key = `meeting-recordings/${org_id}/test/${deployment.recording_id}/recording.mp4`;

  await supabase
    .from('recordings')
    .update(recordingUpdate)
    .eq('id', deployment.recording_id);

  return {
    success: true,
    event_type: 'bot.completed',
    bot_id,
    recording_id: deployment.recording_id,
  };
}

async function handleRecordingReadyDirect(
  supabase: SupabaseClient,
  request: SimulateRequest
): Promise<SimulateResponse> {
  const { bot_id, org_id, video_url } = request;

  if (!bot_id) {
    return { success: false, event_type: 'recording.ready', error: 'bot_id is required' };
  }

  // Find deployment
  const { data: deployment } = await supabase
    .from('bot_deployments')
    .select('id, recording_id')
    .eq('bot_id', bot_id)
    .eq('org_id', org_id)
    .maybeSingle();

  if (!deployment?.recording_id) {
    return {
      success: false,
      event_type: 'recording.ready',
      error: 'Recording not found',
    };
  }

  const mockVideoUrl = video_url || generateMockVideoUrl(deployment.recording_id);

  await supabase
    .from('recordings')
    .update({
      recording_s3_url: mockVideoUrl,
      status: 'ready',
      updated_at: new Date().toISOString(),
    })
    .eq('id', deployment.recording_id);

  return {
    success: true,
    event_type: 'recording.ready',
    bot_id,
    recording_id: deployment.recording_id,
  };
}

async function handleTranscriptReadyDirect(
  supabase: SupabaseClient,
  request: SimulateRequest
): Promise<SimulateResponse> {
  const { bot_id, org_id, transcript_text } = request;

  if (!bot_id) {
    return { success: false, event_type: 'transcript.ready', error: 'bot_id is required' };
  }

  // Find deployment and recording
  const { data: deployment } = await supabase
    .from('bot_deployments')
    .select('id, recording_id')
    .eq('bot_id', bot_id)
    .eq('org_id', org_id)
    .maybeSingle();

  if (!deployment?.recording_id) {
    return {
      success: false,
      event_type: 'transcript.ready',
      error: 'Recording not found',
    };
  }

  // Generate mock transcript
  const transcript = generateMockTranscript();
  if (transcript_text) {
    transcript.text = transcript_text;
  }

  // Update recording with transcript and mark as ready
  await supabase
    .from('recordings')
    .update({
      transcript_raw: transcript,
      transcript_text: transcript.text,
      status: 'ready',
      updated_at: new Date().toISOString(),
    })
    .eq('id', deployment.recording_id);

  return {
    success: true,
    event_type: 'transcript.ready',
    bot_id,
    recording_id: deployment.recording_id,
  };
}

async function handleCalendarConnectedDirect(
  supabase: SupabaseClient,
  request: SimulateRequest
): Promise<SimulateResponse> {
  const { org_id, calendar_id } = request;

  if (!calendar_id) {
    return { success: false, event_type: 'calendar.connected', error: 'calendar_id is required' };
  }

  // Create or update calendar connection
  const { error } = await supabase
    .from('meetingbaas_calendars')
    .upsert({
      id: crypto.randomUUID(),
      org_id,
      meetingbaas_calendar_id: calendar_id,
      calendar_type: 'google',
      status: 'active',
      email: 'test@example.com',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'meetingbaas_calendar_id',
    });

  if (error) {
    return {
      success: false,
      event_type: 'calendar.connected',
      error: `Failed to create calendar: ${error.message}`,
    };
  }

  return {
    success: true,
    event_type: 'calendar.connected',
  };
}

// =============================================================================
// Webhook Mode Handler
// =============================================================================

async function callActualWebhook(
  supabaseUrl: string,
  serviceRoleKey: string,
  request: SimulateRequest
): Promise<SimulateResponse> {
  // Build webhook payload in MeetingBaaS format
  const webhookPayload = {
    event: request.event_type,
    data: {
      bot_id: request.bot_id,
      status: request.status_code ? { code: request.status_code } : undefined,
      video: request.video_url,
      audio: request.audio_url,
      duration_seconds: request.duration_seconds,
      transcript: request.transcript_text ? {
        text: request.transcript_text,
        utterances: generateMockTranscript().utterances,
      } : undefined,
      error_code: request.error_code,
      error_message: request.error_message,
    },
  };

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/meetingbaas-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Skip signature verification for simulated events
        'x-simulate-test': 'true',
      },
      body: JSON.stringify(webhookPayload),
    });

    const data = await response.json();

    return {
      success: response.ok,
      event_type: request.event_type,
      bot_id: request.bot_id,
      webhook_response: data,
      error: response.ok ? undefined : data.error,
    };
  } catch (error) {
    return {
      success: false,
      event_type: request.event_type,
      error: error instanceof Error ? error.message : 'Webhook call failed',
    };
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    const preflightResponse = handleCorsPreflightRequest(req);
    if (preflightResponse) return preflightResponse;
    return new Response('ok', {
      status: 200,
      headers: getCorsHeaders(req),
    });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const request: SimulateRequest = await req.json();

    // Validate required fields
    if (!request.event_type) {
      return errorResponse('event_type is required', req, 400);
    }

    if (!request.org_id) {
      return errorResponse('org_id is required', req, 400);
    }

    // Add artificial delay if requested
    if (request.delay_ms && request.delay_ms > 0) {
      await new Promise(resolve => setTimeout(resolve, Math.min(request.delay_ms!, 5000)));
    }

    let response: SimulateResponse;

    // Route to appropriate handler based on mode
    if (request.mode === 'webhook') {
      response = await callActualWebhook(supabaseUrl, serviceRoleKey, request);
    } else {
      // Default: direct database updates for faster testing
      switch (request.event_type) {
        case 'bot.status_change':
        case 'bot.joining':
        case 'bot.in_meeting':
        case 'bot.left':
          // Map legacy events to status codes
          if (request.event_type === 'bot.joining') {
            request.status_code = 'joining_call';
          } else if (request.event_type === 'bot.in_meeting') {
            request.status_code = 'in_call_recording';
          } else if (request.event_type === 'bot.left') {
            request.status_code = 'call_ended';
          }
          response = await handleBotStatusChangeDirect(supabase, request);
          break;

        case 'bot.completed':
          response = await handleBotCompletedDirect(supabase, request);
          break;

        case 'bot.failed':
          request.status_code = 'error';
          response = await handleBotStatusChangeDirect(supabase, request);
          break;

        case 'recording.ready':
          response = await handleRecordingReadyDirect(supabase, request);
          break;

        case 'transcript.ready':
          response = await handleTranscriptReadyDirect(supabase, request);
          break;

        case 'calendar.connected':
          response = await handleCalendarConnectedDirect(supabase, request);
          break;

        default:
          return errorResponse(`Unknown event_type: ${request.event_type}`, req, 400);
      }
    }

    return jsonResponse(response, req, response.success ? 200 : 500);
  } catch (error) {
    console.error('[MeetingBaaS Webhook Simulate] Error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Simulation failed',
      req,
      500
    );
  }
});

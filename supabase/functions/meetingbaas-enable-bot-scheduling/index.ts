/**
 * MeetingBaaS Enable Bot Scheduling
 *
 * Enables native MeetingBaaS bot scheduling for an existing calendar.
 * This is used to enable bot scheduling for calendars that were connected
 * before native bot scheduling was implemented.
 *
 * Endpoint: POST /functions/v1/meetingbaas-enable-bot-scheduling
 *
 * Body:
 * - calendar_id: string (meetingbaas_calendars.id)
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

// =============================================================================
// Types
// =============================================================================

interface BotConfig {
  bot_name: string;
  bot_image?: string;
  recording_mode?: 'audio_only' | 'video_only' | 'audio_and_video';
  speech_to_text?: {
    provider: 'Default' | 'Gladia' | 'Runpod';
  };
  automatic_leave?: {
    waiting_room_timeout?: number;
    noone_joined_timeout?: number;
    everyone_left_timeout?: number;
  };
  deduplication_key?: string;
  extra?: Record<string, unknown>;
}

interface RecordingSettings {
  bot_name?: string;
  bot_image_url?: string | null;
  entry_message_enabled?: boolean;
  entry_message?: string;
  recordings_enabled?: boolean;
  auto_record_enabled?: boolean;
  webhook_token?: string;
}

// =============================================================================
// MeetingBaaS API
// =============================================================================

const MEETINGBAAS_API_BASE = 'https://api.meetingbaas.com/v2';

async function scheduleMeetingBaaSBots(
  apiKey: string,
  calendarId: string,
  config: BotConfig
): Promise<{ success: boolean; error?: string; data?: unknown }> {
  try {
    console.log('[MeetingBaaS API] Scheduling bots for calendar:', {
      calendarId,
      botName: config.bot_name,
      recordingMode: config.recording_mode,
    });

    const response = await fetch(`${MEETINGBAAS_API_BASE}/calendars/${calendarId}/bots`, {
      method: 'POST',
      headers: {
        'x-meeting-baas-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });

    const data = await response.json();
    console.log('[MeetingBaaS API] Schedule bots response:', {
      status: response.status,
      ok: response.ok,
      data: JSON.stringify(data).substring(0, 1000),
    });

    if (!response.ok) {
      return {
        success: false,
        error: data?.message || data?.error || `HTTP ${response.status}`,
        data,
      };
    }

    return { success: true, data };
  } catch (error) {
    console.error('[MeetingBaaS API] Schedule bots exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    const preflightResponse = handleCorsPreflightRequest(req);
    if (preflightResponse) return preflightResponse;
    return new Response('ok', { status: 200 });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const meetingbaasApiKey = Deno.env.get('MEETINGBAAS_API_KEY') ?? '';

    if (!meetingbaasApiKey) {
      return errorResponse('MeetingBaaS API key not configured', req, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json();
    const { calendar_id } = body;

    if (!calendar_id) {
      return errorResponse('calendar_id is required', req, 400);
    }

    console.log(`[EnableBotScheduling] Processing calendar: ${calendar_id}`);

    // Get the calendar record with org settings
    const { data: calendar, error: calError } = await supabase
      .from('meetingbaas_calendars')
      .select(`
        id,
        user_id,
        org_id,
        meetingbaas_calendar_id,
        bot_scheduling_enabled
      `)
      .eq('id', calendar_id)
      .maybeSingle();

    if (calError || !calendar) {
      return errorResponse(`Calendar not found: ${calError?.message || 'No record'}`, req, 404);
    }

    if (!calendar.meetingbaas_calendar_id) {
      return errorResponse('Calendar has no MeetingBaaS ID', req, 400);
    }

    if (calendar.bot_scheduling_enabled) {
      return jsonResponse({
        success: true,
        message: 'Bot scheduling already enabled',
        calendar_id: calendar.id,
        meetingbaas_calendar_id: calendar.meetingbaas_calendar_id,
      }, req);
    }

    // Get org settings for bot config
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, recording_settings')
      .eq('id', calendar.org_id)
      .single();

    if (orgError || !org) {
      return errorResponse(`Organization not found: ${orgError?.message}`, req, 404);
    }

    const recordingSettings = (org.recording_settings as RecordingSettings) || {};

    // Build bot configuration
    const botConfig: BotConfig = {
      bot_name: recordingSettings.bot_name || '60 Notetaker',
      recording_mode: 'audio_and_video',
      speech_to_text: {
        provider: 'Default', // Let MeetingBaaS handle transcription
      },
      automatic_leave: {
        waiting_room_timeout: 600,
        noone_joined_timeout: 600,
        everyone_left_timeout: 60,
      },
    };

    if (recordingSettings.bot_image_url) {
      botConfig.bot_image = recordingSettings.bot_image_url;
    }

    // Enable bot scheduling via MeetingBaaS API
    const scheduleResult = await scheduleMeetingBaaSBots(
      meetingbaasApiKey,
      calendar.meetingbaas_calendar_id,
      botConfig
    );

    if (!scheduleResult.success) {
      console.error('[EnableBotScheduling] Failed to schedule bots:', scheduleResult.error);
      return errorResponse(`Failed to enable bot scheduling: ${scheduleResult.error}`, req, 500);
    }

    // Update the database to mark bot scheduling as enabled
    const { error: updateError } = await supabase
      .from('meetingbaas_calendars')
      .update({ bot_scheduling_enabled: true })
      .eq('id', calendar.id);

    if (updateError) {
      console.error('[EnableBotScheduling] Failed to update database:', updateError);
      // Don't fail - the API call succeeded
    }

    console.log(`[EnableBotScheduling] Successfully enabled for calendar ${calendar.id}`);

    return jsonResponse({
      success: true,
      message: 'Bot scheduling enabled',
      calendar_id: calendar.id,
      meetingbaas_calendar_id: calendar.meetingbaas_calendar_id,
      api_response: scheduleResult.data,
    }, req);

  } catch (error) {
    console.error('[EnableBotScheduling] Error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', req, 500);
  }
});

/**
 * MeetingBaaS Connect Calendar
 *
 * Connects a user's Google Calendar to MeetingBaaS using their existing OAuth credentials.
 * This enables automatic bot deployment for calendar events.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { captureException, addBreadcrumb } from '../_shared/sentryEdge.ts';

// =============================================================================
// Types
// =============================================================================

interface ConnectCalendarRequest {
  user_id: string;
  calendar_id?: string; // Default: 'primary'
  access_token?: string; // Optional fallback access token from frontend
}

interface MeetingBaaSCalendarResponse {
  id: string;
  platform: string;
  raw_calendar_id: string;
  name?: string;
  email?: string;
  created_at: string;
}

interface MeetingBaaSBotConfig {
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

// =============================================================================
// MeetingBaaS API
// =============================================================================

const MEETINGBAAS_API_BASE = 'https://api.meetingbaas.com/v2';

async function createMeetingBaaSCalendar(
  apiKey: string,
  params: {
    oauth_client_id: string;
    oauth_client_secret: string;
    oauth_refresh_token: string;
    raw_calendar_id: string;
    calendar_platform: 'google' | 'microsoft';
  }
): Promise<{ data?: MeetingBaaSCalendarResponse; error?: string; errorData?: unknown }> {
  try {
    console.log('[MeetingBaaS API] Creating calendar with params:', {
      raw_calendar_id: params.raw_calendar_id,
      calendar_platform: params.calendar_platform,
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length,
      hasClientId: !!params.oauth_client_id,
      hasClientSecret: !!params.oauth_client_secret,
      hasRefreshToken: !!params.oauth_refresh_token,
    });

    // MeetingBaaS API uses x-meeting-baas-api-key header, not Bearer token
    const response = await fetch(`${MEETINGBAAS_API_BASE}/calendars`, {
      method: 'POST',
      headers: {
        'x-meeting-baas-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();
    console.log('[MeetingBaaS API] Response:', {
      status: response.status,
      ok: response.ok,
      data: JSON.stringify(data).substring(0, 1000),
    });

    if (!response.ok) {
      return {
        error: (data && (data.message || data.error)) || `HTTP ${response.status}`,
        errorData: data,
      };
    }

    // Normalize the response to extract the calendar object
    // MeetingBaaS API may return data in different formats:
    // - { id: "...", ... } - direct calendar object
    // - { calendar: { id: "...", ... } } - wrapped in calendar key
    // - { data: { id: "...", ... } } - wrapped in data key
    const calendar: MeetingBaaSCalendarResponse | undefined =
      (data && typeof data === 'object' && 'id' in data && typeof data.id === 'string')
        ? data
        : (data?.calendar && typeof data.calendar === 'object' && 'id' in data.calendar)
          ? data.calendar
          : (data?.data && typeof data.data === 'object' && 'id' in data.data)
            ? data.data
            : undefined;

    if (!calendar || !calendar.id) {
      console.error('[MeetingBaaS API] Could not extract calendar ID from response:', data);
      return {
        error: 'MeetingBaaS API returned unexpected format - no calendar ID found',
        errorData: data,
      };
    }

    console.log('[MeetingBaaS API] Extracted calendar:', {
      id: calendar.id,
      platform: calendar.platform,
      raw_calendar_id: calendar.raw_calendar_id,
    });

    return { data: calendar };
  } catch (error) {
    console.error('[MeetingBaaS API] Exception:', error);
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Schedule bots for all calendar events with meeting URLs.
 * This uses MeetingBaaS v2 native bot scheduling which eliminates
 * the need for polling/cron-based auto-join schedulers.
 */
async function scheduleMeetingBaaSBots(
  apiKey: string,
  calendarId: string,
  config: MeetingBaaSBotConfig
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

async function listMeetingBaaSCalendars(
  apiKey: string
): Promise<{ data?: MeetingBaaSCalendarResponse[]; error?: string }> {
  try {
    const response = await fetch(`${MEETINGBAAS_API_BASE}/calendars`, {
      method: 'GET',
      headers: {
        'x-meeting-baas-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log('[MeetingBaaS API] List calendars raw response:', JSON.stringify(data).substring(0, 2000));

    if (!response.ok) {
      return { error: data.message || data.error || `HTTP ${response.status}` };
    }

    /**
     * MeetingBaaS API responses have varied over time.
     * Normalize to an array of calendars to avoid runtime crashes.
     */
    const calendarsCandidate =
      // common: { calendars: [...] }
      (data && typeof data === 'object' && 'calendars' in data ? (data as any).calendars : undefined) ??
      // sometimes: { data: [...] } or { data: { calendars: [...] } }
      (data && typeof data === 'object' && 'data' in data ? (data as any).data : undefined) ??
      // fallback: the response itself might be the array
      data;

    const calendars: MeetingBaaSCalendarResponse[] =
      Array.isArray(calendarsCandidate)
        ? calendarsCandidate
        : Array.isArray((calendarsCandidate as any)?.calendars)
          ? (calendarsCandidate as any).calendars
          : [];

    if (!Array.isArray(calendars)) {
      return { error: 'Unexpected MeetingBaaS calendars response format' };
    }

    return { data: calendars };
  } catch (error) {
    console.error('[MeetingBaaS API] List calendars exception:', error);
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight first (before any async operations)
  // This must be synchronous and never throw
  if (req.method === 'OPTIONS') {
    try {
      const preflightResponse = handleCorsPreflightRequest(req);
      if (preflightResponse) {
        return preflightResponse;
      }
      // Fallback if handleCorsPreflightRequest returns null (shouldn't happen)
      return new Response('ok', {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });
    } catch (error) {
      // Even if CORS helper fails, return a valid OPTIONS response
      console.error('[meetingbaas-connect-calendar] OPTIONS handler error:', error);
      return new Response('ok', {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });
    }
  }

  // Log all headers for debugging
  const headersObj: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headersObj[key] = key.toLowerCase() === 'authorization' ? `${value.substring(0, 20)}...` : value;
  });
  console.log('[meetingbaas-connect-calendar] Request received:', {
    method: req.method,
    url: req.url,
    headers: headersObj,
    hasAuth: !!req.headers.get('authorization'),
    authHeaderValue: req.headers.get('authorization')?.substring(0, 30),
    contentType: req.headers.get('content-type'),
  });

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const meetingbaasApiKey = Deno.env.get('MEETINGBAAS_API_KEY') ?? '';
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

    console.log('[meetingbaas-connect-calendar] Environment check:', {
      hasServiceRoleKey: !!serviceRoleKey,
      hasSupabaseUrl: !!supabaseUrl,
      hasMeetingbaasApiKey: !!meetingbaasApiKey,
      hasGoogleClientId: !!googleClientId,
      hasGoogleClientSecret: !!googleClientSecret,
    });

    if (!meetingbaasApiKey) {
      return errorResponse('MeetingBaaS API key not configured', req, 500);
    }

    if (!googleClientId || !googleClientSecret) {
      return errorResponse('Google OAuth credentials not configured', req, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify user authentication from Authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse('Missing or invalid authorization header', req, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      console.error('[meetingbaas-connect-calendar] Auth verification failed:', authError?.message);
      return errorResponse('Invalid or expired authentication token', req, 401);
    }

    console.log('[meetingbaas-connect-calendar] Authenticated user:', authUser.id);

    // Get request body
    const body: ConnectCalendarRequest = await req.json();
    const { user_id, calendar_id = 'primary', access_token: fallbackAccessToken } = body;

    // Ensure the authenticated user matches the requested user_id (or use auth user if not provided)
    const effectiveUserId = user_id || authUser.id;
    if (user_id && user_id !== authUser.id) {
      console.warn('[meetingbaas-connect-calendar] User ID mismatch:', { bodyUserId: user_id, authUserId: authUser.id });
      return errorResponse('Unauthorized: user_id does not match authenticated user', req, 403);
    }

    if (!effectiveUserId) {
      return errorResponse('user_id is required', req, 400);
    }

    addBreadcrumb(`Connecting calendar for user: ${effectiveUserId}`, 'meetingbaas');

    // Get user's Google integration
    const { data: googleIntegration, error: googleError } = await supabase
      .from('google_integrations')
      .select('refresh_token, email, is_active')
      .eq('user_id', effectiveUserId)
      .eq('is_active', true)
      .maybeSingle();

    console.log('[MeetingBaaS Connect] Google integration lookup:', {
      found: !!googleIntegration,
      hasRefreshToken: !!googleIntegration?.refresh_token,
      error: googleError?.message,
      hasFallbackToken: !!fallbackAccessToken,
    });

    // Check if we have a refresh token (needed for MeetingBaaS)
    let refreshToken = googleIntegration?.refresh_token;
    let userEmail = googleIntegration?.email;

    if (!refreshToken) {
      // If we don't have a stored refresh token, provide helpful error
      console.warn('[MeetingBaaS Connect] No refresh token available for user:', effectiveUserId);

      return jsonResponse({
        success: false,
        error: 'Google Calendar refresh token not found. Please reconnect Google Calendar with offline access enabled.',
        recovery: 'Visit the Integrations page and reconnect your Google Calendar to enable automatic recording setup.',
      }, req, 400);
    }

    // Check if calendar already connected to MeetingBaaS
    const { data: existingConnection } = await supabase
      .from('meetingbaas_calendars')
      .select('id, meetingbaas_calendar_id')
      .eq('user_id', effectiveUserId)
      .eq('raw_calendar_id', calendar_id)
      .maybeSingle();

    if (existingConnection?.meetingbaas_calendar_id) {
      return jsonResponse({
        success: true,
        message: 'Calendar already connected to MeetingBaaS',
        calendar_id: existingConnection.meetingbaas_calendar_id
      }, req);
    }

    // Create calendar in MeetingBaaS
    const { data: mbCalendar, error: mbError, errorData: mbErrorData } = await createMeetingBaaSCalendar(
      meetingbaasApiKey,
      {
        oauth_client_id: googleClientId,
        oauth_client_secret: googleClientSecret,
        // Use the validated refresh token (googleIntegration may be null due to maybeSingle())
        oauth_refresh_token: refreshToken,
        raw_calendar_id: calendar_id,
        calendar_platform: 'google',
      }
    );

    // Handle case where calendar already exists in MeetingBaaS but not in our DB
    let finalMbCalendar = mbCalendar;
    if (mbError && mbError.includes('already exists')) {
      console.log('[MeetingBaaS Connect] Calendar already exists in MeetingBaaS, fetching existing calendars...');

      // Some MeetingBaaS error payloads include the existing calendar id — try to use it first
      const existingIdCandidate =
        (mbErrorData && typeof mbErrorData === 'object' && (mbErrorData as any).id) ||
        (mbErrorData && typeof mbErrorData === 'object' && (mbErrorData as any).calendar_id) ||
        (mbErrorData && typeof mbErrorData === 'object' && (mbErrorData as any).calendar?.id);

      if (typeof existingIdCandidate === 'string' && existingIdCandidate.length > 0) {
        finalMbCalendar = {
          id: existingIdCandidate,
          platform: 'google',
          raw_calendar_id: calendar_id,
          email: userEmail || undefined,
          created_at: new Date().toISOString(),
        };
        console.log('[MeetingBaaS Connect] Using existing calendar id from error payload:', existingIdCandidate);
      }
      
      // Try to find the existing calendar by listing all calendars
      const { data: existingCalendars, error: listError } = await listMeetingBaaSCalendars(meetingbaasApiKey);

      console.log('[MeetingBaaS Connect] List calendars result:', {
        listError,
        calendarCount: existingCalendars?.length ?? 0,
        // Log the full calendar objects to see all field names
        calendarsRaw: existingCalendars?.map((c: any) => JSON.stringify(c)),
        calendars: existingCalendars?.map((c: any) => ({
          id: c.id,
          calendar_id: c.calendar_id,
          calendarId: c.calendarId,
          uuid: c.uuid,
          raw_calendar_id: c.raw_calendar_id,
          rawCalendarId: c.rawCalendarId,
          platform: c.platform,
          email: c.email,
        })),
        lookingFor: calendar_id,
        userEmail,
      });

      if (!listError && existingCalendars && !finalMbCalendar) {
        // Find the calendar matching our raw_calendar_id OR user email
        const matchingCalendar = existingCalendars.find((cal: any) => {
          const rawId =
            cal?.raw_calendar_id ??
            cal?.rawCalendarId ??
            cal?.raw_calendarId ??
            cal?.calendar_id ??
            cal?.calendarId ??
            null;
          const calEmail = cal?.email ?? null;
          const platform = String(cal?.platform ?? cal?.calendar_platform ?? '').toLowerCase();
          const isGoogle = !platform || platform.includes('google');

          // Match by raw_calendar_id OR by email (for "primary" calendar)
          const matchesRawId = rawId === calendar_id;
          const matchesPrimary = calendar_id === 'primary' && calEmail === userEmail;

          console.log('[MeetingBaaS Connect] Checking calendar:', {
            calId: cal.id,
            rawId,
            calEmail,
            platform,
            isGoogle,
            matchesRawId,
            matchesPrimary,
          });

          return (matchesRawId || matchesPrimary) && isGoogle;
        });

        if (matchingCalendar) {
          // Extract the calendar ID from the matching calendar (handle different field names)
          const extractedId = matchingCalendar.id ?? matchingCalendar.calendar_id ?? matchingCalendar.calendarId ?? matchingCalendar.uuid;
          console.log('[MeetingBaaS Connect] Found existing calendar in MeetingBaaS:', {
            extractedId,
            rawCalendar: JSON.stringify(matchingCalendar),
          });
          // Normalize the calendar object to ensure it has an `id` field
          finalMbCalendar = {
            ...matchingCalendar,
            id: extractedId,
          };
        } else {
          // If we still can't match but there's only one Google calendar, use it
          const googleCalendars = existingCalendars.filter((cal: any) => {
            const platform = String(cal?.platform ?? cal?.calendar_platform ?? '').toLowerCase();
            return !platform || platform.includes('google');
          });

          if (googleCalendars.length === 1) {
            const singleCal = googleCalendars[0];
            const extractedId = singleCal.id ?? singleCal.calendar_id ?? singleCal.calendarId ?? singleCal.uuid;
            console.log('[MeetingBaaS Connect] Only one Google calendar found, using it:', {
              extractedId,
              rawCalendar: JSON.stringify(singleCal),
            });
            finalMbCalendar = {
              ...singleCal,
              id: extractedId,
            };
          } else {
            console.error('[MeetingBaaS Connect] Calendar exists but could not find matching calendar. Google calendars:', googleCalendars.length);
            return errorResponse(
              'Calendar already exists in MeetingBaaS but could not be retrieved. Please disconnect/reconnect Google Calendar and try again.',
              req,
              409
            );
          }
        }
      } else if (listError && !finalMbCalendar) {
        console.error('[MeetingBaaS Connect] Failed to list calendars:', listError);
        return errorResponse(mbError || 'Failed to connect calendar', req, 500);
      }
    } else if (mbError || !mbCalendar) {
      console.error('[MeetingBaaS Connect] Failed to create calendar:', mbError);
      return errorResponse(mbError || 'Failed to connect calendar', req, 500);
    }

    // Safety net: by here we must have a MeetingBaaS calendar
    if (!finalMbCalendar) {
      return errorResponse('Failed to connect calendar', req, 500);
    }

    // Get user's org_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', effectiveUserId)
      .single();

    const orgId = profile?.org_id;

    // Generate webhook token for the org if it doesn't exist
    let webhookToken: string | null = null;
    if (orgId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('recording_settings')
        .eq('id', orgId)
        .single();

      const currentSettings = org?.recording_settings || {};
      webhookToken = currentSettings.webhook_token;

      // Generate a new webhook token if one doesn't exist
      if (!webhookToken) {
        webhookToken = crypto.randomUUID();

        const { error: updateError } = await supabase
          .from('organizations')
          .update({
            recording_settings: {
              ...currentSettings,
              webhook_token: webhookToken,
              meetingbaas_enabled: true,
            }
          })
          .eq('id', orgId);

        if (updateError) {
          console.error('[MeetingBaaS Connect] Failed to save webhook token:', updateError);
        } else {
          console.log(`[MeetingBaaS Connect] Generated webhook token for org ${orgId}`);
        }
      }
    }

    // Log what we have before safety check
    console.log('[MeetingBaaS Connect] Before safety check, finalMbCalendar:', {
      hasCalendar: !!finalMbCalendar,
      id: finalMbCalendar?.id,
      calendar_id: (finalMbCalendar as any)?.calendar_id,
      calendarId: (finalMbCalendar as any)?.calendarId,
      uuid: (finalMbCalendar as any)?.uuid,
      fullObject: JSON.stringify(finalMbCalendar),
    });

    // Try to extract ID from various possible field names
    const calendarId = finalMbCalendar.id ??
                       (finalMbCalendar as any).calendar_id ??
                       (finalMbCalendar as any).calendarId ??
                       (finalMbCalendar as any).uuid;

    // Normalize the ID onto the object
    if (calendarId && !finalMbCalendar.id) {
      console.log('[MeetingBaaS Connect] Normalizing calendar ID from alternative field:', calendarId);
      finalMbCalendar.id = calendarId;
    }

    // Final safety check: ensure we have a valid calendar ID
    if (!finalMbCalendar.id) {
      console.error('[MeetingBaaS Connect] finalMbCalendar has no ID:', JSON.stringify(finalMbCalendar));
      return errorResponse('Failed to get calendar ID from MeetingBaaS', req, 500);
    }

    // Store the connection in our database
    const upsertData = {
      user_id: effectiveUserId,
      org_id: orgId,
      meetingbaas_calendar_id: finalMbCalendar.id,
      raw_calendar_id: calendar_id,
      platform: 'google',
      email: userEmail || finalMbCalendar.email,
      name: finalMbCalendar.name,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log('[MeetingBaaS Connect] Upserting calendar record:', upsertData);

    const { error: insertError } = await supabase
      .from('meetingbaas_calendars')
      .upsert(upsertData, {
        onConflict: 'user_id,raw_calendar_id'
      });

    if (insertError) {
      console.error('[MeetingBaaS Connect] Failed to store connection:', insertError);
      console.error('[MeetingBaaS Connect] Insert error details:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
      });
      // Return error - we need the DB record for the UI to work
      return errorResponse(
        `Calendar connected to MeetingBaaS but failed to save: ${insertError.message}`,
        req,
        500
      );
    }

    // Build webhook URL for reference
    const webhookUrl = webhookToken
      ? `${supabaseUrl}/functions/v1/meetingbaas-webhook?token=${webhookToken}`
      : null;

    console.log(`[MeetingBaaS Connect] Calendar connected: ${finalMbCalendar.id} for user ${effectiveUserId}`);

    // =========================================================================
    // NATIVE BOT SCHEDULING: Automatically schedule bots for all calendar events
    // This eliminates the need for our polling auto-join-scheduler cron job
    // =========================================================================
    let botSchedulingResult: { success: boolean; error?: string } = { success: false };

    // Check if user has notetaker settings enabled
    const { data: notetakerSettings } = await supabase
      .from('notetaker_user_settings')
      .select('is_enabled, record_external, record_internal, selected_calendar_id')
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    // Check org's auto-record settings
    const { data: orgSettings } = await supabase
      .from('organizations')
      .select('recording_settings, name')
      .eq('id', orgId)
      .single();

    const recordingSettings = orgSettings?.recording_settings || {};
    const autoRecordEnabled = recordingSettings.auto_record_enabled === true;
    const userNotetakerEnabled = notetakerSettings?.is_enabled !== false; // Default to enabled

    console.log('[MeetingBaaS Connect] Auto-record check:', {
      orgAutoRecordEnabled: autoRecordEnabled,
      userNotetakerEnabled,
      recordExternal: notetakerSettings?.record_external,
      recordInternal: notetakerSettings?.record_internal,
    });

    if (autoRecordEnabled && userNotetakerEnabled) {
      // Configure bot with org/user preferences
      const botConfig: MeetingBaaSBotConfig = {
        bot_name: recordingSettings.bot_name || '60 Notetaker',
        bot_image: recordingSettings.bot_avatar || 'https://app.use60.com/60-avatar.png',
        recording_mode: 'audio_and_video',
        speech_to_text: {
          provider: 'Gladia', // Use Gladia for better transcription
        },
        automatic_leave: {
          waiting_room_timeout: 600, // 10 minutes
          noone_joined_timeout: 300, // 5 minutes
          everyone_left_timeout: 60, // 1 minute
        },
        // Include org/user context for webhook processing
        extra: {
          org_id: orgId,
          user_id: effectiveUserId,
          org_name: orgSettings?.name,
        },
      };

      botSchedulingResult = await scheduleMeetingBaaSBots(
        meetingbaasApiKey,
        finalMbCalendar.id,
        botConfig
      );

      if (botSchedulingResult.success) {
        console.log(`[MeetingBaaS Connect] Native bot scheduling enabled for calendar: ${finalMbCalendar.id}`);

        // Update the meetingbaas_calendars record to indicate bot scheduling is active
        await supabase
          .from('meetingbaas_calendars')
          .update({
            bot_scheduling_enabled: true,
            updated_at: new Date().toISOString(),
          })
          .eq('meetingbaas_calendar_id', finalMbCalendar.id);
      } else {
        console.warn('[MeetingBaaS Connect] Failed to enable native bot scheduling:', botSchedulingResult.error);
        // Don't fail the whole operation - calendar is still connected
      }
    } else {
      console.log('[MeetingBaaS Connect] Skipping bot scheduling - auto-record not enabled');
    }

    return jsonResponse({
      success: true,
      message: 'Calendar connected to MeetingBaaS successfully',
      calendar: {
        id: finalMbCalendar.id,
        platform: finalMbCalendar.platform,
        raw_calendar_id: finalMbCalendar.raw_calendar_id,
        email: userEmail || finalMbCalendar.email,
      },
      webhook_url: webhookUrl,
      bot_scheduling: {
        enabled: botSchedulingResult.success,
        error: botSchedulingResult.error,
      },
    }, req);

  } catch (error) {
    console.error('[MeetingBaaS Connect] Error:', error);

    await captureException(error, {
      tags: {
        function: 'meetingbaas-connect-calendar',
        integration: 'meetingbaas',
      },
    });

    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    }, req, 500);
  }
});

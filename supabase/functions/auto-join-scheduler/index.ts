/**
 * Auto-Join Scheduler Edge Function
 *
 * Automatically deploys recording bots to upcoming calendar events.
 * Runs every 1-2 minutes via Supabase cron or external scheduler.
 *
 * Features:
 * - Queries calendar events starting within configurable lead time
 * - Filters for events with video call links (Zoom, Meet, Teams)
 * - Optionally filters for external attendees only
 * - Deploys bots only if not already recording
 *
 * Endpoint: POST /functions/v1/auto-join-scheduler
 * (Called by cron job with service role key)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import {
  isValidMeetingUrl,
  detectMeetingPlatform,
  isInternalEmail,
} from '../_shared/meetingbaas.ts';

// =============================================================================
// Types
// =============================================================================

interface RecordingSettings {
  bot_name?: string;
  bot_image_url?: string | null;
  entry_message_enabled?: boolean;
  entry_message?: string;
  recordings_enabled?: boolean;
  auto_record_enabled?: boolean;
  auto_record_lead_time_minutes?: number;
  auto_record_external_only?: boolean;
  webhook_token?: string;
}

interface OrgWithSettings {
  id: string;
  name: string;
  company_domain: string | null;
  recording_settings: RecordingSettings | null;
}

interface NotetakerUserSettings {
  user_id: string;
  org_id: string;
  is_enabled: boolean;
  auto_record_external: boolean;
  auto_record_internal: boolean;
  selected_calendar_id: string | null;
}

interface MeetingBaaSCalendar {
  id: string;
  user_id: string;
  org_id: string;
  calendar_id: string | null;
  bot_scheduling_enabled: boolean;
}

interface CalendarEvent {
  id: string;
  user_id: string;
  org_id: string | null;
  title: string;
  start_time: string;
  end_time: string;
  meeting_url: string | null;
  attendees_count: number;
  organizer_email: string | null;
  calendar_id: string | null;
  raw_data: {
    attendees?: Array<{ email: string; responseStatus?: string }>;
  } | null;
}

interface SchedulerResult {
  success: boolean;
  processed_orgs: number;
  events_checked: number;
  bots_deployed: number;
  errors: string[];
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_LEAD_TIME_MINUTES = 2;
const SCHEDULER_WINDOW_MINUTES = 3; // Check events starting in the next 3 minutes

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract attendee emails from raw event data
 */
function getAttendeeEmails(event: CalendarEvent): string[] {
  if (!event.raw_data?.attendees) {
    return [];
  }
  return event.raw_data.attendees
    .filter(a => a.email)
    .map(a => a.email.toLowerCase());
}

/**
 * Check if event has external attendees
 */
function hasExternalAttendees(
  attendeeEmails: string[],
  internalDomain: string | null
): boolean {
  if (!internalDomain || attendeeEmails.length === 0) {
    return true; // If we can't determine, assume external
  }

  return attendeeEmails.some(email => !isInternalEmail(email, internalDomain));
}

/**
 * Check if a recording already exists for this calendar event
 */
async function hasExistingRecording(
  supabase: SupabaseClient,
  calendarEventId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('recordings')
    .select('id, status')
    .eq('calendar_event_id', calendarEventId)
    .not('status', 'eq', 'failed')
    .maybeSingle();

  return !!data;
}

/**
 * Deploy a recording bot for a calendar event
 */
async function deployBotForEvent(
  supabase: SupabaseClient,
  event: CalendarEvent,
  orgId: string
): Promise<{ success: boolean; recording_id?: string; error?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  try {
    // Call the deploy-recording-bot function
    const response = await fetch(`${supabaseUrl}/functions/v1/deploy-recording-bot`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        // Pass the user context so the bot is associated with the right user
        'x-user-id': event.user_id,
      },
      body: JSON.stringify({
        meeting_url: event.meeting_url,
        meeting_title: event.title,
        calendar_event_id: event.id,
        scheduled_time: event.start_time, // Tell MeetingBaaS to wait until this time
        // Auto-join doesn't pass attendees - the webhook will handle this
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      recording_id: result.recording_id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Process a single organization's upcoming events
 * Now respects per-user calendar selection and recording preferences
 * Skips calendars with native MeetingBaaS bot scheduling enabled
 */
async function processOrgEvents(
  supabase: SupabaseClient,
  org: OrgWithSettings,
  windowStart: Date,
  windowEnd: Date
): Promise<{ events_checked: number; bots_deployed: number; errors: string[] }> {
  const result = { events_checked: 0, bots_deployed: 0, errors: [] as string[] };

  const orgSettings = org.recording_settings || {};

  // Get all users who have notetaker enabled for this org
  const { data: enabledUsers, error: usersError } = await supabase
    .from('notetaker_user_settings')
    .select('user_id, org_id, is_enabled, auto_record_external, auto_record_internal, selected_calendar_id')
    .eq('org_id', org.id)
    .eq('is_enabled', true);

  if (usersError) {
    result.errors.push(`Failed to query notetaker users for org ${org.id}: ${usersError.message}`);
    return result;
  }

  if (!enabledUsers || enabledUsers.length === 0) {
    console.log(`[AutoJoin] No users with notetaker enabled for org ${org.id}`);
    return result;
  }

  // Get calendars with native MeetingBaaS bot scheduling enabled
  // These calendars are handled by MeetingBaaS directly, so we skip them
  const { data: nativeSchedulingCalendars, error: calError } = await supabase
    .from('meetingbaas_calendars')
    .select('id, user_id, org_id, calendar_id, bot_scheduling_enabled')
    .eq('org_id', org.id)
    .eq('bot_scheduling_enabled', true);

  if (calError) {
    console.warn(`[AutoJoin] Failed to check native scheduling calendars: ${calError.message}`);
    // Continue anyway - better to potentially duplicate than skip
  }

  // Build a set of user_ids with native bot scheduling enabled
  const usersWithNativeScheduling = new Set<string>(
    (nativeSchedulingCalendars as MeetingBaaSCalendar[] || []).map(c => c.user_id)
  );

  if (usersWithNativeScheduling.size > 0) {
    console.log(`[AutoJoin] ${usersWithNativeScheduling.size} users have native MeetingBaaS bot scheduling (will skip)`);
  }

  console.log(`[AutoJoin] Found ${enabledUsers.length} users with notetaker enabled in org ${org.id}`);

  // Process each user's calendar events
  for (const userSettings of enabledUsers as NotetakerUserSettings[]) {
    // Skip users with native MeetingBaaS bot scheduling enabled
    // MeetingBaaS handles bot deployment automatically for these users
    if (usersWithNativeScheduling.has(userSettings.user_id)) {
      console.log(`[AutoJoin] Skipping user ${userSettings.user_id} - native MeetingBaaS bot scheduling enabled`);
      continue;
    }

    // Build query for this user's calendar events
    let eventsQuery = supabase
      .from('calendar_events')
      .select(`
        id,
        user_id,
        org_id,
        title,
        start_time,
        end_time,
        meeting_url,
        attendees_count,
        organizer_email,
        raw_data,
        calendar_id
      `)
      .eq('user_id', userSettings.user_id)
      .gte('start_time', windowStart.toISOString())
      .lte('start_time', windowEnd.toISOString())
      .not('meeting_url', 'is', null);

    // Filter by selected calendar if specified (not 'primary' or null)
    // Note: 'primary' means use all calendars, specific ID means only that calendar
    if (userSettings.selected_calendar_id && userSettings.selected_calendar_id !== 'primary') {
      eventsQuery = eventsQuery.eq('calendar_id', userSettings.selected_calendar_id);
    }

    const { data: events, error: eventsError } = await eventsQuery;

    if (eventsError) {
      result.errors.push(`Failed to query events for user ${userSettings.user_id}: ${eventsError.message}`);
      continue;
    }

    if (!events || events.length === 0) {
      continue;
    }

    for (const event of events as CalendarEvent[]) {
      result.events_checked++;

      // Skip if no valid meeting URL
      if (!event.meeting_url || !isValidMeetingUrl(event.meeting_url)) {
        continue;
      }

      // Check attendee type based on user preferences
      const attendeeEmails = getAttendeeEmails(event);
      const isExternal = hasExternalAttendees(attendeeEmails, org.company_domain);

      // Skip based on user's external/internal preferences
      if (isExternal && !userSettings.auto_record_external) {
        console.log(`[AutoJoin] Skipping external event (user pref): ${event.title}`);
        continue;
      }
      if (!isExternal && !userSettings.auto_record_internal) {
        console.log(`[AutoJoin] Skipping internal event (user pref): ${event.title}`);
        continue;
      }

      // Skip if already recording
      const alreadyRecording = await hasExistingRecording(supabase, event.id);
      if (alreadyRecording) {
        console.log(`[AutoJoin] Skipping, already recording: ${event.title}`);
        continue;
      }

      // Deploy bot
      console.log(`[AutoJoin] Deploying bot for: ${event.title} (${event.meeting_url}) [user: ${userSettings.user_id}]`);
      const deployResult = await deployBotForEvent(supabase, event, org.id);

      if (deployResult.success) {
        result.bots_deployed++;
        console.log(`[AutoJoin] Bot deployed, recording_id: ${deployResult.recording_id}`);
      } else {
        result.errors.push(`Failed to deploy for event ${event.id}: ${deployResult.error}`);
      }
    }
  }

  return result;
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Only allow POST (from cron) or GET (for manual testing)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return errorResponse('Method not allowed', req, 405);
  }

  const result: SchedulerResult = {
    success: true,
    processed_orgs: 0,
    events_checked: 0,
    bots_deployed: 0,
    errors: [],
  };

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    // Use service role for cross-org access
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Calculate time window
    const now = new Date();
    const windowStart = now;
    const windowEnd = new Date(now.getTime() + SCHEDULER_WINDOW_MINUTES * 60 * 1000);

    console.log(`[AutoJoin] Checking events from ${windowStart.toISOString()} to ${windowEnd.toISOString()}`);

    // Get all organizations with auto_record_enabled
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name, company_domain, recording_settings')
      .eq('recording_settings->>auto_record_enabled', 'true')
      .eq('recording_settings->>recordings_enabled', 'true');

    if (orgsError) {
      throw new Error(`Failed to fetch organizations: ${orgsError.message}`);
    }

    if (!orgs || orgs.length === 0) {
      console.log('[AutoJoin] No organizations with auto-record enabled');
      return jsonResponse(result, req);
    }

    console.log(`[AutoJoin] Processing ${orgs.length} organizations`);

    // Process each organization
    for (const org of orgs as OrgWithSettings[]) {
      result.processed_orgs++;

      const settings = org.recording_settings || {};
      const leadTime = settings.auto_record_lead_time_minutes ?? DEFAULT_LEAD_TIME_MINUTES;

      // Adjust window based on lead time
      // Events starting between (now + leadTime - 1min) and (now + leadTime + 2min)
      const orgWindowStart = new Date(now.getTime() + (leadTime - 1) * 60 * 1000);
      const orgWindowEnd = new Date(now.getTime() + (leadTime + SCHEDULER_WINDOW_MINUTES) * 60 * 1000);

      try {
        const orgResult = await processOrgEvents(supabase, org, orgWindowStart, orgWindowEnd);
        result.events_checked += orgResult.events_checked;
        result.bots_deployed += orgResult.bots_deployed;
        result.errors.push(...orgResult.errors);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Org ${org.id}: ${errorMsg}`);
      }
    }

    console.log(`[AutoJoin] Complete: ${result.bots_deployed} bots deployed, ${result.events_checked} events checked`);

    return jsonResponse(result, req);
  } catch (error) {
    console.error('[AutoJoin] Scheduler error:', error);
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    return jsonResponse(result, req, 500);
  }
});

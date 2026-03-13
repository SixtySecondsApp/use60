/**
 * brain-initial-scan — First 24h Onboarding Scan
 *
 * Triggered on first login or first calendar connection. Scans the user's
 * existing data and creates 2-5 Command Centre items so the brain "does
 * something visible" immediately.
 *
 * Scan targets:
 *   1. Stale deals — updated_at > 14 days ago, still active
 *   2. Upcoming meetings — calendar events in next 7 days
 *   3. Contacts needing follow-up — no activity in 30+ days
 *   4. If no calendar: prompt to connect
 *
 * If calendar is connected and an upcoming meeting exists, dispatches a
 * calendar_event_created event to trigger the pre-call research chain.
 *
 * US-034: First 24h onboarding
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { writeToCommandCentre, writeMultipleItems } from '../_shared/commandCentre/writeAdapter.ts';
import type { WriteItemParams } from '../_shared/commandCentre/types.ts';

// =============================================================================
// Types
// =============================================================================

interface ScanRequest {
  user_id: string;
  org_id: string;
  trigger: 'first_login' | 'calendar_connected';
}

// =============================================================================
// Constants
// =============================================================================

const MAX_ONBOARDING_ITEMS = 5;
const STALE_DEAL_DAYS = 14;
const FOLLOW_UP_DAYS = 30;
const UPCOMING_MEETING_DAYS = 7;

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse('Missing Supabase configuration', req, 500);
    }

    // Auth: accept JWT or internal call header
    const authHeader = req.headers.get('Authorization');
    const internalCall = req.headers.get('x-internal-call');

    let authenticatedUserId: string | null = null;

    if (internalCall === 'true') {
      // Internal call — trust the user_id in the body
    } else if (authHeader) {
      // Validate JWT
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return errorResponse('Unauthorized', req, 401);
      }
      authenticatedUserId = user.id;
    } else {
      return errorResponse('Unauthorized', req, 401);
    }

    const body: ScanRequest = await req.json();
    const { user_id, org_id, trigger } = body;

    if (!user_id || !org_id || !trigger) {
      return errorResponse('Missing required fields: user_id, org_id, trigger', req, 400);
    }

    // If JWT auth, ensure user_id matches the authenticated user
    if (authenticatedUserId && authenticatedUserId !== user_id) {
      return errorResponse('user_id does not match authenticated user', req, 403);
    }

    // Service role client for data queries
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Check if user already has CC items (skip if >5 exist — not first time)
    const { data: existingItems, error: countError } = await supabase
      .from('command_centre_items')
      .select('id')
      .eq('user_id', user_id)
      .eq('org_id', org_id)
      .limit(6);

    if (countError) {
      console.error('[brain-initial-scan] Failed to check existing CC items:', countError.message);
      return errorResponse('Failed to check existing items', req, 500);
    }

    if (existingItems && existingItems.length > 5) {
      console.log(`[brain-initial-scan] User ${user_id} already has ${existingItems.length} CC items — skipping onboarding scan`);
      return jsonResponse({ skipped: true, reason: 'user_has_items', count: existingItems.length }, req);
    }

    console.log(`[brain-initial-scan] Starting onboarding scan for user=${user_id}, org=${org_id}, trigger=${trigger}`);

    const ccItems: WriteItemParams[] = [];
    let dispatchedMeetingPrep = false;

    // =========================================================================
    // 1. Stale Deals — updated_at > STALE_DEAL_DAYS ago, status not won/lost
    // =========================================================================
    const staleCutoff = new Date(Date.now() - STALE_DEAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleDeals } = await supabase
      .from('deals')
      .select('id, name, updated_at, value, company')
      .eq('owner_id', user_id)
      .lt('updated_at', staleCutoff)
      .not('status', 'in', '("won","lost")')
      .order('value', { ascending: false })
      .limit(3);

    for (const deal of staleDeals ?? []) {
      if (ccItems.length >= MAX_ONBOARDING_ITEMS) break;
      const daysSince = Math.floor(
        (Date.now() - new Date(deal.updated_at).getTime()) / (24 * 60 * 60 * 1000),
      );
      ccItems.push({
        org_id,
        user_id,
        source_agent: 'notification-bridge',
        item_type: 'deal_action',
        title: `Stale deal: ${deal.name || deal.company || 'Unnamed'} needs attention`,
        summary: `No activity for ${daysSince} days. ${deal.value ? `Deal value: $${Number(deal.value).toLocaleString()}.` : ''} Consider reaching out to keep momentum.`,
        context: { onboarding: true, deal_id: deal.id, days_stale: daysSince },
        urgency: daysSince > 21 ? 'high' : 'normal',
        deal_id: deal.id,
        skip_dedup: true,
      });
    }

    // =========================================================================
    // 2. Upcoming Meetings — calendar events in next 7 days
    // =========================================================================
    const now = new Date().toISOString();
    const upcomingCutoff = new Date(Date.now() + UPCOMING_MEETING_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: upcomingMeetings } = await supabase
      .from('calendar_events')
      .select('id, title, start_time, attendees')
      .eq('user_id', user_id)
      .gte('start_time', now)
      .lte('start_time', upcomingCutoff)
      .order('start_time', { ascending: true })
      .limit(3);

    const hasCalendarEvents = (upcomingMeetings ?? []).length > 0;

    for (const meeting of upcomingMeetings ?? []) {
      if (ccItems.length >= MAX_ONBOARDING_ITEMS) break;
      const meetingDate = new Date(meeting.start_time);
      const daysUntil = Math.ceil(
        (meetingDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      );
      const attendeeCount = Array.isArray(meeting.attendees)
        ? (meeting.attendees as unknown[]).length
        : 0;

      ccItems.push({
        org_id,
        user_id,
        source_agent: 'meeting-prep',
        item_type: 'meeting_prep',
        title: `Prep: ${meeting.title || 'Upcoming meeting'}`,
        summary: `In ${daysUntil} day${daysUntil !== 1 ? 's' : ''}${attendeeCount > 0 ? ` with ${attendeeCount} attendee${attendeeCount !== 1 ? 's' : ''}` : ''}. I'll prepare a research brief before the call.`,
        context: { onboarding: true, calendar_event_id: meeting.id },
        urgency: daysUntil <= 1 ? 'high' : 'normal',
        skip_dedup: true,
      });
    }

    // Dispatch pre-call chain for the next meeting if calendar was just connected
    if (trigger === 'calendar_connected' && upcomingMeetings && upcomingMeetings.length > 0) {
      const nextMeeting = upcomingMeetings[0];
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/agent-trigger`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'x-internal-call': 'true',
          },
          body: JSON.stringify({
            event: 'calendar_event_created',
            payload: {
              id: nextMeeting.id,
              title: nextMeeting.title,
              start_time: nextMeeting.start_time,
              attendees: nextMeeting.attendees,
            },
            organization_id: org_id,
            user_id,
          }),
        });

        dispatchedMeetingPrep = response.ok;
        console.log(`[brain-initial-scan] Dispatched calendar_event_created for meeting ${nextMeeting.id}: ok=${response.ok}`);
      } catch (err) {
        console.error('[brain-initial-scan] Failed to dispatch calendar_event_created:', err);
      }
    }

    // =========================================================================
    // 3. Contacts Needing Follow-up — last activity > 30 days ago
    // =========================================================================
    const followUpCutoff = new Date(Date.now() - FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleContacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company, updated_at')
      .eq('owner_id', user_id)
      .lt('updated_at', followUpCutoff)
      .order('updated_at', { ascending: true })
      .limit(3);

    for (const contact of staleContacts ?? []) {
      if (ccItems.length >= MAX_ONBOARDING_ITEMS) break;
      const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown';
      const daysSince = Math.floor(
        (Date.now() - new Date(contact.updated_at).getTime()) / (24 * 60 * 60 * 1000),
      );

      ccItems.push({
        org_id,
        user_id,
        source_agent: 'notification-bridge',
        item_type: 'follow_up',
        title: `Follow up with ${contactName}${contact.company ? ` at ${contact.company}` : ''}`,
        summary: `No activity for ${daysSince} days. A quick check-in could keep this relationship warm.`,
        context: { onboarding: true, contact_id: contact.id, days_since_activity: daysSince },
        urgency: 'normal',
        contact_id: contact.id,
        skip_dedup: true,
      });
    }

    // =========================================================================
    // 4. If no calendar events: suggest connecting calendar
    // =========================================================================
    if (!hasCalendarEvents && trigger === 'first_login' && ccItems.length < MAX_ONBOARDING_ITEMS) {
      ccItems.push({
        org_id,
        user_id,
        source_agent: 'notification-bridge',
        item_type: 'insight',
        title: 'Connect your calendar and I\'ll prep your first meeting',
        summary: 'Once your calendar is connected, I\'ll automatically research attendees, pull deal context, and send you a brief before every call.',
        context: { onboarding: true, action: 'connect_calendar' },
        urgency: 'normal',
        skip_dedup: true,
      });
    }

    // =========================================================================
    // Write all items to Command Centre
    // =========================================================================
    let createdIds: string[] = [];
    if (ccItems.length > 0) {
      createdIds = await writeMultipleItems(ccItems);
      console.log(`[brain-initial-scan] Created ${createdIds.length} CC items for user=${user_id}`);
    } else {
      // No data at all — create a welcome item
      const welcomeId = await writeToCommandCentre({
        org_id,
        user_id,
        source_agent: 'notification-bridge',
        item_type: 'insight',
        title: 'Welcome to 60 Brain',
        summary: 'I\'m scanning your pipeline, calendar, and contacts. As data flows in, I\'ll surface actions here — follow-ups, meeting prep, deal alerts, and more.',
        context: { onboarding: true, action: 'welcome' },
        urgency: 'normal',
        skip_dedup: true,
      });
      if (welcomeId) createdIds = [welcomeId];
      console.log(`[brain-initial-scan] No data found — created welcome item for user=${user_id}`);
    }

    // Mark onboarding scan as complete in user_settings
    try {
      await supabase
        .from('user_settings')
        .upsert(
          {
            user_id,
            key: 'brain_onboarding_scan_completed',
            value: JSON.stringify({
              completed_at: new Date().toISOString(),
              trigger,
              items_created: createdIds.length,
            }),
          },
          { onConflict: 'user_id,key' },
        );
    } catch (err) {
      console.warn('[brain-initial-scan] Could not save onboarding flag:', err);
    }

    return jsonResponse(
      {
        success: true,
        items_created: createdIds.length,
        item_ids: createdIds,
        dispatched_meeting_prep: dispatchedMeetingPrep,
        trigger,
      },
      req,
    );
  } catch (err) {
    console.error('[brain-initial-scan] Unexpected error:', err);
    return errorResponse('Internal server error', req, 500);
  }
});

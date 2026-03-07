/**
 * Microsoft Graph Calendar Edge Function
 *
 * Provides Calendar API access for creating, listing, updating, and deleting events
 * via Microsoft Graph API v1.0.
 *
 * SECURITY:
 * - POST only (no GET for API actions)
 * - User JWT authentication OR service-role with userId in body
 * - Allowlist-based CORS
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';
import { getMicrosoftIntegration, MicrosoftTokenRevokedError } from '../_shared/microsoftOAuth.ts';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

interface CreateEventRequest {
  subject: string;
  startTime: string;
  endTime: string;
  timeZone?: string;
  attendees?: string[];
  location?: string;
  body?: string;
  isOnlineMeeting?: boolean;
}

interface UpdateEventRequest {
  eventId: string;
  subject?: string;
  startTime?: string;
  endTime?: string;
  timeZone?: string;
  attendees?: string[];
  location?: string;
  body?: string;
  isOnlineMeeting?: boolean;
}

interface ListEventsRequest {
  startDate: string;
  endDate: string;
  top?: number;
  calendarId?: string;
}

interface AvailabilityRequest {
  schedules: string[];
  startTime: string;
  endTime: string;
  availabilityViewInterval?: number;
}

async function graphRequest(
  accessToken: string,
  url: string,
  method: string = 'GET',
  body?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST.', req, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const url = new URL(req.url);
    let action = url.searchParams.get('action');
    const requestBody = await req.json();

    if (!action && requestBody?.action) {
      action = requestBody.action;
    }

    const { userId, mode } = await authenticateRequest(
      req,
      supabase,
      supabaseServiceKey,
      requestBody.userId
    );

    console.log(`[ms-graph-calendar] Authenticated as ${mode}, userId: ${userId}, action: ${action}`);

    // Get Microsoft integration with valid access token
    let result;
    try {
      result = await getMicrosoftIntegration(supabase, userId);
    } catch (err) {
      if (err instanceof MicrosoftTokenRevokedError) {
        return errorResponse(
          'Microsoft access has been revoked. Please reconnect your Microsoft account in Settings > Integrations.',
          req,
          403
        );
      }
      throw err;
    }

    if (!result) {
      throw new Error('Microsoft integration not found. Please connect your Microsoft account first.');
    }

    const accessToken = result.accessToken;
    let response;

    switch (action) {
      case 'list-calendars':
        response = await listCalendars(accessToken);
        break;

      case 'list-events':
        response = await listEvents(accessToken, requestBody as ListEventsRequest);
        break;

      case 'create-event':
        response = await createEvent(accessToken, requestBody as CreateEventRequest);
        break;

      case 'update-event':
        response = await updateEvent(accessToken, requestBody as UpdateEventRequest);
        break;

      case 'delete-event':
        response = await deleteEvent(accessToken, requestBody.eventId);
        break;

      case 'availability':
        response = await checkAvailability(accessToken, requestBody as AvailabilityRequest);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return jsonResponse(response, req);
  } catch (error: any) {
    console.error('[ms-graph-calendar] Error:', error.message);
    return errorResponse(error.message || 'Calendar service error', req, 400);
  }
});

async function listCalendars(accessToken: string): Promise<any> {
  const resp = await graphRequest(accessToken, `${GRAPH_BASE}/me/calendars`);

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Graph API error: ${err?.error?.message || resp.statusText}`);
  }

  const data = await resp.json();
  return { calendars: data.value || [] };
}

async function listEvents(accessToken: string, request: ListEventsRequest): Promise<any> {
  const { startDate, endDate, top = 50, calendarId } = request;

  if (!startDate || !endDate) {
    throw new Error('startDate and endDate are required for list-events');
  }

  const params = new URLSearchParams({
    startDateTime: startDate,
    endDateTime: endDate,
    $top: String(top),
    $select: 'id,subject,start,end,attendees,onlineMeeting,location,bodyPreview,organizer,isAllDay,showAs,iCalUId,webLink,body',
    $orderby: 'start/dateTime',
  });

  const base = calendarId
    ? `${GRAPH_BASE}/me/calendars/${encodeURIComponent(calendarId)}/calendarView`
    : `${GRAPH_BASE}/me/calendarView`;

  const resp = await graphRequest(accessToken, `${base}?${params}`);

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Graph API error: ${err?.error?.message || resp.statusText}`);
  }

  const data = await resp.json();
  return {
    events: data.value || [],
    nextLink: data['@odata.nextLink'] || null,
  };
}

async function createEvent(accessToken: string, request: CreateEventRequest): Promise<any> {
  const { subject, startTime, endTime, timeZone = 'UTC', attendees, location, body, isOnlineMeeting } = request;

  if (!subject || !startTime || !endTime) {
    throw new Error('subject, startTime, and endTime are required');
  }

  const eventData: Record<string, unknown> = {
    subject,
    start: { dateTime: startTime, timeZone },
    end: { dateTime: endTime, timeZone },
  };

  if (attendees && attendees.length > 0) {
    eventData.attendees = attendees.map((email) => ({
      emailAddress: { address: email },
      type: 'required',
    }));
  }

  if (location) {
    eventData.location = { displayName: location };
  }

  if (body) {
    eventData.body = { contentType: 'HTML', content: body };
  }

  if (isOnlineMeeting !== false) {
    eventData.isOnlineMeeting = true;
    eventData.onlineMeetingProvider = 'teamsForBusiness';
  }

  const resp = await graphRequest(accessToken, `${GRAPH_BASE}/me/events`, 'POST', eventData);

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Graph API error: ${err?.error?.message || resp.statusText}`);
  }

  const data = await resp.json();
  return {
    success: true,
    eventId: data.id,
    webLink: data.webLink,
    onlineMeetingUrl: data.onlineMeeting?.joinUrl || null,
    startTime: data.start?.dateTime,
    endTime: data.end?.dateTime,
  };
}

async function updateEvent(accessToken: string, request: UpdateEventRequest): Promise<any> {
  const { eventId, subject, startTime, endTime, timeZone = 'UTC', attendees, location, body, isOnlineMeeting } = request;

  if (!eventId) {
    throw new Error('eventId is required for update-event');
  }

  const updateData: Record<string, unknown> = {};

  if (subject) updateData.subject = subject;
  if (startTime) updateData.start = { dateTime: startTime, timeZone };
  if (endTime) updateData.end = { dateTime: endTime, timeZone };
  if (attendees) {
    updateData.attendees = attendees.map((email) => ({
      emailAddress: { address: email },
      type: 'required',
    }));
  }
  if (location) updateData.location = { displayName: location };
  if (body) updateData.body = { contentType: 'HTML', content: body };
  if (isOnlineMeeting !== undefined) {
    updateData.isOnlineMeeting = isOnlineMeeting;
    if (isOnlineMeeting) updateData.onlineMeetingProvider = 'teamsForBusiness';
  }

  const resp = await graphRequest(
    accessToken,
    `${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`,
    'PATCH',
    updateData
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Graph API error: ${err?.error?.message || resp.statusText}`);
  }

  const data = await resp.json();
  return {
    success: true,
    eventId: data.id,
    lastModifiedDateTime: data.lastModifiedDateTime,
  };
}

async function deleteEvent(accessToken: string, eventId: string): Promise<any> {
  if (!eventId) {
    throw new Error('eventId is required for delete-event');
  }

  const resp = await graphRequest(
    accessToken,
    `${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`,
    'DELETE'
  );

  if (!resp.ok && resp.status !== 204) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Graph API error: ${err?.error?.message || resp.statusText}`);
  }

  return { success: true, deleted: true };
}

async function checkAvailability(accessToken: string, request: AvailabilityRequest): Promise<any> {
  const { schedules, startTime, endTime, availabilityViewInterval = 30 } = request;

  if (!schedules || !startTime || !endTime) {
    throw new Error('schedules, startTime, and endTime are required for availability');
  }

  const resp = await graphRequest(
    accessToken,
    `${GRAPH_BASE}/me/calendar/getSchedule`,
    'POST',
    {
      schedules,
      startTime: { dateTime: startTime, timeZone: 'UTC' },
      endTime: { dateTime: endTime, timeZone: 'UTC' },
      availabilityViewInterval,
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Graph API error: ${err?.error?.message || resp.statusText}`);
  }

  const data = await resp.json();
  return {
    schedules: data.value || [],
  };
}

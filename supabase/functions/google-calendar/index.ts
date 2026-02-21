/**
 * Google Calendar Edge Function
 * 
 * Provides Calendar API access for creating, listing, updating, and deleting events.
 * 
 * SECURITY:
 * - POST only (no GET for API actions)
 * - User JWT authentication OR service-role with userId in body
 * - Allowlist-based CORS
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';

async function refreshAccessToken(refreshToken: string, supabase: any, userId: string): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to refresh token: ${errorData.error_description || 'Unknown error'}`);
  }

  const data = await response.json();
  
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 3600));
  
  const { error: updateError } = await supabase
    .from('google_integrations')
    .update({
      access_token: data.access_token,
      expires_at: expiresAt.toISOString(),
    })
    .eq('user_id', userId);
  
  if (updateError) {
    throw new Error('Failed to update access token in database');
  }
  return data.access_token;
}

interface CreateEventRequest {
  calendarId?: string;
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  attendees?: string[];
  location?: string;
}

interface ListEventsRequest {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
}

interface UpdateEventRequest {
  calendarId: string;
  eventId: string;
  summary?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  attendees?: string[];
  location?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  // POST only
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST.', req, 405);
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Parse request
    const url = new URL(req.url);
    let action = url.searchParams.get('action');
    const requestBody = await req.json();
    
    // Backward compatibility: allow action in request body
    if (!action && requestBody?.action) {
      action = requestBody.action;
    }

    // Authenticate - supports both user JWT and service role with userId
    const { userId, mode } = await authenticateRequest(
      req,
      supabase,
      supabaseServiceKey,
      requestBody.userId
    );

    console.log(`[google-calendar] Authenticated as ${mode}, userId: ${userId}, action: ${action}`);

    // Get user's Google integration
    const { data: integration, error: integrationError } = await supabase
      .from('google_integrations')
      .select('access_token, refresh_token, expires_at, id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (integrationError || !integration) {
      throw new Error('Google integration not found. Please connect your Google account first.');
    }

    // Check if token needs refresh
    const expiresAt = new Date(integration.expires_at);
    const now = new Date();
    let accessToken = integration.access_token;
    
    if (expiresAt <= now) {
      accessToken = await refreshAccessToken(integration.refresh_token, supabase, userId);
    }

    let response;

    switch (action) {
      case 'create-event':
        response = await createEvent(accessToken, requestBody as CreateEventRequest);
        break;
      
      case 'list-events':
        response = await listEvents(accessToken, requestBody as ListEventsRequest);
        break;
      
      case 'update-event':
        response = await updateEvent(accessToken, requestBody as UpdateEventRequest);
        break;
      
      case 'delete-event':
        response = await deleteEvent(accessToken, requestBody.calendarId, requestBody.eventId);
        break;
      
      case 'list-calendars':
        response = await listCalendars(accessToken);
        break;
      
      case 'availability':
        response = await checkAvailability(accessToken, requestBody);
        break;

      case 'watch':
        response = await watchCalendar(accessToken, requestBody);
        break;

      case 'stop':
        response = await stopChannel(accessToken, requestBody);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Log the successful operation (non-critical, don't throw on error)
    try {
      await supabase
        .from('google_service_logs')
        .insert({
          integration_id: integration.id,
          service: 'calendar',
          action: action || 'unknown',
          status: 'success',
          request_data: { action, userId },
          response_data: { success: true },
        });
    } catch {
      // Non-critical logging error, ignore
    }

    return jsonResponse(response, req);

  } catch (error: any) {
    console.error('[google-calendar] Error:', error.message);
    return errorResponse(error.message || 'Calendar service error', req, 400);
  }
});

async function createEvent(accessToken: string, request: CreateEventRequest): Promise<any> {
  const calendarId = request.calendarId || 'primary';
  
  const eventData = {
    summary: request.summary,
    description: request.description,
    location: request.location,
    start: {
      dateTime: request.startTime,
      timeZone: 'UTC',
    },
    end: {
      dateTime: request.endTime,
      timeZone: 'UTC',
    },
    attendees: request.attendees?.map(email => ({ email })),
  };

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Calendar API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return {
    success: true,
    eventId: data.id,
    htmlLink: data.htmlLink,
    hangoutLink: data.hangoutLink,
    startTime: data.start.dateTime,
    endTime: data.end.dateTime
  };
}

async function listEvents(accessToken: string, request: ListEventsRequest): Promise<any> {
  const calendarId = request.calendarId || 'primary';
  const params = new URLSearchParams();
  
  if (request.timeMin) params.set('timeMin', request.timeMin);
  if (request.timeMax) params.set('timeMax', request.timeMax);
  if (request.maxResults) params.set('maxResults', request.maxResults.toString());
  params.set('singleEvents', 'true');
  params.set('orderBy', 'startTime');

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Calendar API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return {
    events: data.items || [],
    nextSyncToken: data.nextSyncToken,
    timeZone: data.timeZone
  };
}

async function updateEvent(accessToken: string, request: UpdateEventRequest): Promise<any> {
  const updateData: any = {};
  if (request.summary) updateData.summary = request.summary;
  if (request.description) updateData.description = request.description;
  if (request.location) updateData.location = request.location;
  if (request.startTime) {
    updateData.start = {
      dateTime: request.startTime,
      timeZone: 'UTC',
    };
  }
  if (request.endTime) {
    updateData.end = {
      dateTime: request.endTime,
      timeZone: 'UTC',
    };
  }
  if (request.attendees) {
    updateData.attendees = request.attendees.map(email => ({ email }));
  }

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(request.calendarId)}/events/${request.eventId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updateData),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Calendar API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return {
    success: true,
    eventId: data.id,
    updated: data.updated
  };
}

async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<any> {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Calendar API error: ${errorData.error?.message || 'Unknown error'}`);
  }
  return {
    success: true,
    deleted: true
  };
}

async function listCalendars(accessToken: string): Promise<any> {
  const allCalendars: any[] = [];
  let pageToken: string | undefined;

  // Fetch all pages of calendars (Google Calendar API paginates results)
  do {
    const params = new URLSearchParams();
    params.set('maxResults', '250'); // Max allowed per page
    params.set('showHidden', 'false'); // Skip hidden calendars
    params.set('showDeleted', 'false'); // Skip deleted calendars
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await fetch(`https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Calendar API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      allCalendars.push(...data.items);
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  console.log(`[google-calendar] listCalendars: Found ${allCalendars.length} calendars`);

  return {
    calendars: allCalendars
  };
}

async function checkAvailability(accessToken: string, request: any): Promise<any> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: request.timeMin,
      timeMax: request.timeMax,
      items: [{ id: request.calendarId || 'primary' }]
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Calendar API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return {
    timeMin: data.timeMin,
    timeMax: data.timeMax,
    calendars: data.calendars
  };
}

/**
 * Watch a calendar for push notifications
 *
 * Creates a webhook channel that receives notifications when events change.
 * Google Calendar API will send POST requests to the webhook URL when:
 * - Events are created
 * - Events are updated
 * - Events are deleted
 *
 * @see https://developers.google.com/calendar/api/guides/push
 */
async function watchCalendar(accessToken: string, request: any): Promise<any> {
  const calendarId = request.calendarId || 'primary';
  const channelId = request.channelId;
  const webhookUrl = request.webhookUrl;

  if (!channelId || !webhookUrl) {
    throw new Error('channelId and webhookUrl are required for watch action');
  }

  // Generate unique channel token for verification
  const token = crypto.randomUUID();

  // Set expiration (Google Calendar max is 7 days)
  const expiration = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

  const requestBody = {
    id: channelId,
    type: 'web_hook',
    address: webhookUrl,
    token: token,
    expiration: expiration.toString(),
  };

  console.log('[google-calendar] Creating watch channel:', {
    calendarId,
    channelId,
    webhookUrl,
    expiration: new Date(expiration).toISOString(),
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Calendar watch error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();

  console.log('[google-calendar] Watch channel created:', data);

  return {
    success: true,
    resourceId: data.resourceId,
    expiration: data.expiration,
    channelId: data.id,
    channelToken: token,
  };
}

/**
 * Stop a push notification channel
 *
 * Unsubscribes from push notifications by stopping the webhook channel.
 *
 * @see https://developers.google.com/calendar/api/guides/push#stopping-notifications
 */
async function stopChannel(accessToken: string, request: any): Promise<any> {
  const channelId = request.channelId;
  const resourceId = request.resourceId;

  if (!channelId || !resourceId) {
    throw new Error('channelId and resourceId are required for stop action');
  }

  const requestBody = {
    id: channelId,
    resourceId: resourceId,
  };

  console.log('[google-calendar] Stopping channel:', { channelId, resourceId });

  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/channels/stop',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    // Ignore 404 errors - channel already stopped
    if (response.status === 404) {
      console.log('[google-calendar] Channel already stopped or not found');
      return {
        success: true,
        message: 'Channel already stopped or not found',
      };
    }
    throw new Error(`Calendar stop error: ${errorData.error?.message || 'Unknown error'}`);
  }

  console.log('[google-calendar] Channel stopped successfully');

  return {
    success: true,
    message: 'Channel stopped successfully',
  };
}

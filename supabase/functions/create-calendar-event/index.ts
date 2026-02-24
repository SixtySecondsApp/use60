/// <reference path="../deno.d.ts" />

/**
 * Create Calendar Event Edge Function
 *
 * Creates calendar events in user's Google Calendar with attendees and video conferencing.
 *
 * SECURITY:
 * - POST only
 * - User JWT authentication OR service-role with userId in body
 * - No anonymous access
 *
 * FEATURES:
 * - Creates events in Google Calendar
 * - Adds attendees with email invitations
 * - Optional Google Meet video conferencing link
 * - Returns event ID, HTML link, and hangout link
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';
import { getGoogleIntegration } from '../_shared/googleOAuth.ts';
import { captureException } from '../_shared/sentryEdge.ts';

interface CreateEventRequest {
  userId?: string; // For service-role calls
  start_time: string; // ISO 8601
  end_time: string; // ISO 8601
  title: string;
  description?: string;
  attendee_emails?: string[];
  video_conferencing?: boolean; // Default false
  location?: string;
  timezone?: string; // Default UTC
  send_updates?: 'all' | 'externalOnly' | 'none'; // Default 'all'
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error');
    }

    const body: CreateEventRequest = await req.json();

    // Validate required fields
    if (!body.start_time || !body.end_time || !body.title) {
      throw new Error('start_time, end_time, and title are required');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Authenticate request
    let userId: string;
    if (body.userId) {
      userId = body.userId;
      console.log(`[create-calendar-event] Service call with userId: ${userId}`);
    } else {
      const authResult = await authenticateRequest(
        req,
        supabase,
        supabaseServiceKey,
        undefined
      );
      userId = authResult.userId;
      console.log(`[create-calendar-event] Authenticated as ${authResult.mode}, userId: ${userId}`);
    }

    // Get Google Calendar access
    const { accessToken } = await getGoogleIntegration(supabase, userId);

    // Build event data for Google Calendar API
    const eventData: any = {
      summary: body.title,
      description: body.description || '',
      location: body.location || '',
      start: {
        dateTime: body.start_time,
        timeZone: body.timezone || 'UTC',
      },
      end: {
        dateTime: body.end_time,
        timeZone: body.timezone || 'UTC',
      },
    };

    // Add attendees if provided
    if (body.attendee_emails && body.attendee_emails.length > 0) {
      eventData.attendees = body.attendee_emails.map(email => ({
        email: email.trim(),
      }));
    }

    // Add Google Meet conferencing if requested
    if (body.video_conferencing) {
      eventData.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      };
    }

    // Create event in Google Calendar
    const calendarId = 'primary';
    const params = new URLSearchParams();
    params.set('sendUpdates', body.send_updates || 'all'); // Send invites to attendees
    if (body.video_conferencing) {
      params.set('conferenceDataVersion', '1'); // Required for conferenceData
    }

    const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;

    console.log('[create-calendar-event] Creating event:', {
      title: body.title,
      start: body.start_time,
      end: body.end_time,
      attendees: body.attendee_emails?.length || 0,
      videoConferencing: body.video_conferencing || false,
    });

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      console.error('[create-calendar-event] Google Calendar API error:', {
        status: resp.status,
        statusText: resp.statusText,
        error: errorData.error || errorData,
      });
      throw new Error(`Google Calendar API error: ${errorData.error?.message || resp.statusText}`);
    }

    const createdEvent = await resp.json();

    console.log('[create-calendar-event] Event created successfully:', {
      eventId: createdEvent.id,
      htmlLink: createdEvent.htmlLink,
      hasVideoConferencing: !!createdEvent.hangoutLink,
    });

    // Extract video conference link if available
    let videoLink: string | undefined;
    if (createdEvent.hangoutLink) {
      videoLink = createdEvent.hangoutLink;
    } else if (createdEvent.conferenceData?.entryPoints) {
      // Try to find video entry point
      const videoEntry = createdEvent.conferenceData.entryPoints.find(
        (ep: any) => ep.entryPointType === 'video'
      );
      if (videoEntry) {
        videoLink = videoEntry.uri;
      }
    }

    return jsonResponse({
      success: true,
      event_id: createdEvent.id,
      html_link: createdEvent.htmlLink,
      video_link: videoLink,
      start_time: createdEvent.start.dateTime,
      end_time: createdEvent.end.dateTime,
      attendees: createdEvent.attendees?.map((a: any) => ({
        email: a.email,
        response_status: a.responseStatus,
      })) || [],
    }, req);

  } catch (error: any) {
    console.error('[create-calendar-event] Error:', error);
    await captureException(error, {
      tags: {
        function: 'create-calendar-event',
      },
    });
    return errorResponse(error.message || 'Failed to create calendar event', req, 500);
  }
});

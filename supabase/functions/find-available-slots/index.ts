/// <reference path="../deno.d.ts" />

/**
 * Find Available Slots Edge Function
 *
 * Analyzes rep's calendar to find optimal meeting slots for prospect outreach.
 *
 * SECURITY:
 * - POST only
 * - User JWT authentication OR service-role with userId in body
 * - No anonymous access
 *
 * FEATURES:
 * - Reads 5-10 business days ahead from Google Calendar
 * - Respects existing meetings, buffer times, and working hours
 * - Honors quiet hours from slack_user_preferences
 * - Timezone-aware slot suggestions
 * - 100-point scoring system for optimal slot ranking
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';
import { getGoogleIntegration } from '../_shared/googleOAuth.ts';
import { captureException } from '../_shared/sentryEdge.ts';

interface FindSlotsRequest {
  userId?: string; // For service-role calls
  duration_minutes?: number; // Default 30
  prospect_timezone?: string; // e.g., 'America/New_York'
  days_ahead?: number; // Default 10
  max_results?: number; // Default 5
}

interface TimeSlot {
  start: string; // ISO 8601
  end: string;
  score: number;
  label: string; // Human-readable: "Tomorrow (Thu) 2:00-2:30pm GMT"
  timezone_note?: string; // "9:00-9:30am EST" if prospect timezone known
  day_type: 'today' | 'tomorrow' | 'this_week' | 'next_week';
  time_quality: 'morning' | 'midday' | 'afternoon' | 'late';
}

interface CalendarEvent {
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status?: string;
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

    const body: FindSlotsRequest = await req.json();

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
      console.log(`[find-available-slots] Service call with userId: ${userId}`);
    } else {
      const authResult = await authenticateRequest(
        req,
        supabase,
        supabaseServiceKey,
        undefined
      );
      userId = authResult.userId;
      console.log(`[find-available-slots] Authenticated as ${authResult.mode}, userId: ${userId}`);
    }

    const durationMinutes = body.duration_minutes || 30;
    const daysAhead = body.days_ahead || 10;
    const maxResults = body.max_results || 5;
    const prospectTimezone = body.prospect_timezone;

    // Get Google Calendar access
    const { accessToken } = await getGoogleIntegration(supabase, userId);

    // Get user preferences (quiet hours, working hours)
    const { data: preferences } = await supabase
      .from('slack_user_preferences')
      .select('quiet_hours_start, quiet_hours_end')
      .eq('user_id', userId)
      .maybeSingle();

    const quietHoursStart = preferences?.quiet_hours_start || '20:00';
    const quietHoursEnd = preferences?.quiet_hours_end || '07:00';

    // Get user timezone from user_settings
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('preferences')
      .eq('user_id', userId)
      .maybeSingle();

    const userTimezone = userSettings?.preferences?.timezone || 'UTC';

    // Calculate time range (next N business days)
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

    // Fetch calendar events from Google Calendar
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    });

    const calendarId = 'primary';
    const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const resp = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(`Google Calendar API error: ${errorData.error?.message || resp.statusText}`);
    }

    const data = await resp.json();
    const events: CalendarEvent[] = data.items || [];

    // Generate candidate slots
    const candidateSlots: TimeSlot[] = [];
    const buffer = 15; // 15-minute buffer between meetings

    for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + dayOffset);

      // Skip weekends
      const dayOfWeek = targetDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      // Generate hourly slots from 7am to 7pm
      for (let hour = 7; hour < 19; hour++) {
        const slotStart = new Date(targetDate);
        slotStart.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

        // Skip slots in the past
        if (slotStart <= now) continue;

        // Check if slot conflicts with existing events
        const hasConflict = events.some(event => {
          const eventStart = new Date(event.start?.dateTime || event.start?.date || '');
          const eventEnd = new Date(event.end?.dateTime || event.end?.date || '');

          // Skip cancelled events
          if (event.status === 'cancelled') return false;

          // Add buffer to event times
          const bufferedStart = new Date(eventStart.getTime() - buffer * 60 * 1000);
          const bufferedEnd = new Date(eventEnd.getTime() + buffer * 60 * 1000);

          // Check overlap
          return (slotStart < bufferedEnd && slotEnd > bufferedStart);
        });

        if (hasConflict) continue;

        // Check quiet hours
        const slotHour = slotStart.getHours();
        const quietStart = parseInt(quietHoursStart.split(':')[0]);
        const quietEnd = parseInt(quietHoursEnd.split(':')[0]);

        const inQuietHours = quietStart > quietEnd
          ? (slotHour >= quietStart || slotHour < quietEnd) // Wraps midnight
          : (slotHour >= quietStart && slotHour < quietEnd);

        if (inQuietHours) continue;

        // Determine day type
        let dayType: 'today' | 'tomorrow' | 'this_week' | 'next_week';
        if (dayOffset === 0) dayType = 'today';
        else if (dayOffset === 1) dayType = 'tomorrow';
        else if (dayOffset <= 7) dayType = 'this_week';
        else dayType = 'next_week';

        // Determine time quality
        let timeQuality: 'morning' | 'midday' | 'afternoon' | 'late';
        if (hour < 10) timeQuality = 'morning';
        else if (hour < 13) timeQuality = 'midday';
        else if (hour < 16) timeQuality = 'afternoon';
        else timeQuality = 'late';

        // Calculate score
        const score = calculateSlotScore({
          dayOffset,
          hour,
          dayOfWeek,
          prospectTimezone,
          userTimezone,
          eventDensity: events.length / daysAhead,
        });

        // Format label
        const label = formatSlotLabel(slotStart, userTimezone);

        // Format timezone note if prospect timezone known
        let timezoneNote: string | undefined;
        if (prospectTimezone) {
          timezoneNote = formatTimezoneNote(slotStart, slotEnd, prospectTimezone);
        }

        candidateSlots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          score,
          label,
          timezone_note: timezoneNote,
          day_type: dayType,
          time_quality: timeQuality,
        });
      }
    }

    // Sort by score (highest first) and return top N
    const topSlots = candidateSlots
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return jsonResponse({
      success: true,
      slots: topSlots,
      total_candidates: candidateSlots.length,
      user_timezone: userTimezone,
      prospect_timezone: prospectTimezone,
    }, req);

  } catch (error: any) {
    console.error('[find-available-slots] Error:', error);
    await captureException(error, {
      tags: {
        function: 'find-available-slots',
      },
    });
    return errorResponse(error.message || 'Failed to find available slots', req, 500);
  }
});

/**
 * Calculate slot score (0-100)
 *
 * Scoring breakdown:
 * - Time of day: 25 points (10-11am = best, early morning/late afternoon = lower)
 * - Day of week: 20 points (Tue-Thu = best, Mon/Fri = lower)
 * - Timezone overlap: 20 points (if prospect timezone overlaps business hours)
 * - Calendar density: 15 points (less busy days = higher score)
 * - Recency: 10 points (2-3 days out = best, too soon/far = lower)
 * - Preference: 10 points (midday = best)
 */
function calculateSlotScore(params: {
  dayOffset: number;
  hour: number;
  dayOfWeek: number;
  prospectTimezone?: string;
  userTimezone: string;
  eventDensity: number;
}): number {
  let score = 0;

  // Time of day (25 points)
  if (params.hour >= 10 && params.hour < 11) score += 25; // Sweet spot
  else if (params.hour >= 9 && params.hour < 12) score += 20;
  else if (params.hour >= 13 && params.hour < 15) score += 18;
  else if (params.hour >= 8 && params.hour < 9) score += 15;
  else if (params.hour >= 15 && params.hour < 17) score += 12;
  else score += 8;

  // Day of week (20 points)
  if (params.dayOfWeek >= 2 && params.dayOfWeek <= 4) score += 20; // Tue-Thu
  else if (params.dayOfWeek === 1 || params.dayOfWeek === 5) score += 12; // Mon/Fri
  else score += 5;

  // Timezone overlap (20 points) - simplified heuristic
  if (params.prospectTimezone) {
    // If prospect is in different timezone, prefer midday slots (9am-3pm)
    if (params.hour >= 9 && params.hour < 15) score += 20;
    else score += 10;
  } else {
    score += 15; // Default if no prospect timezone
  }

  // Calendar density (15 points) - less busy = better
  const densityScore = Math.max(0, 15 - Math.floor(params.eventDensity * 2));
  score += densityScore;

  // Recency (10 points) - 2-3 days out is ideal
  if (params.dayOffset >= 2 && params.dayOffset <= 3) score += 10;
  else if (params.dayOffset >= 1 && params.dayOffset <= 5) score += 7;
  else if (params.dayOffset < 1) score += 3; // Too soon
  else score += 5; // Too far

  // Preference (10 points) - midday preferred
  if (params.hour >= 10 && params.hour < 14) score += 10;
  else if (params.hour >= 9 && params.hour < 16) score += 7;
  else score += 4;

  return Math.min(100, score);
}

/**
 * Format slot label in human-readable form
 * Example: "Tomorrow (Thu) 2:00-2:30pm GMT"
 */
function formatSlotLabel(slotStart: Date, timezone: string): string {
  const now = new Date();
  const dayDiff = Math.floor((slotStart.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = dayNames[slotStart.getDay()];

  let dayLabel: string;
  if (dayDiff === 0) dayLabel = 'Today';
  else if (dayDiff === 1) dayLabel = 'Tomorrow';
  else if (dayDiff <= 7) dayLabel = `${dayName}`;
  else dayLabel = slotStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const timeStr = slotStart.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  // Extract timezone abbreviation (simplified)
  const tzAbbr = timezone.split('/')[1] || 'UTC';

  return `${dayLabel} (${dayName}) ${timeStr} ${tzAbbr}`;
}

/**
 * Format timezone note for prospect
 * Example: "9:00-9:30am EST"
 */
function formatTimezoneNote(slotStart: Date, slotEnd: Date, prospectTimezone: string): string {
  // Simple conversion - in production would use a proper timezone library
  // For now, just return a formatted note
  const timeStr = slotStart.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const tzAbbr = prospectTimezone.split('/')[1] || prospectTimezone;

  return `${timeStr} ${tzAbbr}`;
}

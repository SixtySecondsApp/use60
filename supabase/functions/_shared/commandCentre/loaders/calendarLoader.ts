/**
 * Calendar Context Loader — CC10-003
 *
 * Loads upcoming and recent meetings from the `calendar_events` table.
 *
 * Filters:
 * - attendees_count > 1  (excludes solo focus time / reminders, per CLAUDE.md)
 * - contact_id match (when provided) OR deal_id match (when provided)
 * - Falls back to user_id-scoped query when no contact/deal is provided
 *
 * Returns an empty enrichment object on error or if no events are found.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

export interface CalendarEnrichment {
  next_meeting: { title: string; start_time: string } | null;
  last_meeting: { title: string; date: string } | null;
  days_since_last_meeting: number | null;
  upcoming_meeting_count: number;
}

const EMPTY: CalendarEnrichment = {
  next_meeting: null,
  last_meeting: null,
  days_since_last_meeting: null,
  upcoming_meeting_count: 0,
};

export async function loadCalendarContext(
  supabase: ReturnType<typeof createClient>,
  contactId?: string | null,
  dealId?: string | null,
): Promise<CalendarEnrichment> {
  if (!contactId && !dealId) {
    console.log('[cc-loader:calendar] No contactId or dealId — returning empty enrichment');
    return EMPTY;
  }

  try {
    const now = new Date().toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAhead = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Build filter — prefer contact_id, fall back to deal_id
    let baseQuery = supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time, attendees_count, contact_id, deal_id')
      .gt('attendees_count', 1)
      .neq('status', 'cancelled');

    if (contactId) {
      baseQuery = baseQuery.eq('contact_id', contactId);
    } else if (dealId) {
      baseQuery = baseQuery.eq('deal_id', dealId);
    }

    // Upcoming meetings (now → +30 days)
    const { data: upcoming, error: upcomingError } = await baseQuery
      .gte('start_time', now)
      .lte('start_time', thirtyDaysAhead)
      .order('start_time', { ascending: true })
      .limit(10);

    if (upcomingError) {
      console.error('[cc-loader:calendar] Upcoming query error:', upcomingError.message);
      return EMPTY;
    }

    // Past meetings (-90 days → now)
    let pastQuery = supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time, attendees_count, contact_id, deal_id')
      .gt('attendees_count', 1)
      .neq('status', 'cancelled')
      .lt('start_time', now)
      .gte('start_time', ninetyDaysAgo)
      .order('start_time', { ascending: false })
      .limit(5);

    if (contactId) {
      pastQuery = pastQuery.eq('contact_id', contactId);
    } else if (dealId) {
      pastQuery = pastQuery.eq('deal_id', dealId);
    }

    const { data: past, error: pastError } = await pastQuery;

    if (pastError) {
      console.error('[cc-loader:calendar] Past query error:', pastError.message);
      return EMPTY;
    }

    const nextEvent = upcoming && upcoming.length > 0 ? upcoming[0] : null;
    const lastEvent = past && past.length > 0 ? past[0] : null;

    let daysSinceLastMeeting: number | null = null;
    if (lastEvent) {
      const diff = Date.now() - new Date(lastEvent.start_time).getTime();
      daysSinceLastMeeting = Math.floor(diff / (24 * 60 * 60 * 1000));
    }

    const enrichment: CalendarEnrichment = {
      next_meeting: nextEvent
        ? { title: nextEvent.title, start_time: nextEvent.start_time }
        : null,
      last_meeting: lastEvent
        ? { title: lastEvent.title, date: lastEvent.start_time }
        : null,
      days_since_last_meeting: daysSinceLastMeeting,
      upcoming_meeting_count: upcoming?.length ?? 0,
    };

    console.log(
      `[cc-loader:calendar] contact=${contactId ?? 'n/a'} deal=${dealId ?? 'n/a'} upcoming=${enrichment.upcoming_meeting_count} last_meeting_days_ago=${daysSinceLastMeeting ?? 'n/a'}`,
    );

    return enrichment;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cc-loader:calendar] Unexpected error:', message);
    return EMPTY;
  }
}

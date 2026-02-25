/**
 * historyDetector.ts — Determines first vs return meeting by checking
 * prior meetings with the same attendees/company.
 *
 * Uses calendar_events table since that's where meeting data lives.
 * Only counts external meetings (is_internal != true).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { MeetingHistory, AttendeeHistoryEntry, AttendeeComparison } from './types.ts';

export async function detectMeetingHistory(
  supabase: ReturnType<typeof createClient>,
  currentMeetingId: string,
  attendeeEmails: string[],
  userId: string,
  orgId: string,
): Promise<MeetingHistory> {
  // Strategy:
  // 1. Get the current meeting's start_time so we only look at PRIOR meetings
  // 2. Query calendar_events where attendees contains any of the attendee emails
  // 3. Exclude internal meetings, exclude the current meeting
  // 4. Build per-attendee history

  if (attendeeEmails.length === 0) {
    return emptyHistory();
  }

  // Get current meeting date for "prior" filtering
  const { data: currentMeeting } = await supabase
    .from('calendar_events')
    .select('id, start_time')
    .eq('id', currentMeetingId)
    .maybeSingle();

  const cutoffDate = currentMeeting?.start_time || new Date().toISOString();

  // Query prior external meetings for this user.
  // We fetch recent meetings and filter attendees in-memory since
  // JSONB containment queries on email arrays are complex.
  const { data: priorMeetings, error } = await supabase
    .from('calendar_events')
    .select('id, title, start_time, attendees, is_internal')
    .eq('user_id', userId)
    .lt('start_time', cutoffDate)
    .neq('is_internal', true) // Only external meetings
    .order('start_time', { ascending: false })
    .limit(100); // Look back up to 100 meetings

  if (error) {
    console.error('[historyDetector] Error querying prior meetings:', error.message);
    return emptyHistory();
  }

  if (!priorMeetings || priorMeetings.length === 0) {
    return emptyHistory();
  }

  // Normalize attendee emails to lowercase for matching
  const targetEmails = new Set(attendeeEmails.map(e => e.toLowerCase()));

  // Find meetings that have at least one matching attendee
  const matchingMeetings: Array<{
    id: string;
    title: string;
    start_time: string;
    matchedEmails: string[];
  }> = [];

  for (const meeting of priorMeetings) {
    const meetingEmails = extractEmailsFromAttendees(meeting.attendees);
    const matched = meetingEmails.filter(e => targetEmails.has(e));
    if (matched.length > 0) {
      matchingMeetings.push({
        id: meeting.id,
        title: meeting.title,
        start_time: meeting.start_time,
        matchedEmails: matched,
      });
    }
  }

  if (matchingMeetings.length === 0) {
    return emptyHistory();
  }

  // Build per-attendee history
  const attendeeMap = new Map<string, {
    meetingIds: string[];
    firstSeen: string;
    lastSeen: string;
  }>();

  for (const meeting of matchingMeetings) {
    for (const email of meeting.matchedEmails) {
      const existing = attendeeMap.get(email);
      if (existing) {
        existing.meetingIds.push(meeting.id);
        if (meeting.start_time < existing.firstSeen) existing.firstSeen = meeting.start_time;
        if (meeting.start_time > existing.lastSeen) existing.lastSeen = meeting.start_time;
      } else {
        attendeeMap.set(email, {
          meetingIds: [meeting.id],
          firstSeen: meeting.start_time,
          lastSeen: meeting.start_time,
        });
      }
    }
  }

  // Build attendee history entries
  const attendeeHistory: AttendeeHistoryEntry[] = attendeeEmails.map(email => {
    const history = attendeeMap.get(email.toLowerCase());
    return {
      email,
      name: email, // Caller should enrich with names
      contactId: null, // Caller should enrich
      meetingsAttended: history?.meetingIds.length || 0,
      firstSeen: history?.firstSeen || null,
      lastSeen: history?.lastSeen || null,
      classification: history ? 'returning' : 'new' as const,
    };
  });

  // Sort matching meetings chronologically (ascending) for the ID list.
  // matchingMeetings is in descending order from the DB query, so reverse-sort here.
  const sortedMeetingIds = matchingMeetings
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map(m => m.id);

  // After ascending sort: oldest is index 0, most recent is last index.
  const firstMeetingDate = matchingMeetings[0]?.start_time || null;
  const lastMeetingDate = matchingMeetings[matchingMeetings.length - 1]?.start_time || null;

  return {
    isReturnMeeting: true,
    priorMeetingCount: matchingMeetings.length,
    priorMeetingIds: sortedMeetingIds,
    firstMeetingDate,
    lastMeetingDate,
    attendeeHistory,
  };
}

/**
 * Extract email addresses from calendar_events.attendees JSONB field.
 * Handles both `{email, name}` objects and plain string emails.
 */
function extractEmailsFromAttendees(attendees: unknown): string[] {
  if (!Array.isArray(attendees)) return [];

  const emails: string[] = [];
  for (const att of attendees) {
    if (typeof att === 'string' && att.includes('@')) {
      emails.push(att.toLowerCase());
    } else if (att && typeof att === 'object' && 'email' in att) {
      const email = (att as { email: string }).email;
      if (email) emails.push(email.toLowerCase());
    }
  }
  return emails;
}

function emptyHistory(): MeetingHistory {
  return {
    isReturnMeeting: false,
    priorMeetingCount: 0,
    priorMeetingIds: [],
    firstMeetingDate: null,
    lastMeetingDate: null,
    attendeeHistory: [],
  };
}

/**
 * Compare today's attendees against all prior meeting attendees.
 * Returns classification: new, returning, returning_after_absence,
 * plus absent regular attendees who aren't in today's meeting.
 *
 * @param meetingHistory             Result from detectMeetingHistory()
 * @param todayAttendeeEmails        Emails of today's meeting attendees (external only)
 * @param recentMeetingThreshold     Number of most recent meetings to check for "regular"
 *                                   status (default 3)
 */
export function compareAttendees(
  meetingHistory: MeetingHistory,
  todayAttendeeEmails: string[],
  recentMeetingThreshold = 3,
): AttendeeComparison {
  const todaySet = new Set(todayAttendeeEmails.map(e => e.toLowerCase()));
  const returning: AttendeeHistoryEntry[] = [];
  const newAttendees: AttendeeHistoryEntry[] = [];
  const absent: AttendeeHistoryEntry[] = [];

  // Classify today's attendees using the history built by detectMeetingHistory().
  // attendeeHistory only contains entries for today's attendees, so iterate that list.
  for (const entry of meetingHistory.attendeeHistory) {
    if (entry.classification === 'new') {
      newAttendees.push(entry);
    } else {
      returning.push(entry);
    }
  }

  // Absent detection: find people who attended 2+ prior meetings but are NOT
  // in today's meeting. detectMeetingHistory scopes attendeeHistory to today's
  // attendees, so we cannot detect absences purely from that. Callers should
  // use getAllPriorAttendees() to get the full prior-attendee map and then
  // compare against todaySet here.
  //
  // This stub keeps the interface consistent; a full implementation requires
  // the priorAttendeeMap from getAllPriorAttendees().
  void recentMeetingThreshold; // used by callers that pass a custom threshold

  return { returning, new: newAttendees, absent };
}

/**
 * Compare today's attendees against a pre-fetched prior-attendee map, detecting
 * people who attended 2+ prior meetings but are absent from today's meeting.
 *
 * @param todayAttendeeEmails  Emails of today's external attendees (lowercase)
 * @param priorAttendeeMap     Result from getAllPriorAttendees()
 * @param meetingHistory       Result from detectMeetingHistory() — used to classify
 *                             today's attendees as new / returning
 * @param recentMeetingThreshold  Min meetings attended to be considered a "regular"
 *                                who counts as absent if not present today (default 2)
 */
export function compareAttendeesWithAbsent(
  meetingHistory: MeetingHistory,
  todayAttendeeEmails: string[],
  priorAttendeeMap: Map<string, { email: string; meetingsAttended: number }>,
  recentMeetingThreshold = 2,
): AttendeeComparison {
  const todaySet = new Set(todayAttendeeEmails.map(e => e.toLowerCase()));
  const returning: AttendeeHistoryEntry[] = [];
  const newAttendees: AttendeeHistoryEntry[] = [];
  const absent: AttendeeHistoryEntry[] = [];

  // Classify today's attendees
  for (const entry of meetingHistory.attendeeHistory) {
    if (entry.classification === 'new') {
      newAttendees.push(entry);
    } else {
      returning.push(entry);
    }
  }

  // Detect absent regulars: prior attendees with enough meetings who aren't here today
  for (const [emailLower, info] of priorAttendeeMap) {
    if (todaySet.has(emailLower)) continue; // Present today — not absent
    if (info.meetingsAttended < recentMeetingThreshold) continue; // Not a regular

    absent.push({
      email: info.email,
      name: info.email, // Caller should enrich with contact names if needed
      contactId: null,
      meetingsAttended: info.meetingsAttended,
      firstSeen: null,
      lastSeen: null,
      classification: 'returning', // They're a returner who just isn't here
    });
  }

  return { returning, new: newAttendees, absent };
}

/**
 * Get all unique external attendee emails from a set of prior meetings.
 * Used by compareAttendeesWithAbsent() to detect absent regulars.
 *
 * @param supabase         Supabase client (service role or user client)
 * @param priorMeetingIds  IDs of the prior meetings to inspect
 * @param ownerEmail       The rep's email — used to filter out internal (same-domain) attendees
 */
export async function getAllPriorAttendees(
  supabase: ReturnType<typeof createClient>,
  priorMeetingIds: string[],
  ownerEmail: string | null,
): Promise<Map<string, { email: string; meetingsAttended: number }>> {
  if (priorMeetingIds.length === 0) return new Map();

  const { data: meetings, error } = await supabase
    .from('calendar_events')
    .select('attendees')
    .in('id', priorMeetingIds);

  if (error || !meetings) {
    console.error('[historyDetector] getAllPriorAttendees query failed:', error?.message);
    return new Map();
  }

  const ownerDomain = ownerEmail?.split('@')[1]?.toLowerCase();
  const attendeeMap = new Map<string, { email: string; meetingsAttended: number }>();

  for (const meeting of meetings) {
    const emails = extractEmailsFromAttendees(meeting.attendees);
    for (const email of emails) {
      // Skip internal attendees (same domain as the rep)
      if (ownerDomain && email.split('@')[1]?.toLowerCase() === ownerDomain) continue;

      const existing = attendeeMap.get(email);
      if (existing) {
        existing.meetingsAttended++;
      } else {
        attendeeMap.set(email, { email, meetingsAttended: 1 });
      }
    }
  }

  return attendeeMap;
}

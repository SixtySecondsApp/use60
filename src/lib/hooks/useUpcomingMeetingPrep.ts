/**
 * useUpcomingMeetingPrep — Find next meeting within 90 min and load Brain context
 *
 * Queries calendar_events for the next upcoming meeting, then fetches:
 *   - Contact info (name, email, title)
 *   - Contact memory (relationship_strength, communication_style)
 *   - Open commitments (commitment_made, pending)
 *   - Recent objections (objection_raised, last 2)
 *
 * Returns null when no meeting is within the 90-minute window.
 *
 * NL-003
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';

// ============================================================================
// Cache key
// ============================================================================

export const UPCOMING_MEETING_PREP_KEY = 'upcoming-meeting-prep' as const;

// ============================================================================
// Types
// ============================================================================

interface CalendarEventRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  contact_id: string | null;
  deal_id: string | null;
  meeting_id: string | null;
  location: string | null;
  meeting_url: string | null;
}

interface ContactInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  title: string | null;
}

interface ContactMemoryInfo {
  relationship_strength: number;
  communication_style: Record<string, unknown>;
  total_meetings: number;
  last_interaction_at: string | null;
}

interface CommitmentInfo {
  id: string;
  summary: string;
  source_timestamp: string;
  detail: Record<string, unknown>;
}

interface ObjectionInfo {
  id: string;
  summary: string;
  source_timestamp: string;
}

interface MeetingSentiment {
  sentiment_score: number | null;
  meeting_start: string | null;
}

export interface UpcomingMeetingPrep {
  meeting: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    location: string | null;
    meetingUrl: string | null;
  };
  contact: ContactInfo | null;
  strength: number | null;
  communicationStyle: Record<string, unknown> | null;
  totalMeetings: number | null;
  commitments: CommitmentInfo[];
  objections: ObjectionInfo[];
  lastSentiment: number | null;
  minutesUntil: number;
}

// ============================================================================
// Hook
// ============================================================================

export function useUpcomingMeetingPrep() {
  const { user } = useAuth();
  const userId = user?.id;
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<UpcomingMeetingPrep | null>({
    queryKey: [UPCOMING_MEETING_PREP_KEY, userId, activeOrgId],
    queryFn: async (): Promise<UpcomingMeetingPrep | null> => {
      if (!userId) return null;

      const now = new Date();
      const ninetyMinLater = new Date(now.getTime() + 90 * 60 * 1000);

      // ---------------------------------------------------------------
      // 1. Find the next upcoming calendar event
      // ---------------------------------------------------------------
      const { data: events, error: eventsErr } = await supabase
        .from('calendar_events')
        .select(
          'id, title, start_time, end_time, contact_id, deal_id, meeting_id, location, meeting_url'
        )
        .eq('user_id', userId)
        .gt('start_time', now.toISOString())
        .lt('start_time', ninetyMinLater.toISOString())
        .order('start_time', { ascending: true })
        .limit(1);

      if (eventsErr) throw eventsErr;

      // No upcoming meeting within 90 min
      if (!events || events.length === 0) return null;

      const event = events[0] as CalendarEventRow;
      const startTime = new Date(event.start_time);
      const minutesUntil = Math.max(
        0,
        Math.round((startTime.getTime() - Date.now()) / 60000)
      );

      // If meeting start has passed, don't show
      if (minutesUntil <= 0) return null;

      // ---------------------------------------------------------------
      // 2. Fetch contact info (if linked)
      // ---------------------------------------------------------------
      let contact: ContactInfo | null = null;
      if (event.contact_id) {
        const { data: contactData, error: contactErr } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, email, title')
          .eq('id', event.contact_id)
          .maybeSingle();

        if (!contactErr && contactData) {
          contact = contactData as ContactInfo;
        }
      }

      // ---------------------------------------------------------------
      // 3. Fetch contact memory (if contact found and org exists)
      // ---------------------------------------------------------------
      let strength: number | null = null;
      let communicationStyle: Record<string, unknown> | null = null;
      let totalMeetings: number | null = null;

      if (contact && activeOrgId) {
        const { data: memoryData, error: memoryErr } = await supabase
          .from('contact_memory')
          .select(
            'relationship_strength, communication_style, total_meetings, last_interaction_at'
          )
          .eq('org_id', activeOrgId)
          .eq('contact_id', contact.id)
          .maybeSingle();

        if (!memoryErr && memoryData) {
          const mem = memoryData as ContactMemoryInfo;
          strength = mem.relationship_strength;
          communicationStyle = mem.communication_style;
          totalMeetings = mem.total_meetings;
        }
      }

      // ---------------------------------------------------------------
      // 4. Fetch open commitments (if deal linked)
      // ---------------------------------------------------------------
      let commitments: CommitmentInfo[] = [];

      if (event.deal_id && activeOrgId) {
        const { data: commitmentData, error: commitErr } = await supabase
          .from('deal_memory_events')
          .select('id, summary, source_timestamp, detail')
          .eq('org_id', activeOrgId)
          .eq('deal_id', event.deal_id)
          .eq('event_type', 'commitment_made')
          .eq('is_active', true)
          .order('source_timestamp', { ascending: false })
          .limit(5);

        if (!commitErr && commitmentData) {
          // Filter to pending commitments only
          commitments = (commitmentData as CommitmentInfo[]).filter((c) => {
            const status = c.detail?.status;
            return !status || status === 'pending';
          });
        }
      }

      // ---------------------------------------------------------------
      // 5. Fetch recent objections (if deal linked)
      // ---------------------------------------------------------------
      let objections: ObjectionInfo[] = [];

      if (event.deal_id && activeOrgId) {
        const { data: objectionData, error: objErr } = await supabase
          .from('deal_memory_events')
          .select('id, summary, source_timestamp')
          .eq('org_id', activeOrgId)
          .eq('deal_id', event.deal_id)
          .eq('event_type', 'objection_raised')
          .eq('is_active', true)
          .order('source_timestamp', { ascending: false })
          .limit(2);

        if (!objErr && objectionData) {
          objections = objectionData as ObjectionInfo[];
        }
      }

      // ---------------------------------------------------------------
      // 6. Fetch last meeting sentiment (if contact linked)
      // ---------------------------------------------------------------
      let lastSentiment: number | null = null;

      if (event.contact_id) {
        const { data: meetingData, error: meetErr } = await supabase
          .from('meetings')
          .select('sentiment_score, meeting_start')
          .eq('primary_contact_id', event.contact_id)
          .not('sentiment_score', 'is', null)
          .order('meeting_start', { ascending: false })
          .limit(1);

        if (!meetErr && meetingData && meetingData.length > 0) {
          lastSentiment = (meetingData[0] as MeetingSentiment).sentiment_score;
        }
      }

      // ---------------------------------------------------------------
      // 7. Return assembled prep data
      // ---------------------------------------------------------------
      return {
        meeting: {
          id: event.id,
          title: event.title,
          startTime: event.start_time,
          endTime: event.end_time,
          location: event.location,
          meetingUrl: event.meeting_url,
        },
        contact,
        strength,
        communicationStyle,
        totalMeetings,
        commitments,
        objections,
        lastSentiment,
        minutesUntil,
      };
    },
    enabled: !!userId,
    staleTime: 60 * 1000, // 1-minute stale time — needs to be fresh
    refetchInterval: 60 * 1000, // Auto-refresh every minute for countdown
    refetchOnWindowFocus: true,
  });
}

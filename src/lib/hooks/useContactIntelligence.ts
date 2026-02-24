import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

export interface ContactMeetingSummary {
  id: string;
  title: string;
  date: string;
  sentiment_score?: number;
  summary_oneliner?: string;
  action_items_count: number;
  pending_action_items: number;
}

export interface ContactIntelligenceData {
  meetings: ContactMeetingSummary[];
  totalMeetings: number;
  avgSentiment: number | null;
  lastMeetingDate: string | null;
  unresolvedActionItems: any[];
}

export function useContactIntelligence(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ['contact-intelligence', contactId],
    queryFn: async (): Promise<ContactIntelligenceData> => {
      if (!contactId) return { meetings: [], totalMeetings: 0, avgSentiment: null, lastMeetingDate: null, unresolvedActionItems: [] };

      // Fetch meetings where this contact participated
      // Check meeting_participants table first, fall back to attendees JSONB
      const { data: participantMeetings } = await supabase
        .from('meeting_participants')
        .select('meeting_id')
        .eq('contact_id', contactId)
        .limit(50);

      const meetingIds: string[] = (participantMeetings || []).map((p: any) => p.meeting_id).filter(Boolean);

      if (meetingIds.length === 0) {
        // Try matching by contact email in attendees
        const { data: contact } = await supabase
          .from('contacts')
          .select('email')
          .eq('id', contactId)
          .maybeSingle();

        if (contact?.email) {
          const { data: meetings } = await supabase
            .from('meetings')
            .select('id, title, start_time, sentiment_score, summary_oneliner')
            .ilike('attendees_raw', `%${contact.email}%`)
            .order('start_time', { ascending: false })
            .limit(20);

          if (meetings) {
            meetingIds.push(...meetings.map((m: any) => m.id));
          }
        }
      }

      if (meetingIds.length === 0) {
        return { meetings: [], totalMeetings: 0, avgSentiment: null, lastMeetingDate: null, unresolvedActionItems: [] };
      }

      // Fetch full meeting details
      const { data: meetings } = await supabase
        .from('meetings')
        .select('id, title, start_time, sentiment_score, summary_oneliner')
        .in('id', meetingIds)
        .order('start_time', { ascending: false })
        .limit(20);

      // Fetch action items for all these meetings
      const { data: actionItems } = await supabase
        .from('meeting_action_items')
        .select('id, title, status, meeting_id, assignee_name, due_date')
        .in('meeting_id', meetingIds)
        .limit(100);

      const allActionItems = actionItems || [];
      const unresolvedActionItems = allActionItems.filter(
        (ai: any) => ai.status !== 'completed' && ai.status !== 'done'
      );

      // Count action items per meeting
      const actionItemsPerMeeting = new Map<string, { total: number; pending: number }>();
      allActionItems.forEach((ai: any) => {
        const existing = actionItemsPerMeeting.get(ai.meeting_id) || { total: 0, pending: 0 };
        existing.total++;
        if (ai.status !== 'completed' && ai.status !== 'done') existing.pending++;
        actionItemsPerMeeting.set(ai.meeting_id, existing);
      });

      const meetingSummaries: ContactMeetingSummary[] = (meetings || []).map((m: any) => {
        const aiCounts = actionItemsPerMeeting.get(m.id) || { total: 0, pending: 0 };
        return {
          id: m.id,
          title: m.title || 'Untitled Meeting',
          date: m.start_time,
          sentiment_score: m.sentiment_score,
          summary_oneliner: m.summary_oneliner,
          action_items_count: aiCounts.total,
          pending_action_items: aiCounts.pending,
        };
      });

      // Calculate averages
      const sentimentScores = meetingSummaries
        .map(m => m.sentiment_score)
        .filter((s): s is number => s !== null && s !== undefined);
      const avgSentiment = sentimentScores.length > 0
        ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
        : null;

      return {
        meetings: meetingSummaries,
        totalMeetings: meetingSummaries.length,
        avgSentiment,
        lastMeetingDate: meetingSummaries[0]?.date || null,
        unresolvedActionItems,
      };
    },
    enabled: !!contactId,
    staleTime: 5 * 60_000, // 5 min cache
  });
}

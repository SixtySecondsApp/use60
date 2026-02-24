import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { Task } from '@/lib/database/models';

interface TaskContextData {
  deal: any | null;
  contact: any | null;
  company: any | null;
  meeting: any | null;
  transcript: string | null;
  actionItems: any[];
  activities: any[];
  isLoading: boolean;
}

export function useTaskContext(task: Task | null): TaskContextData {
  const { data, isLoading } = useQuery({
    queryKey: [
      'task-context',
      task?.id,
      task?.deal_id,
      task?.contact_id,
      task?.company_id,
      task?.meeting_id,
    ],
    queryFn: async () => {
      const result: any = {};

      if (task!.deal_id) {
        const { data: deal } = await supabase
          .from('deals')
          .select('id, name, stage_id, value, expected_close_date, notes, next_steps, priority, risk_level')
          .eq('id', task!.deal_id)
          .maybeSingle();
        result.deal = deal;
      }

      if (task!.contact_id) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, email, phone, company_name, title, last_contacted_at')
          .eq('id', task!.contact_id)
          .maybeSingle();
        result.contact = contact;

        const { data: activities } = await supabase
          .from('activities')
          .select('id, activity_type, subject, created_at, notes')
          .eq('contact_id', task!.contact_id)
          .order('created_at', { ascending: false })
          .limit(5);
        result.activities = activities || [];
      }

      if (task!.company_id) {
        const { data: company } = await supabase
          .from('companies')
          .select('id, name, domain, industry, size, description')
          .eq('id', task!.company_id)
          .maybeSingle();
        result.company = company;
      }

      const meetingId = task!.metadata?.meeting_id || task!.meeting_id;
      if (meetingId) {
        const { data: meeting } = await supabase
          .from('meetings')
          .select('id, title, start_time, end_time, summary, summary_oneliner, sentiment_score, transcript_text, recording_url, share_url')
          .eq('id', meetingId)
          .maybeSingle();
        result.meeting = meeting;
        if (meeting?.transcript_text) {
          result.transcript = meeting.transcript_text;
        }

        const { data: actionItems } = await supabase
          .from('meeting_action_items')
          .select('id, title, description, assignee_name, due_date, status, priority')
          .eq('meeting_id', meetingId)
          .limit(20);
        result.actionItems = actionItems || [];

        // Fetch buying signals from meeting_structured_summaries
        const { data: structuredSummary } = await supabase
          .from('meeting_structured_summaries')
          .select('outcome_signals, rep_commitments, prospect_commitments, competitor_mentions, objections')
          .eq('meeting_id', meetingId)
          .maybeSingle();
        if (structuredSummary) {
          result.structuredSummary = structuredSummary;
        }
      }

      return result;
    },
    enabled: !!task?.id,
    staleTime: 60_000,
  });

  const metadata = task?.metadata || {};

  // Merge buying signals from task metadata + meeting_structured_summaries
  // so BuyerSignalsContent in ContextPanel can render them
  const contactBase = data?.contact || metadata.contact_context || null;
  const metadataSignals = metadata.buying_signals || [];
  const outcomeSignals = data?.structuredSummary?.outcome_signals || [];
  const buyingSignals = metadataSignals.length > 0 ? metadataSignals : outcomeSignals;
  const structuredSummary = data?.structuredSummary || null;
  const contact = contactBase
    ? {
        ...contactBase,
        buying_signals: buyingSignals,
        // Also pass commitment data for richer display
        ...(structuredSummary && {
          rep_commitments: structuredSummary.rep_commitments,
          prospect_commitments: structuredSummary.prospect_commitments,
          competitor_mentions: structuredSummary.competitor_mentions,
          objections: structuredSummary.objections,
        }),
      }
    : buyingSignals.length > 0
      ? { buying_signals: buyingSignals }
      : null;

  return {
    deal: data?.deal || metadata.deal_context || null,
    contact,
    company: data?.company || null,
    meeting: data?.meeting || metadata.meeting_context || null,
    transcript: data?.transcript || null,
    actionItems: data?.actionItems || metadata.meeting_action_items || [],
    activities: data?.activities || metadata.activity || [],
    isLoading,
  };
}

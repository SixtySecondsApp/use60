/**
 * useMeetingPrepBrief
 *
 * IMP-UI-006: Fetch the prep brief for a meeting from command_centre_items.
 *
 * Looks for a `meeting_prep` item whose source_event_id matches the
 * calendar_event linked to this meeting. Falls back to matching by
 * meeting title keyword in the title column.
 *
 * The PrepContent is stored in context.prep_documents[0] (from the
 * internalPrepTemplates adapter output) or in context directly.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

// ============================================================================
// Types (mirrors internalPrepTemplates PrepContent)
// ============================================================================

export interface PrepSection {
  title: string;
  body: string;
  data?: unknown;
}

export type InternalMeetingType = 'one_on_one' | 'pipeline_review' | 'qbr' | 'standup' | 'general';

export interface PrepBrief {
  id: string;                    // command_centre_item id
  event_id: string;
  meeting_type: InternalMeetingType;
  prep_title: string;
  generated_at: string;
  sections: PrepSection[];
  is_lightweight: boolean;
  status: string;
}

// ============================================================================
// Hook
// ============================================================================

export function useMeetingPrepBrief(meetingId: string | null) {
  const { activeOrgId } = useOrgStore();

  return useQuery<PrepBrief | null>({
    queryKey: ['meeting-prep-brief', meetingId, activeOrgId],
    queryFn: async () => {
      if (!meetingId || !activeOrgId) return null;

      // 1. Find linked calendar_event for this meeting
      const { data: calEvent } = await supabase
        .from('calendar_events')
        .select('id, is_internal, meeting_type')
        .eq('meeting_id', meetingId)
        .maybeSingle();

      // 2. Query command_centre_items for a meeting_prep item
      let query = supabase
        .from('command_centre_items')
        .select('id, title, context, status, created_at')
        .eq('org_id', activeOrgId)
        .eq('item_type', 'meeting_prep')
        .not('status', 'in', '("dismissed","auto_resolved")')
        .order('created_at', { ascending: false })
        .limit(1);

      if (calEvent?.id) {
        query = query.eq('source_event_id', calEvent.id);
      } else {
        // No calendar event link — nothing to show
        return null;
      }

      const { data: items } = await query;
      const item = items?.[0];
      if (!item) return null;

      // 3. Extract PrepContent from context
      // The internalPrepTemplates adapter writes: context.prep_documents[0]
      // Some items may store it directly as context.prep_content
      const ctx = item.context as Record<string, unknown>;
      const prepDocs = ctx?.prep_documents as PrepBrief[] | undefined;
      const prep: Partial<PrepBrief> | undefined =
        prepDocs?.[0] ?? (ctx as Partial<PrepBrief>);

      if (!prep?.sections?.length) return null;

      return {
        id: item.id,
        event_id: prep.event_id ?? calEvent?.id ?? '',
        meeting_type: (prep.meeting_type ?? calEvent?.meeting_type ?? 'general') as InternalMeetingType,
        prep_title: prep.prep_title ?? item.title,
        generated_at: prep.generated_at ?? item.created_at,
        sections: prep.sections ?? [],
        is_lightweight: prep.is_lightweight ?? false,
        status: item.status,
      };
    },
    enabled: !!meetingId && !!activeOrgId,
    staleTime: 5 * 60 * 1000,
  });
}

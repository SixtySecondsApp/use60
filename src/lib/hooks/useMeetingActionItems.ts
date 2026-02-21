import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

export interface MeetingActionItem {
  id: string;
  title: string;
  description?: string;
  assignee_name?: string;
  due_date?: string;
  status: string;
  priority?: string;
  synced_task_id?: string;
}

export function useMeetingActionItems(meetingId: string | null | undefined) {
  return useQuery({
    queryKey: ['meeting-action-items', meetingId],
    queryFn: async () => {
      if (!meetingId) return [];

      const { data, error } = await supabase
        .from('meeting_action_items')
        .select('id, title, description, assignee_name, due_date, status, priority')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true })
        .limit(30);

      if (error) throw error;

      const items = data || [];
      if (items.length === 0) return [];

      // Look for tasks that reference these action items
      const { data: syncedTasks } = await supabase
        .from('tasks')
        .select('id, metadata')
        .in('metadata->>meeting_action_item_id', items.map(i => i.id));

      const syncedMap = new Map<string, string>();
      (syncedTasks || []).forEach((t: any) => {
        const aiId = t.metadata?.meeting_action_item_id;
        if (aiId) syncedMap.set(aiId, t.id);
      });

      return items.map(item => ({
        ...item,
        synced_task_id: syncedMap.get(item.id),
      }));
    },
    enabled: !!meetingId,
    staleTime: 60_000,
  });
}

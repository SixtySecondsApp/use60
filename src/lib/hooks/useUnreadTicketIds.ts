import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';

/**
 * Returns a Set of ticket IDs that have unread support notifications.
 * Used to show unread dots on individual ticket rows in both
 * the user's "My Tickets" list and the admin SupportAgentDashboard.
 */
export function useUnreadTicketIds() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ['unread-ticket-ids', userId],
    queryFn: async () => {
      if (!userId) return new Set<string>();

      const { data, error } = await supabase
        .from('notifications')
        .select('entity_id')
        .eq('user_id', userId)
        .eq('category', 'support')
        .eq('entity_type', 'support_ticket')
        .eq('read', false);

      if (error) {
        console.error('[useUnreadTicketIds] Query error:', error);
        return new Set<string>();
      }

      return new Set(
        (data ?? [])
          .map((n) => n.entity_id)
          .filter((id): id is string => !!id)
      );
    },
    enabled: !!userId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Real-time: invalidate when notifications change
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('support-unread-ticket-ids')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const rec = (payload.new ?? payload.old) as any;
        if (rec?.category === 'support') {
          queryClient.invalidateQueries({ queryKey: ['unread-ticket-ids', userId] });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return {
    unreadIds: query.data ?? new Set<string>(),
    isLoading: query.isLoading,
  };
}

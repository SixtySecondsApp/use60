import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';

/**
 * Returns the count of unread support notifications for the current user.
 * Used to show a badge on the Support sidebar item.
 */
export function useUnreadSupportCount() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ['unread-support-count', userId],
    queryFn: async () => {
      if (!userId) return 0;

      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('category', 'support')
        .eq('read', false);

      if (error) {
        console.error('[useUnreadSupportCount] Query error:', error);
        return 0;
      }
      return count ?? 0;
    },
    enabled: !!userId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Real-time subscription: invalidate count when notifications change
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('support-notifications-unread')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        // Only care about support category notifications
        const newRecord = payload.new as any;
        const oldRecord = payload.old as any;
        if (
          newRecord?.category === 'support' ||
          oldRecord?.category === 'support'
        ) {
          queryClient.invalidateQueries({ queryKey: ['unread-support-count', userId] });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
  };
}

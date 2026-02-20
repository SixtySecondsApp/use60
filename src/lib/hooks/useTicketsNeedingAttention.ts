import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useUser } from './useUser';

export function useTicketsNeedingAttention() {
  const queryClient = useQueryClient();
  const { userData } = useUser();

  const isEnabled = userData?.is_admin === true;

  const query = useQuery({
    queryKey: ['support-tickets-attention-count'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_support_tickets_needing_attention_count');
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: isEnabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!isEnabled) return;

    const channel = supabase
      .channel('support-tickets-attention')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'support_tickets',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['support-tickets-attention-count'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isEnabled, queryClient]);

  if (!isEnabled) {
    return { count: 0, isLoading: false };
  }

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
  };
}

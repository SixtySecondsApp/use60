import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useAuth } from '@/lib/contexts/AuthContext';
import type { SupportTicket } from './useSupportTickets';

export type SenderType = 'user' | 'agent' | 'system';

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_type: SenderType;
  content: string;
  attachments: unknown[];
  is_internal: boolean;
  created_at: string;
}

export function useSupportMessages(ticketId: string) {
  return useQuery({
    queryKey: ['support-messages', ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_messages')
        .select('id, ticket_id, sender_id, sender_type, content, attachments, is_internal, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as SupportMessage[];
    },
    enabled: !!ticketId,
  });
}

/**
 * Subscribe to realtime changes on support_messages for a specific ticket.
 * Automatically invalidates the React Query cache when new messages arrive.
 * This enables live chat in both web dashboard and Electron app.
 */
export function useSupportMessagesRealtime(ticketId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!ticketId) return;

    const channel = supabase
      .channel(`support-messages:${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_messages',
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['support-messages', ticketId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, queryClient]);
}

export function useSendSupportMessage(ticket: SupportTicket, senderType: SenderType = 'user') {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ content, isInternal = false }: { content: string; isInternal?: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase.from('support_messages').insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_type: senderType,
        content: content.trim(),
        attachments: [],
        is_internal: isInternal,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-messages', ticket.id] });
    },
    onError: (error: Error) => {
      toast.error('Failed to send message', { description: error.message });
    },
  });
}

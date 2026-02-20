import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  created_at: string;
}

export function useSupportMessages(ticketId: string) {
  return useQuery({
    queryKey: ['support-messages', ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_messages')
        .select('id, ticket_id, sender_id, sender_type, content, attachments, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as SupportMessage[];
    },
    enabled: !!ticketId,
  });
}

export function useSendSupportMessage(ticket: SupportTicket) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (content: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase.from('support_messages').insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_type: 'user' as SenderType,
        content: content.trim(),
        attachments: [],
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

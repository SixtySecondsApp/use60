import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';

export type TicketCategory = 'bug' | 'feature_request' | 'billing' | 'how_to' | 'other';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  org_id: string;
  user_id: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface CreateTicketPayload {
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
}

export type TicketStatusFilter = 'all' | 'open' | 'resolved';

export function useSupportTickets(statusFilter: TicketStatusFilter = 'all', categoryFilter?: TicketCategory) {
  const { user } = useAuth();
  const { activeOrgId } = useOrgStore();

  return useQuery({
    queryKey: ['support-tickets', user?.id, statusFilter, categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from('support_tickets')
        .select('id, org_id, user_id, subject, description, category, priority, status, assigned_to, created_at, updated_at, resolved_at')
        .order('created_at', { ascending: false });

      if (statusFilter === 'open') {
        query = query.in('status', ['open', 'in_progress', 'waiting_on_customer']);
      } else if (statusFilter === 'resolved') {
        query = query.in('status', ['resolved', 'closed']);
      }

      if (categoryFilter) {
        query = query.eq('category', categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
    enabled: !!user?.id,
  });
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { activeOrgId } = useOrgStore();

  return useMutation({
    mutationFn: async (payload: CreateTicketPayload) => {
      if (!user?.id || !activeOrgId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          org_id: activeOrgId,
          user_id: user.id,
          subject: payload.subject,
          description: payload.description,
          category: payload.category,
          priority: payload.priority,
          status: 'open',
        })
        .select('id, subject')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success(`Ticket created — #${data.id.slice(0, 8).toUpperCase()}`, {
        description: data.subject,
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to create ticket', { description: error.message });
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: TicketStatus }) => {
      const updateData: Record<string, unknown> = { status };
      if (status === 'resolved' || status === 'closed') {
        updateData.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('support_tickets')
        .update(updateData)
        .eq('id', ticketId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success('Ticket status updated');
    },
    onError: (error: Error) => {
      toast.error('Failed to update ticket', { description: error.message });
    },
  });
}

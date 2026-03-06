import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

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
  first_response_at: string | null;
  sla_response_hours: number | null;
  sla_breached: boolean;
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
        .select('id, org_id, user_id, subject, description, category, priority, status, assigned_to, first_response_at, sla_response_hours, sla_breached, created_at, updated_at, resolved_at')
        .eq('user_id', user!.id)
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
        .select('id, subject, description')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success(`Ticket created — #${data.id.slice(0, 8).toUpperCase()}`, {
        description: data.subject,
      });

      // Fire email notification in background — don't await, don't block UX
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (accessToken && SUPABASE_URL) {
        fetch(`${SUPABASE_URL}/functions/v1/send-support-ticket-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            ticket_id: data.id,
            subject: data.subject,
            description: variables.description,
            category: variables.category,
            priority: variables.priority,
            user_email: sessionData?.session?.user?.email || '',
            user_name: sessionData?.session?.user?.user_metadata?.full_name || '',
          }),
        }).catch((err) => console.warn('[useSupportTickets] Email notification failed:', err));
      }
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

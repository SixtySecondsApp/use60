import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export interface FollowUpDraft {
  id: string;
  org_id: string;
  user_id: string;
  meeting_id: string | null;
  to_email: string;
  to_name: string | null;
  subject: string;
  body: string;
  edited_body: string | null;
  status: 'pending' | 'editing' | 'approved' | 'scheduled' | 'sent' | 'rejected' | 'expired';
  buying_signals: Record<string, unknown> | null;
  generated_at: string;
  approved_at: string | null;
  sent_at: string | null;
  rejected_at: string | null;
  expires_at: string | null;
  scheduled_email_id: string | null;
  chain_id: string | null;
  chain_position: number | null;
  chain_type: 'meeting_recap' | 'value_add' | 'gentle_nudge' | 're_engagement' | null;
  buyer_signal_score: number | null;
  created_at: string;
  updated_at: string;
}

interface UseFollowUpDraftsOptions {
  orgId?: string;
  userId?: string;
  status?: string;
}

const FOLLOW_UP_DRAFTS_COLUMNS = [
  'id',
  'org_id',
  'user_id',
  'meeting_id',
  'to_email',
  'to_name',
  'subject',
  'body',
  'edited_body',
  'status',
  'buying_signals',
  'generated_at',
  'approved_at',
  'sent_at',
  'rejected_at',
  'expires_at',
  'scheduled_email_id',
  'chain_id',
  'chain_position',
  'chain_type',
  'buyer_signal_score',
  'created_at',
  'updated_at',
].join(', ');

export function useFollowUpDrafts(options: UseFollowUpDraftsOptions) {
  const { orgId, userId, status } = options;
  const queryClient = useQueryClient();

  const queryKey = ['follow-up-drafts', orgId, userId, status];

  const {
    data: drafts = [],
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from('follow_up_drafts')
        .select(FOLLOW_UP_DRAFTS_COLUMNS)
        .eq('org_id', orgId!)
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as FollowUpDraft[];
    },
    enabled: !!orgId && !!userId,
  });

  // Update a draft's status in the database and invalidate the cache
  const updateDraftStatus = useCallback(
    async (id: string, newStatus: string) => {
      const updateData: Record<string, unknown> = { status: newStatus };

      // Set timestamp columns based on the new status
      const now = new Date().toISOString();
      if (newStatus === 'approved') updateData.approved_at = now;
      if (newStatus === 'sent') updateData.sent_at = now;
      if (newStatus === 'rejected') updateData.rejected_at = now;

      const { error } = await supabase
        .from('follow_up_drafts')
        .update(updateData)
        .eq('id', id);

      if (error) {
        toast.error('Failed to update draft status', { description: error.message });
        throw error;
      }

      toast.success(`Draft ${newStatus}`);
      queryClient.invalidateQueries({ queryKey: ['follow-up-drafts'] });
    },
    [queryClient]
  );

  // Real-time subscription: invalidate query when drafts change for this user
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`follow-up-drafts:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follow_up_drafts',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['follow-up-drafts'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // Convert React Query error to string to match the consumer's expected interface
  const error = queryError ? (queryError as Error).message : null;

  return { drafts, isLoading, error, refetch, updateDraftStatus };
}

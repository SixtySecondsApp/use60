/**
 * useAgentActivity — React Query hooks for agent activity feed
 *
 * Provides paginated activity feed, unread count, and mark-as-read functionality
 * using the agent_activity table RPCs created in Wave 1.
 */

import { useCallback } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export interface AgentActivity {
  id: string;
  sequence_type: string;
  job_id: string | null;
  title: string;
  summary: string;
  metadata: any;
  is_read: boolean;
  created_at: string;
}

interface AgentActivityFeedParams {
  p_user_id: string;
  p_org_id: string;
  p_limit: number;
  p_offset: number;
}

interface UseAgentActivityFeedOptions {
  orgId: string | null;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook to fetch paginated agent activity feed
 */
export function useAgentActivityFeed(options: UseAgentActivityFeedOptions) {
  const { orgId, limit = 20, enabled = true } = options;

  return useInfiniteQuery({
    queryKey: ['agent-activity-feed', orgId],
    queryFn: async ({ pageParam = 0 }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !orgId) {
        return [];
      }

      const { data, error } = await supabase.rpc('get_agent_activity_feed', {
        p_user_id: user.id,
        p_org_id: orgId,
        p_limit: limit,
        p_offset: pageParam,
      });

      if (error) {
        console.error('[useAgentActivityFeed] Error fetching activity:', error);
        throw error;
      }

      return (data || []) as AgentActivity[];
    },
    getNextPageParam: (lastPage, allPages) => {
      // If last page is empty or has fewer items than limit, we've reached the end
      if (!lastPage || lastPage.length < limit) {
        return undefined;
      }
      // Calculate next offset
      return allPages.length * limit;
    },
    initialPageParam: 0,
    enabled: enabled && !!orgId,
  });
}

/**
 * Hook to fetch unread count for agent activity
 */
export function useAgentActivityUnreadCount(orgId: string | null) {
  return useQuery({
    queryKey: ['agent-activity-unread-count', orgId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !orgId) {
        return 0;
      }

      const { data, error } = await supabase.rpc('get_agent_activity_unread_count', {
        p_user_id: user.id,
        p_org_id: orgId,
      });

      if (error) {
        console.error('[useAgentActivityUnreadCount] Error fetching count:', error);
        throw error;
      }

      return (data || 0) as number;
    },
    enabled: !!orgId,
    // Refresh every 30 seconds to keep count updated
    refetchInterval: 30000,
  });
}

/**
 * Hook to mark agent activity items as read
 */
export function useMarkAgentActivityRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (activityIds: string[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase.rpc('mark_agent_activity_read', {
        p_user_id: user.id,
        p_activity_ids: activityIds,
      });

      if (error) {
        console.error('[useMarkAgentActivityRead] Error marking as read:', error);
        throw error;
      }

      return { success: true };
    },
    onSuccess: () => {
      // Invalidate both feed and unread count queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['agent-activity-feed'] });
      queryClient.invalidateQueries({ queryKey: ['agent-activity-unread-count'] });
    },
    onError: (error) => {
      toast.error('Failed to mark activity as read', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

/**
 * Hook to mark all agent activity as read
 */
export function useMarkAllAgentActivityRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orgId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Fetch all unread activity IDs for this org
      const { data: activities, error: fetchError } = await supabase
        .from('agent_activity')
        .select('id')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .eq('is_read', false);

      if (fetchError) {
        console.error('[useMarkAllAgentActivityRead] Error fetching activities:', fetchError);
        throw fetchError;
      }

      const activityIds = (activities || []).map((a) => a.id);

      if (activityIds.length === 0) {
        return { success: true, count: 0 };
      }

      // Mark all as read using the RPC
      const { error } = await supabase.rpc('mark_agent_activity_read', {
        p_user_id: user.id,
        p_activity_ids: activityIds,
      });

      if (error) {
        console.error('[useMarkAllAgentActivityRead] Error marking as read:', error);
        throw error;
      }

      return { success: true, count: activityIds.length };
    },
    onSuccess: (result) => {
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['agent-activity-feed'] });
      queryClient.invalidateQueries({ queryKey: ['agent-activity-unread-count'] });

      if (result.count > 0) {
        toast.success('Marked all as read', {
          description: `${result.count} ${result.count === 1 ? 'item' : 'items'} marked as read`,
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to mark all as read', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

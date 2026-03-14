/**
 * useBrainMemories — React Query hook + Supabase Realtime for copilot_memories
 *
 * Fetches paginated memories filtered by user_id, optional category, and optional orgId.
 * Subscribes to Supabase Realtime INSERTs and prepends new rows to the query cache.
 *
 * TRINITY-005
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { RealtimeChannel } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export interface CopilotMemory {
  id: string;
  user_id: string;
  clerk_org_id: string | null;
  category: 'deal' | 'relationship' | 'preference' | 'commitment' | 'fact';
  subject: string;
  content: string;
  context_summary: string | null;
  deal_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  confidence: number;
  decay_score: number;
  last_accessed_at: string | null;
  access_count: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export interface BrainMemoriesFilters {
  category?: CopilotMemory['category'];
  orgId?: string;
}

// ============================================================================
// Cache keys
// ============================================================================

export const BRAIN_MEMORIES_KEY = 'brain-memories' as const;

// ============================================================================
// Query hook
// ============================================================================

/**
 * Fetch copilot_memories for the authenticated user.
 *
 * - Filtered by `user_id` (from auth)
 * - Optional `category` filter
 * - Optional `orgId` filter (clerk_org_id)
 * - Ordered by `created_at DESC`, limit 50
 */
export function useBrainMemories(filters: BrainMemoriesFilters = {}) {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery<CopilotMemory[]>({
    queryKey: [BRAIN_MEMORIES_KEY, userId, filters.category, filters.orgId],
    queryFn: async () => {
      if (!userId) return [];

      let query = supabase
        .from('copilot_memories')
        .select(
          'id, user_id, clerk_org_id, category, subject, content, context_summary, deal_id, contact_id, company_id, confidence, decay_score, last_accessed_at, access_count, created_at, updated_at, expires_at'
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (filters.category) {
        query = query.eq('category', filters.category);
      }

      if (filters.orgId) {
        query = query.eq('clerk_org_id', filters.orgId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data ?? []) as CopilotMemory[];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

// ============================================================================
// Realtime hook
// ============================================================================

/**
 * Subscribes to Realtime INSERTs on `copilot_memories` and prepends new rows
 * into the React Query cache so the feed updates live.
 *
 * Mount once alongside the Memory Feed component.
 */
export function useBrainMemoriesRealtime(filters: BrainMemoriesFilters = {}) {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Keep filters in a ref so the channel callback always sees latest values
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const handleInsert = useCallback(
    (payload: { new: CopilotMemory }) => {
      const newMemory = payload.new;

      // If a category filter is active, only prepend if it matches
      if (filtersRef.current.category && newMemory.category !== filtersRef.current.category) {
        return;
      }

      // If an org filter is active, only prepend if it matches
      if (filtersRef.current.orgId && newMemory.clerk_org_id !== filtersRef.current.orgId) {
        return;
      }

      // Prepend to the matching query cache entry
      queryClient.setQueryData<CopilotMemory[]>(
        [BRAIN_MEMORIES_KEY, userId, filtersRef.current.category, filtersRef.current.orgId],
        (old) => {
          if (!old) return [newMemory];
          // Avoid duplicates
          if (old.some((m) => m.id === newMemory.id)) return old;
          return [newMemory, ...old].slice(0, 50);
        }
      );

      // Also invalidate the "All" (no-category) cache so it picks up the new row
      if (filtersRef.current.category) {
        queryClient.invalidateQueries({
          queryKey: [BRAIN_MEMORIES_KEY, userId, undefined, filtersRef.current.orgId],
        });
      }
    },
    [userId, queryClient]
  );

  useEffect(() => {
    if (!userId) return;

    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`brain-memories-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'copilot_memories',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => handleInsert(payload as unknown as { new: CopilotMemory })
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, handleInsert]);
}

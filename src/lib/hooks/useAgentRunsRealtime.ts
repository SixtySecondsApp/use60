import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { realtimeMonitor } from '@/lib/utils/realtimeMonitor';

/**
 * Subscribe to realtime updates for agent runs in a specific column.
 * Automatically invalidates React Query cache when agent_runs are created/updated.
 *
 * OPTIMIZATION: Debounces query invalidation to batch rapid updates (300ms)
 *
 * @param agentColumnId - The ID of the agent column to subscribe to
 */
export function useAgentRunsRealtime(agentColumnId: string) {
  const queryClient = useQueryClient();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!agentColumnId) return;

    // Debounced invalidation to batch rapid updates
    const debouncedInvalidate = (columnId: string, rowId?: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        if (rowId) {
          queryClient.invalidateQueries({
            queryKey: ['agent_run', columnId, rowId],
          });
        }
        queryClient.invalidateQueries({
          queryKey: ['agent_runs', columnId],
        });
      }, 300); // 300ms debounce - still feels instant to users
    };

    // Create a channel for this specific agent column
    const channelName = `agent_runs:${agentColumnId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'agent_runs',
          filter: `agent_column_id=eq.${agentColumnId}`,
        },
        (payload) => {
          // Debounced invalidation - batches rapid updates
          const rowId = payload.new && typeof payload.new === 'object' && 'row_id' in payload.new
            ? String(payload.new.row_id)
            : undefined;
          debouncedInvalidate(agentColumnId, rowId);
        }
      )
      .subscribe();

    // Track subscription for monitoring
    realtimeMonitor.track(channelName, 'agent_runs', 'useAgentRunsRealtime');

    // Cleanup: unsubscribe when component unmounts or agentColumnId changes
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      realtimeMonitor.untrack(channelName);
      channel.unsubscribe();
    };
  }, [agentColumnId, queryClient]);
}

/**
 * Subscribe to realtime updates for multiple agent columns at once.
 * Useful when rendering a table with multiple agent columns.
 *
 * OPTIMIZATION:
 * - Uses a SINGLE consolidated channel instead of N channels
 * - Debounces invalidation to batch rapid updates (500ms)
 * - Limits max subscriptions to 20 columns with console warning
 *
 * @param agentColumnIds - Array of agent column IDs to subscribe to
 */
export function useMultipleAgentRunsRealtime(agentColumnIds: string[]) {
  const queryClient = useQueryClient();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingInvalidationsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!agentColumnIds || agentColumnIds.length === 0) return;

    // Safety limit: warn if too many subscriptions
    const MAX_COLUMNS = 20;
    if (agentColumnIds.length > MAX_COLUMNS) {
      console.warn(
        `⚠️ useMultipleAgentRunsRealtime: Subscribing to ${agentColumnIds.length} agent columns. ` +
        `This may impact performance. Consider pagination or lazy loading. ` +
        `Limiting to first ${MAX_COLUMNS} columns.`
      );
    }

    // Limit to max columns
    const limitedColumnIds = agentColumnIds.slice(0, MAX_COLUMNS);

    // Debounced batch invalidation
    const scheduleInvalidation = (columnId: string) => {
      pendingInvalidationsRef.current.add(columnId);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        // Batch invalidate all pending columns
        pendingInvalidationsRef.current.forEach((colId) => {
          queryClient.invalidateQueries({
            queryKey: ['agent_runs', colId],
          });
        });
        pendingInvalidationsRef.current.clear();
      }, 500); // 500ms debounce for multiple columns
    };

    // OPTIMIZATION: Use a SINGLE consolidated channel instead of N channels
    // This reduces N channels to 1, massively reducing overhead
    const channelName = `agent_runs:multi:${limitedColumnIds.slice(0, 5).join(',')}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_runs',
          // Listen to ALL agent_runs, filter client-side
          // This is more efficient than N separate subscriptions
        },
        (payload) => {
          // Client-side filter: only invalidate if this change is for one of our columns
          const columnId = payload.new && typeof payload.new === 'object' && 'agent_column_id' in payload.new
            ? String(payload.new.agent_column_id)
            : payload.old && typeof payload.old === 'object' && 'agent_column_id' in payload.old
            ? String(payload.old.agent_column_id)
            : null;

          if (columnId && limitedColumnIds.includes(columnId)) {
            scheduleInvalidation(columnId);
          }
        }
      )
      .subscribe();

    // Track subscription for monitoring
    realtimeMonitor.track(channelName, 'agent_runs', 'useMultipleAgentRunsRealtime');

    // Cleanup: unsubscribe all channels
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      pendingInvalidationsRef.current.clear();
      realtimeMonitor.untrack(channelName);
      channel.unsubscribe();
    };
  }, [JSON.stringify(agentColumnIds), queryClient]);
}

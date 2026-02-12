import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

/**
 * Subscribe to realtime updates for agent runs in a specific column.
 * Automatically invalidates React Query cache when agent_runs are created/updated.
 *
 * @param agentColumnId - The ID of the agent column to subscribe to
 */
export function useAgentRunsRealtime(agentColumnId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!agentColumnId) return;

    // Create a channel for this specific agent column
    const channel = supabase
      .channel(`agent_runs:${agentColumnId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'agent_runs',
          filter: `agent_column_id=eq.${agentColumnId}`,
        },
        (payload) => {
          // Invalidate specific run query
          if (payload.new && typeof payload.new === 'object' && 'id' in payload.new && 'row_id' in payload.new) {
            queryClient.invalidateQueries({
              queryKey: ['agent_run', agentColumnId, payload.new.row_id],
            });
          }

          // Also invalidate the list query (if we add one later)
          queryClient.invalidateQueries({
            queryKey: ['agent_runs', agentColumnId],
          });
        }
      )
      .subscribe();

    // Cleanup: unsubscribe when component unmounts or agentColumnId changes
    return () => {
      channel.unsubscribe();
    };
  }, [agentColumnId, queryClient]);
}

/**
 * Subscribe to realtime updates for multiple agent columns at once.
 * Useful when rendering a table with multiple agent columns.
 *
 * @param agentColumnIds - Array of agent column IDs to subscribe to
 */
export function useMultipleAgentRunsRealtime(agentColumnIds: string[]) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!agentColumnIds || agentColumnIds.length === 0) return;

    // Create separate channels for each column
    const channels = agentColumnIds.map((agentColumnId) => {
      return supabase
        .channel(`agent_runs:${agentColumnId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'agent_runs',
            filter: `agent_column_id=eq.${agentColumnId}`,
          },
          (payload) => {
            // Invalidate specific run query
            if (payload.new && typeof payload.new === 'object' && 'id' in payload.new && 'row_id' in payload.new) {
              queryClient.invalidateQueries({
                queryKey: ['agent_run', agentColumnId, payload.new.row_id],
              });
            }

            // Also invalidate the list query
            queryClient.invalidateQueries({
              queryKey: ['agent_runs', agentColumnId],
            });
          }
        )
        .subscribe();
    });

    // Cleanup: unsubscribe all channels
    return () => {
      channels.forEach((channel) => {
        channel.unsubscribe();
      });
    };
  }, [JSON.stringify(agentColumnIds), queryClient]);
}

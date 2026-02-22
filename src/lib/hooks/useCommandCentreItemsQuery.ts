/**
 * React Query hooks for Command Centre Items
 *
 * Provides data fetching, caching, and mutation helpers for the command_centre_items table.
 * Cache keys are consistent across all hooks so that mutations invalidate all related queries.
 *
 * @see src/lib/services/commandCentreItemsService.ts
 * @see supabase/migrations/20260222600001_command_centre_items.sql
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  commandCentreItemsService,
  type CCItemFilters,
} from '@/lib/services/commandCentreItemsService';

// ============================================================================
// Cache keys
// ============================================================================

export const CC_ITEMS_KEY = 'command-centre-items' as const;
export const CC_STATS_KEY = 'command-centre-stats' as const;

// ============================================================================
// Query hooks
// ============================================================================

/**
 * Fetch command centre items with optional filters.
 * Results are ordered by priority_score DESC (handled by the service).
 */
export function useCommandCentreItemsQuery(filters: CCItemFilters = {}) {
  return useQuery({
    queryKey: [CC_ITEMS_KEY, filters],
    queryFn: () => commandCentreItemsService.getItems(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetch aggregate stats for the CC inbox header / badges.
 */
export function useCommandCentreStatsQuery() {
  return useQuery({
    queryKey: [CC_STATS_KEY],
    queryFn: () => commandCentreItemsService.getStats(),
    staleTime: 60_000,
  });
}

// ============================================================================
// Mutation hooks
// ============================================================================

/**
 * Returns mutation functions for item lifecycle actions.
 * All mutations invalidate both items and stats queries on success.
 */
export function useCommandCentreItemMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [CC_ITEMS_KEY] });
    queryClient.invalidateQueries({ queryKey: [CC_STATS_KEY] });
  };

  const approveItem = useMutation({
    mutationFn: (id: string) => commandCentreItemsService.approveItem(id),
    onSuccess: () => {
      toast.success('Item approved');
      invalidate();
    },
    onError: () => {
      toast.error('Failed to approve item');
    },
  });

  const dismissItem = useMutation({
    mutationFn: (id: string) => commandCentreItemsService.dismissItem(id),
    onSuccess: () => {
      toast.success('Item dismissed');
      invalidate();
    },
    onError: () => {
      toast.error('Failed to dismiss item');
    },
  });

  const snoozeItem = useMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) =>
      commandCentreItemsService.snoozeItem(id, until),
    onSuccess: () => {
      toast.success('Item snoozed');
      invalidate();
    },
    onError: () => {
      toast.error('Failed to snooze item');
    },
  });

  const undoItem = useMutation({
    mutationFn: (id: string) => commandCentreItemsService.undoItem(id),
    onSuccess: () => {
      toast.success('Action undone');
      invalidate();
    },
    onError: () => {
      toast.error('Failed to undo action');
    },
  });

  const updateDraftedAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: Record<string, unknown> }) =>
      commandCentreItemsService.updateDraftedAction(id, action),
    onSuccess: () => {
      toast.success('Action updated');
      invalidate();
    },
    onError: () => {
      toast.error('Failed to update action');
    },
  });

  return { approveItem, dismissItem, snoozeItem, undoItem, updateDraftedAction };
}

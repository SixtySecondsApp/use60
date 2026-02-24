/**
 * useApolloEnrichment Hook
 *
 * Manages Apollo enrichment operations for Ops table columns.
 * Calls the apollo-enrich edge function with optimistic UI updates.
 * Follows the same pattern as useEnrichment.ts.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

interface ApolloEnrichParams {
  columnId: string;
  columnKey?: string;
  rowIds?: string[];
  maxRows?: number;
  revealPersonalEmails?: boolean;
  revealPhoneNumber?: boolean;
  forceRefresh?: boolean;
  skipCompleted?: boolean;
}

interface ApolloEnrichResult {
  processed: number;
  enriched: number;
  cached_hits: number;
  failed: number;
  skipped: number;
  credits_estimated: number;
}

// ============================================================================
// Query Keys
// ============================================================================

const QUERY_KEYS = {
  tableData: (tableId: string) => ['ops-table-data', tableId] as const,
};

// ============================================================================
// Hook
// ============================================================================

export function useApolloEnrichment(tableId: string) {
  const queryClient = useQueryClient();

  // --------------------------------------------------------------------------
  // Optimistic Cache Update Helper
  // --------------------------------------------------------------------------

  const optimisticPendingUpdate = async (columnId: string, rowIds?: string[], skipCompleted?: boolean, columnKey?: string) => {
    const filter = { queryKey: QUERY_KEYS.tableData(tableId) };
    await queryClient.cancelQueries(filter);

    const cached = queryClient.getQueryCache().findAll(filter);
    if (cached.length === 0) return undefined;

    const actualKey = cached[0].queryKey;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const previousData = queryClient.getQueryData<any>(actualKey);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryClient.setQueryData(actualKey, (old: any) => {
      if (!old?.rows) return old;
      return {
        ...old,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rows: old.rows.map((row: any) => {
          if (rowIds && !rowIds.includes(row.id)) return row;

          const updatedCells = { ...row.cells };
          let found = false;
          for (const [key, cell] of Object.entries(updatedCells)) {
            if ((cell as { column_id?: string }).column_id === columnId) {
              found = true;
              const currentStatus = (cell as { status?: string }).status;
              // When skipCompleted, don't touch cells that are already complete
              if (skipCompleted && currentStatus === 'complete') continue;
              updatedCells[key] = {
                ...(cell as object),
                value: null,
                confidence: null,
                status: 'pending',
                error_message: null,
                metadata: null,
              };
            }
          }
          // For new columns where no cells exist yet, create a pending cell
          if (!found && columnKey) {
            updatedCells[columnKey] = {
              column_id: columnId,
              value: null,
              confidence: null,
              status: 'pending',
              error_message: null,
              metadata: null,
            };
          }
          return { ...row, cells: updatedCells };
        }),
      };
    });

    return { previousData, queryKey: actualKey };
  };

  // --------------------------------------------------------------------------
  // Invoke Apollo Enrichment
  // --------------------------------------------------------------------------

  const invokeApolloEnrich = async (params: ApolloEnrichParams): Promise<ApolloEnrichResult> => {
    const { data, error } = await supabase.functions.invoke('apollo-enrich', {
      body: {
        table_id: tableId,
        column_id: params.columnId,
        row_ids: params.rowIds,
        max_rows: params.maxRows,
        reveal_personal_emails: params.revealPersonalEmails ?? false,
        reveal_phone_number: params.revealPhoneNumber ?? false,
        force_refresh: params.forceRefresh ?? false,
        skip_completed: params.skipCompleted ?? false,
      },
    });

    if (error) throw error;
    return data as ApolloEnrichResult;
  };

  // --------------------------------------------------------------------------
  // Start Apollo Enrichment Mutation (bulk)
  // --------------------------------------------------------------------------

  const startApolloEnrichmentMutation = useMutation({
    mutationFn: invokeApolloEnrich,
    onMutate: async ({ columnId, columnKey, rowIds, skipCompleted }) => {
      return await optimisticPendingUpdate(columnId, rowIds, skipCompleted, columnKey);
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previousData && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      toast.error(`Apollo enrichment failed: ${error.message}`);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tableData(tableId) });
      const parts = [];
      if (result.enriched > 0) parts.push(`${result.enriched} enriched`);
      if (result.cached_hits > 0) parts.push(`${result.cached_hits} from cache`);
      if (result.failed > 0) parts.push(`${result.failed} failed`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      toast.success(`Apollo enrichment: ${parts.join(', ')}`);
    },
  });

  // --------------------------------------------------------------------------
  // Single-Row Enrichment (no toast — cell update IS the feedback)
  // --------------------------------------------------------------------------

  const singleRowMutation = useMutation({
    mutationFn: async ({ columnId, rowId, revealPersonalEmails, revealPhoneNumber }: {
      columnId: string;
      rowId: string;
      revealPersonalEmails?: boolean;
      revealPhoneNumber?: boolean;
    }) => {
      return invokeApolloEnrich({
        columnId,
        rowIds: [rowId],
        maxRows: 1,
        revealPersonalEmails,
        revealPhoneNumber,
      });
    },
    onMutate: async ({ columnId, rowId }) => {
      return await optimisticPendingUpdate(columnId, [rowId]);
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previousData && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      toast.error(`Apollo enrichment failed: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tableData(tableId) });
    },
  });

  // --------------------------------------------------------------------------
  // Re-Enrich (force refresh — bypasses cache)
  // --------------------------------------------------------------------------

  const reEnrichMutation = useMutation({
    mutationFn: async ({ columnId, rowIds }: { columnId: string; rowIds?: string[] }) => {
      return invokeApolloEnrich({ columnId, rowIds, forceRefresh: true });
    },
    onMutate: async ({ columnId, rowIds }) => {
      return await optimisticPendingUpdate(columnId, rowIds);
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previousData && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      toast.error(`Re-enrichment failed: ${error.message}`);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tableData(tableId) });
      toast.success(`Re-enriched ${result.enriched} rows from Apollo`);
    },
  });

  // --------------------------------------------------------------------------
  // Invoke Apollo Organization Enrichment
  // --------------------------------------------------------------------------

  const invokeApolloOrgEnrich = async (params: {
    columnId: string;
    rowIds?: string[];
    maxRows?: number;
    forceRefresh?: boolean;
    skipCompleted?: boolean;
  }): Promise<ApolloEnrichResult> => {
    const { data, error } = await supabase.functions.invoke('apollo-org-enrich', {
      body: {
        table_id: tableId,
        column_id: params.columnId,
        row_ids: params.rowIds,
        max_rows: params.maxRows,
        force_refresh: params.forceRefresh ?? false,
        skip_completed: params.skipCompleted ?? false,
      },
    });

    if (error) throw error;
    return data as ApolloEnrichResult;
  };

  // --------------------------------------------------------------------------
  // Start Org Enrichment Mutation
  // --------------------------------------------------------------------------

  const startOrgEnrichmentMutation = useMutation({
    mutationFn: invokeApolloOrgEnrich,
    onMutate: async ({ columnId, columnKey, rowIds, skipCompleted }) => {
      return await optimisticPendingUpdate(columnId, rowIds, skipCompleted, columnKey);
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previousData && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      toast.error(`Apollo org enrichment failed: ${error.message}`);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tableData(tableId) });
      const parts = [];
      if (result.enriched > 0) parts.push(`${result.enriched} enriched`);
      if (result.cached_hits > 0) parts.push(`${result.cached_hits} from cache`);
      if (result.failed > 0) parts.push(`${result.failed} failed`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      toast.success(`Apollo org enrichment: ${parts.join(', ')}`);
    },
  });

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  return {
    startApolloEnrichment: startApolloEnrichmentMutation.mutate,
    startApolloEnrichmentAsync: startApolloEnrichmentMutation.mutateAsync,
    isEnrichingApollo: startApolloEnrichmentMutation.isPending,

    singleRowApolloEnrichment: singleRowMutation.mutate,

    reEnrichApollo: reEnrichMutation.mutate,
    isReEnriching: reEnrichMutation.isPending,

    startApolloOrgEnrichment: startOrgEnrichmentMutation.mutate,
    isEnrichingApolloOrg: startOrgEnrichmentMutation.isPending,
  };
}

export default useApolloEnrichment;

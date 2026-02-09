/**
 * useLinkedInEnrichment Hook
 *
 * Manages LinkedIn enrichment operations for Ops table columns.
 * Calls the apify-linkedin-enrich edge function with optimistic UI updates.
 * Mirrors the useApolloEnrichment pattern exactly.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

interface LinkedInEnrichParams {
  columnId: string;
  columnKey?: string;
  rowIds?: string[];
  maxRows?: number;
  forceRefresh?: boolean;
  skipCompleted?: boolean;
}

interface LinkedInEnrichResult {
  processed: number;
  enriched: number;
  cached_hits: number;
  failed: number;
  skipped: number;
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

export function useLinkedInEnrichment(tableId: string) {
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
  // Invoke LinkedIn Enrichment
  // --------------------------------------------------------------------------

  const invokeLinkedInEnrich = async (params: LinkedInEnrichParams): Promise<LinkedInEnrichResult> => {
    // Explicitly get session token — the custom fetch in clientV2 sometimes
    // doesn't inject the auth header for newly deployed functions
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('apify-linkedin-enrich', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: {
        table_id: tableId,
        column_id: params.columnId,
        row_ids: params.rowIds,
        max_rows: params.maxRows,
        force_refresh: params.forceRefresh ?? false,
        skip_completed: params.skipCompleted ?? false,
        _auth_token: token,
      },
    });

    if (error) throw error;
    return data as LinkedInEnrichResult;
  };

  // --------------------------------------------------------------------------
  // Start LinkedIn Enrichment Mutation (bulk)
  // --------------------------------------------------------------------------

  const startLinkedInEnrichmentMutation = useMutation({
    mutationFn: invokeLinkedInEnrich,
    onMutate: async ({ columnId, columnKey, rowIds, skipCompleted }) => {
      return await optimisticPendingUpdate(columnId, rowIds, skipCompleted, columnKey);
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previousData && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      toast.error(`LinkedIn enrichment failed: ${error.message}`);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tableData(tableId) });
      const parts = [];
      if (result.enriched > 0) parts.push(`${result.enriched} enriched`);
      if (result.cached_hits > 0) parts.push(`${result.cached_hits} from cache`);
      if (result.failed > 0) parts.push(`${result.failed} failed`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      toast.success(`LinkedIn enrichment: ${parts.join(', ')}`);
    },
  });

  // --------------------------------------------------------------------------
  // Single-Row Enrichment (no toast — cell update IS the feedback)
  // --------------------------------------------------------------------------

  const singleRowMutation = useMutation({
    mutationFn: async ({ columnId, rowId }: {
      columnId: string;
      rowId: string;
    }) => {
      return invokeLinkedInEnrich({
        columnId,
        rowIds: [rowId],
        maxRows: 1,
      });
    },
    onMutate: async ({ columnId, rowId }) => {
      return await optimisticPendingUpdate(columnId, [rowId]);
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previousData && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      toast.error(`LinkedIn enrichment failed: ${error.message}`);
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
      return invokeLinkedInEnrich({ columnId, rowIds, forceRefresh: true });
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
      toast.success(`Re-enriched ${result.enriched} rows from LinkedIn`);
    },
  });

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  return {
    startLinkedInEnrichment: startLinkedInEnrichmentMutation.mutate,
    startLinkedInEnrichmentAsync: startLinkedInEnrichmentMutation.mutateAsync,
    isEnrichingLinkedIn: startLinkedInEnrichmentMutation.isPending,

    singleRowLinkedInEnrichment: singleRowMutation.mutate,

    reEnrichLinkedIn: reEnrichMutation.mutate,
    isReEnrichingLinkedIn: reEnrichMutation.isPending,
  };
}

export default useLinkedInEnrichment;

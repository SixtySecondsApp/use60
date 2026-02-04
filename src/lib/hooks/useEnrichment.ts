/**
 * useEnrichment Hook
 *
 * Manages enrichment operations for a ops table.
 * Connects the enrich-dynamic-table edge function (Ops enrichment) to the UI,
 * providing start/retry mutations, active job polling, and progress tracking.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

interface EnrichmentJob {
  id: string;
  column_id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  total_rows: number;
  processed_rows: number;
  failed_rows: number;
  started_at: string;
  last_processed_row_index?: number;
}

interface EnrichmentResult {
  job_id: string;
  status: 'complete' | 'failed' | 'running';
  total_rows: number;
  processed_rows: number;
  failed_rows: number;
  has_more: boolean;
  last_processed_row_index: number;
}

// ============================================================================
// Query Keys
// ============================================================================

const QUERY_KEYS = {
  jobs: (tableId: string) => ['enrichment-jobs', tableId] as const,
  tableData: (tableId: string) => ['ops-table-data', tableId] as const,
};

// ============================================================================
// Hook
// ============================================================================

export function useEnrichment(tableId: string) {
  const queryClient = useQueryClient();

  // --------------------------------------------------------------------------
  // Enrichment Jobs Query (polls every 3s when active jobs exist)
  // --------------------------------------------------------------------------

  const {
    data: enrichmentJobs = [],
    isLoading: isLoadingJobs,
  } = useQuery<EnrichmentJob[]>({
    queryKey: QUERY_KEYS.jobs(tableId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrichment_jobs')
        .select('id, column_id, status, total_rows, processed_rows, failed_rows, started_at, last_processed_row_index')
        .eq('table_id', tableId)
        .in('status', ['queued', 'running'])
        .order('started_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as EnrichmentJob[];
    },
    enabled: !!tableId,
    refetchInterval: (query) => {
      const jobs = query.state.data;
      // Poll every 3s when there are active jobs
      return jobs && jobs.length > 0 ? 3000 : false;
    },
  });

  // --------------------------------------------------------------------------
  // Derived State
  // --------------------------------------------------------------------------

  const activeJob: EnrichmentJob | null = enrichmentJobs.length > 0 ? enrichmentJobs[0] : null;

  const progress = activeJob
    ? activeJob.total_rows > 0
      ? (activeJob.processed_rows / activeJob.total_rows) * 100
      : 0
    : 0;

  const isEnriching = activeJob !== null;

  // --------------------------------------------------------------------------
  // Start Enrichment Mutation
  // --------------------------------------------------------------------------

  /**
   * Invoke the enrichment edge function. If the result indicates more rows
   * remain (has_more), automatically chains another request to continue.
   */
  const invokeEnrichment = async (params: {
    columnId: string;
    rowIds?: string[];
    resumeJobId?: string;
  }): Promise<EnrichmentResult> => {
    const { data, error } = await supabase.functions.invoke('enrich-dynamic-table', {
      body: {
        table_id: tableId,
        column_id: params.columnId,
        row_ids: params.rowIds,
        resume_job_id: params.resumeJobId,
      },
    });

    if (error) throw error;
    const result = data as EnrichmentResult;

    // Auto-chain: if more rows remain, schedule the next batch
    if (result.has_more && result.status === 'running') {
      // Invalidate queries so the UI updates with progress
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.jobs(tableId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tableData(tableId) });

      // Continue with next batch (small delay to avoid hammering)
      await new Promise((resolve) => setTimeout(resolve, 500));
      return invokeEnrichment({
        columnId: params.columnId,
        resumeJobId: result.job_id,
      });
    }

    return result;
  };

  const startEnrichmentMutation = useMutation({
    mutationFn: async ({
      columnId,
      rowIds,
    }: {
      columnId: string;
      rowIds?: string[];
    }) => {
      return invokeEnrichment({ columnId, rowIds });
    },
    onSuccess: () => {
      // Refresh jobs list to pick up the completed job
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.jobs(tableId) });
      // Refresh table data to show enriched cells
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tableData(tableId) });
      toast.success('Enrichment complete');
    },
    onError: (error: Error) => {
      toast.error(`Enrichment failed: ${error.message}`);
    },
  });

  // --------------------------------------------------------------------------
  // Retry Failed Mutation
  // --------------------------------------------------------------------------

  const retryFailedMutation = useMutation({
    mutationFn: async (jobId: string) => {
      // Fetch the failed row IDs from enrichment_job_results
      const { data: failedResults, error: fetchError } = await supabase
        .from('enrichment_job_results')
        .select('row_id')
        .eq('job_id', jobId)
        .not('error', 'is', null);

      if (fetchError) throw fetchError;
      if (!failedResults || failedResults.length === 0) {
        throw new Error('No failed rows to retry');
      }

      // Get the column_id from the original job
      const { data: job, error: jobError } = await supabase
        .from('enrichment_jobs')
        .select('column_id')
        .eq('id', jobId)
        .maybeSingle();

      if (jobError) throw jobError;
      if (!job) throw new Error('Job not found');

      const failedRowIds = failedResults.map((r) => r.row_id);

      // Start enrichment with just the failed rows
      const { data, error } = await supabase.functions.invoke('enrich-dynamic-table', {
        body: {
          table_id: tableId,
          column_id: job.column_id,
          row_ids: failedRowIds,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.jobs(tableId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tableData(tableId) });
      toast.success('Retrying failed rows');
    },
    onError: (error: Error) => {
      toast.error(`Retry failed: ${error.message}`);
    },
  });

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  return {
    startEnrichment: startEnrichmentMutation.mutate,
    enrichmentJobs,
    activeJob,
    progress,
    isEnriching,
    isLoadingJobs,
    retryFailed: retryFailedMutation.mutate,
    isRetrying: retryFailedMutation.isPending,
  };
}

export default useEnrichment;

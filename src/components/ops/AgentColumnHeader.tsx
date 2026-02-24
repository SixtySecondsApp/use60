import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  Square,
  RefreshCw,
  ChevronDown,
  Sparkles,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DepthLevel = 'low' | 'medium' | 'high';

interface AgentColumn {
  id: string;
  name: string;
  research_depth: DepthLevel;
  research_objective: string;
  research_context?: string;
  enabled_providers: string[];
}

interface AgentColumnHeaderProps {
  agentColumnId: string;
  tableId: string;
  selectedRowIds: string[];
  onRunComplete?: () => void;
}

// Credit cost mapping per depth level
const DEPTH_COST: Record<DepthLevel, number> = {
  low: 3,
  medium: 5,
  high: 10,
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AgentColumnHeader({
  agentColumnId,
  tableId,
  selectedRowIds,
  onRunComplete,
}: AgentColumnHeaderProps) {
  const queryClient = useQueryClient();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'run_all' | 'run_selected' | 'rerun_failed';
    rowIds: string[];
  } | null>(null);

  // Fetch column config
  const { data: agentColumn, isLoading: isLoadingColumn } = useQuery<AgentColumn>({
    queryKey: ['agent_column', agentColumnId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_columns')
        .select('*')
        .eq('id', agentColumnId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Fetch all row IDs from the table
  const { data: allRows } = useQuery({
    queryKey: ['table_rows', tableId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dynamic_table_rows')
        .select('id')
        .eq('table_id', tableId)
        .order('position');

      if (error) throw error;
      return data;
    },
  });

  // Fetch failed runs for this column
  const { data: failedRuns } = useQuery({
    queryKey: ['failed_agent_runs', agentColumnId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_runs')
        .select('row_id')
        .eq('agent_column_id', agentColumnId)
        .eq('status', 'failed');

      if (error) throw error;
      return data;
    },
  });

  // Run research mutation
  const runResearch = useMutation({
    mutationFn: async (params: { rowIds: string[]; depthOverride?: DepthLevel }) => {
      const { data, error } = await supabase.functions.invoke('research-orchestrator', {
        body: {
          agent_column_id: agentColumnId,
          row_ids: params.rowIds,
          depth_override: params.depthOverride,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate relevant queries to refetch agent runs
      queryClient.invalidateQueries({ queryKey: ['agent_run'] });
      queryClient.invalidateQueries({ queryKey: ['failed_agent_runs', agentColumnId] });

      toast.success(`Started research for ${variables.rowIds.length} row${variables.rowIds.length !== 1 ? 's' : ''}`);
      onRunComplete?.();
    },
    onError: (error: Error) => {
      toast.error(`Failed to start research: ${error.message}`);
    },
  });

  // Stop research mutation (cancel in-progress runs)
  const stopResearch = useMutation({
    mutationFn: async () => {
      // Update all queued and in_progress runs to 'failed' with cancellation message
      const { error } = await supabase
        .from('agent_runs')
        .update({
          status: 'failed',
          error_message: 'Cancelled by user',
          completed_at: new Date().toISOString(),
        })
        .eq('agent_column_id', agentColumnId)
        .in('status', ['queued', 'in_progress']);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent_run'] });
      toast.success('Stopped all running research tasks');
    },
    onError: (error: Error) => {
      toast.error(`Failed to stop research: ${error.message}`);
    },
  });

  // Handlers
  const handleRunAll = () => {
    if (!allRows || allRows.length === 0) {
      toast.error('No rows to research');
      return;
    }

    setPendingAction({
      type: 'run_all',
      rowIds: allRows.map(r => r.id),
    });
    setShowConfirmDialog(true);
  };

  const handleRunSelected = () => {
    if (selectedRowIds.length === 0) {
      toast.error('No rows selected');
      return;
    }

    setPendingAction({
      type: 'run_selected',
      rowIds: selectedRowIds,
    });
    setShowConfirmDialog(true);
  };

  const handleStop = async () => {
    stopResearch.mutate();
  };

  const handleRerunFailed = () => {
    if (!failedRuns || failedRuns.length === 0) {
      toast.error('No failed runs to retry');
      return;
    }

    setPendingAction({
      type: 'rerun_failed',
      rowIds: failedRuns.map(r => r.row_id),
    });
    setShowConfirmDialog(true);
  };

  const handleConfirmRun = async () => {
    if (!pendingAction) return;

    // Delete existing runs for the rows we're about to research
    await supabase
      .from('agent_runs')
      .delete()
      .eq('agent_column_id', agentColumnId)
      .in('row_id', pendingAction.rowIds);

    // Trigger the research
    await runResearch.mutateAsync({ rowIds: pendingAction.rowIds });

    setShowConfirmDialog(false);
    setPendingAction(null);
  };

  const handleCancelRun = () => {
    setShowConfirmDialog(false);
    setPendingAction(null);
  };

  // Calculate estimated credits
  const estimatedCredits = pendingAction && agentColumn
    ? pendingAction.rowIds.length * DEPTH_COST[agentColumn.research_depth]
    : 0;

  if (isLoadingColumn) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
        <span className="text-xs text-gray-400">Loading...</span>
      </div>
    );
  }

  if (!agentColumn) {
    return (
      <div className="flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-red-400" />
        <span className="text-xs text-red-400">Error loading column</span>
      </div>
    );
  }

  const isRunning = runResearch.isPending;
  const isStopping = stopResearch.isPending;

  return (
    <>
      <div className="flex items-center gap-2 w-full">
        <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
        <span className="truncate text-xs font-medium text-gray-300">
          {agentColumn.name}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-auto shrink-0 p-1 rounded hover:bg-gray-800/60 transition-colors"
              disabled={isRunning || isStopping}
            >
              {isRunning || isStopping ? (
                <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={handleRunAll} disabled={isRunning || !allRows || allRows.length === 0}>
              <Play className="w-3.5 h-3.5 mr-2" />
              Run All {allRows && `(${allRows.length})`}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleRunSelected}
              disabled={isRunning || selectedRowIds.length === 0}
            >
              <Play className="w-3.5 h-3.5 mr-2" />
              Run Selected ({selectedRowIds.length})
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleStop} disabled={isStopping}>
              <Square className="w-3.5 h-3.5 mr-2" />
              Stop Running
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleRerunFailed}
              disabled={isRunning || !failedRuns || failedRuns.length === 0}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-2" />
              Re-run Failed {failedRuns && `(${failedRuns.length})`}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Research</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will research{' '}
                <span className="font-semibold text-gray-200">
                  {pendingAction?.rowIds.length ?? 0} row{pendingAction?.rowIds.length !== 1 ? 's' : ''}
                </span>{' '}
                using the{' '}
                <span className="font-semibold text-violet-300 capitalize">
                  {agentColumn.research_depth}
                </span>{' '}
                depth level.
              </p>
              <p className="text-sm">
                Estimated credit cost:{' '}
                <span className="font-bold text-violet-400">{estimatedCredits} credits</span>
              </p>
              {pendingAction?.type === 'rerun_failed' && (
                <p className="text-xs text-amber-400 flex items-start gap-1.5">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>Existing failed runs will be deleted and replaced.</span>
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelRun}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRun} disabled={runResearch.isPending}>
              {runResearch.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Research
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default AgentColumnHeader;

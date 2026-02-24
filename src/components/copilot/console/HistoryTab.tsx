/**
 * HistoryTab - Execution history with re-run support
 *
 * Thin wrapper around ExecutionHistoryList. Passes onReRun callback
 * that switches to the Playground tab with the query pre-filled.
 */

import { ExecutionHistoryList } from '@/components/copilot/lab/ExecutionHistoryList';

interface HistoryTabProps {
  organizationId: string;
  onReRun?: (message: string) => void;
}

export function HistoryTab({ organizationId, onReRun }: HistoryTabProps) {
  return (
    <div className="space-y-4">
      <ExecutionHistoryList
        orgId={organizationId}
        onReRun={onReRun}
      />
    </div>
  );
}

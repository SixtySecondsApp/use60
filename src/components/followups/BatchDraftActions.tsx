import React, { useState, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Calendar,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useFollowUpDrafts, type FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { ScheduleSendPicker } from './ScheduleSendPicker';

interface BatchDraftActionsProps {
  selectedIds: Set<string>;
  drafts: FollowUpDraft[];
  orgId: string;
  onComplete: () => void;
  onClearSelection: () => void;
}

type BatchOperation = 'approve' | 'reject' | 'schedule' | null;

export function BatchDraftActions({
  selectedIds,
  drafts,
  orgId,
  onComplete,
  onClearSelection,
}: BatchDraftActionsProps) {
  const { activeOrgId } = useOrg();
  const { user } = useAuth();
  const { updateDraftStatus } = useFollowUpDrafts({
    orgId: activeOrgId ?? undefined,
    userId: user?.id,
  });

  const [activeOp, setActiveOp] = useState<BatchOperation>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);

  const selectedDrafts = drafts.filter((d) => selectedIds.has(d.id));

  // Compute which statuses are actionable
  const approvableCount = selectedDrafts.filter(
    (d) => d.status === 'pending' || d.status === 'editing'
  ).length;
  const rejectableCount = selectedDrafts.filter(
    (d) => d.status === 'pending' || d.status === 'editing'
  ).length;
  const schedulableCount = selectedDrafts.filter(
    (d) => d.status === 'pending' || d.status === 'editing' || d.status === 'approved'
  ).length;

  const isProcessing = activeOp !== null;

  const runBatchOperation = useCallback(
    async (op: 'approve' | 'reject', targetStatus: string) => {
      const eligible = selectedDrafts.filter(
        (d) => d.status === 'pending' || d.status === 'editing'
      );

      if (eligible.length === 0) {
        toast.error(`No selected drafts can be ${op === 'approve' ? 'approved' : 'rejected'}`);
        return;
      }

      setActiveOp(op);
      setProgress({ current: 0, total: eligible.length });

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < eligible.length; i++) {
        setProgress({ current: i + 1, total: eligible.length });
        try {
          await updateDraftStatus(eligible[i].id, targetStatus);
          successCount++;
        } catch {
          failCount++;
        }
      }

      setActiveOp(null);
      setProgress({ current: 0, total: 0 });

      if (failCount > 0) {
        toast.error(
          `${successCount} ${op === 'approve' ? 'approved' : 'rejected'}, ${failCount} failed`
        );
      } else {
        toast.success(
          `${successCount} draft${successCount !== 1 ? 's' : ''} ${op === 'approve' ? 'approved' : 'rejected'}`
        );
      }

      onComplete();
    },
    [selectedDrafts, updateDraftStatus, onComplete]
  );

  const handleApproveAll = useCallback(() => {
    runBatchOperation('approve', 'approved');
  }, [runBatchOperation]);

  const handleRejectAll = useCallback(() => {
    runBatchOperation('reject', 'rejected');
  }, [runBatchOperation]);

  const handleScheduleAll = useCallback(() => {
    setShowSchedulePicker(true);
  }, []);

  // Called when schedule picker confirms a time for batch scheduling
  const handleBatchScheduled = useCallback(() => {
    setShowSchedulePicker(false);
    toast.success(
      `${schedulableCount} draft${schedulableCount !== 1 ? 's' : ''} scheduled`
    );
    onComplete();
  }, [schedulableCount, onComplete]);

  const count = selectedIds.size;

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
      {/* Action bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#37bd7e]/5">
        <span className="text-sm font-medium text-gray-900 dark:text-white mr-1">
          {count} selected
        </span>

        {isProcessing ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin text-[#37bd7e]" />
            <span>
              {activeOp === 'approve' ? 'Approving' : 'Rejecting'}{' '}
              {progress.current} of {progress.total}...
            </span>
          </div>
        ) : (
          <>
            {/* Approve All */}
            <Button
              variant="success"
              size="sm"
              onClick={handleApproveAll}
              disabled={approvableCount === 0}
              title={
                approvableCount === 0
                  ? 'No selected drafts can be approved'
                  : `Approve ${approvableCount} draft${approvableCount !== 1 ? 's' : ''}`
              }
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Approve All
            </Button>

            {/* Reject All */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRejectAll}
              disabled={rejectableCount === 0}
              className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50"
              title={
                rejectableCount === 0
                  ? 'No selected drafts can be rejected'
                  : `Reject ${rejectableCount} draft${rejectableCount !== 1 ? 's' : ''}`
              }
            >
              <XCircle className="w-3.5 h-3.5 mr-1.5" />
              Reject All
            </Button>

            {/* Schedule All */}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleScheduleAll}
              disabled={schedulableCount === 0}
              title={
                schedulableCount === 0
                  ? 'No selected drafts can be scheduled'
                  : `Schedule ${schedulableCount} draft${schedulableCount !== 1 ? 's' : ''}`
              }
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              Schedule All
            </Button>

            {/* Clear Selection */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="ml-auto"
            >
              <X className="w-3.5 h-3.5 mr-1.5" />
              Clear
            </Button>
          </>
        )}
      </div>

      {/* Inline schedule picker for batch scheduling */}
      {showSchedulePicker && (
        <div className="border-t border-gray-200 dark:border-gray-800">
          <ScheduleSendPicker
            drafts={selectedDrafts.filter(
              (d) =>
                d.status === 'pending' ||
                d.status === 'editing' ||
                d.status === 'approved'
            )}
            orgId={orgId}
            onScheduled={handleBatchScheduled}
            onCancel={() => setShowSchedulePicker(false)}
          />
        </div>
      )}
    </div>
  );
}

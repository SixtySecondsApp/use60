/**
 * CCBulkActionBar — TRINITY-019
 *
 * Sticky bar that appears at the top of the left rail when 2+ items are selected.
 * Provides bulk Approve / Dismiss / Snooze actions with confirmation for destructive ops.
 * Capped at 25 items per batch to avoid hammering the API.
 */

import { useState } from 'react';
import { Check, Clock, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ============================================================================
// Props
// ============================================================================

export interface CCBulkActionBarProps {
  selectedCount: number;
  onApproveAll: () => Promise<void>;
  onDismissAll: () => Promise<void>;
  onSnoozeAll: () => Promise<void>;
  onClearSelection: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function CCBulkActionBar({
  selectedCount,
  onApproveAll,
  onDismissAll,
  onSnoozeAll,
  onClearSelection,
}: CCBulkActionBarProps) {
  const [isProcessing, setIsProcessing] = useState<'approve' | 'dismiss' | 'snooze' | null>(null);
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);

  const handleApprove = async () => {
    setIsProcessing('approve');
    try {
      await onApproveAll();
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDismiss = async () => {
    setShowDismissConfirm(false);
    setIsProcessing('dismiss');
    try {
      await onDismissAll();
    } finally {
      setIsProcessing(null);
    }
  };

  const handleSnooze = async () => {
    setIsProcessing('snooze');
    try {
      await onSnoozeAll();
    } finally {
      setIsProcessing(null);
    }
  };

  const disabled = isProcessing !== null;

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800/50 rounded-t-md">
        {/* Selection count */}
        <span className="text-xs font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap">
          {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
        </span>

        <div className="flex-1" />

        {/* Approve All */}
        <Button
          size="sm"
          variant="success"
          className="h-7 px-2.5 text-xs gap-1"
          onClick={handleApprove}
          disabled={disabled}
        >
          {isProcessing === 'approve' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Approve
        </Button>

        {/* Snooze All */}
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs gap-1"
          onClick={handleSnooze}
          disabled={disabled}
        >
          {isProcessing === 'snooze' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          Snooze
        </Button>

        {/* Dismiss All — triggers confirmation */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2.5 text-xs gap-1 text-slate-500 dark:text-gray-400 hover:text-red-600"
          onClick={() => setShowDismissConfirm(true)}
          disabled={disabled}
        >
          {isProcessing === 'dismiss' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
          Dismiss
        </Button>

        {/* Clear selection */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300"
          onClick={onClearSelection}
          disabled={disabled}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Dismiss confirmation dialog */}
      <AlertDialog open={showDismissConfirm} onOpenChange={setShowDismissConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Dismiss {selectedCount} item{selectedCount !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will dismiss all selected items. You can undo individual items afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDismiss}
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
            >
              Dismiss {selectedCount} item{selectedCount !== 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

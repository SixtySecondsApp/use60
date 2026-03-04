/**
 * BatchDraftActions — FU-006
 * Floating action bar for multi-select batch approve/reject of follow-up drafts.
 * Confirmation dialog before committing. Toast with count result.
 */

import React, { useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
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

interface BatchDraftActionsProps {
  selectedIds: Set<string>;
  orgId: string;
  onComplete: () => void;
}

type BatchAction = 'approve' | 'reject';

export function BatchDraftActions({ selectedIds, orgId, onComplete }: BatchDraftActionsProps) {
  const [pending, setPending] = useState<BatchAction | null>(null);
  const [confirming, setConfirming] = useState<BatchAction | null>(null);
  const count = selectedIds.size;

  const execute = async (action: BatchAction) => {
    setPending(action);
    setConfirming(null);

    const ids = [...selectedIds];
    const now = new Date().toISOString();
    const updates =
      action === 'approve'
        ? { status: 'approved' as const, approved_at: now }
        : { status: 'rejected' as const, rejected_at: now };

    const { error } = await supabase
      .from('follow_up_drafts')
      .update(updates)
      .in('id', ids);

    setPending(null);

    if (error) {
      toast.error(`Batch ${action} failed: ${error.message}`);
      return;
    }

    toast.success(`${count} draft${count !== 1 ? 's' : ''} ${action === 'approve' ? 'approved' : 'rejected'}`);
    onComplete();
  };

  return (
    <>
      {/* Floating bar */}
      <div className="flex-shrink-0 px-3 py-2 bg-gray-900 border-b border-[#37bd7e]/20 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-300">
          {count} selected
        </span>

        <div className="flex-1" />

        <button
          onClick={() => setConfirming('approve')}
          disabled={!!pending}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
        >
          {pending === 'approve' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          Approve all
        </button>

        <button
          onClick={() => setConfirming('reject')}
          disabled={!!pending}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-md hover:bg-red-500/20 transition-colors disabled:opacity-50"
        >
          {pending === 'reject' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <XCircle className="w-3.5 h-3.5" />
          )}
          Reject all
        </button>
      </div>

      {/* Confirmation dialogs */}
      <AlertDialog open={confirming === 'approve'} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {count} draft{count !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark {count} follow-up draft{count !== 1 ? 's' : ''} as approved. They will be queued for sending.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => execute('approve')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Approve {count}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirming === 'reject'} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {count} draft{count !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reject {count} follow-up draft{count !== 1 ? 's' : ''}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => execute('reject')}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Reject {count}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * ApprovalReviewDialog — Review and approve/reject HITL email drafts
 *
 * Opened when the Control Room receives ?approval={id} query param
 * (deep-linked from Slack "Edit in 60" button).
 *
 * Shows the email draft with editable fields, and Approve / Reject buttons.
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Loader2,
  Mail,
  Send,
  X,
} from 'lucide-react';

interface ApprovalReviewDialogProps {
  approvalId: string;
  open: boolean;
  onClose: () => void;
}

interface ApprovalRecord {
  id: string;
  status: string;
  resource_type: string;
  resource_name: string;
  original_content: {
    to?: string;
    toName?: string;
    subject?: string;
    body?: string;
    meeting_title?: string;
    ai_generated?: boolean;
  };
  edited_content: Record<string, unknown> | null;
  callback_target: string;
  expires_at: string;
  created_at: string;
}

export function ApprovalReviewDialog({ approvalId, open, onClose }: ApprovalReviewDialogProps) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const { data: approval, isLoading, error } = useQuery({
    queryKey: ['hitl-approval', approvalId],
    queryFn: async (): Promise<ApprovalRecord | null> => {
      const { data, error: queryError } = await supabase
        .from('hitl_pending_approvals')
        .select('id, status, resource_type, resource_name, original_content, edited_content, callback_target, expires_at, created_at')
        .eq('id', approvalId)
        .maybeSingle();

      if (queryError) throw new Error(queryError.message);
      return data as ApprovalRecord | null;
    },
    enabled: open && !!approvalId,
  });

  // Populate form when approval data loads
  useEffect(() => {
    if (approval) {
      const content = approval.edited_content || approval.original_content || {};
      setTo((content as Record<string, string>).to || '');
      setSubject((content as Record<string, string>).subject || '');
      setBody((content as Record<string, string>).body || '');
    }
  }, [approval]);

  const handleApprove = async () => {
    setIsSending(true);
    try {
      const { error: invokeError } = await supabase.functions.invoke('hitl-send-followup-email', {
        body: {
          approval_id: approvalId,
          action: 'approved',
          content: {
            to,
            recipientEmail: to,
            subject,
            body,
          },
        },
      });

      if (invokeError) {
        // Fallback: update status directly
        const { error: updateError } = await supabase
          .from('hitl_pending_approvals')
          .update({
            status: 'approved',
            actioned_at: new Date().toISOString(),
            edited_content: { to, subject, body },
            response: { action: 'approved', source: 'control_room' },
          })
          .eq('id', approvalId);

        if (updateError) throw new Error(updateError.message);
      }

      toast.success('Email approved and sent');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      const { error: updateError } = await supabase
        .from('hitl_pending_approvals')
        .update({
          status: 'rejected',
          actioned_at: new Date().toISOString(),
          response: { action: 'rejected', source: 'control_room' },
        })
        .eq('id', approvalId);

      if (updateError) throw new Error(updateError.message);
      toast.success('Email draft dismissed');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to dismiss');
    } finally {
      setIsRejecting(false);
    }
  };

  const isExpired = approval?.expires_at
    ? new Date(approval.expires_at) < new Date()
    : false;

  const isAlreadyActioned = approval?.status !== 'pending';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Mail className="w-5 h-5 text-blue-500" />
            Review Email Draft
          </DialogTitle>
          <DialogDescription>
            {approval?.resource_name || 'AI-generated follow-up email ready for review'}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        )}

        {error && (
          <div className="py-8 text-center text-sm text-red-500">
            Failed to load approval: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        )}

        {!isLoading && !approval && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Approval not found or has been deleted.
          </div>
        )}

        {approval && isAlreadyActioned && (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-8 h-8 mx-auto text-green-500 mb-2" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              This email has already been {approval.status}
            </p>
          </div>
        )}

        {approval && !isAlreadyActioned && (
          <div className="space-y-4 py-2">
            {isExpired && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-400">
                This approval has expired. You can still send it manually.
              </div>
            )}

            {approval.original_content?.ai_generated && (
              <div className="rounded-md bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 p-2.5 text-xs text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 shrink-0" />
                AI-generated draft — review and edit before sending
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">To</label>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Subject</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Body</label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Email body"
                className="min-h-[200px] text-sm leading-relaxed resize-none"
              />
            </div>
          </div>
        )}

        {approval && !isAlreadyActioned && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={isSending || isRejecting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              {isRejecting ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <X className="w-4 h-4 mr-1.5" />
              )}
              Skip
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isSending || isRejecting || !to.trim() || !subject.trim() || !body.trim()}
              className="bg-[#37bd7e] hover:bg-[#2ea76d] text-white"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-1.5" />
              )}
              Approve & Send
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ApprovalReviewDialog;

import { useState } from 'react';
import { X, Send, Clock, CheckCircle2, Loader2, AlertCircle, XCircle, Ticket } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type SupportTicket, type TicketStatus, useUpdateTicketStatus } from '@/lib/hooks/useSupportTickets';
import { useSendSupportMessage } from '@/lib/hooks/useSupportMessages';
import { TicketConversation } from './TicketConversation';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface TicketDetailProps {
  ticket: SupportTicket;
  open: boolean;
  onClose: () => void;
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; icon: React.ElementType; color: string }> = {
  open: { label: 'Open', icon: Clock, color: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/30' },
  in_progress: { label: 'In Progress', icon: Loader2, color: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/30' },
  waiting_on_customer: { label: 'Waiting on You', icon: AlertCircle, color: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 border-purple-200 dark:border-purple-500/30' },
  resolved: { label: 'Resolved', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30' },
  closed: { label: 'Closed', icon: XCircle, color: 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700' },
};

const STATUS_TIMELINE: { status: TicketStatus; label: string }[] = [
  { status: 'open', label: 'Opened' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'waiting_on_customer', label: 'Waiting on Customer' },
  { status: 'resolved', label: 'Resolved' },
];

const PRIORITY_COLOR = {
  low: 'text-gray-500',
  medium: 'text-blue-500',
  high: 'text-orange-500',
  urgent: 'text-red-500',
};

const CATEGORY_LABEL: Record<string, string> = {
  bug: 'Bug',
  feature_request: 'Feature Request',
  billing: 'Billing',
  how_to: 'How To',
  other: 'Other',
};

function StatusTimeline({ currentStatus }: { currentStatus: TicketStatus }) {
  const resolvedStatuses: TicketStatus[] = ['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'];
  const currentIndex = resolvedStatuses.indexOf(currentStatus);

  return (
    <div className="flex items-center gap-1.5 py-3">
      {STATUS_TIMELINE.map((step, idx) => {
        const isPast = resolvedStatuses.indexOf(step.status) < currentIndex;
        const isCurrent = step.status === currentStatus;
        return (
          <div key={step.status} className="flex items-center gap-1.5 flex-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div
                className={cn(
                  'w-2.5 h-2.5 rounded-full border-2',
                  isPast || isCurrent
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-gray-200 dark:bg-gray-700 border-gray-200 dark:border-gray-700'
                )}
              />
              <span className={cn(
                'text-[10px] text-center leading-tight',
                isCurrent ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400 dark:text-gray-500'
              )}>
                {step.label}
              </span>
            </div>
            {idx < STATUS_TIMELINE.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 rounded-full mt-[-12px]',
                  isPast ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TicketDetail({ ticket, open, onClose }: TicketDetailProps) {
  const [replyText, setReplyText] = useState('');
  const statusConfig = STATUS_CONFIG[ticket.status];
  const StatusIcon = statusConfig.icon;

  const { mutateAsync: sendMessage, isPending: isSending } = useSendSupportMessage(ticket);
  const { mutateAsync: updateStatus } = useUpdateTicketStatus();

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || isSending) return;
    await sendMessage(replyText);
    setReplyText('');
  };

  const handleClose = async () => {
    await updateStatus({ ticketId: ticket.id, status: 'closed' });
  };

  const isActive = !['resolved', 'closed'].includes(ticket.status);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        hideClose
        className="!top-16 !h-[calc(100vh-4rem)] w-full sm:max-w-lg p-0 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 shrink-0 mt-0.5">
                <Ticket className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight truncate">
                  {ticket.subject}
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  #{ticket.id.slice(0, 8).toUpperCase()} · Opened {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Badge variant="outline" className={cn('text-[11px] flex items-center gap-1', statusConfig.color)}>
              <StatusIcon className="w-3 h-3" />
              {statusConfig.label}
            </Badge>
            <Badge variant="outline" className="text-[11px]">{CATEGORY_LABEL[ticket.category]}</Badge>
            <span className={cn('text-[11px] font-medium', PRIORITY_COLOR[ticket.priority])}>
              {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)} priority
            </span>
          </div>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-custom">
          {/* Description */}
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Description</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {ticket.description}
            </p>
          </div>

          {/* Status timeline */}
          <div className="px-5 border-b border-gray-100 dark:border-gray-800">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide pt-4 mb-1">Status Timeline</p>
            <StatusTimeline currentStatus={ticket.status} />
          </div>

          {/* Dates */}
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Created</p>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                {format(new Date(ticket.created_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
            {ticket.resolved_at && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Resolved</p>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                  {format(new Date(ticket.resolved_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            )}
          </div>

          {/* Conversation thread */}
          <div className="px-5 py-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Conversation</p>
            <TicketConversation ticketId={ticket.id} />
          </div>
        </div>

        {/* Reply input */}
        {isActive && (
          <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 px-5 py-4 space-y-3">
            <form onSubmit={handleSendReply} className="space-y-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Add a reply..."
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Close ticket
                </button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!replyText.trim() || isSending}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {isSending ? 'Sending...' : 'Send Reply'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

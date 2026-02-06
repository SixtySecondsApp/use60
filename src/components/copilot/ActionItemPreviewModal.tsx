/**
 * Action Item Preview Modal Component
 *
 * Displays full content of an action item with actions:
 * - Edit: Opens inline editor or navigates to edit view
 * - Approve: Executes the action (context-aware label)
 * - Dismiss: With feedback dropdown (Not relevant / Bad timing)
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Mail,
  Calendar,
  Database,
  Bell,
  Pencil,
  Check,
  Send,
  X,
  ChevronDown,
  User,
  Clock,
  AlertCircle,
  Sparkles,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type ActionItem,
  type ActionItemType,
  type FollowUpContent,
  type MeetingPrepContent,
  type CrmUpdateContent,
  type ReminderContent,
  getRelativeTime,
} from '@/lib/stores/actionItemStore';

interface ActionItemPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ActionItem | null;
  onEdit?: (item: ActionItem) => void;
  onApprove?: (item: ActionItem) => void;
  onDismiss?: (item: ActionItem, reason: string) => void;
}

function getTypeIcon(type: ActionItemType) {
  switch (type) {
    case 'follow-up':
      return Mail;
    case 'meeting-prep':
      return Calendar;
    case 'crm-update':
      return Database;
    case 'reminder':
      return Bell;
    default:
      return Mail;
  }
}

function getTypeColor(type: ActionItemType): string {
  switch (type) {
    case 'follow-up':
      return 'from-blue-500 to-cyan-500';
    case 'meeting-prep':
      return 'from-emerald-500 to-teal-500';
    case 'crm-update':
      return 'from-orange-500 to-amber-500';
    case 'reminder':
      return 'from-violet-500 to-purple-500';
    default:
      return 'from-slate-500 to-slate-600';
  }
}

function getApproveLabel(type: ActionItemType): string {
  switch (type) {
    case 'follow-up':
      return 'Approve & Send';
    case 'meeting-prep':
      return 'Mark Ready';
    case 'crm-update':
      return 'Approve Update';
    case 'reminder':
      return 'Acknowledge';
    default:
      return 'Approve';
  }
}

function getTypeLabel(type: ActionItemType): string {
  switch (type) {
    case 'follow-up':
      return 'Follow-up Email';
    case 'meeting-prep':
      return 'Meeting Prep';
    case 'crm-update':
      return 'CRM Update';
    case 'reminder':
      return 'Reminder';
    default:
      return 'Action Item';
  }
}

// Content renderers for each action item type
function FollowUpContentView({ content }: { content: FollowUpContent }) {
  return (
    <div className="space-y-4">
      {/* Email header */}
      <div className="space-y-2 p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 text-sm">
          <User className="w-4 h-4 text-slate-400" />
          <span className="text-slate-400">To:</span>
          <span className="text-white">{content.to}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4 text-slate-400" />
          <span className="text-slate-400">Subject:</span>
          <span className="text-white">{content.subject}</span>
        </div>
      </div>

      {/* Email body */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <p className="text-sm text-slate-300 whitespace-pre-wrap">{content.body}</p>
      </div>
    </div>
  );
}

function MeetingPrepContentView({ content }: { content: MeetingPrepContent }) {
  return (
    <div className="space-y-4">
      {/* Meeting header */}
      <div className="space-y-2 p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-emerald-400" />
          <span className="text-white font-medium">{content.meetingTitle}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-slate-400" />
          <span className="text-slate-300">{content.meetingTime}</span>
        </div>
        {content.attendees.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-slate-400" />
            <span className="text-slate-300">{content.attendees.join(', ')}</span>
          </div>
        )}
      </div>

      {/* Talking points */}
      {content.talkingPoints.length > 0 && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Talking Points
          </h4>
          <ul className="space-y-2">
            {content.talkingPoints.map((point, index) => (
              <li key={index} className="text-sm text-slate-300 flex items-start gap-2">
                <span className="text-violet-400 mt-0.5">•</span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risks */}
      {content.risks && content.risks.length > 0 && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Risks to Watch
          </h4>
          <ul className="space-y-1">
            {content.risks.map((risk, index) => (
              <li key={index} className="text-sm text-red-300/80">
                • {risk}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Opportunities */}
      {content.opportunities && content.opportunities.length > 0 && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Opportunities
          </h4>
          <ul className="space-y-1">
            {content.opportunities.map((opp, index) => (
              <li key={index} className="text-sm text-emerald-300/80">
                • {opp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent history */}
      {content.recentHistory && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <h4 className="text-sm font-medium text-white mb-2">Recent History</h4>
          <p className="text-sm text-slate-400">{content.recentHistory}</p>
        </div>
      )}
    </div>
  );
}

function CrmUpdateContentView({ content }: { content: CrmUpdateContent }) {
  return (
    <div className="space-y-4">
      {/* Entity info */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 text-sm mb-2">
          <Database className="w-4 h-4 text-orange-400" />
          <span className="text-slate-400 capitalize">{content.entityType}:</span>
          <span className="text-white font-medium">{content.entityName}</span>
        </div>
      </div>

      {/* Field change */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <h4 className="text-sm font-medium text-white mb-3">Suggested Change</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Field:</span>
            <span className="text-sm text-white">{content.field}</span>
          </div>
          {content.currentValue && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Current:</span>
              <span className="text-sm text-slate-500 line-through">{content.currentValue}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">New:</span>
            <span className="text-sm text-emerald-400 font-medium">{content.suggestedValue}</span>
          </div>
        </div>
      </div>

      {/* Reason */}
      <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
        <h4 className="text-sm font-medium text-violet-400 mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Why this update?
        </h4>
        <p className="text-sm text-violet-300/80">{content.reason}</p>
      </div>
    </div>
  );
}

function ReminderContentView({ content }: { content: ReminderContent }) {
  return (
    <div className="space-y-4">
      {/* Message */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <p className="text-sm text-slate-300">{content.message}</p>
      </div>

      {/* Entity context if present */}
      {content.entityName && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 text-sm">
            {content.entityType === 'contact' ? (
              <User className="w-4 h-4 text-violet-400" />
            ) : (
              <Database className="w-4 h-4 text-amber-400" />
            )}
            <span className="text-slate-400 capitalize">{content.entityType}:</span>
            <span className="text-white">{content.entityName}</span>
          </div>
          {content.daysSinceActivity && (
            <div className="flex items-center gap-2 text-sm mt-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-slate-400">Last activity:</span>
              <span className="text-amber-400">{content.daysSinceActivity} days ago</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionItemContent({ item }: { item: ActionItem }) {
  switch (item.type) {
    case 'follow-up':
      return <FollowUpContentView content={item.content as FollowUpContent} />;
    case 'meeting-prep':
      return <MeetingPrepContentView content={item.content as MeetingPrepContent} />;
    case 'crm-update':
      return <CrmUpdateContentView content={item.content as CrmUpdateContent} />;
    case 'reminder':
      return <ReminderContentView content={item.content as ReminderContent} />;
    default:
      return (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <p className="text-sm text-slate-400">No preview available.</p>
        </div>
      );
  }
}

export function ActionItemPreviewModal({
  isOpen,
  onClose,
  item,
  onEdit,
  onApprove,
  onDismiss,
}: ActionItemPreviewModalProps) {
  const [isApproving, setIsApproving] = useState(false);

  if (!item) return null;

  const Icon = getTypeIcon(item.type);
  const gradientColor = getTypeColor(item.type);
  const approveLabel = getApproveLabel(item.type);
  const typeLabel = getTypeLabel(item.type);
  const relativeTime = getRelativeTime(item.createdAt);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      onApprove?.(item);
      onClose();
    } finally {
      setIsApproving(false);
    }
  };

  const handleDismiss = (reason: string) => {
    onDismiss?.(item, reason);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col',
          'bg-slate-900/95 dark:bg-slate-900/95 border-slate-700/50'
        )}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3 text-white">
            <div
              className={cn(
                'w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center',
                gradientColor
              )}
            >
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block truncate">{item.title}</span>
            </div>
          </DialogTitle>
          <DialogDescription className="text-slate-400 flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10">{typeLabel}</span>
            <span className="text-xs">Generated {relativeTime}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto py-4 -mx-6 px-6">
          <ActionItemContent item={item} />
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2 border-t border-white/5 pt-4 -mx-6 px-6">
          {/* Dismiss dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="bg-transparent border-white/10 text-slate-400 hover:bg-white/5 hover:text-white"
              >
                <X className="w-4 h-4 mr-2" />
                Dismiss
                <ChevronDown className="w-3 h-3 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-slate-800 border-slate-700">
              <DropdownMenuItem
                onClick={() => handleDismiss('not_relevant')}
                className="text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer"
              >
                Not relevant
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDismiss('bad_timing')}
                className="text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer"
              >
                Bad timing
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Edit button */}
          {item.actions.includes('edit') && (
            <Button
              variant="outline"
              onClick={() => {
                onEdit?.(item);
                onClose();
              }}
              className="bg-transparent border-white/10 text-slate-400 hover:bg-white/5 hover:text-white"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}

          {/* Approve button */}
          {item.actions.includes('approve') && (
            <Button
              onClick={handleApprove}
              disabled={isApproving}
              className={cn(
                'bg-gradient-to-r from-violet-500 to-purple-600 text-white',
                'hover:from-violet-400 hover:to-purple-500',
                'shadow-sm shadow-violet-500/20 hover:shadow-violet-500/30',
                'ml-auto'
              )}
            >
              {item.type === 'follow-up' ? (
                <Send className="w-4 h-4 mr-2" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              {isApproving ? 'Processing...' : approveLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ActionItemPreviewModal;

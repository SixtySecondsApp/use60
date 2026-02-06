/**
 * Action Item Card Component
 *
 * Displays a single action item with:
 * - Icon based on type (email, meeting-prep, crm-update, reminder)
 * - Title and preview snippet
 * - Timestamp (Generated Xm ago)
 * - Action buttons: Preview, Edit, Approve (or Approve & Send for emails)
 */

import React from 'react';
import {
  Mail,
  Calendar,
  Database,
  Bell,
  Eye,
  Pencil,
  Check,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type ActionItem,
  type ActionItemType,
  getRelativeTime,
} from '@/lib/stores/actionItemStore';

interface ActionItemCardProps {
  item: ActionItem;
  onPreview?: (item: ActionItem) => void;
  onEdit?: (item: ActionItem) => void;
  onApprove?: (item: ActionItem) => void;
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
      return 'Approve';
    case 'reminder':
      return 'Acknowledge';
    default:
      return 'Approve';
  }
}

export function ActionItemCard({
  item,
  onPreview,
  onEdit,
  onApprove,
}: ActionItemCardProps) {
  const Icon = getTypeIcon(item.type);
  const gradientColor = getTypeColor(item.type);
  const approveLabel = getApproveLabel(item.type);
  const relativeTime = getRelativeTime(item.createdAt);

  return (
    <div
      className={cn(
        'group p-3 rounded-xl bg-white/5 border border-white/10',
        'hover:bg-white/[0.07] hover:border-violet-500/30',
        'transition-all duration-200 cursor-pointer',
        'focus-within:ring-2 focus-within:ring-violet-500/50 focus-within:border-violet-500/30'
      )}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onPreview) {
          onPreview(item);
        }
      }}
      onClick={() => onPreview?.(item)}
    >
      {/* Header Row */}
      <div className="flex items-start gap-3">
        {/* Type Icon */}
        <div
          className={cn(
            'w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0',
            gradientColor
          )}
        >
          <Icon className="w-4 h-4 text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{item.title}</p>
          <p className="text-xs text-slate-400 truncate mt-0.5">{item.preview}</p>
          <p className="text-xs text-slate-500 mt-1">Generated {relativeTime}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
        {item.actions.includes('preview') && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPreview?.(item);
            }}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs',
              'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white',
              'transition-colors'
            )}
          >
            <Eye className="w-3 h-3" />
            Preview
          </button>
        )}

        {item.actions.includes('edit') && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(item);
            }}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs',
              'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white',
              'transition-colors'
            )}
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        )}

        {item.actions.includes('approve') && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onApprove?.(item);
            }}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ml-auto',
              'bg-gradient-to-r from-violet-500 to-purple-600 text-white',
              'hover:from-violet-400 hover:to-purple-500',
              'shadow-sm shadow-violet-500/20 hover:shadow-violet-500/30',
              'transition-all'
            )}
          >
            {item.type === 'follow-up' ? (
              <Send className="w-3 h-3" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            {approveLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default ActionItemCard;

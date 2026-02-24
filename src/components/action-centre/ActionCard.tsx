/**
 * ActionCard Component
 *
 * AC-003: Smart card component for Action Centre items.
 *
 * Features:
 * - One-click approve for low-risk items
 * - Edit modal for high-risk items
 * - Risk level indicators (green/yellow/red/blue)
 * - Framer Motion animations
 *
 * @see docs/project-requirements/PRD_ACTION_CENTRE.md
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  Mail,
  CheckSquare,
  MessageSquare,
  Edit3,
  AlertTriangle,
  Lightbulb,
  FileText,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionCentreItem } from '@/pages/platform/ActionCentre';

// ============================================================================
// Types
// ============================================================================

interface ActionCardProps {
  item: ActionCentreItem;
  onApprove: (itemId: string, edits?: Record<string, unknown>) => void;
  onDismiss: (itemId: string) => void;
  isLoading: boolean;
  isCompleted?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

const getActionIcon = (type: ActionCentreItem['action_type']) => {
  switch (type) {
    case 'email':
      return Mail;
    case 'task':
      return CheckSquare;
    case 'slack_message':
      return MessageSquare;
    case 'field_update':
      return Edit3;
    case 'alert':
      return AlertTriangle;
    case 'insight':
      return Lightbulb;
    case 'meeting_prep':
      return FileText;
    default:
      return FileText;
  }
};

const getRiskStyles = (risk: ActionCentreItem['risk_level']) => {
  switch (risk) {
    case 'low':
      return {
        dot: 'bg-emerald-500',
        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
        border: 'border-emerald-200 dark:border-emerald-800/30',
        text: 'text-emerald-700 dark:text-emerald-400',
      };
    case 'medium':
      return {
        dot: 'bg-amber-500',
        bg: 'bg-amber-50 dark:bg-amber-900/20',
        border: 'border-amber-200 dark:border-amber-800/30',
        text: 'text-amber-700 dark:text-amber-400',
      };
    case 'high':
      return {
        dot: 'bg-red-500',
        bg: 'bg-red-50 dark:bg-red-900/20',
        border: 'border-red-200 dark:border-red-800/30',
        text: 'text-red-700 dark:text-red-400',
      };
    case 'info':
      return {
        dot: 'bg-blue-500',
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: 'border-blue-200 dark:border-blue-800/30',
        text: 'text-blue-700 dark:text-blue-400',
      };
    default:
      return {
        dot: 'bg-gray-500',
        bg: 'bg-gray-50 dark:bg-gray-900/20',
        border: 'border-gray-200 dark:border-gray-800/30',
        text: 'text-gray-700 dark:text-gray-400',
      };
  }
};

const getStatusBadge = (status: ActionCentreItem['status']) => {
  switch (status) {
    case 'approved':
      return { label: 'Approved', variant: 'default' as const, className: 'bg-emerald-500' };
    case 'dismissed':
      return { label: 'Dismissed', variant: 'secondary' as const, className: '' };
    case 'done':
      return { label: 'Done', variant: 'default' as const, className: 'bg-blue-500' };
    case 'expired':
      return { label: 'Expired', variant: 'outline' as const, className: '' };
    default:
      return { label: 'Pending', variant: 'outline' as const, className: '' };
  }
};

const formatActionType = (type: ActionCentreItem['action_type']) => {
  const labels: Record<ActionCentreItem['action_type'], string> = {
    email: 'Email',
    task: 'Task',
    slack_message: 'Slack',
    field_update: 'Field Update',
    alert: 'Alert',
    insight: 'Insight',
    meeting_prep: 'Meeting Prep',
  };
  return labels[type] || type;
};

// ============================================================================
// Component
// ============================================================================

export function ActionCard({
  item,
  onApprove,
  onDismiss,
  isLoading,
  isCompleted = false,
}: ActionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editedData, setEditedData] = useState<Record<string, unknown>>(item.preview_data);

  const Icon = getActionIcon(item.action_type);
  const riskStyles = getRiskStyles(item.risk_level);
  const statusBadge = getStatusBadge(item.status);
  const isHighRisk = item.risk_level === 'high' || item.risk_level === 'medium';
  const isInsight = item.action_type === 'insight';

  const handleApprove = () => {
    if (isHighRisk && !isPreviewOpen) {
      setIsPreviewOpen(true);
    } else {
      onApprove(item.id, editedData);
      setIsPreviewOpen(false);
    }
  };

  const handleConfirmWithEdits = () => {
    onApprove(item.id, editedData);
    setIsPreviewOpen(false);
  };

  const timeAgo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true });

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
        transition={{ duration: 0.3 }}
      >
        <Card
          className={cn(
            'overflow-hidden transition-all duration-200',
            !isCompleted && 'hover:shadow-md',
            isCompleted && 'opacity-75'
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              {/* Risk Indicator */}
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  riskStyles.bg,
                  riskStyles.border,
                  'border'
                )}
              >
                <Icon className={cn('w-5 h-5', riskStyles.text)} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {item.title}
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {formatActionType(item.action_type)}
                      </Badge>
                      {/* Risk dot */}
                      <div className={cn('w-2 h-2 rounded-full', riskStyles.dot)} />
                      {isCompleted && (
                        <Badge
                          variant={statusBadge.variant}
                          className={cn('text-xs', statusBadge.className)}
                        >
                          {statusBadge.label}
                        </Badge>
                      )}
                    </div>
                    {item.description && (
                      <p
                        className={cn(
                          'text-sm text-gray-600 dark:text-gray-400 mt-1',
                          !isExpanded && 'line-clamp-2'
                        )}
                      >
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-xs text-gray-500 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
                    {timeAgo}
                  </span>
                </div>

                {/* Expandable Preview */}
                {item.preview_data && Object.keys(item.preview_data).length > 0 && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        Hide details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Show details
                      </>
                    )}
                  </button>
                )}

                {isExpanded && item.preview_data && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <PreviewContent data={item.preview_data} actionType={item.action_type} />
                  </motion.div>
                )}

                {/* Actions */}
                {!isCompleted && (
                  <div className="flex items-center gap-2 mt-4">
                    {isInsight ? (
                      // Insight cards just have acknowledge
                      <Button
                        size="sm"
                        onClick={() => onDismiss(item.id)}
                        disabled={isLoading}
                        className="gap-1"
                      >
                        <Check className="w-4 h-4" />
                        Acknowledge
                      </Button>
                    ) : (
                      <>
                        {/* Approve button */}
                        <Button
                          size="sm"
                          onClick={handleApprove}
                          disabled={isLoading}
                          className={cn(
                            'gap-1',
                            isHighRisk
                              ? 'bg-amber-600 hover:bg-amber-700'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          )}
                        >
                          {isHighRisk ? (
                            <>
                              <Eye className="w-4 h-4" />
                              Review & Approve
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              Approve
                            </>
                          )}
                        </Button>

                        {/* Dismiss button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onDismiss(item.id)}
                          disabled={isLoading}
                          className="gap-1"
                        >
                          <X className="w-4 h-4" />
                          Dismiss
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {/* Completed timestamp */}
                {isCompleted && item.actioned_at && (
                  <p className="text-xs text-gray-500 mt-2">
                    {item.status === 'approved' ? 'Approved' : 'Dismissed'}{' '}
                    {formatDistanceToNow(new Date(item.actioned_at), { addSuffix: true })}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Edit/Preview Modal for High-Risk Items */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className={cn('w-5 h-5', riskStyles.text)} />
              {item.title}
            </DialogTitle>
            <DialogDescription>{item.description}</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <EditablePreview
              data={editedData}
              actionType={item.action_type}
              onChange={setEditedData}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmWithEdits} disabled={isLoading}>
              <Check className="w-4 h-4 mr-2" />
              Confirm & Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================================
// Preview Content Component
// ============================================================================

function PreviewContent({
  data,
  actionType,
}: {
  data: Record<string, unknown>;
  actionType: ActionCentreItem['action_type'];
}) {
  if (actionType === 'email') {
    return (
      <div className="space-y-2">
        {data.to && (
          <div>
            <span className="text-xs font-medium text-gray-500">To:</span>
            <span className="text-sm ml-2 text-gray-900 dark:text-gray-100">
              {String(data.to)}
            </span>
          </div>
        )}
        {data.subject && (
          <div>
            <span className="text-xs font-medium text-gray-500">Subject:</span>
            <span className="text-sm ml-2 text-gray-900 dark:text-gray-100">
              {String(data.subject)}
            </span>
          </div>
        )}
        {data.body && (
          <div>
            <span className="text-xs font-medium text-gray-500 block mb-1">Body:</span>
            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-white dark:bg-gray-900/50 p-2 rounded border border-gray-200 dark:border-gray-700">
              {String(data.body)}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (actionType === 'task') {
    return (
      <div className="space-y-2">
        {data.title && (
          <div>
            <span className="text-xs font-medium text-gray-500">Task:</span>
            <span className="text-sm ml-2 text-gray-900 dark:text-gray-100">
              {String(data.title)}
            </span>
          </div>
        )}
        {data.due_date && (
          <div>
            <span className="text-xs font-medium text-gray-500">Due:</span>
            <span className="text-sm ml-2 text-gray-900 dark:text-gray-100">
              {String(data.due_date)}
            </span>
          </div>
        )}
        {data.notes && (
          <div>
            <span className="text-xs font-medium text-gray-500 block mb-1">Notes:</span>
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {String(data.notes)}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (actionType === 'slack_message') {
    return (
      <div className="space-y-2">
        {data.channel && (
          <div>
            <span className="text-xs font-medium text-gray-500">Channel:</span>
            <span className="text-sm ml-2 text-gray-900 dark:text-gray-100">
              #{String(data.channel)}
            </span>
          </div>
        )}
        {data.message && (
          <div>
            <span className="text-xs font-medium text-gray-500 block mb-1">Message:</span>
            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {String(data.message)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Generic preview for other types
  return (
    <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-40">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ============================================================================
// Editable Preview Component
// ============================================================================

function EditablePreview({
  data,
  actionType,
  onChange,
}: {
  data: Record<string, unknown>;
  actionType: ActionCentreItem['action_type'];
  onChange: (data: Record<string, unknown>) => void;
}) {
  const updateField = (key: string, value: string) => {
    onChange({ ...data, [key]: value });
  };

  if (actionType === 'email') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="email-to">To</Label>
          <Input
            id="email-to"
            value={String(data.to || '')}
            onChange={(e) => updateField('to', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="email-subject">Subject</Label>
          <Input
            id="email-subject"
            value={String(data.subject || '')}
            onChange={(e) => updateField('subject', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="email-body">Body</Label>
          <Textarea
            id="email-body"
            value={String(data.body || '')}
            onChange={(e) => updateField('body', e.target.value)}
            rows={8}
            className="mt-1 font-mono text-sm"
          />
        </div>
      </div>
    );
  }

  if (actionType === 'task') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="task-title">Task Title</Label>
          <Input
            id="task-title"
            value={String(data.title || '')}
            onChange={(e) => updateField('title', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="task-due">Due Date</Label>
          <Input
            id="task-due"
            type="date"
            value={String(data.due_date || '')}
            onChange={(e) => updateField('due_date', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="task-notes">Notes</Label>
          <Textarea
            id="task-notes"
            value={String(data.notes || '')}
            onChange={(e) => updateField('notes', e.target.value)}
            rows={4}
            className="mt-1"
          />
        </div>
      </div>
    );
  }

  if (actionType === 'slack_message') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="slack-channel">Channel</Label>
          <Input
            id="slack-channel"
            value={String(data.channel || '')}
            onChange={(e) => updateField('channel', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="slack-message">Message</Label>
          <Textarea
            id="slack-message"
            value={String(data.message || '')}
            onChange={(e) => updateField('message', e.target.value)}
            rows={6}
            className="mt-1"
          />
        </div>
      </div>
    );
  }

  // Generic editable for other types
  return (
    <div>
      <Label>Action Data (JSON)</Label>
      <Textarea
        value={JSON.stringify(data, null, 2)}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            // Invalid JSON, ignore
          }
        }}
        rows={10}
        className="mt-1 font-mono text-sm"
      />
    </div>
  );
}

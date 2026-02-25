/**
 * CCEmailPanel — CC-008
 *
 * Email-specific detail panel for Command Centre items where
 * drafted_action.type is 'send_email', 'email_draft', or 'follow_up'.
 *
 * Modes:
 *  - Preview (default): read-only To/Subject fields + TipTap in editable={false} mode
 *  - Edit: Subject becomes editable input, TipTap switches to full toolbar editable mode
 *
 * Below the email in both modes: Agent Reasoning section (BrainCircuit icon,
 * reasoning text, confidence %, source event).
 */

import { useState } from 'react';
import { BrainCircuit, Edit3, Loader2, Mail, Save, Send, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TipTapEditor } from '@/components/email/TipTapEditor';
import { toast } from 'sonner';
import type { CCItem } from '@/lib/services/commandCentreItemsService';

// ============================================================================
// Props
// ============================================================================

export interface CCEmailPanelProps {
  item: CCItem;
  onSave: (updatedAction: Record<string, unknown>) => void;
  isSaving: boolean;
  onApproveAndSend?: (payload: { to: string; subject: string; body_html: string }) => void;
  isSending?: boolean;
}

// ============================================================================
// Main CCEmailPanel
// ============================================================================

export function CCEmailPanel({ item, onSave, isSaving, onApproveAndSend, isSending = false }: CCEmailPanelProps) {
  // All drafted_action fields accessed with optional chaining + type guards since JSONB is untyped
  const action = (item.drafted_action ?? {}) as Record<string, unknown>;

  const to = typeof action.to === 'string' ? action.to : '';
  const initialSubject = typeof action.subject === 'string' ? action.subject : '';
  const bodyHtml =
    typeof action.body_html === 'string'
      ? action.body_html
      : typeof action.body === 'string'
      ? action.body
      : '';
  const reasoning = typeof action.reasoning === 'string' ? action.reasoning : null;
  const confidence = typeof action.confidence === 'number' ? action.confidence : null;
  const sourceEvent =
    typeof action.source_event === 'string'
      ? action.source_event
      : typeof action.source === 'string'
      ? action.source
      : null;

  // ---- Edit state ----
  const [isEditing, setIsEditing] = useState(false);
  const [editedSubject, setEditedSubject] = useState(initialSubject);
  const [editedBody, setEditedBody] = useState(bodyHtml);

  const handleEdit = () => {
    // Reset to current saved values before entering edit mode
    setEditedSubject(initialSubject);
    setEditedBody(bodyHtml);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedSubject(initialSubject);
    setEditedBody(bodyHtml);
    setIsEditing(false);
  };

  const handleSave = () => {
    try {
      onSave({
        ...action,
        subject: editedSubject,
        body_html: editedBody,
        body: editedBody,
      });
      setIsEditing(false);
    } catch {
      toast.error('Failed to save email draft');
    }
  };

  const handleApproveAndSend = () => {
    if (!onApproveAndSend) return;

    // If in edit mode, persist edits first before sending
    if (isEditing) {
      onSave({
        ...action,
        subject: editedSubject,
        body_html: editedBody,
        body: editedBody,
      });
      setIsEditing(false);
    }

    const resolvedSubject = isEditing ? editedSubject : String(action?.subject ?? '');
    const resolvedBodyHtml = isEditing
      ? editedBody
      : String(action?.body_html ?? action?.body ?? '');

    onApproveAndSend({ to, subject: resolvedSubject, body_html: resolvedBodyHtml });
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-4">
      {/* ---- Email card ---- */}
      <div className="border border-slate-200 dark:border-gray-700/60 rounded-lg overflow-hidden">

        {/* To / Subject header bar */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-gray-800/60 border-b border-slate-200 dark:border-gray-700/60 space-y-2">

          {/* To row — always read-only */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-gray-400 w-16 flex-shrink-0 flex items-center gap-1">
              <User className="h-3 w-3" />
              To
            </span>
            <span
              className={cn(
                'text-sm break-all',
                to
                  ? 'text-slate-700 dark:text-gray-200'
                  : 'text-slate-400 dark:text-gray-500 italic',
              )}
            >
              {to || '—'}
            </span>
          </div>

          {/* Subject row — read-only in preview, Input in edit mode */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-gray-400 w-16 flex-shrink-0 flex items-center gap-1">
              <Mail className="h-3 w-3" />
              Subject
            </span>
            {isEditing ? (
              <Input
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
                className="h-7 text-sm flex-1 bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-600"
                placeholder="Email subject..."
              />
            ) : (
              <span
                className={cn(
                  'text-sm font-medium',
                  initialSubject
                    ? 'text-slate-800 dark:text-gray-100'
                    : 'text-slate-400 dark:text-gray-500 italic font-normal',
                )}
              >
                {initialSubject || '—'}
              </span>
            )}
          </div>
        </div>

        {/* Email body — TipTap */}
        <div className={cn('bg-white dark:bg-gray-900/60', !isEditing && 'px-2 py-2')}>
          <TipTapEditor
            content={isEditing ? editedBody : bodyHtml}
            onChange={setEditedBody}
            editable={isEditing}
            className={cn(
              !isEditing && 'border-0 rounded-none bg-transparent',
            )}
          />
        </div>

        {/* Footer: Edit / Save / Cancel buttons */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-gray-800/60 border-t border-slate-200 dark:border-gray-700/60 flex items-center justify-end gap-2">
          {isEditing ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs gap-1.5"
                onClick={handleCancel}
                disabled={isSaving}
              >
                <X className="h-3 w-3" />
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 px-3 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save Changes
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs gap-1.5"
              onClick={handleEdit}
            >
              <Edit3 className="h-3 w-3" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* ---- Approve & Send row ---- */}
      {onApproveAndSend && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="h-8 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            onClick={handleApproveAndSend}
            disabled={isSending}
          >
            {isSending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Approve &amp; Send
          </Button>
        </div>
      )}

      {/* ---- Agent Reasoning section ---- */}
      <div className="p-3 rounded-lg bg-slate-50 dark:bg-gray-800/60 border border-slate-100 dark:border-gray-700/40 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-gray-400">
          <BrainCircuit className="h-3.5 w-3.5" />
          Agent Reasoning
        </div>

        {reasoning ? (
          <p className="text-sm text-slate-600 dark:text-gray-300">{reasoning}</p>
        ) : (
          <p className="text-xs text-slate-400 dark:text-gray-500 italic">
            No reasoning data available.
          </p>
        )}

        {sourceEvent && (
          <p className="text-xs text-slate-500 dark:text-gray-400 italic">
            Source: {sourceEvent}
          </p>
        )}

        {confidence != null && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-gray-400">Confidence:</span>
            <span className="text-xs font-semibold text-emerald-600">
              {Math.round(confidence * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

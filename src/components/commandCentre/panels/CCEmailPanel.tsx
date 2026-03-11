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
import { BrainCircuit, Edit3, FileText, Loader2, Mail, RefreshCw, Save, Send, ThumbsUp, User, X } from 'lucide-react';
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
  onSaveAsDraft?: (payload: { to: string; subject: string; body_html: string }) => void;
  isSavingDraft?: boolean;
  onGoodSuggestion?: () => void;
  isMarkingGood?: boolean;
  onRegenerate?: (feedback: string) => void;
  isRegenerating?: boolean;
}

// ============================================================================
// Main CCEmailPanel
// ============================================================================

export function CCEmailPanel({ item, onSave, isSaving, onApproveAndSend, isSending = false, onSaveAsDraft, isSavingDraft = false, onGoodSuggestion, isMarkingGood = false, onRegenerate, isRegenerating = false }: CCEmailPanelProps) {
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
  const [feedbackText, setFeedbackText] = useState('');

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

  const getResolvedPayload = () => {
    if (isEditing) {
      onSave({
        ...action,
        subject: editedSubject,
        body_html: editedBody,
        body: editedBody,
      });
      setIsEditing(false);
    }

    return {
      to,
      subject: isEditing ? editedSubject : String(action?.subject ?? ''),
      body_html: isEditing ? editedBody : String(action?.body_html ?? action?.body ?? ''),
    };
  };

  const handleApproveAndSend = () => {
    if (!onApproveAndSend) return;
    onApproveAndSend(getResolvedPayload());
  };

  const handleSaveAsDraft = () => {
    if (!onSaveAsDraft) return;
    onSaveAsDraft(getResolvedPayload());
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

      {/* ---- Action buttons row ---- */}
      {(onApproveAndSend || onSaveAsDraft || onGoodSuggestion) && (
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {onApproveAndSend && (
            <Button
              size="sm"
              className="h-8 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              onClick={handleApproveAndSend}
              disabled={isSending || isSavingDraft}
            >
              {isSending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              Send Now
            </Button>
          )}
          {onSaveAsDraft && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-4 text-xs gap-1.5"
              onClick={handleSaveAsDraft}
              disabled={isSending || isSavingDraft}
            >
              {isSavingDraft ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FileText className="h-3 w-3" />
              )}
              Save as Draft
            </Button>
          )}
          {onGoodSuggestion && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-xs gap-1.5 text-slate-500 hover:text-emerald-600 dark:text-gray-400"
              onClick={onGoodSuggestion}
              disabled={isMarkingGood}
            >
              {isMarkingGood ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ThumbsUp className="h-3 w-3" />
              )}
              Good Suggestion
            </Button>
          )}
        </div>
      )}

      {/* ---- Regenerate with feedback ---- */}
      {onRegenerate && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            <RefreshCw className="h-3.5 w-3.5" />
            Teach the AI
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Tell the AI what to change and it will rewrite the email. Your feedback trains future drafts too.
          </p>
          <div className="flex gap-2">
            <Input
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="e.g. Don't use emdashes, shorter sentences, more casual tone..."
              className="h-8 text-xs flex-1 bg-white dark:bg-gray-800 border-amber-200 dark:border-amber-700/40"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && feedbackText.trim() && !isRegenerating) {
                  onRegenerate(feedbackText.trim());
                  setFeedbackText('');
                }
              }}
              disabled={isRegenerating}
            />
            <Button
              size="sm"
              className="h-8 px-3 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                if (feedbackText.trim()) {
                  onRegenerate(feedbackText.trim());
                  setFeedbackText('');
                }
              }}
              disabled={!feedbackText.trim() || isRegenerating}
            >
              {isRegenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Regenerate
            </Button>
          </div>
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

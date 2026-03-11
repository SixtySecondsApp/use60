import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Undo,
  Redo,
  CheckCircle2,
  Calendar,
  XCircle,
  History,
  Loader2,
  AlertTriangle,
  Lock,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import type { FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';
import { useFollowUpDrafts } from '@/lib/hooks/useFollowUpDrafts';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';

interface DraftEditorProps {
  draft: FollowUpDraft;
  orgId: string;
  onDraftUpdated: (draft: FollowUpDraft) => void;
  onShowHistory: () => void;
  onShowScheduler: () => void;
  showHistory: boolean;
  showScheduler: boolean;
}

const STATUS_BADGE_MAP: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline'; label: string }> = {
  pending: { variant: 'warning', label: 'Pending' },
  editing: { variant: 'default', label: 'Edited' },
  approved: { variant: 'success', label: 'Approved' },
  scheduled: { variant: 'default', label: 'Scheduled' },
  sent: { variant: 'secondary', label: 'Sent' },
  rejected: { variant: 'destructive', label: 'Rejected' },
  expired: { variant: 'secondary', label: 'Expired' },
};

const READ_ONLY_STATUSES = new Set(['sent', 'approved', 'scheduled']);

export function DraftEditor({
  draft,
  orgId,
  onDraftUpdated,
  onShowHistory,
  onShowScheduler,
  showHistory,
  showScheduler,
}: DraftEditorProps) {
  const { activeOrgId } = useOrg();
  const { user } = useAuth();
  const { updateDraftStatus } = useFollowUpDrafts({
    orgId: activeOrgId ?? undefined,
    userId: user?.id,
  });

  const isReadOnly = READ_ONLY_STATUSES.has(draft.status);

  // Local state for subject editing
  const [subject, setSubject] = useState(draft.subject);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  // Track the current body content for diff detection
  const initialBody = draft.edited_body ?? draft.body;
  const [currentBody, setCurrentBody] = useState(initialBody);

  // Detect if user has made edits vs the original AI-generated body
  const hasEdits = currentBody !== draft.body;

  // Reset local state when draft changes (user selects a different draft)
  useEffect(() => {
    setSubject(draft.subject);
    const body = draft.edited_body ?? draft.body;
    setCurrentBody(body);
  }, [draft.id, draft.subject, draft.edited_body, draft.body]);

  // TipTap extensions
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-[#37bd7e] underline cursor-pointer hover:text-[#2da56b]',
        },
      }),
      Placeholder.configure({
        placeholder: 'Write your follow-up...',
      }),
    ],
    []
  );

  const editor = useEditor({
    extensions,
    content: initialBody,
    editable: !isReadOnly,
    onUpdate: ({ editor: ed }) => {
      setCurrentBody(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[200px] p-4',
      },
    },
  });

  // Sync editor content when draft changes (e.g. user selects a different draft)
  useEffect(() => {
    if (editor) {
      const body = draft.edited_body ?? draft.body;
      if (body !== editor.getHTML()) {
        editor.commands.setContent(body);
      }
    }
  }, [draft.id, draft.edited_body, draft.body, editor]);

  // Sync editable state when draft status changes
  useEffect(() => {
    if (editor && editor.isEditable === isReadOnly) {
      editor.setEditable(!isReadOnly);
    }
  }, [isReadOnly, editor]);

  // Persist body + subject changes to the database
  const saveDraftEdits = useCallback(async () => {
    setIsSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        edited_body: currentBody,
        subject,
      };

      // If user is editing a pending draft, move it to 'editing' status
      if (draft.status === 'pending') {
        updateData.status = 'editing';
      }

      const { error } = await supabase
        .from('follow_up_drafts')
        .update(updateData)
        .eq('id', draft.id);

      if (error) {
        toast.error('Failed to save draft', { description: error.message });
        return;
      }

      const updatedDraft: FollowUpDraft = {
        ...draft,
        edited_body: currentBody,
        subject,
        status: draft.status === 'pending' ? 'editing' : draft.status,
        updated_at: new Date().toISOString(),
      };
      onDraftUpdated(updatedDraft);
      toast.success('Draft saved');
    } finally {
      setIsSaving(false);
    }
  }, [currentBody, subject, draft, onDraftUpdated]);

  // Approve & Send
  const handleApprove = useCallback(async () => {
    setIsApproving(true);
    try {
      // Save any pending edits first
      if (currentBody !== (draft.edited_body ?? draft.body) || subject !== draft.subject) {
        const { error: saveError } = await supabase
          .from('follow_up_drafts')
          .update({ edited_body: currentBody, subject })
          .eq('id', draft.id);

        if (saveError) {
          toast.error('Failed to save edits before approving', { description: saveError.message });
          return;
        }
      }

      await updateDraftStatus(draft.id, 'approved');

      const updatedDraft: FollowUpDraft = {
        ...draft,
        edited_body: currentBody,
        subject,
        status: 'approved',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      onDraftUpdated(updatedDraft);
    } catch {
      // updateDraftStatus already shows toast on error
    } finally {
      setIsApproving(false);
    }
  }, [currentBody, subject, draft, onDraftUpdated, updateDraftStatus]);

  // Reject
  const handleReject = useCallback(async () => {
    setIsRejecting(true);
    try {
      await updateDraftStatus(draft.id, 'rejected');

      const updatedDraft: FollowUpDraft = {
        ...draft,
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      onDraftUpdated(updatedDraft);
    } catch {
      // updateDraftStatus already shows toast on error
    } finally {
      setIsRejecting(false);
    }
  }, [draft, onDraftUpdated, updateDraftStatus]);

  const badgeInfo = STATUS_BADGE_MAP[draft.status] ?? { variant: 'secondary' as const, label: draft.status };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header: recipient + status */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#37bd7e]/10 flex items-center justify-center">
            <Mail className="w-4 h-4 text-[#37bd7e]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {draft.to_name ?? draft.to_email}
              </span>
              <Badge variant={badgeInfo.variant} className="flex-shrink-0">
                {badgeInfo.label}
              </Badge>
            </div>
            <span className="text-xs text-gray-500 truncate block">{draft.to_email}</span>
          </div>
        </div>

        {/* Read-only indicator */}
        {isReadOnly && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Lock className="w-3.5 h-3.5" />
            Read-only
          </div>
        )}
      </div>

      {/* Subject line */}
      <div className="px-5 py-2.5 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 flex-shrink-0 w-14">Subject</span>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={isReadOnly}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 h-8 text-sm text-gray-900 dark:text-white"
            placeholder="Email subject"
          />
        </div>
      </div>

      {/* Diff indicator */}
      {hasEdits && !isReadOnly && (
        <div className="px-5 py-1.5 bg-amber-500/5 border-b border-amber-500/10 flex items-center gap-2 flex-shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-400">
            Body has been edited from the original AI draft
          </span>
        </div>
      )}

      {/* TipTap editor area */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        {/* Toolbar */}
        {!isReadOnly && editor && (
          <div className="border-b border-gray-200 dark:border-gray-800 px-3 py-1.5 flex flex-wrap gap-0.5 flex-shrink-0">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              isActive={editor.isActive('bold')}
              icon={<Bold className="w-4 h-4" />}
              title="Bold (Ctrl+B)"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive('italic')}
              icon={<Italic className="w-4 h-4" />}
              title="Italic (Ctrl+I)"
            />
            <ToolbarButton
              onClick={() => {
                const url = window.prompt('Enter URL:');
                if (url) {
                  editor.chain().focus().setLink({ href: url }).run();
                }
              }}
              isActive={editor.isActive('link')}
              icon={<LinkIcon className="w-4 h-4" />}
              title="Add Link"
            />

            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1 self-center" />

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              isActive={editor.isActive('bulletList')}
              icon={<List className="w-4 h-4" />}
              title="Bullet List"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              isActive={editor.isActive('orderedList')}
              icon={<ListOrdered className="w-4 h-4" />}
              title="Numbered List"
            />

            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1 self-center" />

            <ToolbarButton
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              icon={<Undo className="w-4 h-4" />}
              title="Undo (Ctrl+Z)"
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              icon={<Redo className="w-4 h-4" />}
              title="Redo (Ctrl+Y)"
            />
          </div>
        )}

        {/* Editor content */}
        <div className="flex-1 overflow-y-auto">
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-gray-950/50">
        <div className="flex items-center gap-2">
          {/* History toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowHistory}
            className={cn(showHistory && 'bg-gray-100 dark:bg-gray-800')}
          >
            <History className="w-4 h-4 mr-1.5" />
            History
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {isReadOnly ? (
            <span className="text-xs text-gray-500 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Draft is {draft.status}
            </span>
          ) : (
            <>
              {/* Save edits (only if body or subject changed) */}
              {(currentBody !== (draft.edited_body ?? draft.body) || subject !== draft.subject) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveDraftEdits}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : null}
                  Save
                </Button>
              )}

              {/* Reject */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleReject}
                disabled={isRejecting}
                className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50"
              >
                {isRejecting ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4 mr-1.5" />
                )}
                Reject
              </Button>

              {/* Schedule */}
              <Button
                variant="secondary"
                size="sm"
                onClick={onShowScheduler}
                className={cn(showScheduler && 'bg-gray-100 dark:bg-gray-800')}
              >
                <Calendar className="w-4 h-4 mr-1.5" />
                Schedule
              </Button>

              {/* Approve & Send */}
              <Button
                variant="success"
                size="sm"
                onClick={handleApprove}
                disabled={isApproving}
              >
                {isApproving ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                )}
                Approve & Send
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Toolbar button ---- */

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
}

function ToolbarButton({ onClick, isActive, disabled, icon, title }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
        isActive && 'bg-[#37bd7e]/20 text-[#37bd7e]',
        disabled && 'opacity-50 cursor-not-allowed',
        !isActive && !disabled && 'text-gray-500 dark:text-gray-400'
      )}
    >
      {icon}
    </button>
  );
}

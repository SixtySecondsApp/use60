/**
 * DraftEditor — FU-002
 * Inline rich text editor for follow-up draft review and editing.
 * Send + Schedule + History toggle buttons in toolbar.
 */

import React, { useState, useCallback } from 'react';
import {
  Send,
  Calendar,
  History,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Bold,
  Italic,
  List,
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { type FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';
import { cn } from '@/lib/utils';

interface DraftEditorProps {
  draft: FollowUpDraft;
  orgId: string;
  onDraftUpdated: (draft: FollowUpDraft) => void;
  onShowHistory: () => void;
  onShowScheduler: () => void;
  showHistory: boolean;
  showScheduler: boolean;
}

export function DraftEditor({
  draft,
  orgId,
  onDraftUpdated,
  onShowHistory,
  onShowScheduler,
  showHistory,
  showScheduler,
}: DraftEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const currentBody = draft.edited_body ?? draft.body;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-[#37bd7e] underline' },
      }),
      Placeholder.configure({ placeholder: 'Edit your follow-up email...' }),
    ],
    content: currentBody,
    editorProps: {
      attributes: {
        class:
          'prose prose-invert max-w-none focus:outline-none min-h-[300px] p-4 text-sm leading-relaxed',
      },
    },
  });

  const handleSave = useCallback(async () => {
    if (!editor) return;
    setIsSaving(true);
    const editedBody = editor.getHTML();
    const { data, error } = await supabase
      .from('follow_up_drafts')
      .update({ edited_body: editedBody, status: 'editing', updated_at: new Date().toISOString() })
      .eq('id', draft.id)
      .select(
        'id, org_id, user_id, meeting_id, to_email, to_name, subject, body, edited_body, status, buying_signals, generated_at, approved_at, sent_at, rejected_at, expires_at, scheduled_email_id, created_at, updated_at'
      )
      .maybeSingle();

    setIsSaving(false);
    if (error) {
      toast.error(`Failed to save: ${error.message}`);
      return;
    }
    if (data) onDraftUpdated(data as FollowUpDraft);
    toast.success('Draft saved');
  }, [editor, draft.id, onDraftUpdated]);

  const handleSendNow = useCallback(async () => {
    if (!editor) return;
    setIsSending(true);
    const body = editor.getHTML();

    try {
      const { error: saveError } = await supabase
        .from('follow_up_drafts')
        .update({ edited_body: body, status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', draft.id);

      if (saveError) throw saveError;

      const { error: sendError } = await supabase.functions.invoke('hitl-send-followup-email', {
        body: {
          draftId: draft.id,
          userId: draft.user_id,
          orgId,
          to: draft.to_email,
          subject: draft.subject,
          body,
          action: 'approve',
        },
      });

      if (sendError) throw sendError;

      const { data: updated } = await supabase
        .from('follow_up_drafts')
        .select(
          'id, org_id, user_id, meeting_id, to_email, to_name, subject, body, edited_body, status, buying_signals, generated_at, approved_at, sent_at, rejected_at, expires_at, scheduled_email_id, created_at, updated_at'
        )
        .eq('id', draft.id)
        .maybeSingle();

      if (updated) onDraftUpdated(updated as FollowUpDraft);
      toast.success('Email sent');
    } catch (err) {
      toast.error(`Send failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSending(false);
    }
  }, [editor, draft, orgId, onDraftUpdated]);

  const handleReject = useCallback(async () => {
    setIsRejecting(true);
    const { data, error } = await supabase
      .from('follow_up_drafts')
      .update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', draft.id)
      .select(
        'id, org_id, user_id, meeting_id, to_email, to_name, subject, body, edited_body, status, buying_signals, generated_at, approved_at, sent_at, rejected_at, expires_at, scheduled_email_id, created_at, updated_at'
      )
      .maybeSingle();

    setIsRejecting(false);
    if (error) {
      toast.error(`Failed to reject: ${error.message}`);
      return;
    }
    if (data) onDraftUpdated(data as FollowUpDraft);
    toast.success('Draft rejected');
  }, [draft.id, onDraftUpdated]);

  const handleRestoreOriginal = useCallback(() => {
    if (!editor) return;
    editor.commands.setContent(draft.body);
    toast.info('Restored to AI-generated version');
  }, [editor, draft.body]);

  const isSent = draft.status === 'sent';
  const isRejected = draft.status === 'rejected';
  const readOnly = isSent || isRejected;

  if (editor && editor.isEditable !== !readOnly) {
    editor.setEditable(!readOnly);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-800 p-4">
        <p className="text-xs text-gray-500 mb-0.5">To</p>
        <p className="text-sm text-white font-medium">{draft.to_name ?? draft.to_email}</p>
        {draft.to_name && <p className="text-xs text-gray-500">{draft.to_email}</p>}
        <div className="mt-2">
          <p className="text-xs text-gray-500 mb-0.5">Subject</p>
          <p className="text-sm text-gray-200">{draft.subject}</p>
        </div>
      </div>

      {/* Formatting toolbar */}
      {!readOnly && editor && (
        <div className="flex-shrink-0 border-b border-gray-800 px-4 py-2 flex items-center gap-1">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              'p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors',
              editor.isActive('bold') && 'bg-gray-800 text-white'
            )}
            title="Bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              'p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors',
              editor.isActive('italic') && 'bg-gray-800 text-white'
            )}
            title="Italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              'p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors',
              editor.isActive('bulletList') && 'bg-gray-800 text-white'
            )}
            title="Bullet list"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1" />
          {draft.edited_body && (
            <button
              onClick={handleRestoreOriginal}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
              title="Restore AI original"
            >
              <RotateCcw className="w-3 h-3" />
              Restore original
            </button>
          )}
        </div>
      )}

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* Action toolbar */}
      <div className="flex-shrink-0 border-t border-gray-800 p-3 flex items-center gap-2">
        {!readOnly && (
          <>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save draft'}
            </button>

            <button
              onClick={onShowScheduler}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                showScheduler
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'text-gray-300 bg-gray-800 hover:bg-gray-700'
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              Schedule
            </button>

            <button
              onClick={handleSendNow}
              disabled={isSending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#37bd7e] text-black rounded-md hover:bg-[#2da56b] transition-colors disabled:opacity-50"
            >
              {isSending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Send now
            </button>

            <div className="flex-1" />

            <button
              onClick={handleReject}
              disabled={isRejecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50"
            >
              {isRejecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              Reject
            </button>
          </>
        )}

        {isSent && (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            Email sent
          </div>
        )}

        {isRejected && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <XCircle className="w-4 h-4" />
            Rejected
          </div>
        )}

        <div className="ml-auto">
          <button
            onClick={onShowHistory}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors',
              showHistory
                ? 'bg-gray-700 text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            )}
          >
            <History className="w-3.5 h-3.5" />
            History
          </button>
        </div>
      </div>
    </div>
  );
}

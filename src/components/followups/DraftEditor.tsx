import React from 'react';
import type { FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';

interface DraftEditorProps {
  draft: FollowUpDraft;
  orgId: string;
  onDraftUpdated: (draft: FollowUpDraft) => void;
  onShowHistory: () => void;
  onShowScheduler: () => void;
  showHistory: boolean;
  showScheduler: boolean;
}

export function DraftEditor({ draft }: DraftEditorProps) {
  return (
    <div className="p-4">
      <p className="text-sm text-gray-500">Draft editor placeholder</p>
    </div>
  );
}

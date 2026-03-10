import React from 'react';
import type { FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';

interface ScheduleSendPickerProps {
  draft: FollowUpDraft;
  orgId: string;
  onScheduled: (draft: FollowUpDraft) => void;
}

export function ScheduleSendPicker({ draft, orgId, onScheduled }: ScheduleSendPickerProps) {
  return (
    <div className="p-4 text-sm text-gray-500">Schedule send picker placeholder</div>
  );
}

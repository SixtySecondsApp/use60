import React from 'react';
import type { FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';

interface DraftHistoryTimelineProps {
  draft: FollowUpDraft;
}

export function DraftHistoryTimeline({ draft }: DraftHistoryTimelineProps) {
  return (
    <div className="p-4 text-sm text-gray-500">No history yet</div>
  );
}

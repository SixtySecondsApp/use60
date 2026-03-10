import React from 'react';

interface BatchDraftActionsProps {
  selectedIds: Set<string>;
  orgId: string;
  onComplete: () => void;
}

export function BatchDraftActions({ selectedIds, orgId, onComplete }: BatchDraftActionsProps) {
  return (
    <div className="p-3 border-b border-gray-200 dark:border-gray-800 text-sm text-gray-500">
      {selectedIds.size} selected
    </div>
  );
}

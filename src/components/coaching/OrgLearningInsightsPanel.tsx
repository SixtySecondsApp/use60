import React from 'react';

interface OrgLearningInsightsPanelProps {
  orgId: string;
}

export function OrgLearningInsightsPanel({ orgId }: OrgLearningInsightsPanelProps) {
  return (
    <div className="text-sm text-gray-500 py-8 text-center">
      Org learning insights coming soon
    </div>
  );
}

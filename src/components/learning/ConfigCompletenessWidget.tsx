import React from 'react';

interface ConfigCompletenessWidgetProps {
  orgId: string;
  userId?: string;
  showCategories?: boolean;
  showCTA?: boolean;
}

export function ConfigCompletenessWidget({
  orgId,
  userId,
  showCategories,
  showCTA,
}: ConfigCompletenessWidgetProps) {
  return (
    <div className="text-sm text-gray-500 py-4 text-center">
      Config completeness loading...
    </div>
  );
}

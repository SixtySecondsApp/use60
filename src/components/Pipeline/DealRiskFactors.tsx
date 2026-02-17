/**
 * DealRiskFactors Component
 *
 * Displays risk factors as colored chips sorted by severity.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DealRiskFactorsProps {
  riskFactors: string[];
  relationshipRiskFactors: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | null;
}

/**
 * Get risk chip color classes
 */
function getRiskChipClasses(riskLevel: string | null): string {
  switch (riskLevel) {
    case 'critical':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
    case 'high':
      return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800';
    case 'low':
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  }
}

export function DealRiskFactors({
  riskFactors,
  relationshipRiskFactors,
  riskLevel,
}: DealRiskFactorsProps) {
  const allRiskFactors = [
    ...riskFactors.map(f => ({ text: f, type: 'deal' as const })),
    ...relationshipRiskFactors.map(f => ({ text: f, type: 'relationship' as const })),
  ];

  if (allRiskFactors.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        No risk factors identified
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {allRiskFactors.map((factor, index) => (
        <div
          key={index}
          className={`
            flex items-start gap-2 p-3 rounded-lg border text-sm
            ${getRiskChipClasses(riskLevel)}
          `}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-medium">{factor.text}</div>
            <div className="text-xs opacity-75 mt-0.5">
              {factor.type === 'deal' ? 'Deal Risk' : 'Relationship Risk'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

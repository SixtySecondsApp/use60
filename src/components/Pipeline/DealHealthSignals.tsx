/**
 * DealHealthSignals Component
 *
 * Displays health scores as colored badges with labels.
 */

import React from 'react';
import { Heart, Shield, Ghost } from 'lucide-react';

interface DealHealthSignalsProps {
  healthScore: number | null;
  healthStatus: 'healthy' | 'warning' | 'critical' | 'stalled' | null;
  relationshipHealthScore: number | null;
  relationshipHealthStatus: 'healthy' | 'at_risk' | 'critical' | 'ghost' | null;
  ghostProbability: number | null;
}

/**
 * Get health badge color classes
 */
function getHealthBadgeClasses(status: string | null): string {
  switch (status) {
    case 'healthy':
      return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
    case 'warning':
    case 'at_risk':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800';
    case 'critical':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
    case 'stalled':
    case 'ghost':
      return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  }
}

export function DealHealthSignals({
  healthScore,
  healthStatus,
  relationshipHealthScore,
  relationshipHealthStatus,
  ghostProbability,
}: DealHealthSignalsProps) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {/* Deal Health Score */}
      <div
        className={`
          flex items-center justify-between p-4 rounded-lg border
          ${getHealthBadgeClasses(healthStatus)}
        `}
      >
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5" />
          <div>
            <div className="text-xs font-medium opacity-75">Deal Health</div>
            <div className="text-sm font-semibold">{healthStatus || 'Unknown'}</div>
          </div>
        </div>
        <div className="text-3xl font-bold">
          {healthScore !== null ? healthScore : '--'}
        </div>
      </div>

      {/* Relationship Health Score */}
      <div
        className={`
          flex items-center justify-between p-4 rounded-lg border
          ${getHealthBadgeClasses(relationshipHealthStatus)}
        `}
      >
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          <div>
            <div className="text-xs font-medium opacity-75">Relationship Health</div>
            <div className="text-sm font-semibold">{relationshipHealthStatus || 'Unknown'}</div>
          </div>
        </div>
        <div className="text-3xl font-bold">
          {relationshipHealthScore !== null ? relationshipHealthScore : '--'}
        </div>
      </div>

      {/* Ghost Risk */}
      {ghostProbability !== null && ghostProbability > 0 && (
        <div
          className={`
            flex items-center justify-between p-4 rounded-lg border
            ${getHealthBadgeClasses(ghostProbability > 50 ? 'critical' : 'warning')}
          `}
        >
          <div className="flex items-center gap-2">
            <Ghost className="w-5 h-5" />
            <div>
              <div className="text-xs font-medium opacity-75">Ghost Risk</div>
              <div className="text-sm font-semibold">
                {ghostProbability > 70 ? 'High' : ghostProbability > 40 ? 'Medium' : 'Low'}
              </div>
            </div>
          </div>
          <div className="text-3xl font-bold">
            {ghostProbability}%
          </div>
        </div>
      )}
    </div>
  );
}

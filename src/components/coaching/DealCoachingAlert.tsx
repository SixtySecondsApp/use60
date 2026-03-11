/**
 * DealCoachingAlert — Compact alert card for a stalled-deal coaching signal.
 *
 * Colour-coded by severity:
 *   - red   = deal in current stage > 3x the org average
 *   - amber = deal in current stage > 2x the org average
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, ExternalLink, GraduationCap, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DealCoachingSignal } from '@/lib/hooks/useDealCoachingSignals';

interface DealCoachingAlertProps {
  signal: DealCoachingSignal;
}

const severityStyles: Record<DealCoachingSignal['severity'], { border: string; badge: string; badgeText: string }> = {
  red: {
    border: 'border-red-500/30',
    badge: 'bg-red-500/15 text-red-400',
    badgeText: 'Critical',
  },
  amber: {
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/15 text-amber-400',
    badgeText: 'Warning',
  },
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function DealCoachingAlert({ signal }: DealCoachingAlertProps) {
  const navigate = useNavigate();
  const { deal, stallDays, avgDays, suggestion, severity } = signal;
  const styles = severityStyles[severity];

  return (
    <div
      className={cn(
        'rounded-xl border bg-gray-900/50 p-4 space-y-3 transition-colors',
        styles.border
      )}
    >
      {/* Header: deal name + value + severity badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-100 truncate">{deal.name}</h3>
            {deal.value > 0 && (
              <span className="text-xs font-medium text-gray-400 shrink-0">
                {formatCurrency(deal.value)}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{deal.company}</p>
        </div>
        <span className={cn('text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0', styles.badge)}>
          {styles.badgeText}
        </span>
      </div>

      {/* Stall info */}
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <Clock className="h-3 w-3 shrink-0" />
        <span>
          Stalled at <span className="font-medium text-gray-300">{deal.stage_name}</span> for{' '}
          <span className="font-medium text-gray-300">{stallDays} days</span>{' '}
          <span className="text-gray-600">(avg: {avgDays} days)</span>
        </span>
      </div>

      {/* Rep name */}
      <p className="text-xs text-gray-500">
        Rep: <span className="text-gray-400">{deal.owner_name}</span>
      </p>

      {/* Coaching suggestion */}
      <div className="flex gap-2 rounded-lg bg-gray-800/50 px-3 py-2">
        <Lightbulb className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-300 leading-relaxed">{suggestion}</p>
      </div>

      {/* Action links */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => navigate(`/deals/${deal.id}`)}
          className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          View Deal
        </button>
        <button
          onClick={() => navigate(`/coaching/rep/${deal.owner_id}`)}
          className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <GraduationCap className="h-3 w-3" />
          Coach Rep
        </button>
      </div>
    </div>
  );
}

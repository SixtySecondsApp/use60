/**
 * QBRPrep
 *
 * IMP-UI-005: QBR prep variant for PrepBriefCard.
 * Shows account health summary with key metrics, revenue trend and forecast,
 * key risks and opportunities, and action items from previous QBR.
 *
 * Rendered inside PrepBriefCard when meeting_type === 'qbr'.
 */

import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Activity,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PrepBrief } from '@/lib/hooks/useMeetingPrepBrief';

// ============================================================================
// Types
// ============================================================================

interface AccountHealth {
  /** 'green' | 'amber' | 'red' */
  status?: 'green' | 'amber' | 'red';
  /** 0–100 */
  score?: number;
  /** Revenue achieved vs target */
  revenue_attainment?: number;
  /** Forecast amount */
  forecast?: number;
  /** Forecast currency label, e.g. '$' */
  currency?: string;
}

interface QBRPrepProps {
  brief: PrepBrief;
  accountHealth?: AccountHealth | null;
}

// ============================================================================
// Helpers
// ============================================================================

const healthColors = {
  green: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    label: 'Healthy',
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    label: 'At Risk',
  },
  red: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    label: 'Critical',
  },
};

function formatCurrency(value: number | undefined, currency = '$'): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${currency}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${currency}${(value / 1_000).toFixed(0)}K`;
  return `${currency}${value.toFixed(0)}`;
}

// ============================================================================
// Sub-components
// ============================================================================

function HealthStatusBadge({ status }: { status: AccountHealth['status'] }) {
  if (!status) return null;
  const cfg = healthColors[status];
  return (
    <div className={cn('flex items-center gap-1.5 rounded-md border px-3 py-1.5', cfg.bg, cfg.border)}>
      <Activity className={cn('h-3.5 w-3.5', cfg.text)} />
      <span className={cn('text-xs font-semibold', cfg.text)}>{cfg.label}</span>
      {status === 'green' && (
        <TrendingUp className="h-3 w-3 text-emerald-400 ml-1" />
      )}
      {status === 'red' && (
        <TrendingDown className="h-3 w-3 text-red-400 ml-1" />
      )}
      {status === 'amber' && (
        <Minus className="h-3 w-3 text-amber-400 ml-1" />
      )}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function QBRPrep({ brief, accountHealth }: QBRPrepProps) {
  const ah = accountHealth;

  // Split sections by semantic type
  const riskSection = brief.sections.find(
    (s) => s.title.toLowerCase().includes('risk'),
  );
  const opportunitySection = brief.sections.find(
    (s) =>
      s.title.toLowerCase().includes('opportunit') ||
      s.title.toLowerCase().includes('win'),
  );
  const actionSection = brief.sections.find(
    (s) => s.title.toLowerCase().includes('action'),
  );
  const otherSections = brief.sections.filter(
    (s) => s !== riskSection && s !== opportunitySection && s !== actionSection,
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-amber-400">
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">QBR Prep</span>
        </div>
        {ah?.status && <HealthStatusBadge status={ah.status} />}
      </div>

      {/* Account health metrics */}
      {ah && (ah.score != null || ah.revenue_attainment != null || ah.forecast != null) && (
        <div className="grid grid-cols-3 gap-2">
          {ah.score != null && (
            <div className="flex flex-col items-center rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Health Score</span>
              <span className="text-sm font-semibold text-amber-400 mt-0.5">{ah.score}</span>
            </div>
          )}
          {ah.revenue_attainment != null && (
            <div className="flex flex-col items-center rounded-md border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/30 px-2 py-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Attainment</span>
              <span
                className={cn(
                  'text-sm font-semibold mt-0.5',
                  ah.revenue_attainment >= 100
                    ? 'text-emerald-400'
                    : ah.revenue_attainment >= 75
                    ? 'text-amber-400'
                    : 'text-red-400',
                )}
              >
                {ah.revenue_attainment}%
              </span>
            </div>
          )}
          {ah.forecast != null && (
            <div className="flex flex-col items-center rounded-md border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/30 px-2 py-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">Forecast</span>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 mt-0.5">
                {formatCurrency(ah.forecast, ah.currency)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Risk section */}
      {riskSection && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
            <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300">{riskSection.title}</h4>
          </div>
          <div className="pl-4 space-y-1">
            {riskSection.body.split('\n').map((line, i) => {
              if (!line.trim()) return null;
              const text = line.replace(/^[•\-*]\s/, '');
              return (
                <div key={i} className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex-shrink-0 mt-0.5 text-red-500 dark:text-red-600">•</span>
                  <span>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Opportunity section */}
      {opportunitySection && (
        <div className="space-y-2 border-t border-gray-200 dark:border-gray-800 pt-3">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
            <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300">{opportunitySection.title}</h4>
          </div>
          <div className="pl-4 space-y-1">
            {opportunitySection.body.split('\n').map((line, i) => {
              if (!line.trim()) return null;
              const text = line.replace(/^[•\-*]\s/, '');
              return (
                <div key={i} className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex-shrink-0 mt-0.5 text-amber-500 dark:text-amber-600">•</span>
                  <span>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action items from previous QBR */}
      {actionSection && (
        <div className="space-y-2 border-t border-gray-200 dark:border-gray-800 pt-3">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
            <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300">{actionSection.title}</h4>
          </div>
          <div className="pl-4 space-y-1.5">
            {actionSection.body.split('\n').map((line, i) => {
              if (!line.trim()) return null;
              const text = line.replace(/^[•\-*[\] ]+/, '');
              return (
                <div key={i} className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span className="h-3 w-3 rounded border border-gray-300 dark:border-gray-700 flex-shrink-0 mt-0.5" />
                  <span>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Other sections */}
      {otherSections.map((section, i) => (
        <div key={i} className="space-y-2 border-t border-gray-200 dark:border-gray-800 pt-3">
          <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300">{section.title}</h4>
          <div className="space-y-1">
            {section.body.split('\n').map((line, j) => {
              if (!line.trim()) return null;
              if (line.match(/^[•\-*]\s/)) {
                return (
                  <div key={j} className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex-shrink-0 mt-0.5 text-gray-400 dark:text-gray-600">•</span>
                    <span>{line.replace(/^[•\-*]\s/, '')}</span>
                  </div>
                );
              }
              return <p key={j} className="text-xs text-gray-500 dark:text-gray-400">{line}</p>;
            })}
          </div>
        </div>
      ))}

      {!ah && brief.sections.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-600 text-center py-2">
          Generating QBR prep brief...
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Skeleton for loading state
// ============================================================================

export function QBRPrepSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded bg-gray-800" />
          <div className="h-3 w-16 rounded bg-gray-800" />
        </div>
        <div className="h-6 w-20 rounded-md bg-gray-800" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 rounded-md bg-gray-800/60" />
        ))}
      </div>
      <div className="space-y-2 border-t border-gray-800 pt-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <div className="h-3 w-3 rounded-full bg-gray-800 flex-shrink-0 mt-0.5" />
            <div className="h-3 rounded bg-gray-800" style={{ width: `${60 + i * 10}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Convenience type re-export
export type { QBRPrepProps, AccountHealth };

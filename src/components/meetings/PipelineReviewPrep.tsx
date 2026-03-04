/**
 * PipelineReviewPrep
 *
 * IMP-UI-003: Pipeline review prep variant for PrepBriefCard.
 * Shows weighted pipeline data, stage breakdown, bottleneck alerts,
 * and deals needing discussion.
 *
 * Rendered inside PrepBriefCard when meeting_type === 'pipeline_review'.
 */

import { BarChart2, AlertTriangle, TrendingDown, DollarSign, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PrepBrief } from '@/lib/hooks/useMeetingPrepBrief';

// ============================================================================
// Types
// ============================================================================

interface PipelineSnapshot {
  weighted_value?: number;
  total_value?: number;
  at_risk?: number;
  target?: number;
  snapshot_date?: string;
}

interface PipelineReviewPrepProps {
  brief: PrepBrief;
  pipelineSnapshot?: PipelineSnapshot | null;
}

// ============================================================================
// Formatters
// ============================================================================

function formatCurrency(value: number | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function coveragePercent(weighted: number | undefined, target: number | undefined): number | null {
  if (!weighted || !target) return null;
  return Math.round((weighted / target) * 100);
}

// ============================================================================
// Sub-components
// ============================================================================

function MetricPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'violet' | 'amber' | 'red' | 'gray';
}) {
  const cls = {
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    gray: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  }[accent ?? 'gray'];

  return (
    <div className={cn('flex flex-col items-center rounded-md border px-3 py-2', cls)}>
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold mt-0.5">{value}</span>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function PipelineReviewPrep({ brief, pipelineSnapshot }: PipelineReviewPrepProps) {
  const snap = pipelineSnapshot;
  const coverage = coveragePercent(snap?.weighted_value, snap?.target);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-1.5 text-violet-400">
        <BarChart2 className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">Pipeline Review Prep</span>
      </div>

      {/* Snapshot metrics */}
      {snap && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricPill
            label="Weighted"
            value={formatCurrency(snap.weighted_value)}
            accent="violet"
          />
          <MetricPill
            label="Total"
            value={formatCurrency(snap.total_value)}
            accent="gray"
          />
          {snap.target != null && (
            <MetricPill
              label="Target"
              value={formatCurrency(snap.target)}
              accent="gray"
            />
          )}
          {coverage != null && (
            <MetricPill
              label="Coverage"
              value={`${coverage}%`}
              accent={coverage >= 100 ? 'violet' : coverage >= 70 ? 'amber' : 'red'}
            />
          )}
        </div>
      )}

      {/* At-risk alert */}
      {snap?.at_risk != null && snap.at_risk > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">
            <strong className="font-medium">{snap.at_risk} deal{snap.at_risk > 1 ? 's' : ''}</strong>{' '}
            flagged at risk — prioritise review in meeting.
          </p>
        </div>
      )}

      {/* AI-generated sections from the brief */}
      {brief.sections.length > 0 && (
        <div className="space-y-3 border-t border-gray-800 pt-3">
          {brief.sections.map((section, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                {section.title.toLowerCase().includes('risk') || section.title.toLowerCase().includes('block') ? (
                  <TrendingDown className="h-3 w-3 text-red-400 flex-shrink-0" />
                ) : section.title.toLowerCase().includes('deal') || section.title.toLowerCase().includes('close') ? (
                  <DollarSign className="h-3 w-3 text-violet-400 flex-shrink-0" />
                ) : (
                  <Target className="h-3 w-3 text-gray-500 flex-shrink-0" />
                )}
                <h4 className="text-xs font-semibold text-gray-300">{section.title}</h4>
              </div>
              <div className="pl-4 space-y-1">
                {section.body.split('\n').map((line, j) => {
                  if (!line.trim()) return null;
                  if (line.match(/^[•\-\*]\s/)) {
                    return (
                      <div key={j} className="flex items-start gap-1.5 text-xs text-gray-400">
                        <span className="flex-shrink-0 mt-0.5 text-gray-600">•</span>
                        <span>{line.replace(/^[•\-\*]\s/, '')}</span>
                      </div>
                    );
                  }
                  return (
                    <p key={j} className="text-xs text-gray-400">{line}</p>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!snap && brief.sections.length === 0 && (
        <p className="text-xs text-gray-600 text-center py-2">
          Pipeline data loading...
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Skeleton for loading state
// ============================================================================

export function PipelineReviewPrepSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-1.5">
        <div className="h-3.5 w-3.5 rounded bg-gray-800" />
        <div className="h-3 w-28 rounded bg-gray-800" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 rounded-md bg-gray-800/60" />
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-3 rounded bg-gray-800/60" style={{ width: `${70 + i * 10}%` }} />
        ))}
      </div>
    </div>
  );
}

// Convenience type re-export
export type { PipelineReviewPrepProps };

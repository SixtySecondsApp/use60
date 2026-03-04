/**
 * OneOnOnePrep
 *
 * IMP-UI-004: 1:1 prep variant for PrepBriefCard.
 * Shows rep scorecard averages, recent coaching notes summary,
 * open action items from previous 1:1, and deal highlights.
 *
 * Rendered inside PrepBriefCard when meeting_type === 'one_on_one'.
 */

import {
  Users,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Circle,
  MessageSquare,
  DollarSign,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PrepBrief } from '@/lib/hooks/useMeetingPrepBrief';

// ============================================================================
// Types
// ============================================================================

interface RepScorecard {
  /** 0–100 */
  call_quality?: number;
  /** 0–100 */
  follow_up_rate?: number;
  /** % against target */
  quota_attainment?: number;
  /** Trend: 'up' | 'down' | 'flat' */
  trend?: 'up' | 'down' | 'flat';
}

interface OneOnOnePrepProps {
  brief: PrepBrief;
  scorecard?: RepScorecard | null;
}

// ============================================================================
// Helpers
// ============================================================================

function scoreBand(score: number): 'green' | 'amber' | 'red' {
  if (score >= 80) return 'green';
  if (score >= 60) return 'amber';
  return 'red';
}

const bandColors = {
  green: 'text-emerald-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
};

// ============================================================================
// Sub-components
// ============================================================================

function ScorecardRow({
  label,
  value,
  unit = '%',
}: {
  label: string;
  value: number | undefined;
  unit?: string;
}) {
  if (value == null) return null;
  const band = scoreBand(value);
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={cn('text-xs font-semibold tabular-nums', bandColors[band])}>
        {value}
        {unit}
      </span>
    </div>
  );
}

function TrendIcon({ trend }: { trend: RepScorecard['trend'] }) {
  if (trend === 'up') return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (trend === 'down') return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-gray-500" />;
}

// ============================================================================
// Main component
// ============================================================================

export function OneOnOnePrep({ brief, scorecard }: OneOnOnePrepProps) {
  // Parse sections: look for action-items section to render as checkboxes
  const actionSection = brief.sections.find(
    (s) => s.title.toLowerCase().includes('action') || s.title.toLowerCase().includes('open item'),
  );
  const otherSections = brief.sections.filter((s) => s !== actionSection);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-blue-400">
          <Users className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">1:1 Prep</span>
        </div>
        {scorecard?.trend && (
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <TrendIcon trend={scorecard.trend} />
            <span>vs last period</span>
          </div>
        )}
      </div>

      {/* Rep scorecard */}
      {scorecard && (
        <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 px-3 py-2 space-y-0.5">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">
            Rep scorecard
          </p>
          <ScorecardRow label="Call quality" value={scorecard.call_quality} />
          <ScorecardRow label="Follow-up rate" value={scorecard.follow_up_rate} />
          <ScorecardRow label="Quota attainment" value={scorecard.quota_attainment} />
        </div>
      )}

      {/* Open action items from previous 1:1 */}
      {actionSection && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
            <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300">{actionSection.title}</h4>
          </div>
          <div className="pl-4 space-y-1.5">
            {actionSection.body.split('\n').map((line, i) => {
              if (!line.trim()) return null;
              const isBullet = line.match(/^[•\-*]\s/);
              const text = isBullet ? line.replace(/^[•\-*]\s/, '') : line;
              return (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Circle className="h-3 w-3 text-gray-400 dark:text-gray-700 flex-shrink-0 mt-0.5" />
                  <span>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Other sections (coaching notes, deal highlights) */}
      {otherSections.map((section, i) => (
        <div key={i} className="space-y-2 border-t border-gray-200 dark:border-gray-800 pt-3">
          <div className="flex items-center gap-1.5">
            {section.title.toLowerCase().includes('coach') ? (
              <MessageSquare className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
            ) : section.title.toLowerCase().includes('deal') ? (
              <DollarSign className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
            )}
            <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300">{section.title}</h4>
          </div>
          <div className="pl-4 space-y-1">
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

      {!scorecard && brief.sections.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-600 text-center py-2">
          Generating 1:1 prep brief...
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Skeleton for loading state
// ============================================================================

export function OneOnOnePrepSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-1.5">
        <div className="h-3.5 w-3.5 rounded bg-gray-800" />
        <div className="h-3 w-16 rounded bg-gray-800" />
      </div>
      <div className="rounded-md border border-gray-800 bg-gray-900/40 px-3 py-2 space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 w-24 rounded bg-gray-800" />
            <div className="h-3 w-8 rounded bg-gray-800" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="h-3 w-3 rounded-full bg-gray-800 flex-shrink-0 mt-0.5" />
            <div className="h-3 rounded bg-gray-800" style={{ width: `${60 + i * 8}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Convenience type re-export
export type { OneOnOnePrepProps, RepScorecard };

/**
 * AutonomyFactorBar — AE2-008
 *
 * Mini progress bar for a single autonomy explanation factor.
 * Color-coded by sentiment: positive=emerald, neutral=slate, negative=red/amber.
 * Shows label, progress bar, and detail text.
 */

import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

// =============================================================================
// Types (mirrors ExplanationFactor from autonomyExplainer.ts)
// =============================================================================

export interface ExplanationFactor {
  label: string;
  /** 0.0-1.0 progress bar value */
  progress: number;
  detail: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface AutonomyFactorBarProps {
  factor: ExplanationFactor;
  /** Compact mode reduces padding and font size */
  compact?: boolean;
}

// =============================================================================
// Sentiment styling
// =============================================================================

const SENTIMENT_STYLES = {
  positive: {
    bar: 'bg-emerald-500 dark:bg-emerald-400',
    track: 'bg-emerald-100 dark:bg-emerald-900/30',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  neutral: {
    bar: 'bg-slate-400 dark:bg-slate-500',
    track: 'bg-slate-100 dark:bg-slate-800',
    dot: 'bg-slate-400 dark:bg-slate-500',
    text: 'text-slate-600 dark:text-slate-400',
  },
  negative: {
    bar: 'bg-red-500 dark:bg-red-400',
    track: 'bg-red-100 dark:bg-red-900/30',
    dot: 'bg-red-500 dark:bg-red-400',
    text: 'text-red-700 dark:text-red-400',
  },
} as const;

// =============================================================================
// Component
// =============================================================================

export function AutonomyFactorBar({ factor, compact = false }: AutonomyFactorBarProps) {
  const styles = SENTIMENT_STYLES[factor.sentiment];
  const pct = Math.round(factor.progress * 100);

  return (
    <div className={cn('space-y-1', compact ? 'py-0.5' : 'py-1')}>
      {/* Label row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full flex-shrink-0',
              styles.dot,
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              'font-medium text-gray-900 dark:text-gray-100 truncate',
              compact ? 'text-[11px]' : 'text-xs',
            )}
          >
            {factor.label}
          </span>
        </div>
        <span
          className={cn(
            'font-medium flex-shrink-0',
            compact ? 'text-[11px]' : 'text-xs',
            styles.text,
          )}
        >
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'w-full overflow-hidden rounded-full',
              compact ? 'h-1' : 'h-1.5',
              styles.track,
            )}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${factor.label}: ${pct}%`}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                styles.bar,
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <span className="text-xs">{factor.detail}</span>
        </TooltipContent>
      </Tooltip>

      {/* Detail text — only in non-compact mode */}
      {!compact && factor.detail && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed pl-3">
          {factor.detail}
        </p>
      )}
    </div>
  );
}

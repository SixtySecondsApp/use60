/**
 * TrustCapitalCard — AE2-017
 *
 * Shows the user's Trust Capital score (0-1000) with:
 *   - Circular SVG progress ring
 *   - Breakdown tooltip: signals, action types, days active, auto tiers
 *   - Switching cost callout
 */

import { Info, ShieldCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTrustCapital, type TrustCapitalData } from '@/lib/hooks/useTrustCapital';

// ============================================================================
// Constants
// ============================================================================

const MAX_SCORE = 1000;

// ============================================================================
// Score colour helper
// ============================================================================

function getScoreColor(score: number): string {
  if (score >= 750) return 'text-emerald-500';
  if (score >= 500) return 'text-blue-500';
  if (score >= 250) return 'text-amber-500';
  return 'text-gray-400';
}

function getScoreTrackColor(score: number): string {
  if (score >= 750) return 'text-emerald-500/20';
  if (score >= 500) return 'text-blue-500/20';
  if (score >= 250) return 'text-amber-500/20';
  return 'text-gray-300 dark:text-gray-700';
}

function getScoreLabel(score: number): string {
  if (score >= 750) return 'Expert';
  if (score >= 500) return 'Proficient';
  if (score >= 250) return 'Learning';
  return 'Getting started';
}

// ============================================================================
// Circular progress ring (score / 1000)
// ============================================================================

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

function ScoreRing({ score, size = 96, strokeWidth = 8 }: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(score / MAX_SCORE, 1);
  const offset = circumference - pct * circumference;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className={getScoreTrackColor(score)}
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn('transition-all duration-700', getScoreColor(score))}
        />
      </svg>

      {/* Centred score text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-gray-900 dark:text-white leading-none">
          {score}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
          / {MAX_SCORE}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Breakdown tooltip content
// ============================================================================

function BreakdownTooltipContent({ data }: { data: TrustCapitalData }) {
  return (
    <div className="space-y-1 max-w-[240px]">
      <p className="text-xs">
        {data.total_signals} signal{data.total_signals !== 1 ? 's' : ''} given across{' '}
        {data.action_types_trained} action type{data.action_types_trained !== 1 ? 's' : ''} over{' '}
        {data.days_active} day{data.days_active !== 1 ? 's' : ''}.{' '}
        {data.auto_tier_count} action type{data.auto_tier_count !== 1 ? 's' : ''} at full auto.
      </p>
    </div>
  );
}

// ============================================================================
// Switching cost callout
// ============================================================================

function SwitchingCostCallout({ data }: { data: TrustCapitalData }) {
  if (data.total_signals === 0) return null;

  return (
    <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-900/10 border border-amber-200/40 dark:border-amber-800/30">
      <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
        Your agent has learned from {data.total_signals} decision{data.total_signals !== 1 ? 's' : ''}. New platforms start at zero.
      </p>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function TrustCapitalCard() {
  const { data, isLoading, error } = useTrustCapital();

  // Loading state
  if (isLoading) {
    return (
      <Card className="border border-gray-200 dark:border-gray-800">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  // Error state — silent, don't block the dashboard
  if (error || !data) {
    return null;
  }

  const label = getScoreLabel(data.score);

  return (
    <Card className="border border-gray-200 dark:border-gray-800">
      <CardContent className="py-4 px-5">
        {/* Header row: ring + label + breakdown tooltip */}
        <div className="flex items-center gap-4">
          <ScoreRing score={data.score} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Trust Capital
              </h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    aria-label="Trust Capital breakdown"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <BreakdownTooltipContent data={data} />
                </TooltipContent>
              </Tooltip>
            </div>

            <p className={cn('text-xs font-medium mt-0.5', getScoreColor(data.score))}>
              {label}
            </p>

            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              {data.total_signals} signal{data.total_signals !== 1 ? 's' : ''}{' '}
              &middot; {data.action_types_trained} action type{data.action_types_trained !== 1 ? 's' : ''}{' '}
              &middot; {data.auto_tier_count} on auto
            </p>
          </div>
        </div>

        {/* Switching cost callout */}
        <SwitchingCostCallout data={data} />
      </CardContent>
    </Card>
  );
}

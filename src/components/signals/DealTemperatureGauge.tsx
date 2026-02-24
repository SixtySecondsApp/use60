/**
 * DealTemperatureGauge
 *
 * Compact inline gauge component displaying deal temperature (0–100).
 * Color band: blue <30 (cold), yellow 30–60 (warm), red >60 (hot).
 * Sizes: sm (pipeline card inline), md (detail sheet section header).
 */

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

export interface DealTemperatureGaugeProps {
  /** Temperature score 0–100 */
  temperature: number;
  /** Trend direction */
  trend: 'rising' | 'falling' | 'stable';
  /** Visual size */
  size?: 'sm' | 'md';
  /** Optional additional className */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function getTempColors(temperature: number): {
  bar: string;
  text: string;
  bg: string;
  border: string;
} {
  if (temperature >= 60) {
    return {
      bar: 'bg-gradient-to-r from-red-500 to-orange-400',
      text: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800/50',
    };
  }
  if (temperature >= 30) {
    return {
      bar: 'bg-gradient-to-r from-amber-500 to-yellow-400',
      text: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      border: 'border-amber-200 dark:border-amber-800/50',
    };
  }
  return {
    bar: 'bg-gradient-to-r from-blue-500 to-sky-400',
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800/50',
  };
}

function getTempLabel(temperature: number): string {
  if (temperature >= 60) return 'Hot';
  if (temperature >= 30) return 'Warm';
  return 'Cold';
}

// =============================================================================
// Component
// =============================================================================

export function DealTemperatureGauge({
  temperature,
  trend,
  size = 'md',
  className,
}: DealTemperatureGaugeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(temperature)));
  const colors = getTempColors(clamped);

  const TrendIcon =
    trend === 'rising' ? TrendingUp : trend === 'falling' ? TrendingDown : Minus;
  const trendColor =
    trend === 'rising'
      ? 'text-emerald-500 dark:text-emerald-400'
      : trend === 'falling'
        ? 'text-red-500 dark:text-red-400'
        : 'text-gray-400 dark:text-gray-500';

  if (size === 'sm') {
    // Compact inline pill for pipeline cards
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1 px-[6px] py-[2.5px] rounded-[5px] border text-[10px] font-semibold',
          colors.bg,
          colors.border,
          colors.text,
          className
        )}
      >
        <span className="tabular-nums">{clamped}</span>
        <TrendIcon className={cn('w-2.5 h-2.5', trendColor)} />
      </div>
    );
  }

  // Medium — full bar + label for detail sheet
  return (
    <div className={cn('space-y-1.5', className)}>
      {/* Score + trend row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={cn('text-[22px] font-bold tabular-nums leading-none', colors.text)}>
            {clamped}
          </span>
          <div className="flex flex-col">
            <span className={cn('text-[10px] font-bold uppercase tracking-wide', colors.text)}>
              {getTempLabel(clamped)}
            </span>
            <div className={cn('flex items-center gap-0.5 text-[10px] font-medium', trendColor)}>
              <TrendIcon className="w-3 h-3" />
              <span className="capitalize">{trend}</span>
            </div>
          </div>
        </div>
        <span className="text-[10.5px] text-gray-400 dark:text-gray-500 font-medium">/ 100</span>
      </div>

      {/* Bar */}
      <div className="h-[5px] w-full rounded-full bg-gray-100 dark:bg-white/[0.04] overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colors.bar)}
          style={{ width: `${clamped}%` }}
        />
      </div>

      {/* Band labels */}
      <div className="flex justify-between text-[9.5px] text-gray-400 dark:text-gray-600 font-medium">
        <span>Cold</span>
        <span>Warm</span>
        <span>Hot</span>
      </div>
    </div>
  );
}

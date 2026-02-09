/**
 * Shared MetricCard component for copilot response components.
 *
 * Replaces duplicated metric card patterns across:
 * - PipelineResponse (bg-gray-900/60, text-lg)
 * - DealHealthResponse (colored bg, text-2xl, with icons)
 * - ActionSummaryResponse (colored bg, text-xl, with icons)
 * - TaskResponse (copy of PipelineResponse)
 *
 * Provides consistent sizing, color variants via STATUS_COLORS,
 * optional icon, subtitle, and trend indicator.
 */

import React from 'react';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type StatusColorKey, STATUS_COLORS } from './colors';

interface MetricCardProps {
  label: string;
  value: string | number;
  variant?: StatusColorKey | 'default';
  icon?: LucideIcon;
  size?: 'sm' | 'md' | 'lg';
  subtitle?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string };
  className?: string;
}

const SIZE_CONFIG = {
  sm: {
    padding: 'p-2',
    valueText: 'text-sm font-semibold',
    labelText: 'text-xs',
    iconSize: 'w-3.5 h-3.5',
    gap: 'mb-0.5',
  },
  md: {
    padding: 'p-3',
    valueText: 'text-lg font-semibold',
    labelText: 'text-xs',
    iconSize: 'w-4 h-4',
    gap: 'mb-1',
  },
  lg: {
    padding: 'p-4',
    valueText: 'text-2xl font-bold',
    labelText: 'text-sm font-medium',
    iconSize: 'w-4 h-4',
    gap: 'mb-2',
  },
} as const;

const TREND_CONFIG = {
  up: { icon: TrendingUp, color: 'text-emerald-400' },
  down: { icon: TrendingDown, color: 'text-red-400' },
  flat: { icon: Minus, color: 'text-gray-400' },
} as const;

export function MetricCard({
  label,
  value,
  variant = 'default',
  icon: Icon,
  size = 'md',
  subtitle,
  trend,
  className,
}: MetricCardProps) {
  const sizeConfig = SIZE_CONFIG[size];

  // Determine container styles based on variant
  const isColored = variant !== 'default';
  const colors = isColored ? STATUS_COLORS[variant] : null;

  const containerClasses = isColored
    ? cn(colors!.bg, 'border', colors!.border, 'rounded-lg', sizeConfig.padding)
    : cn('bg-gray-900/60 backdrop-blur-sm border border-gray-800/40 rounded-lg', sizeConfig.padding);

  // Determine value text color
  const valueColor = isColored ? 'text-white' : 'text-gray-100';

  const TrendIcon = trend ? TREND_CONFIG[trend.direction].icon : null;
  const trendColor = trend ? TREND_CONFIG[trend.direction].color : '';

  return (
    <div className={cn(containerClasses, 'transition-all duration-200', className)}>
      {/* Label row with optional icon */}
      <div className={cn('flex items-center gap-2', sizeConfig.gap)}>
        {Icon && (
          <Icon className={cn(sizeConfig.iconSize, colors?.icon ?? 'text-gray-400')} />
        )}
        <span className={cn(sizeConfig.labelText, 'text-gray-400')}>{label}</span>
      </div>

      {/* Value */}
      <div className={cn(sizeConfig.valueText, valueColor)}>{value}</div>

      {/* Optional subtitle */}
      {subtitle && (
        <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
      )}

      {/* Optional trend indicator */}
      {trend && TrendIcon && (
        <div className={cn('flex items-center gap-1 mt-1', trendColor)}>
          <TrendIcon className="w-3 h-3" />
          <span className="text-xs">{trend.label}</span>
        </div>
      )}
    </div>
  );
}

export type { MetricCardProps };

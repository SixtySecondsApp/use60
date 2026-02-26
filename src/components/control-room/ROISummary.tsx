/**
 * ROISummary — Control Room widget (CTRL-006)
 *
 * Three KPI cards in a horizontal row showing the value delivered by the AI:
 *   1. Hours Saved      — automated email sends × avg manual minutes, this week
 *   2. Follow-Up Speed  — median meeting-end → follow-up email time in minutes
 *   3. Pipeline Coverage — % of active deals with agent activity in last 7 days
 *
 * Colour thresholds encode health at a glance (green / amber / red).
 * Handles loading spinner, error state, and no-data empty state.
 */

import type { ReactElement } from 'react';
import { Clock, Zap, BarChart3, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useROISummary } from '@/lib/hooks/useROISummary';

// ============================================================================
// Helpers
// ============================================================================

type MetricUnit = 'hrs' | 'min' | '%';

/** Format a numeric value as a display string with a unit suffix */
function formatValue(value: number | null, unit: MetricUnit): string {
  if (value == null) return '—';
  if (unit === 'hrs') return `${value.toFixed(1)} hrs`;
  if (unit === 'min') return `${Math.round(value)} min`;
  return `${value.toFixed(0)}%`;
}

// ============================================================================
// Colour thresholds
// ============================================================================

type MetricType = 'hours_saved' | 'followup_speed' | 'pipeline_coverage';

/**
 * Returns Tailwind colour classes for the large metric number.
 * Higher = greener for hours_saved and pipeline_coverage.
 * Lower = greener for follow-up speed.
 */
function metricValueColor(type: MetricType, value: number | null): string {
  if (value == null) return 'text-gray-400 dark:text-gray-500';

  if (type === 'hours_saved') {
    if (value >= 10) return 'text-green-600 dark:text-green-400';
    if (value >= 3)  return 'text-amber-600 dark:text-amber-400';
    return 'text-gray-500 dark:text-gray-400';
  }

  if (type === 'followup_speed') {
    // Lower is better: under 60 min = green, 60–240 min = amber, over = red
    if (value <= 60)  return 'text-green-600 dark:text-green-400';
    if (value <= 240) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  }

  // pipeline_coverage
  if (value >= 70) return 'text-green-600 dark:text-green-400';
  if (value >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

/** Returns a border tint class for the card based on the metric health */
function cardBorderColor(type: MetricType, value: number | null): string {
  const color = metricValueColor(type, value);
  if (color.includes('green')) return 'border-green-200 dark:border-green-800/50';
  if (color.includes('amber')) return 'border-amber-200 dark:border-amber-800/50';
  if (color.includes('red'))   return 'border-red-200 dark:border-red-800/50';
  return 'border-gray-200 dark:border-gray-800';
}

// ============================================================================
// KPI card
// ============================================================================

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  displayValue: string;
  subtitle: string;
  valueColorClass: string;
  borderColorClass: string;
}

function KpiCard({
  icon: Icon,
  label,
  displayValue,
  subtitle,
  valueColorClass,
  borderColorClass,
}: KpiCardProps): ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-white dark:bg-gray-900 p-4 shadow-sm',
        borderColorClass
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
          {label}
        </span>
      </div>

      {/* Large metric value */}
      <p className={cn('text-2xl font-bold tabular-nums leading-none', valueColorClass)}>
        {displayValue}
      </p>

      {/* Subtitle */}
      <p className="text-[11px] text-muted-foreground leading-tight">{subtitle}</p>
    </div>
  );
}

// ============================================================================
// Error state
// ============================================================================

function ErrorState(): ReactElement {
  return (
    <div className="flex items-center gap-2 py-4 text-xs text-red-500">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>Failed to load ROI metrics — please try refreshing.</span>
    </div>
  );
}

// ============================================================================
// Empty / no-data state
// ============================================================================

function EmptyState(): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-6 px-4 text-center gap-2">
      <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm font-medium text-muted-foreground">No ROI data yet</p>
      <p className="text-xs text-muted-foreground/60">
        Metrics will appear once the AI starts sending emails and engaging with deals.
      </p>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function ROISummary(): ReactElement {
  const { hoursSaved, medianFollowupSpeed, pipelineCoverage, isLoading, error } =
    useROISummary();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (error) {
    return <ErrorState />;
  }

  const hasAnyData = hoursSaved > 0 || medianFollowupSpeed != null || pipelineCoverage > 0;

  if (!hasAnyData) {
    return <EmptyState />;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Card 1: Hours Saved */}
      <KpiCard
        icon={Clock}
        label="Hours Saved"
        displayValue={formatValue(hoursSaved, 'hrs')}
        subtitle="This week via email automation"
        valueColorClass={metricValueColor('hours_saved', hoursSaved)}
        borderColorClass={cardBorderColor('hours_saved', hoursSaved)}
      />

      {/* Card 2: Follow-Up Speed */}
      <KpiCard
        icon={Zap}
        label="Follow-Up Speed"
        displayValue={formatValue(medianFollowupSpeed, 'min')}
        subtitle="Median: meeting end to email"
        valueColorClass={metricValueColor('followup_speed', medianFollowupSpeed)}
        borderColorClass={cardBorderColor('followup_speed', medianFollowupSpeed)}
      />

      {/* Card 3: Pipeline Coverage */}
      <KpiCard
        icon={BarChart3}
        label="Pipeline Coverage"
        displayValue={formatValue(pipelineCoverage, '%')}
        subtitle="Deals with agent activity (7d)"
        valueColorClass={metricValueColor('pipeline_coverage', pipelineCoverage)}
        borderColorClass={cardBorderColor('pipeline_coverage', pipelineCoverage)}
      />
    </div>
  );
}

export default ROISummary;

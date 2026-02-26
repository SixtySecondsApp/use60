/**
 * CCDealHealthPanel — CC-013
 *
 * Typed detail panel for deal health score items.
 * Renders a large health score with trend arrow, factor breakdown bars,
 * a recommended action callout, and a recent activity timeline.
 */

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CCItem } from '@/lib/services/commandCentreItemsService';

// ============================================================================
// Types
// ============================================================================

interface ActivityEntry {
  date: string;
  event: string;
}

interface DealHealthData {
  health_score: number | null;
  trend: 'up' | 'down' | 'flat';
  previous_score: number | null;
  factors: {
    champion_engagement: number | null;
    decision_timeline: number | null;
    competitive_pressure: number | null;
    budget_alignment: number | null;
  };
  recommended_action: string | null;
  recent_activity: ActivityEntry[];
}

// ============================================================================
// Props
// ============================================================================

export interface CCDealHealthPanelProps {
  item: CCItem;
}

// ============================================================================
// Helpers
// ============================================================================

function extractDealHealthData(item: CCItem): DealHealthData {
  const enrichmentContext = (item.enrichment_context as Record<string, unknown>) ?? {};
  const context = (item.context as Record<string, unknown>) ?? {};

  // Prefer enrichment_context, fall back to context
  const source: Record<string, unknown> =
    typeof enrichmentContext.health_score === 'number' ? enrichmentContext : context;

  const health_score =
    typeof source.health_score === 'number' ? source.health_score : null;

  const rawTrend = source.trend;
  const trend: 'up' | 'down' | 'flat' =
    rawTrend === 'up' || rawTrend === 'down' ? rawTrend : 'flat';

  const previous_score =
    typeof source.previous_score === 'number' ? source.previous_score : null;

  const rawFactors =
    source.factors !== null && typeof source.factors === 'object' && !Array.isArray(source.factors)
      ? (source.factors as Record<string, unknown>)
      : {};

  const factors = {
    champion_engagement:
      typeof rawFactors.champion_engagement === 'number' ? rawFactors.champion_engagement : null,
    decision_timeline:
      typeof rawFactors.decision_timeline === 'number' ? rawFactors.decision_timeline : null,
    competitive_pressure:
      typeof rawFactors.competitive_pressure === 'number' ? rawFactors.competitive_pressure : null,
    budget_alignment:
      typeof rawFactors.budget_alignment === 'number' ? rawFactors.budget_alignment : null,
  };

  const recommended_action =
    typeof source.recommended_action === 'string' ? source.recommended_action : null;

  const rawActivity = Array.isArray(source.recent_activity) ? source.recent_activity : [];
  const recent_activity: ActivityEntry[] = rawActivity
    .filter(
      (a): a is Record<string, unknown> =>
        a !== null && typeof a === 'object' && !Array.isArray(a),
    )
    .map((a) => ({
      date: String(a.date ?? ''),
      event: String(a.event ?? ''),
    }));

  return { health_score, trend, previous_score, factors, recommended_action, recent_activity };
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-slate-500 dark:text-gray-400';
  if (score < 40) return 'text-red-500';
  if (score <= 70) return 'text-amber-500';
  return 'text-emerald-500';
}

function factorBarColor(value: number): string {
  if (value >= 75) return 'bg-emerald-400';
  if (value >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

// ============================================================================
// Component
// ============================================================================

export function CCDealHealthPanel({ item }: CCDealHealthPanelProps) {
  const { health_score, trend, previous_score, factors, recommended_action, recent_activity } =
    extractDealHealthData(item);

  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendIconColor =
    trend === 'up'
      ? 'text-emerald-500'
      : trend === 'down'
      ? 'text-red-500'
      : 'text-slate-400 dark:text-gray-500';

  const factorEntries: Array<{ key: keyof typeof factors; label: string }> = [
    { key: 'champion_engagement', label: 'Champion Engagement' },
    { key: 'decision_timeline', label: 'Decision Timeline' },
    { key: 'competitive_pressure', label: 'Competitive Pressure' },
    { key: 'budget_alignment', label: 'Budget Alignment' },
  ];

  return (
    <div className="space-y-5">
      {/* ---- Score + trend ---- */}
      <div className="flex items-end gap-4">
        <div className="flex items-baseline gap-2">
          <span
            className={cn('font-bold tabular-nums leading-none', scoreColor(health_score))}
            style={{ fontSize: '3rem' }}
          >
            {health_score != null ? health_score : '—'}
          </span>
          <span className="text-sm text-slate-400 dark:text-gray-500">/100</span>
        </div>
        <div className="flex flex-col items-start pb-1 gap-1">
          <TrendIcon className={cn('h-5 w-5', trendIconColor)} />
          {previous_score != null && (
            <span className="text-xs text-slate-400 dark:text-gray-500">
              was {previous_score}
            </span>
          )}
        </div>
      </div>

      {/* ---- Factor breakdown bars ---- */}
      {factorEntries.some(({ key }) => factors[key] != null) && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider">
            Factor breakdown
          </p>
          {factorEntries.map(({ key, label }) => {
            const value = factors[key];
            if (value == null) return null;
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-600 dark:text-gray-300">{label}</span>
                  <span className="text-xs tabular-nums text-slate-500 dark:text-gray-400">
                    {value}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', factorBarColor(value))}
                    style={{ width: `${Math.min(value, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Recommended action callout ---- */}
      {recommended_action && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-3">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1 uppercase tracking-wide">
            Recommended action
          </p>
          <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed">
            {recommended_action}
          </p>
        </div>
      )}

      {/* ---- Recent activity timeline ---- */}
      {recent_activity.length > 0 && (
        <div className="space-y-0">
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Recent activity
          </p>
          {recent_activity.map((entry, i) => {
            let timeAgo: string | null = null;
            try {
              timeAgo = formatDistanceToNow(new Date(entry.date), { addSuffix: true });
            } catch {
              timeAgo = entry.date;
            }
            const isLast = i === recent_activity.length - 1;
            return (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-gray-600 mt-1.5 flex-shrink-0" />
                  {!isLast && (
                    <div className="w-px flex-1 min-h-[20px] mt-1 mb-1 bg-slate-200 dark:bg-gray-700" />
                  )}
                </div>
                <div className="flex-1 pb-3">
                  <p className="text-sm text-slate-600 dark:text-gray-300">{entry.event}</p>
                  {timeAgo && (
                    <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{timeAgo}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

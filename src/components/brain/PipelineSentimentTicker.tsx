/**
 * PipelineSentimentTicker — Compact sentiment summary bar for the Brain page header
 *
 * Shows overall pipeline sentiment score, 7-day trend, negative deal count,
 * and an expandable deal-by-deal breakdown sorted worst-first.
 *
 * BA-009b
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  usePipelineSentiment,
  type DealSentimentEntry,
} from '@/lib/hooks/usePipelineSentiment';

// ============================================================================
// Helpers
// ============================================================================

/** Traffic-light colour for a sentiment score */
function sentimentColor(score: number): string {
  if (score >= 0.7) return 'text-green-500';
  if (score >= 0.5) return 'text-amber-500';
  return 'text-red-500';
}

/** Background dot colour for a sentiment score */
function sentimentDotBg(score: number): string {
  if (score >= 0.7) return 'bg-green-500';
  if (score >= 0.5) return 'bg-amber-500';
  return 'bg-red-500';
}

/** Icon + colour for a trend direction */
function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-slate-400 dark:text-gray-500" />;
}

/** Format trend delta as "+5%" / "-3%" */
function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${Math.round(delta)}%`;
}

function deltaColor(delta: number): string {
  if (delta > 0) return 'text-green-600 dark:text-green-400';
  if (delta < 0) return 'text-red-600 dark:text-red-400';
  return 'text-slate-400 dark:text-gray-500';
}

// ============================================================================
// Sub-components
// ============================================================================

function DealRow({ deal }: { deal: DealSentimentEntry }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(`/pipeline?deal=${deal.dealId}`)}
      className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800/60 transition-colors text-left group"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${sentimentDotBg(deal.sentiment)}`} />
        <div className="min-w-0">
          <span className="text-sm font-medium text-slate-700 dark:text-gray-200 truncate block">
            {deal.dealName}
          </span>
          <span className="text-xs text-slate-400 dark:text-gray-500 truncate block">
            {deal.company}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <span className={`text-sm font-semibold tabular-nums ${sentimentColor(deal.sentiment)}`}>
          {deal.sentiment.toFixed(2)}
        </span>
        <TrendIcon trend={deal.trend} />
      </div>
    </button>
  );
}

// ============================================================================
// Loading skeleton
// ============================================================================

function TickerSkeleton() {
  return (
    <div className="px-6 py-3 border-b border-slate-200 dark:border-gray-800/60 bg-white dark:bg-gray-900/80">
      <div className="flex items-center gap-4">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20 ml-auto" />
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function PipelineSentimentTicker() {
  const { data, isLoading } = usePipelineSentiment();
  const [expanded, setExpanded] = useState(false);

  // Loading state
  if (isLoading) return <TickerSkeleton />;

  // Empty state: don't render anything
  if (!data || data.totalDealsWithSentiment === 0) return null;

  const sortedDeals = [...data.dealSentiments].sort(
    (a, b) => a.sentiment - b.sentiment,
  );

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="border-b border-slate-200 dark:border-gray-800/60 bg-white dark:bg-gray-900/80">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full px-6 py-2.5 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-gray-800/40 transition-colors"
          >
            {/* Activity icon */}
            <Activity className="h-4 w-4 text-slate-400 dark:text-gray-500 shrink-0" />

            {/* Overall score + traffic light dot */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sentimentDotBg(data.overallAvg)}`} />
              <span className={`text-lg font-bold tabular-nums leading-none ${sentimentColor(data.overallAvg)}`}>
                {data.overallAvg.toFixed(2)}
              </span>
            </div>

            {/* Trend arrow + delta */}
            <div className="flex items-center gap-1">
              <TrendIcon trend={data.trend} />
              <span className={`text-sm font-medium tabular-nums ${deltaColor(data.trendDelta)}`}>
                {formatDelta(data.trendDelta)}
              </span>
            </div>

            {/* Negative deal count */}
            {data.negativeDealCount > 0 && (
              <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {data.negativeDealCount} deal{data.negativeDealCount !== 1 ? 's' : ''} trending negative
              </span>
            )}

            {/* Total deals */}
            <span className="text-sm text-slate-400 dark:text-gray-500 ml-auto mr-2">
              across {data.totalDealsWithSentiment} deal{data.totalDealsWithSentiment !== 1 ? 's' : ''}
            </span>

            {/* Expand/collapse chevron */}
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400 dark:text-gray-500 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400 dark:text-gray-500 shrink-0" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-6 pb-3 pt-1 space-y-0.5 max-h-64 overflow-y-auto">
            {sortedDeals.map((deal) => (
              <DealRow key={deal.dealId} deal={deal} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

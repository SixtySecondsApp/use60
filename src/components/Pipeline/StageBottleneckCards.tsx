/**
 * StageBottleneckCards — PIP-002
 *
 * Cards highlighting stages where deals are lingering >1.5x the average time.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, TrendingDown } from 'lucide-react';
import { getStageBottlenecks, type StageBottleneck } from '@/lib/services/pipelineInsightsService';
import { useOrgStore } from '@/lib/stores/orgStore';
import { formatCurrencyCompact } from '@/lib/utils/formatters';
import { toast } from 'sonner';

function BottleneckCardSkeleton() {
  return (
    <div className="bg-white dark:bg-white/[0.03] border border-gray-200/80 dark:border-white/[0.06] rounded-xl p-4 animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-white/[0.06] rounded w-1/3 mb-3" />
      <div className="h-8 bg-gray-200 dark:bg-white/[0.04] rounded w-1/4 mb-2" />
      <div className="h-3 bg-gray-100 dark:bg-white/[0.03] rounded w-2/3" />
    </div>
  );
}

function BottleneckCard({ bottleneck }: { bottleneck: StageBottleneck }) {
  const severity = bottleneck.lingering_count / bottleneck.total_count;
  const isCritical = severity > 0.5;

  return (
    <div className={`bg-white dark:bg-white/[0.03] border rounded-xl p-4 space-y-3 transition-colors ${
      isCritical
        ? 'border-red-200 dark:border-red-500/20'
        : 'border-amber-200 dark:border-amber-500/20'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${isCritical ? 'bg-red-100 dark:bg-red-500/10' : 'bg-amber-100 dark:bg-amber-500/10'}`}>
            <AlertTriangle className={`h-3.5 w-3.5 ${isCritical ? 'text-red-500' : 'text-amber-500'}`} />
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{bottleneck.stage_name}</span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          isCritical
            ? 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400'
            : 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
        }`}>
          {bottleneck.lingering_count}/{bottleneck.total_count} deals
        </span>
      </div>

      {/* Timing info */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Avg: <span className="font-medium text-gray-700 dark:text-gray-300 ml-0.5">{bottleneck.avg_days}d</span>
        </span>
        <span className="flex items-center gap-1">
          <TrendingDown className="h-3 w-3 text-red-400" />
          Threshold: <span className="font-medium text-gray-700 dark:text-gray-300 ml-0.5">{bottleneck.threshold_days}d</span>
        </span>
      </div>

      {/* Lingering deals list */}
      {bottleneck.lingering_deals.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-white/[0.04]">
          {bottleneck.lingering_deals.slice(0, 3).map((deal) => (
            <div key={deal.id} className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">{deal.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                {deal.value && (
                  <span className="text-xs text-gray-500 dark:text-gray-500">{formatCurrencyCompact(deal.value)}</span>
                )}
                <span className={`text-xs font-semibold tabular-nums ${isCritical ? 'text-red-500' : 'text-amber-500'}`}>
                  {deal.days_in_stage}d
                </span>
              </div>
            </div>
          ))}
          {bottleneck.lingering_deals.length > 3 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              +{bottleneck.lingering_deals.length - 3} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function StageBottleneckCards() {
  const orgId = useOrgStore((state) => state.activeOrgId);

  const { data: bottlenecks, isLoading } = useQuery({
    queryKey: ['stage-bottlenecks', orgId],
    queryFn: () => getStageBottlenecks(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    meta: { errorMessage: 'Failed to load stage bottlenecks' },
  });

  React.useEffect(() => {
    // handled by react-query meta
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-5 bg-gray-200 dark:bg-white/[0.06] rounded w-40 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <BottleneckCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (!bottlenecks || bottlenecks.length === 0) {
    return (
      <div className="bg-white dark:bg-white/[0.03] border border-gray-200/80 dark:border-white/[0.06] rounded-xl p-6 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 bg-emerald-100 dark:bg-emerald-500/10 rounded-full mb-3">
          <Clock className="h-5 w-5 text-emerald-500" />
        </div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No stage bottlenecks detected</p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">All deals are moving at healthy velocity</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Stage Bottlenecks</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Deals lingering &gt;1.5x the stage average</p>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/[0.04] px-2 py-1 rounded-full">
          {bottlenecks.length} {bottlenecks.length === 1 ? 'stage' : 'stages'}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {bottlenecks.map((b) => (
          <BottleneckCard key={b.stage_id} bottleneck={b} />
        ))}
      </div>
    </div>
  );
}

/**
 * EngagementCorrelationCards — PIP-007
 *
 * Shows how activity/meeting count correlates with stage advancement vs stalled deals.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { getEngagementCorrelation, type EngagementCorrelation } from '@/lib/services/pipelineInsightsService';
import { useOrgStore } from '@/lib/stores/orgStore';

function CorrelationCard({ data }: { data: EngagementCorrelation }) {
  const activityLift = data.avg_activities_stalled > 0
    ? ((data.avg_activities_moved - data.avg_activities_stalled) / data.avg_activities_stalled) * 100
    : null;

  const meetingLift = data.avg_meetings_stalled > 0
    ? ((data.avg_meetings_moved - data.avg_meetings_stalled) / data.avg_meetings_stalled) * 100
    : null;

  const isPositive = (activityLift ?? 0) > 0;

  return (
    <div className="bg-white dark:bg-white/[0.03] border border-gray-200/80 dark:border-white/[0.06] rounded-xl p-4 space-y-3">
      {/* Stage name */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-violet-100 dark:bg-violet-500/10 rounded-lg">
            <Activity className="h-3.5 w-3.5 text-violet-500" />
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{data.stage_name}</span>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/[0.04] px-2 py-0.5 rounded-full">
          n={data.sample_size}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Activities */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">Activities (moved)</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{data.avg_activities_moved}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">Activities (stalled)</p>
          <p className="text-lg font-bold text-gray-500 dark:text-gray-400 tabular-nums">{data.avg_activities_stalled}</p>
        </div>
        {/* Meetings */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">Meetings (moved)</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{data.avg_meetings_moved}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">Meetings (stalled)</p>
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 tabular-nums">{data.avg_meetings_stalled}</p>
        </div>
      </div>

      {/* Lift indicator */}
      {activityLift != null && (
        <div className={`flex items-center gap-1.5 text-xs font-medium pt-2 border-t border-gray-100 dark:border-white/[0.04] ${
          isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
        }`}>
          {isPositive
            ? <TrendingUp className="h-3.5 w-3.5" />
            : <TrendingDown className="h-3.5 w-3.5" />
          }
          {isPositive ? '+' : ''}{Math.round(activityLift)}% more activity in won deals
        </div>
      )}
    </div>
  );
}

export function EngagementCorrelationCards() {
  const orgId = useOrgStore((state) => state.activeOrgId);

  const { data: correlations, isLoading } = useQuery({
    queryKey: ['engagement-correlation', orgId],
    queryFn: () => getEngagementCorrelation(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-5 bg-gray-200 dark:bg-white/[0.06] rounded w-48 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-gray-100 dark:bg-white/[0.025] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!correlations || correlations.length === 0) {
    return (
      <div className="bg-white dark:bg-white/[0.03] border border-gray-200/80 dark:border-white/[0.06] rounded-xl p-6 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 dark:bg-violet-500/10 rounded-full mb-3">
          <Activity className="h-5 w-5 text-violet-500" />
        </div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Not enough data yet</p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Engagement patterns appear after more deals close</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Engagement Correlation</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Activity levels in won vs stalled deals by stage</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {correlations.map((c) => (
          <CorrelationCard key={c.stage_id} data={c} />
        ))}
      </div>
    </div>
  );
}

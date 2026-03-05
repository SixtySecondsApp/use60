/**
 * WeeklyPipelineHealthChart — PIP-004/005
 *
 * 8-week trend from pipeline_snapshots with target overlay.
 * Stacked bars: weighted pipeline + closed. Dashed line: target.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useTheme } from '@/hooks/useTheme';
import { getPipelineHealthSnapshots, type PipelineSnapshot } from '@/lib/services/pipelineInsightsService';
import { useOrgStore } from '@/lib/stores/orgStore';
import { formatCurrencyCompact } from '@/lib/utils/formatters';

function aggregateByWeek(snapshots: PipelineSnapshot[]) {
  if (!snapshots.length) return [];

  // Group by ISO week (Sunday-based)
  const weekMap = new Map<string, PipelineSnapshot[]>();
  for (const snap of snapshots) {
    const date = new Date(snap.snapshot_date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    if (!weekMap.has(key)) weekMap.set(key, []);
    weekMap.get(key)!.push(snap);
  }

  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, snaps]) => {
      const latest = snaps[snaps.length - 1];
      const label = new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        week: label,
        weighted: latest.weighted_pipeline_value ?? 0,
        closed: latest.closed_this_period ?? 0,
        total: latest.total_pipeline_value ?? 0,
        target: latest.target ?? null,
        at_risk: latest.deals_at_risk ?? 0,
      };
    });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/[0.08] rounded-xl p-3 shadow-lg text-xs space-y-1.5 min-w-[160px]">
      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <span className="w-2 h-2 rounded-sm" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className="font-medium text-gray-900 dark:text-white tabular-nums">
            {entry.value != null ? formatCurrencyCompact(entry.value) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function WeeklyPipelineHealthChart() {
  const orgId = useOrgStore((state) => state.activeOrgId);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['pipeline-health-snapshots', orgId],
    queryFn: () => getPipelineHealthSnapshots(orgId!, 8),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const chartData = aggregateByWeek(snapshots ?? []);
  const hasTarget = chartData.some((d) => d.target != null);

  const axisColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)';
  const tickColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)';
  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-white/[0.03] border border-gray-200/80 dark:border-white/[0.06] rounded-xl p-5 space-y-4">
        <div className="h-5 bg-gray-200 dark:bg-white/[0.06] rounded w-48 animate-pulse" />
        <div className="h-[240px] bg-gray-100 dark:bg-white/[0.02] rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="bg-white dark:bg-white/[0.03] border border-gray-200/80 dark:border-white/[0.06] rounded-xl p-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">No pipeline snapshot data available yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Snapshots are recorded automatically each week</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-white/[0.03] border border-gray-200/80 dark:border-white/[0.06] rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Weekly Pipeline Health</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">8-week trend — weighted pipeline vs closed</p>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11, fill: tickColor }}
            axisLine={{ stroke: axisColor }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => formatCurrencyCompact(v)}
            tick={{ fontSize: 11, fill: tickColor }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 12, color: tickColor }}
            iconType="square"
            iconSize={8}
          />
          <Bar dataKey="weighted" name="Weighted Pipeline" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={40} />
          <Bar dataKey="closed" name="Closed Won" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
          {hasTarget && (
            <Line
              dataKey="target"
              name="Target"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              type="monotone"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * ForecastVsActualChart (FORE-002)
 * Recharts chart: forecast line (dashed blue) vs actual line (solid green), monthly from pipeline_snapshots.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, subMonths, startOfMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrencyCompact } from '@/lib/utils/formatters';

interface SnapshotRow {
  snapshot_date: string;
  weighted_pipeline_value: number;
  closed_this_period: number;
}

function buildChartData(snapshots: SnapshotRow[]) {
  const months: { name: string; forecast: number | null; actual: number | null }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(startOfMonth(new Date()), i);
    const monthStr = format(d, 'yyyy-MM');
    const matching = snapshots.filter((s) => s.snapshot_date.startsWith(monthStr));
    if (matching.length > 0) {
      const latest = matching.sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
      months.push({
        name: format(d, 'MMM yy'),
        forecast: latest.weighted_pipeline_value ?? null,
        actual: latest.closed_this_period ?? null,
      });
    } else {
      months.push({ name: format(d, 'MMM yy'), forecast: null, actual: null });
    }
  }
  return months;
}

export function ForecastVsActualChart() {
  const orgId = useActiveOrgId();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const axisColor = isDark ? '#9CA3AF' : '#6B7280';
  const tooltipBg = isDark ? '#1F2937' : '#FFFFFF';
  const tooltipBorder = isDark ? '#374151' : '#E5E7EB';

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['pipeline-snapshots-chart', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const since = format(subMonths(new Date(), 12), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('pipeline_snapshots')
        .select('snapshot_date, weighted_pipeline_value, closed_this_period')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .gte('snapshot_date', since)
        .order('snapshot_date', { ascending: true });
      if (error) throw error;
      return (data || []) as SnapshotRow[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const chartData = buildChartData(snapshots || []);
  const hasData = chartData.some((d) => d.forecast !== null || d.actual !== null);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-xl border p-3 shadow-xl text-sm"
        style={{ backgroundColor: tooltipBg, borderColor: tooltipBorder }}
      >
        <p className="font-medium text-muted-foreground mb-2">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span style={{ color: entry.color }}>{entry.name}</span>
            <span className="font-semibold">
              {entry.value != null ? formatCurrencyCompact(entry.value) : '—'}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-white/20 dark:border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-500" />
          Forecast vs Actual (12 months)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
            No snapshot data yet. Data populates as pipeline snapshots are recorded.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: axisColor, fontSize: 11 }}
                dy={5}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: axisColor, fontSize: 11 }}
                tickFormatter={(v) => formatCurrencyCompact(v)}
                dx={-4}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                height={32}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, color: axisColor }}
              />
              <Line
                type="monotone"
                dataKey="forecast"
                name="Weighted Forecast"
                stroke="#3B82F6"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Closed Won"
                stroke="#10B981"
                strokeWidth={2}
                dot={{ r: 3, fill: '#10B981' }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * UsageChart — 30-day AI spend trend using Recharts.
 *
 * Fetches daily cost data from ai_cost_events and renders an area chart.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import { Loader2 } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface DailyUsage {
  date: string;
  cost: number;
}

function useDailyUsage(days: number = 30) {
  const orgId = useOrgId();

  return useQuery<DailyUsage[]>({
    queryKey: ['credits', 'daily-usage', orgId, days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await supabase
        .from('ai_cost_events')
        .select('created_at, estimated_cost')
        .eq('org_id', orgId!)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[UsageChart] Error fetching daily usage:', error);
        return [];
      }

      // Aggregate by day
      const dayMap = new Map<string, number>();

      // Pre-fill all days so chart has no gaps
      for (let i = days; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dayMap.set(key, 0);
      }

      for (const row of data ?? []) {
        const key = row.created_at.slice(0, 10);
        dayMap.set(key, (dayMap.get(key) ?? 0) + (row.estimated_cost || 0));
      }

      return Array.from(dayMap.entries()).map(([date, cost]) => ({
        date,
        cost: Math.round(cost * 10000) / 10000,
      }));
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().slice(0, 10);
}

export function UsageChart({ days = 30 }: { days?: number }) {
  const { data: dailyData, isLoading } = useDailyUsage(days);

  const totalCost = useMemo(() => {
    if (!dailyData) return 0;
    return dailyData.reduce((sum, d) => sum + d.cost, 0);
  }, [dailyData]);

  const todayStr = new Date().toISOString().slice(0, 10);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!dailyData || dailyData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-500 dark:text-gray-400">
        No usage data for the last {days} days
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Last {days} Days Spend
        </h3>
        <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
          ${totalCost.toFixed(2)} total
        </span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dailyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#37bd7e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#37bd7e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(v) => `$${v}`}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              width={50}
            />
            <Tooltip
              formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
              labelFormatter={(label) => {
                const formatted = formatDateLabel(label);
                return isToday(label) ? `${formatted} (Today)` : formatted;
              }}
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
              }}
            />
            <ReferenceLine
              x={todayStr}
              stroke="#37bd7e"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
            <Area
              type="monotone"
              dataKey="cost"
              stroke="#37bd7e"
              strokeWidth={2}
              fill="url(#usageGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

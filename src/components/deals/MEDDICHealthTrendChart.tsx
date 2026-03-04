/**
 * MEDDICHealthTrendChart — MEDDIC-003
 *
 * Sparkline of deal health score over time from deal_health_history.
 * Uses Recharts ResponsiveContainer + LineChart.
 * Compact — fits in the deal sheet sidebar.
 *
 * Light + dark mode.
 */

import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  ReferenceLine,
  YAxis,
  XAxis,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

interface HealthSnapshot {
  snapshot_at: string;
  overall_health_score: number;
  health_status: string | null;
}

// =============================================================================
// Hook
// =============================================================================

function useDealHealthHistory(dealId: string, limit = 30) {
  return useQuery({
    queryKey: ['deal-health-history', dealId, limit],
    queryFn: async (): Promise<HealthSnapshot[]> => {
      const { data, error } = await supabase
        .from('deal_health_history')
        .select('snapshot_at, overall_health_score, health_status')
        .eq('deal_id', dealId)
        .order('snapshot_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as HealthSnapshot[];
    },
    enabled: !!dealId,
    staleTime: 5 * 60 * 1000,
  });
}

// =============================================================================
// Custom tooltip
// =============================================================================

function SparkTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const score = payload[0].value;
  let status = 'Unknown';
  if (score <= 30) status = 'Critical';
  else if (score <= 55) status = 'At Risk';
  else if (score <= 80) status = 'Healthy';
  else status = 'Strong';

  return (
    <div className="bg-gray-900 text-gray-100 text-[10px] rounded-lg px-2 py-1.5 shadow-lg border border-white/10">
      <div className="font-bold text-white">{score}</div>
      <div className="text-gray-400">{status}</div>
      {label && <div className="text-gray-500 mt-0.5">{label}</div>}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

interface MEDDICHealthTrendChartProps {
  dealId: string;
}

export function MEDDICHealthTrendChart({ dealId }: MEDDICHealthTrendChartProps) {
  const { data: history = [], isLoading } = useDealHealthHistory(dealId);

  if (isLoading || history.length < 2) return null;

  const chartData = history.map((h) => ({
    date: format(parseISO(h.snapshot_at), 'MMM d'),
    score: h.overall_health_score,
  }));

  const first = chartData[0].score;
  const last = chartData[chartData.length - 1].score;
  const delta = last - first;

  const TrendIcon = delta > 2 ? TrendingUp : delta < -2 ? TrendingDown : Minus;
  const trendColor =
    delta > 2
      ? 'text-emerald-600 dark:text-emerald-400'
      : delta < -2
      ? 'text-red-600 dark:text-red-400'
      : 'text-gray-400 dark:text-gray-500';

  // Line color based on latest score
  const lineColor =
    last >= 80
      ? '#10b981'
      : last >= 55
      ? '#f59e0b'
      : last >= 30
      ? '#ef4444'
      : '#6b7280';

  return (
    <div className="rounded-xl border border-gray-200/80 dark:border-white/[0.06] bg-gray-50/80 dark:bg-white/[0.01] px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Health Trend
        </span>
        <div className={cn('flex items-center gap-1 text-[11px] font-semibold', trendColor)}>
          <TrendIcon className="w-3 h-3" />
          {delta > 0 ? '+' : ''}{delta}
        </div>
      </div>

      <div className="h-[48px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <YAxis domain={[0, 100]} hide />
            <XAxis dataKey="date" hide />
            <ReferenceLine y={55} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.3} />
            <ReferenceLine y={80} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.3} />
            <Tooltip content={<SparkTooltip />} />
            <Line
              type="monotone"
              dataKey="score"
              stroke={lineColor}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-between text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">
        <span>{chartData[0].date}</span>
        <span className={cn('font-semibold', trendColor)}>{last}</span>
        <span>{chartData[chartData.length - 1].date}</span>
      </div>
    </div>
  );
}

/**
 * UsageChart — 30-day AI spend trend with 30-day forward projections.
 *
 * Shows actual daily spend as a solid area chart, then projects forward
 * based on recent call volume at Low / Medium / High intelligence tiers.
 *
 * Projection logic:
 *   1. Calculate avg daily CALL COUNT over last 7 days (recent trend)
 *   2. Calculate avg COST PER CALL at the current model configuration
 *   3. For each tier, compute cost/call using model pricing ratios
 *   4. Daily projected cost = avg daily calls × cost/call at tier
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import { Loader2, Cpu, Brain, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';

// ─── Types ──────────────────────────────────────────────────────────────

interface DailyUsageRaw {
  date: string;
  cost: number;
  calls: number;
}

interface ChartPoint {
  date: string;
  cost?: number;      // actual historical spend
  projLow?: number;   // projected daily cost at Low tier
  projMed?: number;   // projected daily cost at Medium tier
  projHigh?: number;  // projected daily cost at High tier
}

interface AIModelPricing {
  input_cost_per_million: number;
  output_cost_per_million: number;
}

function getUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getUtcStartOfDayDaysAgo(daysAgo: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, 0, 0, 0)).toISOString();
}

// ─── Data hook ──────────────────────────────────────────────────────────

function useDailyUsageWithCalls(days: number = 30) {
  const orgId = useOrgId();

  return useQuery<DailyUsageRaw[]>({
    queryKey: ['credits', 'daily-usage-calls', orgId, days],
    queryFn: async () => {
      const sinceIso = getUtcStartOfDayDaysAgo(days);

      const { data, error } = await supabase
        .from('ai_cost_events')
        .select('created_at, estimated_cost')
        .eq('org_id', orgId!)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[UsageChart] Error fetching daily usage:', error);
        return [];
      }

      // Aggregate by day: both cost and call count
      const dayMap = new Map<string, { cost: number; calls: number }>();

      // Pre-fill all days so chart has no gaps
      for (let i = days; i >= 0; i--) {
        const now = new Date();
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
        const key = getUtcDateKey(d);
        dayMap.set(key, { cost: 0, calls: 0 });
      }

      for (const row of data ?? []) {
        const key = row.created_at.slice(0, 10);
        const existing = dayMap.get(key) ?? { cost: 0, calls: 0 };
        existing.cost += row.estimated_cost || 0;
        existing.calls += 1;
        dayMap.set(key, existing);
      }

      return Array.from(dayMap.entries()).map(([date, val]) => ({
        date,
        cost: Math.round(val.cost * 10000) / 10000,
        calls: val.calls,
      }));
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

/** Fetch model pricing to compute tier cost ratios */
function useModelPricing() {
  return useQuery<{ low: AIModelPricing; med: AIModelPricing; high: AIModelPricing } | null>({
    queryKey: ['credits', 'model-pricing-tiers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_models')
        .select('input_cost_per_million, output_cost_per_million')
        .eq('is_available', true)
        .eq('is_deprecated', false)
        .order('input_cost_per_million', { ascending: true });

      if (error || !data || data.length === 0) return null;

      const sorted = data.filter((m) => m.input_cost_per_million != null);
      if (sorted.length === 0) return null;

      return {
        low: sorted[0],
        med: sorted[Math.floor(sorted.length / 2)],
        high: sorted[sorted.length - 1],
      };
    },
    staleTime: 300_000,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isToday(dateStr: string) {
  return dateStr === getUtcDateKey(new Date());
}

function isFuture(dateStr: string) {
  return dateStr > getUtcDateKey(new Date());
}

/** Blended cost per call for a model tier (rough: assumes 3K input + 700 output avg) */
function blendedCostPerCall(pricing: AIModelPricing): number {
  const avgInput = 3000;  // typical input tokens per call
  const avgOutput = 700;  // typical output tokens per call
  return (avgInput / 1_000_000) * pricing.input_cost_per_million
       + (avgOutput / 1_000_000) * pricing.output_cost_per_million;
}

// ─── Projection colors ──────────────────────────────────────────────────

const PROJ_COLORS = {
  low: '#10b981',   // emerald-500
  med: '#f59e0b',   // amber-500
  high: '#f97316',  // orange-500
};

// ─── Custom tooltip ─────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const future = isFuture(label);
  const formatted = formatDateLabel(label);
  const dateLabel = isToday(label) ? `${formatted} (Today)` : future ? `${formatted} (Projected)` : formatted;

  return (
    <div className="bg-gray-900/95 rounded-lg px-3 py-2 text-xs shadow-lg border border-gray-700/50">
      <p className="text-gray-300 mb-1.5 font-medium">{dateLabel}</p>
      {payload.map((entry: any) => {
        if (entry.value == null) return null;
        const labels: Record<string, string> = {
          cost: 'Actual',
          projLow: 'Low tier',
          projMed: 'Medium tier',
          projHigh: 'High tier',
        };
        return (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-400">{labels[entry.dataKey] ?? entry.dataKey}:</span>
            <span className="text-white font-medium tabular-nums">
              ${Number(entry.value).toFixed(4)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Legend labels ───────────────────────────────────────────────────────

function renderLegend(props: any) {
  const { payload } = props;
  if (!payload) return null;

  const labels: Record<string, { label: string; icon: typeof Cpu }> = {
    cost: { label: 'Actual spend', icon: Cpu },
    projLow: { label: 'Low tier projection', icon: Cpu },
    projMed: { label: 'Medium tier projection', icon: Brain },
    projHigh: { label: 'High tier projection', icon: Zap },
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2">
      {payload.map((entry: any) => {
        const meta = labels[entry.dataKey];
        if (!meta) return null;
        return (
          <span key={entry.dataKey} className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: entry.color }}
            />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────

export function UsageChart({ days = 30 }: { days?: number }) {
  const { data: dailyData, isLoading: usageLoading } = useDailyUsageWithCalls(days);
  const { data: pricing } = useModelPricing();

  const todayStr = getUtcDateKey(new Date());

  // Build chart data with projections
  const { chartData, totalCost, projectedMonthly } = useMemo(() => {
    if (!dailyData || dailyData.length === 0) {
      return { chartData: [], totalCost: 0, projectedMonthly: null };
    }

    const total = dailyData.reduce((sum, d) => sum + d.cost, 0);

    // Calculate recent averages (last 7 days with data)
    const recentDays = dailyData.slice(-7);
    const avgDailyCalls = recentDays.reduce((s, d) => s + d.calls, 0) / Math.max(recentDays.length, 1);
    const avgDailyCost = recentDays.reduce((s, d) => s + d.cost, 0) / Math.max(recentDays.length, 1);

    // Compute tier cost ratios
    let ratioLow = 1;
    let ratioMed = 1;
    let ratioHigh = 1;

    if (pricing && avgDailyCost > 0 && avgDailyCalls > 0) {
      // Current average cost per call
      const currentCostPerCall = avgDailyCost / avgDailyCalls;

      // Cost per call at each tier
      const lowCpc = blendedCostPerCall(pricing.low);
      const medCpc = blendedCostPerCall(pricing.med);
      const highCpc = blendedCostPerCall(pricing.high);

      if (currentCostPerCall > 0) {
        ratioLow = lowCpc / currentCostPerCall;
        ratioMed = medCpc / currentCostPerCall;
        ratioHigh = highCpc / currentCostPerCall;
      }
    }

    // Historical points
    const points: ChartPoint[] = dailyData.map((d) => ({
      date: d.date,
      cost: d.cost,
    }));

    // Add "today" as the starting anchor for projections
    const todayPoint = points.find((p) => p.date === todayStr);
    if (todayPoint) {
      todayPoint.projLow = todayPoint.cost! * ratioLow;
      todayPoint.projMed = todayPoint.cost! * ratioMed;
      todayPoint.projHigh = todayPoint.cost! * ratioHigh;
    }

    // Future projection points (30 days forward)
    const projectionDays = 30;
    for (let i = 1; i <= projectionDays; i++) {
      const now = new Date();
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
      const key = getUtcDateKey(d);

      points.push({
        date: key,
        projLow: avgDailyCost * ratioLow,
        projMed: avgDailyCost * ratioMed,
        projHigh: avgDailyCost * ratioHigh,
      });
    }

    // Projected monthly totals
    const projected = avgDailyCost > 0 ? {
      low: avgDailyCost * ratioLow * 30,
      med: avgDailyCost * ratioMed * 30,
      high: avgDailyCost * ratioHigh * 30,
      current: avgDailyCost * 30,
    } : null;

    return { chartData: points, totalCost: total, projectedMonthly: projected };
  }, [dailyData, pricing, todayStr]);

  if (usageLoading) {
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
      {/* Header stats */}
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Last {days} Days + 30-Day Projection
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Projections based on your recent 7-day call volume
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Actual</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
              ${totalCost.toFixed(2)}
            </p>
          </div>
          {projectedMonthly && projectedMonthly.current > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">30d est.</p>
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                ${projectedMonthly.current.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Projection summary cards */}
      {projectedMonthly && projectedMonthly.current > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { tier: 'Low', cost: projectedMonthly.low, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: Cpu },
            { tier: 'Medium', cost: projectedMonthly.med, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', icon: Brain },
            { tier: 'High', cost: projectedMonthly.high, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', icon: Zap },
          ].map(({ tier, cost, color, bg, icon: Icon }) => (
            <div key={tier} className={cn('rounded-lg px-3 py-2 text-center', bg)}>
              <div className="flex items-center justify-center gap-1">
                <Icon className={cn('w-3 h-3', color)} />
                <span className={cn('text-[10px] font-medium', color)}>{tier}</span>
              </div>
              <p className={cn('text-sm font-bold tabular-nums mt-0.5', color)}>
                ${cost.toFixed(2)}/mo
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#37bd7e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#37bd7e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="text-gray-200 dark:text-gray-700"
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              tickFormatter={(v) => `$${v}`}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend content={renderLegend} />

            {/* Today divider */}
            <ReferenceLine
              x={todayStr}
              stroke="#64748b"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: 'Today',
                position: 'top',
                fill: '#94a3b8',
                fontSize: 10,
              }}
            />

            {/* Actual spend (solid area) */}
            <Area
              type="monotone"
              dataKey="cost"
              stroke="#37bd7e"
              strokeWidth={2}
              fill="url(#usageGradient)"
              connectNulls={false}
              name="Actual"
            />

            {/* Projection: Low tier */}
            <Line
              type="monotone"
              dataKey="projLow"
              stroke={PROJ_COLORS.low}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              connectNulls={false}
              name="Low tier"
            />

            {/* Projection: Medium tier */}
            <Line
              type="monotone"
              dataKey="projMed"
              stroke={PROJ_COLORS.med}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              connectNulls={false}
              name="Medium tier"
            />

            {/* Projection: High tier */}
            <Line
              type="monotone"
              dataKey="projHigh"
              stroke={PROJ_COLORS.high}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              connectNulls={false}
              name="High tier"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

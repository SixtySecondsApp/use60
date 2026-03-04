/**
 * PipelineWaterfallChart (FORE-004)
 * Waterfall: deals added → won → lost → slipped per period.
 * Uses pipeline_snapshots for historical data, falls back to deals table for current.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrencyCompact } from '@/lib/utils/formatters';

interface WaterfallItem {
  name: string;
  value: number;
  color: string;
}

async function fetchWaterfallData(orgId: string): Promise<WaterfallItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const now = new Date();
  const periodStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const periodEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const prevMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');

  // Deals added this month (created_at in period)
  const { data: added } = await supabase
    .from('deals')
    .select('value')
    .eq('clerk_org_id', orgId)
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd + 'T23:59:59');

  // Deals won this month
  const { data: won } = await supabase
    .from('deals')
    .select('value')
    .eq('clerk_org_id', orgId)
    .eq('status', 'won')
    .gte('closed_won_date', periodStart)
    .lte('closed_won_date', periodEnd);

  // Deals lost this month
  const { data: lost } = await supabase
    .from('deals')
    .select('value')
    .eq('clerk_org_id', orgId)
    .eq('status', 'lost')
    .gte('updated_at', periodStart)
    .lte('updated_at', periodEnd + 'T23:59:59');

  // Slipped = deals with close_date in prev month still open
  const { data: slipped } = await supabase
    .from('deals')
    .select('value')
    .eq('clerk_org_id', orgId)
    .not('status', 'in', '("won","lost")')
    .gte('close_date', prevMonthStart)
    .lt('close_date', periodStart);

  const sum = (rows: { value: number | null }[] | null) =>
    (rows || []).reduce((acc, r) => acc + (r.value || 0), 0);

  return [
    { name: 'Added', value: sum(added), color: '#3B82F6' },
    { name: 'Won', value: sum(won), color: '#10B981' },
    { name: 'Lost', value: -sum(lost), color: '#EF4444' },
    { name: 'Slipped', value: -sum(slipped), color: '#F59E0B' },
  ];
}

export function PipelineWaterfallChart() {
  const orgId = useActiveOrgId();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const axisColor = isDark ? '#9CA3AF' : '#6B7280';
  const tooltipBg = isDark ? '#1F2937' : '#FFFFFF';
  const tooltipBorder = isDark ? '#374151' : '#E5E7EB';

  const { data: chartData, isLoading } = useQuery({
    queryKey: ['pipeline-waterfall', orgId],
    queryFn: () => fetchWaterfallData(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const val = payload[0]?.value ?? 0;
    return (
      <div
        className="rounded-xl border p-3 shadow-xl text-sm"
        style={{ backgroundColor: tooltipBg, borderColor: tooltipBorder }}
      >
        <p className="font-medium text-muted-foreground mb-1">{label}</p>
        <p className="font-bold" style={{ color: payload[0]?.fill }}>
          {val >= 0 ? '+' : ''}{formatCurrencyCompact(Math.abs(val))}
        </p>
      </div>
    );
  };

  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-white/20 dark:border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-500" />
          Pipeline Movement — {format(new Date(), 'MMMM yyyy')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-52">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: axisColor, fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: axisColor, fontSize: 11 }}
                tickFormatter={(v) => formatCurrencyCompact(Math.abs(v))}
              />
              <ReferenceLine y={0} stroke={axisColor} strokeWidth={1} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="value" maxBarSize={60} radius={[4, 4, 0, 0]}>
                {(chartData || []).map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

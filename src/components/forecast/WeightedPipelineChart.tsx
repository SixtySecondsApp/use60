/**
 * WeightedPipelineChart (FORE-005)
 * Horizontal bar chart: value per stage weighted by probability.
 * Data from deals + deal_stages (mirrors get_weighted_pipeline RPC logic).
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
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Layers, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrencyCompact } from '@/lib/utils/formatters';

interface StageData {
  stage: string;
  weighted: number;
  raw: number;
  probability: number;
}

const STAGE_COLORS = [
  '#6366F1', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
  '#F59E0B', '#EF4444', '#10B981',
];

async function fetchWeightedByStage(orgId: string): Promise<StageData[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: deals, error } = await supabase
    .from('deals')
    .select('value, stage_id, deal_stages(name, default_probability)')
    .eq('clerk_org_id', orgId)
    .not('status', 'in', '("won","lost")')
    .not('value', 'is', null);

  if (error) throw error;

  const stageMap = new Map<string, { raw: number; weighted: number; probability: number }>();

  for (const deal of deals || []) {
    const stage = (deal as any).deal_stages;
    const stageName = stage?.name || 'Unknown';
    const prob = (stage?.default_probability ?? 50) / 100;
    const val = deal.value || 0;

    const existing = stageMap.get(stageName) || { raw: 0, weighted: 0, probability: prob };
    stageMap.set(stageName, {
      raw: existing.raw + val,
      weighted: existing.weighted + val * prob,
      probability: prob,
    });
  }

  return Array.from(stageMap.entries())
    .map(([stage, data]) => ({ stage, ...data }))
    .sort((a, b) => b.weighted - a.weighted);
}

export function WeightedPipelineChart() {
  const orgId = useActiveOrgId();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const axisColor = isDark ? '#9CA3AF' : '#6B7280';
  const tooltipBg = isDark ? '#1F2937' : '#FFFFFF';
  const tooltipBorder = isDark ? '#374151' : '#E5E7EB';

  const { data: stageData, isLoading } = useQuery({
    queryKey: ['weighted-pipeline-by-stage', orgId],
    queryFn: () => fetchWeightedByStage(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const chartData = (stageData || []).map((s) => ({
    name: s.stage,
    value: Math.round(s.weighted),
    raw: Math.round(s.raw),
    pct: Math.round(s.probability * 100),
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    return (
      <div
        className="rounded-xl border p-3 shadow-xl text-sm"
        style={{ backgroundColor: tooltipBg, borderColor: tooltipBorder }}
      >
        <p className="font-medium mb-1">{label}</p>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Weighted</span>
            <span className="font-bold" style={{ color: item?.fill }}>{formatCurrencyCompact(item?.value)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Raw</span>
            <span className="font-semibold">{formatCurrencyCompact(item?.payload?.raw)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Probability</span>
            <span>{item?.payload?.pct}%</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-white/20 dark:border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-500" />
          Weighted Pipeline by Stage
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-52">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !chartData.length ? (
          <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
            No open deals in pipeline.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 40)}>
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 4, right: 16, left: 80, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fill: axisColor, fontSize: 11 }}
                tickFormatter={(v) => formatCurrencyCompact(v)}
              />
              <YAxis
                type="category"
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: axisColor, fontSize: 12 }}
                width={76}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="value" maxBarSize={28} radius={[0, 4, 4, 0]}>
                {chartData.map((_, index) => (
                  <Cell key={index} fill={STAGE_COLORS[index % STAGE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

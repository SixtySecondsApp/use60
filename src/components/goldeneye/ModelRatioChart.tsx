/**
 * ModelRatioChart — Donut chart showing token volume distribution across models
 *
 * Displays top 6 models + "Other" with stat flags showing tokens in/out per segment.
 * Center label shows total token count.
 */

import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import type { ModelBreakdownEntry } from '@/lib/hooks/useGoldenEyeData';

interface ModelRatioChartProps {
  modelBreakdown: ModelBreakdownEntry[];
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function shortenModelName(model: string): string {
  return model
    .replace(/^(claude-|gemini-|gpt-|o\d-)/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-latest$/, '');
}

const COLORS = [
  '#4A90D8', // blue
  '#1EBCA8', // teal
  '#E8864A', // orange
  '#A855F7', // purple
  '#44B88A', // green
  '#D84888', // pink
  '#30A8CC', // cyan
  '#E09828', // amber
  '#6366F1', // indigo
  '#EF4444', // red
];

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number; inputTokens: number; outputTokens: number } }>;
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-700 bg-[#1f2937] px-3 py-2 shadow-xl">
      <div className="text-[11px] font-semibold text-slate-200">{d.name}</div>
      <div className="mt-1 flex items-center gap-3 text-[10px] font-mono">
        <span className="text-indigo-300">In: {formatCompact(d.inputTokens)}</span>
        <span className="text-emerald-300">Out: {formatCompact(d.outputTokens)}</span>
      </div>
      <div className="mt-0.5 text-[10px] text-slate-500">
        Total: {formatCompact(d.value)}
      </div>
    </div>
  );
}

export function ModelRatioChart({ modelBreakdown }: ModelRatioChartProps) {
  const chartData = useMemo(() => {
    return modelBreakdown.map((entry) => ({
      name: shortenModelName(entry.model),
      value: entry.input_tokens + entry.output_tokens,
      inputTokens: entry.input_tokens,
      outputTokens: entry.output_tokens,
    }));
  }, [modelBreakdown]);

  const totalTokens = useMemo(
    () => chartData.reduce((sum, d) => sum + d.value, 0),
    [chartData]
  );

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-3">
        <div className="flex items-center gap-2 mb-2">
          <PieChartIcon className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Model Ratio</span>
        </div>
        <div className="text-[10px] text-slate-600 text-center py-4">No model data</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50">
        <PieChartIcon className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Model Ratio</span>
      </div>

      <div className="flex-1 flex items-center px-2 py-2">
        {/* Donut chart */}
        <div className="w-[180px] h-[170px] shrink-0 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={72}
                paddingAngle={2}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
                stroke="none"
              >
                {chartData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xs font-bold text-slate-200 font-mono">{formatCompact(totalTokens)}</span>
            <span className="text-[9px] text-slate-500 uppercase">tokens</span>
          </div>
        </div>

        {/* Legend / stat flags */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5 pl-3">
          {chartData.map((entry, index) => {
            const pct = totalTokens > 0 ? ((entry.value / totalTokens) * 100).toFixed(1) : '0';
            return (
              <div key={entry.name} className="flex items-center gap-2 text-[10px]">
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-slate-300 truncate min-w-0 flex-1">{entry.name}</span>
                <span className="text-slate-500 shrink-0">{pct}%</span>
                <div className="shrink-0 flex gap-1 font-mono">
                  <span className="text-indigo-400">{formatCompact(entry.inputTokens)}</span>
                  <span className="text-slate-600">/</span>
                  <span className="text-emerald-400">{formatCompact(entry.outputTokens)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

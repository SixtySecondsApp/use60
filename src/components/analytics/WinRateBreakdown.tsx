/**
 * WinRateBreakdown — WL-003
 * 4 small bar charts: by stage, by rep, by deal size, by month.
 * Clickable bars to filter (calls onSegmentClick).
 */

import React from 'react';
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
import type { WinLossAnalytics } from '@/lib/types/winLoss';

interface Props {
  analytics: WinLossAnalytics;
}

function WinRateBar({ data, dataKey, labelKey }: {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  labelKey: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis
          dataKey={labelKey}
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#f9fafb', fontSize: 12 }}
          formatter={(v: number) => [`${v}%`, 'Win rate']}
          cursor={{ fill: 'rgba(99,102,241,0.08)' }}
        />
        <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((entry, idx) => {
            const rate = entry[dataKey] as number;
            const color = rate >= 60
              ? '#10b981'
              : rate >= 40
                ? '#f59e0b'
                : '#ef4444';
            return <Cell key={idx} fill={color} fillOpacity={0.85} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WinRateBreakdown({ analytics }: Props) {
  const stageData = (analytics.by_stage ?? []).map((r) => ({
    stage: r.stage,
    win_rate: r.win_rate ?? 0,
  }));

  const repData = (analytics.by_rep ?? []).map((r) => ({
    rep: r.rep_name?.split(' ')[0] ?? 'Unknown',
    win_rate: r.win_rate ?? 0,
  }));

  const sizeData = (analytics.by_size ?? []).map((r) => ({
    size: r.size_bucket,
    win_rate: r.win_rate ?? 0,
  }));

  const monthData = (analytics.by_period ?? []).map((r) => ({
    month: r.month.slice(5), // 'MM'
    win_rate: r.win_rate ?? 0,
  }));

  const panels = [
    { title: 'By Stage',       data: stageData,  labelKey: 'stage' },
    { title: 'By Rep',         data: repData,    labelKey: 'rep' },
    { title: 'By Deal Size',   data: sizeData,   labelKey: 'size' },
    { title: 'By Month',       data: monthData,  labelKey: 'month' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {panels.map(({ title, data, labelKey }) => (
        <div key={title} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <p className="text-xs font-semibold text-gray-400 mb-3">{title}</p>
          {data.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-xs text-gray-600">
              No data
            </div>
          ) : (
            <WinRateBar data={data} dataKey="win_rate" labelKey={labelKey} />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * LossReasonDistribution — WL-004
 * Bar chart of losses per reason code. Clicking a bar shows deal list.
 */

import React, { useState } from 'react';
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
import { X } from 'lucide-react';
import type { LossReasonBucket, LossReasonCode } from '@/lib/types/winLoss';

const REASON_LABELS: Record<LossReasonCode, string> = {
  price:          'Price',
  timing:         'Timing',
  competitor_won: 'Competitor',
  no_decision:    'No Decision',
  feature_gap:    'Feature Gap',
  champion_left:  'Champion Left',
  budget_cut:     'Budget Cut',
  other:          'Other',
};

const REASON_COLORS: Record<LossReasonCode, string> = {
  price:          '#ef4444',
  timing:         '#f59e0b',
  competitor_won: '#8b5cf6',
  no_decision:    '#6b7280',
  feature_gap:    '#3b82f6',
  champion_left:  '#ec4899',
  budget_cut:     '#f97316',
  other:          '#6b7280',
};

interface Props {
  buckets: LossReasonBucket[];
}

export function LossReasonDistribution({ buckets }: Props) {
  const [selected, setSelected] = useState<LossReasonBucket | null>(null);

  const chartData = buckets.map((b) => ({
    reason: REASON_LABELS[b.reason_code] ?? b.reason_code,
    count: b.count,
    raw: b,
  }));

  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-8 flex items-center justify-center text-sm text-gray-500">
        No loss data for this period
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">Loss Reason Distribution</h3>
        <p className="text-xs text-gray-500 mt-0.5">Click a bar to see affected deals</p>
      </div>

      <div className="p-4">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="reason"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#f9fafb', fontSize: 12 }}
              formatter={(v: number) => [v, 'Losses']}
              cursor={{ fill: 'rgba(99,102,241,0.08)' }}
            />
            <Bar
              dataKey="count"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
              cursor="pointer"
              onClick={(entry) => setSelected(entry.raw as LossReasonBucket)}
            >
              {chartData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={REASON_COLORS[entry.raw.reason_code] ?? '#6b7280'}
                  fillOpacity={selected && selected.reason_code !== entry.raw.reason_code ? 0.35 : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Deal drill-down */}
      {selected && (
        <div className="border-t border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-white">
              {REASON_LABELS[selected.reason_code]} — {selected.count} deal{selected.count !== 1 ? 's' : ''}
            </p>
            <button
              onClick={() => setSelected(null)}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {selected.deals.map((d) => (
              <div key={d.deal_id} className="flex items-center justify-between text-xs text-gray-300 py-1">
                <span className="truncate">{d.deal_name}</span>
                <span className="text-gray-500 shrink-0 ml-3">
                  {d.value != null ? `$${d.value.toLocaleString()}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

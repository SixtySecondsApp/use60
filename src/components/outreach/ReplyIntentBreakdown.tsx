import React, { useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { MessageSquare } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import type { ReplyIntentBucket } from '@/lib/types/outreachAnalytics';

interface Props {
  buckets: ReplyIntentBucket[];
  onCategoryClick?: (category: string | null) => void;
  activeCategory?: string | null;
}

export function ReplyIntentBreakdown({ buckets, onCategoryClick, activeCategory }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const total = buckets.reduce((s, b) => s + b.count, 0);

  const tooltipBg = isDark ? '#1F2937' : '#FFFFFF';
  const tooltipBorder = isDark ? '#374151' : '#E5E7EB';

  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-8 flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
        <MessageSquare className="h-8 w-8 opacity-30" />
        <p className="text-sm">No reply data yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Reply Intent Breakdown</h3>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{total} total replies classified</p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Pie chart */}
        <div className="w-full sm:w-48 shrink-0 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={buckets}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                dataKey="count"
                nameKey="label"
                onClick={(d) => onCategoryClick?.(activeCategory === d.category ? null : d.category)}
                cursor={onCategoryClick ? 'pointer' : 'default'}
              >
                {buckets.map((b) => (
                  <Cell
                    key={b.category}
                    fill={b.color}
                    opacity={activeCategory && activeCategory !== b.category ? 0.3 : 1}
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value, name) => [`${value} (${buckets.find(b => b.label === name)?.percent ?? 0}%)`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend + stats */}
        <div className="flex-1 space-y-2 w-full">
          {buckets.map((b) => (
            <button
              key={b.category}
              onClick={() => onCategoryClick?.(activeCategory === b.category ? null : b.category)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
                activeCategory === b.category
                  ? 'bg-gray-100 dark:bg-gray-700'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
              } ${onCategoryClick ? 'cursor-pointer' : ''}`}
            >
              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
              <span className="text-sm text-gray-600 dark:text-gray-300 flex-1 truncate">{b.label}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{b.count}</span>
              <span className="text-xs text-gray-500 dark:text-gray-500 w-10 text-right">{b.percent}%</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

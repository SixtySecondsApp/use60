/**
 * MentionFrequencyChart
 *
 * Bar chart showing per-day competitor mention frequency with 30/60/90-day toggle.
 *
 * Story: COMP-003
 */

import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMentionFrequency } from '@/lib/hooks/useCompetitiveIntel';

// ============================================================================
// Types
// ============================================================================

type Window = 30 | 60 | 90;

const WINDOWS: { value: Window; label: string }[] = [
  { value: 30, label: '30d' },
  { value: 60, label: '60d' },
  { value: 90, label: '90d' },
];

// ============================================================================
// Custom tooltip
// ============================================================================

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const date = new Date(label + 'T00:00:00');
  const formatted = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400">{formatted}</p>
      <p className="font-semibold text-gray-100">{payload[0].value} mention{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

interface MentionFrequencyChartProps {
  competitorName: string;
}

export function MentionFrequencyChart({ competitorName }: MentionFrequencyChartProps) {
  const [window, setWindow] = useState<Window>(30);
  const { data, isLoading } = useMentionFrequency(competitorName, window);

  // Reduce density: group into buckets if window > 30
  const chartData = (() => {
    if (!data?.length) return [];
    if (window === 30) return data.map(d => ({ ...d, label: d.date.slice(5) }));

    // Group into weekly buckets
    const bucketSize = window === 60 ? 7 : 14;
    const buckets: { label: string; count: number }[] = [];
    for (let i = 0; i < data.length; i += bucketSize) {
      const chunk = data.slice(i, i + bucketSize);
      const total = chunk.reduce((s, d) => s + d.count, 0);
      const firstDate = new Date(chunk[0].date + 'T00:00:00');
      buckets.push({
        label: firstDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        count: total,
      });
    }
    return buckets;
  })();

  const totalMentions = data?.reduce((s, d) => s + d.count, 0) ?? 0;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Mention frequency</span>
          <span className="text-xs text-gray-500">
            {totalMentions} mention{totalMentions !== 1 ? 's' : ''} in {window}d
          </span>
        </div>

        {/* Window toggle */}
        <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
          {WINDOWS.map(w => (
            <button
              key={w.value}
              onClick={() => setWindow(w.value)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs transition-colors',
                window === w.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="h-32 flex items-center justify-center">
          <span className="text-xs text-gray-400 dark:text-gray-600">Loading...</span>
        </div>
      ) : totalMentions === 0 ? (
        <div className="h-32 flex items-center justify-center">
          <span className="text-xs text-gray-400 dark:text-gray-600">No mentions in this period</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#6B7280' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#6B7280' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="count" fill="#ef4444" radius={[2, 2, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

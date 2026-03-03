/**
 * ApprovalSparkline
 *
 * Compact sparkline chart showing approval rate over time.
 * Supports 7/30/90-day window toggle.
 *
 * Uses Recharts LineChart pattern consistent with other charts in the app.
 *
 * Story: AUT-002
 */

import { useState } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type WindowDays = 7 | 30 | 90;

interface ApprovalSparklineProps {
  /** Map of window size → approval rate series (0–100 values). */
  rates: Record<WindowDays, number[]>;
}

// ============================================================================
// Helpers
// ============================================================================

function buildChartData(series: number[]): { value: number }[] {
  return series.map((value) => ({ value }));
}

// ============================================================================
// Component
// ============================================================================

export function ApprovalSparkline({ rates }: ApprovalSparklineProps) {
  const [window, setWindow] = useState<WindowDays>(30);

  const series = rates[window];
  const hasData = series.length >= 2;

  if (!hasData) {
    // Try to fall back to a window that has data
    const fallback = ([7, 30, 90] as WindowDays[]).find(
      (w) => rates[w].length >= 2
    );
    if (!fallback) return null;
  }

  const activeSeries = hasData ? series : rates[([7, 30, 90] as WindowDays[]).find((w) => rates[w].length >= 2)!];
  const chartData = buildChartData(activeSeries);

  // Determine trend colour from last vs first value
  const first = activeSeries[0] ?? 0;
  const last = activeSeries[activeSeries.length - 1] ?? 0;
  const strokeColor = last >= first ? '#10b981' : '#f59e0b';

  const WINDOWS: WindowDays[] = [7, 30, 90];

  return (
    <div className="space-y-1.5">
      {/* Window toggle */}
      <div className="flex items-center gap-1">
        {WINDOWS.map((w) => {
          const wHasData = rates[w].length >= 2;
          return (
            <button
              key={w}
              onClick={() => { if (wHasData) setWindow(w); }}
              disabled={!wHasData}
              className={cn(
                'text-xs px-1.5 py-0.5 rounded transition-colors',
                window === w && wHasData
                  ? 'bg-gray-700 text-gray-200'
                  : 'text-gray-600 hover:text-gray-400 disabled:opacity-40 disabled:cursor-default'
              )}
            >
              {w}d
            </button>
          );
        })}
      </div>

      {/* Sparkline */}
      <div className="h-10">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={strokeColor}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Tooltip
              contentStyle={{
                background: '#111827',
                border: '1px solid #374151',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#d1d5db',
              }}
              formatter={(value: number) => [`${value}%`, 'Approval']}
              labelFormatter={() => ''}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ApprovalSparkline;

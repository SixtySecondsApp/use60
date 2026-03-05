import React, { useState, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTheme } from '@/hooks/useTheme';
import type { SequencePerformanceRow } from '@/lib/types/outreachAnalytics';

type Timeframe = 'daily' | 'weekly';

interface Props {
  sequences: SequencePerformanceRow[];
}

/**
 * Builds a synthetic time-series from sequence data since Instantly's
 * campaign_analytics_daily requires per-campaign calls. We show aggregate
 * campaign-level bars instead, one bar per campaign.
 */
export function EngagementTimeSeriesChart({ sequences }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [timeframe, setTimeframe] = useState<Timeframe>('daily');

  const chartData = useMemo(() => {
    // Show top 15 campaigns sorted by sent
    const top = [...sequences]
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 15);

    return top.map((s) => ({
      name: s.campaignName.length > 20 ? s.campaignName.slice(0, 18) + '…' : s.campaignName,
      Sent: s.sent,
      Opened: Math.round((s.openRate / 100) * s.sent),
      Clicked: Math.round((s.clickRate / 100) * s.sent),
      Replied: Math.round((s.replyRate / 100) * s.sent),
      BounceRate: s.bounceRate,
    }));
  }, [sequences]);

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const axisColor = isDark ? '#6B7280' : '#9CA3AF';
  const tooltipBg = isDark ? '#1F2937' : '#FFFFFF';
  const tooltipBorder = isDark ? '#374151' : '#E5E7EB';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Email Engagement by Campaign</h3>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">Top campaigns by volume</p>
        </div>
        <div className="flex gap-1">
          {(['daily', 'weekly'] as Timeframe[]).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
                timeframe === t
                  ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                  : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-transparent'
              }`}
            >
              {t === 'daily' ? 'By Campaign' : 'Rates'}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400 dark:text-gray-500 text-sm">
          No campaign data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: axisColor, fontSize: 10 }}
              angle={-40}
              textAnchor="end"
              height={70}
              interval={0}
            />
            {timeframe === 'daily' ? (
              <YAxis axisLine={false} tickLine={false} tick={{ fill: axisColor, fontSize: 11 }} />
            ) : (
              <YAxis axisLine={false} tickLine={false} tick={{ fill: axisColor, fontSize: 11 }} unit="%" domain={[0, 100]} />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: tooltipBg,
                border: `1px solid ${tooltipBorder}`,
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend
              verticalAlign="top"
              height={28}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '11px', color: axisColor }}
            />
            {timeframe === 'daily' ? (
              <>
                <Bar dataKey="Sent" fill="#6366f1" maxBarSize={28} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Opened" fill="#10b981" maxBarSize={28} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Clicked" fill="#3b82f6" maxBarSize={28} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Replied" fill="#f59e0b" maxBarSize={28} radius={[2, 2, 0, 0]} />
              </>
            ) : (
              <Line
                type="monotone"
                dataKey="BounceRate"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Bounce Rate %"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

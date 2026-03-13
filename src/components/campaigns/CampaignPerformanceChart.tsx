import React from 'react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useDailyCampaignAnalytics } from '@/lib/services/campaignService';
import { format } from 'date-fns';

interface Props {
  orgId: string;
  campaignId: string;
}

export function CampaignPerformanceChart({ orgId, campaignId }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { data: daily, isLoading } = useDailyCampaignAnalytics(orgId, campaignId);

  const chartData = (daily ?? []).map((entry) => ({
    name: (() => {
      try {
        return format(new Date(entry.date), 'MMM d');
      } catch {
        return entry.date;
      }
    })(),
    Sent: entry.sent ?? 0,
    Opened: entry.opened ?? 0,
    Clicked: entry.clicked ?? 0,
    Replied: entry.replied ?? 0,
  }));

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const axisColor = isDark ? '#6B7280' : '#9CA3AF';
  const tooltipBg = isDark ? '#1F2937' : '#FFFFFF';
  const tooltipBorder = isDark ? '#374151' : '#E5E7EB';

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/30 py-8 text-center">
        <p className="text-sm text-gray-500">No daily data available</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
      <h4 className="text-sm font-medium text-gray-300 mb-3">Daily Performance</h4>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: axisColor, fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: axisColor, fontSize: 11 }}
          />
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
          <Bar dataKey="Sent" fill="#6366f1" maxBarSize={24} radius={[2, 2, 0, 0]} />
          <Bar dataKey="Opened" fill="#10b981" maxBarSize={24} radius={[2, 2, 0, 0]} />
          <Bar dataKey="Clicked" fill="#3b82f6" maxBarSize={24} radius={[2, 2, 0, 0]} />
          <Bar dataKey="Replied" fill="#f59e0b" maxBarSize={24} radius={[2, 2, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

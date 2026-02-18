/**
 * TeamTrendsChart - Performance trend visualizations for Team Analytics
 * Shows meeting volume, sentiment, and talk time trends with tabs
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Smile, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeamTrends, useTeamTimeSeries, type TimePeriod } from '@/lib/hooks/useTeamAnalytics';

interface TeamTrendsChartProps {
  period: TimePeriod;
  className?: string;
}

// Color palette for multi-line charts
const REP_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
];

// Skeleton for loading state
export const TeamTrendsChartSkeleton = () => (
  <div className="bg-white dark:bg-gray-900/40 rounded-2xl border border-gray-200 dark:border-gray-700/30 p-6">
    <div className="space-y-4">
      {/* Tab skeleton */}
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 w-32 bg-gray-100 dark:bg-gray-800/50 rounded-lg animate-pulse" />
        ))}
      </div>
      {/* Chart skeleton */}
      <div className="h-72 bg-gray-100 dark:bg-gray-800/50 rounded-xl animate-pulse" />
    </div>
  </div>
);

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 min-w-[140px]">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{label}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-700 dark:text-gray-300 truncate max-w-[100px]">
              {entry.name}
            </span>
          </div>
          <span className="font-medium text-gray-900 dark:text-white">
            {typeof entry.value === 'number' ? entry.value.toFixed(entry.unit === '%' ? 1 : 2) : entry.value}
            {entry.unit || ''}
          </span>
        </div>
      ))}
    </div>
  );
};

// Meeting Volume Chart (Area chart)
function MeetingVolumeChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      dateFormatted: format(parseISO(d.date), 'MMM d'),
    }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-gray-500 dark:text-gray-400">
        No meeting data available
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis
            dataKey="dateFormatted"
            tick={{ fontSize: 12 }}
            className="text-gray-600 dark:text-gray-400"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12 }}
            className="text-gray-600 dark:text-gray-400"
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="count"
            name="Meetings"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#volumeGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Sentiment Trend Chart (Multi-line per rep + team average)
function SentimentTrendChart({
  data,
  showIndividualReps = true,
}: {
  data: Array<{ date: string; avg: number | null }>;
  showIndividualReps?: boolean;
}) {
  const chartData = useMemo(() => {
    return data
      .filter((d) => d.avg !== null)
      .map((d) => ({
        ...d,
        dateFormatted: format(parseISO(d.date), 'MMM d'),
        sentiment: d.avg,
      }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-gray-500 dark:text-gray-400">
        No sentiment data available
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <defs>
            <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis
            dataKey="dateFormatted"
            tick={{ fontSize: 12 }}
            className="text-gray-600 dark:text-gray-400"
          />
          <YAxis
            domain={[-1, 1]}
            tick={{ fontSize: 12 }}
            className="text-gray-600 dark:text-gray-400"
            tickFormatter={(value) => value.toFixed(1)}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="sentiment"
            name="Team Avg"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#10b981' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Talk Time Chart with ideal zone highlighting
function TalkTimeChart({ data }: { data: Array<{ date: string; avg: number | null }> }) {
  const chartData = useMemo(() => {
    return data
      .filter((d) => d.avg !== null)
      .map((d) => ({
        ...d,
        dateFormatted: format(parseISO(d.date), 'MMM d'),
        talkTime: d.avg,
      }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-gray-500 dark:text-gray-400">
        No talk time data available
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="talkTimeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
            {/* Ideal zone gradient */}
            <linearGradient id="idealZone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.1} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis
            dataKey="dateFormatted"
            tick={{ fontSize: 12 }}
            className="text-gray-600 dark:text-gray-400"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            className="text-gray-600 dark:text-gray-400"
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            content={<CustomTooltip />}
            formatter={(value: number) => [`${value.toFixed(1)}%`, 'Talk Time']}
          />
          {/* Ideal zone reference lines */}
          <ReferenceLine y={45} stroke="#22c55e" strokeDasharray="3 3" opacity={0.5} />
          <ReferenceLine y={55} stroke="#22c55e" strokeDasharray="3 3" opacity={0.5} />
          <Area
            type="monotone"
            dataKey="talkTime"
            name="Talk Time"
            stroke="#8b5cf6"
            strokeWidth={2}
            fill="url(#talkTimeGradient)"
            unit="%"
          />
        </AreaChart>
      </ResponsiveContainer>
      {/* Legend for ideal zone */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-green-500 opacity-50" />
          <span>Ideal Zone (45-55%)</span>
        </div>
      </div>
    </div>
  );
}

export function TeamTrendsChart({ period, className }: TeamTrendsChartProps) {
  const { data, isLoading, error } = useTeamTrends(period);

  if (isLoading) {
    return <TeamTrendsChartSkeleton />;
  }

  if (error || !data) {
    return (
      <div className={cn(
        'bg-white dark:bg-gray-900/40 rounded-2xl border border-red-200 dark:border-red-800/30 p-6',
        className
      )}>
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span>Failed to load trend data</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className={cn(
        'bg-white dark:bg-gray-900/40 rounded-2xl border border-gray-200 dark:border-gray-700/30 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-lg dark:shadow-black/10 flex flex-col',
        className
      )}
    >
      <div className="p-6 flex-1">
        <Tabs defaultValue="volume" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Performance Trends
            </h2>
            <TabsList className="bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg">
              <TabsTrigger
                value="volume"
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Volume
              </TabsTrigger>
              <TabsTrigger
                value="sentiment"
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm"
              >
                <Smile className="w-3.5 h-3.5" />
                Sentiment
              </TabsTrigger>
              <TabsTrigger
                value="talktime"
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm"
              >
                <Clock className="w-3.5 h-3.5" />
                Talk Time
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="volume" className="mt-0">
            <MeetingVolumeChart data={data.meetingVolume} />
          </TabsContent>

          <TabsContent value="sentiment" className="mt-0">
            <SentimentTrendChart data={data.sentimentTrend} />
          </TabsContent>

          <TabsContent value="talktime" className="mt-0">
            <TalkTimeChart data={data.talkTimeTrend} />
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}

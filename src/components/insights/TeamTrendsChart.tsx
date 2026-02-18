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
} from 'recharts';
import { format, parseISO, addDays } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Smile, Clock, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeamTrends, type TimePeriod } from '@/lib/hooks/useTeamAnalytics';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TeamTrendsChartProps {
  period: TimePeriod;
  className?: string;
}

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

/** Format a date string for the X axis based on the selected period */
function formatDateLabel(dateStr: string, period: TimePeriod): string {
  const d = parseISO(dateStr);
  if (period === 90) {
    // 3-day bucket: show range like "Feb 1-3"
    const end = addDays(d, 2);
    return `${format(d, 'MMM d')}-${format(end, 'd')}`;
  }
  return format(d, 'MMM d');
}

/** X-axis tick interval to avoid label crowding */
function getXAxisInterval(period: TimePeriod): number {
  if (period === 7) return 0; // show all 7 labels
  if (period === 30) return 4; // every 5th label (~6 visible)
  return 3; // 90-day: every 4th bucket (~8 visible)
}

// Meeting Volume Chart (Area chart)
function MeetingVolumeChart({ data, period }: { data: Array<{ date: string; count: number }>; period: TimePeriod }) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      dateFormatted: formatDateLabel(d.date, period),
    }));
  }, [data, period]);

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
            tick={{ fontSize: 11 }}
            className="text-gray-600 dark:text-gray-400"
            interval={getXAxisInterval(period)}
            angle={period === 7 ? 0 : -45}
            textAnchor={period === 7 ? 'middle' : 'end'}
            height={period === 7 ? 30 : 50}
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

// Sentiment Trend Chart — Y axis scaled to -10..+10
function SentimentTrendChart({ data, period }: { data: Array<{ date: string; avg: number | null }>; period: TimePeriod }) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      dateFormatted: formatDateLabel(d.date, period),
      sentiment: d.avg !== null ? d.avg * 10 : null,
    }));
  }, [data, period]);

  if (chartData.every((d) => d.sentiment === null)) {
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
            tick={{ fontSize: 11 }}
            className="text-gray-600 dark:text-gray-400"
            interval={getXAxisInterval(period)}
            angle={period === 7 ? 0 : -45}
            textAnchor={period === 7 ? 'middle' : 'end'}
            height={period === 7 ? 30 : 50}
          />
          <YAxis
            domain={[-10, 10]}
            ticks={[-10, -5, 0, 5, 10]}
            tick={{ fontSize: 12 }}
            className="text-gray-600 dark:text-gray-400"
            tickFormatter={(value) => value.toFixed(0)}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="sentiment"
            name="Sentiment"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#10b981' }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Talk Time Chart with ideal zone highlighting
function TalkTimeChart({ data, period }: { data: Array<{ date: string; avg: number | null }>; period: TimePeriod }) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      dateFormatted: formatDateLabel(d.date, period),
      talkTime: d.avg,
    }));
  }, [data, period]);

  if (chartData.every((d) => d.talkTime === null)) {
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
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis
            dataKey="dateFormatted"
            tick={{ fontSize: 11 }}
            className="text-gray-600 dark:text-gray-400"
            interval={getXAxisInterval(period)}
            angle={period === 7 ? 0 : -45}
            textAnchor={period === 7 ? 'middle' : 'end'}
            height={period === 7 ? 30 : 50}
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
            connectNulls={false}
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

/** Info icon with hover tooltip */
function TabInfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <UITooltip>
        <TooltipTrigger asChild>
          <Info className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px] text-xs">
          {text}
        </TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}

const TAB_CLASS =
  'flex items-center gap-2 text-xs px-3 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm';

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
        'bg-white dark:bg-gray-900/40 rounded-2xl border border-gray-200 dark:border-gray-700/30 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-lg dark:shadow-black/10',
        className
      )}
    >
      <div className="p-6">
        <Tabs defaultValue="volume" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Performance Trends
            </h2>
            <TabsList className="bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg">
              <TabsTrigger value="volume" className={TAB_CLASS}>
                <BarChart3 className="w-3.5 h-3.5" />
                Volume
                <TabInfoTooltip text="How many calls you're having." />
              </TabsTrigger>
              <TabsTrigger value="sentiment" className={TAB_CLASS}>
                <Smile className="w-3.5 h-3.5" />
                Sentiment
                <TabInfoTooltip text="How our AI is ranking your calls. 10 is great! -10 is not so great!" />
              </TabsTrigger>
              <TabsTrigger value="talktime" className={TAB_CLASS}>
                <Clock className="w-3.5 h-3.5" />
                Talk Time
                <TabInfoTooltip text="What percentage of the call are you talking vs listening." />
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="volume" className="mt-0">
            <MeetingVolumeChart data={data.meetingVolume} period={period} />
          </TabsContent>

          <TabsContent value="sentiment" className="mt-0">
            <SentimentTrendChart data={data.sentimentTrend} period={period} />
          </TabsContent>

          <TabsContent value="talktime" className="mt-0">
            <TalkTimeChart data={data.talkTimeTrend} period={period} />
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}

/**
 * InsightsTab - Cross-meeting insights with sales performance, sentiment, and patterns
 */

import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { Target, AlertCircle, CheckCircle2, Award, Heart, Trophy } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMaSalesPerformance } from '@/lib/hooks/useMeetingAnalytics';

// Custom tooltip with high-contrast background for both themes
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: 'rgba(255,255,255,0.97)', borderColor: 'rgba(229,231,235,0.6)' }} className="dark:!bg-gray-800 dark:!border-gray-600 backdrop-blur-xl border rounded-xl shadow-xl px-4 py-3 text-sm">
      {label && <p className="text-xs font-medium text-gray-500 dark:text-gray-300 mb-2">{label}</p>}
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2 py-0.5">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color || entry.payload?.fill || entry.fill }} />
          <span className="text-gray-600 dark:text-gray-300">{entry.name}:</span>
          <span className="text-gray-900 dark:text-white font-semibold">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

// Custom pie tooltip with high-contrast background
const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div style={{ backgroundColor: 'rgba(255,255,255,0.97)', borderColor: 'rgba(229,231,235,0.6)' }} className="dark:!bg-gray-800 dark:!border-gray-600 backdrop-blur-xl border rounded-xl shadow-xl px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.payload?.fill }} />
        <span className="text-gray-600 dark:text-gray-300">{entry.name}:</span>
        <span className="text-gray-900 dark:text-white font-semibold">{entry.value}</span>
      </div>
    </div>
  );
};

interface InsightsTabProps {
  timeRange?: string;
}

const GRADE_ORDER = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F'];

const GRADE_COLORS: Record<string, string> = {
  A: '#10b981', 'B+': '#10b981',
  B: '#f59e0b', 'C+': '#f59e0b',
  C: '#f97316', 'D+': '#f97316',
  D: '#ef4444', F: '#ef4444',
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#10b981',
  neutral: '#9ca3af',
  negative: '#ef4444',
  mixed: '#a855f7',
  unknown: '#6b7280',
};

function gradeBadgeClass(grade: string): string {
  if (['A', 'B+'].includes(grade)) return 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
  if (['B', 'C+'].includes(grade)) return 'bg-amber-100/80 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
  if (['C', 'D+'].includes(grade)) return 'bg-orange-100/80 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400';
  return 'bg-red-100/80 text-red-700 dark:bg-red-500/10 dark:text-red-400';
}

function sentimentBadgeClass(sentiment: string): string {
  if (sentiment === 'positive') return 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/30';
  if (sentiment === 'neutral') return 'bg-gray-100/80 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400 border-gray-200/50 dark:border-gray-700/30';
  if (sentiment === 'negative') return 'bg-red-100/80 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200/50 dark:border-red-500/30';
  if (sentiment === 'mixed') return 'bg-purple-100/80 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200/50 dark:border-purple-500/30';
  return 'bg-gray-100/80 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400 border-gray-200/50 dark:border-gray-700/30';
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

export function InsightsTab({ timeRange }: InsightsTabProps) {
  const { data, isLoading, error } = useMaSalesPerformance();

  const gradeDistribution = useMemo(() => {
    if (!data) return [];
    const counts: Record<string, number> = {};
    for (const item of data) {
      counts[item.grade] = (counts[item.grade] || 0) + 1;
    }
    return GRADE_ORDER.map((grade) => ({
      grade,
      count: counts[grade] || 0,
      fill: GRADE_COLORS[grade] || '#9ca3af',
    })).filter((d) => d.count > 0);
  }, [data]);

  const sentimentDistribution = useMemo(() => {
    if (!data) return [];
    const counts: Record<string, number> = {};
    for (const item of data) {
      const s = item.sentiment || 'unknown';
      counts[s] = (counts[s] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: SENTIMENT_COLORS[name] || '#9ca3af',
    }));
  }, [data]);

  const patterns = useMemo(() => {
    if (!data) return { strengths: [], improvements: [] };
    const sCounts: Record<string, number> = {};
    const iCounts: Record<string, number> = {};
    for (const item of data) {
      for (const s of item.strengths) {
        sCounts[s] = (sCounts[s] || 0) + 1;
      }
      for (const i of item.improvements) {
        iCounts[i] = (iCounts[i] || 0) + 1;
      }
    }
    const strengths = Object.entries(sCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([text, count]) => ({ text, count }));
    const improvements = Object.entries(iCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([text, count]) => ({ text, count }));
    return { strengths, improvements };
  }, [data]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error instanceof Error ? error.message : 'Failed to load insights'}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-[300px] w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Skeleton className="h-[300px] w-full rounded-2xl" />
          <Skeleton className="h-[300px] w-full rounded-2xl" />
        </div>
        <Skeleton className="h-[200px] w-full rounded-2xl" />
        <Skeleton className="h-[200px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 flex flex-col items-center justify-center py-20 px-6">
        <div className="p-4 bg-gray-100/80 dark:bg-gray-800/60 rounded-2xl border border-gray-200/50 dark:border-gray-700/30 mb-5">
          <Target className="h-12 w-12 text-gray-400 dark:text-gray-500" />
        </div>
        <p className="text-base font-semibold text-gray-900 dark:text-gray-100">No sales performance data available yet</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Upload meeting transcripts to see insights</p>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-4 sm:space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Charts Row - Grade Distribution + Sentiment Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Grade Distribution */}
        <motion.div
          variants={itemVariants}
          className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-5 sm:p-6 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-violet-600/10 dark:bg-violet-500/20 rounded-xl border border-violet-600/20 dark:border-violet-500/30">
              <Award className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Performance Grade Distribution</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">How meetings score across all grades</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={gradeDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
              <XAxis
                dataKey="grade"
                tick={{ fontSize: 12 }}
                className="text-gray-600 dark:text-gray-400"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12 }}
                className="text-gray-600 dark:text-gray-400"
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(156,163,175,0.1)', radius: 4 }} />
              <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                {gradeDistribution.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Sentiment Distribution */}
        <motion.div
          variants={itemVariants}
          className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-5 sm:p-6 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-emerald-600/10 dark:bg-emerald-500/20 rounded-xl border border-emerald-600/20 dark:border-emerald-500/30">
              <Heart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Overall Sentiment Distribution</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sentiment breakdown across all meetings</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={sentimentDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={78}
                  dataKey="value"
                  paddingAngle={3}
                  stroke="none"
                  label={false}
                  labelLine={false}
                  isAnimationActive={true}
                >
                  {sentimentDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-5 gap-y-2 justify-center">
              {sentimentDistribution.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full flex-shrink-0 ring-2 ring-white dark:ring-gray-900/60" style={{ backgroundColor: entry.fill }} />
                  <span className="font-medium text-gray-700 dark:text-gray-200">{entry.name}</span>
                  <span className="text-gray-400 dark:text-gray-500 font-medium">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Meeting Scoreboard */}
      <motion.div
        variants={itemVariants}
        className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-5 sm:p-6 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-amber-600/10 dark:bg-amber-500/20 rounded-xl border border-amber-600/20 dark:border-amber-500/30">
            <Trophy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Meeting Scoreboard</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Top 10 meetings ranked by performance score</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-800/30 text-left">
                <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Meeting</th>
                <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Score</th>
                <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Grade</th>
                <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Sentiment</th>
                <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center">Questions</th>
                <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center">Agreements</th>
                <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 10).map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors text-sm"
                >
                  <td className="py-3 pr-4 font-medium max-w-[200px] truncate text-gray-900 dark:text-gray-100">{item.title}</td>
                  <td className="py-3 pr-4 text-gray-700 dark:text-gray-300 font-medium">{item.score}</td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline" className={gradeBadgeClass(item.grade)}>{item.grade}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline" className={sentimentBadgeClass(item.sentiment)}>
                      {item.sentiment}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-center text-gray-600 dark:text-gray-300">{item.metrics.questionsAsked}</td>
                  <td className="py-3 pr-4 text-center text-gray-600 dark:text-gray-300">{item.metrics.agreements}</td>
                  <td className="py-3 text-center text-gray-600 dark:text-gray-300">{item.metrics.totalActionItems}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Common Patterns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Top Strengths */}
        <motion.div
          variants={itemVariants}
          className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-5 sm:p-6 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 border-l-4 border-l-emerald-500"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-emerald-600/10 dark:bg-emerald-500/20 rounded-xl border border-emerald-600/20 dark:border-emerald-500/30">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Top Strengths</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Recurring positives across meetings</p>
            </div>
          </div>
          {patterns.strengths.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No patterns detected yet</p>
          ) : (
            <ul className="space-y-2.5">
              {patterns.strengths.map((item) => (
                <li
                  key={item.text}
                  className="flex items-center justify-between text-sm py-2 px-3 rounded-xl hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  <span className="text-gray-700 dark:text-gray-300">{item.text}</span>
                  <span className="ml-3 flex-shrink-0 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-full px-2 py-0.5 text-xs font-medium">
                    {item.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </motion.div>

        {/* Areas for Improvement */}
        <motion.div
          variants={itemVariants}
          className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-5 sm:p-6 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 border-l-4 border-l-amber-500"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-amber-600/10 dark:bg-amber-500/20 rounded-xl border border-amber-600/20 dark:border-amber-500/30">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Areas for Improvement</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Recurring challenges to address</p>
            </div>
          </div>
          {patterns.improvements.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No patterns detected yet</p>
          ) : (
            <ul className="space-y-2.5">
              {patterns.improvements.map((item) => (
                <li
                  key={item.text}
                  className="flex items-center justify-between text-sm py-2 px-3 rounded-xl hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  <span className="text-gray-700 dark:text-gray-300">{item.text}</span>
                  <span className="ml-3 flex-shrink-0 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-full px-2 py-0.5 text-xs font-medium">
                    {item.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

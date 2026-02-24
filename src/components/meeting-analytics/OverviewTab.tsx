import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Video,
  CheckSquare,
  Target,
  AlertCircle,
  Users,
  Activity,
  Smile,
  Clock as ClockIcon,
  Flame,
} from 'lucide-react';
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
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMaDashboard, useMaAlerts, useMaTalkTime, useMaConversion, useMaSentimentTrends } from '@/lib/hooks/useMeetingAnalytics';

interface OverviewTabProps {
  timeRange: string;
}

function getGradeLetter(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function getGradeBadgeColor(grade: string): string {
  if (grade === 'A' || grade === 'B+') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
  if (grade === 'B' || grade === 'C+') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400';
  if (grade === 'C' || grade === 'D+') return 'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400';
  return 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400';
}

function getPipelineStatusBadge(status: 'hot' | 'warm' | 'cold') {
  switch (status) {
    case 'hot':
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">Hot</Badge>;
    case 'warm':
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">Warm</Badge>;
    case 'cold':
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20">Cold</Badge>;
  }
}

function getPipelineBorderColor(status: 'hot' | 'warm' | 'cold'): string {
  switch (status) {
    case 'hot': return 'border-l-red-500';
    case 'warm': return 'border-l-amber-500';
    case 'cold': return 'border-l-blue-500';
  }
}

function TrendBadge({ value }: { value: number }) {
  if (value > 0) {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
        <TrendingUp className="h-3 w-3 mr-1" />
        +{value.toFixed(1)}%
      </Badge>
    );
  }
  if (value < 0) {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
        <TrendingDown className="h-3 w-3 mr-1" />
        {value.toFixed(1)}%
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20">
      <Minus className="h-3 w-3 mr-1" />
      0%
    </Badge>
  );
}

function getSeverityIcon(severity: 'info' | 'warning' | 'critical') {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
    case 'warning':
      return <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
    case 'info':
      return <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />;
  }
}

function getSeverityGradient(severity: 'info' | 'warning' | 'critical'): string {
  switch (severity) {
    case 'critical':
      return 'bg-gradient-to-r from-red-500/10 via-red-600/5 to-transparent border-red-200/50 dark:border-red-500/20';
    case 'warning':
      return 'bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-transparent border-amber-200/50 dark:border-amber-500/20';
    case 'info':
      return 'bg-gradient-to-r from-blue-500/10 via-blue-600/5 to-transparent border-blue-200/50 dark:border-blue-500/20';
  }
}

// ------------------------------------------------------------------
// Loading skeleton
// ------------------------------------------------------------------

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-5 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
            <div className="flex items-center justify-between pb-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-9 rounded-xl" />
            </div>
            <Skeleton className="h-8 w-20 mb-2" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Trends row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
            <Skeleton className="h-5 w-36 mb-4" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ))}
      </div>

      {/* Top performers */}
      <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
        <Skeleton className="h-5 w-48 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      </div>

      {/* Pipeline health */}
      <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
        <Skeleton className="h-5 w-36 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
        <Skeleton className="h-5 w-28 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------

export function OverviewTab({ timeRange }: OverviewTabProps) {
  const { data: dashboard, isLoading, error } = useMaDashboard();
  const { data: alerts } = useMaAlerts();
  const { data: sentimentTrends } = useMaSentimentTrends({ days: 30 });
  const { data: talkTimeData } = useMaTalkTime({ limit: 20 });
  const { data: conversionData } = useMaConversion({ limit: 20 });

  if (isLoading) {
    return <OverviewSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load dashboard data: {error instanceof Error ? error.message : 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="p-5 bg-gray-100 dark:bg-gray-800/50 rounded-2xl mb-5">
          <Activity className="h-14 w-14 text-gray-400 dark:text-gray-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No data available</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Meeting analytics data will appear here once transcripts are processed.
        </p>
      </div>
    );
  }

  const { summary, trends, topPerformers, pipelineHealth } = dashboard;
  const dashboardAlerts = alerts ?? dashboard.alerts ?? [];

  const meetingVolumeData = [
    { name: 'Last Week', value: trends.meetingsLastWeek },
    { name: 'This Week', value: trends.meetingsThisWeek },
  ];

  const performanceTrendData = [
    { name: 'Last Week', value: trends.scoreLastWeek },
    { name: 'This Week', value: trends.scoreThisWeek },
  ];

  const GLASS_CARD = 'bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10';

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- */}
      {/* A) KPI Row                                                  */}
      {/* ---------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Meetings */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0 }}
          whileHover={{ y: -2 }}
          className={`${GLASS_CARD} p-5 sm:p-6`}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Total Meetings
            </p>
            <div className="p-2 bg-emerald-600/10 dark:bg-emerald-500/20 rounded-xl border border-emerald-600/20">
              <Video className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
            {summary.totalMeetings}
          </div>
          <p className="text-xs text-muted-foreground">Analyzed transcripts</p>
        </motion.div>

        {/* Avg Performance */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          whileHover={{ y: -2 }}
          className={`${GLASS_CARD} p-5 sm:p-6`}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Avg Performance
            </p>
            <div className="p-2 bg-violet-600/10 dark:bg-violet-500/20 rounded-xl border border-violet-600/20">
              <Target className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
            {summary.avgPerformanceScore}/100{' '}
            <span className="text-base font-semibold text-muted-foreground">
              ({getGradeLetter(summary.avgPerformanceScore)})
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Overall meeting quality</p>
        </motion.div>

        {/* Action Items */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          whileHover={{ y: -2 }}
          className={`${GLASS_CARD} p-5 sm:p-6`}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Action Items
            </p>
            <div className="p-2 bg-blue-600/10 dark:bg-blue-500/20 rounded-xl border border-blue-600/20">
              <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
            {summary.completedActionItems}/{summary.totalActionItems}
          </div>
          <p className="text-xs text-muted-foreground">Completed</p>
        </motion.div>

        {/* Talk Time Balance */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          whileHover={{ y: -2 }}
          className={`${GLASS_CARD} p-5 sm:p-6`}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Talk Time Balance
            </p>
            <div className="p-2 bg-amber-600/10 dark:bg-amber-500/20 rounded-xl border border-amber-600/20">
              <Users className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
            {summary.avgTalkTimeBalance}%
          </div>
          <p className="text-xs text-muted-foreground">Average balance across meetings</p>
        </motion.div>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* B) Trends Section                                           */}
      {/* ---------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Meeting Volume */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className={GLASS_CARD}
        >
          <div className="p-6 pb-2 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Meeting Volume</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {trends.meetingsThisWeek} this week vs {trends.meetingsLastWeek} last week
              </p>
            </div>
            <TrendBadge value={trends.meetingsTrend} />
          </div>
          <div className="p-6 pt-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={meetingVolumeData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200/50 dark:stroke-gray-700/30" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fill: 'currentColor' }} />
                  <YAxis className="text-xs" tick={{ fill: 'currentColor' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} wrapperStyle={TOOLTIP_WRAPPER_STYLE} cursor={{ fill: 'rgba(255, 255, 255, 0.06)' }} />
                  <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        {/* Performance Trend */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className={GLASS_CARD}
        >
          <div className="p-6 pb-2 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Performance Trend</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Score: {trends.scoreThisWeek} this week vs {trends.scoreLastWeek} last week
              </p>
            </div>
            <TrendBadge value={trends.scoreTrend} />
          </div>
          <div className="p-6 pt-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceTrendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200/50 dark:stroke-gray-700/30" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fill: 'currentColor' }} />
                  <YAxis className="text-xs" tick={{ fill: 'currentColor' }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} wrapperStyle={TOOLTIP_WRAPPER_STYLE} cursor={{ fill: 'rgba(255, 255, 255, 0.06)' }} />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* C) Top Performers                                           */}
      {/* ---------------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className={GLASS_CARD}
      >
        <div className="p-6 pb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Top Performing Meetings</h3>
        </div>
        <div className="px-6 pb-6">
          {topPerformers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No performer data available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/50">
                    <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Meeting</th>
                    <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Score</th>
                    <th className="text-left py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Grade</th>
                    <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {topPerformers.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-gray-100 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-3 pr-4 text-gray-900 dark:text-gray-100 font-medium">
                        {item.title || 'Untitled Meeting'}
                      </td>
                      <td className="py-3 pr-4 text-gray-900 dark:text-gray-100">{item.score}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className={getGradeBadgeColor(item.grade)}>
                          {item.grade}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      {/* ---------------------------------------------------------- */}
      {/* D) Pipeline Health                                          */}
      {/* ---------------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.35 }}
        className={GLASS_CARD}
      >
        <div className="p-6 pb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Pipeline Health</h3>
        </div>
        <div className="px-6 pb-6">
          {pipelineHealth.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No pipeline data available yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pipelineHealth.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`rounded-2xl border-l-4 border border-gray-200/50 dark:border-gray-700/30 p-4 bg-white/60 dark:bg-gray-800/20 hover:border-gray-300/50 dark:hover:border-gray-600/40 transition-all duration-300 ${getPipelineBorderColor(item.status)}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate pr-2">
                      {item.title || 'Untitled'}
                    </h4>
                    {getPipelineStatusBadge(item.status)}
                  </div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    {item.conversionScore}/100
                  </p>
                  <p className="text-xs text-muted-foreground">Conversion score</p>
                  {item.blockerCount > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <AlertCircle className="h-3 w-3" />
                      {item.blockerCount} blocker{item.blockerCount !== 1 ? 's' : ''}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* ---------------------------------------------------------- */}
      {/* E) Alerts                                                   */}
      {/* ---------------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className={GLASS_CARD}
      >
        <div className="p-6 pb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Active Alerts</h3>
        </div>
        <div className="px-6 pb-6">
          {dashboardAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No active alerts.</p>
          ) : (
            <div className="space-y-3">
              {dashboardAlerts.map((alert, index) => (
                <div
                  key={`${alert.type}-${alert.transcriptId ?? index}`}
                  className={`flex items-start gap-3 rounded-2xl border p-4 ${getSeverityGradient(alert.severity)}`}
                >
                  {getSeverityIcon(alert.severity)}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 dark:text-gray-100">{alert.message}</p>
                    {alert.transcriptTitle && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Related meeting: {alert.transcriptTitle}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      alert.severity === 'critical'
                        ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
                        : alert.severity === 'warning'
                          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                          : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
                    }
                  >
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* ---------------------------------------------------------- */}
      {/* F) Performance Trends (tabbed charts)                       */}
      {/* ---------------------------------------------------------- */}
      <PerformanceTrendsSection
        sentimentTimeline={sentimentTrends?.timeline}
        talkTimeData={talkTimeData}
        conversionData={conversionData}
      />
    </div>
  );
}

// ------------------------------------------------------------------
// Performance Trends Section (tabbed charts)
// ------------------------------------------------------------------

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  color: '#f1f5f9',
};

const TOOLTIP_WRAPPER_STYLE = {
  transition: 'opacity 0.15s ease',
};

const TAB_TRIGGER_CLASS =
  'flex items-center gap-2 text-xs px-3 py-1.5 rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm';

interface PerformanceTrendsSectionProps {
  sentimentTimeline?: Array<{
    transcriptId: string;
    title: string;
    date: string;
    sentiment: string;
    positiveScore: number | null;
    negativeScore: number | null;
    neutralScore: number | null;
  }>;
  talkTimeData?: Array<{
    id: string;
    title: string;
    topSpeakerPercentage: number;
  }>;
  conversionData?: Array<{
    id: string;
    title: string;
    conversionScore: number;
    status: 'hot' | 'warm' | 'cold';
  }>;
}

function PerformanceTrendsSection({
  sentimentTimeline,
  talkTimeData,
  conversionData,
}: PerformanceTrendsSectionProps) {
  const hasSentiment = sentimentTimeline && sentimentTimeline.length > 0;
  const hasTalkTime = talkTimeData && talkTimeData.length > 0;
  const hasConversion = conversionData && conversionData.length > 0;

  const sentimentChartData = useMemo(() => {
    if (!sentimentTimeline) return [];
    return sentimentTimeline
      .filter((d) => d.positiveScore !== null)
      .map((d) => ({
        ...d,
        dateFormatted: format(parseISO(d.date), 'MMM d'),
      }));
  }, [sentimentTimeline]);

  const talkTimeChartData = useMemo(() => {
    if (!talkTimeData) return [];
    return talkTimeData.map((d) => ({
      ...d,
      label: d.title.length > 15 ? d.title.slice(0, 15) + '...' : d.title,
    }));
  }, [talkTimeData]);

  const conversionChartData = useMemo(() => {
    if (!conversionData) return [];
    return conversionData.map((d) => ({
      ...d,
      label: d.title.length > 15 ? d.title.slice(0, 15) + '...' : d.title,
    }));
  }, [conversionData]);

  if (!hasSentiment && !hasTalkTime && !hasConversion) {
    return null;
  }

  const defaultTab = hasSentiment ? 'sentiment' : hasTalkTime ? 'talktime' : 'conversion';
  const BAR_COLORS: Record<string, string> = { hot: '#ef4444', warm: '#f59e0b', cold: '#3b82f6' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.45 }}
      className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10"
    >
      <div className="p-6">
        <Tabs defaultValue={defaultTab} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Performance Trends</h3>
            <TabsList className="bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg">
              {hasSentiment && (
                <TabsTrigger value="sentiment" className={TAB_TRIGGER_CLASS}>
                  <Smile className="w-3.5 h-3.5" />
                  Sentiment
                </TabsTrigger>
              )}
              {hasTalkTime && (
                <TabsTrigger value="talktime" className={TAB_TRIGGER_CLASS}>
                  <ClockIcon className="w-3.5 h-3.5" />
                  Talk Time
                </TabsTrigger>
              )}
              {hasConversion && (
                <TabsTrigger value="conversion" className={TAB_TRIGGER_CLASS}>
                  <Flame className="w-3.5 h-3.5" />
                  Conversion
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Tab 1: Sentiment (LineChart) */}
          {hasSentiment && (
            <TabsContent value="sentiment" className="mt-0">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sentimentChartData}>
                    <defs>
                      <linearGradient id="sentimentOverviewGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200/50 dark:stroke-gray-700/30" />
                    <XAxis
                      dataKey="dateFormatted"
                      tick={{ fontSize: 12 }}
                      className="text-gray-600 dark:text-gray-400"
                    />
                    <YAxis
                      domain={[0, 1]}
                      tick={{ fontSize: 12 }}
                      className="text-gray-600 dark:text-gray-400"
                      tickFormatter={(v) => v.toFixed(1)}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      wrapperStyle={TOOLTIP_WRAPPER_STYLE}
                      cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }}
                      formatter={(value: number) => [value.toFixed(2), 'Positive Score']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <ReferenceLine y={0.5} stroke="#6b7280" strokeDasharray="3 3" />
                    <Line
                      type="monotone"
                      dataKey="positiveScore"
                      name="Positive Score"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#10b981' }}
                      fill="url(#sentimentOverviewGradient)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          )}

          {/* Tab 2: Talk Time (AreaChart) */}
          {hasTalkTime && (
            <TabsContent value="talktime" className="mt-0">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={talkTimeChartData}>
                    <defs>
                      <linearGradient id="talkTimeOverviewGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200/50 dark:stroke-gray-700/30" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      className="text-gray-600 dark:text-gray-400"
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 12 }}
                      className="text-gray-600 dark:text-gray-400"
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      wrapperStyle={TOOLTIP_WRAPPER_STYLE}
                      cursor={{ fill: 'rgba(255, 255, 255, 0.06)' }}
                      formatter={(value: number) => [`${value.toFixed(1)}%`, 'Top Speaker %']}
                    />
                    <ReferenceLine y={45} stroke="#22c55e" strokeDasharray="3 3" opacity={0.5} />
                    <ReferenceLine y={55} stroke="#22c55e" strokeDasharray="3 3" opacity={0.5} />
                    <Area
                      type="monotone"
                      dataKey="topSpeakerPercentage"
                      name="Top Speaker %"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      fill="url(#talkTimeOverviewGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-green-500 opacity-50" />
                  <span>Ideal Zone (45-55%)</span>
                </div>
              </div>
            </TabsContent>
          )}

          {/* Tab 3: Conversion (BarChart) */}
          {hasConversion && (
            <TabsContent value="conversion" className="mt-0">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={conversionChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200/50 dark:stroke-gray-700/30" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      className="text-gray-600 dark:text-gray-400"
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 12 }}
                      className="text-gray-600 dark:text-gray-400"
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      wrapperStyle={TOOLTIP_WRAPPER_STYLE}
                      cursor={{ fill: 'rgba(255, 255, 255, 0.06)' }}
                      formatter={(value: number) => [value, 'Conversion Score']}
                    />
                    <Bar dataKey="conversionScore" name="Conversion Score" radius={[4, 4, 0, 0]}>
                      {conversionChartData.map((entry) => (
                        <Cell key={entry.id} fill={BAR_COLORS[entry.status] ?? '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span>Hot</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Warm</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Cold</span>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </motion.div>
  );
}

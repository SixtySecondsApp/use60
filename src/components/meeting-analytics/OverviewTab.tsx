import { useMemo } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

// ------------------------------------------------------------------
// Loading skeleton
// ------------------------------------------------------------------

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trends row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top performers */}
      <Card className="mt-6">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline health */}
      <Card className="mt-6">
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Alerts */}
      <Card className="mt-6">
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
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
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Activity className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">No data available</h3>
        <p className="text-sm text-muted-foreground">
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

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- */}
      {/* A) KPI Row                                                  */}
      {/* ---------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Meetings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Meetings</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalMeetings}</div>
            <p className="text-xs text-muted-foreground">Analyzed transcripts</p>
          </CardContent>
        </Card>

        {/* Avg Performance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Performance</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.avgPerformanceScore}/100{' '}
              <span className="text-base font-semibold text-muted-foreground">
                ({getGradeLetter(summary.avgPerformanceScore)})
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Overall meeting quality</p>
          </CardContent>
        </Card>

        {/* Action Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Action Items</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.completedActionItems}/{summary.totalActionItems}
            </div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>

        {/* Talk Time Balance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Talk Time Balance</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.avgTalkTimeBalance}%</div>
            <p className="text-xs text-muted-foreground">Average balance across meetings</p>
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* B) Trends Section                                           */}
      {/* ---------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        {/* Meeting Volume */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Meeting Volume</CardTitle>
              <CardDescription>
                {trends.meetingsThisWeek} meetings this week vs {trends.meetingsLastWeek} last week
              </CardDescription>
            </div>
            <TrendBadge value={trends.meetingsTrend} />
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={meetingVolumeData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700/50" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fill: 'currentColor' }} />
                  <YAxis className="text-xs" tick={{ fill: 'currentColor' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--tooltip-bg, #fff)',
                      borderColor: 'var(--tooltip-border, #e2e8f0)',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Performance Trend */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Performance Trend</CardTitle>
              <CardDescription>
                Score: {trends.scoreThisWeek} this week vs {trends.scoreLastWeek} last week
              </CardDescription>
            </div>
            <TrendBadge value={trends.scoreTrend} />
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceTrendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700/50" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fill: 'currentColor' }} />
                  <YAxis className="text-xs" tick={{ fill: 'currentColor' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--tooltip-bg, #fff)',
                      borderColor: 'var(--tooltip-border, #e2e8f0)',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* C) Top Performers                                           */}
      {/* ---------------------------------------------------------- */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Top Performing Meetings</CardTitle>
        </CardHeader>
        <CardContent>
          {topPerformers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No performer data available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/50">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Meeting</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Score</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Grade</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {topPerformers.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800/50 last:border-0">
                      <td className="py-2.5 pr-4 text-gray-900 dark:text-gray-100 font-medium">
                        {item.title || 'Untitled Meeting'}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-900 dark:text-gray-100">{item.score}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className={getGradeBadgeColor(item.grade)}>
                          {item.grade}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- */}
      {/* D) Pipeline Health                                          */}
      {/* ---------------------------------------------------------- */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Pipeline Health</CardTitle>
        </CardHeader>
        <CardContent>
          {pipelineHealth.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No pipeline data available yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pipelineHealth.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-gray-200 dark:border-gray-700/50 p-4"
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- */}
      {/* E) Alerts                                                   */}
      {/* ---------------------------------------------------------- */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Active Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboardAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No active alerts.</p>
          ) : (
            <div className="space-y-3">
              {dashboardAlerts.map((alert, index) => (
                <div
                  key={`${alert.type}-${alert.transcriptId ?? index}`}
                  className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700/50 p-3"
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
        </CardContent>
      </Card>

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
  backgroundColor: 'hsl(var(--card))',
  borderColor: 'hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--card-foreground))',
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
    <Card className="mt-6">
      <div className="p-6">
        <Tabs defaultValue={defaultTab} className="space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Performance Trends</CardTitle>
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
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sentimentChartData}>
                    <defs>
                      <linearGradient id="sentimentOverviewGradient" x1="0" y1="0" x2="0" y2="1">
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
                      domain={[0, 1]}
                      tick={{ fontSize: 12 }}
                      className="text-gray-600 dark:text-gray-400"
                      tickFormatter={(v) => v.toFixed(1)}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
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
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={talkTimeChartData}>
                    <defs>
                      <linearGradient id="talkTimeOverviewGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
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
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={conversionChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
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
    </Card>
  );
}

/**
 * InsightsTab - Cross-meeting insights with sales performance, sentiment, and patterns
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { Target, AlertCircle, CheckCircle2, Star } from 'lucide-react';
import { useMaSalesPerformance } from '@/lib/hooks/useMeetingAnalytics';

interface InsightsTabProps {
  timeRange: string;
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
  neutral: '#f59e0b',
  negative: '#ef4444',
  mixed: '#6366f1',
  unknown: '#9ca3af',
};

function gradeBadgeClass(grade: string): string {
  if (['A', 'B+'].includes(grade)) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
  if (['B', 'C+'].includes(grade)) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  if (['C', 'D+'].includes(grade)) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
  return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
}

function sentimentBadgeClass(sentiment: string): string {
  if (sentiment === 'positive') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
  if (sentiment === 'neutral') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  if (sentiment === 'negative') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  if (sentiment === 'mixed') return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

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
      <div className="space-y-6">
        <Skeleton className="h-[300px] w-full rounded-lg" />
        <Skeleton className="h-[300px] w-full rounded-lg" />
        <Skeleton className="h-[200px] w-full rounded-lg" />
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Target className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-medium">No sales performance data available yet</p>
        <p className="text-sm mt-1">Upload meeting transcripts to see insights</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Grade Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance Grade Distribution</CardTitle>
          <CardDescription>How meetings score across all grades</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={gradeDistribution}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="grade" className="text-xs" />
              <YAxis allowDecimals={false} className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))',
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {gradeDistribution.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Sentiment Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall Sentiment Distribution</CardTitle>
          <CardDescription>Sentiment breakdown across all meetings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={sentimentDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {sentimentDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 justify-center">
              {sentimentDistribution.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2 text-sm">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.fill }} />
                  <span>{entry.name}: {entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Meeting Scoreboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meeting Scoreboard</CardTitle>
          <CardDescription>Top 10 meetings ranked by performance score</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="pb-3 font-medium">Meeting</th>
                  <th className="pb-3 font-medium">Score</th>
                  <th className="pb-3 font-medium">Grade</th>
                  <th className="pb-3 font-medium">Sentiment</th>
                  <th className="pb-3 font-medium text-center">Questions</th>
                  <th className="pb-3 font-medium text-center">Agreements</th>
                  <th className="pb-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.slice(0, 10).map((item) => (
                  <tr key={item.id} className="text-sm">
                    <td className="py-3 pr-4 font-medium max-w-[200px] truncate">{item.title}</td>
                    <td className="py-3 pr-4">{item.score}</td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className={gradeBadgeClass(item.grade)}>{item.grade}</Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className={sentimentBadgeClass(item.sentiment)}>
                        {item.sentiment}
                      </Badge>
                    </td>
                    <td className="py-3 text-center">{item.metrics.questionsAsked}</td>
                    <td className="py-3 text-center">{item.metrics.agreements}</td>
                    <td className="py-3 text-center">{item.metrics.totalActionItems}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Common Patterns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Common Patterns</CardTitle>
          <CardDescription>Recurring strengths and areas for improvement</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Top Strengths
              </h4>
              {patterns.strengths.length === 0 ? (
                <p className="text-sm text-muted-foreground">No patterns detected yet</p>
              ) : (
                <ul className="space-y-2">
                  {patterns.strengths.map((item) => (
                    <li key={item.text} className="flex items-center justify-between text-sm">
                      <span>{item.text}</span>
                      <Badge variant="secondary" className="ml-2">{item.count}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Areas for Improvement
              </h4>
              {patterns.improvements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No patterns detected yet</p>
              ) : (
                <ul className="space-y-2">
                  {patterns.improvements.map((item) => (
                    <li key={item.text} className="flex items-center justify-between text-sm">
                      <span>{item.text}</span>
                      <Badge variant="secondary" className="ml-2">{item.count}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

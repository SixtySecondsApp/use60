/**
 * OrchestratorDashboard - Observability dashboard for proactive agent event orchestration
 *
 * Displays metrics from sequence_jobs table including:
 * - Total sequences run, success rate, avg duration
 * - Breakdown by source (webhook, cron, manual)
 * - Status distribution (completed, failed, waiting_approval)
 * - Daily activity trends
 * - Stuck jobs alert
 * - Top skills executed
 * - Error summary
 *
 * Access: Platform Admins only
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  Zap,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrg } from '@/lib/contexts/OrgContext';
import { toast } from 'sonner';

interface OrchestratorMetrics {
  total_sequences: number;
  sequences_by_source: Record<string, number>;
  sequences_by_status: Record<string, number>;
  avg_duration_ms: number;
  success_rate: number;
  stuck_jobs: Array<{
    id: string;
    event_source: string;
    user_id: string;
    status: string;
    current_step: number;
    current_skill_key: string | null;
    started_at: string;
    updated_at: string;
    hours_stuck: number;
  }>;
  daily_counts: Array<{
    date: string;
    count: number;
    completed: number;
    failed: number;
  }>;
  top_skills: Array<{
    skill_key: string;
    count: number;
  }>;
  error_summary: Array<{
    error_message: string;
    count: number;
    error_step: number | null;
  }>;
}

function useOrchestratorMetrics(orgId: string | null, days: number) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  return useQuery({
    queryKey: ['orchestrator-metrics', orgId, days],
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');

      const { data, error } = await (supabase as any).rpc('get_orchestrator_metrics', {
        p_org_id: orgId,
        p_start_date: startDate,
        p_end_date: new Date().toISOString(),
      });

      if (error) throw error;
      return data as OrchestratorMetrics;
    },
    enabled: !!orgId,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });
}

export default function OrchestratorDashboard() {
  const { activeOrgId } = useOrg();
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(7);

  const { data: metrics, isLoading, refetch, isRefetching } = useOrchestratorMetrics(activeOrgId, timeRange);

  const handleRefresh = () => {
    refetch();
    toast.success('Refreshing metrics...');
  };

  // Calculate success rate color
  const getSuccessRateColor = (rate: number | undefined) => {
    if (!rate) return 'text-gray-500';
    if (rate >= 90) return 'text-green-600 dark:text-green-400';
    if (rate >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  // Format duration as seconds
  const formatDuration = (ms: number | undefined) => {
    if (!ms) return '0.0s';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
              <Activity className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Orchestrator Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Real-time observability for proactive agent event sequences
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefetching}
            className="flex items-center gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', isRefetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* Time Range Selector */}
        <Tabs value={timeRange.toString()} onValueChange={(v) => setTimeRange(Number(v) as 7 | 30 | 90)} className="mb-6">
          <TabsList>
            <TabsTrigger value="7">Last 7 days</TabsTrigger>
            <TabsTrigger value="30">Last 30 days</TabsTrigger>
            <TabsTrigger value="90">Last 90 days</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Sequences</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {isLoading ? (
                      <span className="inline-block w-16 h-7 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
                    ) : (
                      metrics?.total_sequences || 0
                    )}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-blue-500/10">
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Success Rate</p>
                  <p className={cn('text-2xl font-bold mt-1', getSuccessRateColor(metrics?.success_rate))}>
                    {isLoading ? (
                      <span className="inline-block w-16 h-7 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
                    ) : (
                      `${metrics?.success_rate || 0}%`
                    )}
                  </p>
                </div>
                <div className={cn(
                  'p-3 rounded-xl',
                  (metrics?.success_rate || 0) >= 90 ? 'bg-green-500/10' :
                  (metrics?.success_rate || 0) >= 70 ? 'bg-yellow-500/10' : 'bg-red-500/10'
                )}>
                  <CheckCircle className={cn(
                    'w-5 h-5',
                    (metrics?.success_rate || 0) >= 90 ? 'text-green-500' :
                    (metrics?.success_rate || 0) >= 70 ? 'text-yellow-500' : 'text-red-500'
                  )} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Avg Duration</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {isLoading ? (
                      <span className="inline-block w-16 h-7 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
                    ) : (
                      formatDuration(metrics?.avg_duration_ms)
                    )}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-indigo-500/10">
                  <Clock className="w-5 h-5 text-indigo-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Stuck Jobs</p>
                  <p className={cn(
                    'text-2xl font-bold mt-1',
                    (metrics?.stuck_jobs?.length || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'
                  )}>
                    {isLoading ? (
                      <span className="inline-block w-16 h-7 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
                    ) : (
                      metrics?.stuck_jobs?.length || 0
                    )}
                  </p>
                </div>
                <div className={cn(
                  'p-3 rounded-xl',
                  (metrics?.stuck_jobs?.length || 0) > 0 ? 'bg-amber-500/10' : 'bg-gray-500/10'
                )}>
                  <AlertTriangle className={cn(
                    'w-5 h-5',
                    (metrics?.stuck_jobs?.length || 0) > 0 ? 'text-amber-500' : 'text-gray-500'
                  )} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Sequences by Source */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-purple-500" />
                Sequences by Source
              </CardTitle>
              <CardDescription>Event trigger breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(metrics?.sequences_by_source || {}).map(([source, count]) => (
                    <div key={source} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {source}
                        </Badge>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {count}
                      </span>
                    </div>
                  ))}
                  {Object.keys(metrics?.sequences_by_source || {}).length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      No sequences in this time range
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sequences by Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                Sequences by Status
              </CardTitle>
              <CardDescription>Completion status breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(metrics?.sequences_by_status || {}).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            status === 'completed' && 'border-green-300 text-green-600 dark:border-green-500 dark:text-green-400',
                            status === 'failed' && 'border-red-300 text-red-600 dark:border-red-500 dark:text-red-400',
                            status === 'waiting_approval' && 'border-amber-300 text-amber-600 dark:border-amber-500 dark:text-amber-400',
                            status === 'running' && 'border-blue-300 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                          )}
                        >
                          {status === 'waiting_approval' ? 'waiting approval' : status}
                        </Badge>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {count}
                      </span>
                    </div>
                  ))}
                  {Object.keys(metrics?.sequences_by_status || {}).length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      No sequences in this time range
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Daily Activity */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              Daily Activity
            </CardTitle>
            <CardDescription>Sequence execution trends over time</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-6 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {(metrics?.daily_counts || []).map((day) => (
                  <div key={day.date} className="flex items-center gap-4 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <div className="w-24 text-sm text-gray-600 dark:text-gray-400">
                      {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${(day.count / (metrics?.total_sequences || 1)) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-sm font-semibold text-gray-900 dark:text-white text-right">
                        {day.count}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle className="w-3 h-3" />
                        {day.completed}
                      </span>
                      {day.failed > 0 && (
                        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                          <XCircle className="w-3 h-3" />
                          {day.failed}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {(metrics?.daily_counts || []).length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    No daily activity in this time range
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stuck Jobs Alert */}
        {(metrics?.stuck_jobs?.length || 0) > 0 && (
          <Card className="mb-6 border-amber-200 dark:border-amber-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5" />
                Stuck Jobs ({metrics?.stuck_jobs?.length})
              </CardTitle>
              <CardDescription>Jobs waiting for approval longer than 24 hours</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {metrics?.stuck_jobs?.map((job) => (
                  <div key={job.id} className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg border border-amber-200 dark:border-amber-500/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-amber-300 text-amber-600 dark:border-amber-500 dark:text-amber-400">
                          {job.event_source}
                        </Badge>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Step {job.current_step}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400">
                        {job.hours_stuck}h stuck
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      {job.current_skill_key || 'Unknown skill'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Started: {new Date(job.started_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Skills */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-purple-500" />
                Top Skills Executed
              </CardTitle>
              <CardDescription>Most frequently executed skills</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-6 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {(metrics?.top_skills || []).map((skill, index) => (
                    <div key={skill.skill_key} className="flex items-center gap-3">
                      <span className="w-6 text-sm font-semibold text-gray-400">
                        {index + 1}.
                      </span>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {skill.skill_key}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {skill.count}
                      </Badge>
                    </div>
                  ))}
                  {(metrics?.top_skills || []).length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      No skill execution data
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Error Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                Error Summary
              </CardTitle>
              <CardDescription>Most common failure reasons</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-6 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {(metrics?.error_summary || []).map((error, index) => (
                    <div key={index} className="p-2 bg-red-50 dark:bg-red-500/10 rounded border border-red-200 dark:border-red-500/30">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                          {error.error_message}
                        </div>
                        <Badge variant="outline" className="text-xs border-red-300 text-red-600 dark:border-red-500 dark:text-red-400 shrink-0">
                          {error.count}x
                        </Badge>
                      </div>
                      {error.error_step !== null && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Step {error.error_step}
                        </div>
                      )}
                    </div>
                  ))}
                  {(metrics?.error_summary || []).length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      No errors in this time range
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * BrainHealthDashboard — Operational health overview for the 60 Brain
 *
 * Admin-only dashboard showing:
 * - Cron job status (from agent_schedule_runs)
 * - Trigger rate + error rate (from agent_trigger_runs)
 * - Slack delivery success rate (from slack_delivery_log)
 * - DLQ depth (from fleet_dead_letter_queue)
 *
 * Auto-refreshes every 30 seconds via React Query.
 *
 * US-033: Brain health dashboard on Agent Demo page
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  MessageSquare,
  Loader2,
  XCircle,
  Inbox,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

interface CronJobHealth {
  agentName: string;
  lastRunAt: string | null;
  status: string;
  successCount: number;
  failureCount: number;
  totalRuns: number;
}

interface TriggerHealth {
  totalTriggers24h: number;
  successfulTriggers: number;
  failedTriggers: number;
  eventsPerHour: number;
}

interface SlackHealth {
  totalMessages24h: number;
  successCount: number;
  failureCount: number;
  blockedCount: number;
}

interface DlqHealth {
  pendingCount: number;
  failedCount: number;
  totalDepth: number;
}

interface BrainHealthData {
  cronJobs: CronJobHealth[];
  triggers: TriggerHealth;
  slack: SlackHealth;
  dlq: DlqHealth;
}

// =============================================================================
// Health Status Helpers
// =============================================================================

type HealthLevel = 'healthy' | 'warning' | 'critical';

function getHealthLevel(successRate: number): HealthLevel {
  if (successRate >= 95) return 'healthy';
  if (successRate >= 80) return 'warning';
  return 'critical';
}

function getHealthColor(level: HealthLevel): string {
  switch (level) {
    case 'healthy':
      return 'bg-green-500';
    case 'warning':
      return 'bg-yellow-500';
    case 'critical':
      return 'bg-red-500';
  }
}

function getHealthTextColor(level: HealthLevel): string {
  switch (level) {
    case 'healthy':
      return 'text-green-600 dark:text-green-400';
    case 'warning':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'critical':
      return 'text-red-600 dark:text-red-400';
  }
}

function getHealthBgColor(level: HealthLevel): string {
  switch (level) {
    case 'healthy':
      return 'bg-green-50 dark:bg-green-950/30';
    case 'warning':
      return 'bg-yellow-50 dark:bg-yellow-950/30';
    case 'critical':
      return 'bg-red-50 dark:bg-red-950/30';
  }
}

function getHealthBorderColor(level: HealthLevel): string {
  switch (level) {
    case 'healthy':
      return 'border-green-200 dark:border-green-800/50';
    case 'warning':
      return 'border-yellow-200 dark:border-yellow-800/50';
    case 'critical':
      return 'border-red-200 dark:border-red-800/50';
  }
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function computeSuccessRate(success: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((success / total) * 100);
}

// =============================================================================
// Data Fetching
// =============================================================================

async function fetchBrainHealth(): Promise<BrainHealthData> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Parallel queries for all health data
  const [cronRunsResult, triggerRunsResult, slackLogsResult, dlqResult] = await Promise.all([
    // Cron jobs: recent runs grouped by agent
    supabase
      .from('agent_schedule_runs')
      .select('agent_name, status, created_at')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false }),

    // Trigger runs: all in last 24h
    supabase
      .from('agent_trigger_runs')
      .select('success, created_at')
      .gte('created_at', twentyFourHoursAgo),

    // Slack delivery logs
    supabase
      .from('slack_delivery_log')
      .select('success, blocked_reason, created_at')
      .gte('created_at', twentyFourHoursAgo),

    // DLQ depth (pending + failed items)
    supabase
      .from('fleet_dead_letter_queue')
      .select('status')
      .in('status', ['pending', 'failed']),
  ]);

  // Process cron jobs — group by agent name
  const cronMap = new Map<string, CronJobHealth>();
  for (const run of cronRunsResult.data ?? []) {
    const existing = cronMap.get(run.agent_name);
    if (!existing) {
      cronMap.set(run.agent_name, {
        agentName: run.agent_name,
        lastRunAt: run.created_at,
        status: run.status,
        successCount: run.status === 'success' ? 1 : 0,
        failureCount: run.status === 'failed' ? 1 : 0,
        totalRuns: 1,
      });
    } else {
      existing.totalRuns += 1;
      if (run.status === 'success') existing.successCount += 1;
      if (run.status === 'failed') existing.failureCount += 1;
    }
  }

  // Process triggers
  const triggerRuns = triggerRunsResult.data ?? [];
  const successfulTriggers = triggerRuns.filter((r) => r.success).length;
  const failedTriggers = triggerRuns.filter((r) => !r.success).length;

  // Process Slack
  const slackLogs = slackLogsResult.data ?? [];
  const slackSuccess = slackLogs.filter((l) => l.success).length;
  const slackFailed = slackLogs.filter((l) => !l.success && !l.blocked_reason).length;
  const slackBlocked = slackLogs.filter((l) => !!l.blocked_reason).length;

  // Process DLQ
  const dlqItems = dlqResult.data ?? [];
  const dlqPending = dlqItems.filter((d) => d.status === 'pending').length;
  const dlqFailed = dlqItems.filter((d) => d.status === 'failed').length;

  return {
    cronJobs: Array.from(cronMap.values()).sort((a, b) => {
      // Sort by most recent run
      const aTime = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
      const bTime = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
      return bTime - aTime;
    }),
    triggers: {
      totalTriggers24h: triggerRuns.length,
      successfulTriggers,
      failedTriggers,
      eventsPerHour: triggerRuns.length > 0 ? Math.round((triggerRuns.length / 24) * 10) / 10 : 0,
    },
    slack: {
      totalMessages24h: slackLogs.length,
      successCount: slackSuccess,
      failureCount: slackFailed,
      blockedCount: slackBlocked,
    },
    dlq: {
      pendingCount: dlqPending,
      failedCount: dlqFailed,
      totalDepth: dlqItems.length,
    },
  };
}

// =============================================================================
// Sub-components
// =============================================================================

function CronJobsCard({ jobs }: { jobs: CronJobHealth[] }) {
  if (jobs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Cron Jobs
          </CardTitle>
          <CardDescription>Scheduled agent executions (24h)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Clock className="h-8 w-8 mb-2" />
            <p className="text-sm">No scheduled runs in the last 24 hours</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Cron Jobs
        </CardTitle>
        <CardDescription>Scheduled agent executions (24h)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {jobs.map((job) => {
            const successRate = computeSuccessRate(job.successCount, job.totalRuns);
            const health = getHealthLevel(successRate);

            return (
              <div
                key={job.agentName}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800"
              >
                <div className="flex items-center gap-3">
                  <div className={cn('h-2.5 w-2.5 rounded-full', getHealthColor(health))} />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {job.agentName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Last run: {formatRelativeTime(job.lastRunAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={health === 'healthy' ? 'default' : health === 'warning' ? 'secondary' : 'destructive'}
                    className="text-xs"
                  >
                    {successRate}% ({job.totalRuns} runs)
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TriggerRateCard({ triggers }: { triggers: TriggerHealth }) {
  const successRate = computeSuccessRate(triggers.successfulTriggers, triggers.totalTriggers24h);
  const health = getHealthLevel(successRate);

  return (
    <Card className={cn('border', getHealthBorderColor(health))}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn('p-2 rounded-lg', getHealthBgColor(health))}>
            <Zap className={cn('h-5 w-5', getHealthTextColor(health))} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Trigger Rate (24h)</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {triggers.totalTriggers24h}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {triggers.eventsPerHour}
            </p>
            <p className="text-xs text-gray-500">per hour</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              {triggers.successfulTriggers}
            </p>
            <p className="text-xs text-gray-500">success</p>
          </div>
          <div>
            <p className={cn(
              'text-lg font-semibold',
              triggers.failedTriggers > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-900 dark:text-white',
            )}>
              {triggers.failedTriggers}
            </p>
            <p className="text-xs text-gray-500">failed</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorRateCard({ triggers }: { triggers: TriggerHealth }) {
  const errorRate = triggers.totalTriggers24h > 0
    ? Math.round((triggers.failedTriggers / triggers.totalTriggers24h) * 100)
    : 0;
  // Invert: high error rate = critical, low = healthy
  const health: HealthLevel = errorRate <= 5 ? 'healthy' : errorRate <= 20 ? 'warning' : 'critical';

  return (
    <Card className={cn('border', getHealthBorderColor(health))}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn('p-2 rounded-lg', getHealthBgColor(health))}>
            <AlertTriangle className={cn('h-5 w-5', getHealthTextColor(health))} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Error Rate (24h)</p>
            <p className={cn('text-2xl font-bold', getHealthTextColor(health))}>
              {errorRate}%
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {health === 'healthy' ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>All systems operating normally</span>
            </>
          ) : health === 'warning' ? (
            <>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span>{triggers.failedTriggers} failures detected</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-red-500" />
              <span>{triggers.failedTriggers} failures — investigation needed</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SlackDeliveryCard({ slack }: { slack: SlackHealth }) {
  const successRate = computeSuccessRate(slack.successCount, slack.totalMessages24h);
  const health = getHealthLevel(successRate);

  return (
    <Card className={cn('border', getHealthBorderColor(health))}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn('p-2 rounded-lg', getHealthBgColor(health))}>
            <MessageSquare className={cn('h-5 w-5', getHealthTextColor(health))} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Slack Delivery (24h)</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {successRate}%
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              {slack.successCount}
            </p>
            <p className="text-xs text-gray-500">delivered</p>
          </div>
          <div>
            <p className={cn(
              'text-lg font-semibold',
              slack.failureCount > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-900 dark:text-white',
            )}>
              {slack.failureCount}
            </p>
            <p className="text-xs text-gray-500">failed</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-yellow-600 dark:text-yellow-400">
              {slack.blockedCount}
            </p>
            <p className="text-xs text-gray-500">blocked</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DlqDepthCard({ dlq }: { dlq: DlqHealth }) {
  const health: HealthLevel = dlq.totalDepth === 0
    ? 'healthy'
    : dlq.totalDepth <= 5
      ? 'warning'
      : 'critical';

  return (
    <Card className={cn('border', getHealthBorderColor(health))}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn('p-2 rounded-lg', getHealthBgColor(health))}>
            <Inbox className={cn('h-5 w-5', getHealthTextColor(health))} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">DLQ Depth</p>
            <p className={cn('text-2xl font-bold', getHealthTextColor(health))}>
              {dlq.totalDepth}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-lg font-semibold text-yellow-600 dark:text-yellow-400">
              {dlq.pendingCount}
            </p>
            <p className="text-xs text-gray-500">pending retry</p>
          </div>
          <div>
            <p className={cn(
              'text-lg font-semibold',
              dlq.failedCount > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-900 dark:text-white',
            )}>
              {dlq.failedCount}
            </p>
            <p className="text-xs text-gray-500">exhausted</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function BrainHealthDashboard() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['brain-health-dashboard'],
    queryFn: fetchBrainHealth,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading brain health data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm">Could not load brain health data</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Overall health computation
  const triggerSuccessRate = computeSuccessRate(
    data.triggers.successfulTriggers,
    data.triggers.totalTriggers24h,
  );
  const slackSuccessRate = computeSuccessRate(data.slack.successCount, data.slack.totalMessages24h);
  const overallHealth: HealthLevel =
    triggerSuccessRate < 80 || slackSuccessRate < 80 || data.dlq.totalDepth > 5
      ? 'critical'
      : triggerSuccessRate < 95 || slackSuccessRate < 95 || data.dlq.totalDepth > 0
        ? 'warning'
        : 'healthy';

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : 'unknown';

  return (
    <div className="space-y-4">
      {/* Header with overall status */}
      <Card className={cn('border', getHealthBorderColor(overallHealth))}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={cn('h-3 w-3 rounded-full', getHealthColor(overallHealth))} />
                {overallHealth === 'healthy' && (
                  <div className={cn(
                    'absolute inset-0 h-3 w-3 rounded-full opacity-50 blur-sm',
                    getHealthColor(overallHealth),
                  )} />
                )}
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  Brain Health: {overallHealth === 'healthy'
                    ? 'All Systems Operational'
                    : overallHealth === 'warning'
                      ? 'Minor Issues Detected'
                      : 'Attention Required'}
                </p>
                <p className="text-xs text-gray-500">
                  Auto-refreshes every 30s. Last updated: {lastUpdated}
                </p>
              </div>
            </div>
            <Activity className={cn('h-5 w-5', getHealthTextColor(overallHealth))} />
          </div>
        </CardContent>
      </Card>

      {/* Metric cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <TriggerRateCard triggers={data.triggers} />
        <ErrorRateCard triggers={data.triggers} />
        <SlackDeliveryCard slack={data.slack} />
        <DlqDepthCard dlq={data.dlq} />
      </div>

      {/* Cron jobs detail */}
      <CronJobsCard jobs={data.cronJobs} />
    </div>
  );
}

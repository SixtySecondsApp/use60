/**
 * EngagementTab - Agent engagement and value metrics
 *
 * Ported from AgentPerformanceDashboard into tab form.
 * Shows: messages, actions, time saved, proactive/reactive split,
 * outcomes, top sequences, daily trends.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import {
  BarChart3,
  TrendingUp,
  Clock,
  MessageSquare,
  Zap,
  CheckCircle,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

interface EngagementTabProps {
  organizationId: string;
}

interface EngagementMetrics {
  totalMessages: number;
  actionsTaken: number;
  actionsDismissed: number;
  confirmationsGiven: number;
  confirmationsDenied: number;
  proactiveCount: number;
  reactiveCount: number;
  totalTimeSaved: number;
  emailsSent: number;
  tasksCreated: number;
  prepsGenerated: number;
}

interface SequenceUsage {
  sequenceKey: string;
  count: number;
  timeSaved: number;
}

interface DailyTrend {
  date: string;
  messages: number;
  actions: number;
  timeSaved: number;
}

type DateRange = '7d' | '30d' | '90d';

// ============================================================================
// Component
// ============================================================================

export function EngagementTab({ organizationId }: EngagementTabProps) {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');

  const { startDate, endDate } = useMemo(() => {
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    return {
      startDate: startOfDay(subDays(new Date(), days)),
      endDate: endOfDay(new Date()),
    };
  }, [dateRange]);

  // Fetch engagement metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['engagement-metrics', organizationId, dateRange, selectedUserId],
    queryFn: async () => {
      let query = supabase
        .from('copilot_engagement_events')
        .select('event_type, trigger_type, estimated_time_saved_minutes, outcome_type')
        .eq('organization_id', organizationId)
        .gte('event_timestamp', startDate.toISOString())
        .lte('event_timestamp', endDate.toISOString());

      if (selectedUserId !== 'all') {
        query = query.eq('user_id', selectedUserId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const events = data || [];
      return {
        totalMessages: events.filter(e => e.event_type === 'message_sent').length,
        actionsTaken: events.filter(e => e.event_type === 'action_taken').length,
        actionsDismissed: events.filter(e => e.event_type === 'action_dismissed').length,
        confirmationsGiven: events.filter(e => e.event_type === 'confirmation_given').length,
        confirmationsDenied: events.filter(e => e.event_type === 'confirmation_denied').length,
        proactiveCount: events.filter(e => e.trigger_type === 'proactive').length,
        reactiveCount: events.filter(e => e.trigger_type === 'reactive').length,
        totalTimeSaved: events.reduce((sum, e) => sum + (e.estimated_time_saved_minutes || 0), 0),
        emailsSent: events.filter(e => e.outcome_type === 'email_sent').length,
        tasksCreated: events.filter(e => e.outcome_type === 'task_created').length,
        prepsGenerated: events.filter(e => e.outcome_type === 'prep_generated').length,
      } as EngagementMetrics;
    },
    enabled: !!organizationId,
  });

  // Fetch sequence usage
  const { data: sequenceUsage, isLoading: sequenceLoading } = useQuery({
    queryKey: ['engagement-sequences', organizationId, dateRange, selectedUserId],
    queryFn: async () => {
      let query = supabase
        .from('copilot_engagement_events')
        .select('sequence_key, estimated_time_saved_minutes')
        .eq('organization_id', organizationId)
        .not('sequence_key', 'is', null)
        .gte('event_timestamp', startDate.toISOString())
        .lte('event_timestamp', endDate.toISOString());

      if (selectedUserId !== 'all') {
        query = query.eq('user_id', selectedUserId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const usage: Record<string, { count: number; timeSaved: number }> = {};
      for (const event of data || []) {
        if (!usage[event.sequence_key]) {
          usage[event.sequence_key] = { count: 0, timeSaved: 0 };
        }
        usage[event.sequence_key].count++;
        usage[event.sequence_key].timeSaved += event.estimated_time_saved_minutes || 0;
      }

      return Object.entries(usage)
        .map(([key, val]) => ({ sequenceKey: key, ...val }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    },
    enabled: !!organizationId,
  });

  // Fetch daily trends
  const { data: trends, isLoading: trendsLoading } = useQuery({
    queryKey: ['engagement-trends', organizationId, dateRange, selectedUserId],
    queryFn: async () => {
      let query = supabase
        .from('copilot_engagement_events')
        .select('event_timestamp, event_type, estimated_time_saved_minutes')
        .eq('organization_id', organizationId)
        .gte('event_timestamp', startDate.toISOString())
        .lte('event_timestamp', endDate.toISOString());

      if (selectedUserId !== 'all') {
        query = query.eq('user_id', selectedUserId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const daily: Record<string, DailyTrend> = {};
      for (const event of data || []) {
        const day = format(new Date(event.event_timestamp), 'yyyy-MM-dd');
        if (!daily[day]) {
          daily[day] = { date: day, messages: 0, actions: 0, timeSaved: 0 };
        }
        if (event.event_type === 'message_sent') daily[day].messages++;
        if (event.event_type === 'action_taken') daily[day].actions++;
        daily[day].timeSaved += event.estimated_time_saved_minutes || 0;
      }

      return Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));
    },
    enabled: !!organizationId,
  });

  // Fetch org users for filter
  const { data: users } = useQuery({
    queryKey: ['org-users-engagement', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_memberships')
        .select('user_id, profiles!inner(first_name, last_name)')
        .eq('org_id', organizationId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const isLoading = metricsLoading || sequenceLoading || trendsLoading;

  const actionRate = Math.round(
    (metrics?.actionsTaken || 0) /
    Math.max(1, (metrics?.actionsTaken || 0) + (metrics?.actionsDismissed || 0)) * 100
  );

  const proactiveTotal = (metrics?.proactiveCount || 0) + (metrics?.reactiveCount || 0);
  const proactivePct = proactiveTotal > 0
    ? (metrics?.proactiveCount || 0) / proactiveTotal * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Engagement Metrics
        </h3>
        <div className="flex items-center gap-3">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users?.map((u: any) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.profiles?.first_name} {u.profiles?.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Messages Sent"
          value={metrics?.totalMessages || 0}
          icon={MessageSquare}
          loading={isLoading}
          subtitle={`${metrics?.proactiveCount || 0} proactive`}
        />
        <MetricCard
          title="Actions Taken"
          value={metrics?.actionsTaken || 0}
          icon={Zap}
          loading={isLoading}
          subtitle={`${actionRate}% action rate`}
        />
        <MetricCard
          title="Time Saved"
          value={`${metrics?.totalTimeSaved || 0} min`}
          icon={Clock}
          loading={isLoading}
          subtitle={`~${Math.round((metrics?.totalTimeSaved || 0) / 60)} hours`}
        />
        <MetricCard
          title="Confirmations"
          value={metrics?.confirmationsGiven || 0}
          icon={CheckCircle}
          loading={isLoading}
          subtitle={`${metrics?.confirmationsDenied || 0} denied`}
        />
      </div>

      {/* Proactive vs Reactive + Outcomes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Interaction Type
            </CardTitle>
            <CardDescription>Proactive vs reactive engagement</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32" />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-sm">Proactive</span>
                  </div>
                  <span className="font-semibold">{metrics?.proactiveCount || 0}</span>
                </div>
                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${proactivePct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-sm">Reactive</span>
                  </div>
                  <span className="font-semibold">{metrics?.reactiveCount || 0}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Outcomes
            </CardTitle>
            <CardDescription>Actions completed by the agent</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32" />
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{metrics?.emailsSent || 0}</div>
                  <div className="text-xs text-gray-500 mt-1">Emails Drafted</div>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="text-2xl font-bold text-emerald-600">{metrics?.tasksCreated || 0}</div>
                  <div className="text-xs text-gray-500 mt-1">Tasks Created</div>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{metrics?.prepsGenerated || 0}</div>
                  <div className="text-xs text-gray-500 mt-1">Preps Generated</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Sequences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Top Sequences
          </CardTitle>
          <CardDescription>Most used agent workflows</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : sequenceUsage && sequenceUsage.length > 0 ? (
            <div className="space-y-3">
              {sequenceUsage.map((seq, idx) => (
                <div
                  key={seq.sequenceKey}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-sm">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {formatSequenceName(seq.sequenceKey)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {seq.count} executions
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <Clock className="w-3 h-3" />
                    {seq.timeSaved} min saved
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-4 text-center">
              No sequence usage data for this period
            </p>
          )}
        </CardContent>
      </Card>

      {/* Daily Activity Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Daily Activity
          </CardTitle>
          <CardDescription>Engagement over time</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : trends && trends.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-end gap-1 h-32">
                {trends.slice(-14).map((day) => {
                  const maxMessages = Math.max(...trends.map(t => t.messages), 1);
                  const height = (day.messages / maxMessages) * 100;
                  return (
                    <div
                      key={day.date}
                      className="flex-1 bg-blue-500 dark:bg-blue-600 rounded-t transition-all hover:bg-blue-600 dark:hover:bg-blue-500"
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${day.date}: ${day.messages} messages, ${day.actions} actions`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{trends[Math.max(0, trends.length - 14)]?.date}</span>
                <span>{trends[trends.length - 1]?.date}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-4 text-center">
              No activity data for this period
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function MetricCard({
  title,
  value,
  icon: Icon,
  loading,
  subtitle,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  loading: boolean;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {value}
              </p>
              {subtitle && (
                <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
              )}
            </div>
            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatSequenceName(key: string): string {
  return key
    .replace('seq-', '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

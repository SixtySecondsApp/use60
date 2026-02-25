/**
 * AgentAnalyticsDashboard — Triage effectiveness metrics
 *
 * Shows agent performance: notifications sent/suppressed/batched,
 * delivery stats, cost tracking, and "time saved" headline.
 *
 * Story: AOA-012
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Bell,
  BellOff,
  Clock,
  Loader2,
  TrendingUp,
  Layers,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { cn } from '@/lib/utils';

interface TriageStats {
  total: number;
  delivered: number;
  suppressed: number;
  batched: number;
  failed: number;
}

export function AgentAnalyticsDashboard() {
  const { user } = useAuth();
  const activeOrgId = useActiveOrgId();

  // Fetch triage stats for last 7 days
  const { data: stats, isLoading } = useQuery({
    queryKey: ['agent-triage-stats', user?.id, activeOrgId],
    queryFn: async (): Promise<TriageStats> => {
      if (!user?.id) return { total: 0, delivered: 0, suppressed: 0, batched: 0, failed: 0 };

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('notification_queue')
        .select('triage_status')
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo);

      if (error) throw error;

      const items = data || [];
      return {
        total: items.length,
        delivered: items.filter((i) => i.triage_status === 'delivered').length,
        suppressed: items.filter((i) => i.triage_status === 'suppressed').length,
        batched: items.filter((i) => i.triage_status === 'batched').length,
        failed: items.filter((i) => i.triage_status === 'failed').length,
      };
    },
    enabled: !!user?.id,
  });

  // Fetch cost data from agent_activity
  const { data: costData } = useQuery({
    queryKey: ['agent-cost-stats', user?.id, activeOrgId],
    queryFn: async () => {
      if (!user?.id) return { totalCost: 0, activityCount: 0 };

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data } = await supabase
        .from('agent_activity')
        .select('metadata')
        .eq('user_id', user.id)
        .eq('sequence_type', 'sequence_cost_rollup')
        .gte('created_at', sevenDaysAgo);

      const totalCost = (data || []).reduce((sum, item) => {
        return sum + (item.metadata?.total_cost || 0);
      }, 0);

      const { count } = await supabase
        .from('agent_activity')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo);

      return { totalCost, activityCount: count || 0 };
    },
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const suppressionRate = stats && stats.total > 0
    ? Math.round((stats.suppressed / stats.total) * 100)
    : 0;

  // Estimate time saved: ~2 min per suppressed notification
  const timeSavedMinutes = (stats?.suppressed || 0) * 2;
  const timeSavedDisplay = timeSavedMinutes >= 60
    ? `${Math.round(timeSavedMinutes / 60)}h ${timeSavedMinutes % 60}m`
    : `${timeSavedMinutes}m`;

  const metricCards = [
    {
      label: 'Delivered',
      value: stats?.delivered || 0,
      Icon: Bell,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      label: 'Suppressed',
      value: stats?.suppressed || 0,
      Icon: BellOff,
      color: 'text-gray-600 dark:text-gray-400',
      bg: 'bg-gray-50 dark:bg-gray-800/50',
    },
    {
      label: 'Batched',
      value: stats?.batched || 0,
      Icon: Layers,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950/30',
    },
    {
      label: 'Time Saved',
      value: timeSavedDisplay,
      Icon: Clock,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Headline stat */}
      <Card className="border-emerald-200 dark:border-emerald-800/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                Your agent saved you ~{timeSavedDisplay} this week
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {suppressionRate}% of raw notifications were intelligently suppressed or batched
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg', metric.bg)}>
                  <metric.Icon className={cn('w-4 h-4', metric.color)} />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{metric.value}</p>
                  <p className="text-xs text-gray-500">{metric.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cost tracking */}
      {costData && costData.totalCost > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">AI Cost This Week</CardTitle>
            <CardDescription>Credits consumed by your agent's AI calls</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              ${costData.totalCost.toFixed(4)}
            </p>
            <p className="text-xs text-gray-500">
              Across {costData.activityCount} agent actions
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

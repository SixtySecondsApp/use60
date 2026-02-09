/**
 * HealthTab - Copilot analytics, skill quality, and routing decisions
 *
 * Combines: get_copilot_analytics RPC metrics, QualityDashboard for skill
 * readiness, and copilot_routing_logs for recent routing decisions.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Zap,
  CheckCircle2,
  Clock,
  Wrench,
  ChevronRight,
  Activity,
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
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/clientV2';
import { QualityDashboard } from '@/components/copilot/lab/QualityDashboard';
import { usePlatformSkills } from '@/lib/hooks/usePlatformSkills';
import { useOrgCapabilities } from '@/lib/hooks/useOrgCapabilities';
import type { PlatformSkill } from '@/lib/services/platformSkillService';

interface HealthTabProps {
  organizationId: string;
}

type DateRange = '7d' | '30d' | '90d';

const DATE_RANGE_DAYS: Record<DateRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export function HealthTab({ organizationId }: HealthTabProps) {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const days = DATE_RANGE_DAYS[dateRange];

  // Analytics metrics
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['copilot-analytics', organizationId, days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_copilot_analytics', {
        p_org_id: organizationId,
        p_days: days,
      });
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!organizationId,
  });

  // Routing logs
  const { data: routingLogs } = useQuery({
    queryKey: ['copilot-routing-logs', organizationId, days],
    queryFn: async () => {
      const startDate = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await supabase
        .from('copilot_routing_logs')
        .select('id, message_snippet, selected_skill_key, is_sequence_match, confidence, candidate_count, reason, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .gte('created_at', startDate)
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  // Skills and capabilities for QualityDashboard
  const { skills, isLoading: skillsLoading } = usePlatformSkills();
  const { capabilities, isLoading: capsLoading } = useOrgCapabilities(organizationId);

  const handleSkillClick = (skill: PlatformSkill) => {
    navigate(`/platform/skills/${skill.category}/${skill.skill_key}`);
  };

  const successRate = analytics?.success_rate ?? 0;
  const successColor =
    successRate >= 90
      ? 'text-emerald-600'
      : successRate >= 70
        ? 'text-amber-600'
        : 'text-red-600';

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Copilot Health
        </h3>
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

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Executions"
          value={analytics?.total_executions ?? 0}
          icon={Zap}
          loading={analyticsLoading}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
        />
        <MetricCard
          title="Success Rate"
          value={`${successRate.toFixed(1)}%`}
          icon={CheckCircle2}
          loading={analyticsLoading}
          iconColor={successColor}
          iconBg={successRate >= 90 ? 'bg-emerald-500/10' : successRate >= 70 ? 'bg-amber-500/10' : 'bg-red-500/10'}
          subtitle={`${analytics?.successful_executions ?? 0} successful`}
        />
        <MetricCard
          title="Avg Latency"
          value={analytics?.avg_duration_ms ? `${(analytics.avg_duration_ms / 1000).toFixed(1)}s` : '--'}
          icon={Clock}
          loading={analyticsLoading}
          iconColor="text-purple-500"
          iconBg="bg-purple-500/10"
          subtitle={`${analytics?.avg_iterations ?? 0} avg iterations`}
        />
        <MetricCard
          title="Tools Used"
          value={analytics?.unique_tools_used ?? 0}
          icon={Wrench}
          loading={analyticsLoading}
          iconColor="text-amber-500"
          iconBg="bg-amber-500/10"
          subtitle={`${analytics?.total_tool_calls ?? 0} total calls`}
        />
      </div>

      {/* Quality Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skill Readiness</CardTitle>
          <CardDescription>Health check of all active copilot skills</CardDescription>
        </CardHeader>
        <CardContent>
          <QualityDashboard
            skills={skills || []}
            capabilities={capabilities || []}
            isLoading={skillsLoading || capsLoading}
            onSkillClick={handleSkillClick}
          />
        </CardContent>
      </Card>

      {/* Recent Routing Decisions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Recent Routing Decisions
          </CardTitle>
          <CardDescription>How queries were matched to skills ({days} days)</CardDescription>
        </CardHeader>
        <CardContent>
          {routingLogs && routingLogs.length > 0 ? (
            <div className="space-y-2">
              {routingLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 dark:text-gray-100 truncate">
                      {log.message_snippet}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {log.selected_skill_key ? (
                      <Badge
                        variant="outline"
                        className="font-mono text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        onClick={() => navigate(`/platform/skills/all/${log.selected_skill_key}`)}
                      >
                        {log.selected_skill_key}
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-400 text-xs">
                        no match
                      </Badge>
                    )}
                    {log.is_sequence_match && (
                      <Badge className="text-xs bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                        seq
                      </Badge>
                    )}
                    <ConfidenceBadge value={log.confidence} />
                    <span className="text-xs text-gray-400 w-16 text-right">
                      {formatRelativeTime(log.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-4 text-center">
              No routing decisions recorded in this period
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function MetricCard({
  title,
  value,
  icon: Icon,
  loading,
  iconColor,
  iconBg,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  loading: boolean;
  iconColor: string;
  iconBg: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-20 mt-1" />
            ) : (
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {value}
              </p>
            )}
            {subtitle && (
              <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
            )}
          </div>
          <div className={cn('p-2.5 rounded-xl', iconBg)}>
            <Icon className={cn('w-5 h-5', iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) return null;

  const pct = Math.round(value * 100);
  const color =
    pct >= 80
      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
      : pct >= 60
        ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
        : 'bg-red-500/10 text-red-600 border-red-500/20';

  return (
    <Badge variant="outline" className={cn('text-xs tabular-nums', color)}>
      {pct}%
    </Badge>
  );
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

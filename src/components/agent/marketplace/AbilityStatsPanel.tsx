/**
 * AbilityStatsPanel Component (US-019)
 *
 * Shows live stats for an ability fetched from agent_trigger_runs + agent_schedule_runs.
 * Stats: last run (relative time), total runs (30 days), success rate %, avg duration.
 * Fetches stats on mount (not realtime).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { cn } from '@/lib/utils';
import { Clock, Activity, CheckCircle2, Timer, Loader2 } from 'lucide-react';
import type { AbilityDefinition } from '@/lib/agent/abilityRegistry';

// =============================================================================
// Types
// =============================================================================

interface AbilityStatsPanelProps {
  ability: AbilityDefinition;
}

interface AbilityLiveStats {
  lastRunAt: string | null;
  totalRuns: number;
  successCount: number;
  avgDurationMs: number | null;
}

// =============================================================================
// Helpers
// =============================================================================

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function getSuccessRateColor(rate: number): string {
  if (rate >= 90) return 'text-green-400';
  if (rate >= 70) return 'text-amber-400';
  return 'text-red-400';
}

function getSuccessRateBg(rate: number): string {
  if (rate >= 90) return 'bg-green-500/10 border-green-500/20';
  if (rate >= 70) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

// =============================================================================
// Data Fetching
// =============================================================================

function useAbilityStats(ability: AbilityDefinition) {
  const { user } = useAuth();
  const activeOrgId = useActiveOrgId();

  return useQuery({
    queryKey: ['ability-live-stats', ability.id, activeOrgId],
    queryFn: async (): Promise<AbilityLiveStats> => {
      if (!activeOrgId) {
        return { lastRunAt: null, totalRuns: 0, successCount: 0, avgDurationMs: null };
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Query both tables in parallel
      const [scheduleResult, triggerResult] = await Promise.all([
        // agent_schedule_runs: match by agent_name
        supabase
          .from('agent_schedule_runs')
          .select('status, duration_ms, created_at')
          .eq('organization_id', activeOrgId)
          .eq('agent_name', ability.name)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(200),

        // agent_trigger_runs: match by trigger_event
        supabase
          .from('agent_trigger_runs')
          .select('success, duration_ms, created_at')
          .eq('organization_id', activeOrgId)
          .eq('trigger_event', ability.eventType)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      // Combine results
      let lastRunAt: string | null = null;
      let totalRuns = 0;
      let successCount = 0;
      let totalDurationMs = 0;
      let durationCount = 0;

      // Process schedule runs
      if (scheduleResult.data) {
        for (const run of scheduleResult.data) {
          totalRuns++;
          if (run.status === 'success') successCount++;
          if (run.duration_ms != null) {
            totalDurationMs += run.duration_ms;
            durationCount++;
          }
          if (!lastRunAt || run.created_at > lastRunAt) {
            lastRunAt = run.created_at;
          }
        }
      }

      // Process trigger runs
      if (triggerResult.data) {
        for (const run of triggerResult.data) {
          totalRuns++;
          if (run.success) successCount++;
          if (run.duration_ms != null) {
            totalDurationMs += run.duration_ms;
            durationCount++;
          }
          if (!lastRunAt || run.created_at > lastRunAt) {
            lastRunAt = run.created_at;
          }
        }
      }

      return {
        lastRunAt,
        totalRuns,
        successCount,
        avgDurationMs: durationCount > 0 ? totalDurationMs / durationCount : null,
      };
    },
    enabled: !!user?.id && !!activeOrgId,
    staleTime: 60_000, // Cache for 1 minute
  });
}

// =============================================================================
// Component
// =============================================================================

export function AbilityStatsPanel({ ability }: AbilityStatsPanelProps) {
  const { data: stats, isLoading } = useAbilityStats(ability);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      </div>
    );
  }

  // "Never run" state
  if (!stats || stats.totalRuns === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Clock className="w-8 h-8 text-gray-600 mb-2" />
        <p className="text-sm font-medium text-gray-400">Never run</p>
        <p className="text-xs text-gray-500 mt-1">
          Stats will appear here after the first execution
        </p>
      </div>
    );
  }

  const successRate = Math.round((stats.successCount / stats.totalRuns) * 100);

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Last Run */}
      <div className="bg-white/5 rounded-lg p-3 space-y-1">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-gray-500" />
          <p className="text-xs text-gray-500 uppercase tracking-wide">Last Run</p>
        </div>
        <p className="text-sm font-medium text-gray-300">
          {stats.lastRunAt ? formatRelativeTime(stats.lastRunAt) : '-'}
        </p>
      </div>

      {/* Total Runs (30 days) */}
      <div className="bg-white/5 rounded-lg p-3 space-y-1">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-gray-500" />
          <p className="text-xs text-gray-500 uppercase tracking-wide">Runs (30d)</p>
        </div>
        <p className="text-sm font-medium text-gray-300">
          {stats.totalRuns.toLocaleString()}
        </p>
      </div>

      {/* Success Rate */}
      <div className={cn(
        'rounded-lg p-3 space-y-1 border',
        getSuccessRateBg(successRate),
      )}>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3 text-gray-500" />
          <p className="text-xs text-gray-500 uppercase tracking-wide">Success Rate</p>
        </div>
        <p className={cn('text-lg font-semibold', getSuccessRateColor(successRate))}>
          {successRate}%
        </p>
      </div>

      {/* Average Duration */}
      <div className="bg-white/5 rounded-lg p-3 space-y-1">
        <div className="flex items-center gap-1.5">
          <Timer className="w-3 h-3 text-gray-500" />
          <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Duration</p>
        </div>
        <p className="text-sm font-medium text-gray-300">
          {stats.avgDurationMs != null ? formatDuration(stats.avgDurationMs) : '-'}
        </p>
      </div>
    </div>
  );
}

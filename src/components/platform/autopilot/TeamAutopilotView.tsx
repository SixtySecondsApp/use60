/**
 * TeamAutopilotView — AP-022
 *
 * Manager/admin team-wide autonomy view. Shows:
 *   - Team summary row (rep count, avg autonomy %, total hrs/week saved)
 *   - Per-rep list with autonomy progress bar, tier counts, days active, time saved
 *   - Ceiling settings read-only display from autopilot_org_settings
 */

import { AlertCircle, Clock, Loader2, Shield, Users, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useTeamAutopilot, type TeamMemberStats } from '@/lib/hooks/useTeamAutopilot';
import { useAutonomyCeilings } from '@/lib/hooks/useManagerAutonomy';

// ============================================================================
// Props
// ============================================================================

interface TeamAutopilotViewProps {
  orgId: string;
}

// ============================================================================
// Helpers
// ============================================================================

function formatTimeSaved(hours: number): string {
  if (hours < 0.1) return '<6 mins';
  if (hours < 1) return `${Math.round(hours * 60)} mins`;
  return `${hours.toFixed(1)} hrs`;
}

function getAutonomyColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-blue-600 dark:text-blue-400';
  if (score >= 20) return 'text-amber-600 dark:text-amber-400';
  return 'text-gray-500 dark:text-gray-400';
}

function getProgressColor(score: number): string {
  if (score >= 80) return '[&>div]:bg-emerald-500';
  if (score >= 50) return '[&>div]:bg-blue-500';
  if (score >= 20) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-gray-400';
}

function getAutonomyLabel(score: number): string {
  if (score >= 80) return 'Autonomous';
  if (score >= 50) return 'Balanced';
  if (score >= 20) return 'Conservative';
  return 'Getting started';
}

const TIER_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'secondary' | 'default' }> = {
  auto: { label: 'Auto', variant: 'success' },
  approve: { label: 'Approve', variant: 'warning' },
  suggest: { label: 'Suggest', variant: 'default' },
  disabled: { label: 'Disabled', variant: 'secondary' },
};

const CEILING_LABELS: Record<string, string> = {
  suggest: 'Suggest Only',
  approve: 'Approval Required',
  auto: 'Auto-Execute',
  no_limit: 'No Limit',
  disabled: 'Disabled',
};

const ACTION_DISPLAY: Record<string, string> = {
  crm_stage_change: 'CRM Stage Changes',
  crm_field_update: 'CRM Field Updates',
  crm_contact_create: 'Contact Creation',
  send_email: 'Email Sending',
  send_slack: 'Slack Messages',
  create_task: 'Task Creation',
  enrich_contact: 'Contact Enrichment',
  draft_proposal: 'Proposal Drafts',
};

// ============================================================================
// Team summary strip
// ============================================================================

interface TeamSummaryProps {
  memberCount: number;
  avgAutonomy: number;
  totalTimeSaved: number;
}

function TeamSummary({ memberCount, avgAutonomy, totalTimeSaved }: TeamSummaryProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-4 text-center">
        <Users className="h-5 w-5 text-gray-400 mb-1" />
        <span className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
          {memberCount}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {memberCount === 1 ? 'rep' : 'reps'}
        </span>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-4 text-center">
        <Zap className="h-5 w-5 text-blue-400 mb-1" />
        <span className={cn('text-2xl font-bold leading-none', getAutonomyColor(avgAutonomy))}>
          {Math.round(avgAutonomy)}%
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">avg autonomy</span>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-4 text-center">
        <Clock className="h-5 w-5 text-emerald-400 mb-1" />
        <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 leading-none">
          {formatTimeSaved(totalTimeSaved)}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">saved / week</span>
      </div>
    </div>
  );
}

// ============================================================================
// Per-rep row
// ============================================================================

function RepRow({ member }: { member: TeamMemberStats }) {
  const autonomyPct = Math.round(member.autonomy_score);
  const label = getAutonomyLabel(autonomyPct);
  const progressColor = getProgressColor(autonomyPct);

  const autoTierCfg = TIER_BADGE.auto;
  const approveTierCfg = TIER_BADGE.approve;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-100 dark:border-gray-800/60 last:border-0">
      {/* Rep name + label */}
      <div className="w-40 flex-shrink-0 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {member.display_name}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">{label}</p>
      </div>

      {/* Autonomy progress bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn('text-xs font-semibold tabular-nums', getAutonomyColor(autonomyPct))}>
            {autonomyPct}%
          </span>
        </div>
        <Progress value={autonomyPct} className={cn('h-2', progressColor)} />
      </div>

      {/* Tier counts */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {member.auto_count > 0 && (
          <Badge variant={autoTierCfg.variant} className="text-xs font-medium">
            {member.auto_count} auto
          </Badge>
        )}
        {member.approve_count > 0 && (
          <Badge variant={approveTierCfg.variant} className="text-xs font-medium">
            {member.approve_count} approve
          </Badge>
        )}
        {member.auto_count === 0 && member.approve_count === 0 && (
          <Badge variant="secondary" className="text-xs">
            no signals
          </Badge>
        )}
      </div>

      {/* Days active */}
      <div className="w-20 flex-shrink-0 text-right">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 tabular-nums">
          {member.days_since_first_signal != null
            ? `${member.days_since_first_signal}d`
            : '—'}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-600">active</p>
      </div>

      {/* Time saved */}
      <div className="w-20 flex-shrink-0 text-right">
        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
          {formatTimeSaved(member.time_saved_hours_week)}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-600">/week</p>
      </div>
    </div>
  );
}

// ============================================================================
// Ceiling settings read-only display
// ============================================================================

function CeilingSettingsDisplay() {
  const { data: ceilings, isLoading } = useAutonomyCeilings();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-gray-400 dark:text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading ceiling settings…</span>
      </div>
    );
  }

  if (!ceilings || ceilings.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
        No ceilings configured. All action types use org-level autonomy policies.
      </p>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {ceilings.map((ceiling) => {
        const tierCfg =
          TIER_BADGE[(ceiling.max_ceiling as string)] ??
          TIER_BADGE.suggest;

        return (
          <div
            key={ceiling.action_type}
            className="flex items-center justify-between py-2.5 gap-3"
          >
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {ACTION_DISPLAY[ceiling.action_type] ?? ceiling.action_type}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant={tierCfg.variant} className="text-xs">
                {CEILING_LABELS[(ceiling.max_ceiling as string)] ?? ceiling.max_ceiling}
              </Badge>
              {!ceiling.auto_promotion_eligible && (
                <Badge variant="secondary" className="text-xs">
                  Locked
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Skeleton loader
// ============================================================================

function TeamSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-xl bg-gray-200 dark:bg-gray-800"
          />
        ))}
      </div>
      {/* Rep rows */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-10 rounded bg-gray-100 dark:bg-gray-800/60" />
      ))}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function TeamAutopilotView({ orgId }: TeamAutopilotViewProps) {
  const { data, isLoading, error, refetch } = useTeamAutopilot(orgId);

  if (isLoading) {
    return <TeamSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm flex-1">
          Could not load team data: {(error as Error)?.message ?? 'Unknown error'}
        </p>
        <button
          onClick={() => refetch()}
          className="text-xs underline underline-offset-2 flex-shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.members.length === 0) {
    return (
      <Card className="border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
        <CardContent className="py-10 text-center">
          <Users className="h-10 w-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            No team autonomy data yet
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-1 max-w-xs mx-auto">
            Data will appear once your team starts approving agent proposals
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Team summary strip */}
      <TeamSummary
        memberCount={data.members.length}
        avgAutonomy={data.team_avg_autonomy}
        totalTimeSaved={data.team_total_time_saved_week}
      />

      {/* Per-rep list */}
      <Card className="border border-gray-200 dark:border-gray-800">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Rep Autonomy Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {/* Column headers */}
          <div className="flex items-center gap-4 pb-2 border-b border-gray-100 dark:border-gray-800 mb-1">
            <span className="w-40 flex-shrink-0 text-xs font-medium text-gray-400 dark:text-gray-600 uppercase tracking-wide">
              Rep
            </span>
            <span className="flex-1 text-xs font-medium text-gray-400 dark:text-gray-600 uppercase tracking-wide">
              Autonomy
            </span>
            <span className="w-32 flex-shrink-0 text-xs font-medium text-gray-400 dark:text-gray-600 uppercase tracking-wide">
              Tiers
            </span>
            <span className="w-20 flex-shrink-0 text-right text-xs font-medium text-gray-400 dark:text-gray-600 uppercase tracking-wide">
              Days
            </span>
            <span className="w-20 flex-shrink-0 text-right text-xs font-medium text-gray-400 dark:text-gray-600 uppercase tracking-wide">
              Saved
            </span>
          </div>

          {data.members.map((member) => (
            <RepRow key={member.user_id} member={member} />
          ))}
        </CardContent>
      </Card>

      {/* Ceiling settings — read-only */}
      <Card className="border border-gray-200 dark:border-gray-800">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Autonomy Ceilings
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <CeilingSettingsDisplay />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * AutopilotDashboard — Per-rep autonomy dashboard (AP-020)
 *
 * Shows the current user's autonomy profile:
 *   - Autonomy % circular progress + preset label
 *   - Time saved hero metric
 *   - Per-action-type status cards grouped by category
 */

import { Loader2, AlertCircle, Clock, Bell, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useAutopilotDashboard, type ActionTypeStats } from '@/lib/hooks/useAutopilotDashboard';
import { useTimeSaved } from '@/lib/hooks/useTimeSaved';
import AutonomyProgressionChart from './AutonomyProgressionChart';

// ============================================================================
// Constants
// ============================================================================

const ACTION_DISPLAY: Record<string, string> = {
  'crm.note_add': 'Meeting notes',
  'crm.activity_log': 'Activity logging',
  'crm.contact_enrich': 'Contact enrichment',
  'crm.next_steps_update': 'Next steps',
  'crm.deal_field_update': 'Deal field updates',
  'crm.deal_stage_change': 'Deal stage changes',
  'crm.deal_amount_change': 'Deal amount changes',
  'crm.deal_close_date_change': 'Close date changes',
  'email.draft_save': 'Email drafts',
  'email.send': 'Email sending',
  'email.follow_up_send': 'Follow-up emails',
  'email.check_in_send': 'Check-in emails',
  'task.create': 'Task creation',
  'task.assign': 'Task assignment',
  'calendar.create_event': 'Meeting scheduling',
  'calendar.reschedule': 'Meeting rescheduling',
  'analysis.risk_assessment': 'Risk assessment',
  'analysis.coaching_feedback': 'Coaching feedback',
};

const ACTION_CATEGORIES: { label: string; prefix: string; actions: string[] }[] = [
  {
    label: 'CRM Operations',
    prefix: 'crm',
    actions: [
      'crm.note_add',
      'crm.activity_log',
      'crm.contact_enrich',
      'crm.next_steps_update',
      'crm.deal_field_update',
      'crm.deal_stage_change',
      'crm.deal_amount_change',
      'crm.deal_close_date_change',
    ],
  },
  {
    label: 'Communication',
    prefix: 'email',
    actions: ['email.draft_save', 'email.send', 'email.follow_up_send', 'email.check_in_send'],
  },
  {
    label: 'Task Management',
    prefix: 'task',
    actions: ['task.create', 'task.assign'],
  },
  {
    label: 'Calendar',
    prefix: 'calendar',
    actions: ['calendar.create_event', 'calendar.reschedule'],
  },
  {
    label: 'Analysis',
    prefix: 'analysis',
    actions: ['analysis.risk_assessment', 'analysis.coaching_feedback'],
  },
];

// ============================================================================
// Tier config — colors and labels
// ============================================================================

type Tier = 'auto' | 'approve' | 'suggest' | 'disabled';

const TIER_CONFIG: Record<
  Tier,
  { label: string; variant: 'success' | 'warning' | 'default' | 'secondary' }
> = {
  auto: { label: 'AUTO', variant: 'success' },
  approve: { label: 'APPROVE', variant: 'warning' },
  suggest: { label: 'SUGGEST', variant: 'default' },
  disabled: { label: 'DISABLED', variant: 'secondary' },
};

// ============================================================================
// Autonomy % label helper
// ============================================================================

function getPresetLabel(score: number): string {
  if (score >= 80) return 'Autonomous';
  if (score >= 50) return 'Balanced';
  if (score >= 20) return 'Conservative';
  return 'Getting started';
}

// ============================================================================
// Circular progress ring
// ============================================================================

interface CircularProgressProps {
  value: number; // 0–100
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function CircularProgress({
  value,
  size = 80,
  strokeWidth = 7,
  className,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      className={cn('-rotate-90', className)}
      aria-hidden="true"
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-gray-200 dark:text-gray-800"
      />
      {/* Fill */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={cn(
          'transition-all duration-700',
          value >= 80
            ? 'text-emerald-500'
            : value >= 50
            ? 'text-blue-500'
            : value >= 20
            ? 'text-amber-500'
            : 'text-gray-400',
        )}
      />
    </svg>
  );
}

// ============================================================================
// Signal stats display: "30/30 clean" or "28/30 clean (93%)"
// ============================================================================

function SignalStats({ stat }: { stat: ActionTypeStats }) {
  const total = stat.total_signals;
  const clean = stat.total_approved;
  const rate = stat.clean_approval_rate;

  if (total === 0) {
    return <span className="text-xs text-gray-500 dark:text-gray-500">No signals yet</span>;
  }

  const isClean = clean >= total;
  const pct = rate != null ? Math.round(rate * 100) : null;

  return (
    <span className="text-xs text-gray-500 dark:text-gray-400">
      {isClean ? (
        <>
          {total}/{total}{' '}
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">clean</span>
        </>
      ) : (
        <>
          {clean}/{total}{' '}
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">clean</span>
          {pct != null && (
            <span className="text-gray-400 dark:text-gray-600"> ({pct}%)</span>
          )}
        </>
      )}
    </span>
  );
}

// ============================================================================
// Action type row card
// ============================================================================

function ActionTypeCard({ stat }: { stat: ActionTypeStats }) {
  const tier = (stat.current_tier ?? 'disabled') as Tier;
  const tierCfg = TIER_CONFIG[tier] ?? TIER_CONFIG.disabled;
  const displayName = ACTION_DISPLAY[stat.action_type] ?? stat.action_type;

  const isCooldown = stat.cooldown_until != null && new Date(stat.cooldown_until) > new Date();
  const cooldownUntil = isCooldown && stat.cooldown_until
    ? new Date(stat.cooldown_until).toLocaleDateString()
    : null;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 dark:border-gray-800/60 last:border-0">
      {/* Tier badge */}
      <Badge variant={tierCfg.variant} className="flex-shrink-0 text-xs font-semibold tracking-wide w-20 justify-center">
        {tierCfg.label}
      </Badge>

      {/* Name + stats */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {displayName}
        </span>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <SignalStats stat={stat} />

          {/* Promotion eligible */}
          {stat.promotion_eligible && !stat.never_promote && (
            <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
              <Bell className="h-3 w-3" />
              Eligible for promotion
            </span>
          )}

          {/* Extra signals needed to qualify */}
          {!stat.promotion_eligible && stat.extra_required_signals > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-600">
              {stat.extra_required_signals} signals to qualify
            </span>
          )}

          {/* Cooldown */}
          {isCooldown && cooldownUntil && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Clock className="h-3 w-3" />
              Cooldown until {cooldownUntil}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Category group
// ============================================================================

function CategoryGroup({
  label,
  stats,
}: {
  label: string;
  stats: ActionTypeStats[];
}) {
  if (stats.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </h3>
      <div>
        {stats.map((stat) => (
          <ActionTypeCard key={stat.action_type} stat={stat} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Skeleton loader
// ============================================================================

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header row */}
      <div className="flex items-center gap-5">
        <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-800" />
        <div className="space-y-2">
          <div className="h-5 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
        </div>
      </div>
      {/* Time saved */}
      <div className="h-16 bg-gray-200 dark:bg-gray-800 rounded-xl" />
      {/* Rows */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800/60 rounded" />
      ))}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function AutopilotDashboard() {
  const { data, isLoading, error, refetch } = useAutopilotDashboard();
  const { data: timeSaved } = useTimeSaved('week');

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm flex-1">
          Could not load autonomy data: {(error as Error)?.message ?? 'Unknown error'}
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

  // Empty state — no signals recorded yet
  if (!data || data.total_action_types_tracked === 0) {
    return (
      <Card className="border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
        <CardContent className="py-10 text-center">
          <Shield className="h-10 w-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            No autonomy data yet
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-1 max-w-xs mx-auto">
            Start approving agent proposals to build your autonomy profile
          </p>
        </CardContent>
      </Card>
    );
  }

  const autonomyPct = Math.round(data.autonomy_score);
  const presetLabel = getPresetLabel(autonomyPct);
  const timeSavedHours = timeSaved?.total_hours ?? data.time_saved_hours_week;
  const timeSavedDisplay =
    timeSavedHours < 1
      ? `${Math.round(timeSavedHours * 60)} mins`
      : `${timeSavedHours.toFixed(1)} hrs`;

  // Build per-category lists from the stats
  const statsByType = new Map(data.stats.map((s) => [s.action_type, s]));

  const groupedCategories = ACTION_CATEGORIES.map((cat) => ({
    label: cat.label,
    stats: cat.actions.flatMap((at) => {
      const s = statsByType.get(at);
      return s ? [s] : [];
    }),
  })).filter((cat) => cat.stats.length > 0);

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header: circular progress + preset label                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-5">
        {/* Circular progress ring with % in center */}
        <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
          <CircularProgress value={autonomyPct} size={80} strokeWidth={7} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-gray-900 dark:text-white leading-none">
              {autonomyPct}%
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Agent Autonomy
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant={
                autonomyPct >= 80
                  ? 'success'
                  : autonomyPct >= 50
                  ? 'default'
                  : autonomyPct >= 20
                  ? 'warning'
                  : 'secondary'
              }
              className="text-xs"
            >
              {presetLabel}
            </Badge>
            <span className="text-xs text-gray-500 dark:text-gray-500">
              {data.auto_count} of {data.total_action_types_tracked} action types on auto
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Time saved hero                                                    */}
      {/* ------------------------------------------------------------------ */}
      <Card className="border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/10 dark:to-gray-900/40">
        <CardContent className="flex items-center gap-4 py-4 px-5">
          <Clock className="h-6 w-6 text-emerald-500 flex-shrink-0" />
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
              {timeSavedDisplay}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
              saved by autonomous actions this week
            </p>
          </div>
          <div className="ml-auto text-right flex-shrink-0">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {timeSaved?.actions_auto ?? 0} auto
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
              {timeSaved?.actions_approved ?? 0} approved
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Autonomy progression chart                                        */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-3">
          Autonomy Progression (Last 90 Days)
        </h3>
        <AutonomyProgressionChart days={90} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Per-action-type status cards grouped by category                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-5">
        {groupedCategories.map((cat) => (
          <CategoryGroup key={cat.label} label={cat.label} stats={cat.stats} />
        ))}
      </div>
    </div>
  );
}

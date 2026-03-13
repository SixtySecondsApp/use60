import React from 'react';
import {
  Settings2,
  ClipboardCheck,
  TrendingUp,
  BarChart3,
  Target,
  ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useConfigCompleteness,
  type ConfigCompleteness,
  type ConfigTier,
} from '@/lib/hooks/useConfigCompleteness';
import {
  useTeamCoachingStats,
  type TeamMemberStats,
} from '@/lib/services/coachingDashboardService';

// ============================================================================
// Types
// ============================================================================

interface OrgLearningInsightsPanelProps {
  orgId: string;
}

// ============================================================================
// Constants
// ============================================================================

const TIER_LABELS: Record<ConfigTier, string> = {
  functional: 'Functional',
  tuned: 'Tuned',
  optimised: 'Optimised',
  learning: 'Learning',
};

const TIER_COLORS: Record<ConfigTier, { badge: string; bar: string }> = {
  functional: {
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    bar: 'bg-blue-500',
  },
  tuned: {
    badge: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    bar: 'bg-violet-500',
  },
  optimised: {
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    bar: 'bg-emerald-500',
  },
  learning: {
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    bar: 'bg-amber-500',
  },
};

// ============================================================================
// Skeleton
// ============================================================================

function InsightsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-800 bg-gray-900/30 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

/** Card wrapper matching the coaching dashboard dark theme. */
function InsightCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-800 bg-gray-900/30 p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Team Configuration insight card. */
function TeamConfigCard({
  config,
}: {
  config: ConfigCompleteness;
}) {
  const navigate = useNavigate();
  const pct = Math.round(config.percentage);
  const tierCfg = TIER_COLORS[config.tier] ?? TIER_COLORS.functional;

  // Find the weakest category
  const categories = Object.entries(config.categories ?? {});
  let weakest: { name: string; pct: number } | null = null;
  for (const [name, cat] of categories) {
    const catPct = Math.round(cat.percentage);
    if (!weakest || catPct < weakest.pct) {
      weakest = { name, pct: catPct };
    }
  }

  return (
    <InsightCard>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
          <Settings2 className="h-3.5 w-3.5 text-indigo-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-200">Team Configuration</h3>
      </div>

      {/* Tier + percentage */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize',
            tierCfg.badge,
          )}
        >
          {TIER_LABELS[config.tier]}
        </span>
        <span className="text-xl font-bold text-gray-100">{pct}%</span>
        <span className="text-xs text-gray-500">
          {config.answered_questions}/{config.total_questions} configured
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-gray-800 overflow-hidden mb-3">
        <div
          className={cn('h-full rounded-full transition-all duration-700', tierCfg.bar)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {/* Weakest category */}
      {weakest && weakest.pct < 100 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Weakest area: <span className="text-gray-400 font-medium">{weakest.name}</span> ({weakest.pct}%)
          </p>
          <button
            onClick={() => navigate('/settings/ai-intelligence')}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Configure
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </InsightCard>
  );
}

/** Coaching Activity insight card. */
function CoachingActivityCard({
  stats,
}: {
  stats: TeamMemberStats[];
}) {
  const totalScorecards = stats.reduce((sum, r) => sum + r.scorecard_count, 0);
  const avgTeamScore =
    totalScorecards > 0
      ? stats.reduce((sum, r) => sum + r.avg_score * r.scorecard_count, 0) / totalScorecards
      : 0;

  const repsWithData = stats.filter((r) => r.scorecard_count > 0).length;

  // Grade distribution
  const gradeFor = (score: number): string => {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  };
  const teamGrade = gradeFor(avgTeamScore);

  return (
    <InsightCard>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
          <ClipboardCheck className="h-3.5 w-3.5 text-emerald-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-200">Coaching Activity</h3>
      </div>

      {/* Main metric */}
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-xl font-bold text-gray-100">{totalScorecards}</span>
        <span className="text-xs text-gray-500">
          scorecard{totalScorecards !== 1 ? 's' : ''} this period
        </span>
      </div>

      {/* Sub-metrics */}
      <div className="space-y-2 mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Team Avg Score</span>
          <span className="text-gray-200 font-medium">
            {avgTeamScore > 0 ? avgTeamScore.toFixed(1) : '--'}
            {avgTeamScore > 0 && (
              <span
                className={cn(
                  'ml-1 font-bold',
                  teamGrade === 'A' ? 'text-green-400' :
                  teamGrade === 'B' ? 'text-blue-400' :
                  teamGrade === 'C' ? 'text-yellow-400' :
                  teamGrade === 'D' ? 'text-orange-400' :
                  'text-red-400'
                )}
              >
                {teamGrade}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Reps with Data</span>
          <span className="text-gray-200 font-medium">
            {repsWithData} / {stats.length}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Avg per Rep</span>
          <span className="text-gray-200 font-medium">
            {stats.length > 0 ? (totalScorecards / stats.length).toFixed(1) : '--'}
          </span>
        </div>
      </div>
    </InsightCard>
  );
}

/** Top Improving Areas card — derived from team stats trend_direction. */
function ImprovingAreasCard({
  stats,
}: {
  stats: TeamMemberStats[];
}) {
  // Categorize reps by performance trend
  const improving = stats.filter((r) => r.trend_direction > 2);
  const declining = stats.filter((r) => r.trend_direction < -2);
  const stable = stats.filter(
    (r) => r.trend_direction >= -2 && r.trend_direction <= 2
  );

  // Compute grade distribution across all reps
  const totalGradeA = stats.reduce((s, r) => s + r.grade_a, 0);
  const totalGradeB = stats.reduce((s, r) => s + r.grade_b, 0);
  const totalGradeC = stats.reduce((s, r) => s + r.grade_c, 0);
  const totalGradeD = stats.reduce((s, r) => s + r.grade_d, 0);
  const totalGradeF = stats.reduce((s, r) => s + r.grade_f, 0);
  const totalCards = totalGradeA + totalGradeB + totalGradeC + totalGradeD + totalGradeF;

  // Grade distribution bars
  const gradeBars = [
    { grade: 'A', count: totalGradeA, color: 'bg-green-500' },
    { grade: 'B', count: totalGradeB, color: 'bg-blue-500' },
    { grade: 'C', count: totalGradeC, color: 'bg-yellow-500' },
    { grade: 'D', count: totalGradeD, color: 'bg-orange-500' },
    { grade: 'F', count: totalGradeF, color: 'bg-red-500' },
  ];

  return (
    <InsightCard>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
          <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-200">Team Trends</h3>
      </div>

      {/* Trend summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center">
          <p className="text-lg font-bold text-green-400">{improving.length}</p>
          <p className="text-[10px] text-gray-500 leading-tight">Improving</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-400">{stable.length}</p>
          <p className="text-[10px] text-gray-500 leading-tight">Stable</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-red-400">{declining.length}</p>
          <p className="text-[10px] text-gray-500 leading-tight">Declining</p>
        </div>
      </div>

      {/* Grade distribution */}
      {totalCards > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500 font-medium">Grade Distribution</p>
          {gradeBars.map((bar) => {
            const pct = totalCards > 0 ? (bar.count / totalCards) * 100 : 0;
            if (bar.count === 0) return null;
            return (
              <div key={bar.grade} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-3 font-medium">{bar.grade}</span>
                <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', bar.color)}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-600 w-6 text-right tabular-nums">
                  {bar.count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </InsightCard>
  );
}

// ============================================================================
// Empty states
// ============================================================================

function ConfigEmptyState() {
  const navigate = useNavigate();
  return (
    <InsightCard className="flex flex-col items-center justify-center py-6 text-center">
      <Settings2 className="h-5 w-5 text-gray-600 mb-2" />
      <p className="text-sm text-gray-400 mb-1">No configuration data yet</p>
      <p className="text-xs text-gray-600 mb-3">
        Configure your org settings so 60 can learn your preferences
      </p>
      <button
        onClick={() => navigate('/settings/ai-intelligence')}
        className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        Go to Settings
        <ArrowRight className="h-3 w-3" />
      </button>
    </InsightCard>
  );
}

function CoachingEmptyState() {
  return (
    <InsightCard className="flex flex-col items-center justify-center py-6 text-center">
      <BarChart3 className="h-5 w-5 text-gray-600 mb-2" />
      <p className="text-sm text-gray-400 mb-1">No coaching data this period</p>
      <p className="text-xs text-gray-600">
        Scorecards are generated after meetings are analysed
      </p>
    </InsightCard>
  );
}

function TrendsEmptyState() {
  return (
    <InsightCard className="flex flex-col items-center justify-center py-6 text-center">
      <Target className="h-5 w-5 text-gray-600 mb-2" />
      <p className="text-sm text-gray-400 mb-1">Not enough data for trends</p>
      <p className="text-xs text-gray-600">
        Trend analysis requires multiple scorecards over time
      </p>
    </InsightCard>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function OrgLearningInsightsPanel({ orgId }: OrgLearningInsightsPanelProps) {
  const { user } = useAuth();

  const {
    data: configData,
    isLoading: configLoading,
    isError: configError,
  } = useConfigCompleteness(orgId, user?.id);

  const {
    data: teamStats = [],
    isLoading: statsLoading,
  } = useTeamCoachingStats(orgId, '30d');

  // Loading state
  if (configLoading || statsLoading) {
    return <InsightsSkeleton />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {/* Team Configuration */}
      {configError || !configData ? (
        <ConfigEmptyState />
      ) : (
        <TeamConfigCard config={configData} />
      )}

      {/* Coaching Activity */}
      {teamStats.length === 0 ? (
        <CoachingEmptyState />
      ) : (
        <CoachingActivityCard stats={teamStats} />
      )}

      {/* Team Trends / Improving Areas */}
      {teamStats.length === 0 ? (
        <TrendsEmptyState />
      ) : (
        <ImprovingAreasCard stats={teamStats} />
      )}
    </div>
  );
}

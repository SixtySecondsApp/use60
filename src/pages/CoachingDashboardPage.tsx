/**
 * CoachingDashboardPage — COACH-UI-001
 *
 * Route: /coaching
 * Team-wide coaching overview: rep performance cards, skill progression,
 * team leaderboard, and org learning insights.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  GraduationCap,
  Users,
  Lightbulb,
  Trophy,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrg } from '@/lib/contexts/OrgContext';
import {
  useTeamCoachingStats,
  type CoachingPeriod,
  type TeamMemberStats,
} from '@/lib/services/coachingDashboardService';
import { RepPerformanceCard } from '@/components/coaching/RepPerformanceCard';
import { TeamLeaderboard } from '@/components/coaching/TeamLeaderboard';
import { OrgLearningInsightsPanel } from '@/components/coaching/OrgLearningInsightsPanel';

// ============================================================================
// Period Picker
// ============================================================================

const PERIODS: { value: CoachingPeriod; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '365d', label: '1y' },
];

function PeriodPicker({
  value,
  onChange,
}: {
  value: CoachingPeriod;
  onChange: (v: CoachingPeriod) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-0.5">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
            value === p.value
              ? 'bg-indigo-500 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-300'
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Tab nav
// ============================================================================

type Tab = 'overview' | 'leaderboard' | 'insights';

const TABS: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Team Overview', Icon: Users },
  { id: 'leaderboard', label: 'Leaderboard', Icon: Trophy },
  { id: 'insights', label: 'Org Insights', Icon: Lightbulb },
];

// ============================================================================
// Summary stat strip
// ============================================================================

interface StatStripProps {
  stats: TeamMemberStats[];
}

function StatStrip({ stats }: StatStripProps) {
  if (stats.length === 0) return null;

  const totalScorecards = stats.reduce((s, r) => s + r.scorecard_count, 0);
  const avgTeamScore =
    stats.length > 0
      ? stats.reduce((s, r) => s + r.avg_score * r.scorecard_count, 0) /
        Math.max(totalScorecards, 1)
      : 0;
  const improving = stats.filter((r) => r.trend_direction > 2).length;

  const items = [
    { label: 'Reps Tracked', value: stats.length },
    { label: 'Total Scorecards', value: totalScorecards },
    { label: 'Team Avg Score', value: avgTeamScore.toFixed(1) },
    { label: 'Improving', value: `${improving} / ${stats.length}` },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3"
        >
          <p className="text-xs text-gray-500">{item.label}</p>
          <p className="text-xl font-bold text-gray-100 mt-0.5">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Rep cards grid
// ============================================================================

function RepCardsGrid({
  stats,
  orgId,
  period,
  onRepSelect,
  selectedRepId,
}: {
  stats: TeamMemberStats[];
  orgId: string;
  period: CoachingPeriod;
  onRepSelect: (userId: string) => void;
  selectedRepId: string | null;
}) {
  if (stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-600 gap-2">
        <Users className="h-6 w-6" />
        <p className="text-sm">No coaching data for this period</p>
      </div>
    );
  }

  // Sort by avg_score descending
  const sorted = [...stats].sort((a, b) => b.avg_score - a.avg_score);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((repStats) => (
        <RepPerformanceCard
          key={repStats.user_id}
          stats={repStats}
          profile={{
            id: repStats.user_id,
            name: 'Rep',
            email: '',
          }}
          onClick={() => onRepSelect(repStats.user_id)}
          selected={selectedRepId === repStats.user_id}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function CoachingDashboardPage() {
  const navigate = useNavigate();
  const { activeOrgId } = useOrg();
  const [period, setPeriod] = useState<CoachingPeriod>('30d');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);

  const { data: teamStats = [], isLoading: statsLoading } = useTeamCoachingStats(
    activeOrgId ?? '',
    period
  );

  const handleRepSelect = (userId: string) => {
    setSelectedRepId(userId);
    navigate(`/coaching/rep/${userId}`);
  };

  return (
    <>
      <Helmet>
        <title>Coaching & Team Intelligence | 60</title>
      </Helmet>

      <div className="flex flex-col h-full bg-gray-950">
        {/* Page header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <GraduationCap className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-100">Coaching</h1>
              <p className="text-xs text-gray-500">Team performance & org learning</p>
            </div>
          </div>

          <PeriodPicker value={period} onChange={setPeriod} />
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 px-6 border-b border-gray-800 flex-shrink-0">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-all',
                activeTab === id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

            {/* Overview tab */}
            {activeTab === 'overview' && (
              <>
                {/* Stat strip */}
                {!statsLoading && (
                  <StatStrip stats={teamStats} />
                )}

                {/* Rep cards */}
                <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5">
                  <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-indigo-400" />
                    Rep Performance
                  </h2>

                  {statsLoading ? (
                    <div className="flex items-center justify-center h-40">
                      <div className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                    </div>
                  ) : (
                    <RepCardsGrid
                      stats={teamStats}
                      orgId={activeOrgId ?? ''}
                      period={period}
                      onRepSelect={handleRepSelect}
                      selectedRepId={selectedRepId}
                    />
                  )}
                </div>
              </>
            )}

            {/* Leaderboard tab */}
            {activeTab === 'leaderboard' && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5">
                <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  Team Leaderboard
                </h2>
                <TeamLeaderboard
                  onRepSelect={handleRepSelect}
                  selectedUserId={selectedRepId ?? undefined}
                />
              </div>
            )}

            {/* Insights tab */}
            {activeTab === 'insights' && activeOrgId && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  <h2 className="text-sm font-semibold text-gray-200">
                    Org Learning Insights
                  </h2>
                  <span className="text-xs text-gray-600">
                    — patterns extracted from your team's coaching analyses
                  </span>
                </div>
                <OrgLearningInsightsPanel orgId={activeOrgId} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

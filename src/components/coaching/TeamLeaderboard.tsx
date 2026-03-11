import React from 'react';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  ClipboardCheck,
  Crown,
  Medal,
  Award,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeamScorecardLeaderboard } from '@/lib/hooks/useCoachingScorecard';
import { gradeBgColour, gradeColour } from '@/lib/services/coachingDashboardService';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface TeamLeaderboardProps {
  onRepSelect: (userId: string) => void;
  selectedUserId?: string;
}

/** Derive letter grade from numeric score */
function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/** Get initials from a name string */
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Determine trend from grade distribution — heuristic: more A/B than D/F = improving */
function getTrend(gradeDistribution: Record<string, number>): 'up' | 'down' | 'stable' {
  const good = (gradeDistribution['A'] || 0) + (gradeDistribution['B'] || 0);
  const bad = (gradeDistribution['D'] || 0) + (gradeDistribution['F'] || 0);
  const total = Object.values(gradeDistribution).reduce((s, v) => s + v, 0);

  if (total < 2) return 'stable';
  const goodRatio = good / total;
  const badRatio = bad / total;

  if (goodRatio > 0.6) return 'up';
  if (badRatio > 0.4) return 'down';
  return 'stable';
}

/** Rank badge for top 3 */
function RankIndicator({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-amber-500/15 border border-amber-500/30">
        <Crown className="h-3.5 w-3.5 text-amber-400" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-gray-400/15 border border-gray-400/30">
        <Medal className="h-3.5 w-3.5 text-gray-300" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-orange-500/15 border border-orange-500/30">
        <Award className="h-3.5 w-3.5 text-orange-400" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center h-7 w-7">
      <span className="text-xs font-semibold text-gray-500">{rank}</span>
    </div>
  );
}

function TrendIndicator({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') {
    return (
      <div className="flex items-center gap-1 text-green-400" title="Improving">
        <TrendingUp className="h-3.5 w-3.5" />
      </div>
    );
  }
  if (trend === 'down') {
    return (
      <div className="flex items-center gap-1 text-red-400" title="Declining">
        <TrendingDown className="h-3.5 w-3.5" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-gray-600" title="Stable">
      <Minus className="h-3.5 w-3.5" />
    </div>
  );
}

/** Loading skeleton */
function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-6 w-14 rounded-full" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-3.5 w-8" />
        </div>
      ))}
    </div>
  );
}

export function TeamLeaderboard({ onRepSelect, selectedUserId }: TeamLeaderboardProps) {
  const { leaderboard, loading, error } = useTeamScorecardLeaderboard();

  if (loading) {
    return <LeaderboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-500 gap-2">
        <Trophy className="h-5 w-5 text-gray-600" />
        <p className="text-sm">Failed to load leaderboard</p>
        <p className="text-xs text-gray-600">{error}</p>
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-500 gap-2">
        <ClipboardCheck className="h-5 w-5 text-gray-600" />
        <p className="text-sm">No scorecard data yet</p>
        <p className="text-xs text-gray-600">
          Scorecards are generated after meetings are analysed
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-xs text-gray-600 font-medium">
        <div className="w-7 text-center">#</div>
        <div className="w-8" />
        <div className="flex-1">Rep</div>
        <div className="w-20 text-center">Avg Score</div>
        <div className="w-8 text-center">Trend</div>
        <div className="w-16 text-right">Cards</div>
      </div>

      {/* Leaderboard rows */}
      {leaderboard.map((rep, index) => {
        const rank = index + 1;
        const grade = scoreToGrade(rep.avg_score);
        const trend = getTrend(rep.grade_distribution);
        const isSelected = selectedUserId === rep.user_id;

        return (
          <button
            key={rep.user_id}
            onClick={() => onRepSelect(rep.user_id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left',
              'hover:bg-gray-800/60',
              isSelected
                ? 'bg-indigo-500/10 border border-indigo-500/30'
                : 'border border-transparent',
              rank === 1 && !isSelected && 'bg-amber-500/[0.04]'
            )}
          >
            {/* Rank */}
            <RankIndicator rank={rank} />

            {/* Avatar */}
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-gray-800 text-gray-300 text-xs font-medium">
                {getInitials(rep.user_name)}
              </AvatarFallback>
            </Avatar>

            {/* Name & email */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">
                {rep.user_name}
              </p>
              {rep.user_email && (
                <p className="text-xs text-gray-500 truncate">{rep.user_email}</p>
              )}
            </div>

            {/* Score badge */}
            <div className="w-20 flex justify-center">
              <Badge
                className={cn(
                  'text-xs font-semibold border px-2 py-0.5',
                  gradeBgColour(grade)
                )}
              >
                {rep.avg_score}
                <span className={cn('ml-1 font-bold', gradeColour(grade))}>{grade}</span>
              </Badge>
            </div>

            {/* Trend */}
            <div className="w-8 flex justify-center">
              <TrendIndicator trend={trend} />
            </div>

            {/* Scorecard count */}
            <div className="w-16 text-right">
              <span className="text-xs text-gray-400 tabular-nums">
                {rep.scorecard_count}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

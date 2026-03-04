/**
 * TeamLeaderboard — COACH-UI-004
 *
 * Ranked list using useTeamScorecardLeaderboard().
 * Columns: rank, name, avg score, total scorecards, trend.
 * Sortable. Top 3 highlighted.
 */

import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, Award, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeamScorecardLeaderboard } from '@/lib/hooks/useCoachingScorecard';
import { gradeColour } from '@/lib/services/coachingDashboardService';

type SortKey = 'rank' | 'avg_score' | 'scorecard_count';
type SortDir = 'asc' | 'desc';

const MEDAL_COLOURS = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];
const MEDAL_LABELS = ['1st', '2nd', '3rd'];

function SortIcon({ col, active, dir }: { col: SortKey; active: SortKey; dir: SortDir }) {
  if (col !== active) return <ArrowUpDown className="h-3.5 w-3.5 text-gray-600" />;
  return dir === 'asc'
    ? <ArrowUp className="h-3.5 w-3.5 text-indigo-400" />
    : <ArrowDown className="h-3.5 w-3.5 text-indigo-400" />;
}

function dominantGrade(dist: Record<string, number>): string {
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  if (!entries.length || entries[0][1] === 0) return '-';
  return entries[0][0];
}

interface TeamLeaderboardProps {
  onRepSelect?: (userId: string) => void;
  selectedUserId?: string;
}

export function TeamLeaderboard({ onRepSelect, selectedUserId }: TeamLeaderboardProps) {
  const { leaderboard, loading, error } = useTeamScorecardLeaderboard();
  const [sortKey, setSortKey] = useState<SortKey>('avg_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const items = [...leaderboard];
    items.sort((a, b) => {
      let diff = 0;
      if (sortKey === 'avg_score') diff = a.avg_score - b.avg_score;
      else if (sortKey === 'scorecard_count') diff = a.scorecard_count - b.scorecard_count;
      return sortDir === 'desc' ? -diff : diff;
    });
    return items;
  }, [leaderboard, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-40 text-red-400 text-sm">
        Failed to load leaderboard
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-600 gap-2">
        <Users className="h-6 w-6" />
        <p className="text-sm">No scorecard data yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500 w-10">#</th>
            <th className="text-left py-2 pr-3 text-xs font-medium text-gray-500">Rep</th>
            <th className="py-2 pr-3 text-xs font-medium text-gray-500">
              <button
                className="flex items-center gap-1 hover:text-gray-300 transition-colors"
                onClick={() => toggleSort('avg_score')}
              >
                Avg Score
                <SortIcon col="avg_score" active={sortKey} dir={sortDir} />
              </button>
            </th>
            <th className="py-2 pr-3 text-xs font-medium text-gray-500">
              <button
                className="flex items-center gap-1 hover:text-gray-300 transition-colors"
                onClick={() => toggleSort('scorecard_count')}
              >
                Scorecards
                <SortIcon col="scorecard_count" active={sortKey} dir={sortDir} />
              </button>
            </th>
            <th className="text-left py-2 text-xs font-medium text-gray-500">Grade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {sorted.map((rep, idx) => {
            const isTopThree = idx < 3;
            const grade = dominantGrade(rep.grade_distribution);
            const isSelected = rep.user_id === selectedUserId;

            return (
              <tr
                key={rep.user_id}
                onClick={() => onRepSelect?.(rep.user_id)}
                className={cn(
                  'cursor-pointer transition-colors',
                  isSelected
                    ? 'bg-indigo-500/10'
                    : 'hover:bg-gray-800/40'
                )}
              >
                {/* Rank */}
                <td className="py-2.5 pr-3">
                  {isTopThree ? (
                    <div className="flex items-center gap-1">
                      <Award className={cn('h-3.5 w-3.5', MEDAL_COLOURS[idx])} />
                      <span className={cn('text-xs font-medium', MEDAL_COLOURS[idx])}>
                        {MEDAL_LABELS[idx]}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-600">{idx + 1}</span>
                  )}
                </td>

                {/* Name */}
                <td className="py-2.5 pr-3">
                  <div>
                    <p className="font-medium text-gray-200 text-sm">{rep.user_name}</p>
                    <p className="text-xs text-gray-600 truncate max-w-[150px]">{rep.user_email}</p>
                  </div>
                </td>

                {/* Avg Score */}
                <td className="py-2.5 pr-3 text-center">
                  <span className={cn('font-bold text-sm', gradeColour(grade))}>
                    {rep.avg_score.toFixed(1)}
                  </span>
                </td>

                {/* Scorecard count */}
                <td className="py-2.5 pr-3 text-center">
                  <span className="text-gray-400 text-sm">{rep.scorecard_count}</span>
                </td>

                {/* Grade */}
                <td className="py-2.5">
                  {grade !== '-' && (
                    <span className={cn('text-xs font-bold', gradeColour(grade))}>
                      {grade}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

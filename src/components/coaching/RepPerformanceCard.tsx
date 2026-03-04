/**
 * RepPerformanceCard — COACH-UI-002
 *
 * Displays per-rep scorecard stats:
 * - Avatar, name, avg score, grade distribution
 * - Trend sparkline (last 4 weeks from skill progression)
 * - Click → drill-down to rep detail
 */

import React from 'react';
import { TrendingUp, TrendingDown, Minus, User } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { gradeColour, gradeBgColour, type TeamMemberStats } from '@/lib/services/coachingDashboardService';

interface RepProfile {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

interface RepPerformanceCardProps {
  stats: TeamMemberStats;
  profile: RepProfile;
  sparkData?: Array<{ week: string; score: number }>;
  onClick?: () => void;
  selected?: boolean;
}

function TrendIcon({ direction }: { direction: number }) {
  if (direction > 2) return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (direction < -2) return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-gray-500" />;
}

function DominantGrade(dist: TeamMemberStats['grade_distribution']): string {
  const entries = Object.entries(dist) as [string, number][];
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] === 0) return '-';
  return sorted[0][0];
}

export function RepPerformanceCard({
  stats,
  profile,
  sparkData = [],
  onClick,
  selected = false,
}: RepPerformanceCardProps) {
  const dominantGrade = DominantGrade(stats.grade_distribution);
  const initials = profile.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const hasData = stats.scorecard_count > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border p-4 transition-all duration-150 hover:border-gray-600',
        selected
          ? 'border-indigo-500/50 bg-indigo-500/5'
          : 'border-gray-800 bg-gray-900/50 hover:bg-gray-900'
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center border border-gray-700">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.name} className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-gray-300">{initials}</span>
          )}
        </div>

        {/* Name + score */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-100 truncate">{profile.name}</p>
            {hasData && dominantGrade !== '-' && (
              <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded border', gradeBgColour(dominantGrade))}>
                {dominantGrade}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{profile.email}</p>
        </div>

        {/* Avg score + trend */}
        <div className="flex-shrink-0 flex items-center gap-1.5">
          {hasData ? (
            <>
              <span className={cn('text-lg font-bold', gradeColour(dominantGrade))}>
                {stats.avg_score.toFixed(0)}
              </span>
              <TrendIcon direction={stats.trend_direction} />
            </>
          ) : (
            <span className="text-xs text-gray-600">No data</span>
          )}
        </div>
      </div>

      {/* Grade distribution + sparkline */}
      {hasData && (
        <div className="mt-3 flex items-end gap-4">
          {/* Grade pills */}
          <div className="flex gap-1.5 flex-wrap flex-1">
            {(['A', 'B', 'C', 'D', 'F'] as const).map((grade) => {
              const count = stats.grade_distribution[grade];
              if (count === 0) return null;
              return (
                <span
                  key={grade}
                  className={cn('text-xs px-1.5 py-0.5 rounded border', gradeBgColour(grade))}
                >
                  {grade}: {count}
                </span>
              );
            })}
          </div>

          {/* Sparkline */}
          {sparkData.length > 1 && (
            <div className="h-8 w-20 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparkData}>
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#6366f1"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Scorecard count */}
      <div className="mt-2 text-xs text-gray-600">
        {stats.scorecard_count} scorecard{stats.scorecard_count !== 1 ? 's' : ''}
      </div>
    </button>
  );
}

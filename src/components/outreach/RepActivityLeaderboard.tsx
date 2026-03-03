import React, { useState } from 'react';
import { Trophy, Medal, Award, Loader2, Users } from 'lucide-react';
import type { RepActivityRow, OutreachPeriod } from '@/lib/types/outreachAnalytics';

type SortMetric = 'emailsSent' | 'meetingsBooked' | 'tasksCompleted';

interface Props {
  rows: RepActivityRow[];
  isLoading: boolean;
  period: OutreachPeriod;
  onPeriodChange: (p: OutreachPeriod) => void;
}

const PERIOD_OPTIONS: { value: OutreachPeriod; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

function getRankIcon(rank: number) {
  switch (rank) {
    case 1: return <Trophy className="h-4 w-4 text-yellow-400" />;
    case 2: return <Medal className="h-4 w-4 text-gray-400" />;
    case 3: return <Award className="h-4 w-4 text-amber-500" />;
    default: return <span className="w-4 text-center text-xs font-bold text-gray-500">{rank}</span>;
  }
}

export function RepActivityLeaderboard({ rows, isLoading, period, onPeriodChange }: Props) {
  const [sortBy, setSortBy] = useState<SortMetric>('emailsSent');

  const sorted = [...rows].sort((a, b) => b[sortBy] - a[sortBy]).map((r, i) => ({ ...r, rank: i + 1 }));

  const SORT_OPTIONS: { value: SortMetric; label: string }[] = [
    { value: 'emailsSent', label: 'Emails Sent' },
    { value: 'meetingsBooked', label: 'Meetings' },
    { value: 'tasksCompleted', label: 'Tasks' },
  ];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Rep Activity</h3>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">Outreach leaderboard</p>
        </div>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.value}
              onClick={() => onPeriodChange(p.value)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
                period === p.value
                  ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                  : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-transparent'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sort tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-gray-100 dark:border-gray-800/50">
        {SORT_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => setSortBy(o.value)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
              sortBy === o.value
                ? 'text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700'
                : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-1.5">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-400" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-3 text-gray-400 dark:text-gray-500">
            <Users className="h-8 w-8 opacity-30" />
            <p className="text-sm">No activity data for this period</p>
          </div>
        ) : (
          sorted.map((rep) => (
            <div
              key={rep.userId}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-colors ${
                rep.rank === 1
                  ? 'border-yellow-500/20 bg-yellow-50/80 dark:bg-yellow-500/5'
                  : 'border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30'
              }`}
            >
              <div className="flex items-center justify-center w-6 shrink-0">
                {getRankIcon(rep.rank)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{rep.displayName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  {rep.meetingsBooked} meetings · {rep.tasksCompleted} tasks
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{rep[sortBy].toLocaleString()}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-500">
                  {sortBy === 'emailsSent' ? 'sent' : sortBy === 'meetingsBooked' ? 'booked' : 'done'}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

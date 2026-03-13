import React from 'react';
import type { TeamMemberStats } from '@/lib/services/coachingDashboardService';

interface RepPerformanceCardProps {
  stats: TeamMemberStats;
  profile: { id: string; name: string; email: string };
  onClick?: () => void;
  selected?: boolean;
}

export function RepPerformanceCard({ stats, profile, onClick, selected }: RepPerformanceCardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 cursor-pointer ${selected ? 'border-indigo-500' : 'border-gray-800'}`}
    >
      <p className="text-sm font-medium text-gray-200">{profile.name}</p>
      <p className="text-xs text-gray-500">Avg: {stats.avg_score.toFixed(1)} | {stats.scorecard_count} scorecards</p>
    </div>
  );
}

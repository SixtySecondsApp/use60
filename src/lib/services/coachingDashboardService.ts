import { useQuery } from '@tanstack/react-query';

export type CoachingPeriod = '7d' | '30d' | '90d' | '365d';

export interface TeamMemberStats {
  user_id: string;
  scorecard_count: number;
  avg_score: number;
  trend_direction: number;
}

export function useTeamCoachingStats(orgId: string, period: CoachingPeriod) {
  return useQuery<TeamMemberStats[]>({
    queryKey: ['team-coaching-stats', orgId, period],
    queryFn: async () => [],
    enabled: !!orgId,
  });
}

export interface RepScorecard {
  id: string;
  meeting_id: string;
  overall_score: number;
  grade: string;
  created_at: string;
}

export function useRepScorecards(userId: string) {
  return useQuery<RepScorecard[]>({
    queryKey: ['rep-scorecards', userId],
    queryFn: async () => [],
    enabled: !!userId,
  });
}

export function useSkillProgression(userId: string, orgId: string) {
  return useQuery({
    queryKey: ['skill-progression', userId, orgId],
    queryFn: async () => [],
    enabled: !!userId && !!orgId,
  });
}

export function gradeBgColour(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-green-500/15 border-green-500/30 text-green-400';
    case 'B': return 'bg-blue-500/15 border-blue-500/30 text-blue-400';
    case 'C': return 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400';
    case 'D': return 'bg-orange-500/15 border-orange-500/30 text-orange-400';
    default: return 'bg-red-500/15 border-red-500/30 text-red-400';
  }
}

export function gradeColour(grade: string): string {
  switch (grade) {
    case 'A': return 'text-green-400';
    case 'B': return 'text-blue-400';
    case 'C': return 'text-yellow-400';
    case 'D': return 'text-orange-400';
    default: return 'text-red-400';
  }
}

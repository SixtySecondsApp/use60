import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

export type CoachingPeriod = '7d' | '30d' | '90d' | '365d';

export interface TeamMemberStats {
  user_id: string;
  scorecard_count: number;
  avg_score: number;
  grade_a: number;
  grade_b: number;
  grade_c: number;
  grade_d: number;
  grade_f: number;
  trend_direction: number;
}

export function useTeamCoachingStats(orgId: string, period: CoachingPeriod) {
  return useQuery<TeamMemberStats[]>({
    queryKey: ['team-coaching-stats', orgId, period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_coaching_stats', {
        p_org_id: orgId,
        p_period: period,
      });
      if (error) throw error;
      return (data ?? []) as TeamMemberStats[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meeting_scorecards')
        .select('id, meeting_id, overall_score, grade, created_at')
        .eq('rep_user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as RepScorecard[];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export interface SkillProgressionEntry {
  id: string;
  org_id: string;
  user_id: string;
  week_start: string;
  talk_ratio: number | null;
  question_quality_score: number | null;
  objection_handling_score: number | null;
  discovery_depth_score: number | null;
  overall_score: number | null;
  meetings_analysed: number;
  forecast_accuracy: number | null;
  competitive_win_rate: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useSkillProgression(userId: string, orgId: string) {
  return useQuery<SkillProgressionEntry[]>({
    queryKey: ['skill-progression', userId, orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_coaching_progression', {
        p_org_id: orgId,
        p_user_id: userId,
        p_weeks: 8,
      });
      if (error) throw error;
      return (data ?? []) as SkillProgressionEntry[];
    },
    enabled: !!userId && !!orgId,
    staleTime: 5 * 60 * 1000,
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

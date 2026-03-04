/**
 * Coaching Dashboard Service — PRD-108
 *
 * Wraps:
 *   - get_team_coaching_stats RPC (COACH-UI-007)
 *   - get_active_org_insights RPC (COACH-UI-008)
 *   - coaching_skill_progression table
 *   - meeting_scorecards table (rep drill-down)
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

export type CoachingPeriod = '7d' | '30d' | '90d' | '365d';

export interface TeamMemberStats {
  user_id: string;
  scorecard_count: number;
  avg_score: number;
  grade_distribution: { A: number; B: number; C: number; D: number; F: number };
  trend_direction: number;
}

export interface OrgLearningInsight {
  id: string;
  org_id: string;
  insight_type:
    | 'winning_talk_track'
    | 'objection_handling'
    | 'optimal_cadence'
    | 'competitive_positioning'
    | 'stage_best_practice'
    | 'discovery_pattern';
  title: string;
  insight_text: string;
  evidence_count: number;
  confidence_score: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillProgressionRow {
  id: string;
  user_id: string;
  org_id: string;
  week_start: string;
  talk_ratio_score: number | null;
  question_quality_score: number | null;
  objection_handling_score: number | null;
  discovery_depth_score: number | null;
  overall_score: number | null;
  created_at: string;
}

export interface RepScorecardSummary {
  id: string;
  meeting_id: string;
  rep_user_id: string;
  overall_score: number;
  grade: string;
  created_at: string;
  strengths: string[];
  areas_for_improvement: string[];
}

// ============================================================================
// Query keys
// ============================================================================

const QK = {
  teamStats: (orgId: string, period: CoachingPeriod) =>
    ['coaching-team-stats', orgId, period] as const,
  orgInsights: (orgId: string) =>
    ['coaching-org-insights', orgId] as const,
  skillProgression: (userId: string, orgId: string) =>
    ['coaching-skill-progression', userId, orgId] as const,
  repScorecards: (userId: string) =>
    ['coaching-rep-scorecards', userId] as const,
};

// ============================================================================
// Team coaching stats RPC
// ============================================================================

async function fetchTeamCoachingStats(
  orgId: string,
  period: CoachingPeriod
): Promise<TeamMemberStats[]> {
  const { data, error } = await supabase.rpc('get_team_coaching_stats', {
    p_org_id: orgId,
    p_period: period,
  });
  if (error) throw error;

  return ((data as any[]) ?? []).map((row) => ({
    user_id: row.user_id,
    scorecard_count: Number(row.scorecard_count),
    avg_score: Number(row.avg_score),
    grade_distribution: {
      A: Number(row.grade_a),
      B: Number(row.grade_b),
      C: Number(row.grade_c),
      D: Number(row.grade_d),
      F: Number(row.grade_f),
    },
    trend_direction: Number(row.trend_direction),
  }));
}

export function useTeamCoachingStats(orgId: string, period: CoachingPeriod) {
  return useQuery({
    queryKey: QK.teamStats(orgId, period),
    queryFn: () => fetchTeamCoachingStats(orgId, period),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Org learning insights RPC
// ============================================================================

async function fetchOrgInsights(orgId: string): Promise<OrgLearningInsight[]> {
  const { data, error } = await supabase.rpc('get_active_org_insights', {
    p_org_id: orgId,
  });
  if (error) throw error;
  return (data as OrgLearningInsight[]) ?? [];
}

export function useOrgLearningInsights(orgId: string) {
  return useQuery({
    queryKey: QK.orgInsights(orgId),
    queryFn: () => fetchOrgInsights(orgId),
    enabled: !!orgId,
    staleTime: 10 * 60 * 1000,
  });
}

// ============================================================================
// Skill progression (weekly trends per rep)
// ============================================================================

async function fetchSkillProgression(
  userId: string,
  orgId: string
): Promise<SkillProgressionRow[]> {
  const { data, error } = await supabase
    .from('coaching_skill_progression')
    .select(
      'id, user_id, org_id, week_start, talk_ratio_score, question_quality_score, objection_handling_score, discovery_depth_score, overall_score, created_at'
    )
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .order('week_start', { ascending: true })
    .limit(52);
  if (error) throw error;
  return (data as SkillProgressionRow[]) ?? [];
}

export function useSkillProgression(userId: string, orgId: string) {
  return useQuery({
    queryKey: QK.skillProgression(userId, orgId),
    queryFn: () => fetchSkillProgression(userId, orgId),
    enabled: !!(userId && orgId),
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Rep scorecard history (drill-down)
// ============================================================================

async function fetchRepScorecards(userId: string): Promise<RepScorecardSummary[]> {
  const { data, error } = await supabase
    .from('meeting_scorecards')
    .select(
      'id, meeting_id, rep_user_id, overall_score, grade, created_at, strengths, areas_for_improvement'
    )
    .eq('rep_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as RepScorecardSummary[]) ?? [];
}

export function useRepScorecards(userId: string) {
  return useQuery({
    queryKey: QK.repScorecards(userId),
    queryFn: () => fetchRepScorecards(userId),
    enabled: !!userId,
    staleTime: 3 * 60 * 1000,
  });
}

// ============================================================================
// Helper: grade colour classes
// ============================================================================

export function gradeColour(grade: string): string {
  switch (grade) {
    case 'A': return 'text-emerald-400';
    case 'B': return 'text-blue-400';
    case 'C': return 'text-amber-400';
    case 'D': return 'text-red-400';
    default:  return 'text-red-600';
  }
}

export function gradeBgColour(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'B': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'C': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'D': return 'bg-red-500/10 text-red-400 border-red-500/20';
    default:  return 'bg-red-600/10 text-red-600 border-red-600/20';
  }
}

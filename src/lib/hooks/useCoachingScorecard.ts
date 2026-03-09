/**
 * React hooks for Rep Coaching Scorecards
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import type {
  MeetingScorecard,
  CoachingScorecardTemplate,
  MeetingType,
} from '@/lib/types/meetingIntelligence';

// =====================================================
// useMeetingScorecard Hook
// =====================================================

/**
 * Hook to get and manage scorecard for a specific meeting
 */
export function useMeetingScorecard(meetingId: string | null) {
  const [scorecard, setScorecard] = useState<MeetingScorecard | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch scorecard
  const fetchScorecard = useCallback(async () => {
    if (!meetingId) {
      setScorecard(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('meeting_scorecards')
        .select('*')
        .eq('meeting_id', meetingId)
        .maybeSingle();

      if (queryError) throw queryError;

      setScorecard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch scorecard');
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  // Generate scorecard (call edge function)
  const generateScorecard = useCallback(async (templateId?: string) => {
    if (!meetingId) return null;

    try {
      setGenerating(true);
      setError(null);

      const { data, error: funcError } = await supabase.functions.invoke(
        'meeting-router',
        {
          body: { action: 'generate_scorecard', meetingId, templateId },
        }
      );

      if (funcError) throw funcError;

      if (data?.success) {
        await fetchScorecard();
        toast.success(`Scorecard generated: ${data.scorecard?.grade || 'N/A'}`);
        return data.scorecard;
      } else {
        throw new Error(data?.error || 'Failed to generate scorecard');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate scorecard';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setGenerating(false);
    }
  }, [meetingId, fetchScorecard]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!meetingId) return;

    fetchScorecard();

    const channel = supabase
      .channel(`meeting_scorecard:${meetingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_scorecards',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setScorecard(null);
          } else {
            setScorecard(payload.new as MeetingScorecard);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [meetingId, fetchScorecard]);

  return {
    scorecard,
    loading,
    generating,
    error,
    refresh: fetchScorecard,
    generateScorecard,
  };
}

// =====================================================
// useScorecardTemplates Hook
// =====================================================

/**
 * Hook to manage scorecard templates for an organization
 */
export function useScorecardTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<CoachingScorecardTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    if (!user) {
      setTemplates([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get user's org_id
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership?.org_id) {
        throw new Error('User is not a member of any organization');
      }

      const { data, error: queryError } = await supabase
        .from('coaching_scorecard_templates')
        .select('*')
        .eq('org_id', membership.org_id)
        .eq('is_active', true)
        .order('meeting_type');

      if (queryError) throw queryError;

      setTemplates(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Create template
  const createTemplate = useCallback(async (template: Partial<CoachingScorecardTemplate>) => {
    if (!user) return null;

    try {
      // Get user's org_id
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership?.org_id) {
        throw new Error('User is not a member of any organization');
      }

      const { data, error: insertError } = await supabase
        .from('coaching_scorecard_templates')
        .insert({
          ...template,
          org_id: membership.org_id,
          created_by: user.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await fetchTemplates();
      toast.success('Template created');
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create template';
      toast.error(message);
      return null;
    }
  }, [user, fetchTemplates]);

  // Update template
  const updateTemplate = useCallback(async (
    templateId: string,
    updates: Partial<CoachingScorecardTemplate>
  ) => {
    try {
      const { error: updateError } = await supabase
        .from('coaching_scorecard_templates')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', templateId);

      if (updateError) throw updateError;

      await fetchTemplates();
      toast.success('Template updated');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update template';
      toast.error(message);
      return false;
    }
  }, [fetchTemplates]);

  // Delete template (soft delete)
  const deleteTemplate = useCallback(async (templateId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('coaching_scorecard_templates')
        .update({ is_active: false })
        .eq('id', templateId);

      if (deleteError) throw deleteError;

      await fetchTemplates();
      toast.success('Template deleted');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete template';
      toast.error(message);
      return false;
    }
  }, [fetchTemplates]);

  // Get template by meeting type
  const getTemplateForType = useCallback((meetingType: MeetingType) => {
    return templates.find((t) => t.meeting_type === meetingType && t.is_default) ||
           templates.find((t) => t.meeting_type === meetingType);
  }, [templates]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    loading,
    error,
    refresh: fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplateForType,
  };
}

// =====================================================
// useRepScorecardStats Hook
// =====================================================

/**
 * Hook to get scorecard statistics for a rep
 */
export function useRepScorecardStats(userId?: string) {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalScorecards: 0,
    avgScore: 0,
    gradeDistribution: {} as Record<string, number>,
    scoreOverTime: [] as Array<{ date: string; score: number }>,
    strengthAreas: [] as string[],
    improvementAreas: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetUserId = userId || user?.id;

  const fetchStats = useCallback(async () => {
    if (!targetUserId) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('meeting_scorecards')
        .select('*')
        .eq('rep_user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (queryError) throw queryError;

      const scorecards = data || [];

      // Calculate stats
      const totalScorecards = scorecards.length;
      const avgScore = totalScorecards > 0
        ? Math.round(scorecards.reduce((sum, s) => sum + s.overall_score, 0) / totalScorecards)
        : 0;

      // Grade distribution
      const gradeDistribution: Record<string, number> = {};
      scorecards.forEach((s) => {
        gradeDistribution[s.grade] = (gradeDistribution[s.grade] || 0) + 1;
      });

      // Score over time (last 30 entries)
      const scoreOverTime = scorecards
        .slice(0, 30)
        .reverse()
        .map((s) => ({
          date: s.created_at,
          score: s.overall_score,
        }));

      // Aggregate strengths and improvements
      const strengthCounts: Record<string, number> = {};
      const improvementCounts: Record<string, number> = {};

      scorecards.forEach((s) => {
        s.strengths?.forEach((strength: string) => {
          strengthCounts[strength] = (strengthCounts[strength] || 0) + 1;
        });
        s.areas_for_improvement?.forEach((area: string) => {
          improvementCounts[area] = (improvementCounts[area] || 0) + 1;
        });
      });

      const strengthAreas = Object.entries(strengthCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([area]) => area);

      const improvementAreas = Object.entries(improvementCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([area]) => area);

      setStats({
        totalScorecards,
        avgScore,
        gradeDistribution,
        scoreOverTime,
        strengthAreas,
        improvementAreas,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refresh: fetchStats,
  };
}

// =====================================================
// useTeamScorecardLeaderboard Hook
// =====================================================

/**
 * Hook to get team scorecard leaderboard
 */
export function useTeamScorecardLeaderboard() {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState<Array<{
    user_id: string;
    user_name: string;
    user_email: string;
    scorecard_count: number;
    avg_score: number;
    grade_distribution: Record<string, number>;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // Get user's org_id
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership?.org_id) {
        throw new Error('User is not a member of any organization');
      }

      // Get all team members
      const { data: members } = await supabase
        .from('organization_memberships')
        .select('user_id')
        .eq('org_id', membership.org_id);

      const userIds = (members || []).map((m) => m.user_id);

      // Get scorecards for all team members
      const { data: scorecards, error: scError } = await supabase
        .from('meeting_scorecards')
        .select('rep_user_id, overall_score, grade')
        .in('rep_user_id', userIds);

      if (scError) throw scError;

      // Get user profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [
          p.id,
          {
            name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown',
            email: p.email || '',
          },
        ])
      );

      // Aggregate by user
      const userStats: Record<string, {
        scores: number[];
        grades: string[];
      }> = {};

      (scorecards || []).forEach((s) => {
        if (!userStats[s.rep_user_id]) {
          userStats[s.rep_user_id] = { scores: [], grades: [] };
        }
        userStats[s.rep_user_id].scores.push(s.overall_score);
        userStats[s.rep_user_id].grades.push(s.grade);
      });

      // Build leaderboard
      const leaderboardData = Object.entries(userStats)
        .map(([userId, data]) => {
          const profile = profileMap.get(userId) || { name: 'Unknown', email: '' };
          const gradeDistribution: Record<string, number> = {};
          data.grades.forEach((g) => {
            gradeDistribution[g] = (gradeDistribution[g] || 0) + 1;
          });

          return {
            user_id: userId,
            user_name: profile.name,
            user_email: profile.email,
            scorecard_count: data.scores.length,
            avg_score: data.scores.length > 0
              ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
              : 0,
            grade_distribution: gradeDistribution,
          };
        })
        .sort((a, b) => b.avg_score - a.avg_score);

      setLeaderboard(leaderboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch leaderboard');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return {
    leaderboard,
    loading,
    error,
    refresh: fetchLeaderboard,
  };
}

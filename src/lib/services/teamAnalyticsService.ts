/**
 * Team Analytics Service
 * Provides team-level meeting analytics and comparisons
 */

import { supabase } from '@/lib/supabase/clientV2';
import { subDays, format, startOfDay } from 'date-fns';

// =============================================================================
// Existing Types (backwards compatible)
// =============================================================================

export interface TeamMemberMetrics {
  user_id: string;
  full_name: string;
  email: string;
  total_meetings: number;
  avg_sentiment: number | null;
  avg_talk_time: number | null;
  avg_coach_rating: number | null;
  positive_meetings: number;
  negative_meetings: number;
  total_duration_minutes: number | null;
  last_meeting_date: string | null;
  first_meeting_date: string | null;
}

export interface TeamAggregates {
  totalMeetings: number;
  avgSentiment: number;
  avgTalkTime: number;
  avgCoachRating: number;
  totalTeamMembers: number;
  totalDurationMinutes: number;
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  value: number;
  rank: number;
  trend?: 'up' | 'down' | 'stable';
}

// =============================================================================
// New Types for Enhanced Analytics
// =============================================================================

export type TimePeriod = 7 | 30 | 90;
export type Granularity = 'day' | 'week';

/** Team aggregates with period-over-period comparison */
export interface TeamAggregatesWithComparison {
  current: {
    totalMeetings: number;
    avgSentiment: number | null;
    avgTalkTime: number | null;
    avgCoachRating: number | null;
    positiveCount: number;
    negativeCount: number;
    totalDuration: number | null;
    teamMembers: number;
    forwardMovementCount: number;
    objectionCount: number;
    positiveOutcomeCount: number;
  };
  previous: {
    totalMeetings: number;
    avgSentiment: number | null;
    avgTalkTime: number | null;
    avgCoachRating: number | null;
    positiveCount: number;
    forwardMovementCount: number;
    positiveOutcomeCount: number;
  };
  changes: {
    meetingsChangePct: number | null;
    sentimentChangePct: number | null;
    talkTimeChangePct: number | null;
    coachRatingChangePct: number | null;
    forwardMovementChangePct: number | null;
    positiveOutcomeChangePct: number | null;
  };
}

/** Time series data point for charts */
export interface TimeSeriesDataPoint {
  periodStart: string;
  userId: string;
  userName: string;
  meetingCount: number;
  avgSentiment: number | null;
  avgTalkTime: number | null;
  avgCoachRating: number | null;
  positiveCount: number;
  negativeCount: number;
  forwardMovementCount: number;
  totalDuration: number | null;
}

/** Quality signals per rep */
export interface RepQualitySignals {
  userId: string;
  userName: string;
  userEmail: string;
  totalMeetings: number;
  classifiedMeetings: number;
  forwardMovementCount: number;
  forwardMovementRate: number | null;
  objectionCount: number;
  objectionRate: number | null;
  competitorMentionCount: number;
  pricingDiscussionCount: number;
  positiveOutcomeCount: number;
  negativeOutcomeCount: number;
  neutralOutcomeCount: number;
  positiveOutcomeRate: number | null;
  avgSentiment: number | null;
  avgTalkTime: number | null;
  avgCoachRating: number | null;
}

/** Meeting summary for drill-down */
export interface MeetingSummary {
  meetingId: string;
  title: string | null;
  meetingDate: string;
  ownerUserId: string;
  ownerName: string;
  companyName: string | null;
  sentimentScore: number | null;
  talkTimePct: number | null;
  outcome: string | null;
  hasForwardMovement: boolean | null;
  hasObjection: boolean | null;
  durationMinutes: number | null;
}

/** Drill-down metric types */
export type DrillDownMetricType =
  | 'all'
  | 'positive_sentiment'
  | 'negative_sentiment'
  | 'forward_movement'
  | 'objection'
  | 'positive_outcome'
  | 'negative_outcome';

/** Rep comparison data for matrix */
export interface RepComparisonData {
  userId: string;
  userName: string;
  userEmail: string;
  avatarUrl: string | null;
  totalMeetings: number;
  avgSentiment: number | null;
  avgTalkTime: number | null;
  avgCoachRating: number | null;
  forwardMovementRate: number | null;
  positiveOutcomeRate: number | null;
  trendData: Array<{ date: string; count: number; sentiment: number | null }>;
}

export class TeamAnalyticsService {
  /**
   * Get team metrics for organization members
   * Filters by organization membership when orgId is provided
   */
  static async getTeamMetrics(userId: string, orgId?: string | null): Promise<TeamMemberMetrics[]> {
    try {
      // If we have an org ID, filter by organization members
      if (orgId) {
        // Get org members first
        const { data: memberships, error: membershipError } = await supabase
          .from('organization_memberships')
          .select('user_id')
          .eq('org_id', orgId);

        if (membershipError) {
          console.error('Error fetching org members:', membershipError);
          // Fall back to showing only current user's data
          const { data, error } = await supabase
            .from('team_meeting_analytics')
            .select('*')
            .eq('user_id', userId)
            .order('total_meetings', { ascending: false });

          if (error) throw error;
          return (data || []) as TeamMemberMetrics[];
        }

        const memberUserIds = (memberships as { user_id: string }[])?.map(m => m.user_id) || [];

        if (memberUserIds.length === 0) {
          return [];
        }

        // Get analytics only for org members
        const { data, error } = await supabase
          .from('team_meeting_analytics')
          .select('*')
          .in('user_id', memberUserIds)
          .order('total_meetings', { ascending: false });

        if (error) throw error;
        return (data || []) as TeamMemberMetrics[];
      }

      // No org ID - fall back to showing only current user's data for safety
      // This prevents showing data from other organizations
      const { data, error } = await supabase
        .from('team_meeting_analytics')
        .select('*')
        .eq('user_id', userId)
        .order('total_meetings', { ascending: false });

      if (error) throw error;
      return (data || []) as TeamMemberMetrics[];
    } catch (error) {
      console.error('Error fetching team metrics:', error);
      throw error;
    }
  }

  /**
   * Get aggregate team statistics
   */
  static async getTeamAggregates(userId: string, orgId?: string | null): Promise<TeamAggregates> {
    try {
      const metrics = await this.getTeamMetrics(userId, orgId);
      
      const totalMeetings = metrics.reduce((sum, m) => sum + m.total_meetings, 0);
      const membersWithSentiment = metrics.filter(m => m.avg_sentiment !== null);
      const membersWithTalkTime = metrics.filter(m => m.avg_talk_time !== null);
      const membersWithRating = metrics.filter(m => m.avg_coach_rating !== null);

      const avgSentiment = membersWithSentiment.length > 0
        ? membersWithSentiment.reduce((sum, m) => sum + (m.avg_sentiment || 0), 0) / membersWithSentiment.length
        : 0;

      const avgTalkTime = membersWithTalkTime.length > 0
        ? membersWithTalkTime.reduce((sum, m) => sum + (m.avg_talk_time || 0), 0) / membersWithTalkTime.length
        : 0;

      const avgCoachRating = membersWithRating.length > 0
        ? membersWithRating.reduce((sum, m) => sum + (m.avg_coach_rating || 0), 0) / membersWithRating.length
        : 0;

      const totalDurationMinutes = metrics.reduce((sum, m) => sum + (m.total_duration_minutes || 0), 0);

      return {
        totalMeetings,
        avgSentiment,
        avgTalkTime,
        avgCoachRating,
        totalTeamMembers: metrics.length,
        totalDurationMinutes,
      };
    } catch (error) {
      console.error('Error calculating team aggregates:', error);
      throw error;
    }
  }

  /**
   * Get talk time leaderboard
   */
  static async getTalkTimeLeaderboard(userId: string, orgId?: string | null, limit: number = 10): Promise<LeaderboardEntry[]> {
    try {
      const metrics = await this.getTeamMetrics(userId, orgId);
      
      const withTalkTime = metrics
        .filter(m => m.avg_talk_time !== null && m.total_meetings > 0)
        .map((m, index) => ({
          userId: m.user_id,
          name: m.full_name || m.email,
          value: m.avg_talk_time || 0,
          rank: index + 1,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      return withTalkTime;
    } catch (error) {
      console.error('Error fetching talk time leaderboard:', error);
      throw error;
    }
  }

  /**
   * Get sentiment rankings
   */
  static async getSentimentRankings(userId: string, orgId?: string | null, limit: number = 10): Promise<LeaderboardEntry[]> {
    try {
      const metrics = await this.getTeamMetrics(userId, orgId);
      
      const withSentiment = metrics
        .filter(m => m.avg_sentiment !== null && m.total_meetings > 0)
        .map((m, index) => ({
          userId: m.user_id,
          name: m.full_name || m.email,
          value: m.avg_sentiment || 0,
          rank: index + 1,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      return withSentiment;
    } catch (error) {
      console.error('Error fetching sentiment rankings:', error);
      throw error;
    }
  }

  /**
   * Get meeting volume rankings
   */
  static async getMeetingVolumeRankings(userId: string, orgId?: string | null, limit: number = 10): Promise<LeaderboardEntry[]> {
    try {
      const metrics = await this.getTeamMetrics(userId, orgId);
      
      const rankings = metrics
        .filter(m => m.total_meetings > 0)
        .map((m, index) => ({
          userId: m.user_id,
          name: m.full_name || m.email,
          value: m.total_meetings,
          rank: index + 1,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      return rankings;
    } catch (error) {
      console.error('Error fetching meeting volume rankings:', error);
      throw error;
    }
  }

  /**
   * Get individual rep metrics vs team average
   */
  static async getRepComparison(userId: string, repUserId: string, orgId?: string | null): Promise<{
    rep: TeamMemberMetrics | null;
    teamAverage: {
      avgSentiment: number;
      avgTalkTime: number;
      avgCoachRating: number;
      totalMeetings: number;
    };
  }> {
    try {
      const metrics = await this.getTeamMetrics(userId, orgId);
      const aggregates = await this.getTeamAggregates(userId, orgId);

      const rep = metrics.find(m => m.user_id === repUserId) || null;

      return {
        rep,
        teamAverage: {
          avgSentiment: aggregates.avgSentiment,
          avgTalkTime: aggregates.avgTalkTime,
          avgCoachRating: aggregates.avgCoachRating,
          totalMeetings: Math.round(aggregates.totalMeetings / aggregates.totalTeamMembers),
        },
      };
    } catch (error) {
      console.error('Error fetching rep comparison:', error);
      throw error;
    }
  }

  // =============================================================================
  // NEW: Enhanced Analytics Methods
  // =============================================================================

  /**
   * Get team aggregates with period-over-period comparison
   */
  static async getTeamAggregatesWithComparison(
    orgId: string,
    periodDays: TimePeriod = 30
  ): Promise<TeamAggregatesWithComparison> {
    try {
      const { data, error } = await supabase.rpc('get_team_aggregates_with_comparison', {
        p_org_id: orgId,
        p_period_days: periodDays,
      });

      if (error) throw error;

      const row = data?.[0];
      if (!row) {
        // Return empty data structure if no results
        return {
          current: {
            totalMeetings: 0,
            avgSentiment: null,
            avgTalkTime: null,
            avgCoachRating: null,
            positiveCount: 0,
            negativeCount: 0,
            totalDuration: null,
            teamMembers: 0,
            forwardMovementCount: 0,
            objectionCount: 0,
            positiveOutcomeCount: 0,
          },
          previous: {
            totalMeetings: 0,
            avgSentiment: null,
            avgTalkTime: null,
            avgCoachRating: null,
            positiveCount: 0,
            forwardMovementCount: 0,
            positiveOutcomeCount: 0,
          },
          changes: {
            meetingsChangePct: null,
            sentimentChangePct: null,
            talkTimeChangePct: null,
            coachRatingChangePct: null,
            forwardMovementChangePct: null,
            positiveOutcomeChangePct: null,
          },
        };
      }

      return {
        current: {
          totalMeetings: Number(row.current_total_meetings) || 0,
          avgSentiment: row.current_avg_sentiment,
          avgTalkTime: row.current_avg_talk_time,
          avgCoachRating: row.current_avg_coach_rating,
          positiveCount: Number(row.current_positive_count) || 0,
          negativeCount: Number(row.current_negative_count) || 0,
          totalDuration: row.current_total_duration,
          teamMembers: Number(row.current_team_members) || 0,
          forwardMovementCount: Number(row.current_forward_movement_count) || 0,
          objectionCount: Number(row.current_objection_count) || 0,
          positiveOutcomeCount: Number(row.current_positive_outcome_count) || 0,
        },
        previous: {
          totalMeetings: Number(row.previous_total_meetings) || 0,
          avgSentiment: row.previous_avg_sentiment,
          avgTalkTime: row.previous_avg_talk_time,
          avgCoachRating: row.previous_avg_coach_rating,
          positiveCount: Number(row.previous_positive_count) || 0,
          forwardMovementCount: Number(row.previous_forward_movement_count) || 0,
          positiveOutcomeCount: Number(row.previous_positive_outcome_count) || 0,
        },
        changes: {
          meetingsChangePct: row.meetings_change_pct,
          sentimentChangePct: row.sentiment_change_pct,
          talkTimeChangePct: row.talk_time_change_pct,
          coachRatingChangePct: row.coach_rating_change_pct,
          forwardMovementChangePct: row.forward_movement_change_pct,
          positiveOutcomeChangePct: row.positive_outcome_change_pct,
        },
      };
    } catch (error) {
      console.error('Error fetching team aggregates with comparison:', error);
      throw error;
    }
  }

  /**
   * Get time series metrics for trend charts
   */
  static async getTimeSeriesMetrics(params: {
    orgId: string;
    periodDays: TimePeriod;
    granularity: Granularity;
    userId?: string;
  }): Promise<TimeSeriesDataPoint[]> {
    try {
      const { data, error } = await supabase.rpc('get_team_time_series_metrics', {
        p_org_id: params.orgId,
        p_period_days: params.periodDays,
        p_granularity: params.granularity,
        p_user_id: params.userId || null,
      });

      if (error) throw error;

      return (data || []).map((row: Record<string, unknown>) => ({
        periodStart: row.period_start as string,
        userId: row.user_id as string,
        userName: row.user_name as string,
        meetingCount: Number(row.meeting_count) || 0,
        avgSentiment: row.avg_sentiment as number | null,
        avgTalkTime: row.avg_talk_time as number | null,
        avgCoachRating: row.avg_coach_rating as number | null,
        positiveCount: Number(row.positive_count) || 0,
        negativeCount: Number(row.negative_count) || 0,
        forwardMovementCount: Number(row.forward_movement_count) || 0,
        totalDuration: row.total_duration as number | null,
      }));
    } catch (error) {
      console.error('Error fetching time series metrics:', error);
      throw error;
    }
  }

  /**
   * Get meeting quality signals per rep
   */
  static async getTeamQualitySignals(
    orgId: string,
    periodDays: TimePeriod = 30,
    userId?: string
  ): Promise<RepQualitySignals[]> {
    try {
      const { data, error } = await supabase.rpc('get_team_quality_signals', {
        p_org_id: orgId,
        p_period_days: periodDays,
        p_user_id: userId || null,
      });

      if (error) throw error;

      return (data || []).map((row: Record<string, unknown>) => ({
        userId: row.user_id as string,
        userName: row.user_name as string,
        userEmail: row.user_email as string,
        totalMeetings: Number(row.total_meetings) || 0,
        classifiedMeetings: Number(row.classified_meetings) || 0,
        forwardMovementCount: Number(row.forward_movement_count) || 0,
        forwardMovementRate: row.forward_movement_rate as number | null,
        objectionCount: Number(row.objection_count) || 0,
        objectionRate: row.objection_rate as number | null,
        competitorMentionCount: Number(row.competitor_mention_count) || 0,
        pricingDiscussionCount: Number(row.pricing_discussion_count) || 0,
        positiveOutcomeCount: Number(row.positive_outcome_count) || 0,
        negativeOutcomeCount: Number(row.negative_outcome_count) || 0,
        neutralOutcomeCount: Number(row.neutral_outcome_count) || 0,
        positiveOutcomeRate: row.positive_outcome_rate as number | null,
        avgSentiment: row.avg_sentiment as number | null,
        avgTalkTime: row.avg_talk_time as number | null,
        avgCoachRating: row.avg_coach_rating as number | null,
      }));
    } catch (error) {
      console.error('Error fetching team quality signals:', error);
      throw error;
    }
  }

  /**
   * Get meetings for drill-down modal
   */
  static async getMeetingsForDrillDown(
    orgId: string,
    metricType: DrillDownMetricType = 'all',
    periodDays: TimePeriod = 30,
    userId?: string,
    limit: number = 50
  ): Promise<MeetingSummary[]> {
    try {
      const { data, error } = await supabase.rpc('get_meetings_for_drill_down', {
        p_org_id: orgId,
        p_metric_type: metricType,
        p_period_days: periodDays,
        p_user_id: userId || null,
        p_limit: limit,
      });

      if (error) throw error;

      return (data || []).map((row: Record<string, unknown>) => ({
        meetingId: row.meeting_id as string,
        title: row.title as string | null,
        meetingDate: row.meeting_date as string,
        ownerUserId: row.owner_user_id as string,
        ownerName: row.owner_name as string,
        companyName: row.company_name as string | null,
        sentimentScore: row.sentiment_score as number | null,
        talkTimePct: row.talk_time_pct as number | null,
        outcome: row.outcome as string | null,
        hasForwardMovement: row.has_forward_movement as boolean | null,
        hasObjection: row.has_objection as boolean | null,
        durationMinutes: row.duration_minutes as number | null,
      }));
    } catch (error) {
      console.error('Error fetching meetings for drill-down:', error);
      throw error;
    }
  }

  /**
   * Get team comparison matrix for all reps
   */
  static async getTeamComparisonMatrix(
    orgId: string,
    periodDays: TimePeriod = 30
  ): Promise<RepComparisonData[]> {
    try {
      const { data, error } = await supabase.rpc('get_team_comparison_matrix', {
        p_org_id: orgId,
        p_period_days: periodDays,
      });

      if (error) throw error;

      return (data || []).map((row: Record<string, unknown>) => ({
        userId: row.user_id as string,
        userName: row.user_name as string,
        userEmail: row.user_email as string,
        avatarUrl: row.avatar_url as string | null,
        totalMeetings: Number(row.total_meetings) || 0,
        avgSentiment: row.avg_sentiment as number | null,
        avgTalkTime: row.avg_talk_time as number | null,
        avgCoachRating: row.avg_coach_rating as number | null,
        forwardMovementRate: row.forward_movement_rate as number | null,
        positiveOutcomeRate: row.positive_outcome_rate as number | null,
        trendData: Array.isArray(row.trend_data)
          ? (row.trend_data as Array<{ date: string; count: number; sentiment: number | null }>)
          : [],
      }));
    } catch (error) {
      console.error('Error fetching team comparison matrix:', error);
      throw error;
    }
  }

  /**
   * Get aggregated team trends for charts (meeting volume, sentiment over time)
   */
  static async getTeamTrends(
    orgId: string,
    periodDays: TimePeriod = 30
  ): Promise<{
    meetingVolume: Array<{ date: string; count: number }>;
    sentimentTrend: Array<{ date: string; avg: number | null }>;
    talkTimeTrend: Array<{ date: string; avg: number | null }>;
  }> {
    try {
      const timeSeriesData = await this.getTimeSeriesMetrics({
        orgId,
        periodDays,
        granularity: 'day',
      });

      // Aggregate by date (across all users)
      const byDate = new Map<string, { count: number; sentimentSum: number; sentimentCount: number; talkTimeSum: number; talkTimeCount: number }>();

      for (const point of timeSeriesData) {
        const date = point.periodStart.split('T')[0];
        const existing = byDate.get(date) || { count: 0, sentimentSum: 0, sentimentCount: 0, talkTimeSum: 0, talkTimeCount: 0 };

        existing.count += point.meetingCount;
        if (point.avgSentiment !== null) {
          existing.sentimentSum += point.avgSentiment * point.meetingCount;
          existing.sentimentCount += point.meetingCount;
        }
        if (point.avgTalkTime !== null) {
          existing.talkTimeSum += point.avgTalkTime * point.meetingCount;
          existing.talkTimeCount += point.meetingCount;
        }

        byDate.set(date, existing);
      }

      // Build the complete date axis with all dates/buckets in the period
      const today = startOfDay(new Date());
      type DateBucket = { count: number; sentimentSum: number; sentimentCount: number; talkTimeSum: number; talkTimeCount: number };
      const allDates: string[] = [];

      if (periodDays <= 30) {
        // 7-day or 30-day: one entry per day
        for (let i = periodDays - 1; i >= 0; i--) {
          allDates.push(format(subDays(today, i), 'yyyy-MM-dd'));
        }
      } else {
        // 90-day: 30 buckets of 3 days each
        // Re-aggregate byDate into 3-day buckets
        const bucketedByDate = new Map<string, DateBucket>();

        for (let bucket = 0; bucket < 30; bucket++) {
          const bucketStartDaysAgo = periodDays - 1 - (bucket * 3);
          const bucketKey = format(subDays(today, bucketStartDaysAgo), 'yyyy-MM-dd');
          const accumulated: DateBucket = { count: 0, sentimentSum: 0, sentimentCount: 0, talkTimeSum: 0, talkTimeCount: 0 };

          // Aggregate 3 consecutive days into this bucket
          for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
            const dayKey = format(subDays(today, bucketStartDaysAgo - dayOffset), 'yyyy-MM-dd');
            const dayData = byDate.get(dayKey);
            if (dayData) {
              accumulated.count += dayData.count;
              accumulated.sentimentSum += dayData.sentimentSum;
              accumulated.sentimentCount += dayData.sentimentCount;
              accumulated.talkTimeSum += dayData.talkTimeSum;
              accumulated.talkTimeCount += dayData.talkTimeCount;
            }
          }

          bucketedByDate.set(bucketKey, accumulated);
          allDates.push(bucketKey);
        }

        // Replace byDate with bucketed version for the mapping below
        byDate.clear();
        for (const [key, value] of bucketedByDate) {
          byDate.set(key, value);
        }
      }

      return {
        meetingVolume: allDates.map(date => ({
          date,
          count: byDate.get(date)?.count ?? 0,
        })),
        sentimentTrend: allDates.map(date => {
          const data = byDate.get(date);
          return {
            date,
            avg: data && data.sentimentCount > 0 ? data.sentimentSum / data.sentimentCount : null,
          };
        }),
        talkTimeTrend: allDates.map(date => {
          const data = byDate.get(date);
          return {
            date,
            avg: data && data.talkTimeCount > 0 ? data.talkTimeSum / data.talkTimeCount : null,
          };
        }),
      };
    } catch (error) {
      console.error('Error fetching team trends:', error);
      throw error;
    }
  }
}
































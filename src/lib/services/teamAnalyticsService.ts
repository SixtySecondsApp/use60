/**
 * Team Analytics Service
 * Provides team-level meeting analytics and comparisons
 */

import { supabase } from '@/lib/supabase/clientV2';

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
  | 'negative_outcome'
  | 'sentiment_extremes'
  | 'talk_time_extremes'
  | 'coach_rating_summary'
  | 'objection_details';

/** Sentiment extremes result for top/bottom meetings */
export interface SentimentExtremesResult {
  top5: MeetingSummary[];
  bottom5: MeetingSummary[];
}

/** Talk time extremes result for highest/lowest meetings */
export interface TalkTimeExtremesResult {
  highest5: MeetingSummary[];
  lowest5: MeetingSummary[];
}

/** Coaching guidance generated from metrics */
export interface CoachingGuidance {
  summary: string;
  highlights: string[];
  improvements: string[];
}

/** Objection summary for aggregated view */
export interface ObjectionSummary {
  objection: string;
  category: string | null;
  occurrenceCount: number;
  resolutionRate: number;
}

/** Handling method example */
export interface HandlingMethod {
  objection: string;
  response: string;
  meetingTitle: string | null;
}

/** Objection details result combining meetings + aggregated data */
export interface ObjectionDetailsResult {
  meetings: MeetingSummary[];
  topObjections: ObjectionSummary[];
  topHandlingMethods: HandlingMethod[];
}

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

      const sortedDates = Array.from(byDate.keys()).sort();

      return {
        meetingVolume: sortedDates.map(date => ({
          date,
          count: byDate.get(date)!.count,
        })),
        sentimentTrend: sortedDates.map(date => {
          const data = byDate.get(date)!;
          return {
            date,
            avg: data.sentimentCount > 0 ? data.sentimentSum / data.sentimentCount : null,
          };
        }),
        talkTimeTrend: sortedDates.map(date => {
          const data = byDate.get(date)!;
          return {
            date,
            avg: data.talkTimeCount > 0 ? data.talkTimeSum / data.talkTimeCount : null,
          };
        }),
      };
    } catch (error) {
      console.error('Error fetching team trends:', error);
      throw error;
    }
  }

  // =============================================================================
  // Tile Popup Methods
  // =============================================================================

  /**
   * Fetch profiles for a list of user IDs and return a map.
   * Used because meetings.owner_user_id FK references auth.users, not profiles.
   */
  private static async fetchProfilesMap(
    userIds: string[]
  ): Promise<Map<string, { first_name: string | null; last_name: string | null; email: string | null }>> {
    const map = new Map<string, { first_name: string | null; last_name: string | null; email: string | null }>();
    if (userIds.length === 0) return map;

    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', userIds);

    for (const p of data || []) {
      map.set(p.id, {
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
      });
    }
    return map;
  }

  /**
   * Helper to map raw meeting join data to MeetingSummary.
   * Accepts optional profileMap for when profiles are fetched separately.
   */
  private static mapRawToMeetingSummary(
    row: Record<string, unknown>,
    profileMap?: Map<string, { first_name: string | null; last_name: string | null; email: string | null }>
  ): MeetingSummary {
    const companies = row.companies as Record<string, unknown> | null;
    const classifications = Array.isArray(row.meeting_classifications)
      ? (row.meeting_classifications[0] as Record<string, unknown> | undefined)
      : (row.meeting_classifications as Record<string, unknown> | null);

    // Resolve profile from map (separate fetch) or from joined data
    let firstName: string | null = null;
    let lastName: string | null = null;
    let email: string | null = null;

    if (profileMap) {
      const profile = profileMap.get(row.owner_user_id as string);
      if (profile) {
        firstName = profile.first_name;
        lastName = profile.last_name;
        email = profile.email;
      }
    } else {
      const profiles = row.profiles as Record<string, unknown> | null;
      firstName = (profiles?.first_name as string | null);
      lastName = (profiles?.last_name as string | null);
      email = (profiles?.email as string | null);
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    return {
      meetingId: row.id as string,
      title: row.title as string | null,
      meetingDate: row.meeting_start as string,
      ownerUserId: row.owner_user_id as string,
      ownerName: fullName || email || 'Unknown',
      companyName: (companies?.name as string | null) ?? null,
      sentimentScore: row.sentiment_score as number | null,
      talkTimePct: row.talk_time_rep_pct as number | null,
      outcome: (classifications?.outcome as string | null) ?? null,
      hasForwardMovement: (classifications?.has_forward_movement as boolean | null) ?? null,
      hasObjection: (classifications?.has_objection as boolean | null) ?? null,
      durationMinutes: row.duration_minutes as number | null,
    };
  }

  /**
   * Get top 5 and bottom 5 meetings by sentiment score
   */
  static async getSentimentExtremes(
    orgId: string,
    periodDays: TimePeriod = 30,
    userId?: string
  ): Promise<SentimentExtremesResult> {
    try {
      const dateFrom = new Date(Date.now() - periodDays * 86400000).toISOString();

      const buildQuery = (ascending: boolean) => {
        let q = supabase
          .from('meetings')
          .select(`
            id, title, meeting_start, owner_user_id, sentiment_score,
            talk_time_rep_pct, duration_minutes,
            companies!meetings_company_id_fkey(name),
            meeting_classifications(outcome, has_forward_movement, has_objection)
          `)
          .eq('org_id', orgId)
          .not('sentiment_score', 'is', null)
          .not('meeting_start', 'is', null)
          .gte('meeting_start', dateFrom)
          .order('sentiment_score', { ascending })
          .limit(5);

        if (userId) q = q.eq('owner_user_id', userId);
        return q;
      };

      const [topResult, bottomResult] = await Promise.all([
        buildQuery(false), // highest first
        buildQuery(true),  // lowest first
      ]);

      if (topResult.error) throw topResult.error;
      if (bottomResult.error) throw bottomResult.error;

      // Collect unique owner IDs and fetch profiles separately
      // (meetings FK references auth.users, not profiles — can't join directly)
      const allRows = [...(topResult.data || []), ...(bottomResult.data || [])];
      const ownerIds = [...new Set(allRows.map((r: Record<string, unknown>) => r.owner_user_id as string).filter(Boolean))];
      const profileMap = await this.fetchProfilesMap(ownerIds);

      const mapWithProfiles = (r: Record<string, unknown>) =>
        this.mapRawToMeetingSummary(r, profileMap);

      return {
        top5: (topResult.data || []).map((r) => mapWithProfiles(r as Record<string, unknown>)),
        bottom5: (bottomResult.data || []).map((r) => mapWithProfiles(r as Record<string, unknown>)),
      };
    } catch (error) {
      console.error('Error fetching sentiment extremes:', error);
      throw error;
    }
  }

  /**
   * Get top 5 and bottom 5 meetings by talk time percentage
   */
  static async getTalkTimeExtremes(
    orgId: string,
    periodDays: TimePeriod = 30,
    userId?: string
  ): Promise<TalkTimeExtremesResult> {
    try {
      const dateFrom = new Date(Date.now() - periodDays * 86400000).toISOString();

      const buildQuery = (ascending: boolean) => {
        let q = supabase
          .from('meetings')
          .select(`
            id, title, meeting_start, owner_user_id, sentiment_score,
            talk_time_rep_pct, duration_minutes,
            companies!meetings_company_id_fkey(name),
            meeting_classifications(outcome, has_forward_movement, has_objection)
          `)
          .eq('org_id', orgId)
          .not('talk_time_rep_pct', 'is', null)
          .not('meeting_start', 'is', null)
          .gte('meeting_start', dateFrom)
          .order('talk_time_rep_pct', { ascending })
          .limit(5);

        if (userId) q = q.eq('owner_user_id', userId);
        return q;
      };

      const [highestResult, lowestResult] = await Promise.all([
        buildQuery(false), // highest first
        buildQuery(true),  // lowest first
      ]);

      if (highestResult.error) throw highestResult.error;
      if (lowestResult.error) throw lowestResult.error;

      // Fetch profiles separately (meetings FK references auth.users, not profiles)
      const allRows = [...(highestResult.data || []), ...(lowestResult.data || [])];
      const ownerIds = [...new Set(allRows.map((r: Record<string, unknown>) => r.owner_user_id as string).filter(Boolean))];
      const profileMap = await this.fetchProfilesMap(ownerIds);

      const mapWithProfiles = (r: Record<string, unknown>) =>
        this.mapRawToMeetingSummary(r, profileMap);

      return {
        highest5: (highestResult.data || []).map((r) => mapWithProfiles(r as Record<string, unknown>)),
        lowest5: (lowestResult.data || []).map((r) => mapWithProfiles(r as Record<string, unknown>)),
      };
    } catch (error) {
      console.error('Error fetching talk time extremes:', error);
      throw error;
    }
  }

  /**
   * Generate coaching guidance text from aggregate metrics (pure function, no DB call)
   */
  static generateTeamCoachingGuidance(
    aggregates: TeamAggregatesWithComparison
  ): CoachingGuidance {
    const { current, changes } = aggregates;
    const highlights: string[] = [];
    const improvements: string[] = [];

    // Coach rating assessment
    const rating = current.avgCoachRating;
    const ratingTrend = changes.coachRatingChangePct;
    let ratingText = '';
    if (rating !== null) {
      if (rating >= 7) {
        ratingText = `Your team's average coach rating of ${rating.toFixed(1)}/10 is strong.`;
        highlights.push(`Coach rating at ${rating.toFixed(1)}/10 — above average performance`);
      } else if (rating >= 5) {
        ratingText = `Your team's average coach rating of ${rating.toFixed(1)}/10 shows room for growth.`;
        improvements.push(`Coach rating at ${rating.toFixed(1)}/10 — target 7+ through structured coaching`);
      } else {
        ratingText = `Your team's average coach rating of ${rating.toFixed(1)}/10 needs attention.`;
        improvements.push(`Coach rating at ${rating.toFixed(1)}/10 — prioritize call reviews and role-play sessions`);
      }
      if (ratingTrend !== null && ratingTrend !== 0) {
        ratingText += ratingTrend > 0
          ? ` Up ${ratingTrend.toFixed(1)}% from the previous period.`
          : ` Down ${Math.abs(ratingTrend).toFixed(1)}% from the previous period.`;
      }
    } else {
      ratingText = 'Coach rating data is not yet available for this period.';
    }

    // Talk time assessment
    const talkTime = current.avgTalkTime;
    if (talkTime !== null) {
      if (talkTime >= 45 && talkTime <= 55) {
        highlights.push(`Talk time at ${talkTime.toFixed(0)}% — within the ideal 45-55% range`);
      } else if (talkTime > 55) {
        improvements.push(`Talk time at ${talkTime.toFixed(0)}% — reps may be talking too much. Encourage more listening and open-ended questions`);
      } else {
        improvements.push(`Talk time at ${talkTime.toFixed(0)}% — reps may not be driving conversations enough. Practice assertive discovery techniques`);
      }
    }

    // Sentiment assessment
    const sentiment = current.avgSentiment;
    const sentimentTrend = changes.sentimentChangePct;
    if (sentiment !== null) {
      if (sentiment > 0.2) {
        highlights.push(`Positive average sentiment (${sentiment > 0 ? '+' : ''}${sentiment.toFixed(2)}) — calls are well-received`);
      } else if (sentiment < -0.1) {
        improvements.push(`Negative sentiment trend (${sentiment.toFixed(2)}) — review recent calls for friction points`);
      }
      if (sentimentTrend !== null && sentimentTrend < -5) {
        improvements.push(`Sentiment declining ${Math.abs(sentimentTrend).toFixed(1)}% — identify what changed in approach`);
      }
    }

    // Forward movement / outcomes
    if (current.totalMeetings > 0) {
      const fwdRate = (current.forwardMovementCount / current.totalMeetings) * 100;
      if (fwdRate >= 50) {
        highlights.push(`${fwdRate.toFixed(0)}% of calls show forward movement — strong pipeline progression`);
      } else if (fwdRate < 30) {
        improvements.push(`Only ${fwdRate.toFixed(0)}% of calls show forward movement — work on clear next steps and commitments`);
      }
    }

    // Build summary paragraph (~120 words)
    const meetingContext = current.totalMeetings > 0 && current.teamMembers > 0
      ? `Across ${current.totalMeetings} meetings by ${current.teamMembers} team members, here's what stands out. `
      : '';

    const highlightSummary = highlights.length > 0
      ? `Strengths include ${highlights[0].toLowerCase()}. `
      : '';

    const improvementSummary = improvements.length > 0
      ? `Key area to focus on: ${improvements[0].toLowerCase()}.`
      : 'Keep up the current trajectory.';

    const summary = `${meetingContext}${ratingText} ${highlightSummary}${improvementSummary}`;

    return { summary, highlights, improvements };
  }

  /**
   * Get objection details: meetings with objections + top objections + handling methods
   */
  static async getObjectionDetails(
    orgId: string,
    periodDays: TimePeriod = 30,
    userId?: string
  ): Promise<ObjectionDetailsResult> {
    try {
      const dateFrom = new Date(Date.now() - periodDays * 86400000).toISOString();

      // 1. Get 5 meetings with objections (reuse existing drill-down)
      const meetings = await this.getMeetingsForDrillDown(orgId, 'objection', periodDays, userId, 5);

      // 2. Get top 3 objections via existing RPC
      const { data: topObjData, error: topObjError } = await supabase.rpc('get_top_objections', {
        p_org_id: orgId,
        p_date_from: dateFrom,
        p_date_to: null,
        p_limit: 3,
      });

      if (topObjError) {
        console.error('Error fetching top objections:', topObjError);
      }

      const topObjections: ObjectionSummary[] = (topObjData || []).map((row: Record<string, unknown>) => ({
        objection: row.objection as string,
        category: row.category as string | null,
        occurrenceCount: Number(row.occurrence_count) || 0,
        resolutionRate: Number(row.resolution_rate) || 0,
      }));

      // 3. Get handling methods: query meeting_classifications for resolved objections with responses
      const { data: classData, error: classError } = await supabase
        .from('meeting_classifications')
        .select('objections, meetings!inner(title, meeting_start, org_id)')
        .eq('org_id', orgId)
        .eq('has_objection', true)
        .gte('meetings.meeting_start', dateFrom);

      if (classError) {
        console.error('Error fetching classification data:', classError);
      }

      // Extract resolved objections with responses
      const handlingExamples: HandlingMethod[] = [];
      for (const row of classData || []) {
        const objections = row.objections as Array<{
          objection?: string;
          response?: string;
          resolved?: boolean;
        }> | null;
        const meetingInfo = row.meetings as Record<string, unknown> | null;

        if (!objections || !Array.isArray(objections)) continue;

        for (const obj of objections) {
          if (obj.resolved && obj.response && obj.objection) {
            handlingExamples.push({
              objection: obj.objection,
              response: obj.response,
              meetingTitle: (meetingInfo?.title as string | null) ?? null,
            });
          }
        }
      }

      // Take top 3 most recent handling examples
      const topHandlingMethods = handlingExamples.slice(0, 3);

      return { meetings, topObjections, topHandlingMethods };
    } catch (error) {
      console.error('Error fetching objection details:', error);
      throw error;
    }
  }
}






























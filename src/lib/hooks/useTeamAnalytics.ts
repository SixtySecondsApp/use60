/**
 * React Query hooks for Team Analytics
 * Provides cached, reactive data fetching for team analytics features
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrg } from '@/lib/stores/orgStore';
import {
  TeamAnalyticsService,
  type TimePeriod,
  type Granularity,
  type DateRange,
  type TeamAggregatesWithComparison,
  type TimeSeriesDataPoint,
  type RepQualitySignals,
  type MeetingSummary,
  type DrillDownMetricType,
  type RepComparisonData,
  type SentimentExtremesResult,
  type TalkTimeExtremesResult,
  type ObjectionDetailsResult,
  type CoachingGuidance,
} from '@/lib/services/teamAnalyticsService';

// Serialize dateRange for stable query keys
function dateRangeKey(dateRange?: DateRange): string {
  if (!dateRange) return 'none';
  return `${dateRange.start.toISOString()}_${dateRange.end.toISOString()}`;
}

// Query key factory for consistency
const teamAnalyticsKeys = {
  all: ['team-analytics'] as const,
  aggregates: (orgId: string, period: TimePeriod, dateRange?: DateRange) =>
    [...teamAnalyticsKeys.all, 'aggregates', orgId, period, dateRangeKey(dateRange)] as const,
  timeSeries: (orgId: string, period: TimePeriod, granularity: Granularity, userId?: string) =>
    [...teamAnalyticsKeys.all, 'time-series', orgId, period, granularity, userId || 'all'] as const,
  qualitySignals: (orgId: string, period: TimePeriod, userId?: string) =>
    [...teamAnalyticsKeys.all, 'quality-signals', orgId, period, userId || 'all'] as const,
  comparison: (orgId: string, period: TimePeriod, dateRange?: DateRange) =>
    [...teamAnalyticsKeys.all, 'comparison', orgId, period, dateRangeKey(dateRange)] as const,
  drillDown: (orgId: string, metricType: DrillDownMetricType, period: TimePeriod, userId?: string) =>
    [...teamAnalyticsKeys.all, 'drill-down', orgId, metricType, period, userId || 'all'] as const,
  trends: (orgId: string, period: TimePeriod, dateRange?: DateRange) =>
    [...teamAnalyticsKeys.all, 'trends', orgId, period, dateRangeKey(dateRange)] as const,
  sentimentExtremes: (orgId: string, period: TimePeriod, userId?: string) =>
    [...teamAnalyticsKeys.all, 'sentiment-extremes', orgId, period, userId || 'all'] as const,
  talkTimeExtremes: (orgId: string, period: TimePeriod, userId?: string) =>
    [...teamAnalyticsKeys.all, 'talk-time-extremes', orgId, period, userId || 'all'] as const,
  objectionDetails: (orgId: string, period: TimePeriod, userId?: string) =>
    [...teamAnalyticsKeys.all, 'objection-details', orgId, period, userId || 'all'] as const,
};

/**
 * Hook for team aggregates with period-over-period comparison
 * Shows current period metrics vs previous period with % change
 */
export function useTeamAggregates(period: TimePeriod = 30, dateRange?: DateRange) {
  const { user } = useAuth();
  const activeOrg = useActiveOrg();
  const orgId = activeOrg?.id;

  return useQuery<TeamAggregatesWithComparison>({
    queryKey: teamAnalyticsKeys.aggregates(orgId || '', period, dateRange),
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');
      return TeamAnalyticsService.getTeamAggregatesWithComparison(orgId, period, dateRange);
    },
    enabled: Boolean(user && orgId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for time series metrics (for trend charts)
 * Returns data points per period per user for visualization
 */
export function useTeamTimeSeries(
  period: TimePeriod = 30,
  granularity: Granularity = 'day',
  userId?: string
) {
  const { user } = useAuth();
  const activeOrg = useActiveOrg();
  const orgId = activeOrg?.id;

  return useQuery<TimeSeriesDataPoint[]>({
    queryKey: teamAnalyticsKeys.timeSeries(orgId || '', period, granularity, userId),
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');
      return TeamAnalyticsService.getTimeSeriesMetrics({
        orgId,
        periodDays: period,
        granularity,
        userId,
      });
    },
    enabled: Boolean(user && orgId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for team quality signals per rep
 * Forward movement rate, objection rate, outcome distribution, etc.
 */
export function useTeamQualitySignals(period: TimePeriod = 30, userId?: string) {
  const { user } = useAuth();
  const activeOrg = useActiveOrg();
  const orgId = activeOrg?.id;

  return useQuery<RepQualitySignals[]>({
    queryKey: teamAnalyticsKeys.qualitySignals(orgId || '', period, userId),
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');
      return TeamAnalyticsService.getTeamQualitySignals(orgId, period, userId);
    },
    enabled: Boolean(user && orgId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for team comparison matrix
 * All reps with metrics for sortable comparison table
 */
export function useTeamComparison(period: TimePeriod = 30, dateRange?: DateRange) {
  const { user } = useAuth();
  const activeOrg = useActiveOrg();
  const orgId = activeOrg?.id;

  return useQuery<RepComparisonData[]>({
    queryKey: teamAnalyticsKeys.comparison(orgId || '', period, dateRange),
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');
      return TeamAnalyticsService.getTeamComparisonMatrix(orgId, period, dateRange);
    },
    enabled: Boolean(user && orgId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for drill-down meetings
 * Get meetings filtered by a specific metric for modal display
 */
export function useMeetingsForDrillDown(
  metricType: DrillDownMetricType,
  period: TimePeriod = 30,
  userId?: string,
  enabled: boolean = true
) {
  const { user } = useAuth();
  const activeOrg = useActiveOrg();
  const orgId = activeOrg?.id;

  return useQuery<MeetingSummary[]>({
    queryKey: teamAnalyticsKeys.drillDown(orgId || '', metricType, period, userId),
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');
      return TeamAnalyticsService.getMeetingsForDrillDown(orgId, metricType, period, userId, 50);
    },
    enabled: Boolean(user && orgId && enabled),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for aggregated team trends
 * Meeting volume, sentiment, and talk time over time (aggregated across all reps)
 */
export function useTeamTrends(period: TimePeriod = 30, dateRange?: DateRange) {
  const { user } = useAuth();
  const activeOrg = useActiveOrg();
  const orgId = activeOrg?.id;

  return useQuery<{
    meetingVolume: Array<{ date: string; count: number }>;
    sentimentTrend: Array<{ date: string; avg: number | null }>;
    talkTimeTrend: Array<{ date: string; avg: number | null }>;
  }>({
    queryKey: teamAnalyticsKeys.trends(orgId || '', period, dateRange),
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');
      return TeamAnalyticsService.getTeamTrends(orgId, period, dateRange);
    },
    enabled: Boolean(user && orgId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for sentiment extremes (top 5 + bottom 5 by sentiment score)
 */
export function useSentimentExtremes(
  period: TimePeriod = 30,
  userId?: string,
  enabled: boolean = true
) {
  const { user } = useAuth();
  const activeOrg = useActiveOrg();
  const orgId = activeOrg?.id;

  return useQuery<SentimentExtremesResult>({
    queryKey: teamAnalyticsKeys.sentimentExtremes(orgId || '', period, userId),
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');
      return TeamAnalyticsService.getSentimentExtremes(orgId, period, userId);
    },
    enabled: Boolean(user && orgId && enabled),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for talk time extremes (highest 5 + lowest 5 by talk time %)
 */
export function useTalkTimeExtremes(
  period: TimePeriod = 30,
  userId?: string,
  enabled: boolean = true
) {
  const { user } = useAuth();
  const activeOrg = useActiveOrg();
  const orgId = activeOrg?.id;

  return useQuery<TalkTimeExtremesResult>({
    queryKey: teamAnalyticsKeys.talkTimeExtremes(orgId || '', period, userId),
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');
      return TeamAnalyticsService.getTalkTimeExtremes(orgId, period, userId);
    },
    enabled: Boolean(user && orgId && enabled),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for objection details (meetings + top objections + handling methods)
 */
export function useObjectionDetails(
  period: TimePeriod = 30,
  userId?: string,
  enabled: boolean = true
) {
  const { user } = useAuth();
  const activeOrg = useActiveOrg();
  const orgId = activeOrg?.id;

  return useQuery<ObjectionDetailsResult>({
    queryKey: teamAnalyticsKeys.objectionDetails(orgId || '', period, userId),
    queryFn: async () => {
      if (!orgId) throw new Error('No organization selected');
      return TeamAnalyticsService.getObjectionDetails(orgId, period, userId);
    },
    enabled: Boolean(user && orgId && enabled),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to invalidate all team analytics cache
 * Useful when underlying data changes
 */
export function useInvalidateTeamAnalytics() {
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: teamAnalyticsKeys.all });
  }, [queryClient]);

  const invalidateAggregates = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [...teamAnalyticsKeys.all, 'aggregates'],
    });
  }, [queryClient]);

  const invalidateTimeSeries = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [...teamAnalyticsKeys.all, 'time-series'],
    });
  }, [queryClient]);

  return {
    invalidateAll,
    invalidateAggregates,
    invalidateTimeSeries,
  };
}

// Re-export types for convenience
export type {
  TimePeriod,
  Granularity,
  DateRange,
  TeamAggregatesWithComparison,
  TimeSeriesDataPoint,
  RepQualitySignals,
  MeetingSummary,
  DrillDownMetricType,
  RepComparisonData,
  SentimentExtremesResult,
  TalkTimeExtremesResult,
  ObjectionDetailsResult,
  CoachingGuidance,
};

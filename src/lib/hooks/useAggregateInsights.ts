/**
 * React hooks for Aggregated Meeting Insights
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import type {
  AggregateInsightsFilter,
  AggregateInsightsCountResponse,
  MeetingListItem,
  MeetingAggregateMetrics,
} from '@/lib/types/meetingIntelligence';

// =====================================================
// useAggregateInsights Hook
// =====================================================

interface AggregateInsightsResult {
  counts?: AggregateInsightsCountResponse;
  meetings?: MeetingListItem[];
  stats?: MeetingAggregateMetrics;
  naturalResponse?: string;
}

/**
 * Hook to query aggregated meeting insights
 */
export function useAggregateInsights() {
  const { user } = useAuth();
  const [result, setResult] = useState<AggregateInsightsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Query with structured filter
  const queryInsights = useCallback(async (
    queryType: 'count' | 'list' | 'stats',
    filter?: AggregateInsightsFilter,
    limit?: number
  ) => {
    if (!user) return null;

    try {
      setLoading(true);
      setError(null);

      const { data, error: funcError } = await supabase.functions.invoke(
        'meeting-router',
        {
          body: {
            action: 'aggregate_insights_query',
            query_type: queryType,
            filter,
            limit: limit || 50,
            user_id: user.id,
          },
        }
      );

      if (funcError) throw funcError;

      if (data?.success) {
        const newResult: AggregateInsightsResult = {};
        if (data.counts) newResult.counts = data.counts;
        if (data.meetings) newResult.meetings = data.meetings;
        if (data.stats) newResult.stats = data.stats;
        setResult(newResult);
        return newResult;
      } else {
        throw new Error(data?.error || 'Failed to query insights');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to query insights';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Query with natural language
  const queryNatural = useCallback(async (query: string) => {
    if (!user) return null;

    try {
      setLoading(true);
      setError(null);

      const { data, error: funcError } = await supabase.functions.invoke(
        'meeting-router',
        {
          body: {
            action: 'aggregate_insights_query',
            query_type: 'natural_language',
            natural_query: query,
            user_id: user.id,
          },
        }
      );

      if (funcError) throw funcError;

      if (data?.success) {
        const newResult: AggregateInsightsResult = {};
        if (data.counts) newResult.counts = data.counts;
        if (data.meetings) newResult.meetings = data.meetings;
        if (data.stats) newResult.stats = data.stats;
        if (data.natural_response) newResult.naturalResponse = data.natural_response;
        setResult(newResult);
        return newResult;
      } else {
        throw new Error(data?.error || 'Failed to query insights');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to query insights';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Convenience methods for common queries
  const getForwardMovementCount = useCallback(async (dateFrom?: string, dateTo?: string) => {
    return queryInsights('count', {
      has_forward_movement: true,
      date_from: dateFrom,
      date_to: dateTo,
    });
  }, [queryInsights]);

  const getProposalRequestCount = useCallback(async (dateFrom?: string, dateTo?: string) => {
    return queryInsights('count', {
      has_proposal_request: true,
      date_from: dateFrom,
      date_to: dateTo,
    });
  }, [queryInsights]);

  const getCompetitorMentions = useCallback(async (limit?: number) => {
    return queryInsights('list', {
      has_competitor_mention: true,
    }, limit);
  }, [queryInsights]);

  const getMeetingsWithObjections = useCallback(async (limit?: number) => {
    return queryInsights('list', {
      has_objection: true,
    }, limit);
  }, [queryInsights]);

  const getPositiveOutcomeMeetings = useCallback(async (limit?: number) => {
    return queryInsights('list', {
      outcome: 'positive',
    }, limit);
  }, [queryInsights]);

  const getPeriodStats = useCallback(async (dateFrom: string, dateTo: string) => {
    return queryInsights('stats', {
      date_from: dateFrom,
      date_to: dateTo,
    });
  }, [queryInsights]);

  // Reset results
  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    result,
    loading,
    error,
    queryInsights,
    queryNatural,
    reset,
    // Convenience methods
    getForwardMovementCount,
    getProposalRequestCount,
    getCompetitorMentions,
    getMeetingsWithObjections,
    getPositiveOutcomeMeetings,
    getPeriodStats,
  };
}

// =====================================================
// useQuickStats Hook
// =====================================================

/**
 * Hook to get quick meeting stats for the current period
 */
export function useQuickStats(periodDays: number = 30) {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalMeetings: 0,
    forwardMovementCount: 0,
    forwardMovementRate: 0,
    proposalRequestCount: 0,
    competitorMentionCount: 0,
    objectionCount: 0,
    positiveOutcomeCount: 0,
    positiveOutcomeRate: 0,
    avgSentiment: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - periodDays);

      const { data, error: funcError } = await supabase.functions.invoke(
        'meeting-router',
        {
          body: {
            action: 'aggregate_insights_query',
            query_type: 'count',
            filter: {
              date_from: dateFrom.toISOString().split('T')[0],
            },
            user_id: user.id,
          },
        }
      );

      if (funcError) throw funcError;

      if (data?.success && data.counts) {
        const c = data.counts;
        setStats({
          totalMeetings: c.total_meetings || 0,
          forwardMovementCount: c.forward_movement_count || 0,
          forwardMovementRate: c.total_meetings > 0
            ? Math.round((c.forward_movement_count / c.total_meetings) * 100)
            : 0,
          proposalRequestCount: c.proposal_request_count || 0,
          competitorMentionCount: c.competitor_mention_count || 0,
          objectionCount: c.objection_count || 0,
          positiveOutcomeCount: c.positive_outcome_count || 0,
          positiveOutcomeRate: c.total_meetings > 0
            ? Math.round((c.positive_outcome_count / c.total_meetings) * 100)
            : 0,
          avgSentiment: 0, // Would need separate query
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  }, [user, periodDays]);

  return {
    stats,
    loading,
    error,
    refresh: fetchStats,
  };
}

// =====================================================
// useMeetingClassifications Hook
// =====================================================

/**
 * Hook to get meeting classifications directly from database
 */
export function useMeetingClassifications(filter?: {
  hasForwardMovement?: boolean;
  hasCompetitorMention?: boolean;
  hasObjection?: boolean;
  outcome?: 'positive' | 'negative' | 'neutral';
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}) {
  const { user } = useAuth();
  const [classifications, setClassifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClassifications = useCallback(async () => {
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

      if (!membership?.org_id) return;

      let query = supabase
        .from('meeting_classifications')
        .select(`
          *,
          meetings!inner(id, title, start_time, owner_user_id, company_id)
        `)
        .eq('org_id', membership.org_id);

      // Apply filters
      if (filter?.hasForwardMovement !== undefined) {
        query = query.eq('has_forward_movement', filter.hasForwardMovement);
      }
      if (filter?.hasCompetitorMention !== undefined) {
        query = query.eq('has_competitor_mention', filter.hasCompetitorMention);
      }
      if (filter?.hasObjection !== undefined) {
        query = query.eq('has_objection', filter.hasObjection);
      }
      if (filter?.outcome) {
        query = query.eq('outcome', filter.outcome);
      }
      if (filter?.dateFrom) {
        query = query.gte('created_at', filter.dateFrom);
      }
      if (filter?.dateTo) {
        query = query.lte('created_at', filter.dateTo + 'T23:59:59.999Z');
      }

      query = query.order('created_at', { ascending: false });

      if (filter?.limit) {
        query = query.limit(filter.limit);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      setClassifications(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch classifications');
    } finally {
      setLoading(false);
    }
  }, [user, JSON.stringify(filter)]);

  return {
    classifications,
    loading,
    error,
    refresh: fetchClassifications,
  };
}

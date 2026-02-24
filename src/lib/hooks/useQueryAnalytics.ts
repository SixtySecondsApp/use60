/**
 * useQueryAnalytics Hook
 *
 * React Query hooks for copilot query analytics and coverage tracking.
 * Provides data for the Ideas tab dashboard and skill gap identification.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

export interface QueryIntent {
  id: string;
  intent_category: string;
  normalized_query: string;
  example_queries: string[];
  query_count: number;
  first_seen_at: string;
  last_seen_at: string;
  matched_skill_key: string | null;
  skill_match_confidence: number | null;
  is_covered: boolean;
  total_executions: number;
  successful_executions: number;
  success_rate: number | null;
}

export interface CategoryStats {
  category: string;
  total_intents: number;
  covered_intents: number;
  query_count: number;
}

export interface CoverageStats {
  total_intents: number;
  covered_intents: number;
  uncovered_intents: number;
  coverage_percentage: number;
  total_queries: number;
  covered_queries: number;
  uncovered_queries: number;
  queries_coverage_percentage: number;
  categories: CategoryStats[];
}

export interface QueryAnalyticsOptions {
  timeRange?: '7d' | '30d' | '90d';
  limit?: number;
  category?: string;
}

// ============================================================================
// Query Keys
// ============================================================================

const QUERY_KEYS = {
  all: ['query-analytics'] as const,
  coverage: (days: number) => ['query-analytics', 'coverage', days] as const,
  gaps: (days: number, limit: number) =>
    ['query-analytics', 'gaps', days, limit] as const,
  trending: (days: number, limit: number) =>
    ['query-analytics', 'trending', days, limit] as const,
  byCategory: (category: string, days: number) =>
    ['query-analytics', 'category', category, days] as const,
};

// ============================================================================
// Helper Functions
// ============================================================================

function timeRangeToDays(timeRange: '7d' | '30d' | '90d'): number {
  switch (timeRange) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
    default:
      return 30;
  }
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch skill coverage statistics
 */
export function useQueryCoverageStats(options?: Pick<QueryAnalyticsOptions, 'timeRange'>) {
  const days = timeRangeToDays(options?.timeRange || '30d');

  return useQuery({
    queryKey: QUERY_KEYS.coverage(days),
    queryFn: async (): Promise<CoverageStats> => {
      const { data, error } = await supabase.rpc('get_query_coverage_stats', {
        p_days: days,
      });

      if (error) {
        throw new Error(error.message);
      }

      // Handle both single object and array response
      const stats = Array.isArray(data) ? data[0] : data;

      return {
        total_intents: stats?.total_intents || 0,
        covered_intents: stats?.covered_intents || 0,
        uncovered_intents: stats?.uncovered_intents || 0,
        coverage_percentage: stats?.coverage_percentage || 0,
        total_queries: stats?.total_queries || 0,
        covered_queries: stats?.covered_queries || 0,
        uncovered_queries: stats?.uncovered_queries || 0,
        queries_coverage_percentage: stats?.queries_coverage_percentage || 0,
        categories: stats?.categories || [],
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch trending uncovered queries (skill gaps)
 */
export function useQueryGaps(options?: QueryAnalyticsOptions) {
  const days = timeRangeToDays(options?.timeRange || '30d');
  const limit = options?.limit || 10;

  return useQuery({
    queryKey: QUERY_KEYS.gaps(days, limit),
    queryFn: async (): Promise<QueryIntent[]> => {
      const { data, error } = await supabase.rpc('get_trending_query_gaps', {
        p_limit: limit,
        p_days: days,
      });

      if (error) {
        throw new Error(error.message);
      }

      return data || [];
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch all trending queries (both covered and uncovered)
 */
export function useTrendingQueries(options?: QueryAnalyticsOptions) {
  const days = timeRangeToDays(options?.timeRange || '30d');
  const limit = options?.limit || 20;

  return useQuery({
    queryKey: QUERY_KEYS.trending(days, limit),
    queryFn: async (): Promise<QueryIntent[]> => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const { data, error } = await supabase
        .from('copilot_query_intents')
        .select('*')
        .gte('last_seen_at', cutoffDate.toISOString())
        .order('query_count', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message);
      }

      return data || [];
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch queries by category
 */
export function useQueriesByCategory(
  category: string,
  options?: Pick<QueryAnalyticsOptions, 'timeRange' | 'limit'>
) {
  const days = timeRangeToDays(options?.timeRange || '30d');

  return useQuery({
    queryKey: QUERY_KEYS.byCategory(category, days),
    queryFn: async (): Promise<QueryIntent[]> => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const { data, error } = await supabase
        .from('copilot_query_intents')
        .select('*')
        .eq('intent_category', category)
        .gte('last_seen_at', cutoffDate.toISOString())
        .order('query_count', { ascending: false })
        .limit(options?.limit || 50);

      if (error) {
        throw new Error(error.message);
      }

      return data || [];
    },
    enabled: !!category,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Combined hook for all query analytics data
 */
export function useQueryAnalytics(options?: QueryAnalyticsOptions) {
  const coverageQuery = useQueryCoverageStats({ timeRange: options?.timeRange });
  const gapsQuery = useQueryGaps(options);
  const trendingQuery = useTrendingQueries(options);

  return {
    coverage: coverageQuery.data,
    gaps: gapsQuery.data,
    trending: trendingQuery.data,
    isLoading: coverageQuery.isLoading || gapsQuery.isLoading || trendingQuery.isLoading,
    isError: coverageQuery.isError || gapsQuery.isError || trendingQuery.isError,
    error: coverageQuery.error || gapsQuery.error || trendingQuery.error,
    refetch: () => {
      coverageQuery.refetch();
      gapsQuery.refetch();
      trendingQuery.refetch();
    },
  };
}

export default useQueryAnalytics;

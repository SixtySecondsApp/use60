/**
 * usePipelineData Hook
 *
 * React Query hook that wraps the get_pipeline_with_health RPC.
 * Replaces the old useBatchedDealMetadata pattern with a single unified query.
 *
 * Returns deals with complete context (health scores, relationship health,
 * next actions, splits) plus stage metrics and summary statistics.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

// =============================================================================
// Types
// =============================================================================

export interface PipelineDeal {
  // Core deal fields
  id: string;
  name: string;
  company: string | null;
  value: number | null;
  stage_id: string | null;
  owner_id: string | null;
  close_date: string | null;
  expected_close_date: string | null;
  probability: number | null;
  status: string;
  created_at: string;
  stage_changed_at: string | null;
  company_id: string | null;
  primary_contact_id: string | null;

  // Stage information
  stage_name: string | null;
  stage_color: string | null;
  stage_order: number | null;

  // Deal health scores
  health_score: number | null;
  health_status: 'healthy' | 'warning' | 'critical' | 'stalled' | null;
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  risk_factors: string[] | null;
  sentiment_trend: 'improving' | 'stable' | 'declining' | 'unknown' | null;
  days_in_current_stage: number | null;
  days_since_last_meeting: number | null;
  predicted_close_probability: number | null;

  // Relationship health
  relationship_health_score: number | null;
  relationship_health_status: 'healthy' | 'at_risk' | 'critical' | 'ghost' | null;
  ghost_probability: number | null;
  relationship_risk_factors: string[] | null;

  // Next action counts
  pending_actions_count: number;
  high_urgency_actions_count: number;

  // Split users
  split_users: Array<{
    user_id: string;
    full_name: string;
    percentage: number;
    amount: number;
  }>;
}

export interface StageMetric {
  stage_id: string;
  stage_name: string;
  stage_color: string | null;
  stage_order: number;
  deal_count: number;
  total_value: number;
  weighted_value: number;
}

export interface PipelineSummary {
  total_value: number;
  weighted_value: number;
  deal_count: number;
  healthy_count: number;
  warning_count: number;
  critical_count: number;
  stalled_count: number;
}

export interface PipelineFilters {
  stage_ids?: string[];
  health_status?: string[];
  risk_level?: string[];
  owner_ids?: string[];
  search?: string;
  status?: string;
}

export interface PipelineData {
  deals: PipelineDeal[];
  dealMap: Record<string, PipelineDeal>;
  stageMetrics: StageMetric[];
  totalCount: number;
  summary: PipelineSummary;
}

// =============================================================================
// Hook
// =============================================================================

interface UsePipelineDataOptions {
  filters?: PipelineFilters;
  sortBy?: 'value' | 'health_score' | 'days_in_stage' | 'close_date' | 'created_at' | 'name';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

export function usePipelineData(options: UsePipelineDataOptions = {}) {
  const { user } = useAuth();
  const activeOrgId = useOrgStore((state) => state.activeOrgId);

  const {
    filters = {},
    sortBy = 'value',
    sortDir = 'desc',
    limit = 200,
    offset = 0,
    enabled = true,
  } = options;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'pipeline',
      activeOrgId,
      JSON.stringify(filters),
      sortBy,
      sortDir,
      limit,
      offset,
    ],
    queryFn: async (): Promise<PipelineData> => {
      if (!user?.id || !activeOrgId) {
        return {
          deals: [],
          dealMap: {},
          stageMetrics: [],
          totalCount: 0,
          summary: {
            total_value: 0,
            weighted_value: 0,
            deal_count: 0,
            healthy_count: 0,
            warning_count: 0,
            critical_count: 0,
            stalled_count: 0,
          },
        };
      }

      // Call the unified RPC
      const { data: result, error: rpcError } = await supabase.rpc(
        'get_pipeline_with_health',
        {
          p_user_id: user.id,
          p_org_id: activeOrgId,
          p_filters: filters as any,
          p_sort_by: sortBy,
          p_sort_dir: sortDir,
          p_limit: limit,
          p_offset: offset,
        }
      );

      if (rpcError) {
        throw new Error(`Pipeline RPC error: ${rpcError.message}`);
      }

      if (!result) {
        return {
          deals: [],
          dealMap: {},
          stageMetrics: [],
          totalCount: 0,
          summary: {
            total_value: 0,
            weighted_value: 0,
            deal_count: 0,
            healthy_count: 0,
            warning_count: 0,
            critical_count: 0,
            stalled_count: 0,
          },
        };
      }

      // Parse the JSONB response
      const deals: PipelineDeal[] = result.deals || [];
      const stageMetrics: StageMetric[] = result.stage_metrics || [];
      const totalCount: number = result.total_count || 0;
      const summary: PipelineSummary = result.summary || {
        total_value: 0,
        weighted_value: 0,
        deal_count: 0,
        healthy_count: 0,
        warning_count: 0,
        critical_count: 0,
        stalled_count: 0,
      };

      // Create O(1) lookup map by deal ID
      const dealMap: Record<string, PipelineDeal> = {};
      deals.forEach((deal) => {
        dealMap[deal.id] = deal;
      });

      return {
        deals,
        dealMap,
        stageMetrics,
        totalCount,
        summary,
      };
    },
    enabled: enabled && !!user && !!activeOrgId,
    staleTime: 30000, // Cache for 30 seconds
    gcTime: 60000, // Keep in cache for 1 minute after becoming stale
    refetchOnWindowFocus: false, // Prevent excessive refetching
  });

  return {
    data: data || {
      deals: [],
      dealMap: {},
      stageMetrics: [],
      totalCount: 0,
      summary: {
        total_value: 0,
        weighted_value: 0,
        deal_count: 0,
        healthy_count: 0,
        warning_count: 0,
        critical_count: 0,
        stalled_count: 0,
      },
    },
    isLoading,
    error,
    refetch,
  };
}

/**
 * Helper hook to get a single deal from the pipeline data
 */
export function usePipelineDeal(dealId: string, pipelineData: PipelineData): PipelineDeal | null {
  return pipelineData.dealMap[dealId] || null;
}

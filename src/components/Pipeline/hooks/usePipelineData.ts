/**
 * usePipelineData Hook
 *
 * React Query hook that wraps the get_pipeline_with_health RPC.
 * Falls back to direct table queries if the RPC is not deployed.
 *
 * Returns deals with complete context (health scores, relationship health,
 * next actions, splits) plus stage metrics and summary statistics.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import logger from '@/lib/utils/logger';

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
  contact_name: string | null;
  contact_email: string | null;

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
// Fallback: Direct table queries when RPC is unavailable
// =============================================================================

async function fetchPipelineFallback(
  orgId: string,
  filters: PipelineFilters,
  sortBy: string,
  sortDir: string,
  limit: number,
  offset: number
): Promise<PipelineData> {
  logger.warn('get_pipeline_with_health RPC unavailable — falling back to direct queries');

  // 1. Fetch deal stages
  const { data: stages, error: stagesError } = await supabase
    .from('deal_stages')
    .select('id, name, color, order_position, default_probability')
    .order('order_position', { ascending: true });

  if (stagesError) {
    throw new Error(`Failed to load deal stages: ${stagesError.message}`);
  }

  // 2. Build deals query (with exact count for pagination)
  let dealsQuery = supabase
    .from('deals')
    .select('id, name, company, value, stage_id, owner_id, close_date, expected_close_date, probability, status, created_at, stage_changed_at, company_id, primary_contact_id, contact_name, contact_email, clerk_org_id', { count: 'exact' })
    .eq('clerk_org_id', orgId);

  // Apply status filter (default to open)
  const statusFilter = filters.status || 'open';
  if (statusFilter !== 'all') {
    dealsQuery = dealsQuery.eq('status', statusFilter);
  }

  // Apply stage filter
  if (filters.stage_ids && filters.stage_ids.length > 0) {
    dealsQuery = dealsQuery.in('stage_id', filters.stage_ids);
  }

  // Apply owner filter
  if (filters.owner_ids && filters.owner_ids.length > 0) {
    dealsQuery = dealsQuery.in('owner_id', filters.owner_ids);
  }

  // Apply search filter
  if (filters.search) {
    dealsQuery = dealsQuery.or(`name.ilike.%${filters.search}%,company.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%`);
  }

  // Apply sort
  const sortColumn = sortBy === 'days_in_stage' ? 'stage_changed_at'
    : sortBy === 'health_score' ? 'value' // fallback — no health column in deals table
    : sortBy;
  dealsQuery = dealsQuery.order(sortColumn, { ascending: sortDir === 'asc' });

  // Apply pagination
  dealsQuery = dealsQuery.range(offset, offset + limit - 1);

  const { data: rawDeals, error: dealsError, count: rawCount } = await dealsQuery;

  if (dealsError) {
    throw new Error(`Failed to load deals: ${dealsError.message}`);
  }

  // 3. Build stage lookup
  const stageLookup: Record<string, typeof stages[number]> = {};
  (stages || []).forEach((s) => {
    stageLookup[s.id] = s;
  });

  // 4. Map raw deals to PipelineDeal shape
  const deals: PipelineDeal[] = (rawDeals || []).map((d: any) => {
    const stage = d.stage_id ? stageLookup[d.stage_id] : null;
    const daysInStage = d.stage_changed_at
      ? Math.floor((Date.now() - new Date(d.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      id: d.id,
      name: d.name,
      company: d.company,
      value: d.value,
      stage_id: d.stage_id,
      owner_id: d.owner_id,
      close_date: d.close_date,
      expected_close_date: d.expected_close_date,
      probability: d.probability,
      status: d.status,
      created_at: d.created_at,
      stage_changed_at: d.stage_changed_at,
      company_id: d.company_id,
      primary_contact_id: d.primary_contact_id,
      contact_name: d.contact_name || null,
      contact_email: d.contact_email || null,
      // Stage info from join
      stage_name: stage?.name || null,
      stage_color: stage?.color || null,
      stage_order: stage?.order_position ?? null,
      // Health fields default to null in fallback mode
      health_score: null,
      health_status: null,
      risk_level: null,
      risk_factors: null,
      sentiment_trend: null,
      days_in_current_stage: daysInStage,
      days_since_last_meeting: null,
      predicted_close_probability: null,
      relationship_health_score: null,
      relationship_health_status: null,
      ghost_probability: null,
      relationship_risk_factors: null,
      pending_actions_count: 0,
      high_urgency_actions_count: 0,
      split_users: [],
    };
  });

  // 5. Compute stage metrics
  const stageMetrics: StageMetric[] = (stages || []).map((s) => {
    const stageDeals = deals.filter((d) => d.stage_id === s.id);
    const totalValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    const weightedValue = stageDeals.reduce(
      (sum, d) => sum + (d.value || 0) * ((d.probability || 0) / 100),
      0
    );
    return {
      stage_id: s.id,
      stage_name: s.name,
      stage_color: s.color,
      stage_order: s.order_position,
      deal_count: stageDeals.length,
      total_value: totalValue,
      weighted_value: weightedValue,
    };
  });

  // 6. Compute summary
  const summary: PipelineSummary = {
    total_value: deals.reduce((sum, d) => sum + (d.value || 0), 0),
    weighted_value: deals.reduce(
      (sum, d) => sum + (d.value || 0) * ((d.probability || 0) / 100),
      0
    ),
    deal_count: deals.length,
    healthy_count: 0,
    warning_count: 0,
    critical_count: 0,
    stalled_count: 0,
  };

  // 7. Build deal map
  const dealMap: Record<string, PipelineDeal> = {};
  deals.forEach((deal) => {
    dealMap[deal.id] = deal;
  });

  return {
    deals,
    dealMap,
    stageMetrics,
    totalCount: rawCount ?? deals.length,
    summary,
  };
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

      // Try the unified RPC first
      try {
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
          throw rpcError;
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
      } catch (rpcErr) {
        // RPC failed — fall back to direct table queries
        logger.warn('Pipeline RPC failed, using fallback:', rpcErr);
        return fetchPipelineFallback(activeOrgId, filters, sortBy, sortDir, limit, offset);
      }
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

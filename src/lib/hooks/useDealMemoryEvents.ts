/**
 * useDealMemoryEvents — React Query hooks for deal_memory_events
 *
 * Provides data fetching for the Deal Memory viewer (TRINITY-006).
 * Queries the deal_memory_events table filtered by org_id and optionally deal_id.
 * Also provides a lightweight deals list for the deal selector dropdown.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import { useAuth } from '@/lib/contexts/AuthContext';

// ============================================================================
// Cache keys
// ============================================================================

export const DEAL_MEMORY_EVENTS_KEY = 'deal-memory-events' as const;
export const DEAL_MEMORY_DEALS_KEY = 'deal-memory-deals' as const;

// ============================================================================
// Types
// ============================================================================

export interface DealMemoryEvent {
  id: string;
  org_id: string;
  deal_id: string;
  event_type: string;
  event_category: string;
  source_type: string;
  source_id: string | null;
  source_timestamp: string;
  summary: string;
  detail: Record<string, unknown>;
  verbatim_quote: string | null;
  speaker: string | null;
  confidence: number;
  salience: string | null;
  is_active: boolean;
  superseded_by: string | null;
  contact_ids: string[];
  extracted_by: string;
  model_used: string | null;
  credit_cost: number;
  created_at: string;
  updated_at: string;
}

export interface DealForSelector {
  id: string;
  name: string;
  company: string;
  stage_name: string | null;
  stage_color: string | null;
}

// ============================================================================
// Query hooks
// ============================================================================

/**
 * Fetch deal_memory_events for a specific deal.
 * Only returns active events (is_active = true), ordered by source_timestamp DESC, limited to 100.
 */
export function useDealMemoryEventsQuery(dealId: string | null) {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<DealMemoryEvent[]>({
    queryKey: [DEAL_MEMORY_EVENTS_KEY, activeOrgId, dealId],
    queryFn: async () => {
      if (!activeOrgId || !dealId) return [];

      const { data, error } = await supabase
        .from('deal_memory_events')
        .select(
          'id, org_id, deal_id, event_type, event_category, source_type, source_id, source_timestamp, summary, detail, verbatim_quote, speaker, confidence, salience, is_active, superseded_by, contact_ids, extracted_by, model_used, credit_cost, created_at, updated_at'
        )
        .eq('org_id', activeOrgId)
        .eq('deal_id', dealId)
        .eq('is_active', true)
        .order('source_timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data ?? []) as DealMemoryEvent[];
    },
    enabled: !!activeOrgId && !!dealId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetch a lightweight list of the user's deals for the deal selector dropdown.
 * Uses clerk_org_id (which stores the org UUID) and joins deal_stages for stage name/color.
 */
export function useDealMemoryDealsQuery() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const { user } = useAuth();

  return useQuery<DealForSelector[]>({
    queryKey: [DEAL_MEMORY_DEALS_KEY, activeOrgId, user?.id],
    queryFn: async () => {
      if (!activeOrgId) return [];

      const { data, error } = await supabase
        .from('deals')
        .select('id, name, company, deal_stages:stage_id(name, color)')
        .eq('clerk_org_id', activeOrgId)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      if (!data) return [];

      return data.map((d: any) => ({
        id: d.id,
        name: d.name,
        company: d.company,
        stage_name: d.deal_stages?.name ?? null,
        stage_color: d.deal_stages?.color ?? null,
      }));
    },
    enabled: !!activeOrgId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * useCommitments — React Query hook for commitment-type deal_memory_events
 *
 * Fetches all commitment events (commitment_made, commitment_fulfilled, commitment_broken)
 * across all deals for the active org. Joins deal names for display.
 *
 * TRINITY-013
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

// ============================================================================
// Cache key
// ============================================================================

export const COMMITMENTS_KEY = 'brain-commitments' as const;

// ============================================================================
// Types
// ============================================================================

export interface CommitmentEvent {
  id: string;
  org_id: string;
  deal_id: string;
  event_type: string;
  event_category: string;
  source_type: string;
  source_timestamp: string;
  summary: string;
  detail: Record<string, unknown>;
  verbatim_quote: string | null;
  speaker: string | null;
  confidence: number;
  salience: string | null;
  is_active: boolean;
  contact_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface CommitmentWithDeal extends CommitmentEvent {
  deal_name: string;
  deal_company: string;
}

export interface DealLookup {
  id: string;
  name: string;
  company: string;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetch all commitment-category events for the active org.
 * Returns commitment_made, commitment_fulfilled, and commitment_broken events
 * enriched with deal name and company.
 */
export function useCommitmentsQuery() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<CommitmentWithDeal[]>({
    queryKey: [COMMITMENTS_KEY, activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];

      // 1. Fetch all commitment events across all deals
      const { data: events, error: eventsError } = await supabase
        .from('deal_memory_events')
        .select(
          'id, org_id, deal_id, event_type, event_category, source_type, source_timestamp, summary, detail, verbatim_quote, speaker, confidence, salience, is_active, contact_ids, created_at, updated_at'
        )
        .eq('org_id', activeOrgId)
        .eq('event_category', 'commitment')
        .eq('is_active', true)
        .order('source_timestamp', { ascending: false })
        .limit(500);

      if (eventsError) throw eventsError;
      if (!events || events.length === 0) return [];

      // 2. Collect unique deal_ids to fetch deal names
      const dealIds = [...new Set(events.map((e: any) => e.deal_id))];

      // 3. Fetch deal names — using clerk_org_id which stores the org UUID
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('id, name, company')
        .eq('clerk_org_id', activeOrgId)
        .in('id', dealIds);

      if (dealsError) {
        console.error('[useCommitments] deals fetch error:', dealsError.message);
      }

      // Build a lookup map
      const dealMap = new Map<string, DealLookup>();
      for (const deal of (deals ?? []) as DealLookup[]) {
        dealMap.set(deal.id, deal);
      }

      // 4. Enrich events with deal info
      return (events as CommitmentEvent[]).map((event) => {
        const deal = dealMap.get(event.deal_id);
        return {
          ...event,
          deal_name: deal?.name ?? 'Unknown Deal',
          deal_company: deal?.company ?? '',
        };
      });
    },
    enabled: !!activeOrgId,
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

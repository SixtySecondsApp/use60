/**
 * useDealMemory — React Query hooks for deal memory data (MEM-007)
 *
 * Wraps the `deal-memory` edge function endpoints.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DealMemoryEvent {
  id: string;
  event_type: string;
  event_category: string;
  source_type: string;
  source_timestamp: string;
  summary: string;
  detail: Record<string, unknown>;
  verbatim_quote: string | null;
  speaker: string | null;
  confidence: number;
  salience: 'high' | 'medium' | 'low';
  contact_ids: string[];
  is_active: boolean;
}

export interface DealMemorySnapshot {
  id: string;
  narrative: string;
  key_facts: {
    close_date: string | null;
    amount: number | null;
    stage: string | null;
    champion: { name: string; contact_id: string } | null;
    blockers: string[];
    competitors: string[];
    open_commitments_count: number;
  };
  stakeholder_map: Array<{
    contact_id: string;
    name: string;
    role: string;
    engagement_level: string;
    last_active: string | null;
  }>;
  risk_assessment: {
    overall_score: number;
    factors: Array<{ type: string; severity: string; detail: string }>;
  };
  sentiment_trajectory: Array<{ date: string; score: number; trigger: string }>;
  open_commitments: Array<{
    event_id: string;
    owner: 'rep' | 'prospect';
    action: string;
    deadline: string | null;
    status: 'pending' | 'fulfilled' | 'broken';
    created_at: string;
  }>;
  event_count: number;
  created_at: string;
}

export interface ContactMemoryProfile {
  id: string;
  communication_style: {
    preferred_channel?: string;
    response_speed?: string;
    formality_level?: string;
    best_time_to_reach?: string;
  };
  decision_style: {
    approach?: string;
    risk_tolerance?: string;
  };
  interests: Array<{ topic: string; context: string; times_mentioned: number }>;
  relationship_strength: number;
  last_interaction_at: string | null;
  summary: string | null;
}

// ── Edge function caller ──────────────────────────────────────────────────────

async function invokeMemory<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`deal-memory/${action}`, {
    body,
  });
  if (error) throw new Error(error.message);
  return data as T;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useDealMemoryEvents(
  dealId: string | null,
  categories?: string[],
  page = 0,
) {
  return useQuery({
    queryKey: ['deal-memory-events', dealId, categories, page],
    queryFn: () =>
      invokeMemory<{ events: DealMemoryEvent[]; total: number }>('events', {
        deal_id: dealId,
        categories,
        limit: 50,
        offset: page * 50,
      }),
    enabled: !!dealId,
    staleTime: 60_000,
  });
}

export function useDealMemorySnapshot(dealId: string | null) {
  return useQuery({
    queryKey: ['deal-memory-snapshot', dealId],
    queryFn: () =>
      invokeMemory<{ snapshot: DealMemorySnapshot | null }>('snapshot', {
        deal_id: dealId,
      }),
    enabled: !!dealId,
    staleTime: 120_000,
  });
}

export function useContactMemory(contactId: string | null) {
  return useQuery({
    queryKey: ['contact-memory', contactId],
    queryFn: () =>
      invokeMemory<{ events: DealMemoryEvent[]; profile: ContactMemoryProfile | null }>('contact', {
        contact_id: contactId,
      }),
    enabled: !!contactId,
    staleTime: 120_000,
  });
}

export function useFlagMemoryEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, reason }: { eventId: string; reason?: string }) =>
      invokeMemory<{ success: boolean }>('flag', { event_id: eventId, reason }),
    onSuccess: (_, { eventId }) => {
      toast.success('Memory flagged — the AI will learn from your correction.');
      // Invalidate all deal memory event queries
      queryClient.invalidateQueries({ queryKey: ['deal-memory-events'] });
    },
    onError: () => {
      toast.error('Failed to flag memory event');
    },
  });
}

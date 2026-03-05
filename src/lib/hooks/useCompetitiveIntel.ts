/**
 * useCompetitiveIntel
 *
 * React Query hooks for the Competitive Intelligence Library (PRD-105).
 * Wraps competitor_profiles and competitive_mentions Supabase tables.
 *
 * Stories: COMP-007
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface CompetitorProfile {
  id: string;
  org_id: string;
  competitor_name: string;
  mention_count: number;
  win_count: number;
  loss_count: number;
  win_rate: number | null;
  common_strengths: Array<{ strength: string; count: number }>;
  common_weaknesses: Array<{ weakness: string; count: number }>;
  effective_counters: Array<{ counter: string; source_deal_id: string | null; category: string }>;
  last_mentioned_at: string | null;
  battlecard_content: string | null;
  auto_battlecard: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompetitiveMention {
  id: string;
  org_id: string;
  deal_id: string | null;
  meeting_id: string | null;
  competitor_name: string;
  mention_context: string | null;
  sentiment: 'positive' | 'negative' | 'neutral';
  category: string;
  strengths_mentioned: string[];
  weaknesses_mentioned: string[];
  pricing_discussed: boolean;
  pricing_detail: string | null;
  deal_outcome: 'won' | 'lost' | null;
  detected_by: string | null;
  created_at: string;
}

export interface MentionByDay {
  date: string;   // 'YYYY-MM-DD'
  count: number;
}

export interface MentionWithDeal {
  id: string;
  deal_id: string | null;
  meeting_id: string | null;
  deal_name: string | null;
  deal_stage: string | null;
  deal_outcome: 'won' | 'lost' | null;
  sentiment: 'positive' | 'negative' | 'neutral';
  mention_context: string | null;
  created_at: string;
}

// ============================================================================
// Query keys
// ============================================================================

const KEYS = {
  profiles: (orgId: string) => ['competitive-intel', 'profiles', orgId] as const,
  profile: (orgId: string, name: string) => ['competitive-intel', 'profile', orgId, name] as const,
  mentions: (orgId: string, competitorName: string, days: number) =>
    ['competitive-intel', 'mentions', orgId, competitorName, days] as const,
  mentionsWithDeals: (orgId: string, competitorName: string) =>
    ['competitive-intel', 'mentions-deals', orgId, competitorName] as const,
};

// ============================================================================
// useCompetitorProfiles — list all profiles for the org
// ============================================================================

export function useCompetitorProfiles() {
  const { activeOrgId } = useOrgStore();
  const orgId = activeOrgId ?? '';

  return useQuery<CompetitorProfile[]>({
    queryKey: KEYS.profiles(orgId),
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('competitor_profiles')
        .select('id, org_id, competitor_name, mention_count, win_count, loss_count, win_rate, common_strengths, common_weaknesses, effective_counters, last_mentioned_at, battlecard_content, auto_battlecard, created_at, updated_at')
        .eq('org_id', orgId)
        .order('mention_count', { ascending: false });

      if (error) throw error;
      return (data ?? []) as CompetitorProfile[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// useCompetitorProfile — single profile by name
// ============================================================================

export function useCompetitorProfile(competitorName: string) {
  const { activeOrgId } = useOrgStore();
  const orgId = activeOrgId ?? '';

  return useQuery<CompetitorProfile | null>({
    queryKey: KEYS.profile(orgId, competitorName),
    queryFn: async () => {
      if (!orgId || !competitorName) return null;
      const { data, error } = await supabase
        .from('competitor_profiles')
        .select('id, org_id, competitor_name, mention_count, win_count, loss_count, win_rate, common_strengths, common_weaknesses, effective_counters, last_mentioned_at, battlecard_content, auto_battlecard, created_at, updated_at')
        .eq('org_id', orgId)
        .ilike('competitor_name', competitorName)
        .maybeSingle();

      if (error) throw error;
      return (data as CompetitorProfile | null) ?? null;
    },
    enabled: !!orgId && !!competitorName,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// useMentionFrequency — per-day mention counts for sparkline/bar chart
// ============================================================================

export function useMentionFrequency(competitorName: string, days: 30 | 60 | 90) {
  const { activeOrgId } = useOrgStore();
  const orgId = activeOrgId ?? '';

  return useQuery<MentionByDay[]>({
    queryKey: KEYS.mentions(orgId, competitorName, days),
    queryFn: async () => {
      if (!orgId || !competitorName) return [];

      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await supabase
        .from('competitive_mentions')
        .select('created_at')
        .eq('org_id', orgId)
        .ilike('competitor_name', competitorName)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Bucket by date
      const byDate = new Map<string, number>();
      for (const row of data ?? []) {
        const d = row.created_at.slice(0, 10);
        byDate.set(d, (byDate.get(d) ?? 0) + 1);
      }

      // Fill every day in range
      const result: MentionByDay[] = [];
      const cursor = new Date(since);
      const end = new Date();
      while (cursor <= end) {
        const d = cursor.toISOString().slice(0, 10);
        result.push({ date: d, count: byDate.get(d) ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
      }

      return result;
    },
    enabled: !!orgId && !!competitorName,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// useMentionsWithDeals — mentions joined with deal info
// ============================================================================

export function useMentionsWithDeals(competitorName: string) {
  const { activeOrgId } = useOrgStore();
  const orgId = activeOrgId ?? '';

  return useQuery<MentionWithDeal[]>({
    queryKey: KEYS.mentionsWithDeals(orgId, competitorName),
    queryFn: async () => {
      if (!orgId || !competitorName) return [];

      const { data, error } = await supabase
        .from('competitive_mentions')
        .select('id, deal_id, meeting_id, deal_outcome, sentiment, mention_context, created_at')
        .eq('org_id', orgId)
        .ilike('competitor_name', competitorName)
        .not('deal_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Enrich with deal names
      const dealIds = [...new Set((data ?? []).map(m => m.deal_id).filter(Boolean))] as string[];
      let dealMap = new Map<string, { name: string; stage: string | null }>();

      if (dealIds.length > 0) {
        const { data: deals } = await supabase
          .from('deals')
          .select('id, name, stage')
          .in('id', dealIds);

        for (const d of deals ?? []) {
          dealMap.set(d.id, { name: d.name, stage: d.stage });
        }
      }

      return (data ?? []).map(m => ({
        id: m.id,
        deal_id: m.deal_id,
        meeting_id: m.meeting_id,
        deal_name: m.deal_id ? (dealMap.get(m.deal_id)?.name ?? null) : null,
        deal_stage: m.deal_id ? (dealMap.get(m.deal_id)?.stage ?? null) : null,
        deal_outcome: m.deal_outcome,
        sentiment: m.sentiment,
        mention_context: m.mention_context,
        created_at: m.created_at,
      }));
    },
    enabled: !!orgId && !!competitorName,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// useUpdateBattlecard — save edited battlecard_content
// ============================================================================

export function useUpdateBattlecard() {
  const qc = useQueryClient();
  const { activeOrgId } = useOrgStore();

  return useMutation({
    mutationFn: async ({ profileId, content }: { profileId: string; content: string | null }) => {
      const { error } = await supabase
        .from('competitor_profiles')
        .update({ battlecard_content: content })
        .eq('id', profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Battlecard saved');
      qc.invalidateQueries({ queryKey: ['competitive-intel'] });
    },
    onError: () => toast.error('Failed to save battlecard'),
  });
}

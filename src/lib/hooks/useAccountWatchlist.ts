/**
 * useAccountWatchlist Hook
 *
 * Manages Smart Listening watchlist — accounts monitored for intent signals.
 * Handles CRUD for watchlist entries, signal queries, and unread counts.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrg } from '@/lib/contexts/OrgContext';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface AccountWatchlistEntry {
  id: string;
  org_id: string;
  user_id: string;
  account_type: 'company' | 'contact';
  company_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  source: 'manual' | 'deal_auto';
  monitor_frequency: 'weekly' | 'twice_weekly' | 'daily';
  monitor_day: string;
  enabled_sources: string[];
  custom_research_prompt: string | null;
  is_active: boolean;
  last_checked_at: string | null;
  next_check_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  companies?: { id: string; name: string; domain: string | null } | null;
  contacts?: { id: string; first_name: string; last_name: string; email: string | null; company_id: string | null } | null;
  deals?: { id: string; name: string; stage: string | null } | null;
  signal_count?: number;
}

export interface AccountSignal {
  id: string;
  org_id: string;
  watchlist_id: string;
  signal_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  relevance_score: number | null;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  evidence: string | null;
  recommended_action: string | null;
  source: 'apollo_diff' | 'web_intel' | 'custom_prompt';
  is_read: boolean;
  is_dismissed: boolean;
  is_actioned: boolean;
  actioned_at: string | null;
  slack_notified: boolean;
  in_app_notified: boolean;
  detected_at: string;
  created_at: string;
}

export type MonitorFrequency = 'weekly' | 'twice_weekly' | 'daily';

export interface CostEstimate {
  apolloCreditsPerWeek: number;
  webIntelCostPerWeek: number;
  customPromptCostPerWeek: number;
  totalCostPerWeek: number;
}

// ============================================================================
// Query Keys
// ============================================================================

const QUERY_KEYS = {
  watchlist: (orgId: string) => ['account-watchlist', orgId] as const,
  signals: (watchlistId: string) => ['account-signals', watchlistId] as const,
  allSignals: (orgId: string) => ['account-signals-all', orgId] as const,
  unreadCount: (orgId: string) => ['account-signals-unread', orgId] as const,
};

// ============================================================================
// Cost estimation helpers
// ============================================================================

const FREQUENCY_MULTIPLIER: Record<MonitorFrequency, number> = {
  weekly: 1,
  twice_weekly: 2,
  daily: 7,
};

const COST_PER_CHECK = {
  apollo_credits: 1,
  web_intel_usd: 0.05,
  custom_prompt_usd: 0.05,
};

export function estimateCostPerWeek(
  frequency: MonitorFrequency,
  enabledSources: string[]
): CostEstimate {
  const multiplier = FREQUENCY_MULTIPLIER[frequency];
  return {
    apolloCreditsPerWeek: enabledSources.includes('apollo') ? COST_PER_CHECK.apollo_credits * multiplier : 0,
    webIntelCostPerWeek: enabledSources.includes('web_intel') ? COST_PER_CHECK.web_intel_usd * multiplier : 0,
    customPromptCostPerWeek: enabledSources.includes('custom_prompt') ? COST_PER_CHECK.custom_prompt_usd * multiplier : 0,
    totalCostPerWeek:
      (enabledSources.includes('web_intel') ? COST_PER_CHECK.web_intel_usd * multiplier : 0) +
      (enabledSources.includes('custom_prompt') ? COST_PER_CHECK.custom_prompt_usd * multiplier : 0),
  };
}

export function estimateAggregateCost(entries: AccountWatchlistEntry[]): CostEstimate {
  const totals: CostEstimate = {
    apolloCreditsPerWeek: 0,
    webIntelCostPerWeek: 0,
    customPromptCostPerWeek: 0,
    totalCostPerWeek: 0,
  };

  for (const entry of entries) {
    const cost = estimateCostPerWeek(entry.monitor_frequency, entry.enabled_sources);
    totals.apolloCreditsPerWeek += cost.apolloCreditsPerWeek;
    totals.webIntelCostPerWeek += cost.webIntelCostPerWeek;
    totals.customPromptCostPerWeek += cost.customPromptCostPerWeek;
    totals.totalCostPerWeek += cost.totalCostPerWeek;
  }

  return totals;
}

// ============================================================================
// Hook
// ============================================================================

export function useAccountWatchlist() {
  const queryClient = useQueryClient();
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id;

  // --------------------------------------------------------------------------
  // Fetch all active watchlist entries for the current user
  // --------------------------------------------------------------------------

  const watchlistQuery = useQuery({
    queryKey: QUERY_KEYS.watchlist(orgId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_watchlist')
        .select(`
          id, org_id, user_id, account_type, company_id, contact_id, deal_id,
          source, monitor_frequency, monitor_day, enabled_sources,
          custom_research_prompt, is_active, last_checked_at, next_check_at,
          created_at, updated_at,
          companies:company_id (id, name, domain),
          contacts:contact_id (id, first_name, last_name, email, company_id),
          deals:deal_id (id, name, stage)
        `)
        .eq('org_id', orgId!)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as AccountWatchlistEntry[];
    },
    enabled: !!orgId,
  });

  // --------------------------------------------------------------------------
  // Unread signal count (for badge)
  // --------------------------------------------------------------------------

  const unreadCountQuery = useQuery({
    queryKey: QUERY_KEYS.unreadCount(orgId ?? ''),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('account_signals')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId!)
        .eq('is_read', false)
        .eq('is_dismissed', false);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!orgId,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  // --------------------------------------------------------------------------
  // Add to watchlist
  // --------------------------------------------------------------------------

  const addToWatchlistMutation = useMutation({
    mutationFn: async (params: {
      accountType: 'company' | 'contact';
      companyId?: string;
      contactId?: string;
      dealId?: string;
      source?: 'manual' | 'deal_auto';
      monitorFrequency?: MonitorFrequency;
      enabledSources?: string[];
    }) => {
      const { data, error } = await supabase
        .from('account_watchlist')
        .insert({
          org_id: orgId!,
          user_id: (await supabase.auth.getUser()).data.user!.id,
          account_type: params.accountType,
          company_id: params.companyId ?? null,
          contact_id: params.contactId ?? null,
          deal_id: params.dealId ?? null,
          source: params.source ?? 'manual',
          monitor_frequency: params.monitorFrequency ?? 'weekly',
          enabled_sources: params.enabledSources ?? ['apollo'],
        })
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.watchlist(orgId!) });
      toast.success('Account added to watchlist');
    },
    onError: (error: Error) => {
      if (error.message?.includes('unique')) {
        toast.info('Account is already on your watchlist');
      } else {
        toast.error(`Failed to add to watchlist: ${error.message}`);
      }
    },
  });

  // --------------------------------------------------------------------------
  // Remove from watchlist (soft-deactivate)
  // --------------------------------------------------------------------------

  const removeFromWatchlistMutation = useMutation({
    mutationFn: async (watchlistId: string) => {
      const { error } = await supabase
        .from('account_watchlist')
        .update({ is_active: false })
        .eq('id', watchlistId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.watchlist(orgId!) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.unreadCount(orgId!) });
      toast.success('Account removed from watchlist');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove from watchlist: ${error.message}`);
    },
  });

  // --------------------------------------------------------------------------
  // Update watchlist entry (frequency, sources, prompt)
  // --------------------------------------------------------------------------

  const updateWatchlistEntryMutation = useMutation({
    mutationFn: async (params: {
      watchlistId: string;
      monitorFrequency?: MonitorFrequency;
      monitorDay?: string;
      enabledSources?: string[];
      customResearchPrompt?: string | null;
    }) => {
      const updates: Record<string, unknown> = {};
      if (params.monitorFrequency !== undefined) updates.monitor_frequency = params.monitorFrequency;
      if (params.monitorDay !== undefined) updates.monitor_day = params.monitorDay;
      if (params.enabledSources !== undefined) updates.enabled_sources = params.enabledSources;
      if (params.customResearchPrompt !== undefined) updates.custom_research_prompt = params.customResearchPrompt;

      const { error } = await supabase
        .from('account_watchlist')
        .update(updates)
        .eq('id', params.watchlistId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.watchlist(orgId!) });
      toast.success('Watchlist settings updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update settings: ${error.message}`);
    },
  });

  // --------------------------------------------------------------------------
  // Mark signal as read
  // --------------------------------------------------------------------------

  const markSignalReadMutation = useMutation({
    mutationFn: async (signalId: string) => {
      const { error } = await supabase
        .from('account_signals')
        .update({ is_read: true })
        .eq('id', signalId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.unreadCount(orgId!) });
    },
  });

  // --------------------------------------------------------------------------
  // Dismiss signal
  // --------------------------------------------------------------------------

  const dismissSignalMutation = useMutation({
    mutationFn: async (signalId: string) => {
      const { error } = await supabase
        .from('account_signals')
        .update({ is_dismissed: true, is_read: true })
        .eq('id', signalId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.unreadCount(orgId!) });
      toast.success('Signal dismissed');
    },
  });

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  return {
    // Watchlist
    watchlist: watchlistQuery.data ?? [],
    isLoadingWatchlist: watchlistQuery.isLoading,
    watchlistError: watchlistQuery.error,

    // Unread count (for badge)
    unreadSignalCount: unreadCountQuery.data ?? 0,

    // Cost estimates
    aggregateCost: estimateAggregateCost(watchlistQuery.data ?? []),

    // Mutations
    addToWatchlist: addToWatchlistMutation.mutate,
    addToWatchlistAsync: addToWatchlistMutation.mutateAsync,
    isAddingToWatchlist: addToWatchlistMutation.isPending,

    removeFromWatchlist: removeFromWatchlistMutation.mutate,
    isRemovingFromWatchlist: removeFromWatchlistMutation.isPending,

    updateWatchlistEntry: updateWatchlistEntryMutation.mutate,
    isUpdatingEntry: updateWatchlistEntryMutation.isPending,

    markSignalRead: markSignalReadMutation.mutate,
    dismissSignal: dismissSignalMutation.mutate,
  };
}

// ============================================================================
// Signals query hook (for a specific watchlist entry or all signals)
// ============================================================================

export function useAccountSignals(watchlistId?: string) {
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id;

  return useQuery({
    queryKey: watchlistId
      ? QUERY_KEYS.signals(watchlistId)
      : QUERY_KEYS.allSignals(orgId ?? ''),
    queryFn: async () => {
      let query = supabase
        .from('account_signals')
        .select(`
          id, org_id, watchlist_id, signal_type, severity, relevance_score,
          title, summary, details, evidence, recommended_action,
          source, is_read, is_dismissed, is_actioned, actioned_at,
          slack_notified, in_app_notified, detected_at, created_at
        `)
        .eq('is_dismissed', false)
        .order('detected_at', { ascending: false })
        .limit(50);

      if (watchlistId) {
        query = query.eq('watchlist_id', watchlistId);
      } else {
        query = query.eq('org_id', orgId!);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AccountSignal[];
    },
    enabled: !!(watchlistId || orgId),
  });
}

export { QUERY_KEYS as ACCOUNT_WATCHLIST_QUERY_KEYS };

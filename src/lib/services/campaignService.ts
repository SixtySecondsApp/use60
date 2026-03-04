/**
 * Campaign Service
 *
 * Wraps instantly-admin and monitor-campaigns edge functions.
 * All calls go through supabase.functions.invoke() which auto-injects auth.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import type {
  Campaign,
  CampaignAnalytics,
  DailyAnalyticsEntry,
  MonitorData,
  StatusFilter,
} from '@/lib/types/campaign';

// ============================================================================
// Service functions
// ============================================================================

export async function listCampaigns(orgId: string, status?: StatusFilter): Promise<Campaign[]> {
  const body: Record<string, unknown> = { action: 'list_campaigns', org_id: orgId, limit: 100 };
  if (status !== undefined && status !== 'all') {
    body.status = status;
  }

  const { data, error } = await supabase.functions.invoke('instantly-admin', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.campaigns ?? []) as Campaign[];
}

export async function getCampaignAnalytics(
  orgId: string,
  campaignId: string
): Promise<CampaignAnalytics | null> {
  const { data, error } = await supabase.functions.invoke('instantly-admin', {
    body: { action: 'campaign_analytics', org_id: orgId, campaign_id: campaignId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.analytics ?? null) as CampaignAnalytics | null;
}

export async function getDailyAnalytics(
  orgId: string,
  campaignId: string
): Promise<DailyAnalyticsEntry[]> {
  const { data, error } = await supabase.functions.invoke('instantly-admin', {
    body: { action: 'campaign_analytics_daily', org_id: orgId, campaign_id: campaignId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.daily ?? []) as DailyAnalyticsEntry[];
}

export async function createCampaign(
  orgId: string,
  params: { name: string; sequences?: unknown[]; timezone?: string }
): Promise<Campaign> {
  const { data, error } = await supabase.functions.invoke('instantly-admin', {
    body: { action: 'create_campaign', org_id: orgId, ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.campaign as Campaign;
}

export async function activateCampaign(orgId: string, campaignId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('instantly-admin', {
    body: { action: 'activate_campaign', org_id: orgId, campaign_id: campaignId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function pauseCampaign(orgId: string, campaignId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('instantly-admin', {
    body: { action: 'pause_campaign', org_id: orgId, campaign_id: campaignId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function deleteCampaign(orgId: string, campaignId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('instantly-admin', {
    body: { action: 'delete_campaign', org_id: orgId, campaign_id: campaignId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function getMonitorData(
  orgId: string,
  userId: string,
  campaignId?: string
): Promise<MonitorData> {
  const body: Record<string, unknown> = { org_id: orgId, user_id: userId };
  if (campaignId) body.campaign_id = campaignId;

  const { data, error } = await supabase.functions.invoke('monitor-campaigns', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return {
    metrics: data?.metrics ?? [],
    classified_replies: data?.classified_replies ?? [],
    recommendations: data?.recommendations ?? [],
  };
}

// ============================================================================
// React Query hooks
// ============================================================================

/**
 * Fetch campaigns list, optionally filtered by status.
 * Returns both the raw list and the filtered subset (when status != 'all', filter client-side
 * from the full list so we can show counts per tab without extra requests).
 */
export function useCampaigns(orgId: string, status: StatusFilter = 'all') {
  const query = useQuery({
    queryKey: ['campaigns', orgId],
    queryFn: () => listCampaigns(orgId),
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });

  const allCampaigns = query.data ?? [];
  const campaigns =
    status === 'all' ? allCampaigns : allCampaigns.filter((c) => c.status === status);

  return {
    ...query,
    campaigns,
    data: allCampaigns,
  };
}

export function useCampaignAnalytics(orgId: string, campaignId: string | null) {
  return useQuery({
    queryKey: ['campaign-analytics', orgId, campaignId],
    queryFn: () => getCampaignAnalytics(orgId, campaignId!),
    enabled: !!orgId && !!campaignId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDailyCampaignAnalytics(orgId: string, campaignId: string | null) {
  return useQuery({
    queryKey: ['campaign-daily', orgId, campaignId],
    queryFn: () => getDailyAnalytics(orgId, campaignId!),
    enabled: !!orgId && !!campaignId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Monitor hook — fetches reply classification + recommendations.
 * 5-min stale time to avoid excessive Instantly API calls.
 */
export function useCampaignMonitor(orgId: string, userId: string, campaignId?: string) {
  return useQuery({
    queryKey: ['campaign-monitor', orgId, campaignId],
    queryFn: () => getMonitorData(orgId, userId, campaignId),
    enabled: !!orgId && !!userId && !!campaignId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePauseCampaign(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => pauseCampaign(orgId, campaignId),
    onSuccess: () => {
      toast.success('Campaign paused');
      qc.invalidateQueries({ queryKey: ['campaigns', orgId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to pause campaign'),
  });
}

export function useActivateCampaign(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => activateCampaign(orgId, campaignId),
    onSuccess: () => {
      toast.success('Campaign resumed');
      qc.invalidateQueries({ queryKey: ['campaigns', orgId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to resume campaign'),
  });
}

export function useDeleteCampaign(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => deleteCampaign(orgId, campaignId),
    onSuccess: () => {
      toast.success('Campaign deleted');
      qc.invalidateQueries({ queryKey: ['campaigns', orgId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete campaign'),
  });
}

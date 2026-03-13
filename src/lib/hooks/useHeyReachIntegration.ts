import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

export interface HeyReachCampaign {
  id: string;
  name: string;
  status: string;
  senderCount?: number;
}

export interface HeyReachSender {
  id: string;
  name: string;
  linkedinUrl?: string;
  status?: string;
}

export interface HeyReachCampaignLink {
  id: string;
  table_id: string;
  campaign_id: string;
  campaign_name: string | null;
  field_mapping: Record<string, string>;
  sender_column_key: string | null;
  auto_sync_engagement: boolean;
  linked_at: string;
  last_push_at: string | null;
  last_engagement_sync_at: string | null;
  sync_schedule: any;
}

export function useHeyReachIntegration() {
  const { user, isAuthenticated } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [lastWebhookAt, setLastWebhookAt] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [linkedCampaignsCount, setLinkedCampaignsCount] = useState(0);

  const callAdmin = useCallback(async (action: string, extra: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke('heyreach-admin', {
      body: { action, org_id: activeOrgId, ...extra },
    });
    if (error) throw new Error(error.message || 'HeyReach admin call failed');
    if (data && !data.success) throw new Error(data.error || 'Unknown error');
    return data;
  }, [activeOrgId]);

  const refreshStatus = useCallback(async () => {
    if (!isAuthenticated || !user || !activeOrgId) {
      setIsConnected(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await callAdmin('status');
      setIsConnected(data?.connected ?? false);
      setWebhookUrl(data?.webhook_url ?? null);
      setLastWebhookAt(data?.last_webhook_received_at ?? null);
      setConnectedAt(data?.connected_at ?? null);
      setLinkedCampaignsCount(data?.linked_campaigns_count ?? 0);
    } catch (e: any) {
      console.error('[useHeyReachIntegration] status error:', e);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, isAuthenticated, user, callAdmin]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const connect = useCallback(async (apiKey: string) => {
    if (!activeOrgId) throw new Error('No active organization');
    try {
      setConnecting(true);
      const data = await callAdmin('connect', { api_key: apiKey });
      toast.success('HeyReach connected');
      setWebhookUrl(data?.webhook_url ?? null);
      await refreshStatus();
    } catch (e: any) {
      toast.error(e.message || 'Failed to connect HeyReach');
      throw e;
    } finally {
      setConnecting(false);
    }
  }, [activeOrgId, callAdmin, refreshStatus]);

  const disconnect = useCallback(async () => {
    if (!activeOrgId) throw new Error('No active organization');
    try {
      setDisconnecting(true);
      await callAdmin('disconnect');
      toast.success('HeyReach disconnected');
      await refreshStatus();
    } catch (e: any) {
      toast.error(e.message || 'Failed to disconnect');
      throw e;
    } finally {
      setDisconnecting(false);
    }
  }, [activeOrgId, callAdmin, refreshStatus]);

  const listCampaigns = useCallback(async (): Promise<HeyReachCampaign[]> => {
    const data = await callAdmin('list_campaigns');
    return data?.campaigns ?? [];
  }, [callAdmin]);

  const listSenders = useCallback(async (): Promise<HeyReachSender[]> => {
    const data = await callAdmin('list_senders');
    return data?.senders ?? [];
  }, [callAdmin]);

  const listCampaignLinks = useCallback(async (tableId: string): Promise<HeyReachCampaignLink[]> => {
    const data = await callAdmin('list_campaign_links', { table_id: tableId });
    return data?.links ?? [];
  }, [callAdmin]);

  const linkCampaign = useCallback(async (params: {
    table_id: string;
    campaign_id: string;
    campaign_name?: string;
    field_mapping: Record<string, string>;
    sender_column_key?: string;
  }) => {
    await callAdmin('link_campaign', params);
    toast.success(`Linked to ${params.campaign_name || 'campaign'}`);
  }, [callAdmin]);

  const unlinkCampaign = useCallback(async (tableId: string, campaignId: string) => {
    await callAdmin('unlink_campaign', { table_id: tableId, campaign_id: campaignId });
    toast.success('Campaign unlinked');
  }, [callAdmin]);

  const pushToHeyReach = useCallback(async (params: {
    table_id: string;
    campaign_link_id: string;
    row_ids: string[];
  }) => {
    const { data, error } = await supabase.functions.invoke('heyreach-sync-outbound', {
      body: { org_id: activeOrgId, ...params },
    });
    if (error) throw new Error(error.message || 'Push failed');
    if (data && !data.success) throw new Error(data.error || 'Push failed');

    const pushed = data?.pushed ?? 0;
    const failed = data?.failed ?? 0;

    if (failed === 0) {
      toast.success(`${pushed} leads pushed to HeyReach`);
    } else if (pushed > 0) {
      toast.warning(`${pushed} pushed, ${failed} failed`);
    } else {
      toast.error(`Push failed: ${failed} leads could not be sent`);
    }

    return data;
  }, [activeOrgId]);

  return {
    isConnected,
    loading,
    connecting,
    disconnecting,
    webhookUrl,
    lastWebhookAt,
    connectedAt,
    linkedCampaignsCount,
    connect,
    disconnect,
    refreshStatus,
    listCampaigns,
    listSenders,
    listCampaignLinks,
    linkCampaign,
    unlinkCampaign,
    pushToHeyReach,
  };
}

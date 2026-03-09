import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';

export interface LinkedInIntegrationRow {
  id: string;
  org_id: string;
  connected_by_user_id: string | null;
  is_active: boolean;
  is_connected: boolean;
  connected_at: string | null;
  linkedin_ad_account_id: string | null;
  linkedin_ad_account_name: string | null;
  scopes: string[];
  webhook_subscription_ids: unknown[];
  last_sync_at: string | null;
}

export interface LinkedInLeadSourceRow {
  id: string;
  org_id: string;
  form_id: string;
  form_name: string | null;
  source_type: string;
  campaign_name: string | null;
  is_active: boolean;
  leads_count: number;
}

export function useLinkedInIntegration() {
  const { user, isAuthenticated } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const [integration, setIntegration] = useState<LinkedInIntegrationRow | null>(null);
  const [leadSources, setLeadSources] = useState<LinkedInLeadSourceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isConnected = integration?.is_connected ?? false;
  const canManage = Boolean(user && activeOrgId);

  const refreshStatus = useCallback(async () => {
    if (!activeOrgId) {
      setIntegration(null);
      setLeadSources([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [integrationResult, sourcesResult] = await Promise.all([
        supabase
          .from('linkedin_org_integrations')
          .select('id, org_id, connected_by_user_id, is_active, is_connected, connected_at, linkedin_ad_account_id, linkedin_ad_account_name, scopes, webhook_subscription_ids, last_sync_at')
          .eq('org_id', activeOrgId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('linkedin_lead_sources')
          .select('id, org_id, form_id, form_name, source_type, campaign_name, is_active, leads_count')
          .eq('org_id', activeOrgId)
          .order('created_at', { ascending: false }),
      ]);

      setIntegration((integrationResult.data as LinkedInIntegrationRow) ?? null);
      setLeadSources((sourcesResult.data as LinkedInLeadSourceRow[]) ?? []);
    } catch (err) {
      console.error('[useLinkedInIntegration] Error:', err);
      setIntegration(null);
      setLeadSources([]);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const connectLinkedIn = useCallback(async (adAccountId: string, adAccountName: string) => {
    if (!activeOrgId || !user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('linkedin_org_integrations')
      .upsert({
        org_id: activeOrgId,
        connected_by_user_id: user.id,
        is_active: true,
        is_connected: true,
        connected_at: new Date().toISOString(),
        linkedin_ad_account_id: adAccountId,
        linkedin_ad_account_name: adAccountName,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' });

    if (error) throw error;
    await refreshStatus();
  }, [activeOrgId, user, refreshStatus]);

  const disconnectLinkedIn = useCallback(async () => {
    if (!integration?.id) return;

    await supabase
      .from('linkedin_org_integrations')
      .update({
        is_connected: false,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id);

    setIntegration(null);
    setLeadSources([]);
  }, [integration?.id]);

  return {
    isConnected,
    integration,
    leadSources,
    loading,
    canManage,
    connectLinkedIn,
    disconnectLinkedIn,
    refreshStatus,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

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
  webhook_subscription_ids: string[];
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkedInLeadSourceRow {
  id: string;
  org_id: string;
  form_id: string;
  form_name: string | null;
  source_type: 'ad_form' | 'event_form';
  event_id: string | null;
  campaign_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface LinkedInStatus {
  connected: boolean;
  integration: LinkedInIntegrationRow | null;
  leadSources: LinkedInLeadSourceRow[];
}

export function useLinkedInIntegration(enabled: boolean = true) {
  const { user, isAuthenticated } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const activeOrgRole = useOrgStore((s) => s.activeOrgRole);
  const canManage = activeOrgRole === 'owner' || activeOrgRole === 'admin';

  const [status, setStatus] = useState<LinkedInStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      if (!enabled || !isAuthenticated || !user || !activeOrgId) {
        setStatus(null);
        setLoading(false);
        return;
      }
      setLoading(true);

      // Fetch integration status directly from the table (RLS-protected)
      const { data: integration } = await supabase
        .from('linkedin_org_integrations')
        .select('id, org_id, connected_by_user_id, is_active, is_connected, connected_at, linkedin_ad_account_id, linkedin_ad_account_name, scopes, webhook_subscription_ids, last_sync_at, created_at, updated_at')
        .eq('org_id', activeOrgId)
        .maybeSingle();

      const { data: leadSources } = await supabase
        .from('linkedin_lead_sources')
        .select('id, org_id, form_id, form_name, source_type, event_id, campaign_name, is_active, created_at, updated_at')
        .eq('org_id', activeOrgId)
        .order('created_at', { ascending: false });

      setStatus({
        connected: integration?.is_connected ?? false,
        integration: integration as LinkedInIntegrationRow | null,
        leadSources: (leadSources as LinkedInLeadSourceRow[]) || [],
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error('[useLinkedInIntegration] status error:', message);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, enabled, isAuthenticated, user]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Check URL params for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedinStatus = params.get('linkedin_status');
    const linkedinError = params.get('linkedin_error');
    const linkedinErrorDesc = params.get('linkedin_error_description');

    if (linkedinStatus === 'connected') {
      const account = params.get('linkedin_account');
      toast.success(account ? `LinkedIn connected: ${account}` : 'LinkedIn connected successfully');
      // Clean URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('linkedin_status');
      url.searchParams.delete('linkedin_account');
      window.history.replaceState({}, '', url.toString());
      refreshStatus();
    } else if (linkedinError) {
      toast.error(`LinkedIn connection failed: ${linkedinErrorDesc || linkedinError}`);
      const url = new URL(window.location.href);
      url.searchParams.delete('linkedin_error');
      url.searchParams.delete('linkedin_error_description');
      window.history.replaceState({}, '', url.toString());
    }
  }, [refreshStatus]);

  const connectLinkedIn = useCallback(async () => {
    if (!enabled) throw new Error('LinkedIn integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    if (!canManage) throw new Error('Only organization owners/admins can connect LinkedIn');

    setConnecting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('oauth-initiate/linkedin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ org_id: activeOrgId, redirect_path: '/integrations' }),
      });

      if (resp.error) {
        throw new Error(resp.error.message || 'Failed to initiate LinkedIn OAuth');
      }
      if (!resp.data?.success) {
        const errorMsg = resp.data?.message || resp.data?.error || 'Failed to initiate LinkedIn OAuth';
        throw new Error(errorMsg);
      }

      const url = resp.data?.authorization_url;
      if (!url) throw new Error('Missing authorization_url from response');
      window.location.href = url;
    } catch (e: unknown) {
      setConnecting(false);
      throw e;
    }
  }, [activeOrgId, canManage, enabled]);

  const disconnectLinkedIn = useCallback(async () => {
    if (!activeOrgId) throw new Error('No active organization selected');
    if (!canManage) throw new Error('Only organization owners/admins can disconnect LinkedIn');

    try {
      // Deactivate integration
      await supabase
        .from('linkedin_org_integrations')
        .update({ is_connected: false, is_active: false, updated_at: new Date().toISOString() })
        .eq('org_id', activeOrgId);

      // Deactivate credentials
      await supabase
        .from('integration_credentials')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('organization_id', activeOrgId)
        .eq('provider', 'linkedin');

      // Deactivate lead sources
      await supabase
        .from('linkedin_lead_sources')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('org_id', activeOrgId);

      toast.success('LinkedIn disconnected');
      await refreshStatus();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast.error(`Failed to disconnect: ${message}`);
    }
  }, [activeOrgId, canManage, refreshStatus]);

  return {
    status,
    loading,
    connecting,
    canManage,
    connectLinkedIn,
    disconnectLinkedIn,
    refreshStatus,
    isConnected: status?.connected ?? false,
    integration: status?.integration ?? null,
    leadSources: status?.leadSources ?? [],
  };
}

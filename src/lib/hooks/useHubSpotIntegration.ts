import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

export interface HubSpotIntegrationRow {
  id: string;
  org_id: string;
  connected_by_user_id: string | null;
  is_active: boolean;
  is_connected: boolean;
  connected_at: string | null;
  hubspot_portal_id: string | null;
  hubspot_hub_id: string | null;
  hubspot_account_name: string | null;
  scopes: string[];
  webhook_token: string;
  webhook_last_received_at: string | null;
  webhook_last_event_id: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HubSpotSyncStateRow {
  id: string;
  org_id: string;
  sync_status: 'idle' | 'syncing' | 'error';
  cursors: any;
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  error_message: string | null;
  updated_at: string;
  created_at: string;
}

type StatusResponse = {
  success: boolean;
  connected: boolean;
  integration: HubSpotIntegrationRow | null;
  sync_state: HubSpotSyncStateRow | null;
  settings: any;
  webhook_url: string | null;
};

export function useHubSpotIntegration(enabled: boolean = true) {
  const { user, isAuthenticated } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const activeOrgRole = useOrgStore((s) => s.activeOrgRole);
  const canManage = activeOrgRole === 'owner' || activeOrgRole === 'admin';

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      if (!enabled || !isAuthenticated || !user || !activeOrgId) {
        setStatus(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('hubspot-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'status', org_id: activeOrgId }),
      });

      if (resp.error) {
        console.error('[useHubSpotIntegration] Edge function error:', resp.error);
        throw new Error(resp.error.message || 'Failed to load HubSpot status');
      }

      if (!resp.data?.success) {
        console.error('[useHubSpotIntegration] API error:', resp.data);
        throw new Error(resp.data?.error || 'Failed to load HubSpot status');
      }

      setStatus(resp.data as StatusResponse);
    } catch (e: any) {
      console.error('[useHubSpotIntegration] status error:', e);
      toast.error(`HubSpot status error: ${e.message || 'Unknown error'}`);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, enabled, isAuthenticated, user]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const connectHubSpot = useCallback(async () => {
    if (!enabled) throw new Error('HubSpot integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    if (!canManage) throw new Error('Only organization owners/admins can connect HubSpot');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    const resp = await supabase.functions.invoke('hubspot-oauth-initiate', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ org_id: activeOrgId, redirect_path: '/integrations' }),
    });
    if (resp.error) {
      throw new Error(resp.error.message || 'Failed to initiate HubSpot OAuth');
    }
    if (!resp.data?.success) {
      // Show the detailed message from the API if available
      const errorMsg = resp.data?.message || resp.data?.error || 'Failed to initiate HubSpot OAuth';
      throw new Error(errorMsg);
    }
    const url = resp.data?.authorization_url;
    if (!url) throw new Error('Missing authorization_url from response');
    window.location.href = url;
  }, [activeOrgId, canManage, enabled]);

  const disconnect = useCallback(async () => {
    if (!enabled) throw new Error('HubSpot integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    if (!canManage) throw new Error('Only organization owners/admins can disconnect HubSpot');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    setDisconnecting(true);
    try {
      const resp = await supabase.functions.invoke('hubspot-disconnect', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ org_id: activeOrgId }),
      });
      if (resp.error) {
        throw new Error(resp.error.message || 'Failed to disconnect HubSpot');
      }
      if (!resp.data?.success) {
        const errorMsg = resp.data?.message || resp.data?.error || 'Failed to disconnect HubSpot';
        throw new Error(errorMsg);
      }
      toast.success('HubSpot disconnected');
      await refreshStatus();
    } finally {
      setDisconnecting(false);
    }
  }, [activeOrgId, canManage, enabled, refreshStatus]);

  const saveSettings = useCallback(
    async (settings: any) => {
      if (!enabled) throw new Error('HubSpot integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');
      if (!canManage) throw new Error('Only organization owners/admins can configure HubSpot');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      setSaving(true);
      try {
        const resp = await supabase.functions.invoke('hubspot-admin', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'save_settings', org_id: activeOrgId, settings }),
        });
        if (resp.error) throw new Error(resp.error.message || 'Failed to save settings');
        // Don't show toast for every auto-save - too noisy
        // Don't refresh status - we already have the settings locally
      } finally {
        setSaving(false);
      }
    },
    [activeOrgId, canManage, enabled]
  );

  const enqueue = useCallback(
    async (args: { job_type: string; payload?: any; dedupe_key?: string; priority?: number }) => {
      if (!enabled) throw new Error('HubSpot integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');
      if (!canManage) throw new Error('Only organization owners/admins can manage HubSpot sync');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('hubspot-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'enqueue', org_id: activeOrgId, ...args }),
      });
      if (resp.error) throw new Error(resp.error.message || 'Failed to enqueue job');
    },
    [activeOrgId, canManage, enabled]
  );

  const triggerEnsureProperties = useCallback(async () => {
    await enqueue({ job_type: 'ensure_properties', dedupe_key: 'ensure_properties', priority: 200 });
    toast.success('Queued: ensure HubSpot properties');
  }, [enqueue]);

  const triggerPollForms = useCallback(async () => {
    await enqueue({ job_type: 'poll_form_submissions', dedupe_key: 'poll_form_submissions', priority: 150 });
    toast.success('Queued: poll HubSpot form submissions');
  }, [enqueue]);

  const getProperties = useCallback(
    async (objectType: 'deals' | 'contacts' | 'tasks' = 'deals') => {
      if (!enabled) throw new Error('HubSpot integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('hubspot-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'get_properties', org_id: activeOrgId, object_type: objectType }),
      });
      if (resp.error) throw new Error(resp.error.message || 'Failed to fetch properties');
      if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to fetch properties');
      return resp.data.properties as Array<{
        name: string;
        label: string;
        type: string;
        fieldType: string;
        description: string;
        groupName: string;
        options: any[];
      }>;
    },
    [activeOrgId, enabled]
  );

  const getPipelines = useCallback(async () => {
    if (!enabled) throw new Error('HubSpot integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    const resp = await supabase.functions.invoke('hubspot-admin', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'get_pipelines', org_id: activeOrgId }),
    });
    if (resp.error) throw new Error(resp.error.message || 'Failed to fetch pipelines');
    if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to fetch pipelines');
    return resp.data.pipelines as Array<{
      id: string;
      label: string;
      displayOrder: number;
      stages: Array<{
        id: string;
        label: string;
        displayOrder: number;
        metadata: any;
      }>;
    }>;
  }, [activeOrgId, enabled]);

  const getForms = useCallback(async () => {
    if (!enabled) throw new Error('HubSpot integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    const resp = await supabase.functions.invoke('hubspot-admin', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'get_forms', org_id: activeOrgId }),
    });
    if (resp.error) throw new Error(resp.error.message || 'Failed to fetch forms');
    if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to fetch forms');
    return resp.data.forms as Array<{
      id: string;
      name: string;
      formType: string;
      createdAt: string;
      updatedAt: string;
      archived: boolean;
    }>;
  }, [activeOrgId, enabled]);

  const getLists = useCallback(async () => {
    if (!enabled) throw new Error('HubSpot integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    const resp = await supabase.functions.invoke('hubspot-admin', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'get_lists', org_id: activeOrgId }),
    });
    if (resp.error) throw new Error(resp.error.message || 'Failed to fetch lists');
    if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to fetch lists');
    return resp.data.lists as Array<{
      id: string;
      name: string;
      listType: 'STATIC' | 'DYNAMIC';
      membershipCount: number;
      createdAt?: string;
      updatedAt?: string;
    }>;
  }, [activeOrgId, enabled]);

  const previewContacts = useCallback(
    async (args: { list_id?: string; filters?: { propertyName: string; operator: string; value: string }[]; filter_logic?: 'AND' | 'OR'; limit?: number }) => {
      if (!enabled) throw new Error('HubSpot integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('hubspot-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'preview_contacts', org_id: activeOrgId, ...args }),
      });
      if (resp.error) throw new Error(resp.error.message || 'Failed to preview contacts');
      if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to preview contacts');
      return {
        totalCount: resp.data.totalCount as number,
        contacts: resp.data.contacts as Array<{
          id: string;
          email: string;
          firstName: string;
          lastName: string;
          company: string;
        }>,
      };
    },
    [activeOrgId, enabled]
  );

  const triggerSync = useCallback(
    async (args: {
      sync_type: 'deals' | 'contacts' | 'tasks';
      time_period: 'last_7_days' | 'last_30_days' | 'last_90_days' | 'last_year' | 'all_time';
    }) => {
      if (!enabled) throw new Error('HubSpot integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');
      if (!canManage) throw new Error('Only organization owners/admins can trigger HubSpot sync');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('hubspot-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'trigger_sync', org_id: activeOrgId, ...args }),
      });
      if (resp.error) throw new Error(resp.error.message || 'Failed to trigger sync');
      if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to trigger sync');
      toast.success(resp.data.message || 'Sync queued successfully');
      return resp.data;
    },
    [activeOrgId, canManage, enabled]
  );

  const isConnected = Boolean(status?.connected);

  const webhookUrl = useMemo(() => {
    return status?.webhook_url || null;
  }, [status?.webhook_url]);

  return {
    status,
    integration: status?.integration || null,
    syncState: status?.sync_state || null,
    settings: status?.settings || {},
    webhookUrl,
    isConnected,
    canManage,
    loading,
    saving,
    disconnecting,
    refreshStatus,
    connectHubSpot,
    disconnect,
    saveSettings,
    enqueue,
    triggerEnsureProperties,
    triggerPollForms,
    getProperties,
    getPipelines,
    getForms,
    getLists,
    previewContacts,
    triggerSync,
  };
}



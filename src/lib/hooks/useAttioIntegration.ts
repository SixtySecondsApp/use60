import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

export interface AttioIntegrationRow {
  id: string;
  org_id: string;
  connected_by_user_id: string | null;
  is_active: boolean;
  is_connected: boolean;
  connected_at: string | null;
  attio_workspace_id: string | null;
  attio_workspace_name: string | null;
  scopes: string[];
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttioSyncStateRow {
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
  integration: AttioIntegrationRow | null;
  sync_state: AttioSyncStateRow | null;
  settings: any;
};

export function useAttioIntegration(enabled: boolean = true) {
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

      const resp = await supabase.functions.invoke('attio-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'status', org_id: activeOrgId }),
      });

      if (resp.error) {
        console.error('[useAttioIntegration] Edge function error:', resp.error);
        throw new Error(resp.error.message || 'Failed to load Attio status');
      }

      if (!resp.data?.success) {
        console.error('[useAttioIntegration] API error:', resp.data);
        throw new Error(resp.data?.error || 'Failed to load Attio status');
      }

      setStatus(resp.data as StatusResponse);
    } catch (e: any) {
      console.error('[useAttioIntegration] status error:', e);
      toast.error(`Attio status error: ${e.message || 'Unknown error'}`);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, enabled, isAuthenticated, user]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const connectAttio = useCallback(async () => {
    if (!enabled) throw new Error('Attio integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    if (!canManage) throw new Error('Only organization owners/admins can connect Attio');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    const resp = await supabase.functions.invoke('attio-oauth-initiate', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ org_id: activeOrgId, redirect_path: '/integrations' }),
    });
    if (resp.error) {
      throw new Error(resp.error.message || 'Failed to initiate Attio OAuth');
    }
    if (!resp.data?.success) {
      const errorMsg = resp.data?.message || resp.data?.error || 'Failed to initiate Attio OAuth';
      throw new Error(errorMsg);
    }
    const url = resp.data?.authorization_url;
    if (!url) throw new Error('Missing authorization_url from response');
    window.location.href = url;
  }, [activeOrgId, canManage, enabled]);

  const disconnect = useCallback(async () => {
    if (!enabled) throw new Error('Attio integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    if (!canManage) throw new Error('Only organization owners/admins can disconnect Attio');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    setDisconnecting(true);
    try {
      const resp = await supabase.functions.invoke('attio-disconnect', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ org_id: activeOrgId }),
      });
      if (resp.error) {
        throw new Error(resp.error.message || 'Failed to disconnect Attio');
      }
      if (!resp.data?.success) {
        const errorMsg = resp.data?.message || resp.data?.error || 'Failed to disconnect Attio';
        throw new Error(errorMsg);
      }
      toast.success('Attio disconnected');
      await refreshStatus();
    } finally {
      setDisconnecting(false);
    }
  }, [activeOrgId, canManage, enabled, refreshStatus]);

  const saveSettings = useCallback(
    async (settings: any) => {
      if (!enabled) throw new Error('Attio integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');
      if (!canManage) throw new Error('Only organization owners/admins can configure Attio');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      setSaving(true);
      try {
        const resp = await supabase.functions.invoke('attio-admin', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'save_settings', org_id: activeOrgId, settings }),
        });
        if (resp.error) throw new Error(resp.error.message || 'Failed to save settings');
      } finally {
        setSaving(false);
      }
    },
    [activeOrgId, canManage, enabled]
  );

  const getObjects = useCallback(async () => {
    if (!enabled) throw new Error('Attio integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    const resp = await supabase.functions.invoke('attio-admin', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'get_objects', org_id: activeOrgId }),
    });
    if (resp.error) throw new Error(resp.error.message || 'Failed to fetch objects');
    if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to fetch objects');
    return resp.data.objects as Array<{
      id: string;
      api_slug: string;
      singular_noun: string;
      plural_noun: string;
    }>;
  }, [activeOrgId, enabled]);

  const getAttributes = useCallback(
    async (object: string) => {
      if (!enabled) throw new Error('Attio integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('attio-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'get_attributes', org_id: activeOrgId, object }),
      });
      if (resp.error) throw new Error(resp.error.message || 'Failed to fetch attributes');
      if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to fetch attributes');
      return resp.data.attributes as Array<{
        id: string;
        title: string;
        api_slug: string;
        type: string;
        is_required: boolean;
        is_writable: boolean;
      }>;
    },
    [activeOrgId, enabled]
  );

  const getLists = useCallback(async () => {
    if (!enabled) throw new Error('Attio integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    const resp = await supabase.functions.invoke('attio-admin', {
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
      api_slug: string;
      parent_object: string;
      record_count: number;
      created_at: string;
    }>;
  }, [activeOrgId, enabled]);

  const getRecords = useCallback(
    async (object: string, opts?: { limit?: number; offset?: number; filter?: any }) => {
      if (!enabled) throw new Error('Attio integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('attio-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'get_records', org_id: activeOrgId, object, ...opts }),
      });
      if (resp.error) throw new Error(resp.error.message || 'Failed to fetch records');
      if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to fetch records');
      return resp.data.records as Array<Record<string, any>>;
    },
    [activeOrgId, enabled]
  );

  const getSettings = useCallback(async () => {
    if (!enabled) throw new Error('Attio integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    const resp = await supabase.functions.invoke('attio-admin', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'get_settings', org_id: activeOrgId }),
    });
    if (resp.error) throw new Error(resp.error.message || 'Failed to fetch settings');
    if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to fetch settings');
    return resp.data.settings;
  }, [activeOrgId, enabled]);

  const triggerSync = useCallback(
    async (tableId: string) => {
      if (!enabled) throw new Error('Attio integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');
      if (!canManage) throw new Error('Only organization owners/admins can trigger Attio sync');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('attio-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'trigger_sync', org_id: activeOrgId, table_id: tableId }),
      });
      if (resp.error) throw new Error(resp.error.message || 'Failed to trigger sync');
      if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to trigger sync');
      toast.success(resp.data.message || 'Attio sync queued successfully');
      return resp.data;
    },
    [activeOrgId, canManage, enabled]
  );

  const isConnected = Boolean(status?.connected);

  return {
    status,
    integration: status?.integration || null,
    syncState: status?.sync_state || null,
    settings: status?.settings || {},
    isConnected,
    canManage,
    loading,
    saving,
    disconnecting,
    refreshStatus,
    connectAttio,
    disconnect,
    saveSettings,
    getObjects,
    getAttributes,
    getLists,
    getRecords,
    getSettings,
    triggerSync,
  };
}

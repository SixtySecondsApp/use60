import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';
import { isStaging } from '@/lib/config';

// =============================================================================
// Types
// =============================================================================

export interface BullhornIntegrationRow {
  id: string;
  org_id: string;
  connected_by_user_id: string | null;
  is_active: boolean;
  is_connected: boolean;
  connected_at: string | null;
  bullhorn_corp_id: string | null;
  bullhorn_user_id: string | null;
  webhook_token: string;
  webhook_last_received_at: string | null;
  last_token_refresh_at: string | null;
  last_sync_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface BullhornSyncStateRow {
  id: string;
  org_id: string;
  sync_status: 'idle' | 'syncing' | 'error' | 'paused' | 'initialising';
  cursors: Record<string, unknown>;
  last_sync_at: string | null;
  last_error: string | null;
  updated_at: string;
  created_at: string;
}

export interface BullhornSettingsRow {
  id: string;
  org_id: string;
  auto_sync: boolean;
  sync_interval_minutes: number;
  enabled_entity_types: string[];
  conflict_resolution: 'bullhorn_wins' | 'use60_wins' | 'newest_wins';
  sync_filters: Record<string, unknown>;
  field_mapping_overrides: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type StatusResponse = {
  success: boolean;
  connected: boolean;
  integration: BullhornIntegrationRow | null;
  sync_state: BullhornSyncStateRow | null;
  settings: BullhornSettingsRow | null;
  webhook_url: string | null;
};

// =============================================================================
// Hook Implementation
// =============================================================================

export function useBullhornIntegration(enabled: boolean = true) {
  const { user, isAuthenticated } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const activeOrgRole = useOrgStore((s) => s.activeOrgRole);
  const canManage = activeOrgRole === 'owner' || activeOrgRole === 'admin';

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch Status
  // ---------------------------------------------------------------------------

  const refreshStatus = useCallback(async () => {
    try {
      // Disable Bullhorn on staging - edge function not deployed
      if (isStaging || !enabled || !isAuthenticated || !user || !activeOrgId) {
        setStatus(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('bullhorn-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'status', org_id: activeOrgId }),
      });

      if (resp.error) {
        console.error('[useBullhornIntegration] Edge function error:', resp.error);
        throw new Error(resp.error.message || 'Failed to load Bullhorn status');
      }

      if (!resp.data?.success) {
        console.error('[useBullhornIntegration] API error:', resp.data);
        throw new Error(resp.data?.error || 'Failed to load Bullhorn status');
      }

      setStatus(resp.data as StatusResponse);
    } catch (e: unknown) {
      const err = e as Error;
      console.error('[useBullhornIntegration] status error:', err);
      toast.error(`Bullhorn status error: ${err.message || 'Unknown error'}`);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, enabled, isAuthenticated, user]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // ---------------------------------------------------------------------------
  // OAuth Connection
  // ---------------------------------------------------------------------------

  const connectBullhorn = useCallback(async () => {
    if (isStaging) throw new Error('Bullhorn integration is not available on staging');
    if (!enabled) throw new Error('Bullhorn integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    if (!canManage) throw new Error('Only organization owners/admins can connect Bullhorn');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    const resp = await supabase.functions.invoke('bullhorn-oauth-initiate', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ org_id: activeOrgId, redirect_path: '/integrations' }),
    });

    if (resp.error) {
      throw new Error(resp.error.message || 'Failed to initiate Bullhorn OAuth');
    }
    if (!resp.data?.success) {
      const errorMsg = resp.data?.message || resp.data?.error || 'Failed to initiate Bullhorn OAuth';
      throw new Error(errorMsg);
    }

    const url = resp.data?.authorization_url;
    if (!url) throw new Error('Missing authorization_url from response');
    window.location.href = url;
  }, [activeOrgId, canManage, enabled]);

  // ---------------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------------

  const disconnect = useCallback(async () => {
    if (!enabled) throw new Error('Bullhorn integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');
    if (!canManage) throw new Error('Only organization owners/admins can disconnect Bullhorn');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    setDisconnecting(true);
    try {
      const resp = await supabase.functions.invoke('bullhorn-disconnect', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ org_id: activeOrgId }),
      });

      if (resp.error) {
        throw new Error(resp.error.message || 'Failed to disconnect Bullhorn');
      }
      if (!resp.data?.success) {
        const errorMsg = resp.data?.message || resp.data?.error || 'Failed to disconnect Bullhorn';
        throw new Error(errorMsg);
      }

      toast.success('Bullhorn disconnected');
      await refreshStatus();
    } finally {
      setDisconnecting(false);
    }
  }, [activeOrgId, canManage, enabled, refreshStatus]);

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  const saveSettings = useCallback(
    async (settings: Partial<BullhornSettingsRow>) => {
      if (!enabled) throw new Error('Bullhorn integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');
      if (!canManage) throw new Error('Only organization owners/admins can configure Bullhorn');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      setSaving(true);
      try {
        const resp = await supabase.functions.invoke('bullhorn-admin', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'save_settings', org_id: activeOrgId, settings }),
        });

        if (resp.error) throw new Error(resp.error.message || 'Failed to save settings');
        if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to save settings');

        toast.success('Settings saved');
        await refreshStatus();
      } finally {
        setSaving(false);
      }
    },
    [activeOrgId, canManage, enabled, refreshStatus]
  );

  // ---------------------------------------------------------------------------
  // Queue Operations
  // ---------------------------------------------------------------------------

  const enqueue = useCallback(
    async (args: { job_type: string; payload?: Record<string, unknown>; dedupe_key?: string; priority?: number }) => {
      if (!enabled) throw new Error('Bullhorn integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');
      if (!canManage) throw new Error('Only organization owners/admins can manage Bullhorn sync');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('bullhorn-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'enqueue', org_id: activeOrgId, ...args }),
      });

      if (resp.error) throw new Error(resp.error.message || 'Failed to enqueue job');
      if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to enqueue job');

      return resp.data;
    },
    [activeOrgId, canManage, enabled]
  );

  // ---------------------------------------------------------------------------
  // Sync Operations
  // ---------------------------------------------------------------------------

  const triggerSync = useCallback(
    async (args: {
      sync_type: 'candidates' | 'client_contacts' | 'job_orders' | 'all';
      mode?: 'initial' | 'incremental';
    }) => {
      if (!enabled) throw new Error('Bullhorn integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');
      if (!canManage) throw new Error('Only organization owners/admins can trigger Bullhorn sync');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      setSyncing(true);
      try {
        const resp = await supabase.functions.invoke('bullhorn-admin', {
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
      } finally {
        setSyncing(false);
      }
    },
    [activeOrgId, canManage, enabled]
  );

  const triggerInitialSync = useCallback(async () => {
    return triggerSync({ sync_type: 'all', mode: 'initial' });
  }, [triggerSync]);

  const triggerIncrementalSync = useCallback(async () => {
    return triggerSync({ sync_type: 'all', mode: 'incremental' });
  }, [triggerSync]);

  // ---------------------------------------------------------------------------
  // Search Operations
  // ---------------------------------------------------------------------------

  const searchCandidates = useCallback(
    async (query: string, count = 20) => {
      if (!enabled) throw new Error('Bullhorn integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('bullhorn-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'search',
          org_id: activeOrgId,
          entity_type: 'Candidate',
          query,
          count,
        }),
      });

      if (resp.error) throw new Error(resp.error.message || 'Failed to search candidates');
      if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to search candidates');

      return resp.data.results;
    },
    [activeOrgId, enabled]
  );

  const searchClientContacts = useCallback(
    async (query: string, count = 20) => {
      if (!enabled) throw new Error('Bullhorn integration is disabled');
      if (!activeOrgId) throw new Error('No active organization selected');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('No active session');

      const resp = await supabase.functions.invoke('bullhorn-admin', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'search',
          org_id: activeOrgId,
          entity_type: 'ClientContact',
          query,
          count,
        }),
      });

      if (resp.error) throw new Error(resp.error.message || 'Failed to search client contacts');
      if (!resp.data?.success) throw new Error(resp.data?.error || 'Failed to search client contacts');

      return resp.data.results;
    },
    [activeOrgId, enabled]
  );

  // ---------------------------------------------------------------------------
  // Test Connection
  // ---------------------------------------------------------------------------

  const testConnection = useCallback(async () => {
    if (!enabled) throw new Error('Bullhorn integration is disabled');
    if (!activeOrgId) throw new Error('No active organization selected');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session');

    const resp = await supabase.functions.invoke('bullhorn-admin', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'test_connection', org_id: activeOrgId }),
    });

    if (resp.error) throw new Error(resp.error.message || 'Connection test failed');
    if (!resp.data?.success) throw new Error(resp.data?.error || 'Connection test failed');

    toast.success('Connection successful!');
    return resp.data;
  }, [activeOrgId, enabled]);

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const isConnected = Boolean(status?.connected);

  const webhookUrl = useMemo(() => {
    return status?.webhook_url || null;
  }, [status?.webhook_url]);

  const syncStatus = useMemo(() => {
    return status?.sync_state?.sync_status || 'idle';
  }, [status?.sync_state?.sync_status]);

  // ---------------------------------------------------------------------------
  // Return Value
  // ---------------------------------------------------------------------------

  return {
    // Status
    status,
    integration: status?.integration || null,
    syncState: status?.sync_state || null,
    settings: status?.settings || null,
    webhookUrl,
    isConnected,
    syncStatus,
    canManage,

    // Loading States
    loading,
    saving,
    disconnecting,
    syncing,

    // Actions
    refreshStatus,
    connectBullhorn,
    disconnect,
    saveSettings,
    enqueue,
    triggerSync,
    triggerInitialSync,
    triggerIncrementalSync,
    searchCandidates,
    searchClientContacts,
    testConnection,
  };
}

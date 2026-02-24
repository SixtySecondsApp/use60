import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { useTableSubscription } from '@/lib/hooks/useRealtimeHub';
import { toast } from 'sonner';

/**
 * Per-user Fireflies.ai integration.
 * Each user connects their own Fireflies account via API key and syncs their own meetings.
 * 
 * Pattern: Following useFathomIntegration.ts
 */

export interface FirefliesIntegration {
  id: string;
  user_id: string;
  api_key: string;
  fireflies_user_email: string | null;
  fireflies_team_id: string | null;
  sync_all_team_meetings: boolean;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FirefliesSyncState {
  id: string;
  user_id: string;
  integration_id: string;
  sync_status: 'idle' | 'syncing' | 'error';
  last_successful_sync: string | null;
  last_synced_date: string | null;
  error_message: string | null;
  error_count: number;
  last_error_at: string | null;
  meetings_synced: number;
  total_meetings_found: number;
}


/**
 * Returns true when a Supabase/PostgREST error indicates the table does not
 * exist yet (Postgres code 42P01 or HTTP 404).  Used to gracefully handle
 * tables whose migration has been written but not yet deployed to this env.
 */
function isTableNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  // PostgREST wraps Postgres errors with a "code" field
  if (e['code'] === '42P01') return true;
  // HTTP-level 404 surfaces as a numeric status or string message
  if (e['status'] === 404 || e['message'] === '404') return true;
  // PostgREST also returns PGRST116 for "relation does not exist" in some versions
  if (typeof e['message'] === 'string' && (e['message'] as string).includes('does not exist')) return true;
  return false;
}

export function useFirefliesIntegration() {
  const { user } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  // Per-user integration: any user can manage their own Fireflies connection
  const canManage = true;
  // Supabase typed client may not include all integration tables - use narrow escape hatch
  const supabaseAny = supabase as any;

  const [integration, setIntegration] = useState<FirefliesIntegration | null>(null);
  const [syncState, setSyncState] = useState<FirefliesSyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lifetimeMeetingsCount, setLifetimeMeetingsCount] = useState<number>(0);
  const [syncInProgress, setSyncInProgress] = useState(false);

  // Fetch integration and sync state for the current user
  useEffect(() => {
    if (!user) {
      setIntegration(null);
      setSyncState(null);
      setLifetimeMeetingsCount(0);
      setLoading(false);
      return;
    }

    const fetchIntegration = async () => {
      try {
        // Only show loading spinner on first load, not on refetches
        if (!initialLoadDone) setLoading(true);
        setError(null);

        // Get active user integration (per-user)
        const { data: integrationData, error: integrationError } = await supabaseAny
          .from('fireflies_integrations')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();

        if (integrationError) {
          // If the table hasn't been deployed yet, treat as "not connected" rather than crashing.
          if (isTableNotFoundError(integrationError)) {
            setIntegration(null);
            setSyncState(null);
            setLifetimeMeetingsCount(0);
            return;
          }
          throw integrationError;
        }

        setIntegration(integrationData);

        // Get sync state if integration exists
        if (integrationData) {
          const { data: syncData, error: syncError } = await supabaseAny
            .from('fireflies_sync_state')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          if (syncError) {
            // Gracefully ignore missing table – sync state simply stays null.
            if (isTableNotFoundError(syncError)) {
              setSyncState(null);
            } else {
              throw syncError;
            }
          }

          setSyncState(syncData);

          // Compute lifetime count of user's Fireflies meetings
          const { count, error: countError } = await supabaseAny
            .from('meetings')
            .select('id', { count: 'exact', head: true })
            .eq('owner_user_id', user.id)
            .eq('provider', 'fireflies');

          if (!countError && typeof count === 'number') {
            setLifetimeMeetingsCount(count);
          }
        } else {
          setSyncState(null);
          setLifetimeMeetingsCount(0);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
        setInitialLoadDone(true);
      }
    };

    fetchIntegration();
  }, [user]);

  // Use centralized realtime hub instead of creating separate channels
  // This reduces WebSocket connections from 3 to 0 (shared with other subscriptions)
  useTableSubscription(
    'fireflies_integrations',
    useCallback((payload: any) => {
      // Filter by user_id in callback since hub doesn't support complex filters
      if (payload.new?.user_id !== user?.id && payload.old?.user_id !== user?.id) {
        return;
      }

      if (payload.eventType === 'DELETE') {
        setIntegration(null);
        setSyncState(null);
        setLifetimeMeetingsCount(0);
      } else {
        setIntegration(payload.new as FirefliesIntegration);
        // Fetch sync state when integration is created/updated
        supabaseAny
          .from('fireflies_sync_state')
          .select('*')
          .eq('user_id', user?.id!)
          .maybeSingle()
          .then(({ data }: { data: FirefliesSyncState | null }) => {
            if (data) setSyncState(data);
          });
      }
    }, [user?.id]),
    { enabled: !!user }
  );

  useTableSubscription(
    'fireflies_sync_state',
    useCallback((payload: any) => {
      // Filter by user_id in callback
      if (payload.new?.user_id !== user?.id && payload.old?.user_id !== user?.id) {
        return;
      }

      if (payload.eventType === 'DELETE') {
        setSyncState(null);
      } else {
        setSyncState(payload.new as FirefliesSyncState);
      }
    }, [user?.id]),
    { enabled: !!user }
  );

  useTableSubscription(
    'meetings',
    useCallback(async (payload: any) => {
      // Filter by owner_user_id and provider in callback
      if (payload.new?.owner_user_id !== user?.id && payload.old?.owner_user_id !== user?.id) {
        return;
      }
      if (payload.new?.provider !== 'fireflies' && payload.old?.provider !== 'fireflies') {
        return;
      }

      // Only update count if Fireflies is connected
      const { data: currentIntegration, error: ciError } = await supabaseAny
        .from('fireflies_integrations')
        .select('id')
        .eq('user_id', user?.id!)
        .eq('is_active', true)
        .maybeSingle();
      // If the table doesn't exist yet, skip the count refresh silently.
      if (isTableNotFoundError(ciError)) return;

      if (currentIntegration) {
        const { count } = await supabaseAny
          .from('meetings')
          .select('id', { count: 'exact', head: true })
          .eq('owner_user_id', user?.id!)
          .eq('provider', 'fireflies');
        if (typeof count === 'number') setLifetimeMeetingsCount(count);
      }
    }, [user?.id]),
    { enabled: !!user }
  );

  // Connect Fireflies with API key
  const connectFireflies = async (apiKey: string, email?: string): Promise<boolean> => {
    try {
      setError(null);

      if (!user) {
        throw new Error('You must be logged in to connect Fireflies');
      }

      if (!apiKey?.trim()) {
        throw new Error('API key is required');
      }

      // Verify session exists and ensure client has it
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error('No active session');
      }

      console.log('[useFirefliesIntegration] Session available, calling edge function...');
      console.log('[useFirefliesIntegration] Access token exists:', !!sessionData.session.access_token);

      // Test the API key first by calling the Edge Function
      // Explicitly pass Authorization header - supabase.functions.invoke() should include it automatically
      // but we pass it explicitly to ensure it's included
      const response = await supabase.functions.invoke('fireflies-sync', {
        headers: {
          'Authorization': `Bearer ${sessionData.session.access_token}`,
        },
        body: {
          action: 'test_connection',
          api_key: apiKey,
        },
      });

      console.log('[useFirefliesIntegration] Edge function response:', {
        error: response.error,
        data: response.data,
        status: response.error?.status,
      });

      if (response.error) {
        // Try to extract more details from the error
        const errorMessage = response.error.message || 'Failed to test API key';
        const errorContext = (response.error as any)?.context;
        
        console.error('[useFirefliesIntegration] Full error details:', {
          error: response.error,
          context: errorContext,
        });

        // If we have a response body with debug info, include it
        if (errorContext?.response) {
          try {
            const errorText = await errorContext.response.text();
            const errorJson = JSON.parse(errorText);
            if (errorJson.debug) {
              console.error('[useFirefliesIntegration] Debug info from function:', errorJson.debug);
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }

        throw new Error(errorMessage);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Invalid API key');
      }

      // API key is valid - create or reactivate the integration
      // First check if an inactive integration exists (from a previous disconnect)
      const { data: existingIntegration } = await supabaseAny
        .from('fireflies_integrations')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingIntegration) {
        // Reactivate existing integration with new API key
        const { error: updateError } = await supabaseAny
          .from('fireflies_integrations')
          .update({
            api_key: apiKey,
            fireflies_user_email: email || null,
            is_active: true,
          })
          .eq('id', existingIntegration.id);

        if (updateError) throw updateError;
      } else {
        // Create new integration
        const { error: insertError } = await supabaseAny
          .from('fireflies_integrations')
          .insert({
            user_id: user.id,
            api_key: apiKey,
            fireflies_user_email: email || null,
            is_active: true,
          });

        if (insertError) throw insertError;
      }

      toast.success('Fireflies Connected!', {
        description: 'Your Fireflies account has been successfully connected.',
      });

      // Refresh integration data
      const { data: integrationData } = await supabaseAny
        .from('fireflies_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      setIntegration(integrationData);

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect';
      setError(msg);
      toast.error(msg);
      return false;
    }
  };

  // Disconnect Fireflies
  const disconnectFireflies = async (deleteSyncedMeetings: boolean = false) => {
    try {
      setError(null);

      if (!integration) {
        throw new Error('No integration to disconnect');
      }

      if (!user) {
        throw new Error('You must be logged in to disconnect Fireflies');
      }

      // Soft delete - just mark as inactive
      const { error: updateError } = await supabaseAny
        .from('fireflies_integrations')
        .update({ is_active: false })
        .eq('id', integration.id);

      if (updateError) {
        throw updateError;
      }

      // Optionally delete synced meetings
      if (deleteSyncedMeetings) {
        const { error: deleteError } = await supabaseAny
          .from('meetings')
          .delete()
          .eq('owner_user_id', user.id)
          .eq('provider', 'fireflies');

        if (deleteError) {
          console.error('[useFirefliesIntegration] Error deleting meetings:', deleteError);
        }
      }

      setIntegration(null);
      setSyncState(null);
      setLifetimeMeetingsCount(0);

      toast.success(
        deleteSyncedMeetings
          ? 'Fireflies disconnected and synced meetings deleted'
          : 'Fireflies disconnected successfully'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disconnect';
      setError(msg);
      throw err;
    }
  };

  // Trigger manual sync
  const triggerSync = async (params?: {
    sync_type?: 'initial' | 'incremental' | 'manual';
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<{
    success: boolean;
    meetings_synced?: number;
    total_found?: number;
    error?: string;
  } | null> => {
    try {
      setError(null);
      setSyncInProgress(true);

      if (!integration) {
        throw new Error('No active integration');
      }

      if (!user) {
        throw new Error('You must be logged in to sync');
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error('No active session');
      }

      const response = await supabase.functions.invoke('fireflies-sync', {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: {
          action: 'sync',
          sync_type: params?.sync_type || 'manual',
          start_date: params?.start_date,
          end_date: params?.end_date,
          limit: params?.limit,
          org_id: activeOrgId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Sync failed');
      }

      // Refresh lifetime count after sync
      const { count } = await supabaseAny
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', user.id)
        .eq('provider', 'fireflies');

      if (typeof count === 'number') {
        setLifetimeMeetingsCount(count);
      }

      return response.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      setError(msg);
      throw err;
    } finally {
      setSyncInProgress(false);
    }
  };

  // Check if sync is stale (stuck in 'syncing' for more than 10 minutes)
  const isSyncStale = (() => {
    if (syncState?.sync_status !== 'syncing') return false;
    if (syncState?.error_count && syncState.error_count > 3) {
      return true;
    }
    return false;
  })();

  const effectiveSyncing = syncInProgress || (syncState?.sync_status === 'syncing' && !isSyncStale);

  return {
    integration,
    syncState,
    loading,
    error,
    isConnected: !!integration,
    canManage,
    isSyncing: effectiveSyncing,
    syncInProgress,
    lifetimeMeetingsCount,
    connectFireflies,
    disconnectFireflies,
    triggerSync,
  };
}



import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

/**
 * Per-user Fathom integration.
 * Each user connects their own Fathom account and syncs their own meetings.
 */
export interface FathomIntegration {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  fathom_user_id: string | null;
  fathom_user_email: string | null;
  scopes: string[];
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FathomSyncState {
  id: string;
  user_id: string;
  integration_id: string;
  sync_status: 'idle' | 'syncing' | 'error';
  meetings_synced: number;
  total_meetings_found: number;
  last_successful_sync: string | null;
  cursor_position: string | null;
  error_message: string | null;
  error_count: number;
  last_error_at: string | null;
}

// Legacy types for backwards compatibility
export type FathomOrgIntegration = FathomIntegration;
export type FathomOrgSyncState = FathomSyncState;

export function useFathomIntegration() {
  const { user } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  // Per-user integration: any user can manage their own Fathom connection
  const canManage = true;
  // Supabase typed client in this repo does not include all integration tables.
  // Use a narrow escape hatch for these per-user integration tables.
  const supabaseAny = supabase as any;

  const [integration, setIntegration] = useState<FathomIntegration | null>(null);
  const [syncState, setSyncState] = useState<FathomSyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lifetimeMeetingsCount, setLifetimeMeetingsCount] = useState<number>(0);
  const [syncInProgress, setSyncInProgress] = useState(false); // Track local sync operation

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
        setLoading(true);
        setError(null);
        // Get active user integration (per-user)
        const { data: integrationData, error: integrationError } = await supabaseAny
          .from('fathom_integrations')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();
        if (integrationError) {
          throw integrationError;
        }

        setIntegration(integrationData);

        // Get sync state if integration exists
        if (integrationData) {
          const { data: syncData, error: syncError } = await supabaseAny
            .from('fathom_sync_state')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          if (syncError) {
            throw syncError;
          }

          setSyncState(syncData);

          // Compute lifetime count of user's Fathom meetings
          // meetings table uses owner_user_id for the meeting owner
          const { count, error: countError } = await supabaseAny
            .from('meetings')
            .select('id', { count: 'exact', head: true })
            .eq('owner_user_id', user.id)
            .not('fathom_recording_id', 'is', null);
          if (!countError && typeof count === 'number') {
            setLifetimeMeetingsCount(count);
          }
        } else {
          // No integration - clear state
          setSyncState(null);
          setLifetimeMeetingsCount(0);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchIntegration();

    // Set up real-time subscriptions for per-user integration
    const integrationSubscription = supabaseAny
      .channel(`fathom_integrations_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fathom_integrations',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          if (payload.eventType === 'DELETE') {
            setIntegration(null);
            setSyncState(null);
            setLifetimeMeetingsCount(0);
          } else {
            setIntegration(payload.new as FathomIntegration);
            // Fetch sync state when integration is created/updated
            supabaseAny
              .from('fathom_sync_state')
              .select('*')
              .eq('user_id', user.id)
              .maybeSingle()
              .then(({ data }: { data: FathomSyncState | null }) => {
                if (data) setSyncState(data);
              });
          }
        }
      )
      .subscribe();

    const syncSubscription = supabaseAny
      .channel(`fathom_sync_state_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fathom_sync_state',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          if (payload.eventType === 'DELETE') {
            setSyncState(null);
          } else {
            setSyncState(payload.new as FathomSyncState);
          }
        }
      )
      .subscribe();

    // Listen for new meetings to refresh lifetime count
    // Only count user's Fathom meetings (those with fathom_recording_id)
    const meetingsSubscription = supabaseAny
      .channel(`meetings_fathom_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meetings',
          filter: `owner_user_id=eq.${user.id}`,
        },
        async () => {
          // Only update count if Fathom is connected
          const { data: currentIntegration } = await supabaseAny
            .from('fathom_integrations')
            .select('id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

          if (currentIntegration) {
            const { count } = await supabaseAny
              .from('meetings')
              .select('id', { count: 'exact', head: true })
              .eq('owner_user_id', user.id)
              .not('fathom_recording_id', 'is', null);
            if (typeof count === 'number') setLifetimeMeetingsCount(count);
          }
        }
      )
      .subscribe();

    return () => {
      integrationSubscription.unsubscribe();
      syncSubscription.unsubscribe();
      meetingsSubscription.unsubscribe();
    };
  }, [user]);

  // Initiate OAuth flow (per-user)
  const connectFathom = async (): Promise<boolean> => {
    try {
      setError(null);

      if (!user) {
        throw new Error('You must be logged in to connect Fathom');
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error('No active session');
      }

      // Per-user OAuth: no org_id needed, Edge Function uses user_id from token
      const response = await supabase.functions.invoke('fathom-oauth-initiate', {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: {},
      });

      if (response.error) {
        // Supabase Functions errors often hide the underlying JSON body for non-2xx responses.
        // Try to extract the response body for a human-readable message.
        const err: any = response.error;
        let message: string = err?.message || 'Failed to initiate OAuth';

        try {
          const resp = err?.context?.response as Response | undefined;
          if (resp) {
            const text = await resp.text();
            if (text) {
              try {
                const parsed = JSON.parse(text);
                message =
                  parsed?.message ||
                  parsed?.error ||
                  parsed?.details ||
                  message;
              } catch {
                // Not JSON
                message = text;
              }
            }
          }
        } catch {
          // ignore extraction errors
        }

        throw new Error(message);
      }

      const { authorization_url } = response.data;
      if (!authorization_url) throw new Error('Missing authorization_url from OAuth initiation');

      // Open OAuth popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      console.log('[useFathomIntegration] Opening popup to:', authorization_url);
      const popup = window.open(
        authorization_url,
        'Fathom OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        throw new Error('Failed to open popup - please allow popups for this site');
      }

      console.log('[useFathomIntegration] Popup opened successfully, setting up message listener');

      // Track if we've already handled the connection
      let connectionHandled = false;

      // Helper to handle successful connection
      const handleConnectionSuccess = async () => {
        if (connectionHandled) return;
        connectionHandled = true;

        console.log('[useFathomIntegration] Connection detected, refreshing data...');

        // Show success notification
        toast.success('Fathom Connected!', {
          description: 'Your Fathom account has been successfully connected. Starting initial sync...'
        });

        // Refresh integration data (per-user)
        try {
          const { data: integrationData } = await supabaseAny
            .from('fathom_integrations')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

          setIntegration(integrationData);

          // Get sync state
          const { data: syncData } = await supabaseAny
            .from('fathom_sync_state')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          setSyncState(syncData);
        } catch (err) {
          console.error('[useFathomIntegration] Error refreshing data:', err);
        }
      };

      // Listen for OAuth completion via postMessage
      const handleMessage = async (event: MessageEvent) => {
        console.log('[useFathomIntegration] Received postMessage:', {
          type: event.data?.type,
          origin: event.origin,
          hasCode: !!event.data?.code,
          hasState: !!event.data?.state,
          isFromPopup: event.source === popup,
        });

        // Security: only accept messages from the OAuth popup window we opened
        // (Origin check relaxed to support cross-origin relay from staging callback)
        // Note: event.source should equal popup even after cross-origin navigation
        if (popup && event.source !== popup) {
          console.warn('[useFathomIntegration] Message source mismatch:', {
            hasPopup: !!popup,
            popupClosed: popup?.closed,
            sourceEqualsPopup: event.source === popup,
            eventSource: event.source,
          });

          // TEMPORARY: For debugging, allow messages if popup is closed
          // (In production, we should enforce source === popup)
          if (!popup.closed) {
            console.log('[useFathomIntegration] Ignoring message - not from our popup');
            return;
          } else {
            console.log('[useFathomIntegration] Popup is closed, allowing message anyway for debugging');
          }
        }

        // Handle direct success message (callback page already exchanged tokens)
        if (event.data?.type === 'fathom-oauth-success') {
          console.log('[useFathomIntegration] Received postMessage success (direct mode)');
          popup?.close();
          window.removeEventListener('message', handleMessage);
          await handleConnectionSuccess();
          return;
        }

        // Handle code relay message (callback page relayed code+state for local exchange)
        if (event.data?.type === 'fathom-oauth-code') {
          console.log('[useFathomIntegration] Received postMessage with code+state (relay mode)');
          const { code, state } = event.data;

          if (!code || !state) {
            console.error('[useFathomIntegration] Missing code or state in relay message');
            toast.error('OAuth relay failed: missing parameters');
            popup?.close();
            window.removeEventListener('message', handleMessage);
            return;
          }

          try {
            // Exchange code for tokens using local edge function
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !sessionData.session) {
              throw new Error('No active session');
            }

            console.log('[useFathomIntegration] Exchanging code via local edge function...');
            console.log('[useFathomIntegration] Sending to edge function:', {
              code: code?.substring(0, 10) + '...',
              state: state?.substring(0, 10) + '...',
              codeLength: code?.length,
              stateLength: state?.length,
            });

            const { data, error: functionError } = await supabase.functions.invoke(
              'fathom-oauth-callback',
              {
                headers: {
                  Authorization: `Bearer ${sessionData.session.access_token}`,
                },
                body: { code, state },
              }
            );

            console.log('[useFathomIntegration] Edge function response:', {
              data,
              error: functionError,
            });

            if (functionError) {
              console.error('[useFathomIntegration] Token exchange failed:', functionError);
              throw new Error(functionError.message || 'Failed to exchange OAuth code');
            }

            if ((data as any)?.success === false || (data as any)?.error) {
              console.error('[useFathomIntegration] Token exchange returned error:', data);
              throw new Error((data as any)?.error || 'Token exchange failed');
            }

            console.log('[useFathomIntegration] Token exchange successful');
            popup?.close();
            window.removeEventListener('message', handleMessage);
            await handleConnectionSuccess();
          } catch (err) {
            console.error('[useFathomIntegration] Error handling code relay:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to complete OAuth flow');
            popup?.close();
            window.removeEventListener('message', handleMessage);
          }
        }
      };

      window.addEventListener('message', handleMessage);

      // Fallback: Poll for connection in case postMessage fails (browser security policies)
      // This handles cases where cross-origin restrictions block the message
      let pollCount = 0;
      const maxPolls = 60; // Poll for up to 60 seconds
      const pollInterval = setInterval(async () => {
        pollCount++;

        // Check if popup is closed
        if (popup?.closed) {
          console.log('[useFathomIntegration] Popup closed, checking for connection...');
          clearInterval(pollInterval);
          window.removeEventListener('message', handleMessage);

          // Check if we got connected
          if (!connectionHandled) {
            const { data: integrationData } = await supabaseAny
              .from('fathom_integrations')
              .select('*')
              .eq('user_id', user.id)
              .eq('is_active', true)
              .maybeSingle();

            if (integrationData) {
              await handleConnectionSuccess();
            }
          }
          return;
        }

        // Periodic check for connection (in case real-time subscription missed it)
        if (pollCount % 5 === 0 && !connectionHandled) {
          const { data: integrationData } = await supabaseAny
            .from('fathom_integrations')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

          if (integrationData) {
            console.log('[useFathomIntegration] Connection found via polling');
            clearInterval(pollInterval);
            window.removeEventListener('message', handleMessage);
            popup?.close();
            await handleConnectionSuccess();
          }
        }

        // Stop polling after max time
        if (pollCount >= maxPolls) {
          console.log('[useFathomIntegration] Polling timeout');
          clearInterval(pollInterval);
          window.removeEventListener('message', handleMessage);
        }
      }, 1000);

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect';
      // If user already has a connection, guide them to configure
      const alreadyConnected =
        msg.toLowerCase().includes('already has an active fathom connection') ||
        msg.toLowerCase().includes('integration already exists');

      if (!alreadyConnected) {
        setError(msg);
        toast.error(msg);
      } else {
        // Clear any previous error and guide the user.
        setError(null);
        toast.info('Fathom is already connected. Open Configure to manage it.');
      }
      return false;
    }
  };

  // Disconnect Fathom (per-user)
  const disconnectFathom = async (deleteSyncedMeetings: boolean = false) => {
    try {
      setError(null);

      if (!integration) {
        throw new Error('No integration to disconnect');
      }
      if (!user) {
        throw new Error('You must be logged in to disconnect Fathom');
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error('No active session');
      }

      console.log('[useFathomIntegration] Disconnecting Fathom for user:', user.id);

      // Per-user disconnect: no org_id needed
      const response = await supabase.functions.invoke('fathom-disconnect', {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: {
          delete_synced_meetings: deleteSyncedMeetings,
        },
      });

      console.log('[useFathomIntegration] Disconnect response:', response);

      // Check for error in response
      if (response.error) {
        // Try to extract a better error message
        let message = response.error.message || 'Failed to disconnect';
        try {
          const resp = (response.error as any)?.context?.response as Response | undefined;
          if (resp) {
            const text = await resp.text();
            if (text) {
              try {
                const parsed = JSON.parse(text);
                message = parsed?.error || parsed?.message || message;
              } catch {
                message = text;
              }
            }
          }
        } catch {
          // ignore extraction errors
        }
        throw new Error(message);
      }

      // Check for success: false in response data (non-2xx handled above, but 200 with success: false is possible)
      if (response.data && response.data.success === false) {
        throw new Error(response.data.error || 'Failed to disconnect Fathom');
      }

      console.log('[useFathomIntegration] Disconnect successful');
      setIntegration(null);
      setSyncState(null);
      setLifetimeMeetingsCount(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disconnect';
      console.error('[useFathomIntegration] Disconnect error:', msg);
      setError(msg);
      throw err; // Re-throw so the component can show a toast
    }
  };

  // Trigger manual sync (per-user)
  const triggerSync = async (params?: {
    sync_type?: 'initial' | 'incremental' | 'manual' | 'onboarding_fast' | 'onboarding_background';
    start_date?: string;
    end_date?: string;
    limit?: number; // Optional limit for test syncs
    is_onboarding?: boolean; // Mark as onboarding sync (historical imports)
  }): Promise<{
    success: boolean;
    meetings_synced?: number;
    total_meetings_found?: number;
    upgrade_required?: boolean;
    limit_warning?: string;
    limits?: {
      is_free_tier: boolean;
      used: number;
      max: number;
      remaining: number;
      historical: number;
    };
    error?: string;
  } | null> => {
    try {
      setError(null);
      setSyncInProgress(true); // Immediately show syncing state in UI
      console.log('[useFathomIntegration] triggerSync called with params:', params);

      if (!integration) {
        console.error('[useFathomIntegration] No active integration');
        throw new Error('No active integration');
      }
      console.log('[useFathomIntegration] Integration found:', integration.id);

      if (!user) {
        throw new Error('You must be logged in to sync');
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        console.error('[useFathomIntegration] No active session:', sessionError);
        throw new Error('No active session');
      }
      console.log('[useFathomIntegration] Session valid, invoking fathom-sync...');

      // Per-user sync: no org_id needed, Edge Function uses user_id from token
      const response = await supabase.functions.invoke('fathom-sync', {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: {
          sync_type: params?.sync_type || 'manual',
          start_date: params?.start_date,
          end_date: params?.end_date,
          limit: params?.limit, // Pass limit to Edge Function
          is_onboarding: params?.is_onboarding, // Mark as onboarding sync
        },
      });

      // Check for upgrade required response (402)
      if (response.data?.upgrade_required) {
        console.log('[useFathomIntegration] Upgrade required:', response.data);
        setSyncInProgress(false);
        return response.data;
      }

      console.log('[useFathomIntegration] Edge function response:', {
        error: response.error,
        data: response.data,
      });

      if (response.error) {
        console.error('[useFathomIntegration] Edge function returned error:', response.error);
        throw new Error(response.error.message || 'Sync failed');
      }

      // Log detailed sync results
      const syncResult = response.data;
      console.log('[useFathomIntegration] Sync result details:', {
        success: syncResult?.success,
        sync_type: syncResult?.sync_type,
        meetings_synced: syncResult?.meetings_synced,
        total_meetings_found: syncResult?.total_meetings_found,
        errors: syncResult?.errors,
      });

      // Refresh lifetime count after sync completes (per-user count)
      const { count, error: countError } = await supabaseAny
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', user.id)
        .not('fathom_recording_id', 'is', null);

      console.log('[useFathomIntegration] Count query result:', { count, countError });

      if (typeof count === 'number') {
        console.log('[useFathomIntegration] Updated lifetime count:', count);
        setLifetimeMeetingsCount(count);
      }

      console.log('[useFathomIntegration] Returning response.data:', response.data);
      return response.data;
    } catch (err) {
      console.error('[useFathomIntegration] triggerSync error:', err);
      setError(err instanceof Error ? err.message : 'Sync failed');
      throw err;
    } finally {
      setSyncInProgress(false); // Always reset sync state when operation completes
    }
  };

  // Check if sync is stale (stuck in 'syncing' for more than 10 minutes)
  // Note: Per-user sync state uses last_successful_sync instead of last_sync_started_at
  const isSyncStale = (() => {
    if (syncState?.sync_status !== 'syncing') return false;
    // Too many errors means it's stuck
    if (syncState.error_count && syncState.error_count > 3) {
      return true;
    }
    // Use the most recent available timestamp to detect staleness
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const lastActivity = syncState.last_error_at || syncState.last_successful_sync;
    if (lastActivity) {
      const lastActivityTime = new Date(lastActivity).getTime();
      if (lastActivityTime < tenMinutesAgo) {
        return true; // No activity for 10+ minutes while status says syncing
      }
    } else {
      // No timestamps at all -- sync_status is 'syncing' but nothing ever completed
      // If we're not actively syncing locally, this is stale leftover state
      if (!syncInProgress) {
        return true;
      }
    }
    return false;
  })();

  // If sync is stale, treat it as not syncing
  const effectiveSyncing = syncInProgress || (syncState?.sync_status === 'syncing' && !isSyncStale);

  return {
    integration,
    syncState,
    loading,
    error,
    isConnected: !!integration,
    canManage,
    // Combine local sync state (immediate feedback) with database sync state
    // But ignore stale syncs (stuck for >10 minutes)
    isSyncing: effectiveSyncing,
    syncInProgress, // Expose for components that need to differentiate
    lifetimeMeetingsCount,
    connectFathom,
    disconnectFathom,
    triggerSync,
  };
}

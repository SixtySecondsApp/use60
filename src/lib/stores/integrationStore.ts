import { create } from 'zustand';
import { googleApi, GoogleIntegration, GoogleServiceStatus } from '@/lib/api/googleIntegration';
import { supabase } from '@/lib/supabase/clientV2';

interface GoogleState {
  isConnected: boolean;
  integration: GoogleIntegration | null;
  email: string | null;
  services: GoogleServiceStatus;
  lastSync: Date | null;
  status: 'connected' | 'disconnected' | 'error' | 'refreshing';
  isLoading: boolean;
  error: string | null;
  nylasCalendarConnected: boolean;
}

interface MicrosoftServiceStatus {
  email: boolean;
  calendar: boolean;
  drive: boolean;
}

interface MicrosoftState {
  isConnected: boolean;
  email: string | null;
  services: MicrosoftServiceStatus;
  status: 'connected' | 'disconnected' | 'error' | 'refreshing';
  isLoading: boolean;
  error: string | null;
}

interface IntegrationState {
  google: GoogleState;
  microsoft: MicrosoftState;

  // Google actions
  checkGoogleConnection: () => Promise<void>;
  connectGoogle: () => Promise<string>;
  disconnectGoogle: () => Promise<void>;
  toggleService: (service: keyof GoogleServiceStatus) => Promise<void>;
  syncGoogle: () => Promise<void>;
  refreshGoogleTokens: () => Promise<void>;
  clearError: () => void;
  setLoading: (loading: boolean) => void;

  // Nylas
  connectNylas: () => Promise<string>;

  // Microsoft actions
  checkMicrosoftConnection: () => Promise<void>;
  connectMicrosoft: () => Promise<string>;
  disconnectMicrosoft: () => Promise<void>;

  // Selectors
  isServiceEnabled: (service: keyof GoogleServiceStatus) => boolean;
  getConnectionHealth: () => { isHealthy: boolean; issues: string[] };
}

const initialGoogleState: GoogleState = {
  isConnected: false,
  integration: null,
  email: null,
  services: {
    gmail: false,
    calendar: false,
    drive: false
  },
  lastSync: null,
  status: 'disconnected',
  isLoading: false,
  error: null,
  nylasCalendarConnected: false,
};

const initialMicrosoftState: MicrosoftState = {
  isConnected: false,
  email: null,
  services: { email: false, calendar: false, drive: false },
  status: 'disconnected',
  isLoading: false,
  error: null,
};

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  google: initialGoogleState,
  microsoft: initialMicrosoftState,

  checkGoogleConnection: async () => {
    const { google } = get();
    if (google.isLoading) return; // Prevent concurrent calls
    
    set(state => ({
      google: { 
        ...state.google, 
        isLoading: true, 
        error: null 
      }
    }));

    try {
      // Get integration status — this is the source of truth for connection
      const integration = await googleApi.getStatus();

      if (!integration) {
        set(state => ({
          google: {
            ...state.google,
            isConnected: false,
            integration: null,
            email: null,
            services: { gmail: false, calendar: false, drive: false },
            lastSync: null,
            status: 'disconnected',
            isLoading: false,
            error: null
          }
        }));
        return;
      }

      // These can fail independently — don't let failures block connection status
      let serviceStatus = { gmail: true, calendar: true, drive: true };
      try {
        serviceStatus = await googleApi.getServiceStatus();
      } catch (e) {
        console.warn('[integrationStore] Failed to get service status, using defaults:', e);
      }

      let health = { isConnected: integration.is_active, hasValidTokens: false, expiresAt: null, email: null, lastSync: null };
      try {
        health = await googleApi.getHealth();
      } catch (e) {
        console.warn('[integrationStore] Failed to get health, using is_active as fallback:', e);
      }

      // Connection = integration record exists and is_active. Token health is secondary.
      const isConnected = !!integration && integration.is_active;
      const computedStatus: 'connected' | 'disconnected' | 'error' = isConnected ? 'connected' : 'error';

      // Check Nylas calendar integration status
      let nylasCalendarConnected = false;
      try {
        const { data: nylasInt } = await supabase
          .from('nylas_integrations')
          .select('id')
          .eq('is_active', true)
          .maybeSingle();
        nylasCalendarConnected = !!nylasInt;
      } catch (e) {
        console.warn('[integrationStore] Failed to check Nylas status:', e);
      }

      set(state => ({
        google: {
          ...state.google,
          isConnected,
          integration,
          email: integration?.email || null,
          services: serviceStatus,
          lastSync: integration ? new Date(integration.updated_at) : null,
          status: computedStatus,
          isLoading: false,
          error: null,
          nylasCalendarConnected,
        }
      }));
    } catch (error: any) {
      console.error('[integrationStore] checkGoogleConnection failed:', error);
      set(state => ({
        google: {
          ...state.google,
          isConnected: false,
          status: 'error',
          isLoading: false,
          error: error.message || 'Failed to check connection status'
        }
      }));
    }
  },

  connectGoogle: async (): Promise<string> => {
    set(state => ({
      google: { 
        ...state.google, 
        isLoading: true, 
        error: null 
      }
    }));

    try {
      const { authUrl } = await googleApi.initiateOAuth();
      
      // Don't set loading to false here - the OAuth flow will handle the state change
      // when the user returns from Google
      
      return authUrl;
    } catch (error: any) {
      set(state => ({
        google: {
          ...state.google,
          isLoading: false,
          error: error.message || 'Failed to initiate Google connection'
        }
      }));
      
      throw error;
    }
  },

  connectNylas: async (): Promise<string> => {
    set(state => ({
      google: { ...state.google, isLoading: true, error: null }
    }));

    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke('nylas-oauth-initiate', {
        body: { origin }
      });

      if (error) {
        // Extract actual error from edge function response body (Supabase hides it in non-2xx)
        let msg = error.message;
        try {
          const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
          if (ctx?.json) {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch {
          // ignore parse errors
        }
        console.error('[connectNylas] nylas-oauth-initiate failed:', msg, error);
        throw new Error(msg);
      }
      if (!data?.authUrl) throw new Error('No authorization URL received from Nylas');

      return data.authUrl;
    } catch (error: any) {
      const errMsg = error.message || 'Failed to initiate Nylas connection';
      set(state => ({
        google: {
          ...state.google,
          isLoading: false,
          error: errMsg
        }
      }));
      throw error;
    }
  },

  disconnectGoogle: async () => {
    const { google } = get();
    if (google.isLoading) return;
    
    set(state => ({
      google: { 
        ...state.google, 
        isLoading: true, 
        error: null 
      }
    }));

    try {
      await googleApi.disconnect();
      
      // Reset to initial state
      set(state => ({
        google: {
          ...initialGoogleState,
          status: 'disconnected'
        }
      }));
    } catch (error: any) {
      set(state => ({
        google: {
          ...state.google,
          isLoading: false,
          error: error.message || 'Failed to disconnect Google account'
        }
      }));
      
      throw error;
    }
  },

  toggleService: async (service: keyof GoogleServiceStatus) => {
    const { google } = get();
    if (!google.isConnected || google.isLoading) return;

    const newValue = !google.services[service];
    
    // Optimistic update
    set(state => ({
      google: {
        ...state.google,
        services: {
          ...state.google.services,
          [service]: newValue
        }
      }
    }));

    try {
      await googleApi.toggleService(service, newValue);
      
      // The optimistic update should already be in place
      // If needed, we could re-fetch the service status here
    } catch (error: any) {
      // Revert the optimistic update
      set(state => ({
        google: {
          ...state.google,
          services: {
            ...state.google.services,
            [service]: !newValue
          },
          error: error.message || `Failed to toggle ${service}`
        }
      }));
      
      throw error;
    }
  },

  syncGoogle: async () => {
    const { google } = get();
    if (!google.isConnected || google.isLoading) return;
    
    set(state => ({
      google: { 
        ...state.google, 
        status: 'refreshing' 
      }
    }));

    try {
      // Re-fetch all Google data
      await get().checkGoogleConnection();
      
      set(state => ({
        google: {
          ...state.google,
          lastSync: new Date(),
          status: 'connected'
        }
      }));
    } catch (error: any) {
      set(state => ({
        google: {
          ...state.google,
          status: 'error',
          error: error.message || 'Failed to sync Google data'
        }
      }));
    }
  },

  refreshGoogleTokens: async () => {
    const { google } = get();
    if (!google.integration || google.isLoading) return;
    
    set(state => ({
      google: { 
        ...state.google, 
        status: 'refreshing' 
      }
    }));

    try {
      const success = await googleApi.refreshTokens();
      
      if (success) {
        // Re-check connection status after token refresh
        await get().checkGoogleConnection();
      } else {
        throw new Error('Token refresh failed');
      }
    } catch (error: any) {
      set(state => ({
        google: {
          ...state.google,
          status: 'error',
          error: error.message || 'Failed to refresh access tokens'
        }
      }));
    }
  },

  clearError: () => {
    set(state => ({
      google: {
        ...state.google,
        error: null
      }
    }));
  },

  setLoading: (loading: boolean) => {
    set(state => ({
      google: {
        ...state.google,
        isLoading: loading
      }
    }));
  },

  // Microsoft actions
  checkMicrosoftConnection: async () => {
    const { microsoft } = get();
    if (microsoft.isLoading) return;

    set(state => ({ microsoft: { ...state.microsoft, isLoading: true, error: null } }));

    try {
      const { data: integration, error } = await supabase
        .from('microsoft_integrations')
        .select('id, email, is_active, token_status, scopes')
        .eq('is_active', true)
        .maybeSingle();

      if (error || !integration) {
        set(state => ({ microsoft: { ...initialMicrosoftState } }));
        return;
      }

      set(state => ({
        microsoft: {
          ...state.microsoft,
          isConnected: true,
          email: integration.email,
          services: { email: true, calendar: true, drive: true },
          status: integration.token_status === 'valid' ? 'connected' : 'error',
          isLoading: false,
          error: null,
        },
      }));
    } catch (error: any) {
      set(state => ({
        microsoft: {
          ...state.microsoft,
          isConnected: false,
          status: 'error',
          isLoading: false,
          error: error.message || 'Failed to check Microsoft connection',
        },
      }));
    }
  },

  connectMicrosoft: async (): Promise<string> => {
    set(state => ({ microsoft: { ...state.microsoft, isLoading: true, error: null } }));

    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke('oauth-initiate/microsoft', {
        body: { origin },
      });

      if (error) throw new Error(error.message || 'Failed to initiate Microsoft OAuth');
      if (!data?.url) throw new Error('No authorization URL received');

      return data.url;
    } catch (error: any) {
      set(state => ({
        microsoft: { ...state.microsoft, isLoading: false, error: error.message },
      }));
      throw error;
    }
  },

  disconnectMicrosoft: async () => {
    const { microsoft } = get();
    if (microsoft.isLoading) return;

    set(state => ({ microsoft: { ...state.microsoft, isLoading: true, error: null } }));

    try {
      await supabase
        .from('microsoft_integrations')
        .update({ is_active: false })
        .eq('is_active', true);

      set(() => ({ microsoft: { ...initialMicrosoftState } }));
    } catch (error: any) {
      set(state => ({
        microsoft: { ...state.microsoft, isLoading: false, error: error.message },
      }));
      throw error;
    }
  },

  // Selectors
  isServiceEnabled: (service: keyof GoogleServiceStatus): boolean => {
    const { google } = get();
    return google.isConnected && google.services[service];
  },

  getConnectionHealth: (): { isHealthy: boolean; issues: string[] } => {
    const { google } = get();
    const issues: string[] = [];

    if (!google.isConnected) {
      issues.push('Not connected to Google');
    }

    if (google.error) {
      issues.push(google.error);
    }

    if (google.status === 'error') {
      issues.push('Connection error detected');
    }

    if (google.integration && google.integration.expires_at) {
      const expiresAt = new Date(google.integration.expires_at);
      const now = new Date();
      const fiveMinutes = 5 * 60 * 1000;
      
      if (expiresAt.getTime() - now.getTime() < fiveMinutes) {
        issues.push('Access token expires soon');
      }
    }

    return {
      isHealthy: issues.length === 0,
      issues
    };
  }
}));

// Utility hook for Microsoft-specific state
export const useMicrosoftIntegration = () => {
  const store = useIntegrationStore();

  return {
    isConnected: store.microsoft.isConnected,
    email: store.microsoft.email,
    services: store.microsoft.services,
    status: store.microsoft.status,
    isLoading: store.microsoft.isLoading,
    error: store.microsoft.error,
    checkConnection: store.checkMicrosoftConnection,
    connect: store.connectMicrosoft,
    disconnect: store.disconnectMicrosoft,
  };
};

// Utility hook for Google-specific state
export const useGoogleIntegration = () => {
  const store = useIntegrationStore();
  
  return {
    // State
    isConnected: store.google.isConnected,
    integration: store.google.integration,
    email: store.google.email,
    services: store.google.services,
    status: store.google.status,
    isLoading: store.google.isLoading,
    error: store.google.error,
    lastSync: store.google.lastSync,
    
    // Actions
    checkConnection: store.checkGoogleConnection,
    connect: store.connectGoogle,
    disconnect: store.disconnectGoogle,
    toggleService: store.toggleService,
    sync: store.syncGoogle,
    refreshTokens: store.refreshGoogleTokens,
    clearError: store.clearError,
    
    // Selectors
    isServiceEnabled: store.isServiceEnabled,
    getConnectionHealth: store.getConnectionHealth
  };
};
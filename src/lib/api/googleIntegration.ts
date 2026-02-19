import { supabase } from '@/lib/supabase/clientV2';

export interface GoogleIntegration {
  id: string;
  user_id: string;
  email: string;
  expires_at: string | null;
  scopes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GoogleServiceStatus {
  gmail: boolean;
  calendar: boolean;
  drive: boolean;
}

export interface GoogleOAuthResponse {
  authUrl: string;
  state: string;
}

export class GoogleIntegrationAPI {
  /**
   * Initiate Google OAuth flow
   * Calls the google-oauth-initiate Edge Function to generate an authorization URL
   */
  static async initiateOAuth(): Promise<GoogleOAuthResponse> {
    // Get current origin to pass to Edge Function for dynamic redirect URI
    const origin = window.location.origin;
    
    const { data, error } = await supabase.functions.invoke('google-oauth-initiate', {
      body: { origin }
    });

    if (error) {
      throw new Error(error.message || 'Failed to initiate Google OAuth');
    }

    if (!data?.authUrl) {
      throw new Error('No authorization URL received from OAuth initiation');
    }

    return data;
  }

  /**
   * Get current Google integration status for the authenticated user
   */
  static async getIntegrationStatus(): Promise<GoogleIntegration | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Try the RPC function first (preferred method), but cache "missing" to avoid spamming 404s
    const rpcMissingKey = 'rpc_missing_get_my_google_integration';
    const rpcMarkedMissing = (() => {
      try {
        return sessionStorage.getItem(rpcMissingKey) === 'true';
      } catch {
        return false;
      }
    })();

    const { data: rpcData, error: rpcError } = rpcMarkedMissing
      ? ({ data: null, error: { message: 'RPC missing (cached)' } } as any)
      : await supabase.rpc('get_my_google_integration');

    if (!rpcError && rpcData) {
      // RPC returns an array, get the first item - ensure we return null instead of undefined
      return Array.isArray(rpcData) ? (rpcData[0] ?? null) : (rpcData ?? null);
    }

    // If RPC is missing, remember it for this session
    if (rpcError?.message) {
      const msg = String(rpcError.message).toLowerCase();
      if (msg.includes('could not find the function') || msg.includes('does not exist')) {
        try {
          sessionStorage.setItem(rpcMissingKey, 'true');
        } catch {
          // ignore
        }
      }
    }

    // If RPC fails, try direct query (this now works!)
    const { data: directData, error: directError } = await supabase
      .from('google_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (directError && directError.code !== 'PGRST116') {
      return null;
    }

    // Ensure we always return null instead of undefined for React Query
    return directData ?? null;
  }

  /**
   * Disconnect Google integration for the authenticated user
   */
  static async disconnectIntegration(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Set integration as inactive instead of deleting to preserve audit trail
    const { error } = await supabase
      .from('google_integrations')
      .update({ is_active: false })
      .eq('user_id', user.id);

    if (error) {
      throw new Error(error.message || 'Failed to disconnect Google integration');
    }

    // Also clean up any cached data (calendars, labels, folders)
    await GoogleIntegrationAPI.cleanupCachedData();
  }

  /**
   * Clean up cached Google data when integration is disconnected
   */
  private static async cleanupCachedData(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return;

    // Get the integration ID to clean up related data
    const { data: integration } = await supabase
      .from('google_integrations')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!integration) return;

    // Clean up cached data - these will cascade delete due to foreign key constraints
    await Promise.all([
      supabase
        .from('google_calendars')
        .delete()
        .eq('integration_id', integration.id),
      
      supabase
        .from('google_email_labels')
        .delete()
        .eq('integration_id', integration.id),
      
      supabase
        .from('google_drive_folders')
        .delete()
        .eq('integration_id', integration.id)
    ]);
  }

  /**
   * Get service-specific status from service_preferences column.
   * Falls back to all-enabled if the column doesn't exist yet (pre-migration).
   */
  static async getServiceStatus(): Promise<GoogleServiceStatus> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { gmail: false, calendar: false, drive: false };
    }

    const { data, error } = await supabase
      .from('google_integrations')
      .select('is_active, service_preferences')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return { gmail: false, calendar: false, drive: false };
    }

    const prefs = data.service_preferences;
    if (!prefs) {
      // Column not yet populated — default all enabled
      return { gmail: true, calendar: true, drive: true };
    }

    return {
      gmail: prefs.gmail !== false,
      calendar: prefs.calendar !== false,
      drive: prefs.drive !== false,
    };
  }

  /**
   * Toggle a specific Google service by persisting to service_preferences column.
   */
  static async toggleService(service: keyof GoogleServiceStatus, enabled: boolean): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Read current preferences first
    const { data: current, error: readError } = await supabase
      .from('google_integrations')
      .select('service_preferences')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (readError || !current) {
      throw new Error('Google integration not found');
    }

    const currentPrefs = current.service_preferences ?? {
      gmail: true,
      calendar: true,
      drive: true,
    };

    const updatedPrefs = { ...currentPrefs, [service]: enabled };

    const { error: updateError } = await supabase
      .from('google_integrations')
      .update({ service_preferences: updatedPrefs })
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (updateError) {
      throw new Error(updateError.message || `Failed to update ${service} preference`);
    }
  }

  /**
   * Check if tokens need refreshing and refresh if necessary
   * This will be called automatically by service proxy functions
   */
  static async refreshTokensIfNeeded(): Promise<boolean> {
    const integration = await GoogleIntegrationAPI.getIntegrationStatus();
    
    if (!integration) {
      return false;
    }

    // If we don't have an expiry, treat as invalid and force refresh/reconnect flow.
    if (!integration.expires_at) {
      return false;
    }

    const expiresAt = new Date(integration.expires_at);
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

    // Check if token expires within 5 minutes
    if (expiresAt.getTime() - now.getTime() < fiveMinutes) {
      // TODO: Implement token refresh logic
      // This would involve calling a refresh-token Edge Function
      return false;
    }

    return true;
  }

  /**
   * Get integration health status
   */
  static async getIntegrationHealth(): Promise<{
    isConnected: boolean;
    hasValidTokens: boolean;
    expiresAt: string | null;
    email: string | null;
    lastSync: string | null;
  }> {
    const integration = await GoogleIntegrationAPI.getIntegrationStatus();
    
    if (!integration) {
      return {
        isConnected: false,
        hasValidTokens: false,
        expiresAt: null,
        email: null,
        lastSync: null
      };
    }

    const hasValidTokens = await GoogleIntegrationAPI.refreshTokensIfNeeded();
    
    return {
      isConnected: integration.is_active,
      hasValidTokens,
      expiresAt: integration.expires_at,
      email: integration.email,
      lastSync: integration.updated_at
    };
  }

  /**
   * Test Google connection by calling lightweight API endpoints
   * Returns detailed status for each service
   */
  static async testConnection(): Promise<GoogleTestConnectionResult> {
    const { data, error } = await supabase.functions.invoke('google-test-connection', {
      body: {}
    });

    // Log full response for debugging
    console.log('[googleIntegration.testConnection] Response:', { data, error });

    // Handle invoke-level errors (network, etc.)
    if (error) {
      console.error('[googleIntegration.testConnection] Invoke error:', error);
      throw new Error(error.message || 'Failed to test connection');
    }

    // The function now always returns 200 with data
    // Check data.success to determine if the operation succeeded
    if (data && !data.success) {
      console.error('[googleIntegration.testConnection] Function returned error:', data);
      const errorInfo = data.error || data.message || 'Test connection failed';
      const debugInfo = data.debugInfo || '';
      const currentStep = data.currentStep || '';
      console.error(`[googleIntegration.testConnection] Debug: ${debugInfo}, Step: ${currentStep}`);
      // Still return the data so the UI can show the error details
    }

    return data;
  }
}

/**
 * Result from test connection endpoint
 */
export interface GoogleTestConnectionResult {
  success: boolean;
  connected: boolean;
  email?: string;
  scopes?: string;
  allServicesOk?: boolean;
  message?: string;
  error?: string;
  testedAt?: string;
  services: {
    userinfo: ServiceTestResult;
    gmail: ServiceTestResult;
    calendar: ServiceTestResult;
    tasks: ServiceTestResult;
  };
}

interface ServiceTestResult {
  ok: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

// Export convenience methods for easier imports
export const googleApi = {
  initiateOAuth: GoogleIntegrationAPI.initiateOAuth,
  getStatus: GoogleIntegrationAPI.getIntegrationStatus,
  getServiceStatus: GoogleIntegrationAPI.getServiceStatus,
  getHealth: GoogleIntegrationAPI.getIntegrationHealth,
  disconnect: GoogleIntegrationAPI.disconnectIntegration,
  toggleService: GoogleIntegrationAPI.toggleService,
  refreshTokens: GoogleIntegrationAPI.refreshTokensIfNeeded,
  testConnection: GoogleIntegrationAPI.testConnection,
};

export default googleApi;
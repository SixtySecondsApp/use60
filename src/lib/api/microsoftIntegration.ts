import { supabase } from '@/lib/supabase/clientV2';

export interface MicrosoftIntegration {
  id: string;
  user_id: string;
  email: string;
  expires_at: string | null;
  scopes: string;
  is_active: boolean;
  service_preferences: MicrosoftServiceStatus | null;
  created_at: string;
  updated_at: string;
}

export interface MicrosoftServiceStatus {
  outlook: boolean;
  calendar: boolean;
}

export interface MicrosoftOAuthResponse {
  authUrl: string;
  state: string;
}

export class MicrosoftIntegrationAPI {
  /**
   * Initiate Microsoft OAuth flow
   */
  static async initiateOAuth(): Promise<MicrosoftOAuthResponse> {
    const origin = window.location.origin;

    const { data, error } = await supabase.functions.invoke('microsoft-oauth-initiate', {
      body: { origin }
    });

    if (error) {
      throw new Error(error.message || 'Failed to initiate Microsoft OAuth');
    }

    if (!data?.authUrl) {
      throw new Error('No authorization URL received from OAuth initiation');
    }

    return data;
  }

  /**
   * Get current Microsoft integration status for the authenticated user
   */
  static async getIntegrationStatus(): Promise<MicrosoftIntegration | null> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('microsoft_integrations')
      .select('id, user_id, email, expires_at, scopes, is_active, service_preferences, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      return null;
    }

    return data ?? null;
  }

  /**
   * Disconnect Microsoft integration for the authenticated user
   */
  static async disconnectIntegration(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    const { error } = await supabase
      .from('microsoft_integrations')
      .update({ is_active: false })
      .eq('user_id', user.id);

    if (error) {
      throw new Error(error.message || 'Failed to disconnect Microsoft integration');
    }
  }

  /**
   * Get service-specific status from service_preferences column.
   */
  static async getServiceStatus(): Promise<MicrosoftServiceStatus> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { outlook: false, calendar: false };
    }

    const { data, error } = await supabase
      .from('microsoft_integrations')
      .select('service_preferences')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return { outlook: false, calendar: false };
    }

    const prefs = data.service_preferences;
    if (!prefs) {
      return { outlook: true, calendar: true };
    }

    return {
      outlook: prefs.outlook !== false,
      calendar: prefs.calendar !== false,
    };
  }

  /**
   * Toggle a specific Microsoft service
   */
  static async toggleService(service: keyof MicrosoftServiceStatus, enabled: boolean): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data: current, error: readError } = await supabase
      .from('microsoft_integrations')
      .select('service_preferences')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (readError || !current) {
      throw new Error('Microsoft integration not found');
    }

    const currentPrefs = current.service_preferences ?? {
      outlook: true,
      calendar: true,
    };

    const updatedPrefs = { ...currentPrefs, [service]: enabled };

    const { error: updateError } = await supabase
      .from('microsoft_integrations')
      .update({ service_preferences: updatedPrefs })
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (updateError) {
      throw new Error(updateError.message || `Failed to update ${service} preference`);
    }
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
    const integration = await MicrosoftIntegrationAPI.getIntegrationStatus();

    if (!integration) {
      return {
        isConnected: false,
        hasValidTokens: false,
        expiresAt: null,
        email: null,
        lastSync: null
      };
    }

    // Check if tokens are valid (not expired)
    let hasValidTokens = false;
    if (integration.expires_at) {
      const expiresAt = new Date(integration.expires_at);
      const fiveMinutes = 5 * 60 * 1000;
      hasValidTokens = expiresAt.getTime() - Date.now() > fiveMinutes;
    }

    return {
      isConnected: integration.is_active,
      hasValidTokens,
      expiresAt: integration.expires_at,
      email: integration.email,
      lastSync: integration.updated_at
    };
  }

  /**
   * Test Microsoft connection
   */
  static async testConnection(): Promise<MicrosoftTestConnectionResult> {
    try {
      const { data, error } = await supabase.functions.invoke('microsoft-test-connection', {
        body: {}
      });

      if (error) {
        return {
          success: false,
          connected: false,
          error: error.message || 'Failed to test connection',
          services: {
            userinfo: { ok: false, message: 'Invoke error' },
            outlook: { ok: false, message: 'Invoke error' },
            calendar: { ok: false, message: 'Invoke error' },
          },
        };
      }

      if (data && !data.success) {
        return data;
      }

      return data;
    } catch (err) {
      return {
        success: false,
        connected: false,
        error: err instanceof Error ? err.message : 'Test connection failed',
        services: {
          userinfo: { ok: false, message: 'Unexpected error' },
          outlook: { ok: false, message: 'Unexpected error' },
          calendar: { ok: false, message: 'Unexpected error' },
        },
      };
    }
  }
}

export interface MicrosoftTestConnectionResult {
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
    outlook: ServiceTestResult;
    calendar: ServiceTestResult;
  };
}

interface ServiceTestResult {
  ok: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

export const microsoftApi = {
  initiateOAuth: MicrosoftIntegrationAPI.initiateOAuth,
  getStatus: MicrosoftIntegrationAPI.getIntegrationStatus,
  getServiceStatus: MicrosoftIntegrationAPI.getServiceStatus,
  getHealth: MicrosoftIntegrationAPI.getIntegrationHealth,
  disconnect: MicrosoftIntegrationAPI.disconnectIntegration,
  toggleService: MicrosoftIntegrationAPI.toggleService,
  testConnection: MicrosoftIntegrationAPI.testConnection,
};

export default microsoftApi;

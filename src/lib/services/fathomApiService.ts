import { supabase } from '@/lib/supabase/clientV2';

/**
 * Fathom API Service
 *
 * Purpose: Complete TypeScript client for Fathom API v1
 * Features:
 * - OAuth token management with auto-refresh
 * - All Fathom API endpoints
 * - Type-safe responses
 * - Error handling and retry logic
 * - Rate limiting support
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface FathomCall {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration: number; // seconds
  host_email: string;
  host_name: string;
  share_url: string;
  app_url: string;
  transcript_url?: string;
  ai_summary?: {
    text: string;
    key_points?: string[];
  };
  participants?: FathomParticipant[];
  recording_status: 'processing' | 'ready' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface FathomParticipant {
  name: string;
  email?: string;
  is_host: boolean;
  join_time?: string;
  leave_time?: string;
}

export interface FathomAnalytics {
  call_id: string;
  sentiment?: {
    score: number; // -1 to 1
    label: 'positive' | 'neutral' | 'negative';
  };
  performance_score?: number; // 0 to 100
  speaker_stats?: {
    host_percentage: number;
    guest_percentage: number;
    total_speaking_time: number;
  };
  talk_time_analysis?: {
    rep_percentage: number;
    customer_percentage: number;
    judgement: 'good' | 'high' | 'low';
  };
  key_moments?: Array<{
    timestamp: number;
    description: string;
    type: 'question' | 'objection' | 'next_step' | 'highlight';
  }>;
}

export interface FathomHighlight {
  id: string;
  call_id: string;
  title: string;
  description?: string;
  start_time: number; // seconds from start
  end_time: number;
  created_at: string;
  created_by: string;
  share_url: string;
}

export interface ListCallsParams {
  limit?: number;
  offset?: number;
  start_date?: string; // ISO 8601
  end_date?: string;
  host_email?: string;
  status?: 'processing' | 'ready' | 'failed';
  sort_by?: 'start_time' | 'created_at' | 'duration';
  sort_order?: 'asc' | 'desc';
}

export interface SearchCallsQuery {
  query: string;
  limit?: number;
  filters?: {
    start_date?: string;
    end_date?: string;
    participants?: string[];
  };
}

export interface SyncResult {
  success: boolean;
  calls_synced: number;
  errors: Array<{
    call_id: string;
    error: string;
  }>;
  cursor?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

// ============================================================================
// Fathom API Service Class
// ============================================================================

export class FathomAPIService {
  private baseUrl: string;
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // ms

  constructor() {
    this.baseUrl = import.meta.env.FATHOM_API_BASE_URL || 'https://api.fathom.ai/external/v1';
  }

  // ==========================================================================
  // Authentication & Token Management
  // ==========================================================================

  /**
   * Get valid access token for user, refreshing if needed
   */
  private async getValidToken(userId: string): Promise<string> {
    const { data: integration, error } = await supabase
      .from('fathom_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error || !integration) {
      throw new Error('No active Fathom integration found');
    }

    // Check if token is expired or will expire in next 5 minutes
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt < fiveMinutesFromNow) {
      await this.refreshAccessToken(userId);

      // Fetch updated token
      const { data: refreshedIntegration, error: refreshError } = await supabase
        .from('fathom_integrations')
        .select('access_token')
        .eq('user_id', userId)
        .single();

      if (refreshError || !refreshedIntegration) {
        throw new Error('Failed to get refreshed token');
      }

      return refreshedIntegration.access_token;
    }

    return integration.access_token;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(userId: string): Promise<void> {
    const { data: integration, error } = await supabase
      .from('fathom_integrations')
      .select('refresh_token')
      .eq('user_id', userId)
      .single();

    if (error || !integration) {
      throw new Error('No integration found to refresh');
    }

    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fathom-oauth-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const tokenData = await response.json();

    // Calculate new expiry
    const expiresIn = tokenData.expires_in || 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Update tokens in database
    await supabase
      .from('fathom_integrations')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || integration.refresh_token,
        token_expires_at: tokenExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  }

  // ==========================================================================
  // HTTP Request Helper with Retry Logic
  // ==========================================================================

  private async request<T>(
    userId: string,
    endpoint: string,
    options: RequestInit = {},
    attempt: number = 1
  ): Promise<T> {
    try {
      const token = await this.getValidToken(userId);
      const url = `${this.baseUrl}${endpoint}`;

      const response = await fetch(url, {
        ...options,
        headers: {
          'X-Api-Key': token,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
        if (attempt < this.maxRetries) {
          await this.sleep(retryAfter * 1000);
          return this.request(userId, endpoint, options, attempt + 1);
        }

        throw new Error('Rate limit exceeded');
      }

      // Handle token expiration
      if (response.status === 401) {
        await this.refreshAccessToken(userId);

        if (attempt < this.maxRetries) {
          return this.request(userId, endpoint, options, attempt + 1);
        }

        throw new Error('Authentication failed');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt < this.maxRetries && this.isRetryableError(error)) {
        await this.sleep(this.retryDelay * attempt);
        return this.request(userId, endpoint, options, attempt + 1);
      }

      throw error;
    }
  }

  private isRetryableError(error: any): boolean {
    // Retry on network errors but not on client errors
    return (
      error instanceof TypeError || // Network errors
      error.message?.includes('fetch failed') ||
      error.message?.includes('timeout')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // Calls/Meetings API
  // ==========================================================================

  /**
   * List all meetings with pagination and filtering
   * Note: Fathom API uses cursor-based pagination
   */
  async listCalls(userId: string, params: ListCallsParams = {}): Promise<{ data: FathomCall[]; pagination: any }> {
    const queryParams = new URLSearchParams();

    // Fathom API uses created_after/created_before instead of start_date/end_date
    if (params.start_date) queryParams.set('created_after', params.start_date);
    if (params.end_date) queryParams.set('created_before', params.end_date);
    if (params.host_email) queryParams.set('recorded_by[]', params.host_email);

    const endpoint = `/meetings?${queryParams.toString()}`;
    return this.request<{ data: FathomCall[]; pagination: any }>(userId, endpoint);
  }

  /**
   * Get detailed information about a specific meeting
   */
  async getCallDetails(userId: string, callId: string): Promise<FathomCall> {
    return this.request<FathomCall>(userId, `/meetings/${callId}`);
  }

  /**
   * Search calls by keywords
   */
  async searchCalls(userId: string, query: SearchCallsQuery): Promise<{ data: FathomCall[] }> {
    return this.request<{ data: FathomCall[] }>(userId, '/calls/search', {
      method: 'POST',
      body: JSON.stringify(query),
    });
  }

  // ==========================================================================
  // Analytics API
  // ==========================================================================

  /**
   * Get transcript for a specific meeting
   * Note: Fathom API may include this in the main meeting response
   */
  async getCallAnalytics(userId: string, callId: string): Promise<FathomAnalytics> {
    return this.request<FathomAnalytics>(userId, `/recordings/${callId}/transcript`);
  }

  // ==========================================================================
  // Highlights API (Future)
  // ==========================================================================

  /**
   * Create a highlight from a call
   */
  async createHighlight(
    userId: string,
    callId: string,
    data: { title: string; start_time: number; end_time: number; description?: string }
  ): Promise<FathomHighlight> {
    return this.request<FathomHighlight>(userId, `/calls/${callId}/highlights`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * List highlights for a call
   */
  async listHighlights(userId: string, callId: string): Promise<{ data: FathomHighlight[] }> {
    return this.request<{ data: FathomHighlight[] }>(userId, `/calls/${callId}/highlights`);
  }

  // ==========================================================================
  // Sync Operations (High-Level)
  // ==========================================================================

  /**
   * Sync all calls for a user within a date range
   */
  async syncAllCalls(userId: string, dateRange?: DateRange): Promise<SyncResult> {
    const params: ListCallsParams = {
      limit: 100, // Process in batches of 100
      sort_by: 'start_time',
      sort_order: 'desc',
    };

    if (dateRange) {
      params.start_date = dateRange.start.toISOString();
      params.end_date = dateRange.end.toISOString();
    }

    const result: SyncResult = {
      success: true,
      calls_synced: 0,
      errors: [],
    };

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        params.offset = offset;
        const response = await this.listCalls(userId, params);

        for (const call of response.data) {
          try {
            // Get full details and analytics
            const [details, analytics] = await Promise.all([
              this.getCallDetails(userId, call.id),
              this.getCallAnalytics(userId, call.id).catch(() => null), // Analytics might not be available yet
            ]);

            // This will be handled by the sync engine Edge Function
            // For now, just track the count
            result.calls_synced++;
          } catch (error) {
            result.errors.push({
              call_id: call.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        // Check if there are more results
        hasMore = response.data.length === params.limit;
        offset += params.limit;
      } catch (error) {
        result.success = false;
        throw error;
      }
    }

    return result;
  }

  /**
   * Sync a single call by ID
   */
  async syncSingleCall(userId: string, callId: string): Promise<FathomCall & { analytics?: FathomAnalytics }> {
    const [details, analytics] = await Promise.all([
      this.getCallDetails(userId, callId),
      this.getCallAnalytics(userId, callId).catch(() => null),
    ]);

    return {
      ...details,
      analytics: analytics || undefined,
    };
  }
}

// Export singleton instance
export const fathomApi = new FathomAPIService();

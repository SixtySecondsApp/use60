import { supabase } from '@/lib/supabase/clientV2';

/**
 * Global Topics Service
 *
 * Purpose: Client-side API wrapper for Global Topic Aggregation features
 * Features:
 * - Aggregate topics across meetings using semantic similarity
 * - Query global topics with filtering and pagination
 * - Manage topic archives and merges
 * - Generate content from global topics
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Filters for querying global topics
 */
export interface GlobalTopicsFilters {
  date_range?: { start: string; end: string };
  company_ids?: string[];
  contact_ids?: string[];
  meeting_types?: string[];
  custom_tags?: string[];
  search_query?: string;
}

/**
 * Sort options for global topics
 */
export type GlobalTopicsSortBy = 'frequency' | 'recency' | 'relevance';

/**
 * Query parameters for fetching global topics
 */
export interface GetGlobalTopicsParams {
  filters?: GlobalTopicsFilters;
  sort_by?: GlobalTopicsSortBy;
  page?: number;
  page_size?: number;
  include_sources?: boolean;
}

/**
 * Source meeting for a global topic
 */
export interface TopicSourceMeeting {
  meeting_id: string;
  meeting_title: string;
  meeting_date: string;
  company_name: string | null;
  contact_name: string | null;
  topic_title: string;
  topic_description: string;
  timestamp_seconds: number | null;
  fathom_url: string | null;
  similarity_score: number;
}

/**
 * Global topic with enriched data
 */
export interface GlobalTopic {
  id: string;
  canonical_title: string;
  canonical_description: string | null;
  source_count: number;
  first_seen_at: string;
  last_seen_at: string;
  frequency_score: number;
  recency_score: number;
  relevance_score: number;
  companies: string[];
  contacts: string[];
  meeting_count: number;
  sources?: TopicSourceMeeting[];
}

/**
 * Pagination info for global topics response
 */
export interface PaginationInfo {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/**
 * Statistics for global topics
 */
export interface GlobalTopicsStats {
  total_topics: number;
  displayed_topics: number;
  total_meetings?: number;
  total_companies?: number;
  total_contacts?: number;
  avg_sources_per_topic?: number;
  newest_topic_date?: string;
  oldest_topic_date?: string;
}

/**
 * Response from get aggregated topics endpoint
 */
export interface GetGlobalTopicsResponse {
  success: boolean;
  topics: GlobalTopic[];
  pagination: PaginationInfo;
  stats: GlobalTopicsStats;
  metadata: {
    filters_applied: string[];
    sort_by: string;
    response_time_ms: number;
  };
}

/**
 * Response from aggregate topics endpoint
 */
export interface AggregateTopicsResponse {
  success: boolean;
  result: {
    processed: number;
    new_global_topics: number;
    merged_into_existing: number;
    failed: number;
    errors: string[];
  };
  metadata: {
    processing_time_ms: number;
    similarity_threshold: number;
    mode: string;
  };
}

/**
 * Aggregation mode
 */
export type AggregationMode = 'incremental' | 'full' | 'single';

// ============================================================================
// Custom Error Class
// ============================================================================

export class GlobalTopicsServiceError extends Error {
  public status: number;
  public details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'GlobalTopicsServiceError';
    this.status = status;
    this.details = details;
  }
}

// ============================================================================
// Global Topics Service Class
// ============================================================================

export class GlobalTopicsService {
  private readonly aggregateTopicsUrl: string;
  private readonly getTopicsUrl: string;
  private readonly defaultTimeout: number = 60000; // 60 seconds

  constructor() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('VITE_SUPABASE_URL is not configured');
    }

    this.aggregateTopicsUrl = `${supabaseUrl}/functions/v1/aggregate-global-topics`;
    this.getTopicsUrl = `${supabaseUrl}/functions/v1/get-router`;
  }

  // ==========================================================================
  // Authentication Helper
  // ==========================================================================

  private async getAuthToken(): Promise<string> {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      throw new GlobalTopicsServiceError(
        'Please log in to continue',
        401,
        'No active authentication session'
      );
    }

    return session.access_token;
  }

  // ==========================================================================
  // Fetch Helper
  // ==========================================================================

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new GlobalTopicsServiceError(
          'Request timed out. Please try again.',
          408,
          `Request exceeded ${timeout}ms timeout`
        );
      }

      throw error;
    }
  }

  // ==========================================================================
  // Public API Methods
  // ==========================================================================

  /**
   * Aggregate topics from meetings into global topics
   *
   * @param mode - Aggregation mode: 'incremental' (queue), 'full' (all), 'single' (one meeting)
   * @param meetingId - Required for 'single' mode
   * @param similarityThreshold - Threshold for clustering (default: 0.85)
   */
  async aggregateTopics(
    mode: AggregationMode = 'incremental',
    meetingId?: string,
    similarityThreshold: number = 0.85
  ): Promise<AggregateTopicsResponse> {
    try {
      if (mode === 'single' && !meetingId) {
        throw new GlobalTopicsServiceError(
          'Meeting ID is required for single mode',
          400,
          'Provide meetingId when using single mode'
        );
      }

      const token = await this.getAuthToken();

      const response = await this.fetchWithTimeout(
        this.aggregateTopicsUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            mode,
            meeting_id: meetingId,
            similarity_threshold: similarityThreshold,
          }),
        },
        this.defaultTimeout
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new GlobalTopicsServiceError(
          errorData.error || 'Failed to aggregate topics',
          response.status,
          errorData.details
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof GlobalTopicsServiceError) {
        throw error;
      }

      throw new GlobalTopicsServiceError(
        'Failed to aggregate topics. Please try again.',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get aggregated global topics with filtering and pagination
   */
  async getGlobalTopics(params: GetGlobalTopicsParams = {}): Promise<GetGlobalTopicsResponse> {
    try {
      const token = await this.getAuthToken();

      const response = await this.fetchWithTimeout(
        this.getTopicsUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'aggregated_topics',
            filters: params.filters,
            sort_by: params.sort_by || 'relevance',
            page: params.page || 1,
            page_size: params.page_size || 20,
            include_sources: params.include_sources || false,
          }),
        },
        this.defaultTimeout
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new GlobalTopicsServiceError(
          errorData.error || 'Failed to fetch topics',
          response.status,
          errorData.details
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof GlobalTopicsServiceError) {
        throw error;
      }

      throw new GlobalTopicsServiceError(
        'Failed to fetch topics. Please try again.',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get sources for a specific global topic
   */
  async getTopicSources(
    globalTopicId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<TopicSourceMeeting[]> {
    try {
      const { data, error } = await supabase.rpc(
        'get_topic_sources_with_details' as never,
        {
          p_global_topic_id: globalTopicId,
          p_limit: limit,
          p_offset: offset,
        } as never
      );

      if (error) {
        throw new GlobalTopicsServiceError(
          'Failed to fetch topic sources',
          500,
          error.message
        );
      }

      return (data as TopicSourceMeeting[]) || [];
    } catch (error) {
      if (error instanceof GlobalTopicsServiceError) {
        throw error;
      }

      throw new GlobalTopicsServiceError(
        'Failed to fetch topic sources',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Archive or unarchive a global topic
   */
  async toggleTopicArchive(topicId: string, archive: boolean): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc(
        'toggle_topic_archive' as never,
        {
          p_topic_id: topicId,
          p_archive: archive,
        } as never
      );

      if (error) {
        throw new GlobalTopicsServiceError(
          'Failed to update topic',
          500,
          error.message
        );
      }

      return (data as boolean) || false;
    } catch (error) {
      if (error instanceof GlobalTopicsServiceError) {
        throw error;
      }

      throw new GlobalTopicsServiceError(
        'Failed to update topic',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Merge two global topics
   */
  async mergeTopics(sourceTopicId: string, targetTopicId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc(
        'merge_global_topics' as never,
        {
          p_source_topic_id: sourceTopicId,
          p_target_topic_id: targetTopicId,
        } as never
      );

      if (error) {
        throw new GlobalTopicsServiceError(
          'Failed to merge topics',
          500,
          error.message
        );
      }

      return (data as boolean) || false;
    } catch (error) {
      if (error instanceof GlobalTopicsServiceError) {
        throw error;
      }

      throw new GlobalTopicsServiceError(
        'Failed to merge topics',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get pending aggregation count
   */
  async getPendingAggregationCount(): Promise<number> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      const { data, error } = await supabase.rpc(
        'get_pending_aggregation_count' as never,
        {
          p_user_id: user.id,
        } as never
      );

      if (error) {
        console.error('Failed to get pending count:', error);
        return 0;
      }

      return (data as number) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get global topics statistics
   */
  async getStats(): Promise<GlobalTopicsStats | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase.rpc(
        'get_global_topics_stats' as never,
        {
          p_user_id: user.id,
        } as never
      );

      if (error) {
        console.error('Failed to get stats:', error);
        return null;
      }

      const statsArray = data as GlobalTopicsStats[] | null;
      return statsArray?.[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Update global topic title/description
   */
  async updateTopic(
    topicId: string,
    updates: { canonical_title?: string; canonical_description?: string }
  ): Promise<boolean> {
    try {
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('global_topics' as never)
        .update(updateData as never)
        .eq('id', topicId);

      if (error) {
        throw new GlobalTopicsServiceError(
          'Failed to update topic',
          500,
          error.message
        );
      }

      return true;
    } catch (error) {
      if (error instanceof GlobalTopicsServiceError) {
        throw error;
      }

      throw new GlobalTopicsServiceError(
        'Failed to update topic',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Delete a global topic (soft delete)
   */
  async deleteTopic(topicId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('global_topics' as never)
        .update({
          deleted_at: new Date().toISOString(),
        } as never)
        .eq('id', topicId);

      if (error) {
        throw new GlobalTopicsServiceError(
          'Failed to delete topic',
          500,
          error.message
        );
      }

      return true;
    } catch (error) {
      if (error instanceof GlobalTopicsServiceError) {
        throw error;
      }

      throw new GlobalTopicsServiceError(
        'Failed to delete topic',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}

// Export singleton instance
export const globalTopicsService = new GlobalTopicsService();

export default globalTopicsService;

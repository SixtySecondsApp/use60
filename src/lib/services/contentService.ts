import { supabase } from '@/lib/supabase/clientV2';

/**
 * Content Service
 *
 * Purpose: Client-side API wrapper for Content Tab AI features
 * Features:
 * - Extract content topics from meeting transcripts
 * - Generate marketing content (social, blog, video, email)
 * - Manage cached content and topics
 * - Calculate AI operation costs
 * - Type-safe responses with error handling
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Content types supported by the AI generation system
 */
export type ContentType = 'social' | 'blog' | 'video' | 'email';

/**
 * A single topic extracted from meeting transcript
 */
export interface Topic {
  title: string;
  description: string;
  timestamp_seconds: number;
  fathom_url: string;
}

/**
 * Metadata returned by AI operations
 */
export interface OperationMetadata {
  model_used: string;
  tokens_used: number;
  cost_cents: number;
  cached: boolean;
  topics_used?: number;
}

/**
 * Response from extract topics endpoint
 */
export interface ExtractTopicsResponse {
  success: boolean;
  topics: Topic[];
  metadata: OperationMetadata;
}

/**
 * Generated marketing content
 */
export interface GeneratedContent {
  id: string;
  title: string;
  content: string; // Markdown format
  content_type: ContentType;
  version: number;
}

/**
 * Response from generate content endpoint
 */
export interface GenerateContentResponse {
  success: boolean;
  content: GeneratedContent;
  metadata: OperationMetadata;
}

/**
 * Parameters for content generation
 */
export interface GenerateContentParams {
  meeting_id: string;
  content_type: ContentType;
  selected_topic_indices: number[];
  regenerate?: boolean;
}

/**
 * Cost summary for all AI operations on a meeting
 */
export interface CostSummary {
  total_tokens: number;
  total_cost_cents: number;
  operations_count: number;
  breakdown: {
    extract_topics: { tokens: number; cost_cents: number };
    generate_content: { tokens: number; cost_cents: number };
  };
}

// ============================================================================
// Custom Error Class
// ============================================================================

/**
 * Custom error class for content service operations
 */
export class ContentServiceError extends Error {
  public status: number;
  public details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'ContentServiceError';
    this.status = status;
    this.details = details;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ContentServiceError);
    }
  }
}

// ============================================================================
// Content Service Class
// ============================================================================

/**
 * Service for managing AI-powered content generation features
 */
export class ContentService {
  private readonly extractTopicsUrl: string;
  private readonly generateContentUrl: string;
  private readonly extractTopicsTimeout: number = 30000; // 30 seconds
  private readonly generateContentTimeout: number = 60000; // 60 seconds

  constructor() {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL);
    if (!supabaseUrl) {
      throw new Error('VITE_SUPABASE_URL is not configured');
    }

    // Edge Functions URLs
    this.extractTopicsUrl = `${supabaseUrl}/functions/v1/extract-router`;
    this.generateContentUrl = `${supabaseUrl}/functions/v1/generate-router`;
  }

  // ==========================================================================
  // Authentication Helper
  // ==========================================================================

  /**
   * Get authenticated session and JWT token
   * @private
   */
  private async getAuthToken(): Promise<string> {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      throw new ContentServiceError(
        'Please log in to continue',
        401,
        'No active authentication session'
      );
    }

    return session.access_token;
  }

  // ==========================================================================
  // Error Mapping
  // ==========================================================================

  /**
   * Map API errors to user-friendly messages
   * @private
   */
  private mapErrorToUserMessage(status: number, apiMessage?: string): string {
    const errorMap: Record<number, string> = {
      401: 'Please log in to continue',
      404: 'Meeting not found',
      422: "This meeting doesn't have a transcript yet",
      429: 'Rate limit exceeded. Please try again later.',
      503: 'AI service temporarily unavailable. Please try again.',
    };

    const userMessage = errorMap[status];
    if (userMessage) {
      return userMessage;
    }

    // Check for specific error messages
    if (apiMessage) {
      if (apiMessage.toLowerCase().includes('transcript')) {
        return "This meeting doesn't have a transcript available";
      }
      if (apiMessage.toLowerCase().includes('rate limit')) {
        return 'Too many requests. Please wait a moment and try again.';
      }
      if (apiMessage.toLowerCase().includes('timeout')) {
        return 'Request timed out. Please try again.';
      }
    }

    return 'An error occurred. Please try again.';
  }

  /**
   * Handle fetch errors with timeout support
   * @private
   */
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
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new ContentServiceError(
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
   * Extract content topics from meeting transcript
   *
   * @param meetingId - The ID of the meeting to extract topics from
   * @param forceRefresh - Force re-extraction even if cached topics exist
   * @returns Promise with topics and metadata
   * @throws ContentServiceError on failure
   *
   * @example
   * ```typescript
   * const result = await contentService.extractTopics('meeting-123');
   * console.log(result.topics);
   * ```
   */
  async extractTopics(
    meetingId: string,
    forceRefresh: boolean = false
  ): Promise<ExtractTopicsResponse> {
    try {
      // Validate input
      if (!meetingId || typeof meetingId !== 'string') {
        throw new ContentServiceError(
          'Invalid meeting ID',
          400,
          'Meeting ID must be a non-empty string'
        );
      }

      const token = await this.getAuthToken();

      const response = await this.fetchWithTimeout(
        this.extractTopicsUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'content_topics',
            meeting_id: meetingId,
            force_refresh: forceRefresh,
          }),
        },
        this.extractTopicsTimeout
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message;

        throw new ContentServiceError(
          this.mapErrorToUserMessage(response.status, errorMessage),
          response.status,
          errorMessage
        );
      }

      const data = await response.json();

      // Validate response structure
      if (!data.success || !Array.isArray(data.topics)) {
        throw new ContentServiceError(
          'Invalid response from server',
          500,
          'Response missing required fields'
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ContentServiceError) {
        throw error;
      }

      throw new ContentServiceError(
        'Failed to extract topics. Please try again.',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Generate marketing content from selected topics
   *
   * @param params - Content generation parameters
   * @returns Promise with generated content and metadata
   * @throws ContentServiceError on failure
   *
   * @example
   * ```typescript
   * const result = await contentService.generateContent({
   *   meeting_id: 'meeting-123',
   *   content_type: 'social',
   *   selected_topic_indices: [0, 2, 3],
   *   regenerate: false
   * });
   * console.log(result.content.content);
   * ```
   */
  async generateContent(
    params: GenerateContentParams
  ): Promise<GenerateContentResponse> {
    try {
      // Validate input
      if (!params.meeting_id || typeof params.meeting_id !== 'string') {
        throw new ContentServiceError(
          'Invalid meeting ID',
          400,
          'Meeting ID must be a non-empty string'
        );
      }

      if (!params.content_type) {
        throw new ContentServiceError(
          'Content type is required',
          400,
          'Must specify content_type (social, blog, video, or email)'
        );
      }

      const validContentTypes: ContentType[] = ['social', 'blog', 'video', 'email'];
      if (!validContentTypes.includes(params.content_type)) {
        throw new ContentServiceError(
          'Invalid content type',
          400,
          `Content type must be one of: ${validContentTypes.join(', ')}`
        );
      }

      if (!Array.isArray(params.selected_topic_indices) || params.selected_topic_indices.length === 0) {
        throw new ContentServiceError(
          'At least one topic must be selected',
          400,
          'selected_topic_indices must be a non-empty array'
        );
      }

      // Validate topic indices are numbers
      if (!params.selected_topic_indices.every(idx => typeof idx === 'number' && idx >= 0)) {
        throw new ContentServiceError(
          'Invalid topic indices',
          400,
          'All topic indices must be non-negative numbers'
        );
      }

      const token = await this.getAuthToken();

      const response = await this.fetchWithTimeout(
        this.generateContentUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'marketing_content',
            meeting_id: params.meeting_id,
            content_type: params.content_type,
            selected_topic_indices: params.selected_topic_indices,
            regenerate: params.regenerate || false,
          }),
        },
        this.generateContentTimeout
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message;

        throw new ContentServiceError(
          this.mapErrorToUserMessage(response.status, errorMessage),
          response.status,
          errorMessage
        );
      }

      const data = await response.json();

      // Validate response structure
      if (!data.success || !data.content) {
        throw new ContentServiceError(
          'Invalid response from server',
          500,
          'Response missing required fields'
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ContentServiceError) {
        throw error;
      }

      throw new ContentServiceError(
        'Failed to generate content. Please try again.',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get cached topics for a meeting
   *
   * @param meetingId - The ID of the meeting
   * @returns Promise with array of topics (empty if no cache exists)
   *
   * @example
   * ```typescript
   * const topics = await contentService.getCachedTopics('meeting-123');
   * if (topics.length > 0) {
   *   console.log('Found cached topics:', topics);
   * }
   * ```
   */
  async getCachedTopics(meetingId: string): Promise<Topic[]> {
    try {
      // Validate input
      if (!meetingId || typeof meetingId !== 'string') {
        return [];
      }

      // Call extract topics with force_refresh = false to get cached data
      const result = await this.extractTopics(meetingId, false);

      // If cached, return topics
      if (result.metadata.cached && result.topics) {
        return result.topics;
      }

      // No cached data available
      return [];
    } catch (error) {
      // Gracefully return empty array on error
      return [];
    }
  }

  /**
   * Get cached content for a meeting and content type
   *
   * @param meetingId - The ID of the meeting
   * @param contentType - Type of content to retrieve
   * @returns Promise with generated content or null if not found
   *
   * @example
   * ```typescript
   * const content = await contentService.getCachedContent('meeting-123', 'social');
   * if (content) {
   *   console.log('Cached content:', content.content);
   * }
   * ```
   */
  async getCachedContent(
    meetingId: string,
    contentType: ContentType
  ): Promise<GeneratedContent | null> {
    try {
      // Validate input
      if (!meetingId || typeof meetingId !== 'string') {
        return null;
      }

      const validContentTypes: ContentType[] = ['social', 'blog', 'video', 'email'];
      if (!validContentTypes.includes(contentType)) {
        return null;
      }

      // Query database directly for latest content
      const { data, error } = await supabase
        .from('generated_content')
        .select('id, title, content, content_type, version')
        .eq('meeting_id', meetingId)
        .eq('content_type', contentType)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        // Log error but return null gracefully (no content found)
        return null;
      }

      if (!data) {
        return null;
      }

      return data;
    } catch (error) {
      // Gracefully return null on error
      return null;
    }
  }

  /**
   * Calculate total costs for all AI operations on a meeting
   *
   * @param meetingId - The ID of the meeting
   * @returns Promise with cost summary
   *
   * @example
   * ```typescript
   * const costs = await contentService.calculateCosts('meeting-123');
   * console.log(`Total cost: $${costs.total_cost_cents / 100}`);
   * ```
   */
  async calculateCosts(meetingId: string): Promise<CostSummary> {
    try {
      // Validate input
      if (!meetingId || typeof meetingId !== 'string') {
        throw new ContentServiceError(
          'Invalid meeting ID',
          400,
          'Meeting ID must be a non-empty string'
        );
      }

      // Query content_operations table for all operations
      const { data, error } = await supabase
        .from('content_operations')
        .select('operation_type, tokens_used, cost_cents')
        .eq('meeting_id', meetingId);

      if (error) {
        throw new ContentServiceError(
          'Failed to calculate costs',
          500,
          error.message
        );
      }

      if (!data || data.length === 0) {
        // No operations yet
        return {
          total_tokens: 0,
          total_cost_cents: 0,
          operations_count: 0,
          breakdown: {
            extract_topics: { tokens: 0, cost_cents: 0 },
            generate_content: { tokens: 0, cost_cents: 0 },
          },
        };
      }

      // Calculate totals and breakdown
      let totalTokens = 0;
      let totalCostCents = 0;
      const breakdown = {
        extract_topics: { tokens: 0, cost_cents: 0 },
        generate_content: { tokens: 0, cost_cents: 0 },
      };

      data.forEach((operation) => {
        totalTokens += operation.tokens_used || 0;
        totalCostCents += operation.cost_cents || 0;

        if (operation.operation_type === 'extract_topics') {
          breakdown.extract_topics.tokens += operation.tokens_used || 0;
          breakdown.extract_topics.cost_cents += operation.cost_cents || 0;
        } else if (operation.operation_type === 'generate_content') {
          breakdown.generate_content.tokens += operation.tokens_used || 0;
          breakdown.generate_content.cost_cents += operation.cost_cents || 0;
        }
      });

      return {
        total_tokens: totalTokens,
        total_cost_cents: totalCostCents,
        operations_count: data.length,
        breakdown,
      };
    } catch (error) {
      if (error instanceof ContentServiceError) {
        throw error;
      }

      throw new ContentServiceError(
        'Failed to calculate costs. Please try again.',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get all generated content for a meeting
   *
   * @param meetingId - The ID of the meeting
   * @returns Promise with array of all generated content (sorted by creation date, newest first)
   *
   * @example
   * ```typescript
   * const allContent = await contentService.getAllGeneratedContent('meeting-123');
   * console.log(`Found ${allContent.length} pieces of content`);
   * ```
   */
  async getAllGeneratedContent(meetingId: string): Promise<GeneratedContent[]> {
    try {
      // Validate input
      if (!meetingId || typeof meetingId !== 'string') {
        return [];
      }

      // Query database for all latest versions of each content type
      const { data, error } = await supabase
        .from('meeting_generated_content')
        .select('id, title, content, content_type, version, created_at')
        .eq('meeting_id', meetingId)
        .eq('is_latest', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      return data.map((item) => ({
        id: item.id,
        title: item.title || '',
        content: item.content,
        content_type: item.content_type as ContentType,
        version: item.version,
      }));
    } catch (error) {
      return [];
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Validate if a meeting has a transcript available
   *
   * @param meetingId - The ID of the meeting to check
   * @returns Promise with boolean indicating transcript availability
   */
  async hasTranscript(meetingId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('transcript')
        .eq('id', meetingId)
        .single();

      if (error || !data) {
        return false;
      }

      return !!data.transcript && data.transcript.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Format cost in cents to dollar string
   *
   * @param costCents - Cost in cents
   * @returns Formatted dollar string
   *
   * @example
   * ```typescript
   * const formatted = contentService.formatCost(150); // "$1.50"
   * ```
   */
  formatCost(costCents: number): string {
    const dollars = costCents / 100;
    return `$${dollars.toFixed(2)}`;
  }
}

// Export singleton instance
export const contentService = new ContentService();

// Export default for convenience
export default contentService;

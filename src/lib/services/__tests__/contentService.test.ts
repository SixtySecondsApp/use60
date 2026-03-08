/**
 * Content Service Unit Tests
 *
 * Tests all methods of the ContentService class including:
 * - Authentication
 * - Topic extraction
 * - Content generation
 * - Caching
 * - Cost calculation
 * - Error handling
 *
 * Coverage Target: 90%+
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ContentService,
  ContentServiceError,
  type ExtractTopicsResponse,
  type GenerateContentResponse,
  type Topic,
  type ContentType,
  type CostSummary,
} from '../contentService';
import { supabase } from '@/lib/supabase/clientV2';

// Mock Supabase client
vi.mock('@/lib/supabase/clientV2', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('ContentService', () => {
  let contentService: ContentService;
  let mockSession: any;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create fresh instance
    contentService = new ContentService();

    // Mock valid session
    mockSession = {
      access_token: 'test-jwt-token',
      user: { id: 'user-123' },
    };

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    } as any);

    // Set environment variable
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ============================================================================
  // Constructor & Setup Tests
  // ============================================================================

  describe('constructor', () => {
    it('initializes with correct endpoint URLs', () => {
      expect(contentService).toBeDefined();
      expect((contentService as any).extractTopicsUrl).toBe(
        'https://test.supabase.co/functions/v1/extract-router'
      );
      expect((contentService as any).generateContentUrl).toBe(
        'https://test.supabase.co/functions/v1/generate-router'
      );
    });

    it('throws error when VITE_SUPABASE_URL not configured', () => {
      vi.unstubAllEnvs();
      vi.stubEnv('VITE_SUPABASE_URL', '');

      expect(() => new ContentService()).toThrow('VITE_SUPABASE_URL is not configured');
    });

    it('sets correct timeout values', () => {
      expect((contentService as any).extractTopicsTimeout).toBe(30000);
      expect((contentService as any).generateContentTimeout).toBe(60000);
    });
  });

  // ============================================================================
  // Authentication Tests
  // ============================================================================

  describe('getAuthToken', () => {
    it('returns JWT token when authenticated', async () => {
      const token = await (contentService as any).getAuthToken();

      expect(token).toBe('test-jwt-token');
      expect(supabase.auth.getSession).toHaveBeenCalledOnce();
    });

    it('throws 401 error when no session', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      } as any);

      await expect((contentService as any).getAuthToken()).rejects.toThrow(
        ContentServiceError
      );
      await expect((contentService as any).getAuthToken()).rejects.toMatchObject({
        status: 401,
        message: 'Please log in to continue',
      });
    });

    it('throws 401 error when session error', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: new Error('Session expired'),
      } as any);

      await expect((contentService as any).getAuthToken()).rejects.toThrow(
        ContentServiceError
      );
    });
  });

  // ============================================================================
  // extractTopics() Tests
  // ============================================================================

  describe('extractTopics', () => {
    const mockTopics: Topic[] = [
      {
        title: 'Product Launch Strategy',
        description: 'Discussion about Q1 launch',
        timestamp_seconds: 120,
        fathom_url: 'https://fathom.video/share/test?t=120',
      },
      {
        title: 'Budget Allocation',
        description: 'Marketing budget review',
        timestamp_seconds: 340,
        fathom_url: 'https://fathom.video/share/test?t=340',
      },
    ];

    const mockSuccessResponse: ExtractTopicsResponse = {
      success: true,
      topics: mockTopics,
      metadata: {
        model_used: 'gpt-4-turbo',
        tokens_used: 1500,
        cost_cents: 15,
        cached: false,
      },
    };

    it('extracts topics successfully with valid meeting ID', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockSuccessResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await contentService.extractTopics('meeting-123');

      expect(result.success).toBe(true);
      expect(result.topics).toHaveLength(2);
      expect(result.topics[0].title).toBe('Product Launch Strategy');
      expect(result.metadata.cached).toBe(false);

      // Verify fetch called with correct params
      expect(fetch).toHaveBeenCalledWith(
        'https://test.supabase.co/functions/v1/extract-router',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-jwt-token',
          }),
          body: JSON.stringify({
            action: 'content_topics',
            meeting_id: 'meeting-123',
            force_refresh: false,
          }),
        })
      );
    });

    it('returns cached topics when available', async () => {
      const cachedResponse = {
        ...mockSuccessResponse,
        metadata: { ...mockSuccessResponse.metadata, cached: true },
      };

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(cachedResponse), { status: 200 })
      );

      const result = await contentService.extractTopics('meeting-123');

      expect(result.metadata.cached).toBe(true);
      expect(result.topics).toHaveLength(2);
    });

    it('forces refresh when forceRefresh=true', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockSuccessResponse), { status: 200 })
      );

      await contentService.extractTopics('meeting-123', true);

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            meeting_id: 'meeting-123',
            force_refresh: true,
          }),
        })
      );
    });

    it('throws 400 error for invalid meeting ID', async () => {
      await expect(contentService.extractTopics('')).rejects.toMatchObject({
        status: 400,
        message: 'Invalid meeting ID',
      });

      await expect(contentService.extractTopics(null as any)).rejects.toMatchObject({
        status: 400,
      });

      await expect(contentService.extractTopics(123 as any)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('throws 422 error when transcript missing', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "This meeting doesn't have a transcript yet",
          }),
          { status: 422 }
        )
      );

      await expect(contentService.extractTopics('meeting-123')).rejects.toMatchObject({
        status: 422,
        message: "This meeting doesn't have a transcript yet",
      });
    });

    it('throws 429 error on rate limit', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'Rate limit exceeded' }),
          {
            status: 429,
            headers: { 'Retry-After': '60' },
          }
        )
      );

      await expect(contentService.extractTopics('meeting-123')).rejects.toMatchObject({
        status: 429,
        message: 'Rate limit exceeded. Please try again later.',
      });
    });

    it('throws 404 error for non-existent meeting', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Meeting not found' }), { status: 404 })
      );

      await expect(contentService.extractTopics('non-existent')).rejects.toMatchObject({
        status: 404,
        message: 'Meeting not found',
      });
    });

    it('throws 408 error on timeout', async () => {
      const controller = new AbortController();

      vi.mocked(fetch).mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            controller.abort();
            reject(new DOMException('Aborted', 'AbortError'));
          }, 100);
        });
      });

      await expect(contentService.extractTopics('meeting-123')).rejects.toMatchObject({
        status: 408,
        message: 'Request timed out. Please try again.',
      });
    });

    it('validates response structure', async () => {
      // Missing topics array
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      await expect(contentService.extractTopics('meeting-123')).rejects.toMatchObject({
        status: 500,
        message: 'Invalid response from server',
      });

      // Invalid topics type
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, topics: 'invalid' }),
          { status: 200 }
        )
      );

      await expect(contentService.extractTopics('meeting-123')).rejects.toMatchObject({
        status: 500,
      });
    });

    it('handles network errors gracefully', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network connection failed'));

      await expect(contentService.extractTopics('meeting-123')).rejects.toMatchObject({
        status: 500,
        message: 'Failed to extract topics. Please try again.',
      });
    });
  });

  // ============================================================================
  // generateContent() Tests
  // ============================================================================

  describe('generateContent', () => {
    const mockGeneratedContent: GenerateContentResponse = {
      success: true,
      content: {
        id: 'content-123',
        title: 'Product Launch Campaign',
        content: '# Launch Announcement\n\nWe are excited...',
        content_type: 'social',
        version: 1,
      },
      metadata: {
        model_used: 'gpt-4-turbo',
        tokens_used: 2500,
        cost_cents: 25,
        cached: false,
        topics_used: 3,
      },
    };

    const validParams = {
      meeting_id: 'meeting-123',
      content_type: 'social' as ContentType,
      selected_topic_indices: [0, 1, 2],
      regenerate: false,
    };

    it('generates content successfully with valid params', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockGeneratedContent), { status: 200 })
      );

      const result = await contentService.generateContent(validParams);

      expect(result.success).toBe(true);
      expect(result.content.title).toBe('Product Launch Campaign');
      expect(result.content.content_type).toBe('social');
      expect(result.metadata.topics_used).toBe(3);

      // Verify fetch called correctly
      expect(fetch).toHaveBeenCalledWith(
        'https://test.supabase.co/functions/v1/generate-router',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-jwt-token',
          }),
          body: JSON.stringify({
            action: 'marketing_content',
            meeting_id: 'meeting-123',
            content_type: 'social',
            selected_topic_indices: [0, 1, 2],
            regenerate: false,
          }),
        })
      );
    });

    it('regenerates content when regenerate=true', async () => {
      const regeneratedContent = {
        ...mockGeneratedContent,
        content: { ...mockGeneratedContent.content, version: 2 },
      };

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(regeneratedContent), { status: 200 })
      );

      const result = await contentService.generateContent({
        ...validParams,
        regenerate: true,
      });

      expect(result.content.version).toBe(2);
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"regenerate":true'),
        })
      );
    });

    it('throws 400 error for invalid meeting ID', async () => {
      await expect(
        contentService.generateContent({ ...validParams, meeting_id: '' })
      ).rejects.toMatchObject({
        status: 400,
        message: 'Invalid meeting ID',
      });
    });

    it('throws 400 error for missing content_type', async () => {
      await expect(
        contentService.generateContent({
          ...validParams,
          content_type: undefined as any,
        })
      ).rejects.toMatchObject({
        status: 400,
        message: 'Content type is required',
      });
    });

    it('throws 400 error for invalid content_type', async () => {
      await expect(
        contentService.generateContent({
          ...validParams,
          content_type: 'invalid' as ContentType,
        })
      ).rejects.toMatchObject({
        status: 400,
        message: 'Invalid content type',
      });
    });

    it('throws 400 error for empty topic indices', async () => {
      await expect(
        contentService.generateContent({
          ...validParams,
          selected_topic_indices: [],
        })
      ).rejects.toMatchObject({
        status: 400,
        message: 'At least one topic must be selected',
      });
    });

    it('throws 400 error for non-array topic indices', async () => {
      await expect(
        contentService.generateContent({
          ...validParams,
          selected_topic_indices: 'invalid' as any,
        })
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it('throws 400 error for negative topic indices', async () => {
      await expect(
        contentService.generateContent({
          ...validParams,
          selected_topic_indices: [0, -1, 2],
        })
      ).rejects.toMatchObject({
        status: 400,
        message: 'Invalid topic indices',
      });
    });

    it('throws 400 error for non-numeric topic indices', async () => {
      await expect(
        contentService.generateContent({
          ...validParams,
          selected_topic_indices: [0, 'invalid' as any, 2],
        })
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it('works with all content types', async () => {
      const contentTypes: ContentType[] = ['social', 'blog', 'video', 'email'];

      for (const type of contentTypes) {
        vi.mocked(fetch).mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ...mockGeneratedContent,
              content: { ...mockGeneratedContent.content, content_type: type },
            }),
            { status: 200 }
          )
        );

        const result = await contentService.generateContent({
          ...validParams,
          content_type: type,
        });

        expect(result.content.content_type).toBe(type);
      }
    });

    it('validates response structure', async () => {
      // Missing content object
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      await expect(
        contentService.generateContent(validParams)
      ).rejects.toMatchObject({
        status: 500,
        message: 'Invalid response from server',
      });
    });
  });

  // ============================================================================
  // getCachedTopics() Tests
  // ============================================================================

  describe('getCachedTopics', () => {
    const mockTopics: Topic[] = [
      {
        title: 'Test Topic',
        description: 'Description',
        timestamp_seconds: 100,
        fathom_url: 'https://fathom.video/test',
      },
    ];

    it('returns cached topics when available', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            topics: mockTopics,
            metadata: { cached: true, model_used: 'gpt-4', tokens_used: 0, cost_cents: 0 },
          }),
          { status: 200 }
        )
      );

      const result = await contentService.getCachedTopics('meeting-123');

      expect(result).toEqual(mockTopics);
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"force_refresh":false'),
        })
      );
    });

    it('returns empty array when no cache exists', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            topics: [],
            metadata: { cached: false, model_used: 'gpt-4', tokens_used: 1500, cost_cents: 15 },
          }),
          { status: 200 }
        )
      );

      const result = await contentService.getCachedTopics('meeting-123');

      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await contentService.getCachedTopics('meeting-123');

      expect(result).toEqual([]);
    });

    it('handles invalid meeting ID gracefully', async () => {
      const result = await contentService.getCachedTopics('');

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // getCachedContent() Tests
  // ============================================================================

  describe('getCachedContent', () => {
    const mockContent = {
      id: 'content-123',
      title: 'Test Content',
      content: '# Test',
      content_type: 'social',
      version: 1,
    };

    beforeEach(() => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn(),
      } as any);
    });

    it('returns cached content when exists', async () => {
      const mockSelect = vi.mocked(supabase.from('generated_content').select('*'));
      (mockSelect.single as any).mockResolvedValueOnce({
        data: mockContent,
        error: null,
      });

      const result = await contentService.getCachedContent('meeting-123', 'social');

      expect(result).toEqual(mockContent);
      expect(supabase.from).toHaveBeenCalledWith('generated_content');
    });

    it('returns null when content not found', async () => {
      const mockSelect = vi.mocked(supabase.from('generated_content').select('*'));
      (mockSelect.single as any).mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      const result = await contentService.getCachedContent('meeting-123', 'social');

      expect(result).toBeNull();
    });

    it('handles invalid meeting ID gracefully', async () => {
      const result = await contentService.getCachedContent('', 'social');

      expect(result).toBeNull();
    });

    it('handles invalid content_type gracefully', async () => {
      const result = await contentService.getCachedContent('meeting-123', 'invalid' as any);

      expect(result).toBeNull();
    });

    it('queries with correct filters', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockContent, error: null }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockChain as any);

      await contentService.getCachedContent('meeting-123', 'blog');

      expect(mockChain.eq).toHaveBeenCalledWith('meeting_id', 'meeting-123');
      expect(mockChain.eq).toHaveBeenCalledWith('content_type', 'blog');
      expect(mockChain.order).toHaveBeenCalledWith('version', { ascending: false });
      expect(mockChain.limit).toHaveBeenCalledWith(1);
    });
  });

  // ============================================================================
  // calculateCosts() Tests
  // ============================================================================

  describe('calculateCosts', () => {
    const mockOperations = [
      {
        operation_type: 'extract_topics',
        tokens_used: 1500,
        cost_cents: 15,
      },
      {
        operation_type: 'generate_content',
        tokens_used: 2500,
        cost_cents: 25,
      },
      {
        operation_type: 'generate_content',
        tokens_used: 2000,
        cost_cents: 20,
      },
    ];

    beforeEach(() => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockOperations, error: null }),
      } as any);
    });

    it('calculates total costs correctly', async () => {
      const result = await contentService.calculateCosts('meeting-123');

      expect(result.total_tokens).toBe(6000);
      expect(result.total_cost_cents).toBe(60);
      expect(result.operations_count).toBe(3);
    });

    it('breaks down costs by operation type', async () => {
      const result = await contentService.calculateCosts('meeting-123');

      expect(result.breakdown.extract_topics).toEqual({
        tokens: 1500,
        cost_cents: 15,
      });

      expect(result.breakdown.generate_content).toEqual({
        tokens: 4500,
        cost_cents: 45,
      });
    });

    it('returns zero costs when no operations', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any);

      const result = await contentService.calculateCosts('meeting-123');

      expect(result).toEqual({
        total_tokens: 0,
        total_cost_cents: 0,
        operations_count: 0,
        breakdown: {
          extract_topics: { tokens: 0, cost_cents: 0 },
          generate_content: { tokens: 0, cost_cents: 0 },
        },
      });
    });

    it('throws 400 error for invalid meeting ID', async () => {
      await expect(contentService.calculateCosts('')).rejects.toMatchObject({
        status: 400,
        message: 'Invalid meeting ID',
      });
    });

    it('handles database errors', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      } as any);

      await expect(contentService.calculateCosts('meeting-123')).rejects.toMatchObject({
        status: 500,
        message: 'Failed to calculate costs',
      });
    });
  });

  // ============================================================================
  // Utility Methods Tests
  // ============================================================================

  describe('hasTranscript', () => {
    beforeEach(() => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
      } as any);
    });

    it('returns true when transcript exists', async () => {
      const mockSelect = vi.mocked(supabase.from('meetings').select('*'));
      (mockSelect.single as any).mockResolvedValueOnce({
        data: { transcript: 'This is a valid transcript' },
        error: null,
      });

      const result = await contentService.hasTranscript('meeting-123');

      expect(result).toBe(true);
    });

    it('returns false when transcript is empty', async () => {
      const mockSelect = vi.mocked(supabase.from('meetings').select('*'));
      (mockSelect.single as any).mockResolvedValueOnce({
        data: { transcript: '' },
        error: null,
      });

      const result = await contentService.hasTranscript('meeting-123');

      expect(result).toBe(false);
    });

    it('returns false when transcript is null', async () => {
      const mockSelect = vi.mocked(supabase.from('meetings').select('*'));
      (mockSelect.single as any).mockResolvedValueOnce({
        data: { transcript: null },
        error: null,
      });

      const result = await contentService.hasTranscript('meeting-123');

      expect(result).toBe(false);
    });

    it('returns false when meeting not found', async () => {
      const mockSelect = vi.mocked(supabase.from('meetings').select('*'));
      (mockSelect.single as any).mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      const result = await contentService.hasTranscript('meeting-123');

      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      const mockSelect = vi.mocked(supabase.from('meetings').select('*'));
      (mockSelect.single as any).mockRejectedValueOnce(new Error('Database error'));

      const result = await contentService.hasTranscript('meeting-123');

      expect(result).toBe(false);
    });
  });

  describe('formatCost', () => {
    it('formats cents to dollars correctly', () => {
      expect(contentService.formatCost(0)).toBe('$0.00');
      expect(contentService.formatCost(1)).toBe('$0.01');
      expect(contentService.formatCost(50)).toBe('$0.50');
      expect(contentService.formatCost(100)).toBe('$1.00');
      expect(contentService.formatCost(150)).toBe('$1.50');
      expect(contentService.formatCost(2599)).toBe('$25.99');
    });
  });

  // ============================================================================
  // Error Mapping Tests
  // ============================================================================

  describe('mapErrorToUserMessage', () => {
    it('maps common error codes correctly', () => {
      const testCases = [
        { status: 401, expected: 'Please log in to continue' },
        { status: 404, expected: 'Meeting not found' },
        { status: 422, expected: "This meeting doesn't have a transcript yet" },
        { status: 429, expected: 'Rate limit exceeded. Please try again later.' },
        { status: 503, expected: 'AI service temporarily unavailable. Please try again.' },
      ];

      testCases.forEach(({ status, expected }) => {
        const result = (contentService as any).mapErrorToUserMessage(status);
        expect(result).toBe(expected);
      });
    });

    it('detects transcript errors in message', () => {
      const result = (contentService as any).mapErrorToUserMessage(
        500,
        'No transcript available for this meeting'
      );
      expect(result).toContain("doesn't have a transcript");
    });

    it('detects rate limit errors in message', () => {
      const result = (contentService as any).mapErrorToUserMessage(
        500,
        'Rate limit exceeded for this resource'
      );
      expect(result).toContain('Too many requests');
    });

    it('detects timeout errors in message', () => {
      const result = (contentService as any).mapErrorToUserMessage(
        500,
        'Request timeout exceeded'
      );
      expect(result).toContain('timed out');
    });

    it('returns generic message for unknown errors', () => {
      const result = (contentService as any).mapErrorToUserMessage(500);
      expect(result).toBe('An error occurred. Please try again.');
    });
  });

  // ============================================================================
  // ContentServiceError Tests
  // ============================================================================

  describe('ContentServiceError', () => {
    it('creates error with correct properties', () => {
      const error = new ContentServiceError('Test error', 400, 'Additional details');

      expect(error.name).toBe('ContentServiceError');
      expect(error.message).toBe('Test error');
      expect(error.status).toBe(400);
      expect(error.details).toBe('Additional details');
      expect(error.stack).toBeDefined();
    });

    it('is instance of Error', () => {
      const error = new ContentServiceError('Test', 500);

      expect(error instanceof Error).toBe(true);
      expect(error instanceof ContentServiceError).toBe(true);
    });

    it('captures stack trace', () => {
      const error = new ContentServiceError('Test', 500);

      expect(error.stack).toContain('ContentServiceError');
      expect(error.stack).toContain('Test');
    });
  });
});

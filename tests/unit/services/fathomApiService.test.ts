/**
 * Unit tests for Fathom API Service
 *
 * Covers:
 * - Token management (getValidToken, refreshAccessToken)
 * - HTTP request retry logic (rate limiting, 401 auth refresh)
 * - API methods (listCalls, getCallDetails, searchCalls)
 * - Sync operations (syncAllCalls, syncSingleCall)
 * - Error handling (network errors, API errors)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase — each from() call gets its own chain via mockReturnValueOnce
vi.mock('@/lib/supabase/clientV2', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { FathomAPIService, type FathomCall } from '@/lib/services/fathomApiService';
import { supabase } from '@/lib/supabase/clientV2';

const mockedFrom = vi.mocked(supabase.from);

// Override global fetch for this test file
const mockFetch = vi.fn();
global.fetch = mockFetch;

const TEST_USER_ID = 'user-123';
const VALID_TOKEN = 'valid-access-token';
const REFRESHED_TOKEN = 'refreshed-access-token';

/** Build a chainable mock for supabase queries */
function queryChain(resolvedValue: { data: any; error: any }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.ilike = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  return chain;
}

function mockIntegration(overrides: Partial<any> = {}) {
  return {
    id: 'integration-1',
    user_id: TEST_USER_ID,
    access_token: VALID_TOKEN,
    refresh_token: 'refresh-token',
    token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1h from now
    fathom_user_id: 'fathom-user-1',
    fathom_user_email: 'user@example.com',
    is_active: true,
    ...overrides,
  };
}

function mockFathomCall(overrides: Partial<FathomCall> = {}): FathomCall {
  return {
    id: 'call-1',
    title: 'Weekly Standup',
    start_time: '2026-01-15T10:00:00Z',
    end_time: '2026-01-15T10:30:00Z',
    duration: 1800,
    host_email: 'host@company.com',
    host_name: 'John Host',
    share_url: 'https://fathom.video/share/abc',
    app_url: 'https://fathom.video/app/abc',
    recording_status: 'ready',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:30:00Z',
    ...overrides,
  };
}

/** Set up mockedFrom to return a valid integration for getValidToken */
function setupValidToken(token: string = VALID_TOKEN) {
  const integration = mockIntegration({ access_token: token });
  mockedFrom.mockReturnValueOnce(queryChain({ data: integration, error: null }) as any);
}

/**
 * Set up mocks for a full token refresh flow:
 *  1. getValidToken: expired integration
 *  2. refreshAccessToken: get refresh_token
 *  3. refreshAccessToken: update (chain, no single)
 *  4. getValidToken: fetch refreshed access_token
 */
function setupTokenRefresh() {
  const expired = mockIntegration({
    token_expires_at: new Date(Date.now() - 1000).toISOString(),
  });

  // 1. getValidToken → expired integration
  mockedFrom.mockReturnValueOnce(queryChain({ data: expired, error: null }) as any);

  // 2. refreshAccessToken → get refresh_token
  mockedFrom.mockReturnValueOnce(
    queryChain({ data: { refresh_token: 'refresh-token' }, error: null }) as any
  );

  // 3. refreshAccessToken → update (returns chain, update().eq() resolves)
  const updateChain: any = {};
  updateChain.update = vi.fn().mockReturnValue(updateChain);
  updateChain.eq = vi.fn().mockResolvedValue({ data: null, error: null });
  mockedFrom.mockReturnValueOnce(updateChain as any);

  // 4. getValidToken → refreshed token
  mockedFrom.mockReturnValueOnce(
    queryChain({ data: { access_token: REFRESHED_TOKEN }, error: null }) as any
  );

  // Mock the OAuth token endpoint
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      access_token: REFRESHED_TOKEN,
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
    }),
  });
}

/** Helper to create a successful API response mock */
function apiResponse(data: any) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    headers: new Headers(),
  };
}

describe('FathomAPIService', () => {
  let service: FathomAPIService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FathomAPIService();
  });

  // ========================================================================
  // Token Management
  // ========================================================================
  describe('Token Management', () => {
    it('should use existing token when not expired', async () => {
      setupValidToken();
      mockFetch.mockResolvedValueOnce(apiResponse({ data: [], pagination: {} }));

      await service.listCalls(TEST_USER_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/meetings'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': VALID_TOKEN,
          }),
        })
      );
    });

    it('should refresh token when expired', async () => {
      setupTokenRefresh();
      // The actual API call after token refresh
      mockFetch.mockResolvedValueOnce(apiResponse({ data: [], pagination: {} }));

      await service.listCalls(TEST_USER_ID);

      // Should have called the OAuth token endpoint for refresh
      expect(mockFetch).toHaveBeenCalledWith(
        'https://fathom.video/external/v1/oauth2/token',
        expect.objectContaining({ method: 'POST' })
      );
      // And then the actual API
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/meetings'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': REFRESHED_TOKEN,
          }),
        })
      );
    });

    it('should refresh token proactively within 5-minute buffer', async () => {
      // Token expires in 3 minutes (within 5-minute buffer)
      const soonExpiring = mockIntegration({
        token_expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      });

      // 1. getValidToken → soon-expiring integration
      mockedFrom.mockReturnValueOnce(
        queryChain({ data: soonExpiring, error: null }) as any
      );
      // 2. refreshAccessToken → get refresh_token
      mockedFrom.mockReturnValueOnce(
        queryChain({ data: { refresh_token: 'refresh-token' }, error: null }) as any
      );
      // 3. refreshAccessToken → update
      const updateChain: any = {};
      updateChain.update = vi.fn().mockReturnValue(updateChain);
      updateChain.eq = vi.fn().mockResolvedValue({ data: null, error: null });
      mockedFrom.mockReturnValueOnce(updateChain as any);
      // 4. getValidToken → refreshed token
      mockedFrom.mockReturnValueOnce(
        queryChain({ data: { access_token: REFRESHED_TOKEN }, error: null }) as any
      );

      // Token refresh fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: REFRESHED_TOKEN, expires_in: 3600 }),
      });
      // API call
      mockFetch.mockResolvedValueOnce(apiResponse({ data: [], pagination: {} }));

      await service.listCalls(TEST_USER_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://fathom.video/external/v1/oauth2/token',
        expect.anything()
      );
    });

    it('should throw when no active integration exists', async () => {
      mockedFrom.mockReturnValueOnce(
        queryChain({ data: null, error: { code: 'PGRST116' } }) as any
      );

      await expect(service.listCalls(TEST_USER_ID)).rejects.toThrow(
        'No active Fathom integration found'
      );
    });

    it('should throw when token refresh HTTP call fails', async () => {
      // refreshAccessToken: get refresh_token
      mockedFrom.mockReturnValueOnce(
        queryChain({ data: { refresh_token: 'bad-token' }, error: null }) as any
      );

      // Token refresh returns 400
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid_grant' }),
      });

      await expect(service.refreshAccessToken(TEST_USER_ID)).rejects.toThrow(
        'Failed to refresh token'
      );
    });

    it('should throw when no integration found for refresh', async () => {
      mockedFrom.mockReturnValueOnce(
        queryChain({ data: null, error: { code: 'PGRST116' } }) as any
      );

      await expect(service.refreshAccessToken(TEST_USER_ID)).rejects.toThrow(
        'No integration found to refresh'
      );
    });
  });

  // ========================================================================
  // Rate Limiting & Retry
  // ========================================================================
  describe('Rate Limiting & Retry', () => {
    it('should retry on 429 rate limit with Retry-After header', async () => {
      // First getValidToken
      setupValidToken();
      // Second getValidToken (on retry)
      setupValidToken();

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '0' }), // 0s for fast test
        })
        .mockResolvedValueOnce(apiResponse({ data: [mockFathomCall()], pagination: {} }));

      const result = await service.listCalls(TEST_USER_ID);
      expect(result.data).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 401 and refresh token', async () => {
      // First getValidToken (valid but will get 401)
      setupValidToken();

      // Token refresh flow (called after 401):
      // refreshAccessToken: get refresh_token
      mockedFrom.mockReturnValueOnce(
        queryChain({ data: { refresh_token: 'refresh-token' }, error: null }) as any
      );
      // refreshAccessToken: update
      const updateChain: any = {};
      updateChain.update = vi.fn().mockReturnValue(updateChain);
      updateChain.eq = vi.fn().mockResolvedValue({ data: null, error: null });
      mockedFrom.mockReturnValueOnce(updateChain as any);

      // Second getValidToken (on retry after refresh)
      setupValidToken(REFRESHED_TOKEN);

      mockFetch
        // First API call → 401
        .mockResolvedValueOnce({ ok: false, status: 401, headers: new Headers() })
        // Token refresh
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ access_token: REFRESHED_TOKEN, expires_in: 3600 }),
        })
        // Retry API call → success
        .mockResolvedValueOnce(apiResponse({ data: [mockFathomCall()], pagination: {} }));

      const result = await service.listCalls(TEST_USER_ID);
      expect(result.data).toHaveLength(1);
    });

    it('should handle non-retryable API errors', async () => {
      setupValidToken();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
        headers: new Headers(),
      });

      await expect(service.listCalls(TEST_USER_ID)).rejects.toThrow(
        'API request failed: 500'
      );
    });
  });

  // ========================================================================
  // API Methods
  // ========================================================================
  describe('listCalls', () => {
    it('should call /meetings endpoint', async () => {
      setupValidToken();
      const calls = [mockFathomCall(), mockFathomCall({ id: 'call-2', title: 'Demo Call' })];
      mockFetch.mockResolvedValueOnce(apiResponse({ data: calls, pagination: { next: null } }));

      const result = await service.listCalls(TEST_USER_ID);

      expect(result.data).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/meetings'),
        expect.anything()
      );
    });

    it('should pass date range params correctly', async () => {
      setupValidToken();
      mockFetch.mockResolvedValueOnce(apiResponse({ data: [], pagination: {} }));

      await service.listCalls(TEST_USER_ID, {
        start_date: '2026-01-01T00:00:00Z',
        end_date: '2026-01-31T23:59:59Z',
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('created_after=');
      expect(calledUrl).toContain('created_before=');
    });

    it('should pass host email filter', async () => {
      setupValidToken();
      mockFetch.mockResolvedValueOnce(apiResponse({ data: [], pagination: {} }));

      await service.listCalls(TEST_USER_ID, { host_email: 'host@company.com' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('recorded_by');
    });
  });

  describe('getCallDetails', () => {
    it('should fetch single call by ID', async () => {
      setupValidToken();
      const call = mockFathomCall({ id: 'call-abc' });
      mockFetch.mockResolvedValueOnce(apiResponse(call));

      const result = await service.getCallDetails(TEST_USER_ID, 'call-abc');

      expect(result.id).toBe('call-abc');
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/meetings/call-abc');
    });
  });

  describe('searchCalls', () => {
    it('should POST search query to /calls/search', async () => {
      setupValidToken();
      mockFetch.mockResolvedValueOnce(apiResponse({ data: [mockFathomCall()] }));

      const result = await service.searchCalls(TEST_USER_ID, {
        query: 'quarterly review',
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/calls/search');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ query: 'quarterly review', limit: 10 });
    });
  });

  // ========================================================================
  // Sync Operations
  // ========================================================================
  describe('syncAllCalls', () => {
    it('should paginate through all calls', async () => {
      const page1Calls = Array.from({ length: 100 }, (_, i) =>
        mockFathomCall({ id: `call-${i}` })
      );
      const page2Calls = [mockFathomCall({ id: 'call-100' })];

      // Each pagination page needs a getValidToken call
      setupValidToken(); // page 1 listCalls
      // For each of the 100 calls: getCallDetails + getCallAnalytics (2 requests each, but they share token)
      for (let i = 0; i < 100; i++) {
        setupValidToken(); // getCallDetails
        setupValidToken(); // getCallAnalytics
      }
      setupValidToken(); // page 2 listCalls
      setupValidToken(); // page 2 single call details
      setupValidToken(); // page 2 single call analytics

      let listCallsCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        if (typeof url === 'string' && url.includes('/meetings?')) {
          listCallsCount++;
          const calls = listCallsCount === 1 ? page1Calls : page2Calls;
          return apiResponse({ data: calls, pagination: {} });
        }
        return apiResponse(mockFathomCall());
      });

      const result = await service.syncAllCalls(TEST_USER_ID);

      expect(result.success).toBe(true);
      expect(result.calls_synced).toBe(101);
    });

    it('should accept date range parameter', async () => {
      setupValidToken();
      mockFetch.mockResolvedValueOnce(apiResponse({ data: [], pagination: {} }));

      const result = await service.syncAllCalls(TEST_USER_ID, {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      });

      expect(result.success).toBe(true);
      expect(result.calls_synced).toBe(0);
    });

    it('should track errors for individual call sync failures', async () => {
      const calls = [mockFathomCall({ id: 'good-call' }), mockFathomCall({ id: 'bad-call' })];

      // Token for listCalls
      setupValidToken();
      // Tokens for good-call (details + analytics)
      setupValidToken();
      setupValidToken();
      // Tokens for bad-call (details fails, analytics still attempted)
      setupValidToken();
      setupValidToken();

      mockFetch.mockImplementation(async (url: string) => {
        if (typeof url === 'string' && url.includes('/meetings?')) {
          return apiResponse({ data: calls, pagination: {} });
        }
        if (typeof url === 'string' && url.includes('/meetings/bad-call')) {
          return { ok: false, status: 404, text: async () => 'Not found', headers: new Headers() };
        }
        return apiResponse(mockFathomCall());
      });

      const result = await service.syncAllCalls(TEST_USER_ID);

      expect(result.calls_synced).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].call_id).toBe('bad-call');
    });
  });

  describe('syncSingleCall', () => {
    it('should fetch call details and analytics in parallel', async () => {
      // Two parallel requests need two tokens
      setupValidToken();
      setupValidToken();

      const call = mockFathomCall({ id: 'single-call' });
      const analytics = { call_id: 'single-call', performance_score: 85 };

      mockFetch.mockImplementation(async (url: string) => {
        if (typeof url === 'string' && url.includes('/recordings/')) {
          return apiResponse(analytics);
        }
        return apiResponse(call);
      });

      const result = await service.syncSingleCall(TEST_USER_ID, 'single-call');

      expect(result.id).toBe('single-call');
      expect(result.analytics).toEqual(analytics);
    });

    it('should succeed even when analytics are not available', async () => {
      setupValidToken();
      setupValidToken();

      const call = mockFathomCall({ id: 'no-analytics' });

      mockFetch.mockImplementation(async (url: string) => {
        if (typeof url === 'string' && url.includes('/recordings/')) {
          return { ok: false, status: 404, text: async () => 'Not found', headers: new Headers() };
        }
        return apiResponse(call);
      });

      const result = await service.syncSingleCall(TEST_USER_ID, 'no-analytics');

      expect(result.id).toBe('no-analytics');
      expect(result.analytics).toBeUndefined();
    });
  });

  // ========================================================================
  // Highlights API
  // ========================================================================
  describe('createHighlight', () => {
    it('should POST highlight data', async () => {
      setupValidToken();
      const highlight = {
        id: 'highlight-1',
        call_id: 'call-1',
        title: 'Key Objection',
        start_time: 120,
        end_time: 180,
        created_at: '2026-01-15T10:02:00Z',
        created_by: 'user-1',
        share_url: 'https://fathom.video/share/h1',
      };
      mockFetch.mockResolvedValueOnce(apiResponse(highlight));

      const result = await service.createHighlight(TEST_USER_ID, 'call-1', {
        title: 'Key Objection',
        start_time: 120,
        end_time: 180,
      });

      expect(result.id).toBe('highlight-1');
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/calls/call-1/highlights');
      expect(options.method).toBe('POST');
    });
  });

  describe('listHighlights', () => {
    it('should GET highlights for a call', async () => {
      setupValidToken();
      mockFetch.mockResolvedValueOnce(
        apiResponse({ data: [{ id: 'h1' }, { id: 'h2' }] })
      );

      const result = await service.listHighlights(TEST_USER_ID, 'call-1');
      expect(result.data).toHaveLength(2);
    });
  });
});

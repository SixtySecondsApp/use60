/**
 * RAG Client — queries the meeting-analytics V2 system (Railway pgvector)
 * for historical context across prior meeting transcripts.
 *
 * Calls the meeting-analytics edge function's /api/search endpoint, which
 * runs OpenAI text-embedding-3-small similarity search against transcript
 * segments stored in Railway PostgreSQL with pgvector.
 *
 * Auth: service_role key + X-Org-Id header (org-scoped server-to-server).
 * Circuit breaker: opens after 3 consecutive failures, auto-resets after 30s.
 * Fail-soft: missing env vars → returns empty results rather than throwing.
 */

import type { RAGQueryOptions, RAGResult } from './types.ts';

// ============================================================================
// Constants
// ============================================================================

const QUERY_TIMEOUT_MS = 10_000;
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 30_000;
const SEARCH_THRESHOLD = 0.3;   // permissive — follow-up queries benefit from broad recall
const SEARCH_LIMIT = 8;         // segments per query (6 parallel queries × 8 = 48 max)

// ============================================================================
// Circuit Breaker
// ============================================================================

type CircuitState = 'closed' | 'open';

interface CircuitBreaker {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
}

function createCircuitBreaker(): CircuitBreaker {
  return { state: 'closed', consecutiveFailures: 0, openedAt: null };
}

function recordSuccess(cb: CircuitBreaker): void {
  if (cb.consecutiveFailures > 0 || cb.state === 'open') {
    cb.consecutiveFailures = 0;
    if (cb.state === 'open') {
      cb.state = 'closed';
      cb.openedAt = null;
      console.warn('[ragClient] Circuit breaker closed — meeting-analytics recovered.');
    }
  }
}

function recordFailure(cb: CircuitBreaker): void {
  cb.consecutiveFailures += 1;
  if (cb.state === 'closed' && cb.consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    cb.state = 'open';
    cb.openedAt = Date.now();
    console.warn(
      `[ragClient] Circuit breaker opened after ${cb.consecutiveFailures} failures. ` +
        `Auto-reset in ${CIRCUIT_BREAKER_RESET_MS / 1000}s.`
    );
  }
}

function isOpen(cb: CircuitBreaker): boolean {
  if (cb.state === 'closed') return false;
  const elapsed = Date.now() - (cb.openedAt ?? 0);
  if (elapsed >= CIRCUIT_BREAKER_RESET_MS) {
    cb.state = 'closed';
    cb.consecutiveFailures = 0;
    cb.openedAt = null;
    console.warn('[ragClient] Circuit breaker auto-reset.');
    return false;
  }
  return true;
}

// ============================================================================
// Helpers
// ============================================================================

function emptyResult(queryTimeMs = 0): RAGResult {
  return { chunks: [], totalTokens: 0, queryTimeMs };
}

// ============================================================================
// RAG Client
// ============================================================================

export interface RAGClient {
  query(options: RAGQueryOptions): Promise<RAGResult>;
  batchQuery(queries: RAGQueryOptions[]): Promise<Map<string, RAGResult>>;
}

export interface CreateRAGClientOptions {
  /** Org ID — sent as X-Org-Id header to scope queries to this org's transcripts */
  orgId?: string;
}

/**
 * Factory function. Call once per edge-function invocation and reuse.
 *
 * Uses the meeting-analytics edge function (/api/search) which runs
 * pgvector similarity search on the Railway transcript database.
 * Authenticates via service_role key + X-Org-Id header.
 */
export function createRAGClient(options?: CreateRAGClientOptions): RAGClient {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.warn('[ragClient] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — queries will return empty.');
  }

  if (!options?.orgId) {
    console.warn('[ragClient] No orgId provided — queries will return empty.');
  }

  const baseUrl = SUPABASE_URL
    ? `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/meeting-analytics`
    : null;

  const cb = createCircuitBreaker();

  // ------------------------------------------------------------------
  // Execute a single /api/search query
  // ------------------------------------------------------------------

  async function executeQuery(opts: RAGQueryOptions): Promise<RAGResult> {
    if (!baseUrl || !SERVICE_ROLE_KEY || !options?.orgId) return emptyResult();
    if (isOpen(cb)) return emptyResult();

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

    try {
      const body = JSON.stringify({
        query: opts.query,
        threshold: SEARCH_THRESHOLD,
        limit: SEARCH_LIMIT,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'X-Org-Id': options.orgId,
      };

      // apikey header required by Supabase gateway
      if (ANON_KEY) headers['apikey'] = ANON_KEY;
      // x-edge-function-secret for inter-function auth fallback
      if (EDGE_FUNCTION_SECRET) headers['x-edge-function-secret'] = EDGE_FUNCTION_SECRET;

      const response = await fetch(`${baseUrl}/api/search`, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`meeting-analytics ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const queryTimeMs = Date.now() - startTime;

      // Unwrap { success: true, data: { results: [...] } }
      const results: Array<{
        segment: { text: string; transcriptId?: string };
        transcriptTitle: string | null;
        similarity: number;
      }> = data?.data?.results ?? data?.results ?? [];

      if (results.length === 0) {
        recordSuccess(cb);
        return emptyResult(queryTimeMs);
      }

      const chunks = results.map((r) => ({
        text: r.segment.text,
        source: r.transcriptTitle ?? 'Meeting transcript',
        meetingId: undefined, // Railway transcript IDs ≠ Supabase meeting IDs
        meetingDate: undefined,
        score: typeof r.similarity === 'number' ? r.similarity : parseFloat(String(r.similarity)),
      }));

      const totalTokens = Math.ceil(
        chunks.reduce((sum, c) => sum + c.text.length, 0) / 4
      );

      recordSuccess(cb);
      console.log(
        `[ragClient] query="${opts.query.slice(0, 60)}..." → ${chunks.length} chunks (${queryTimeMs}ms)`
      );

      return { chunks, totalTokens, queryTimeMs };
    } catch (err) {
      recordFailure(cb);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      console.warn(
        isTimeout
          ? `[ragClient] Query timed out after ${QUERY_TIMEOUT_MS}ms`
          : `[ragClient] Query failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return emptyResult(Date.now() - startTime);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  async function query(opts: RAGQueryOptions): Promise<RAGResult> {
    return executeQuery(opts);
  }

  async function batchQuery(queries: RAGQueryOptions[]): Promise<Map<string, RAGResult>> {
    const results = await Promise.allSettled(queries.map((q) => executeQuery(q)));
    const resultMap = new Map<string, RAGResult>();
    queries.forEach((opts, i) => {
      const settled = results[i];
      resultMap.set(opts.query, settled.status === 'fulfilled' ? settled.value : emptyResult());
    });
    return resultMap;
  }

  return { query, batchQuery };
}

/**
 * RAG Client — shared module for calling the RAG API from edge functions.
 *
 * Features:
 * - Single query with AbortController timeout (8s)
 * - Parallel batch queries via Promise.allSettled
 * - Circuit breaker: opens after 3 consecutive failures, auto-resets after 30s
 * - Fail-soft: missing env vars return empty results rather than throwing
 */

import type { RAGQueryOptions, RAGResult } from './types.ts';

// ============================================================================
// Constants
// ============================================================================

const QUERY_TIMEOUT_MS = 8_000;
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 30_000;

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
  return {
    state: 'closed',
    consecutiveFailures: 0,
    openedAt: null,
  };
}

function recordSuccess(cb: CircuitBreaker): void {
  if (cb.consecutiveFailures > 0 || cb.state === 'open') {
    cb.consecutiveFailures = 0;
    if (cb.state === 'open') {
      cb.state = 'closed';
      cb.openedAt = null;
      console.warn('[ragClient] Circuit breaker closed — RAG API recovered.');
    }
  }
}

function recordFailure(cb: CircuitBreaker): void {
  cb.consecutiveFailures += 1;
  if (
    cb.state === 'closed' &&
    cb.consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD
  ) {
    cb.state = 'open';
    cb.openedAt = Date.now();
    console.warn(
      `[ragClient] Circuit breaker opened after ${cb.consecutiveFailures} consecutive failures. ` +
        `Will auto-reset in ${CIRCUIT_BREAKER_RESET_MS / 1000}s.`
    );
  }
}

/**
 * Returns true if the circuit is open (i.e. calls should be blocked).
 * Automatically transitions back to closed if the reset window has elapsed.
 */
function isOpen(cb: CircuitBreaker): boolean {
  if (cb.state === 'closed') return false;

  const elapsed = Date.now() - (cb.openedAt ?? 0);
  if (elapsed >= CIRCUIT_BREAKER_RESET_MS) {
    cb.state = 'closed';
    cb.consecutiveFailures = 0;
    cb.openedAt = null;
    console.warn('[ragClient] Circuit breaker auto-reset — allowing RAG API calls again.');
    return false;
  }

  return true;
}

// ============================================================================
// Empty Result Helper
// ============================================================================

function emptyResult(queryTimeMs = 0): RAGResult {
  return { chunks: [], totalTokens: 0, queryTimeMs };
}

// ============================================================================
// RAG Client
// ============================================================================

interface RAGClient {
  query(options: RAGQueryOptions): Promise<RAGResult>;
  batchQuery(queries: RAGQueryOptions[]): Promise<Map<string, RAGResult>>;
}

/**
 * Factory function — call once per edge function invocation and reuse the
 * returned client. Reads RAG_API_URL and RAG_API_KEY from Deno.env at
 * creation time so the env is only accessed once.
 */
export function createRAGClient(): RAGClient {
  const RAG_API_URL = Deno.env.get('RAG_API_URL');
  const RAG_API_KEY = Deno.env.get('RAG_API_KEY');

  if (!RAG_API_URL || !RAG_API_KEY) {
    console.warn(
      '[ragClient] RAG_API_URL or RAG_API_KEY not set — all queries will return empty results.'
    );
  }

  const cb = createCircuitBreaker();

  // ------------------------------------------------------------------
  // Internal fetch helper
  // ------------------------------------------------------------------

  async function executeQuery(options: RAGQueryOptions): Promise<RAGResult> {
    // Guard: env vars not configured
    if (!RAG_API_URL || !RAG_API_KEY) {
      return emptyResult();
    }

    // Guard: circuit breaker open
    if (isOpen(cb)) {
      return emptyResult();
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

    try {
      const response = await fetch(`${RAG_API_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RAG_API_KEY}`,
        },
        body: JSON.stringify(options),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`RAG API ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        chunks: RAGResult['chunks'];
        metadata: { total_tokens: number };
      };

      const queryTimeMs = Date.now() - startTime;

      recordSuccess(cb);

      return {
        chunks: data.chunks ?? [],
        totalTokens: data.metadata?.total_tokens ?? 0,
        queryTimeMs,
      };
    } catch (err) {
      recordFailure(cb);

      const isTimeout =
        err instanceof Error && err.name === 'AbortError';
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

  /**
   * Execute a single RAG query. Always resolves — never rejects.
   * Returns an empty RAGResult on timeout, API error, or open circuit.
   */
  async function query(options: RAGQueryOptions): Promise<RAGResult> {
    return executeQuery(options);
  }

  /**
   * Execute multiple RAG queries in parallel.
   * Uses the query's `query` string as the map key.
   * Failed or timed-out queries silently produce empty results.
   */
  async function batchQuery(
    queries: RAGQueryOptions[]
  ): Promise<Map<string, RAGResult>> {
    const results = await Promise.allSettled(
      queries.map((opts) => executeQuery(opts))
    );

    const resultMap = new Map<string, RAGResult>();
    queries.forEach((opts, i) => {
      const settled = results[i];
      resultMap.set(
        opts.query,
        settled.status === 'fulfilled' ? settled.value : emptyResult()
      );
    });

    return resultMap;
  }

  return { query, batchQuery };
}

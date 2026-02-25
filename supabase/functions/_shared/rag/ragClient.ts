/**
 * RAG Client — queries the meeting intelligence system (Gemini File Search)
 * for historical context across prior meeting transcripts.
 *
 * This client calls the Gemini File Search API directly, using the org's
 * pre-built search store. It is a lightweight wrapper that:
 *
 *   1. Looks up the org's file search store name from `org_file_search_stores`
 *   2. Sends the natural-language query to Gemini 2.5 Flash with the store
 *   3. Maps grounding chunks back into RAGChunk[] format
 *
 * Circuit breaker: opens after 3 consecutive failures, auto-resets after 30s.
 * Fail-soft: missing env vars or no store → returns empty results.
 */

import type { RAGQueryOptions, RAGResult } from './types.ts';

// ============================================================================
// Constants
// ============================================================================

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
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
  return { state: 'closed', consecutiveFailures: 0, openedAt: null };
}

function recordSuccess(cb: CircuitBreaker): void {
  if (cb.consecutiveFailures > 0 || cb.state === 'open') {
    cb.consecutiveFailures = 0;
    if (cb.state === 'open') {
      cb.state = 'closed';
      cb.openedAt = null;
      console.warn('[ragClient] Circuit breaker closed — Gemini recovered.');
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

/**
 * Extract meeting ID and snippet from a Gemini grounding chunk.
 * File names follow the pattern: `meeting-{uuid}...`
 */
function parseGroundingChunk(chunk: {
  fileChunk?: { fileName?: string; content?: string };
}): { meetingId: string | undefined; text: string; source: string } {
  const fileName = chunk.fileChunk?.fileName ?? '';
  const content = chunk.fileChunk?.content ?? '';

  const meetingMatch = fileName.match(/meeting-([a-f0-9-]+)/i);

  return {
    meetingId: meetingMatch?.[1],
    text: content,
    source: fileName,
  };
}

// ============================================================================
// RAG Client
// ============================================================================

export interface RAGClient {
  query(options: RAGQueryOptions): Promise<RAGResult>;
  batchQuery(queries: RAGQueryOptions[]): Promise<Map<string, RAGResult>>;
}

interface CreateRAGClientOptions {
  /** Org ID to look up the file search store — required for queries to work */
  orgId?: string;
  /** Pre-resolved store name (skip the DB lookup) */
  storeName?: string;
  /** Supabase client for looking up the org's file search store */
  supabase?: { from: (table: string) => any };
}

/**
 * Factory function. Call once per edge-function invocation and reuse.
 *
 * Pass `orgId` + `supabase` so the client can look up the org's Gemini
 * File Search store. If the store doesn't exist, all queries return empty.
 */
export function createRAGClient(options?: CreateRAGClientOptions): RAGClient {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

  if (!GEMINI_API_KEY) {
    console.warn('[ragClient] GEMINI_API_KEY not set — all queries will return empty results.');
  }

  const cb = createCircuitBreaker();
  let resolvedStoreName: string | null = options?.storeName ?? null;
  let storeResolved = !!options?.storeName;

  // ------------------------------------------------------------------
  // Resolve the org's File Search store (once, lazily)
  // ------------------------------------------------------------------

  async function getStoreName(): Promise<string | null> {
    if (storeResolved) return resolvedStoreName;
    storeResolved = true;

    if (!options?.orgId || !options?.supabase) {
      console.warn('[ragClient] No orgId/supabase provided — cannot look up store.');
      return null;
    }

    try {
      const { data } = await options.supabase
        .from('org_file_search_stores')
        .select('store_name, status, total_files')
        .eq('org_id', options.orgId)
        .maybeSingle();

      if (!data?.store_name || data.total_files === 0) {
        console.warn('[ragClient] No file search store or no files indexed for org', options.orgId);
        return null;
      }

      resolvedStoreName = data.store_name;
      console.log(`[ragClient] Resolved store: ${resolvedStoreName} (${data.total_files} files)`);
      return resolvedStoreName;
    } catch (err) {
      console.warn('[ragClient] Failed to look up store:', (err as Error).message);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Build metadata filter from RAGQueryOptions.filters
  // ------------------------------------------------------------------

  function buildFilter(filters?: RAGQueryOptions['filters']): string | null {
    if (!filters) return null;
    const conditions: string[] = [];

    // Note: company_id metadata filtering is intentionally disabled.
    // Many meetings were indexed before company_id was set, so the Gemini
    // store documents don't have company_id in their custom metadata.
    // The org store is already scoped per-org, and the semantic queries
    // are specific enough to return relevant results without it.
    // Revisit once re-indexing with company_id metadata is triggered.

    // Note: exclude_meeting_id is handled post-search (Gemini metadata
    // filters don't support != operators). We filter out the excluded
    // meeting from grounding chunks after results come back.

    return conditions.length > 0 ? conditions.join(' AND ') : null;
  }

  // ------------------------------------------------------------------
  // Execute a single query against Gemini File Search
  // ------------------------------------------------------------------

  async function executeQuery(opts: RAGQueryOptions): Promise<RAGResult> {
    if (!GEMINI_API_KEY) return emptyResult();
    if (isOpen(cb)) return emptyResult();

    const storeName = await getStoreName();
    if (!storeName) return emptyResult();

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

    try {
      const metadataFilter = buildFilter(opts.filters);

      const requestBody: Record<string, unknown> = {
        contents: [{ parts: [{ text: opts.query }] }],
        tools: [{
          fileSearch: {
            fileSearchStoreNames: [storeName],
            ...(metadataFilter ? { metadataFilter } : {}),
          },
        }],
        systemInstruction: {
          parts: [{
            text: `You are extracting specific information from sales meeting transcripts.
Answer ONLY with facts found in the transcripts. Do not speculate.
Be concise — focus on the most relevant passages.
If you cannot find relevant information, say "No relevant information found."`,
          }],
        },
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: opts.maxTokens ?? 400,
        },
      };

      const response = await fetch(
        `${GEMINI_API_BASE}/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Gemini API ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const queryTimeMs = Date.now() - startTime;

      // Extract grounding chunks and the synthesized answer
      const groundingChunks: Array<{ fileChunk?: { fileName?: string; content?: string } }> =
        data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const answerText: string =
        data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      // Check if Gemini indicated no results
      const noResults =
        answerText.toLowerCase().includes('no relevant information found') ||
        groundingChunks.length === 0;

      if (noResults) {
        recordSuccess(cb);
        return emptyResult(queryTimeMs);
      }

      // Map grounding chunks → RAGChunk[], filtering out the excluded meeting
      const excludeMeetingId = opts.filters?.exclude_meeting_id;
      const chunks = groundingChunks
        .map((gc, idx) => {
          const parsed = parseGroundingChunk(gc);
          return {
            text: parsed.text || answerText, // Use chunk content, fall back to answer
            source: parsed.source,
            meetingId: parsed.meetingId,
            meetingDate: undefined,
            score: 1 - idx * 0.1, // Approximate score from position
          };
        })
        .filter((c) => {
          if (excludeMeetingId && c.meetingId === excludeMeetingId) return false;
          return c.text.length > 0;
        });

      // Estimate token count (~4 chars per token)
      const totalTokens = Math.ceil(
        chunks.reduce((sum, c) => sum + c.text.length, 0) / 4
      );

      recordSuccess(cb);

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

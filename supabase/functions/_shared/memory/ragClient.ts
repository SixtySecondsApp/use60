/**
 * RAGClient — server-to-server wrapper for meeting-analytics /api/search/ask.
 *
 * Wraps the meeting-analytics edge function's "Ask Anything" RAG endpoint
 * (vector search + GPT-4o-mini) for use inside other edge functions that
 * need to pull deal memory / meeting context into their prompts.
 *
 * Callers are responsible for credit tracking; this module does not touch
 * costTracking.ts.
 *
 * Features:
 *   - In-memory result cache (cache key: question + orgId)
 *   - Circuit breaker: 3 consecutive failures → 60 s cooldown, then half-open retry
 *   - Token budget helpers for prompt assembly
 */

import type { RAGResult, RAGFilters } from './types.ts';

// ---- Internal types --------------------------------------------------------

/** Body sent to meeting-analytics /api/search/ask */
interface AskRequestBody {
  question: string;
  maxMeetings?: number;
  includeDemo?: boolean;
}

/** Raw response shape from meeting-analytics /api/search/ask */
interface AskApiResponse {
  success?: boolean;
  data?: AskResponseData;
  // When not wrapped in { success, data }:
  answer?: string;
  sources?: AskSource[];
  segmentsSearched?: number;
  meetingsAnalyzed?: number;
  totalMeetings?: number;
}

interface AskResponseData {
  answer: string;
  sources: AskSource[];
  segmentsSearched: number;
  meetingsAnalyzed: number;
  totalMeetings: number;
}

interface AskSource {
  transcriptId: string;
  transcriptTitle: string;
  text: string;
  similarity: number;
  date?: string | null;
  sentiment?: string | null;
}

// ---- Constants -------------------------------------------------------------

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 60_000; // 60 seconds

// ---- RAGClient class -------------------------------------------------------

export class RAGClient {
  private baseUrl: string;
  private serviceRoleKey: string;
  private orgId: string;
  private cache: Map<string, RAGResult>;
  private failureCount: number;
  private circuitOpenUntil: number; // epoch ms — 0 means closed

  constructor(baseUrl: string, serviceRoleKey: string, orgId: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // strip trailing slash
    this.serviceRoleKey = serviceRoleKey;
    this.orgId = orgId;
    this.cache = new Map();
    this.failureCount = 0;
    this.circuitOpenUntil = 0;
  }

  // ---- Public API ----------------------------------------------------------

  /**
   * Query the meeting-analytics /api/search/ask endpoint (vector search + GPT-4o-mini).
   *
   * Respects circuit breaker and caches successful responses for the lifetime
   * of this instance (i.e. for the duration of a single edge function invocation).
   *
   * @param params.question   Natural-language question to answer from meetings.
   * @param params.filters    Optional scope filters — note: meeting-analytics ask
   *                          endpoint doesn't support contact_id/owner_user_id filters
   *                          directly; the orgId scopes all queries.
   * @param params.maxTokens  Soft token budget — not enforced here; callers should
   *                          use truncateToTokenBudget() after receiving results.
   */
  async query(params: {
    question: string;
    filters?: RAGFilters;
    maxTokens?: number;
  }): Promise<RAGResult> {
    // 1. Circuit breaker — fail fast when the downstream is unhealthy
    if (this.isCircuitOpen()) {
      console.error(
        '[RAGClient] Circuit breaker is open, returning empty result. ' +
          `Will retry after ${new Date(this.circuitOpenUntil).toISOString()}.`,
      );
      return this.emptyResult();
    }

    // 2. Cache lookup
    const cacheKey = JSON.stringify({ question: params.question, orgId: this.orgId });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 3. Build request body for meeting-analytics /api/search/ask
    const body: AskRequestBody = {
      question: params.question,
      maxMeetings: 20,
    };

    // 4. Call the edge function server-to-server
    const url = `${this.baseUrl}/functions/v1/meeting-analytics/api/search/ask`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.serviceRoleKey}`,
          'apikey': this.serviceRoleKey,
          'X-Org-Id': this.orgId,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '(unreadable body)');
        throw new Error(
          `meeting-analytics ask returned ${response.status}: ${errorText}`,
        );
      }

      const raw = await response.json() as AskApiResponse;

      // Unwrap { success, data } wrapper if present
      const askData: AskResponseData = raw.success === true && raw.data
        ? raw.data
        : {
            answer: raw.answer ?? '',
            sources: raw.sources ?? [],
            segmentsSearched: raw.segmentsSearched ?? 0,
            meetingsAnalyzed: raw.meetingsAnalyzed ?? 0,
            totalMeetings: raw.totalMeetings ?? 0,
          };

      // 5. Map to RAGResult format expected by callers
      const result: RAGResult = {
        answer: askData.answer,
        sources: askData.sources.map((s) => ({
          source_type: 'meeting' as const,
          source_id: s.transcriptId,
          title: s.transcriptTitle,
          date: s.date ?? '',
          company_name: null,
          owner_name: null,
          relevance_snippet: s.text,
          sentiment_score: null,
          speaker_name: null,
        })),
        query_metadata: {
          semantic_query: params.question,
          filters_applied: { org_id: this.orgId },
          meetings_searched: askData.meetingsAnalyzed,
          response_time_ms: 0, // Not provided by the ask endpoint
        },
      };

      // 6. Cache and reset failure count
      this.cache.set(cacheKey, result);
      this.onSuccess();

      return result;
    } catch (err) {
      // 7. Record failure, potentially open circuit
      this.onFailure(err instanceof Error ? err.message : String(err));
      return this.emptyResult();
    }
  }

  /**
   * Run multiple queries in parallel.
   * Circuit breaker state is shared; once open, all parallel queries short-circuit.
   */
  async queryBatch(
    queries: Array<{ question: string; filters?: RAGFilters }>,
  ): Promise<RAGResult[]> {
    return Promise.all(
      queries.map((q) => this.query({ question: q.question, filters: q.filters })),
    );
  }

  // ---- Static helpers ------------------------------------------------------

  /**
   * Rough token count estimate: 1 token ≈ 4 characters.
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate RAGResult answers so the total estimated token usage stays within
   * maxTokens. Sources metadata is preserved in full; only answer text is cut.
   *
   * Results are processed in order, greedily allocating budget to each answer
   * until the budget is exhausted.
   */
  static truncateToTokenBudget(results: RAGResult[], maxTokens: number): RAGResult[] {
    let remaining = maxTokens;

    return results.map((result) => {
      if (remaining <= 0) {
        return { ...result, answer: '' };
      }

      const answerTokens = RAGClient.estimateTokens(result.answer);

      if (answerTokens <= remaining) {
        remaining -= answerTokens;
        return result;
      }

      // Truncate to fit remaining budget (chars ≈ tokens × 4)
      const maxChars = remaining * 4;
      const truncated = result.answer.slice(0, maxChars) + '…';
      remaining = 0;

      return { ...result, answer: truncated };
    });
  }

  // ---- Private helpers -----------------------------------------------------

  private emptyResult(): RAGResult {
    return {
      answer: '',
      sources: [],
      query_metadata: {
        semantic_query: null,
        filters_applied: {},
        meetings_searched: 0,
        response_time_ms: 0,
      },
    };
  }

  private isCircuitOpen(): boolean {
    if (this.circuitOpenUntil === 0) return false;
    if (Date.now() >= this.circuitOpenUntil) {
      // Cooldown expired — allow a single probe through (half-open)
      this.circuitOpenUntil = 0;
      console.error('[RAGClient] Circuit breaker cooldown expired, attempting probe request.');
      return false;
    }
    return true;
  }

  private onSuccess(): void {
    if (this.failureCount > 0) {
      console.error('[RAGClient] Circuit breaker closed after successful response.');
    }
    this.failureCount = 0;
    this.circuitOpenUntil = 0;
  }

  private onFailure(message: string): void {
    this.failureCount += 1;
    console.error(
      `[RAGClient] meeting-analytics ask error (failure ${this.failureCount}/${CIRCUIT_FAILURE_THRESHOLD}): ${message}`,
    );

    if (this.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
      this.circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
      console.error(
        `[RAGClient] Circuit breaker opened. Will remain open until ${new Date(this.circuitOpenUntil).toISOString()}.`,
      );
    }
  }
}

// ---- Factory ----------------------------------------------------------------

/**
 * Create a RAGClient from Deno environment variables.
 * Requires orgId to scope queries to the correct organization.
 * Throws if required env vars are absent (fail fast at function startup).
 */
export function createRAGClient(orgId: string): RAGClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      '[RAGClient] Missing required environment variables: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  return new RAGClient(supabaseUrl, serviceRoleKey, orgId);
}

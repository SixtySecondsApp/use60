/**
 * RAG (Retrieval-Augmented Generation) System Types
 *
 * Shared types for the RAG client, query pipeline, and follow-up context
 * used across edge functions that need historical meeting/deal context.
 */

// ============================================================================
// Core RAG Types
// ============================================================================

/**
 * A single retrieved chunk from the RAG API.
 * Represents a passage of text from a source document (e.g. meeting transcript).
 */
export interface RAGChunk {
  /** The retrieved text passage */
  text: string;
  /** Source identifier — e.g. meeting title, document name, or URL */
  source: string;
  /** ID of the meeting this chunk belongs to, if applicable */
  meetingId?: string;
  /** ISO date string of the meeting this chunk was extracted from */
  meetingDate?: string;
  /** Similarity/relevance score — higher is more relevant (0-1 range) */
  score: number;
}

/**
 * The full result returned by a single RAG query.
 */
export interface RAGResult {
  /** Ordered list of retrieved chunks, most relevant first */
  chunks: RAGChunk[];
  /** Estimated total token count across all chunks */
  totalTokens: number;
  /** Wall-clock time in milliseconds the query took to complete */
  queryTimeMs: number;
}

// ============================================================================
// Query Options
// ============================================================================

/**
 * Options for a single RAG query.
 */
export interface RAGQueryOptions {
  /** The natural language query to retrieve context for */
  query: string;
  /** Optional filters to scope the retrieval */
  filters?: {
    /** Restrict results to chunks associated with this deal */
    deal_id?: string;
    /** Restrict results to chunks associated with this company */
    company_id?: string;
    /** Restrict results to chunks associated with any of these contacts */
    contact_ids?: string[];
    /** Exclude chunks from this specific meeting (e.g. current meeting being processed) */
    exclude_meeting_id?: string;
  };
  /** Maximum token budget for this query's results */
  maxTokens?: number;
}

// ============================================================================
// Follow-Up Types
// ============================================================================

/**
 * A single RAG sub-query used when assembling follow-up context.
 * Multiple FollowUpRAGQuerys are batched together via batchQuery().
 */
export interface FollowUpRAGQuery {
  /** Unique identifier for this sub-query, used as the map key in results */
  id: string;
  /** The natural language query string */
  query: string;
  /** Human-readable description of what this sub-query is retrieving */
  purpose: string;
  /** Whether this sub-query is mandatory for a usable follow-up */
  priority: 'required' | 'nice_to_have';
  /** Token budget allocated to this sub-query */
  maxTokens: number;
}

/**
 * Assembled context object passed to follow-up generation.
 * Built from a batch of RAG queries against prior meeting history.
 */
export interface FollowUpContext {
  /** True if any historical meeting data was found for this deal/contact */
  hasHistory: boolean;
  /**
   * The sequential meeting number for this contact/deal
   * (e.g. 3 means this is the third meeting)
   */
  meetingNumber: number;
  /**
   * Map of section name → RAGResult, keyed by FollowUpRAGQuery.id.
   * Used to populate distinct sections of the follow-up (commitments, next steps, etc.)
   */
  sections: Record<string, RAGResult>;
  /**
   * Remaining query credits after the batch ran.
   * Decremented per executed sub-query; nice_to_have queries are skipped at 0.
   */
  queryCredits: number;
}

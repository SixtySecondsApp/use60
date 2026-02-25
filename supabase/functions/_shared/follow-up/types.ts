/**
 * Follow-Up Module Types — FU-003
 *
 * Shared interfaces used across follow-up generation modules.
 * RAGResult and FollowUpContext are re-exported from the shared RAG types
 * so callers only need one import path.
 */

import type { RAGResult, FollowUpContext } from '../rag/types.ts';
export type { RAGResult, FollowUpContext };

// ============================================================================
// Email Composition
// ============================================================================

/**
 * A fully composed follow-up email ready to send or display to the user.
 */
export interface ComposedEmail {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** Plain-text email body */
  body: string;
  /** Approximate word count of the body */
  wordCount: number;
}

// ============================================================================
// Generation Result
// ============================================================================

/**
 * The full result returned after a follow-up generation run.
 * Contains the composed email, an optional comparison variant, a summary of
 * context sources used, and runtime metadata for observability.
 */
export interface FollowUpGenerationResult {
  /** The primary composed email (written with full historical context) */
  email: ComposedEmail;
  /**
   * Optional variant composed without prior meeting history.
   * Surfaced in the UI as a comparison to show the value of RAG context.
   */
  emailWithoutHistory?: ComposedEmail;
  /** Breakdown of which context sources were available and used */
  contextUsed: {
    /** True if the current meeting's transcript was included */
    transcript: boolean;
    /** Number of prior meetings that contributed RAG chunks */
    priorMeetings: number;
    /** Number of commitment chunks retrieved from prior meetings */
    commitmentsFound: number;
    /** Number of concern/objection chunks retrieved from prior meetings */
    concernsFound: number;
    /** True if commercial context (pricing/budget) was found and included */
    commercialSignals: boolean;
    /** True if stakeholder context (attendee changes) was found and included */
    stakeholderChanges: boolean;
    /** True if the rep's writing style sample was applied to the generation */
    writingStyle: boolean;
  };
  /** Runtime and billing metadata for logging and observability */
  metadata: {
    /** Sequential meeting number for this contact/deal (1 = first meeting) */
    meetingNumber: number;
    /** Total number of RAG sub-queries that were executed */
    ragQueriesRun: number;
    /** Number of sub-queries that returned at least one chunk */
    ragQueriesReturned: number;
    /** Estimated credits consumed by the RAG queries (0.08 per returning query) */
    creditsConsumed: number;
    /** Wall-clock milliseconds from start to completed email */
    generationTimeMs: number;
    /** LLM model identifier used for generation (e.g. "gpt-4o") */
    modelUsed: string;
  };
}

// ============================================================================
// Streaming / Progress
// ============================================================================

/**
 * Represents a single step in the follow-up generation pipeline.
 * Used to drive a real-time progress UI while the edge function is running.
 */
export interface GenerationStep {
  /** Unique step identifier (e.g. "rag_queries", "compose_email") */
  id: string;
  /** Human-readable label shown in the UI */
  label: string;
  /** Current execution state of this step */
  status: 'pending' | 'running' | 'complete' | 'skipped' | 'failed';
  /** Unix timestamp (ms) when the step started, if it has started */
  startedAt?: number;
  /** Unix timestamp (ms) when the step completed, if it has completed */
  completedAt?: number;
  /** Computed duration in milliseconds (completedAt - startedAt) */
  durationMs?: number;
  /** Optional human-readable detail string (e.g. "4 of 6 queries returned results") */
  detail?: string;
}

/**
 * RAG query definitions and parallel execution for the meeting prep system.
 *
 * Defines the 8 targeted queries used for return meetings and provides
 * getHistoricalContext() which fires them all in parallel via RAGClient,
 * scoped to the deal's primary contact and owner.
 *
 * Note: deal_id is not a supported RAG filter (it's skipped in the
 * RAGClient mapping). We scope queries using contact_id and owner_user_id
 * instead.
 */

import { RAGClient, createRAGClient } from '../memory/ragClient.ts';
import type { RAGResult, RAGFilters } from '../memory/types.ts';
import type { PrepRAGQuery, HistoricalContext } from './types.ts';

// ---- Timeout constants -------------------------------------------------------

const INDIVIDUAL_QUERY_TIMEOUT_MS = 15_000;
const OVERALL_RAG_TIMEOUT_MS = 25_000;

// Maximum external attendees scoped into RAG queries to avoid over-broad results
const MAX_ATTENDEES_FOR_RAG = 8;

// ---- Query definitions ------------------------------------------------------

// 8 targeted queries for return meetings. Order reflects priority — required
// queries are listed first so callers can bail early if credits are tight.
const RETURN_MEETING_QUERIES: PrepRAGQuery[] = [
  {
    id: 'conversation_summary',
    query:
      'Summarise what has been discussed across all previous meetings with this company. Focus on key decisions, concerns raised, and where things stand.',
    purpose: 'Deal narrative section',
    priority: 'required',
    maxTokens: 800,
  },
  {
    id: 'commitments',
    query:
      'What specific commitments or promises were made by either side? Include deadlines if mentioned.',
    purpose: 'Open items and accountability section',
    priority: 'required',
    maxTokens: 400,
  },
  {
    id: 'objections_concerns',
    query:
      'What objections, concerns, or hesitations has the prospect raised? How were they addressed?',
    purpose: 'Landmines to navigate section',
    priority: 'required',
    maxTokens: 400,
  },
  {
    id: 'prospect_priorities',
    query:
      'What does the prospect care most about? What are their stated priorities, pain points, and success criteria?',
    purpose: 'What matters to them section',
    priority: 'required',
    maxTokens: 400,
  },
  {
    id: 'stakeholder_dynamics',
    query:
      'Who has been involved in meetings? What roles do different stakeholders play? Who seems to be the champion vs the decision maker?',
    purpose: 'Stakeholder map section',
    priority: 'required',
    maxTokens: 400,
  },
  {
    id: 'last_meeting_detail',
    query:
      'What happened in the most recent meeting? What were the key takeaways and agreed next steps?',
    purpose: 'Last time recap section',
    priority: 'required',
    maxTokens: 500,
  },
  {
    id: 'competitor_mentions',
    query:
      'Have any competitors or alternative solutions been mentioned? In what context?',
    purpose: 'Competitive landscape section',
    priority: 'nice_to_have',
    maxTokens: 300,
  },
  {
    id: 'commercial_signals',
    query:
      'Has budget, pricing, deal value, or timeline been discussed? Any specifics mentioned?',
    purpose: 'Commercial context section',
    priority: 'nice_to_have',
    maxTokens: 300,
  },
];

export { RETURN_MEETING_QUERIES };

// ---- Timeout helpers ---------------------------------------------------------

/**
 * Wrap a single RAG query with an individual timeout.
 * Rejects with an AbortError if the query takes longer than `timeoutMs`.
 */
async function queryWithTimeout(
  ragClient: RAGClient,
  question: string,
  filters: RAGFilters,
  maxTokens: number,
  timeoutMs: number,
): Promise<RAGResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`RAG query timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      ragClient.query({ question, filters, maxTokens }),
      timeoutPromise,
    ]);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Parallel execution ------------------------------------------------------

/**
 * Fire all 8 RAG queries in parallel for a return meeting, scoped to
 * the deal's contacts. Returns a HistoricalContext with results mapped
 * by query ID.
 *
 * Since deal_id is not supported as a RAG filter, we scope queries
 * using contact_id (primary contact) and owner_user_id.
 *
 * Each individual query is capped at INDIVIDUAL_QUERY_TIMEOUT_MS (15s).
 * The entire call is capped at OVERALL_RAG_TIMEOUT_MS (25s) via
 * Promise.race — if it fires, a minimal empty context is returned so
 * downstream briefing generation can still proceed.
 *
 * @param contactId          Primary contact ID for the deal — used to scope
 *                           RAG results to relevant conversations. May be null
 *                           if no primary contact is known; queries still run
 *                           but results will be broader.
 * @param ownerUserId        The rep's user ID — used to further scope results.
 *                           May be null to search across the whole org.
 * @param ragClient          Pre-constructed RAGClient instance. Callers should
 *                           create this once via createRAGClient() and reuse it
 *                           so the circuit breaker and cache are shared.
 * @param attendeeEmails     Optional list of external attendee emails. If more
 *                           than MAX_ATTENDEES_FOR_RAG (8) are provided, only
 *                           the first 8 are used to keep query scope tight.
 */
export async function getHistoricalContext(
  contactId: string | null,
  ownerUserId: string | null,
  ragClient: RAGClient,
  attendeeEmails?: string[],
): Promise<HistoricalContext> {
  // Enforce attendee cap — clamp to first MAX_ATTENDEES_FOR_RAG entries
  const scopedAttendees = attendeeEmails && attendeeEmails.length > MAX_ATTENDEES_FOR_RAG
    ? attendeeEmails.slice(0, MAX_ATTENDEES_FOR_RAG)
    : (attendeeEmails ?? []);

  if (attendeeEmails && attendeeEmails.length > MAX_ATTENDEES_FOR_RAG) {
    console.error(
      `[ragQueries] Attendee list capped from ${attendeeEmails.length} to ${MAX_ATTENDEES_FOR_RAG} for RAG query scope`,
    );
  }

  // Suppress unused-variable warning — scopedAttendees is available for future
  // per-attendee scoping when RAGFilters supports it.
  void scopedAttendees;

  // Build filters — use contact_id to scope to relevant conversations.
  // owner_user_id: null is meaningful ("all team") so we only set it when
  // explicitly provided as a non-null string.
  const filters: RAGFilters = {};
  if (contactId) {
    filters.contact_id = contactId;
  }
  if (ownerUserId !== null && ownerUserId !== undefined) {
    filters.owner_user_id = ownerUserId;
  }

  // Inner logic extracted so we can race it against the overall timeout
  async function runQueries(): Promise<HistoricalContext> {
    // Run all RAG queries in parallel. We use Promise.allSettled so a failure
    // in one query never prevents the rest from completing.
    // Each query is individually wrapped with INDIVIDUAL_QUERY_TIMEOUT_MS.
    const settled = await Promise.allSettled(
      RETURN_MEETING_QUERIES.map(async (q) => {
        const result = await queryWithTimeout(
          ragClient,
          q.query,
          filters,
          q.maxTokens,
          INDIVIDUAL_QUERY_TIMEOUT_MS,
        );
        return { id: q.id, result, priority: q.priority };
      }),
    );

    // Collect successful results and track failures separately so the caller
    // can decide whether to degrade gracefully or surface a warning.
    const sections: Record<string, RAGResult> = {};
    const failedQueries: string[] = [];

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled' && outcome.value.result.answer.trim()) {
        sections[outcome.value.id] = outcome.value.result;
      } else {
        // Determine the query ID even for rejected promises if possible.
        const id =
          outcome.status === 'fulfilled' ? outcome.value.id : 'unknown';
        failedQueries.push(id);
        console.error(
          `[ragQueries] Query '${id}' returned no results or failed`,
          outcome.status === 'rejected' ? outcome.reason : undefined,
        );
      }
    }

    return {
      hasHistory: Object.keys(sections).length > 0,
      meetingCount: 0, // Caller should set this from historyDetector
      sections,
      queryCredits: RETURN_MEETING_QUERIES.length, // 1 credit per query
      failedQueries,
    };
  }

  // Race the entire query phase against the overall timeout.
  // If the timeout fires we return a safe empty context so the briefing
  // can still be generated (without historical data).
  const overallTimeoutPromise = new Promise<HistoricalContext>((_, reject) => {
    setTimeout(
      () => reject(new Error('RAG query phase timed out')),
      OVERALL_RAG_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([runQueries(), overallTimeoutPromise]);
  } catch (err) {
    console.error('[ragQueries] Overall timeout exceeded, returning partial results:', err);
    return {
      hasHistory: false,
      meetingCount: 0,
      sections: {},
      queryCredits: 0,
      failedQueries: ['timeout'],
    };
  }
}

// Re-export createRAGClient for callers that want to construct the client
// from this module rather than importing ragClient.ts directly.
export { RAGClient, createRAGClient };

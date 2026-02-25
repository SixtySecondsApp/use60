/**
 * Follow-Up RAG Queries — FU-003
 *
 * Defines the 6 follow-up-specific RAG sub-queries (PRD §3.1) and the
 * `getFollowUpContext` function that executes them in parallel and assembles
 * the resulting FollowUpContext for use in email generation.
 *
 * Design notes:
 *   - All 6 queries run via Promise.allSettled — a single slow/failing query
 *     never blocks the others.
 *   - Filters are built dynamically: only non-null/non-empty values are included
 *     so the RAG API receives only meaningful constraints.
 *   - Sections with zero chunks are excluded from the returned context to keep
 *     the LLM prompt lean.
 *   - queryCredits is a rough billing estimate: 0.08 credits per query that
 *     actually returned results.
 */

import type { FollowUpRAGQuery, FollowUpContext, RAGResult } from '../rag/types.ts';

// ============================================================================
// Query Definitions
// ============================================================================

/**
 * The 6 follow-up RAG sub-queries executed before email generation.
 * Ordered by priority: required queries first, nice_to_have second.
 */
export const FOLLOWUP_RAG_QUERIES: FollowUpRAGQuery[] = [
  {
    id: 'prior_commitments',
    query:
      'What specific promises or commitments were made by the rep in previous meetings? Include any deadlines mentioned.',
    purpose: 'Accountability — acknowledge what was promised and whether it was delivered',
    priority: 'required',
    maxTokens: 400,
  },
  {
    id: 'prospect_concerns',
    query:
      'What concerns, objections, or hesitations has the prospect raised across all previous meetings? What specifically worried them?',
    purpose: 'Show awareness of their concerns even if not raised today',
    priority: 'required',
    maxTokens: 400,
  },
  {
    id: 'their_words',
    query:
      'What specific phrases, priorities, or goals has the prospect described in their own words across previous meetings?',
    purpose: 'Mirror their language back — makes the email feel personal',
    priority: 'required',
    maxTokens: 400,
  },
  {
    id: 'deal_trajectory',
    query:
      "How has the conversation progressed across meetings? What has changed — new stakeholders, evolving requirements, shifting timelines?",
    purpose: "Contextualise today's meeting within the bigger arc",
    priority: 'required',
    maxTokens: 400,
  },
  {
    id: 'commercial_history',
    query:
      'Has budget, pricing, deal size, or commercial terms been discussed in previous meetings? What specifics were mentioned?',
    purpose: 'Reference commercial context without being pushy',
    priority: 'nice_to_have',
    maxTokens: 300,
  },
  {
    id: 'stakeholder_context',
    query:
      'Who has attended previous meetings and what were their specific concerns or interests? Has anyone stopped attending?',
    purpose: 'Reference other stakeholders naturally, flag absences',
    priority: 'nice_to_have',
    maxTokens: 300,
  },
];

// ============================================================================
// Context Builder
// ============================================================================

/**
 * Execute all follow-up RAG queries and assemble a FollowUpContext.
 * Uses Promise.allSettled for parallel execution — individual query failures
 * produce empty RAGResults rather than aborting the batch.
 *
 * @param dealId            - Deal UUID used as a RAG filter (pass null to omit)
 * @param contactIds        - Contact UUIDs used as a RAG filter (pass [] to omit)
 * @param currentMeetingId  - Meeting UUID excluded from RAG results
 * @param meetingNumber     - Sequential position of this meeting (1 = first)
 * @param ragClient         - Shared RAG client instance from createRAGClient()
 * @returns                 - Assembled FollowUpContext; never throws
 */
export async function getFollowUpContext(
  dealId: string | null,
  contactIds: string[],
  currentMeetingId: string,
  meetingNumber: number,
  ragClient: { query: (options: { query: string; filters?: Record<string, unknown>; maxTokens?: number }) => Promise<RAGResult> },
): Promise<FollowUpContext> {
  // ------------------------------------------------------------------
  // Build shared filters — only include non-null / non-empty values
  // ------------------------------------------------------------------

  const filters: Record<string, unknown> = {
    exclude_meeting_id: currentMeetingId,
  };

  if (dealId) {
    filters['deal_id'] = dealId;
  }

  if (contactIds.length > 0) {
    filters['contact_ids'] = contactIds;
  }

  // ------------------------------------------------------------------
  // Execute all queries in parallel
  // ------------------------------------------------------------------

  const settled = await Promise.allSettled(
    FOLLOWUP_RAG_QUERIES.map((q) =>
      ragClient.query({
        query: q.query,
        filters,
        maxTokens: q.maxTokens,
      })
    )
  );

  // ------------------------------------------------------------------
  // Assemble sections — skip queries that returned no chunks
  // ------------------------------------------------------------------

  const sections: Record<string, RAGResult> = {};
  let ragQueriesReturned = 0;

  FOLLOWUP_RAG_QUERIES.forEach((q, i) => {
    const result = settled[i];

    if (result.status === 'rejected') {
      // Promise.allSettled means this shouldn't happen (ragClient.query never
      // rejects), but handle defensively.
      console.warn(`[ragQueries] query "${q.id}" rejected unexpectedly:`, result.reason);
      return;
    }

    const ragResult = result.value;

    if (ragResult.chunks.length > 0) {
      sections[q.id] = ragResult;
      ragQueriesReturned += 1;
    }
  });

  // ------------------------------------------------------------------
  // Calculate credits: 0.08 per query that returned results
  // ------------------------------------------------------------------

  const queryCredits = parseFloat((ragQueriesReturned * 0.08).toFixed(4));
  const hasHistory = Object.keys(sections).length > 0;

  console.log(
    `[ragQueries] meetingId=${currentMeetingId} meetingNumber=${meetingNumber} ` +
      `queriesRun=${FOLLOWUP_RAG_QUERIES.length} queriesReturned=${ragQueriesReturned} ` +
      `hasHistory=${hasHistory} credits=${queryCredits}`
  );

  return {
    hasHistory,
    meetingNumber,
    sections,
    queryCredits,
  };
}

/**
 * Command Centre Confidence Scorer
 *
 * Calculates a composite confidence score (0.0-1.0) for a drafted action
 * using 5 independent factors.
 *
 * Factor breakdown:
 *   data_completeness  0.00-0.30  — how many enrichment sources populated vs expected
 *   pattern_match      0.00-0.30  — item_type / action_type alignment heuristic
 *   template_confidence 0.00-0.20  — structured fields score higher than free-form
 *   recency            0.00-0.10  — enrichment data freshness
 *   trust_history      0.00-0.10  — placeholder (default 0.05, will read action_trust_scores in CC11)
 *
 * Story: CC10-005
 */

import type { CommandCentreItem, DraftedAction } from './types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfidenceResult {
  score: number;
  factors: {
    data_completeness: number;
    pattern_match: number;
    template_confidence: number;
    recency: number;
    trust_history: number;
  };
}

// ---------------------------------------------------------------------------
// Factor: data_completeness (0.0 – 0.30)
// ---------------------------------------------------------------------------

/**
 * Counts how many of the expected enrichment loader outputs are non-empty
 * in the enrichment_context, relative to the ideal for this item_type.
 */
function scoreDataCompleteness(
  item: CommandCentreItem,
  enrichmentContext: Record<string, unknown>,
): number {
  const MAX = 0.30;

  // Loaders that would ideally be populated per item type
  const expectedSourcesMap: Record<string, string[]> = {
    follow_up: ['crm', 'email', 'transcript', 'calendar'],
    outreach: ['crm', 'email', 'history'],
    crm_update: ['crm', 'history'],
    deal_action: ['crm', 'pipeline', 'history'],
    review: ['crm', 'transcript'],
    meeting_prep: ['crm', 'calendar', 'transcript'],
    coaching: ['crm', 'transcript'],
    alert: ['crm', 'history'],
    insight: ['crm', 'pipeline', 'history'],
  };

  const expected = expectedSourcesMap[item.item_type] ?? ['crm', 'history'];
  const populated = expected.filter((source) => {
    const val = enrichmentContext[source];
    if (!val) return false;
    if (typeof val === 'object' && val !== null && Object.keys(val as Record<string, unknown>).length === 0) return false;
    if (Array.isArray(val) && (val as unknown[]).length === 0) return false;
    return true;
  });

  const ratio = expected.length > 0 ? populated.length / expected.length : 0;
  const score = Math.round(MAX * ratio * 100) / 100;

  console.log('[cc-confidence] data_completeness', {
    item_id: item.id,
    item_type: item.item_type,
    expected: expected.length,
    populated: populated.length,
    score,
  });

  return score;
}

// ---------------------------------------------------------------------------
// Factor: pattern_match (0.0 – 0.30)
// ---------------------------------------------------------------------------

/**
 * Heuristic: does the action_type align with the item_type in a way we expect?
 * Templated (non-custom) action types that make obvious sense score higher.
 */
const PATTERN_SCORE_MAP: Record<string, Record<string, number>> = {
  follow_up: {
    send_email: 1.0,
    create_task: 0.7,
    schedule_meeting: 0.5,
    update_crm: 0.3,
  },
  outreach: {
    send_email: 1.0,
    schedule_meeting: 0.6,
    create_task: 0.4,
    update_crm: 0.2,
  },
  crm_update: {
    update_crm: 1.0,
    create_task: 0.5,
    send_email: 0.3,
    schedule_meeting: 0.2,
  },
  deal_action: {
    update_crm: 0.9,
    send_email: 0.8,
    schedule_meeting: 0.7,
    create_task: 0.6,
  },
  review: {
    create_task: 0.9,
    update_crm: 0.7,
    send_email: 0.5,
    schedule_meeting: 0.3,
  },
  meeting_prep: {
    schedule_meeting: 1.0,
    send_email: 0.6,
    create_task: 0.5,
    update_crm: 0.3,
  },
  coaching: {
    create_task: 0.9,
    send_email: 0.5,
    update_crm: 0.3,
    schedule_meeting: 0.3,
  },
  alert: {
    create_task: 0.8,
    update_crm: 0.7,
    send_email: 0.5,
    schedule_meeting: 0.3,
  },
  insight: {
    update_crm: 0.8,
    create_task: 0.7,
    send_email: 0.5,
    schedule_meeting: 0.4,
  },
};

function scorePatternMatch(item: CommandCentreItem, draftedAction: DraftedAction): number {
  const MAX = 0.30;

  const typeMap = PATTERN_SCORE_MAP[item.item_type] ?? {};
  const alignment = typeMap[draftedAction.type] ?? 0.4; // unknown → moderate default
  const score = Math.round(MAX * alignment * 100) / 100;

  console.log('[cc-confidence] pattern_match', {
    item_id: item.id,
    item_type: item.item_type,
    action_type: draftedAction.type,
    alignment,
    score,
  });

  return score;
}

// ---------------------------------------------------------------------------
// Factor: template_confidence (0.0 – 0.20)
// ---------------------------------------------------------------------------

/**
 * Structured payload fields (subject, body, field_updates, suggested_times)
 * contribute more confidence than free-form text or empty payloads.
 */
function scoreTemplateConfidence(draftedAction: DraftedAction): number {
  const MAX = 0.20;
  const payload = draftedAction.payload;

  let structuredFieldCount = 0;
  let totalRelevantFields = 0;

  if (draftedAction.type === 'send_email') {
    totalRelevantFields = 3; // to, subject, body
    if (payload.to && typeof payload.to === 'string' && payload.to.includes('@')) structuredFieldCount++;
    if (payload.subject && typeof payload.subject === 'string' && payload.subject.length > 5) structuredFieldCount++;
    if (payload.body && typeof payload.body === 'string' && payload.body.length > 20) structuredFieldCount++;
  } else if (draftedAction.type === 'update_crm') {
    totalRelevantFields = 2; // entity, field_updates
    if (payload.entity && typeof payload.entity === 'string') structuredFieldCount++;
    if (payload.field_updates && typeof payload.field_updates === 'object' && Object.keys(payload.field_updates).length > 0) structuredFieldCount++;
  } else if (draftedAction.type === 'schedule_meeting') {
    totalRelevantFields = 2; // suggested_times, duration_minutes
    if (payload.suggested_times && Array.isArray(payload.suggested_times) && payload.suggested_times.length > 0) structuredFieldCount++;
    if (typeof payload.duration_minutes === 'number' && payload.duration_minutes > 0) structuredFieldCount++;
  } else if (draftedAction.type === 'create_task') {
    totalRelevantFields = 1; // body (task description)
    if (payload.body && typeof payload.body === 'string' && payload.body.length > 10) structuredFieldCount++;
  }

  // editable_fields list adds confidence — rep knows what to review
  const editableBonus = draftedAction.editable_fields.length > 0 ? 0.1 : 0;

  const ratio = totalRelevantFields > 0 ? structuredFieldCount / totalRelevantFields : 0;
  const score = Math.min(MAX, Math.round((MAX * (ratio * 0.9 + editableBonus)) * 100) / 100);

  console.log('[cc-confidence] template_confidence', {
    action_type: draftedAction.type,
    structured: structuredFieldCount,
    total: totalRelevantFields,
    score,
  });

  return score;
}

// ---------------------------------------------------------------------------
// Factor: recency (0.0 – 0.10)
// ---------------------------------------------------------------------------

/**
 * Checks enrichment_context for any timestamp fields to infer data freshness.
 * Returns max score if data appears recent (within 7 days), scales linearly
 * down to 0 at 30+ days.
 */
function scoreRecency(enrichmentContext: Record<string, unknown>): number {
  const MAX = 0.10;
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  // Walk top-level source objects looking for timestamp hints
  const timestamps: number[] = [];

  for (const value of Object.values(enrichmentContext)) {
    if (!value || typeof value !== 'object') continue;

    const obj = value as Record<string, unknown>;

    // Common timestamp field names
    for (const field of ['fetched_at', 'created_at', 'updated_at', 'last_activity_at', 'date']) {
      const ts = obj[field];
      if (typeof ts === 'string') {
        const ms = new Date(ts).getTime();
        if (!isNaN(ms)) timestamps.push(ms);
      }
    }
  }

  if (timestamps.length === 0) {
    // No timestamps found — moderate default
    return 0.05;
  }

  // Use the most recent timestamp
  const mostRecent = Math.max(...timestamps);
  const ageMs = now - mostRecent;

  if (ageMs <= 0) return MAX;
  if (ageMs >= THIRTY_DAYS_MS) return 0;

  const ratio = 1 - ageMs / THIRTY_DAYS_MS;
  // Bonus: if within 7 days, give full score
  const adjusted = ageMs <= SEVEN_DAYS_MS ? 1.0 : ratio;
  const score = Math.round(MAX * adjusted * 100) / 100;

  console.log('[cc-confidence] recency', {
    age_days: Math.round(ageMs / (24 * 60 * 60 * 1000)),
    score,
  });

  return score;
}

// ---------------------------------------------------------------------------
// Factor: trust_history (0.0 – 0.10)
// ---------------------------------------------------------------------------

/**
 * Placeholder. Will be wired to action_trust_scores table in CC11.
 * Returns a conservative default of 0.05 (neutral).
 */
function scoreTrustHistory(
  _item: CommandCentreItem,
  _draftedAction: DraftedAction,
): number {
  // TODO CC11: query action_trust_scores table for source_agent + action_type
  return 0.05;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Calculates a composite confidence score for a drafted action.
 *
 * Returns both the aggregate score (0.0-1.0) and the per-factor breakdown
 * for persistence in confidence_factors.
 */
export function calculateConfidence(
  item: CommandCentreItem,
  draftedAction: DraftedAction,
  enrichmentContext: Record<string, unknown>,
): ConfidenceResult {
  const data_completeness = scoreDataCompleteness(item, enrichmentContext);
  const pattern_match = scorePatternMatch(item, draftedAction);
  const template_confidence = scoreTemplateConfidence(draftedAction);
  const recency = scoreRecency(enrichmentContext);
  const trust_history = scoreTrustHistory(item, draftedAction);

  const score = Math.min(
    1.0,
    Math.round((data_completeness + pattern_match + template_confidence + recency + trust_history) * 100) / 100,
  );

  const factors = {
    data_completeness,
    pattern_match,
    template_confidence,
    recency,
    trust_history,
  };

  console.log('[cc-confidence] final score', {
    item_id: item.id,
    item_type: item.item_type,
    action_type: draftedAction.type,
    score,
    factors,
  });

  return { score, factors };
}

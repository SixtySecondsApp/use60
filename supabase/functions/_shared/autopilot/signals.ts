/**
 * Autopilot Signals — AP-004
 *
 * Core signal recording module for the Autopilot Engine.
 * Captures approval/rejection/undo events from the HITL lifecycle and
 * stores them in `autopilot_signals` for confidence score calculation
 * and autonomy tier promotion/demotion decisions.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

// =============================================================================
// Types
// =============================================================================

/**
 * The outcome signal from a single HITL interaction or autonomous execution.
 *
 * - `approved`        — Rep approved the proposal without edits (strong positive)
 * - `approved_edited` — Rep approved but modified the proposal first (weak positive)
 * - `rejected`        — Rep explicitly rejected the proposal (strong negative)
 * - `expired`         — Proposal timed out without a response (weak negative)
 * - `undone`          — Rep approved then reversed within the undo window (strong negative)
 * - `auto_executed`   — Action executed autonomously, no approval required (weak positive)
 * - `auto_undone`     — Autonomous action was reversed by the rep (very strong negative)
 */
export type ApprovalSignal =
  | 'approved'
  | 'approved_edited'
  | 'rejected'
  | 'expired'
  | 'undone'
  | 'auto_executed'
  | 'auto_undone'

// =============================================================================
// Constants
// =============================================================================

/**
 * Weight applied to each signal when calculating or adjusting confidence scores.
 * Positive values increase confidence; negative values decrease it.
 *
 * Weights are deliberately asymmetric — negative signals (especially `undone`
 * and `auto_undone`) carry more weight than positive ones to keep the system
 * conservative by default.
 */
export const SIGNAL_WEIGHTS: Record<ApprovalSignal, number> = {
  approved:        +1.0,
  approved_edited: +0.3,
  rejected:        -1.0,
  expired:         -0.2,
  undone:          -2.0,
  auto_executed:   +0.1,
  auto_undone:     -3.0,
}

/**
 * Default minimum time-to-respond (ms) below which an approval is considered
 * a rubber stamp — i.e. the rep approved without meaningfully reviewing the
 * proposal.
 *
 * 2 seconds: a human cannot meaningfully read and evaluate a proposal in
 * under 2 seconds, so any approval faster than this is assumed to be a
 * click-through rather than a genuine review.
 *
 * @deprecated Prefer `RUBBER_STAMP_THRESHOLDS` for action-type-specific
 *   thresholds. This constant is retained for backward compatibility.
 */
export const RUBBER_STAMP_THRESHOLD_MS = 2000

/**
 * Action-type-specific rubber-stamp thresholds (milliseconds).
 *
 * Some actions are genuinely quick to review (a simple activity log entry),
 * while others require careful reading before approval (sending an email or
 * kicking off a sequence). Using per-action thresholds avoids both false
 * positives (flagging legitimately fast approvals as rubber stamps) and false
 * negatives (not catching hasty approvals on high-stakes actions).
 *
 * If an action_type is not listed here the `DEFAULT_RUBBER_STAMP_MS` fallback
 * is used.
 */
export const RUBBER_STAMP_THRESHOLDS: Record<string, number> = {
  'crm.note_add':            2000,  // 2s  — notes need reading
  'crm.activity_log':        1500,  // 1.5s — simple activity
  'crm.contact_enrich':      2000,  // 2s
  'crm.next_steps_update':   2000,  // 2s
  'crm.deal_field_update':   1500,  // 1.5s — simple field
  'crm.deal_stage_change':   3000,  // 3s  — high stakes, needs thought
  'crm.deal_amount_change':  3000,  // 3s  — high stakes
  'crm.deal_close_date_change': 2000, // 2s
  'email.draft_save':        1500,  // 1.5s — draft save, lower stakes
  'email.send':              5000,  // 5s  — email needs careful review
  'email.follow_up_send':    4000,  // 4s
  'email.check_in_send':     3000,  // 3s
  'task.create':             1500,  // 1.5s
  'task.assign':             1500,  // 1.5s
  'calendar.create_event':   2000,  // 2s
  'calendar.reschedule':     2000,  // 2s
  'sequence.start':          3000,  // 3s  — sequences have downstream impact
  'slack.notification_send': 1500,  // 1.5s
  'slack.briefing_send':     2000,  // 2s
}

/**
 * Fallback threshold used when `action_type` is absent or not listed in
 * `RUBBER_STAMP_THRESHOLDS`.
 */
export const DEFAULT_RUBBER_STAMP_MS = 2000

// =============================================================================
// Interfaces
// =============================================================================

/**
 * A single recorded approval/signal event, mapped 1-to-1 to a row in
 * `autopilot_signals`.
 */
export interface ApprovalEvent {
  /** Row UUID — populated by the database on insert, optional when creating. */
  id?: string
  /** UUID of the user who owns this event. */
  user_id: string
  /** UUID of the organisation. */
  org_id: string
  /** Action type slug (e.g. `'send_email'`, `'crm_field_update'`). */
  action_type: string
  /** Name of the agent that proposed or executed the action. */
  agent_name: string
  /** The outcome signal for this event. */
  signal: ApprovalSignal
  /** Levenshtein-style distance between the original proposal and the edited version. */
  edit_distance?: number
  /** Names of fields the rep changed before approving. */
  edit_fields?: string[]
  /** Milliseconds elapsed between proposal presentation and rep response. */
  time_to_respond_ms?: number
  /** Confidence score the engine held at the time it generated the proposal. */
  confidence_at_proposal?: number
  /** Associated deal UUID, if any. */
  deal_id?: string
  /** Associated contact UUID, if any. */
  contact_id?: string
  /** Associated meeting UUID, if any. */
  meeting_id?: string
  /** The autonomy tier that was active when this action was proposed/executed. */
  autonomy_tier_at_time: string
  /** True when this event is being inserted retroactively (e.g. data migration). */
  is_backfill?: boolean
  /** ISO timestamp — populated by the database on insert, optional when creating. */
  created_at?: string
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Returns `true` if the approval looks like a rubber stamp — i.e. the rep
 * responded suspiciously fast, suggesting they did not genuinely review the
 * proposal.
 *
 * The threshold is determined by `actionType` (looked up in
 * `RUBBER_STAMP_THRESHOLDS`). If `actionType` is omitted or not in the table,
 * `DEFAULT_RUBBER_STAMP_MS` is used.
 *
 * Returns `false` when `timeToRespondMs` is `null` or `undefined` — unknown
 * response time gets the benefit of the doubt.
 *
 * Note: only call this for `approved` / `approved_edited` signals; for all
 * other signal types the caller should skip the rubber-stamp check entirely.
 *
 * @param timeToRespondMs - Milliseconds between proposal presentation and rep
 *   response. Pass `null` / `undefined` when the value is unavailable.
 * @param actionType      - Optional action type slug (e.g. `'email.send'`).
 *   When supplied, an action-specific threshold from `RUBBER_STAMP_THRESHOLDS`
 *   is used; otherwise `DEFAULT_RUBBER_STAMP_MS` applies.
 */
export function isRubberStamp(
  timeToRespondMs: number | null | undefined,
  actionType?: string,
): boolean {
  if (timeToRespondMs == null) return false  // unknown → benefit of the doubt
  const threshold =
    (actionType ? RUBBER_STAMP_THRESHOLDS[actionType] : null) ?? DEFAULT_RUBBER_STAMP_MS
  return timeToRespondMs < threshold
}

// =============================================================================
// Core API
// =============================================================================

/**
 * Records an approval signal into `autopilot_signals`.
 *
 * This function is **fire-and-forget safe** — it catches all errors and logs
 * them via `console.error` rather than re-throwing. Callers do not need to
 * wrap it in a try/catch. The system should continue operating normally even
 * if signal recording fails.
 *
 * @param supabase - Supabase client (service role recommended so RLS does not
 *                   block cross-user inserts from edge functions)
 * @param event    - The approval event to persist
 */
export async function recordSignal(
  supabase: SupabaseClient,
  event: ApprovalEvent,
): Promise<void> {
  try {
    const { error } = await supabase.from('autopilot_signals').insert({
      user_id: event.user_id,
      org_id: event.org_id,
      action_type: event.action_type,
      agent_name: event.agent_name,
      signal: event.signal,
      edit_distance: event.edit_distance ?? null,
      edit_fields: event.edit_fields ?? null,
      time_to_respond_ms: event.time_to_respond_ms ?? null,
      confidence_at_proposal: event.confidence_at_proposal ?? null,
      deal_id: event.deal_id ?? null,
      contact_id: event.contact_id ?? null,
      meeting_id: event.meeting_id ?? null,
      autonomy_tier_at_time: event.autonomy_tier_at_time,
      is_backfill: event.is_backfill ?? false,
      rubber_stamp: isRubberStamp(event.time_to_respond_ms, event.action_type),
    })

    if (error) {
      console.error('[autopilot/signals] recordSignal insert error:', error)
    }
  } catch (err) {
    console.error('[autopilot/signals] recordSignal unexpected error:', err)
  }
}

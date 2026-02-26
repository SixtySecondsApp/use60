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
 * Minimum time-to-respond (ms) below which an approval is considered a
 * rubber stamp — i.e. the rep approved without meaningfully reviewing the
 * proposal. Approvals faster than this threshold are flagged so downstream
 * analytics can discount them when building confidence scores.
 *
 * 2 seconds: a human cannot meaningfully read and evaluate a proposal in
 * under 2 seconds, so any approval faster than this is assumed to be a
 * click-through rather than a genuine review.
 */
export const RUBBER_STAMP_THRESHOLD_MS = 2000

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
 * Returns `true` if the approval event looks like a rubber stamp — i.e. the
 * rep approved (with or without edits) suspiciously fast, suggesting they did
 * not genuinely review the proposal.
 *
 * Only `approved` and `approved_edited` signals can be rubber stamps.
 * If `time_to_respond_ms` is not available the function returns `false`.
 *
 * @param event - The approval event to evaluate
 */
export function isRubberStamp(event: ApprovalEvent): boolean {
  if (event.signal !== 'approved' && event.signal !== 'approved_edited') {
    return false
  }
  if (event.time_to_respond_ms === undefined || event.time_to_respond_ms === null) {
    return false
  }
  return event.time_to_respond_ms < RUBBER_STAMP_THRESHOLD_MS
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
      rubber_stamp: isRubberStamp(event),
    })

    if (error) {
      console.error('[autopilot/signals] recordSignal insert error:', error)
    }
  } catch (err) {
    console.error('[autopilot/signals] recordSignal unexpected error:', err)
  }
}

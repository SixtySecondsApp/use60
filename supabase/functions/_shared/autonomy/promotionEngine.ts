/**
 * Autopilot Promotion Engine — AP-013
 *
 * Evaluates whether a (user, action_type) pair is eligible for promotion to
 * the next autonomy tier, using `autopilot_confidence` scores and
 * `autopilot_thresholds` configuration. Also provides an audit-log writer for
 * `autopilot_events`.
 *
 * Tier ladder:  suggest  →  approve  →  auto
 *
 * Usage:
 *   const candidate = await evaluatePromotionEligibility(supabase, userId, orgId, actionType)
 *   if (candidate) {
 *     await recordPromotionEvent(supabase, { ...candidate, event_type: 'promotion_proposed' })
 *   }
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { ApprovalSignal } from '../autopilot/signals.ts'

// =============================================================================
// Types
// =============================================================================

/**
 * A snapshot of a (user, action_type) pair that has passed all promotion
 * eligibility checks. Returned by `evaluatePromotionEligibility`.
 */
export interface PromotionCandidate {
  user_id: string
  org_id: string
  action_type: string
  /** The tier the user is currently on. */
  from_tier: string
  /** The tier the user is eligible to be promoted to. */
  to_tier: string
  /** Composite confidence score at evaluation time (0.0 – 1.0). */
  confidence_score: number
  /** Snapshot of the confidence stats used to reach this decision. */
  approval_stats: {
    score: number
    approval_rate: number
    clean_approval_rate: number
    rejection_rate: number
    undo_rate: number
    total_signals: number
    days_active: number
    last_30_score: number
  }
  /** Snapshot of the threshold configuration that was applied. */
  threshold_config: {
    min_signals: number
    min_clean_approval_rate: number
    max_rejection_rate: number
    max_undo_rate: number
    min_days_active: number
    min_confidence_score: number
    last_n_clean: number
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Maps a tier to its successor on the promotion ladder. */
function nextTier(tier: string): string | null {
  switch (tier) {
    case 'suggest': return 'approve'
    case 'approve': return 'auto'
    default:        return null
  }
}

/** Numeric rank for each autonomy tier — used for ceiling comparisons. */
const TIER_RANK: Record<string, number> = {
  'disabled': 0,
  'suggest': 1,
  'approve': 2,
  'auto': 3,
}

/**
 * Checks whether the org admin has set a ceiling that would block this
 * promotion.
 *
 * @returns true if the promotion is BLOCKED by a ceiling (should not proceed)
 * @returns false if the promotion is ALLOWED (no ceiling, or ceiling is high enough)
 */
export async function checkManagerCeiling(
  supabase: SupabaseClient,
  orgId: string,
  actionType: string,
  toTier: string,
): Promise<boolean> {
  const { data: setting, error } = await supabase
    .from('autopilot_org_settings')
    .select('max_tier, enabled')
    .eq('org_id', orgId)
    .eq('action_type', actionType)
    .eq('enabled', true)
    .maybeSingle()

  if (error) {
    console.error('[autonomy/promotionEngine] checkManagerCeiling fetch error:', error)
    // Fail open — don't block promotions on a DB error
    return false
  }

  // No ceiling configured for this (org, action_type)
  if (!setting) return false

  // Block if the target tier exceeds the configured ceiling
  return (TIER_RANK[toTier] ?? 0) > (TIER_RANK[setting.max_tier] ?? 3)
}

// =============================================================================
// Core API
// =============================================================================

/**
 * Evaluates whether a (user, action_type) pair is eligible for promotion to
 * the next autonomy tier.
 *
 * Checks (in order):
 * 1. A confidence row must exist for (user_id, action_type).
 * 2. `never_promote` must be false.
 * 3. `cooldown_until` must not be in the future.
 * 4. `current_tier` must be 'suggest' or 'approve' (can't promote from 'auto').
 * 5. An enabled threshold row must exist for (org_id or NULL, action_type,
 *    from_tier, to_tier) and must not have `never_promote = true`.
 * 6. All numeric criteria must be satisfied:
 *    - score >= min_confidence_score
 *    - total_signals >= min_signals + extra_required_signals
 *    - clean_approval_rate >= min_clean_approval_rate
 *    - rejection_rate <= max_rejection_rate (when not null)
 *    - undo_rate <= max_undo_rate (when not null)
 *    - days_active >= min_days_active
 * 7. The first `last_n_clean` entries of `last_30_signals` must all be
 *    'approved' (not 'approved_edited').
 *
 * Returns a `PromotionCandidate` when all checks pass, `null` otherwise.
 *
 * @param supabase   - Supabase client (service role recommended)
 * @param userId     - UUID of the user to evaluate
 * @param orgId      - UUID of the organisation
 * @param actionType - Action type slug (e.g. `'send_email'`)
 */
export async function evaluatePromotionEligibility(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  actionType: string,
): Promise<PromotionCandidate | null> {
  // -------------------------------------------------------------------------
  // Step 1 — Fetch confidence row
  // -------------------------------------------------------------------------
  const { data: confidence, error: confidenceError } = await supabase
    .from('autopilot_confidence')
    .select(
      'user_id, org_id, action_type, score, approval_rate, clean_approval_rate, ' +
      'rejection_rate, undo_rate, total_signals, days_active, last_30_score, ' +
      'last_30_signals, current_tier, cooldown_until, never_promote, extra_required_signals',
    )
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .maybeSingle()

  if (confidenceError) {
    console.error('[autonomy/promotionEngine] evaluatePromotionEligibility confidence fetch error:', confidenceError)
    return null
  }

  // No data yet for this (user, action_type)
  if (!confidence) return null

  // Guard: user or admin has permanently blocked promotion
  if (confidence.never_promote) return null

  // Guard: still within post-demotion cooldown window
  if (confidence.cooldown_until && new Date(confidence.cooldown_until) > new Date()) {
    return null
  }

  // Guard: can only promote from 'suggest' or 'approve'
  const toTier = nextTier(confidence.current_tier)
  if (!toTier) return null

  // -------------------------------------------------------------------------
  // Step 2 — Resolve effective threshold (org override → platform default)
  // -------------------------------------------------------------------------

  // Try org-specific override first
  const { data: orgThreshold, error: orgThresholdError } = await supabase
    .from('autopilot_thresholds')
    .select(
      'min_signals, min_clean_approval_rate, max_rejection_rate, max_undo_rate, ' +
      'min_days_active, min_confidence_score, last_n_clean, enabled, never_promote',
    )
    .eq('org_id', orgId)
    .eq('action_type', actionType)
    .eq('from_tier', confidence.current_tier)
    .eq('to_tier', toTier)
    .maybeSingle()

  if (orgThresholdError) {
    console.error('[autonomy/promotionEngine] evaluatePromotionEligibility org threshold fetch error:', orgThresholdError)
    return null
  }

  // Fall back to platform default (org_id IS NULL)
  let threshold = orgThreshold
  if (!threshold) {
    const { data: platformThreshold, error: platformThresholdError } = await supabase
      .from('autopilot_thresholds')
      .select(
        'min_signals, min_clean_approval_rate, max_rejection_rate, max_undo_rate, ' +
        'min_days_active, min_confidence_score, last_n_clean, enabled, never_promote',
      )
      .is('org_id', null)
      .eq('action_type', actionType)
      .eq('from_tier', confidence.current_tier)
      .eq('to_tier', toTier)
      .maybeSingle()

    if (platformThresholdError) {
      console.error('[autonomy/promotionEngine] evaluatePromotionEligibility platform threshold fetch error:', platformThresholdError)
      return null
    }

    threshold = platformThreshold
  }

  // No promotion path defined for this transition
  if (!threshold) return null

  // Guard: threshold row is disabled
  if (!threshold.enabled) return null

  // Guard: policy-level never_promote
  if (threshold.never_promote) return null

  // -------------------------------------------------------------------------
  // Step 2.5 — Check manager ceiling
  // -------------------------------------------------------------------------
  const ceilingBlocked = await checkManagerCeiling(supabase, orgId, actionType, toTier)
  if (ceilingBlocked) {
    console.log(`[autonomy/promotionEngine] Promotion blocked by manager ceiling: org=${orgId} action=${actionType} to=${toTier}`)
    return null
  }

  // -------------------------------------------------------------------------
  // Step 3 — Evaluate numeric criteria
  // -------------------------------------------------------------------------
  const requiredSignals = threshold.min_signals + (confidence.extra_required_signals ?? 0)

  if (confidence.score < threshold.min_confidence_score) return null
  if (confidence.total_signals < requiredSignals) return null
  if (confidence.clean_approval_rate < threshold.min_clean_approval_rate) return null
  if (
    confidence.rejection_rate !== null &&
    confidence.rejection_rate > threshold.max_rejection_rate
  ) return null
  if (
    confidence.undo_rate !== null &&
    confidence.undo_rate > threshold.max_undo_rate
  ) return null
  if (confidence.days_active < threshold.min_days_active) return null

  // -------------------------------------------------------------------------
  // Step 4 — Streak guard: first last_n_clean signals must all be 'approved'
  // -------------------------------------------------------------------------
  const lastNClean: number = threshold.last_n_clean
  const recentSignals: ApprovalSignal[] = Array.isArray(confidence.last_30_signals)
    ? (confidence.last_30_signals as ApprovalSignal[])
    : []

  // Insufficient data for the streak check
  if (recentSignals.length < lastNClean) return null

  for (let i = 0; i < lastNClean; i++) {
    if (recentSignals[i] !== 'approved') return null
  }

  // -------------------------------------------------------------------------
  // Step 5 — All checks passed — build and return the candidate
  // -------------------------------------------------------------------------
  return {
    user_id: userId,
    org_id: orgId,
    action_type: actionType,
    from_tier: confidence.current_tier,
    to_tier: toTier,
    confidence_score: confidence.score,
    approval_stats: {
      score: confidence.score,
      approval_rate: confidence.approval_rate ?? 0,
      clean_approval_rate: confidence.clean_approval_rate ?? 0,
      rejection_rate: confidence.rejection_rate ?? 0,
      undo_rate: confidence.undo_rate ?? 0,
      total_signals: confidence.total_signals,
      days_active: confidence.days_active,
      last_30_score: confidence.last_30_score ?? 0,
    },
    threshold_config: {
      min_signals: threshold.min_signals,
      min_clean_approval_rate: threshold.min_clean_approval_rate,
      max_rejection_rate: threshold.max_rejection_rate,
      max_undo_rate: threshold.max_undo_rate,
      min_days_active: threshold.min_days_active,
      min_confidence_score: threshold.min_confidence_score,
      last_n_clean: threshold.last_n_clean,
    },
  }
}

/**
 * Records a promotion or demotion event into the `autopilot_events` audit log.
 *
 * This function is **fire-and-forget safe** — all errors are caught and logged;
 * nothing is re-thrown. Callers do not need to wrap it in a try/catch.
 *
 * @param supabase - Supabase client (service role recommended)
 * @param params   - Event fields; see `autopilot_events` schema for definitions
 */
export async function recordPromotionEvent(
  supabase: SupabaseClient,
  params: {
    org_id: string
    user_id: string
    action_type: string
    event_type:
      | 'promotion_proposed'
      | 'promotion_accepted'
      | 'promotion_declined'
      | 'promotion_never'
      | 'demotion_warning'
      | 'demotion_auto'
      | 'demotion_emergency'
      | 'manual_override'
    from_tier: string
    to_tier: string
    confidence_score?: number
    approval_stats?: Record<string, unknown>
    threshold_config?: Record<string, unknown>
    trigger_reason?: string
    cooldown_until?: string | null
  },
): Promise<void> {
  try {
    const { error } = await supabase.from('autopilot_events').insert({
      org_id: params.org_id,
      user_id: params.user_id,
      action_type: params.action_type,
      event_type: params.event_type,
      from_tier: params.from_tier,
      to_tier: params.to_tier,
      confidence_score: params.confidence_score ?? null,
      approval_stats: params.approval_stats ?? null,
      threshold_config: params.threshold_config ?? null,
      trigger_reason: params.trigger_reason ?? null,
      cooldown_until: params.cooldown_until ?? null,
    })

    if (error) {
      console.error('[autonomy/promotionEngine] recordPromotionEvent insert error:', error)
    }
  } catch (err) {
    console.error('[autonomy/promotionEngine] recordPromotionEvent unexpected error:', err)
  }
}

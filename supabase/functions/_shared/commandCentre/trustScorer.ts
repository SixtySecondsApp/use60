/**
 * Command Centre Trust Scorer
 *
 * Manages progressive autonomy for the Command Centre. Agents earn the right
 * to act on behalf of reps by building trust over time via the action_trust_scores table.
 *
 * Key concepts:
 *   - Each (user_id, action_type) pair has an auto_threshold stored in DB
 *   - Thresholds drift downward after 50 consecutive approvals (more autonomy)
 *   - Rejections reset the threshold to starting_threshold (less autonomy)
 *   - classifyExecutionTier() decides how an item is presented to the rep
 *
 * Story: CC11-002
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExecutionTier = 'autonomous' | 'one_click' | 'needs_input';

interface ActionTypeDefault {
  starting_threshold: number;
  floor: number;
  risk: string;
}

// ---------------------------------------------------------------------------
// Action type defaults
// ---------------------------------------------------------------------------

export const ACTION_TYPE_DEFAULTS: Record<string, ActionTypeDefault> = {
  crm_field_update: { starting_threshold: 0.90, floor: 0.70, risk: 'low' },
  task_creation: { starting_threshold: 0.90, floor: 0.75, risk: 'low' },
  meeting_scheduling: { starting_threshold: 0.95, floor: 0.85, risk: 'medium' },
  follow_up_email: { starting_threshold: 0.95, floor: 0.85, risk: 'medium' },
  reengagement_outreach: { starting_threshold: 0.98, floor: 0.90, risk: 'high' },
  proposal_send: { starting_threshold: 0.98, floor: 0.90, risk: 'high' },
};

// ---------------------------------------------------------------------------
// mapDraftedActionToActionType
// ---------------------------------------------------------------------------

/**
 * Maps a DraftedAction.type (and optionally item_type context) to an
 * action_trust_scores.action_type key.
 */
export function mapDraftedActionToActionType(
  draftedActionType: string,
  itemType?: string,
): string {
  switch (draftedActionType) {
    case 'send_email':
      // Distinguish follow-up emails from re-engagement outreach
      if (itemType === 'outreach') return 'reengagement_outreach';
      return 'follow_up_email';
    case 'update_crm':
      return 'crm_field_update';
    case 'create_task':
      return 'task_creation';
    case 'schedule_meeting':
      return 'meeting_scheduling';
    case 'send_proposal':
      return 'proposal_send';
    default:
      return 'follow_up_email';
  }
}

// ---------------------------------------------------------------------------
// resolveTrustThreshold
// ---------------------------------------------------------------------------

/**
 * Resolves the current auto_threshold and floor for a (userId, actionType) pair.
 * Returns starting_threshold from defaults if no row exists yet in DB.
 */
export async function resolveTrustThreshold(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  actionType: string,
): Promise<{ threshold: number; floor: number }> {
  const defaults = ACTION_TYPE_DEFAULTS[actionType] ?? {
    starting_threshold: 0.95,
    floor: 0.80,
    risk: 'medium',
  };

  try {
    const { data, error } = await supabase
      .from('action_trust_scores')
      .select('auto_threshold')
      .eq('user_id', userId)
      .eq('action_type', actionType)
      .maybeSingle();

    if (error) {
      console.error('[cc-trust] resolveTrustThreshold error', { userId, actionType, error: error.message });
      return { threshold: defaults.starting_threshold, floor: defaults.floor };
    }

    if (!data) {
      // No row yet — use default starting threshold
      return { threshold: defaults.starting_threshold, floor: defaults.floor };
    }

    return { threshold: data.auto_threshold, floor: defaults.floor };
  } catch (err) {
    console.error('[cc-trust] resolveTrustThreshold unexpected error', { userId, actionType, err });
    return { threshold: defaults.starting_threshold, floor: defaults.floor };
  }
}

// ---------------------------------------------------------------------------
// recordOutcome
// ---------------------------------------------------------------------------

/**
 * Records a rep's outcome for a trust-scored action.
 * Upserts into action_trust_scores and applies drift rules:
 *   - approved: increments streak; at 50 consecutive, threshold drifts down by 0.05 (floor enforced)
 *   - approved_with_edit: resets streak
 *   - rejected: resets streak AND resets threshold to starting_threshold
 *
 * Uses service role client to bypass RLS for writes.
 */
export async function recordOutcome(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  actionType: string,
  outcome: 'approved' | 'approved_with_edit' | 'rejected',
): Promise<void> {
  const defaults = ACTION_TYPE_DEFAULTS[actionType] ?? {
    starting_threshold: 0.95,
    floor: 0.80,
    risk: 'medium',
  };

  try {
    // Fetch current row first so we can compute increments
    const { data: current, error: fetchError } = await supabase
      .from('action_trust_scores')
      .select(
        'auto_threshold, approved_without_edit, approved_with_edit, rejected, consecutive_approvals, threshold_history',
      )
      .eq('user_id', userId)
      .eq('action_type', actionType)
      .maybeSingle();

    if (fetchError) {
      console.error('[cc-trust] recordOutcome fetch error', { userId, actionType, fetchError: fetchError.message });
      return;
    }

    // Build base counters from existing row or defaults
    const approvedWithoutEdit: number = (current?.approved_without_edit ?? 0);
    const approvedWithEdit: number = (current?.approved_with_edit ?? 0);
    const rejected: number = (current?.rejected ?? 0);
    const consecutiveApprovals: number = (current?.consecutive_approvals ?? 0);
    let autoThreshold: number = (current?.auto_threshold ?? defaults.starting_threshold);
    const thresholdHistory: number[] = (current?.threshold_history ?? []);

    // Apply drift rules
    let newApprovedWithoutEdit = approvedWithoutEdit;
    let newApprovedWithEdit = approvedWithEdit;
    let newRejected = rejected;
    let newConsecutiveApprovals = consecutiveApprovals;
    let newAutoThreshold = autoThreshold;
    const newThresholdHistory = [...thresholdHistory];
    let lastRejectionAt: string | null = null;

    if (outcome === 'approved') {
      newApprovedWithoutEdit = approvedWithoutEdit + 1;
      newConsecutiveApprovals = consecutiveApprovals + 1;

      // Drift threshold down every 50 consecutive approvals
      if (newConsecutiveApprovals > 0 && newConsecutiveApprovals % 50 === 0) {
        newAutoThreshold = Math.max(defaults.floor, autoThreshold - 0.05);
        // Ceiling cap
        newAutoThreshold = Math.min(0.99, newAutoThreshold);
        newThresholdHistory.push(newAutoThreshold);
        console.log('[cc-trust] threshold drifted down', {
          userId,
          actionType,
          from: autoThreshold,
          to: newAutoThreshold,
          consecutiveApprovals: newConsecutiveApprovals,
        });
      }
    } else if (outcome === 'approved_with_edit') {
      newApprovedWithEdit = approvedWithEdit + 1;
      newConsecutiveApprovals = 0;
      // Threshold unchanged
    } else if (outcome === 'rejected') {
      newRejected = rejected + 1;
      newConsecutiveApprovals = 0;
      // Reset to starting threshold
      newAutoThreshold = defaults.starting_threshold;
      newThresholdHistory.push(newAutoThreshold);
      lastRejectionAt = new Date().toISOString();
      console.log('[cc-trust] threshold reset after rejection', {
        userId,
        actionType,
        resetTo: newAutoThreshold,
      });
    }

    const upsertPayload: Record<string, unknown> = {
      user_id: userId,
      action_type: actionType,
      auto_threshold: newAutoThreshold,
      approved_without_edit: newApprovedWithoutEdit,
      approved_with_edit: newApprovedWithEdit,
      rejected: newRejected,
      consecutive_approvals: newConsecutiveApprovals,
      threshold_history: newThresholdHistory,
      updated_at: new Date().toISOString(),
    };

    if (lastRejectionAt) {
      upsertPayload.last_rejection_at = lastRejectionAt;
    }

    const { error: upsertError } = await supabase
      .from('action_trust_scores')
      .upsert(upsertPayload, { onConflict: 'user_id,action_type' });

    if (upsertError) {
      console.error('[cc-trust] recordOutcome upsert error', { userId, actionType, upsertError: upsertError.message });
    } else {
      console.log('[cc-trust] recordOutcome saved', { userId, actionType, outcome, newAutoThreshold });
    }
  } catch (err) {
    console.error('[cc-trust] recordOutcome unexpected error', { userId, actionType, outcome, err });
    // Errors are logged but not thrown — CC failures must not break calling flows
  }
}

// ---------------------------------------------------------------------------
// classifyExecutionTier
// ---------------------------------------------------------------------------

/**
 * Classifies how a drafted action should be presented to the rep based on
 * the confidence score relative to the user's current auto_threshold.
 *
 *   autonomous  — agent executes without rep involvement (confidence >= autoThreshold)
 *   one_click   — rep sees a single approve button (confidence >= 0.70)
 *   needs_input — rep must review and edit before confirming (confidence < 0.70)
 */
export function classifyExecutionTier(
  confidenceScore: number,
  autoThreshold: number,
): ExecutionTier {
  if (confidenceScore >= autoThreshold) return 'autonomous';
  if (confidenceScore >= 0.70) return 'one_click';
  return 'needs_input';
}

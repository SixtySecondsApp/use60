/**
 * Shadow Execution Recorder — AE2-012
 *
 * Passively records what WOULD have happened at a higher autonomy tier.
 * When an action executes at 'approve' tier, this records a shadow entry.
 * When the user responds (approve/edit/reject), the shadow is resolved.
 *
 * Used by AE2-013 to display promotion evidence:
 * "If you'd been on auto for follow-ups last month, 94% would have been sent unchanged."
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// =============================================================================
// Types
// =============================================================================

interface ShadowRecordInput {
  orgId: string;
  userId: string;
  actionType: string;
  actualTier: 'approve' | 'suggest';
  /** Snapshot of the proposed action (email body, CRM fields, task, etc.) */
  actionSnapshot: Record<string, unknown>;
}

interface ShadowResolveInput {
  shadowId: string;
  userDecision: 'approved' | 'approved_edited' | 'rejected';
  editDistance?: number;
}

// =============================================================================
// Tier escalation mapping
// =============================================================================

const SHADOW_TIER_MAP: Record<string, string> = {
  approve: 'auto',
  suggest: 'approve',
};

// =============================================================================
// Record shadow execution
// =============================================================================

/**
 * Records a shadow execution entry when an action runs at a tier below auto.
 * Call this when the fleet router or chat path creates an approval/suggestion.
 *
 * Returns the shadow record ID for later resolution.
 */
export async function recordShadowExecution(
  supabase: SupabaseClient,
  input: ShadowRecordInput,
): Promise<string | null> {
  const shadowTier = SHADOW_TIER_MAP[input.actualTier];
  if (!shadowTier) return null;

  try {
    const { data, error } = await supabase
      .from('autonomy_shadow_executions')
      .insert({
        org_id: input.orgId,
        user_id: input.userId,
        action_type: input.actionType,
        actual_tier: input.actualTier,
        shadow_tier: shadowTier,
        action_snapshot: input.actionSnapshot,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[shadowRecorder] Failed to record shadow execution:', error.message);
      return null;
    }

    console.log('[shadowRecorder] Recorded shadow execution', {
      id: data.id,
      action_type: input.actionType,
      actual_tier: input.actualTier,
      shadow_tier: shadowTier,
    });

    return data.id;
  } catch (err) {
    console.warn('[shadowRecorder] Unexpected error recording shadow:', err);
    return null;
  }
}

// =============================================================================
// Resolve shadow execution
// =============================================================================

/**
 * Resolves a shadow execution after the user responds.
 * - approved (no edit) → would_have_matched = true (shadow auto would have been correct)
 * - approved_edited → would_have_matched = false
 * - rejected → would_have_matched = false
 */
export async function resolveShadowExecution(
  supabase: SupabaseClient,
  input: ShadowResolveInput,
): Promise<void> {
  const wouldHaveMatched = input.userDecision === 'approved';

  try {
    const { error } = await supabase
      .from('autonomy_shadow_executions')
      .update({
        user_decision: input.userDecision,
        edit_distance: input.editDistance ?? null,
        would_have_matched: wouldHaveMatched,
      })
      .eq('id', input.shadowId);

    if (error) {
      console.warn('[shadowRecorder] Failed to resolve shadow execution:', error.message);
      return;
    }

    console.log('[shadowRecorder] Resolved shadow execution', {
      id: input.shadowId,
      decision: input.userDecision,
      would_have_matched: wouldHaveMatched,
    });
  } catch (err) {
    console.warn('[shadowRecorder] Unexpected error resolving shadow:', err);
  }
}

// =============================================================================
// Batch resolve unresolved shadows
// =============================================================================

/**
 * Resolves the most recent unresolved shadow for a (user, action_type) pair.
 * Useful when the approval happens through a flow that doesn't track shadow IDs.
 */
export async function resolveLatestShadow(
  supabase: SupabaseClient,
  userId: string,
  actionType: string,
  userDecision: 'approved' | 'approved_edited' | 'rejected',
  editDistance?: number,
): Promise<void> {
  try {
    const { data, error: fetchError } = await supabase
      .from('autonomy_shadow_executions')
      .select('id')
      .eq('user_id', userId)
      .eq('action_type', actionType)
      .is('user_decision', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError || !data) return;

    await resolveShadowExecution(supabase, {
      shadowId: data.id,
      userDecision,
      editDistance,
    });
  } catch (err) {
    console.warn('[shadowRecorder] Unexpected error in resolveLatestShadow:', err);
  }
}

/**
 * Autonomy Promotion Handler — GRAD-003
 *
 * Handles button clicks from promotion suggestion Slack DMs sent by
 * `autonomy-promotion-notify`.
 *
 * action_id values:
 *   - autonomy_promotion_approve  — applies the promotion via promotionEngine
 *   - autonomy_promotion_reject   — rejects the suggestion permanently
 *   - autonomy_promotion_snooze   — snoozes the suggestion for 30 days
 *
 * value payload (JSON):
 *   { promotion_id, org_id, action_type }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { applyPromotion, rejectPromotion } from '../../_shared/orchestrator/promotionEngine.ts';
import { recordSignal, ApprovalEvent } from '../../_shared/autopilot/signals.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// =============================================================================
// Types
// =============================================================================

interface SlackAction {
  action_id: string;
  value: string;
  type: string;
  block_id?: string;
}

interface InteractivePayload {
  user: {
    id: string;
    name?: string;
  };
  response_url?: string;
  message?: { ts: string };
  channel?: { id: string };
  team?: { id: string; domain?: string };
}

export interface AutonomyPromotionHandleResult {
  success: boolean;
  responseBlocks?: unknown[];
  error?: string;
}

interface ActionValue {
  promotion_id: string;
  org_id: string;
  action_type: string;
}

interface UndoActionValue {
  org_id: string;
  action_type: string;
  original_signal_id?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function section(text: string) {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: text.substring(0, 3000) },
  };
}

const ACTION_LABELS: Record<string, string> = {
  crm_stage_change: 'CRM stage changes',
  crm_field_update: 'CRM field updates',
  crm_contact_create: 'Contact creation',
  send_email: 'Email sending',
  send_slack: 'Slack messages',
  create_task: 'Task creation',
  enrich_contact: 'Contact enrichment',
  draft_proposal: 'Proposal drafts',
};

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle autonomy_promotion_* button clicks from Slack.
 * Returns null if action_id is not one of the three promotion actions.
 */
export async function handleAutonomyPromotion(
  actionId: string,
  payload: InteractivePayload,
  action: SlackAction,
): Promise<AutonomyPromotionHandleResult | null> {
  if (
    actionId !== 'autonomy_promotion_approve' &&
    actionId !== 'autonomy_promotion_reject' &&
    actionId !== 'autonomy_promotion_snooze' &&
    actionId !== 'autonomy_undo_action'
  ) {
    return null;
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

  // -------------------------------------------------------------------------
  // autonomy_undo_action — rep reverses an auto-executed action
  // -------------------------------------------------------------------------
  if (actionId === 'autonomy_undo_action') {
    let undoParsed: UndoActionValue;
    try {
      undoParsed = JSON.parse(action.value);
    } catch {
      console.error('[autonomyPromotion] Failed to parse undo action.value:', action.value);
      return { success: false, error: 'Invalid action value format' };
    }

    const { org_id: undoOrgId, action_type: undoActionType } = undoParsed;
    if (!undoOrgId || !undoActionType) {
      return { success: false, error: 'Missing org_id or action_type in undo action value' };
    }

    // Resolve the Sixty user who clicked undo
    const { data: undoMapping } = await serviceClient
      .from('slack_user_mappings')
      .select('sixty_user_id')
      .eq('slack_user_id', payload.user.id)
      .eq('org_id', undoOrgId)
      .maybeSingle();

    const undoResolvedUserId = undoMapping?.sixty_user_id || `slack:${payload.user.id}`;

    const undoEvent: ApprovalEvent = {
      user_id: undoResolvedUserId,
      org_id: undoOrgId,
      action_type: undoActionType,
      agent_name: 'autopilot',
      signal: 'auto_undone',
      autonomy_tier_at_time: 'auto',
    };

    recordSignal(serviceClient, undoEvent).catch(() => {});

    return {
      success: true,
      responseBlocks: [
        section(`Action reversed. The AI will take note and require approval before executing *${ACTION_LABELS[undoActionType] || undoActionType.replace(/_/g, ' ')}* actions in the future.`),
      ],
    };
  }

  // -------------------------------------------------------------------------
  // 1. Parse action value (promotion actions)
  // -------------------------------------------------------------------------
  let parsed: ActionValue;
  try {
    parsed = JSON.parse(action.value);
  } catch {
    console.error('[autonomyPromotion] Failed to parse action.value:', action.value);
    return { success: false, error: 'Invalid action value format' };
  }

  const { promotion_id, org_id, action_type } = parsed;
  if (!promotion_id || !org_id || !action_type) {
    return { success: false, error: 'Missing promotion_id, org_id, or action_type in action value' };
  }

  const label = ACTION_LABELS[action_type] || action_type.replace(/_/g, ' ');

  // -------------------------------------------------------------------------
  // 2. Resolve the Sixty user who clicked the button
  // -------------------------------------------------------------------------
  const { data: mapping } = await serviceClient
    .from('slack_user_mappings')
    .select('sixty_user_id')
    .eq('slack_user_id', payload.user.id)
    .eq('org_id', org_id)
    .maybeSingle();

  const resolvedUserId = mapping?.sixty_user_id || `slack:${payload.user.id}`;

  // -------------------------------------------------------------------------
  // 3. Process the action
  // -------------------------------------------------------------------------
  try {
    if (actionId === 'autonomy_promotion_approve') {
      await applyPromotion(serviceClient, org_id, promotion_id, resolvedUserId);

      return {
        success: true,
        responseBlocks: [
          section(`*Auto-approve enabled* for *${label}*. The AI will now execute this action without requiring approval.\n\nYou can adjust this anytime in Settings > Autonomy & Approvals.`),
        ],
      };
    }

    if (actionId === 'autonomy_promotion_reject') {
      await rejectPromotion(serviceClient, promotion_id, resolvedUserId, false);

      return {
        success: true,
        responseBlocks: [
          section(`Understood. Auto-approve for *${label}* has been declined. We won't suggest this again unless the approval pattern changes significantly.`),
        ],
      };
    }

    if (actionId === 'autonomy_promotion_snooze') {
      await rejectPromotion(serviceClient, promotion_id, resolvedUserId, true);

      return {
        success: true,
        responseBlocks: [
          section(`Snoozed. We'll revisit auto-approve for *${label}* in 30 days.`),
        ],
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[autonomyPromotion] Error processing ${actionId}:`, err);
    return { success: false, error: message };
  }

  return null;
}

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
    actionId !== 'autonomy_promotion_snooze'
  ) {
    return null;
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

  // -------------------------------------------------------------------------
  // 1. Parse action value
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

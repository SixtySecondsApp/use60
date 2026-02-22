/**
 * Autonomy Promotion Slack Interactive Handler — AUT-005
 *
 * Handles button clicks from the autonomy promotion DM:
 * - autonomy_promote_approve: sets action_type policy to 'auto'
 * - autonomy_promote_dismiss: records dismissal so we don't re-send for 7 days
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
}

export interface AutonomyHandleResult {
  success: boolean;
  responseBlocks?: unknown[];
  error?: string;
}

function section(text: string) {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: text.substring(0, 3000) },
  };
}

/**
 * Handle autonomy_promote_* actions from Slack interactive.
 */
export async function handleAutonomyAction(
  actionId: string,
  payload: InteractivePayload,
  action: SlackAction,
): Promise<AutonomyHandleResult | null> {
  if (!actionId.startsWith('autonomy_promote_')) return null;

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

  // Parse action value (JSON with org_id, action_type)
  let parsed: { org_id: string; action_type: string; policy?: string };
  try {
    parsed = JSON.parse(action.value);
  } catch {
    return { success: false, error: 'Invalid action value format' };
  }

  const { org_id, action_type } = parsed;
  if (!org_id || !action_type) {
    return { success: false, error: 'Missing org_id or action_type in action value' };
  }

  if (actionId === 'autonomy_promote_approve') {
    // Upsert the org-level policy to 'auto' for this action_type
    const { error } = await serviceClient
      .from('autonomy_policies')
      .upsert(
        {
          org_id,
          user_id: null,
          action_type,
          policy: 'auto',
          preset_name: 'custom',
        },
        { onConflict: 'org_id,user_id,action_type' }
      );

    if (error) {
      console.error('[handleAutonomyAction] upsert error:', error);
      return { success: false, error: 'Failed to update policy' };
    }

    // Clear the promotion_sent flag so it won't block re-suggestion if reverted
    await serviceClient
      .from('agent_config_org_overrides')
      .delete()
      .eq('org_id', org_id)
      .eq('agent_type', 'global')
      .eq('config_key', `autonomy.promotion_sent.${action_type}`);

    return {
      success: true,
      responseBlocks: [
        section(`*Auto-approve enabled* for *${action_type.replace(/_/g, ' ')}*. The AI will now execute this action without requiring approval. You can adjust this in Settings > Autonomy & Approvals.`),
      ],
    };
  }

  if (actionId === 'autonomy_promote_dismiss') {
    // Record dismissal to suppress re-sending for 7 days
    await serviceClient
      .from('agent_config_org_overrides')
      .upsert(
        {
          org_id,
          agent_type: 'global',
          config_key: `autonomy.promotion_sent.${action_type}`,
          config_value: { sent_at: new Date().toISOString(), dismissed: true },
        },
        { onConflict: 'org_id,agent_type,config_key' }
      );

    return {
      success: true,
      responseBlocks: [
        section(`Dismissed. We won't suggest auto-approve for *${action_type.replace(/_/g, ' ')}* again for 7 days.`),
      ],
    };
  }

  return null;
}

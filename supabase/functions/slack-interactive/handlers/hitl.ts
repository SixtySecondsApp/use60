/**
 * HITL (Human-in-the-Loop) Slack Interactive Handlers
 *
 * Handles button clicks and interactions for sequence HITL requests.
 * SS-001: Also syncs Slack interactions to Action Centre status.
 * AP-007: Records autopilot approval signals on approve/reject actions.
 *
 * @see docs/project-requirements/PRD_ACTION_CENTRE.md
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { recordSignal, ApprovalEvent } from '../../_shared/autopilot/signals.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

// =============================================================================
// AP-007: Action type mapping for autopilot signal recording
// =============================================================================

const ACTION_TYPE_MAP: Record<string, string> = {
  crm_stage_change: 'crm.deal_stage_change',
  crm_field_update: 'crm.deal_field_update',
  crm_contact_create: 'crm.contact_enrich',
  send_email: 'email.send',
  send_slack: 'slack.notification_send',
  create_task: 'task.create',
  enrich_contact: 'crm.contact_enrich',
  draft_proposal: 'email.draft_save',
};

/**
 * Maps a raw HITL action_type string to the dot-notation format used by autopilot.
 * Falls back to replacing underscores with dots if no explicit mapping found.
 */
function mapActionType(rawType: string): string {
  if (!rawType) return 'unknown';
  return ACTION_TYPE_MAP[rawType] ?? rawType.replace(/_/g, '.');
}

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
  message?: {
    ts: string;
  };
  channel?: {
    id: string;
  };
}

interface HandleResult {
  success: boolean;
  responseBlocks?: unknown[];
  error?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function header(text: string) {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text: text.substring(0, 150),
      emoji: true,
    },
  };
}

function section(text: string) {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: text.substring(0, 3000),
    },
  };
}

function context(elements: string[]) {
  return {
    type: 'context',
    elements: elements.map((text) => ({
      type: 'mrkdwn',
      text: text.substring(0, 300),
    })),
  };
}

function divider() {
  return { type: 'divider' };
}

async function getUserId(
  supabase: ReturnType<typeof createClient>,
  slackUserId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('slack_user_id', slackUserId)
    .maybeSingle();

  return data?.id || null;
}

/**
 * SS-001: Sync Slack HITL interaction to Action Centre status.
 * Finds matching Action Centre item by slack_message_ts and updates status.
 */
async function syncToActionCentre(
  supabase: ReturnType<typeof createClient>,
  slackChannelId: string | undefined,
  slackMessageTs: string | undefined,
  status: 'approved' | 'dismissed',
  slackUserId: string
): Promise<void> {
  if (!slackChannelId || !slackMessageTs) {
    return;
  }

  try {
    // Find matching Action Centre item
    const { data: item } = await supabase
      .from('action_centre_items')
      .select('id, status')
      .eq('slack_channel_id', slackChannelId)
      .eq('slack_message_ts', slackMessageTs)
      .eq('status', 'pending')
      .maybeSingle();

    if (!item) {
      console.log('[HITL] No matching Action Centre item found for Slack message');
      return;
    }

    // Update status
    const updateData = status === 'approved'
      ? { status: 'approved', approved_at: new Date().toISOString() }
      : { status: 'dismissed', dismissed_at: new Date().toISOString() };

    const { error } = await supabase
      .from('action_centre_items')
      .update(updateData)
      .eq('id', item.id);

    if (error) {
      console.error('[HITL] Failed to sync to Action Centre:', error);
    } else {
      console.log(`[HITL] Synced to Action Centre: item ${item.id} -> ${status}`);
    }
  } catch (err) {
    console.error('[HITL] Error syncing to Action Centre:', err);
  }
}

// =============================================================================
// Handler Functions
// =============================================================================

/**
 * Handle HITL approval button click
 */
export async function handleHITLApprove(
  payload: InteractivePayload,
  action: SlackAction
): Promise<HandleResult> {
  const requestId = action.value;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const userId = await getUserId(supabase, payload.user.id);

    // Call the RPC function to handle the response
    const { data, error } = await supabase.rpc('handle_hitl_response', {
      p_request_id: requestId,
      p_response_value: 'yes',
      p_response_context: {
        responded_via: 'slack',
        slack_user_id: payload.user.id,
        responded_by_user_id: userId,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to submit response');
    }

    // SS-001: Sync to Action Centre
    await syncToActionCentre(
      supabase,
      payload.channel?.id,
      payload.message?.ts,
      'approved',
      payload.user.id
    );

    // AP-007: Record autopilot approval signal (fire-and-forget)
    const nowMs = Date.now();
    supabase
      .from('hitl_requests')
      .select('created_at, organization_id, requested_by_user_id, execution_context')
      .eq('id', requestId)
      .maybeSingle()
      .then(({ data: hitlRow }) => {
        if (!hitlRow) return;
        const ctx = (hitlRow.execution_context ?? {}) as Record<string, unknown>;
        const rawActionType = (ctx['action_type'] as string | undefined) ?? 'unknown';
        const autonomyTier = (ctx['autonomy_tier'] as string | undefined) ?? 'approve';
        const timeToRespondMs = hitlRow.created_at
          ? nowMs - new Date(hitlRow.created_at).getTime()
          : undefined;
        const event: ApprovalEvent = {
          user_id: userId ?? (hitlRow.requested_by_user_id as string),
          org_id: hitlRow.organization_id as string,
          action_type: mapActionType(rawActionType),
          agent_name: 'slack-hitl',
          signal: 'approved',
          time_to_respond_ms: timeToRespondMs,
          autonomy_tier_at_time: autonomyTier,
        };
        recordSignal(supabase, event).catch(() => {});
      })
      .catch(() => {});

    // Return updated message
    return {
      success: true,
      responseBlocks: [
        header('✅ Approved'),
        context([`Approved by <@${payload.user.id}> • ${new Date().toISOString()}`]),
        divider(),
        section('_This request has been approved. The workflow will continue._'),
      ],
    };
  } catch (error) {
    console.error('[HITL] Approve error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve',
    };
  }
}

/**
 * Handle HITL rejection button click
 */
export async function handleHITLReject(
  payload: InteractivePayload,
  action: SlackAction
): Promise<HandleResult> {
  const requestId = action.value;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const userId = await getUserId(supabase, payload.user.id);

    // Call the RPC function to handle the response
    const { data, error } = await supabase.rpc('handle_hitl_response', {
      p_request_id: requestId,
      p_response_value: 'no',
      p_response_context: {
        responded_via: 'slack',
        slack_user_id: payload.user.id,
        responded_by_user_id: userId,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to submit response');
    }

    // SS-001: Sync to Action Centre
    await syncToActionCentre(
      supabase,
      payload.channel?.id,
      payload.message?.ts,
      'dismissed',
      payload.user.id
    );

    // AP-007: Record autopilot rejection signal (fire-and-forget)
    const nowMs = Date.now();
    supabase
      .from('hitl_requests')
      .select('created_at, organization_id, requested_by_user_id, execution_context')
      .eq('id', requestId)
      .maybeSingle()
      .then(({ data: hitlRow }) => {
        if (!hitlRow) return;
        const ctx = (hitlRow.execution_context ?? {}) as Record<string, unknown>;
        const rawActionType = (ctx['action_type'] as string | undefined) ?? 'unknown';
        const autonomyTier = (ctx['autonomy_tier'] as string | undefined) ?? 'approve';
        const timeToRespondMs = hitlRow.created_at
          ? nowMs - new Date(hitlRow.created_at).getTime()
          : undefined;
        const event: ApprovalEvent = {
          user_id: userId ?? (hitlRow.requested_by_user_id as string),
          org_id: hitlRow.organization_id as string,
          action_type: mapActionType(rawActionType),
          agent_name: 'slack-hitl',
          signal: 'rejected',
          time_to_respond_ms: timeToRespondMs,
          autonomy_tier_at_time: autonomyTier,
        };
        recordSignal(supabase, event).catch(() => {});
      })
      .catch(() => {});

    // Return updated message
    return {
      success: true,
      responseBlocks: [
        header('❌ Rejected'),
        context([`Rejected by <@${payload.user.id}> • ${new Date().toISOString()}`]),
        divider(),
        section('_This request has been rejected. The workflow may have stopped._'),
      ],
    };
  } catch (error) {
    console.error('[HITL] Reject error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reject',
    };
  }
}

/**
 * Handle HITL choice selection
 */
export async function handleHITLChoice(
  payload: InteractivePayload,
  action: SlackAction
): Promise<HandleResult> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse the value JSON
    let requestId: string;
    let choiceValue: string;

    try {
      const parsed = JSON.parse(action.value);
      requestId = parsed.requestId;
      choiceValue = parsed.choiceValue;
    } catch {
      throw new Error('Invalid action value');
    }

    const userId = await getUserId(supabase, payload.user.id);

    // Call the RPC function to handle the response
    const { data, error } = await supabase.rpc('handle_hitl_response', {
      p_request_id: requestId,
      p_response_value: choiceValue,
      p_response_context: {
        responded_via: 'slack',
        slack_user_id: payload.user.id,
        responded_by_user_id: userId,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to submit response');
    }

    // Return updated message
    return {
      success: true,
      responseBlocks: [
        header('🔘 Choice Selected'),
        context([`Selected by <@${payload.user.id}> • ${new Date().toISOString()}`]),
        divider(),
        section(`_Selected: *${choiceValue}*. The workflow will continue._`),
      ],
    };
  } catch (error) {
    console.error('[HITL] Choice error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit choice',
    };
  }
}

/**
 * Handle HITL cancel button click
 */
export async function handleHITLCancel(
  payload: InteractivePayload,
  action: SlackAction
): Promise<HandleResult> {
  const requestId = action.value;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Update the request to cancelled
    const { error: updateError } = await supabase
      .from('hitl_requests')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Get the execution ID to update it
    const { data: request } = await supabase
      .from('hitl_requests')
      .select('execution_id')
      .eq('id', requestId)
      .single();

    // Update the execution to cancelled
    if (request?.execution_id) {
      await supabase
        .from('sequence_executions')
        .update({
          status: 'cancelled',
          waiting_for_hitl: false,
          current_hitl_request_id: null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', request.execution_id);
    }

    // Return updated message
    return {
      success: true,
      responseBlocks: [
        header('🚫 Request Cancelled'),
        context([`Cancelled by <@${payload.user.id}> • ${new Date().toISOString()}`]),
        divider(),
        section('_This HITL request has been cancelled. The workflow has been stopped._'),
      ],
    };
  } catch (error) {
    console.error('[HITL] Cancel error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel',
    };
  }
}

/**
 * Handle "View in App" button click
 */
export async function handleHITLViewApp(
  payload: InteractivePayload,
  action: SlackAction
): Promise<HandleResult> {
  const requestId = action.value;

  // Return a message with the link
  return {
    success: true,
    responseBlocks: [
      section(`<${appUrl}/platform/hitl/${requestId}|🔗 Open in Sixty App>`),
    ],
  };
}

/**
 * Main HITL action router
 */
export async function handleHITLAction(
  actionId: string,
  payload: InteractivePayload,
  action: SlackAction
): Promise<HandleResult | null> {
  // Check if this is a HITL action
  if (!actionId.startsWith('hitl_')) {
    return null;
  }

  // Route to appropriate handler
  if (actionId === 'hitl_approve') {
    return handleHITLApprove(payload, action);
  }

  if (actionId === 'hitl_reject') {
    return handleHITLReject(payload, action);
  }

  if (actionId.startsWith('hitl_choice_') && actionId !== 'hitl_choice_actions') {
    return handleHITLChoice(payload, action);
  }

  if (actionId === 'hitl_cancel') {
    return handleHITLCancel(payload, action);
  }

  if (actionId === 'hitl_view_app') {
    return handleHITLViewApp(payload, action);
  }

  // Unknown HITL action
  console.log('[HITL] Unknown action:', actionId);
  return null;
}

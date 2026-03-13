/**
 * Morning Brief Action Handlers (PST-008 + PST-009)
 *
 * Handles button clicks from the enhanced morning brief:
 *   - Send/Edit/Dismiss pending follow-up drafts
 *   - Draft email / Create task from deal observations
 *   - Snooze / Dismiss observations
 *
 * All actions record outcomes via outcomeLearning (PST-009).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { recordOutcome } from '../../_shared/orchestrator/outcomeLearning.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';

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
  trigger_id?: string;
}

interface HandleResult {
  success: boolean;
  responseBlocks?: unknown[];
  error?: string;
}

// =============================================================================
// Helpers
// =============================================================================

async function getUserContext(
  supabase: ReturnType<typeof createClient>,
  slackUserId: string
): Promise<{ userId: string | null; orgId: string | null }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('slack_user_id', slackUserId)
    .maybeSingle();

  if (!profile?.id) return { userId: null, orgId: null };

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', profile.id)
    .limit(1)
    .maybeSingle();

  return { userId: profile.id, orgId: membership?.org_id || null };
}

function successBlock(message: string) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: message },
    },
  ];
}

// =============================================================================
// Draft Actions (from crm_approval_queue)
// =============================================================================

async function handleSend(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  valueData: { approvalId: string; dealId?: string }
): Promise<HandleResult> {
  // Update approval status to approved
  const { error } = await supabase
    .from('crm_approval_queue')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', valueData.approvalId);

  if (error) {
    return { success: false, error: `Failed to approve: ${error.message}` };
  }

  // PST-009: Record positive outcome
  await recordOutcome(supabase, orgId, userId, {
    actionId: valueData.approvalId,
    actionCategory: 'email_draft',
    verdict: 'accepted',
    confidence: 1,
    contextSnapshot: { dealId: valueData.dealId },
    generatedAt: new Date().toISOString(),
    respondedAt: new Date().toISOString(),
  });

  return {
    success: true,
    responseBlocks: successBlock('Sent. Follow-up delivered.'),
  };
}

async function handleEdit(
  _supabase: ReturnType<typeof createClient>,
  _userId: string,
  _orgId: string,
  valueData: { approvalId: string; dealId?: string }
): Promise<HandleResult> {
  // For now, redirect to the app for editing
  // Future: open Slack modal with editable draft
  const editUrl = valueData.dealId
    ? `${appUrl}/deals/${valueData.dealId}?edit=draft&approvalId=${valueData.approvalId}`
    : `${appUrl}/inbox?edit=draft&approvalId=${valueData.approvalId}`;

  return {
    success: true,
    responseBlocks: successBlock(`<${editUrl}|Open in 60 to edit>`),
  };
}

async function handleDismissDraft(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  valueData: { approvalId: string }
): Promise<HandleResult> {
  const { error } = await supabase
    .from('crm_approval_queue')
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
    .eq('id', valueData.approvalId);

  if (error) {
    return { success: false, error: `Failed to dismiss: ${error.message}` };
  }

  // PST-009: Record negative outcome
  await recordOutcome(supabase, orgId, userId, {
    actionId: valueData.approvalId,
    actionCategory: 'email_draft',
    verdict: 'rejected',
    confidence: 1,
    contextSnapshot: {},
    generatedAt: new Date().toISOString(),
    respondedAt: new Date().toISOString(),
  });

  return {
    success: true,
    responseBlocks: successBlock('Dismissed.'),
  };
}

// =============================================================================
// Observation Actions (from deal_observations)
// =============================================================================

async function handleDraftFromObservation(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  valueData: { observationId: string; dealId: string; category: string }
): Promise<HandleResult> {
  // Mark observation as acted on
  await supabase
    .from('deal_observations')
    .update({
      status: 'acted_on',
      resolved_at: new Date().toISOString(),
      resolution_type: 'user_action',
    })
    .eq('id', valueData.observationId);

  // Trigger follow-up draft via the orchestrator
  // Fire-and-forget call to the fleet router
  try {
    await fetch(`${supabaseUrl}/functions/v1/agent-fleet-router`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        event_type: 'stale_deal_revival',
        user_id: userId,
        org_id: orgId,
        context: { deal_id: valueData.dealId, source: 'morning_brief_observation' },
      }),
    });
  } catch {
    // Non-fatal — draft request queued
  }

  // PST-009: Record outcome
  await recordOutcome(supabase, orgId, userId, {
    actionId: valueData.observationId,
    actionCategory: 'reengagement',
    verdict: 'accepted',
    confidence: 1,
    contextSnapshot: { dealId: valueData.dealId },
    generatedAt: new Date().toISOString(),
    respondedAt: new Date().toISOString(),
  });

  return {
    success: true,
    responseBlocks: successBlock('Drafting email — you\'ll get it shortly.'),
  };
}

async function handleCreateTaskFromObservation(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  valueData: { observationId: string; dealId: string }
): Promise<HandleResult> {
  // Get the observation details for task creation
  const { data: obs } = await supabase
    .from('deal_observations')
    .select('title, description, category')
    .eq('id', valueData.observationId)
    .maybeSingle();

  if (!obs) {
    return { success: false, error: 'Observation not found' };
  }

  // Create a task
  const { error: taskErr } = await supabase.from('tasks').insert({
    title: obs.title,
    description: obs.description || `From ${obs.category.replace(/_/g, ' ')} observation`,
    deal_id: valueData.dealId,
    assigned_to: userId,
    created_by: userId,
    org_id: orgId,
    status: 'pending',
    source: 'proactive_heartbeat',
  });

  if (taskErr) {
    return { success: false, error: `Failed to create task: ${taskErr.message}` };
  }

  // Mark observation as acted on
  await supabase
    .from('deal_observations')
    .update({
      status: 'acted_on',
      resolved_at: new Date().toISOString(),
      resolution_type: 'user_action',
    })
    .eq('id', valueData.observationId);

  // PST-009: Record outcome
  await recordOutcome(supabase, orgId, userId, {
    actionId: valueData.observationId,
    actionCategory: 'task_suggestion',
    verdict: 'accepted',
    confidence: 1,
    contextSnapshot: { dealId: valueData.dealId },
    generatedAt: new Date().toISOString(),
    respondedAt: new Date().toISOString(),
  });

  return {
    success: true,
    responseBlocks: successBlock('Task created.'),
  };
}

async function handleSnoozeObservation(
  supabase: ReturnType<typeof createClient>,
  _userId: string,
  _orgId: string,
  valueData: { observationId: string }
): Promise<HandleResult> {
  const snoozeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('deal_observations')
    .update({
      status: 'snoozed',
      snooze_until: snoozeUntil,
      resolution_type: 'snoozed',
    })
    .eq('id', valueData.observationId);

  if (error) {
    return { success: false, error: `Failed to snooze: ${error.message}` };
  }

  return {
    success: true,
    responseBlocks: successBlock('Snoozed for 7 days.'),
  };
}

async function handleDismissObservation(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  valueData: { observationId: string }
): Promise<HandleResult> {
  const { error } = await supabase
    .from('deal_observations')
    .update({
      status: 'dismissed',
      resolved_at: new Date().toISOString(),
      resolution_type: 'dismissed',
    })
    .eq('id', valueData.observationId);

  if (error) {
    return { success: false, error: `Failed to dismiss: ${error.message}` };
  }

  // PST-009: Record negative outcome for learning
  await recordOutcome(supabase, orgId, userId, {
    actionId: valueData.observationId,
    actionCategory: 'general',
    verdict: 'rejected',
    confidence: 1,
    contextSnapshot: {},
    generatedAt: new Date().toISOString(),
    respondedAt: new Date().toISOString(),
  });

  return {
    success: true,
    responseBlocks: successBlock('Dismissed.'),
  };
}

// =============================================================================
// Main Router
// =============================================================================

/**
 * Handle morning brief actions from Slack interactive buttons.
 * Returns null if the action is not a morning brief action.
 */
export async function handleMorningBriefAction(
  actionId: string,
  payload: InteractivePayload,
  action: SlackAction
): Promise<HandleResult | null> {
  // Only handle morning_brief_* actions
  if (!actionId.startsWith('morning_brief_')) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { userId, orgId } = await getUserContext(supabase, payload.user.id);

  if (!userId || !orgId) {
    return { success: false, error: 'Could not identify user' };
  }

  let valueData: Record<string, unknown>;
  try {
    valueData = JSON.parse(action.value);
  } catch {
    return { success: false, error: 'Invalid action value' };
  }

  // Route by action prefix (action_id format: morning_brief_{action}::{id})
  const actionPrefix = actionId.split('::')[0];

  switch (actionPrefix) {
    case 'morning_brief_send':
      return handleSend(supabase, userId, orgId, valueData as { approvalId: string; dealId?: string });

    case 'morning_brief_edit':
      return handleEdit(supabase, userId, orgId, valueData as { approvalId: string; dealId?: string });

    case 'morning_brief_dismiss':
      return handleDismissDraft(supabase, userId, orgId, valueData as { approvalId: string });

    case 'morning_brief_draft':
      return handleDraftFromObservation(supabase, userId, orgId, valueData as { observationId: string; dealId: string; category: string });

    case 'morning_brief_task':
      return handleCreateTaskFromObservation(supabase, userId, orgId, valueData as { observationId: string; dealId: string });

    case 'morning_brief_snooze':
      return handleSnoozeObservation(supabase, userId, orgId, valueData as { observationId: string });

    case 'morning_brief_dismiss_obs':
      return handleDismissObservation(supabase, userId, orgId, valueData as { observationId: string });

    default:
      console.log('[morning-brief] Unknown action:', actionId);
      return null;
  }
}

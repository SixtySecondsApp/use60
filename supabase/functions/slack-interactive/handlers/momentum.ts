/**
 * Deal Momentum Action Handlers
 *
 * Handlers for Slack interactive actions from the Deal Momentum card.
 * These handle:
 * - Setting next step
 * - Marking milestones complete/blocked
 * - Logging activities
 * - Creating tasks
 * - Answering clarification questions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SlackAction {
  action_id: string;
  block_id?: string;
  value?: string;
  selected_option?: { value: string };
  type: string;
}

interface InteractivePayload {
  type: string;
  user: { id: string; name?: string };
  team?: { id: string };
  channel?: { id: string };
  trigger_id?: string;
  response_url?: string;
  view?: any;
  actions?: SlackAction[];
}

interface SixtyUserContext {
  sixtyUserId: string;
  orgId: string;
  profile: any;
}

/**
 * Handle "Set Next Step" button from momentum card
 * Opens a modal for the user to enter the next step with date
 */
export async function handleMomentumSetNextStep(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
  ctx: SixtyUserContext,
  botToken: string
): Promise<Response> {
  let actionData: { dealId?: string; dealName?: string } = {};
  try {
    actionData = JSON.parse(action.value || '{}');
  } catch {
    actionData = {};
  }

  if (!actionData.dealId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Open modal for setting next step
  const modal = {
    type: 'modal',
    callback_id: 'momentum_set_next_step_modal',
    private_metadata: JSON.stringify({
      dealId: actionData.dealId,
      dealName: actionData.dealName,
      orgId: ctx.orgId,
    }),
    title: {
      type: 'plain_text',
      text: 'Set Next Step',
    },
    submit: {
      type: 'plain_text',
      text: 'Save',
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Deal:* ${actionData.dealName || 'Unknown'}`,
        },
      },
      {
        type: 'input',
        block_id: 'next_step_input',
        label: {
          type: 'plain_text',
          text: 'Next Step',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'next_step_value',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., Demo to leadership team',
          },
          multiline: false,
        },
      },
      {
        type: 'input',
        block_id: 'next_step_date',
        label: {
          type: 'plain_text',
          text: 'Target Date',
        },
        element: {
          type: 'datepicker',
          action_id: 'next_step_date_value',
          placeholder: {
            type: 'plain_text',
            text: 'Select a date',
          },
        },
        optional: true,
      },
      {
        type: 'input',
        block_id: 'confidence_input',
        label: {
          type: 'plain_text',
          text: 'How confident are you in this next step?',
        },
        element: {
          type: 'static_select',
          action_id: 'confidence_value',
          options: [
            { text: { type: 'plain_text', text: 'High - Confirmed with customer' }, value: '1.0' },
            { text: { type: 'plain_text', text: 'Medium - Likely to happen' }, value: '0.7' },
            { text: { type: 'plain_text', text: 'Low - Tentative' }, value: '0.4' },
          ],
          initial_option: { text: { type: 'plain_text', text: 'Medium - Likely to happen' }, value: '0.7' },
        },
      },
    ],
  };

  const response = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: payload.trigger_id,
      view: modal,
    }),
  });

  const result = await response.json();
  if (!result.ok) {
    console.error('[momentum] Failed to open next step modal:', result.error);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle "Mark Milestone" button from momentum card
 * Opens a modal to select and update milestone status
 */
export async function handleMomentumMarkMilestone(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
  ctx: SixtyUserContext,
  botToken: string
): Promise<Response> {
  let actionData: { dealId?: string; dealName?: string } = {};
  try {
    actionData = JSON.parse(action.value || '{}');
  } catch {
    actionData = {};
  }

  if (!actionData.dealId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get current close plan milestones
  const { data: milestones } = await supabase
    .from('deal_close_plan_items')
    .select('id, milestone_key, title, status, due_date')
    .eq('deal_id', actionData.dealId)
    .order('sort_order', { ascending: true });

  // Build milestone options (only show non-completed ones)
  const pendingMilestones = (milestones || []).filter(m => m.status !== 'completed');

  if (pendingMilestones.length === 0) {
    // All milestones complete - just acknowledge
    if (payload.response_url) {
      await fetch(payload.response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: '✅ All milestones are already complete!',
          replace_original: false,
          response_type: 'ephemeral',
        }),
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const milestoneOptions = pendingMilestones.map(m => ({
    text: { type: 'plain_text', text: m.title || m.milestone_key },
    value: m.id,
  }));

  // Open modal for marking milestone
  const modal = {
    type: 'modal',
    callback_id: 'momentum_mark_milestone_modal',
    private_metadata: JSON.stringify({
      dealId: actionData.dealId,
      dealName: actionData.dealName,
      orgId: ctx.orgId,
    }),
    title: {
      type: 'plain_text',
      text: 'Update Milestone',
    },
    submit: {
      type: 'plain_text',
      text: 'Update',
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Deal:* ${actionData.dealName || 'Unknown'}`,
        },
      },
      {
        type: 'input',
        block_id: 'milestone_select',
        label: {
          type: 'plain_text',
          text: 'Milestone',
        },
        element: {
          type: 'static_select',
          action_id: 'milestone_value',
          placeholder: {
            type: 'plain_text',
            text: 'Select a milestone',
          },
          options: milestoneOptions,
        },
      },
      {
        type: 'input',
        block_id: 'status_select',
        label: {
          type: 'plain_text',
          text: 'Status',
        },
        element: {
          type: 'static_select',
          action_id: 'status_value',
          options: [
            { text: { type: 'plain_text', text: '✅ Complete' }, value: 'completed' },
            { text: { type: 'plain_text', text: '🔄 In Progress' }, value: 'in_progress' },
            { text: { type: 'plain_text', text: '🚧 Blocked' }, value: 'blocked' },
            { text: { type: 'plain_text', text: '⏭️ Skipped' }, value: 'skipped' },
          ],
        },
      },
      {
        type: 'input',
        block_id: 'blocker_note',
        label: {
          type: 'plain_text',
          text: 'Blocker Note (if blocked)',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'blocker_value',
          placeholder: {
            type: 'plain_text',
            text: 'What\'s blocking this milestone?',
          },
          multiline: true,
        },
        optional: true,
      },
    ],
  };

  const response = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: payload.trigger_id,
      view: modal,
    }),
  });

  const result = await response.json();
  if (!result.ok) {
    console.error('[momentum] Failed to open milestone modal:', result.error);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle clarification question answer buttons
 * Updates deal truth field with user's response
 */
export async function handleMomentumAnswerQuestion(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
  ctx: SixtyUserContext,
  botToken: string
): Promise<Response> {
  let actionData: {
    dealId?: string;
    fieldKey?: string;
    answer?: string;
    answerId?: string;
    answerLabel?: string;
  } = {};
  try {
    actionData = JSON.parse(action.value || '{}');
  } catch {
    actionData = {};
  }

  if (!actionData.dealId || !actionData.fieldKey) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const isUnknown = actionData.answer === 'unknown';
  const valueToStore = isUnknown ? null : (actionData.answerLabel || actionData.answerId || actionData.answer);

  // Update the deal truth field
  const { error } = await supabase
    .from('deal_truth_fields')
    .upsert(
      {
        deal_id: actionData.dealId,
        org_id: ctx.orgId,
        field_key: actionData.fieldKey,
        value: valueToStore,
        confidence: isUnknown ? 0.0 : 1.0, // Manual entry = high confidence, unknown = 0
        source: 'slack_answer',
        last_updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'deal_id,field_key',
      }
    );

  if (error) {
    console.error('[momentum] Error updating truth field:', error);
  }

  // Update the message to show the answer was recorded
  if (payload.response_url) {
    const confirmText = isUnknown
      ? `📝 Noted - "${actionData.fieldKey}" marked as unknown. We'll check back later.`
      : `✅ Got it! "${actionData.fieldKey}" updated to "${valueToStore}".`;

    await fetch(payload.response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: confirmText,
        replace_original: true,
        response_type: 'in_channel',
      }),
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle next step modal submission
 */
export async function handleMomentumNextStepSubmission(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const values = payload.view?.state?.values;
  const metadata = JSON.parse(payload.view?.private_metadata || '{}');

  const nextStepValue = values?.next_step_input?.next_step_value?.value;
  const nextStepDate = values?.next_step_date?.next_step_date_value?.selected_date;
  const confidence = parseFloat(values?.confidence_input?.confidence_value?.selected_option?.value || '0.7');

  if (!metadata.dealId || !nextStepValue) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  // Format the next step with date if provided
  const formattedValue = nextStepDate
    ? `${nextStepValue} - ${formatDate(nextStepDate)}`
    : nextStepValue;

  // Update deal truth field
  const { error } = await supabase
    .from('deal_truth_fields')
    .upsert(
      {
        deal_id: metadata.dealId,
        org_id: metadata.orgId,
        field_key: 'next_step',
        value: formattedValue,
        confidence,
        source: 'slack_modal',
        last_updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'deal_id,field_key',
      }
    );

  if (error) {
    console.error('[momentum] Error updating next step:', error);
    return new Response(JSON.stringify({
      response_action: 'errors',
      errors: { next_step_input: 'Failed to save next step. Please try again.' },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Close modal with success
  return new Response('', { status: 200, headers: corsHeaders });
}

/**
 * Handle milestone modal submission
 */
export async function handleMomentumMilestoneSubmission(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const values = payload.view?.state?.values;
  const metadata = JSON.parse(payload.view?.private_metadata || '{}');

  const milestoneId = values?.milestone_select?.milestone_value?.selected_option?.value;
  const status = values?.status_select?.status_value?.selected_option?.value;
  const blockerNote = values?.blocker_note?.blocker_value?.value;

  if (!milestoneId || !status) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  // Build update data
  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'completed') {
    updateData.completed_at = new Date().toISOString();
    updateData.blocker_note = null;
  } else if (status === 'blocked') {
    updateData.blocker_note = blockerNote || 'Blocked';
    updateData.completed_at = null;
  } else {
    updateData.blocker_note = null;
    updateData.completed_at = null;
  }

  // Update milestone
  const { error } = await supabase
    .from('deal_close_plan_items')
    .update(updateData)
    .eq('id', milestoneId);

  if (error) {
    console.error('[momentum] Error updating milestone:', error);
    return new Response(JSON.stringify({
      response_action: 'errors',
      errors: { milestone_select: 'Failed to update milestone. Please try again.' },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Close modal with success
  return new Response('', { status: 200, headers: corsHeaders });
}

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

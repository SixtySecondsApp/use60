/**
 * Calendar Slack Interactive Handler
 * Handles time slot selection and calendar event creation from Slack
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface CalendarActionContext {
  actionId: string;
  actionValue: string;
  userId: string;
  orgId: string;
  channelId: string;
  messageTs: string;
  responseUrl: string;
}

export async function handleCalendarAction(ctx: CalendarActionContext): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Parse action: cal_send_invite_{job_id}, cal_send_times_{job_id}, cal_more_options_{job_id}, cal_handle_myself_{job_id}, cal_select_slot_{slot_index}_{job_id}
  const parts = ctx.actionId.split('_');
  const action = parts[1]; // send, more, handle, select

  if (action === 'select') {
    // User selected a time slot from radio buttons
    const slotIndex = parseInt(parts[2]);
    const jobId = parts.slice(3).join('_');

    // Store selected slot in pending action
    await supabase
      .from('slack_pending_actions')
      .update({
        metadata: { selected_slot_index: slotIndex },
        updated_at: new Date().toISOString(),
      })
      .eq('id', ctx.actionValue);

    await sendSlackResponse(ctx.responseUrl, `✅ Slot ${slotIndex + 1} selected. Choose an action above.`);

  } else if (action === 'send' && parts[2] === 'invite') {
    // Send calendar invite for selected slot
    const jobId = parts.slice(3).join('_');

    // Load the pending action to get slot data
    const { data: pendingAction } = await supabase
      .from('slack_pending_actions')
      .select('id, sequence_context, metadata')
      .eq('id', ctx.actionValue)
      .maybeSingle();

    if (!pendingAction?.metadata?.selected_slot_index && pendingAction?.metadata?.selected_slot_index !== 0) {
      await sendSlackResponse(ctx.responseUrl, '⚠️ Please select a time slot first.');
      return;
    }

    // Call create-calendar-event
    const slots = pendingAction.sequence_context?.available_slots || [];
    const selectedSlot = slots[pendingAction.metadata.selected_slot_index];

    if (!selectedSlot) {
      await sendSlackResponse(ctx.responseUrl, '⚠️ Selected slot no longer available.');
      return;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/create-calendar-event`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: ctx.userId,
        org_id: ctx.orgId,
        slot: selectedSlot,
        attendee_email: pendingAction.sequence_context?.prospect_email,
        title: pendingAction.sequence_context?.meeting_title || 'Meeting',
      }),
    });

    if (response.ok) {
      // Mark pending action as confirmed
      await supabase
        .from('slack_pending_actions')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', pendingAction.id);

      await sendSlackResponse(ctx.responseUrl, `📅 Calendar invite sent for ${selectedSlot.start_time}!`);
    } else {
      const errorText = await response.text();
      await sendSlackResponse(ctx.responseUrl, `⚠️ Failed to create event: ${errorText}`);
    }

  } else if (action === 'send' && parts[2] === 'times') {
    // Send available times via email
    const jobId = parts.slice(3).join('_');

    const { data: pendingAction } = await supabase
      .from('slack_pending_actions')
      .select('id, sequence_context')
      .eq('id', ctx.actionValue)
      .maybeSingle();

    if (!pendingAction) {
      await sendSlackResponse(ctx.responseUrl, '⚠️ Action expired.');
      return;
    }

    // Resume orchestrator with email_times action
    await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resume_job_id: jobId,
        approval_data: {
          action: 'send_times_email',
          approved_by: ctx.userId,
          approved_at: new Date().toISOString(),
          slots: pendingAction.sequence_context?.available_slots,
        },
      }),
    });

    await supabase
      .from('slack_pending_actions')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', pendingAction.id);

    await sendSlackResponse(ctx.responseUrl, '📧 Sending available times via email...');

  } else if (action === 'more') {
    // Show more time options
    const jobId = parts.slice(2).join('_');

    // Re-invoke find-available-slots with extended range
    await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resume_job_id: jobId,
        approval_data: {
          action: 'show_more_options',
          approved_by: ctx.userId,
          extended_days: 10,
        },
      }),
    });

    await sendSlackResponse(ctx.responseUrl, '🔍 Looking for more available times...');

  } else if (action === 'handle') {
    // User will handle scheduling themselves
    const jobId = parts.slice(2).join('_');

    await supabase
      .from('slack_pending_actions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', ctx.actionValue);

    await sendSlackResponse(ctx.responseUrl, '👍 Got it! You\'ll handle scheduling.');
  }
}

async function sendSlackResponse(responseUrl: string, text: string): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, replace_original: false }),
    });
  } catch (err) {
    console.error('[calendar-handler] Failed to send Slack response:', err);
  }
}

/**
 * Build Slack blocks for calendar time slot selection
 */
export function buildCalendarSlotsMessage(
  slots: Array<{ start_time: string; end_time: string; score?: number; timezone?: string }>,
  jobId: string,
  pendingActionId: string,
  prospectName?: string,
): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📅 Available Times${prospectName ? ` for ${prospectName}` : ''}`, emoji: true },
    },
    { type: 'divider' },
  ];

  // Add slots as radio button options
  const options = slots.slice(0, 5).map((slot, i) => ({
    text: { type: 'plain_text', text: `${formatSlotTime(slot.start_time, slot.timezone)} - ${formatSlotTime(slot.end_time, slot.timezone)}` },
    value: `${i}`,
  }));

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: 'Select a time slot:' },
    accessory: {
      type: 'radio_buttons',
      action_id: `cal_select_slot_${jobId}`,
      options,
    },
  });

  blocks.push({ type: 'divider' });

  // Action buttons
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '📅 Send Invite', emoji: true },
        action_id: `cal_send_invite_${jobId}`,
        value: pendingActionId,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '📧 Send Times via Email', emoji: true },
        action_id: `cal_send_times_${jobId}`,
        value: pendingActionId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '🔍 More Options', emoji: true },
        action_id: `cal_more_${jobId}`,
        value: pendingActionId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'I\'ll Handle This', emoji: true },
        action_id: `cal_handle_${jobId}`,
        value: pendingActionId,
      },
    ],
  });

  return blocks;
}

function formatSlotTime(isoTime: string, timezone?: string): string {
  try {
    const date = new Date(isoTime);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone || 'UTC',
      timeZoneName: 'short',
    });
  } catch {
    return isoTime;
  }
}

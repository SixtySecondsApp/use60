/**
 * Slack Copilot Actions Edge Function
 * 
 * PROACTIVE-005: Handle Slack button clicks and replies for proactive messages.
 * 
 * Handles:
 * - Button clicks (Draft Email, View Brief, More Info)
 * - Threaded replies as copilot prompts
 * - Execute sequences based on Slack actions
 * - Send responses back to Slack thread
 * - Support HITL confirmation flow in Slack
 * 
 * @see docs/PRD_PROACTIVE_AI_TEAMMATE.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ============================================================================
// Types
// ============================================================================

interface SlackInteraction {
  type: 'block_actions' | 'message_action' | 'view_submission';
  user: { id: string; username: string; name: string };
  team: { id: string };
  channel: { id: string };
  message?: { ts: string; thread_ts?: string };
  actions?: Array<{
    action_id: string;
    block_id?: string;
    value?: string;
    type: string;
  }>;
  trigger_id?: string;
  response_url?: string;
}

interface SlackEvent {
  type: string;
  user: string;
  channel: string;
  text: string;
  ts: string;
  thread_ts?: string;
  event_ts: string;
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const contentType = req.headers.get('content-type') || '';
    
    // Handle Slack URL verification and JSON payloads
    if (contentType.includes('application/json')) {
      const body = await req.json();

      // URL verification challenge
      if (body.type === 'url_verification') {
        return new Response(body.challenge, {
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // Event callback (threaded replies)
      if (body.type === 'event_callback') {
        await handleSlackEvent(supabase, body.event);
        return new Response('ok', { headers: corsHeaders });
      }

      // Forwarded from slack-interactive (JSON body with type: 'block_actions')
      if (body.type === 'block_actions' && body.actions) {
        console.log('[slack-copilot-actions] Received forwarded action from slack-interactive');
        await handleSlackInteraction(supabase, body as SlackInteraction);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    // Handle form-encoded payload (button clicks)
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      const payload = formData.get('payload');
      
      if (payload) {
        const interaction = JSON.parse(payload as string) as SlackInteraction;
        await handleSlackInteraction(supabase, interaction);
        return new Response('', { status: 200 });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[slack-copilot-actions] Error:', error);
    return new Response('ok', { status: 200 }); // Always return 200 to Slack
  }
});

// ============================================================================
// Handle Slack Interaction (Button Clicks)
// ============================================================================

async function handleSlackInteraction(
  supabase: any,
  interaction: SlackInteraction
): Promise<void> {
  console.log('[SlackActions] Handling interaction:', {
    type: interaction.type,
    user: interaction.user.id,
    actions: interaction.actions?.map(a => a.action_id),
  });

  // Get user from Slack ID
  const { data: slackAuth } = await supabase
    .from('slack_auth')
    .select('user_id, access_token, organization_id')
    .eq('slack_user_id', interaction.user.id)
    .maybeSingle();

  if (!slackAuth) {
    console.log('[SlackActions] No user found for Slack ID:', interaction.user.id);
    await sendSlackEphemeral(
      interaction.response_url!,
      'Please connect your Slack account in 60 Settings first.'
    );
    return;
  }

  for (const action of interaction.actions || []) {
    await processAction(supabase, slackAuth, interaction, action);
  }
}

async function processAction(
  supabase: any,
  slackAuth: any,
  interaction: SlackInteraction,
  action: { action_id: string; value?: string }
): Promise<void> {
  const actionId = action.action_id;
  const value = action.value ? JSON.parse(action.value) : {};

  console.log('[SlackActions] Processing action:', actionId, value);

  // Pipeline action buttons
  if (actionId.startsWith('pipeline_action_')) {
    await handlePipelineAction(supabase, slackAuth, interaction, value);
    return;
  }

  // Task action buttons
  if (actionId.startsWith('task_action_')) {
    await handleTaskAction(supabase, slackAuth, interaction, actionId, value);
    return;
  }

  // HITL confirmation buttons
  if (actionId === 'confirm_action') {
    await handleHitlConfirm(supabase, slackAuth, interaction, value);
    return;
  }

  if (actionId === 'cancel_action') {
    await handleHitlCancel(supabase, slackAuth, interaction, value);
    return;
  }

  // Open dashboard/copilot buttons
  if (actionId === 'open_dashboard' || actionId === 'open_copilot') {
    // These are URL buttons, no handler needed
    return;
  }

  // View brief button
  if (actionId === 'view_brief') {
    // URL button, no handler needed
    return;
  }

  console.log('[SlackActions] Unknown action:', actionId);
}

// ============================================================================
// Handle Pipeline Actions (with HITL Preview → Confirm pattern)
// ============================================================================

/**
 * Generate a unique pending action ID for tracking confirmation state.
 */
function generatePendingActionId(): string {
  return `slack_pending_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Store a pending action for later confirmation.
 * This is the Slack equivalent of the in-app pending_action pattern.
 */
async function storePendingAction(
  supabase: any,
  pendingActionId: string,
  data: {
    userId: string;
    orgId: string;
    channelId: string;
    threadTs?: string;
    sequenceKey: string;
    sequenceContext: Record<string, unknown>;
    preview: string;
    expiresAt: string;
  }
): Promise<void> {
  await supabase
    .from('slack_pending_actions')
    .upsert({
      id: pendingActionId,
      user_id: data.userId,
      org_id: data.orgId,
      channel_id: data.channelId,
      thread_ts: data.threadTs,
      sequence_key: data.sequenceKey,
      sequence_context: data.sequenceContext,
      preview: data.preview,
      status: 'pending',
      expires_at: data.expiresAt,
      created_at: new Date().toISOString(),
    });
}

/**
 * Get a pending action by ID.
 */
async function getPendingAction(
  supabase: any,
  pendingActionId: string
): Promise<any | null> {
  const { data } = await supabase
    .from('slack_pending_actions')
    .select('*')
    .eq('id', pendingActionId)
    .eq('status', 'pending')
    .maybeSingle();

  return data;
}

/**
 * Mark a pending action as completed or cancelled.
 */
async function updatePendingAction(
  supabase: any,
  pendingActionId: string,
  status: 'confirmed' | 'cancelled'
): Promise<void> {
  await supabase
    .from('slack_pending_actions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', pendingActionId);
}

async function handlePipelineAction(
  supabase: any,
  slackAuth: any,
  interaction: SlackInteraction,
  value: { type?: string; dealId?: string; contactId?: string; sequenceKey?: string }
): Promise<void> {
  const { dealId, contactId, sequenceKey } = value;

  if (!sequenceKey) {
    await sendSlackMessage(
      slackAuth.access_token,
      interaction.channel.id,
      '❌ No action configured for this button.',
      interaction.message?.ts
    );
    return;
  }

  // Acknowledge the action
  await sendSlackMessage(
    slackAuth.access_token,
    interaction.channel.id,
    '🔍 Preparing preview...',
    interaction.message?.ts
  );

  try {
    // Build sequence context
    const sequenceContext: Record<string, unknown> = {};
    if (dealId) sequenceContext.deal_id = dealId;
    if (contactId) sequenceContext.contact_id = contactId;

    // Step 1: Run sequence in SIMULATION mode to get preview
    const { data: previewResult, error: previewError } = await supabase.functions.invoke('api-copilot/chat', {
      body: {
        message: `Run ${sequenceKey} in preview mode`,
        context: {
          userId: slackAuth.user_id,
          orgId: slackAuth.organization_id,
          dealId,
          contactId,
          source: 'slack_proactive',
          forceSequence: sequenceKey,
          isSimulation: true, // Preview mode
        },
      },
    });

    if (previewError) throw previewError;

    // Extract preview content from the response
    const preview = previewResult?.response?.content
      || previewResult?.structuredResponse?.data?.preview
      || previewResult?.summary
      || 'Preview not available. Click Confirm to proceed.';

    // Generate pending action ID
    const pendingActionId = generatePendingActionId();

    // Store the pending action for confirmation
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min expiry
    await storePendingAction(supabase, pendingActionId, {
      userId: slackAuth.user_id,
      orgId: slackAuth.organization_id,
      channelId: interaction.channel.id,
      threadTs: interaction.message?.ts,
      sequenceKey,
      sequenceContext,
      preview: preview.substring(0, 3000),
      expiresAt,
    });

    // Build action description
    const actionDescription = sequenceKey === 'seq-deal-rescue-pack'
      ? 'Deal Rescue Analysis'
      : sequenceKey === 'seq-post-meeting-followup-pack'
      ? 'Send Follow-up Email'
      : sequenceKey === 'seq-next-meeting-command-center'
      ? 'Meeting Prep Brief'
      : 'Execute Action';

    // Step 2: Send preview with Confirm/Cancel buttons
    await sendSlackBlocks(
      slackAuth.access_token,
      interaction.channel.id,
      [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `📋 Preview: ${actionDescription}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: preview.substring(0, 2900),
          },
        },
        { type: 'divider' },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '⚠️ _Review the above preview before confirming. This action cannot be undone._',
            },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ Confirm',
                emoji: true,
              },
              style: 'primary',
              action_id: 'confirm_action',
              value: JSON.stringify({ pendingActionId, sequenceKey }),
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '❌ Cancel',
                emoji: true,
              },
              style: 'danger',
              action_id: 'cancel_action',
              value: JSON.stringify({ pendingActionId, sequenceKey }),
            },
          ],
        },
      ],
      `Preview: ${actionDescription}`,
      interaction.message?.ts
    );

    // Log engagement event for preview shown
    await supabase.rpc('log_copilot_engagement', {
      p_org_id: slackAuth.organization_id,
      p_user_id: slackAuth.user_id,
      p_event_type: 'preview_shown',
      p_trigger_type: 'proactive',
      p_channel: 'slack',
      p_sequence_key: sequenceKey,
      p_metadata: { dealId, contactId, pendingActionId },
    });

  } catch (err) {
    console.error('[SlackActions] Pipeline action failed:', err);
    await sendSlackMessage(
      slackAuth.access_token,
      interaction.channel.id,
      `❌ Sorry, something went wrong. Please try again in the app.`,
      interaction.message?.ts
    );
  }
}

// ============================================================================
// Handle Task Actions
// ============================================================================

async function handleTaskAction(
  supabase: any,
  slackAuth: any,
  interaction: SlackInteraction,
  actionId: string,
  value: any
): Promise<void> {
  // Parse action ID: task_action_{taskId}_{actionType}
  const parts = actionId.split('_');
  const taskId = parts[2];
  const actionType = parts[3];

  await sendSlackMessage(
    slackAuth.access_token,
    interaction.channel.id,
    '🔄 On it...',
    interaction.message?.ts
  );

  try {
    const { data, error } = await supabase.functions.invoke('proactive-task-analysis', {
      body: {
        action: 'execute_action',
        userId: slackAuth.user_id,
        taskId,
        actionType,
        sequenceKey: value?.sequenceKey,
      },
    });

    if (error) throw error;

    let message = '✅ Done!';
    if (actionType === 'reschedule') {
      message = `✅ Task rescheduled to tomorrow`;
    } else if (actionType === 'complete') {
      message = `✅ Task marked as complete`;
    } else if (data?.result?.response?.content) {
      message = data.result.response.content.substring(0, 3000);
    }

    await sendSlackMessage(
      slackAuth.access_token,
      interaction.channel.id,
      message,
      interaction.message?.ts
    );

  } catch (err) {
    console.error('[SlackActions] Task action failed:', err);
    await sendSlackMessage(
      slackAuth.access_token,
      interaction.channel.id,
      `❌ Sorry, couldn't complete that action. Try again in the app.`,
      interaction.message?.ts
    );
  }
}

// ============================================================================
// Handle HITL Confirmation (with full sequence execution)
// ============================================================================

async function handleHitlConfirm(
  supabase: any,
  slackAuth: any,
  interaction: SlackInteraction,
  value: { pendingActionId?: string; sequenceKey?: string }
): Promise<void> {
  const { pendingActionId, sequenceKey } = value;

  // Look up the pending action
  let pendingAction = null;
  if (pendingActionId) {
    pendingAction = await getPendingAction(supabase, pendingActionId);
    if (!pendingAction) {
      await sendSlackMessage(
        slackAuth.access_token,
        interaction.channel.id,
        '⚠️ This action has expired or was already processed. Please try again.',
        interaction.message?.ts
      );
      return;
    }
  }

  await sendSlackMessage(
    slackAuth.access_token,
    interaction.channel.id,
    '✅ Confirmed! Executing...',
    interaction.message?.ts
  );

  try {
    // Execute the sequence for real (is_simulation: false)
    const { data, error } = await supabase.functions.invoke('api-copilot/chat', {
      body: {
        message: `Execute ${pendingAction?.sequence_key || sequenceKey}`,
        context: {
          userId: slackAuth.user_id,
          orgId: slackAuth.organization_id,
          source: 'slack_proactive',
          forceSequence: pendingAction?.sequence_key || sequenceKey,
          isSimulation: false, // Execute for real
          sequenceContext: pendingAction?.sequence_context || {},
          isConfirmation: true,
        },
      },
    });

    if (error) throw error;

    // Mark the pending action as confirmed
    if (pendingActionId) {
      await updatePendingAction(supabase, pendingActionId, 'confirmed');
    }

    // Extract result and format response
    const response = data?.response?.content
      || data?.structuredResponse?.data?.result
      || data?.summary
      || '✅ Action completed successfully!';

    await sendSlackMessage(
      slackAuth.access_token,
      interaction.channel.id,
      response.substring(0, 3000),
      interaction.message?.ts
    );

    // Log engagement
    await supabase.rpc('log_copilot_engagement', {
      p_org_id: slackAuth.organization_id,
      p_user_id: slackAuth.user_id,
      p_event_type: 'confirmation_given',
      p_trigger_type: 'proactive',
      p_channel: 'slack',
      p_sequence_key: pendingAction?.sequence_key || sequenceKey,
      p_metadata: {
        pendingActionId,
        sequenceContext: pendingAction?.sequence_context,
      },
    });

  } catch (err) {
    console.error('[SlackActions] HITL confirm failed:', err);
    await sendSlackMessage(
      slackAuth.access_token,
      interaction.channel.id,
      '❌ Failed to execute action. Please try again in the app.',
      interaction.message?.ts
    );
  }
}

async function handleHitlCancel(
  supabase: any,
  slackAuth: any,
  interaction: SlackInteraction,
  value: { pendingActionId?: string; sequenceKey?: string }
): Promise<void> {
  const { pendingActionId, sequenceKey } = value;

  // Mark the pending action as cancelled
  if (pendingActionId) {
    await updatePendingAction(supabase, pendingActionId, 'cancelled');
  }

  await sendSlackMessage(
    slackAuth.access_token,
    interaction.channel.id,
    '❌ Action cancelled. No changes were made.',
    interaction.message?.ts
  );

  // Log engagement
  await supabase.rpc('log_copilot_engagement', {
    p_org_id: slackAuth.organization_id,
    p_user_id: slackAuth.user_id,
    p_event_type: 'confirmation_denied',
    p_trigger_type: 'proactive',
    p_channel: 'slack',
    p_sequence_key: sequenceKey,
    p_metadata: { pendingActionId },
  });
}

// ============================================================================
// Handle Slack Events (Threaded Replies)
// ============================================================================

async function handleSlackEvent(
  supabase: any,
  event: SlackEvent
): Promise<void> {
  // Only handle message replies in threads
  if (event.type !== 'message' || !event.thread_ts) {
    return;
  }

  // Ignore bot messages
  if (event.text?.includes('Bot') || !event.user) {
    return;
  }

  console.log('[SlackActions] Handling threaded reply:', {
    user: event.user,
    text: event.text?.substring(0, 100),
  });

  // Get user from Slack ID
  const { data: slackAuth } = await supabase
    .from('slack_auth')
    .select('user_id, access_token, organization_id')
    .eq('slack_user_id', event.user)
    .maybeSingle();

  if (!slackAuth) {
    return;
  }

  try {
    // Treat the reply as a copilot prompt
    const { data, error } = await supabase.functions.invoke('api-copilot/chat', {
      body: {
        message: event.text,
        context: {
          userId: slackAuth.user_id,
          orgId: slackAuth.organization_id,
          source: 'slack_thread',
        },
      },
    });

    if (error) throw error;

    // Send response back to the thread
    const response = data?.response?.content || data?.summary || '';
    if (response) {
      await sendSlackMessage(
        slackAuth.access_token,
        event.channel,
        response.substring(0, 3000),
        event.thread_ts
      );
    }

  } catch (err) {
    console.error('[SlackActions] Thread reply failed:', err);
  }
}

// ============================================================================
// Slack API Helpers
// ============================================================================

async function sendSlackMessage(
  accessToken: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<boolean> {
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        text,
        thread_ts: threadTs,
      }),
    });

    const result = await response.json();
    return result.ok === true;
  } catch (err) {
    console.error('[SlackActions] Failed to send message:', err);
    return false;
  }
}

/**
 * Send a Slack message with Block Kit blocks (for rich formatting).
 */
async function sendSlackBlocks(
  accessToken: string,
  channel: string,
  blocks: any[],
  fallbackText: string,
  threadTs?: string
): Promise<boolean> {
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        blocks,
        text: fallbackText, // Fallback for notifications
        thread_ts: threadTs,
      }),
    });

    const result = await response.json();
    if (!result.ok) {
      console.error('[SlackActions] Block message failed:', result.error);
    }
    return result.ok === true;
  } catch (err) {
    console.error('[SlackActions] Failed to send block message:', err);
    return false;
  }
}

async function sendSlackEphemeral(
  responseUrl: string,
  text: string
): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        text,
      }),
    });
  } catch (err) {
    console.error('[SlackActions] Failed to send ephemeral:', err);
  }
}

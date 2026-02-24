/**
 * Slack HITL Notification Edge Function
 *
 * Sends Human-in-the-Loop (HITL) requests to Slack channels with interactive buttons.
 * Supports different request types: confirmation, question, choice, input.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

// =============================================================================
// Types
// =============================================================================

interface HITLRequest {
  id: string;
  execution_id: string;
  sequence_key: string;
  step_index: number;
  organization_id: string;
  requested_by_user_id: string;
  assigned_to_user_id: string | null;
  request_type: 'confirmation' | 'question' | 'choice' | 'input';
  prompt: string;
  options: Array<{ value: string; label: string }> | null;
  default_value: string | null;
  channels: string[];
  slack_channel_id: string | null;
  timeout_minutes: number;
  timeout_action: 'fail' | 'continue' | 'use_default';
  expires_at: string | null;
  execution_context: Record<string, unknown>;
  status: 'pending' | 'responded' | 'expired' | 'cancelled';
}

interface SlackBlock {
  type: string;
  text?: unknown;
  accessory?: unknown;
  elements?: unknown[];
  block_id?: string;
}

interface SlackMessage {
  channel: string;
  text: string;
  blocks?: SlackBlock[];
}

// =============================================================================
// Slack Block Builders
// =============================================================================

function header(text: string): SlackBlock {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text: text.substring(0, 150),
      emoji: true,
    },
  };
}

function section(text: string): SlackBlock {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: text.substring(0, 3000),
    },
  };
}

function context(elements: string[]): SlackBlock {
  return {
    type: 'context',
    elements: elements.map((text) => ({
      type: 'mrkdwn',
      text: text.substring(0, 300),
    })),
  };
}

function divider(): SlackBlock {
  return { type: 'divider' };
}

function actions(blockId: string, elements: unknown[]): SlackBlock {
  return {
    type: 'actions',
    block_id: blockId,
    elements,
  };
}

function button(
  text: string,
  actionId: string,
  value: string,
  style?: 'primary' | 'danger'
): unknown {
  const btn: Record<string, unknown> = {
    type: 'button',
    text: {
      type: 'plain_text',
      text: text.substring(0, 75),
      emoji: true,
    },
    action_id: actionId,
    value,
  };
  if (style) {
    btn.style = style;
  }
  return btn;
}

// =============================================================================
// Message Builders
// =============================================================================

function buildConfirmationMessage(request: HITLRequest): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push(header('🤝 Approval Required'));
  blocks.push(
    context([
      `📋 Sequence: *${request.sequence_key}* • Step ${request.step_index + 1}`,
    ])
  );
  blocks.push(divider());

  // Prompt
  blocks.push(section(request.prompt));

  blocks.push(divider());

  // Expiration info
  if (request.expires_at) {
    const expiresDate = new Date(request.expires_at);
    blocks.push(
      context([
        `⏱️ Expires: <!date^${Math.floor(expiresDate.getTime() / 1000)}^{date_short_pretty} at {time}|${expiresDate.toISOString()}>`,
      ])
    );
  }

  // Action buttons
  blocks.push(
    actions(`hitl_confirmation_${request.id}`, [
      button('✅ Approve', 'hitl_approve', request.id, 'primary'),
      button('❌ Reject', 'hitl_reject', request.id, 'danger'),
      button('🔗 View in App', 'hitl_view_app', request.id),
    ])
  );

  return blocks;
}

function buildQuestionMessage(request: HITLRequest): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push(header('❓ Response Required'));
  blocks.push(
    context([
      `📋 Sequence: *${request.sequence_key}* • Step ${request.step_index + 1}`,
    ])
  );
  blocks.push(divider());

  // Prompt
  blocks.push(section(request.prompt));

  blocks.push(divider());

  // Expiration info
  if (request.expires_at) {
    const expiresDate = new Date(request.expires_at);
    blocks.push(
      context([
        `⏱️ Expires: <!date^${Math.floor(expiresDate.getTime() / 1000)}^{date_short_pretty} at {time}|${expiresDate.toISOString()}>`,
      ])
    );
  }

  // Info and link button
  blocks.push(
    section('_Please respond in the app to provide your answer._')
  );
  blocks.push(
    actions(`hitl_question_${request.id}`, [
      button('💬 Respond in App', 'hitl_view_app', request.id, 'primary'),
      button('❌ Cancel Request', 'hitl_cancel', request.id, 'danger'),
    ])
  );

  return blocks;
}

function buildChoiceMessage(request: HITLRequest): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push(header('🔘 Selection Required'));
  blocks.push(
    context([
      `📋 Sequence: *${request.sequence_key}* • Step ${request.step_index + 1}`,
    ])
  );
  blocks.push(divider());

  // Prompt
  blocks.push(section(request.prompt));

  // Show options
  if (request.options && request.options.length > 0) {
    blocks.push(divider());
    blocks.push(section('*Options:*'));

    // Build choice buttons (max 5 per row in Slack)
    const optionButtons = request.options.slice(0, 5).map((opt) =>
      button(
        opt.label.substring(0, 30),
        `hitl_choice_${opt.value}`,
        JSON.stringify({ requestId: request.id, choiceValue: opt.value })
      )
    );

    blocks.push(actions(`hitl_choices_${request.id}`, optionButtons));

    // If more than 5 options, suggest using app
    if (request.options.length > 5) {
      blocks.push(
        context([`_+ ${request.options.length - 5} more options available in the app_`])
      );
    }
  }

  blocks.push(divider());

  // Expiration info
  if (request.expires_at) {
    const expiresDate = new Date(request.expires_at);
    blocks.push(
      context([
        `⏱️ Expires: <!date^${Math.floor(expiresDate.getTime() / 1000)}^{date_short_pretty} at {time}|${expiresDate.toISOString()}>`,
      ])
    );
  }

  // Additional actions
  blocks.push(
    actions(`hitl_choice_actions_${request.id}`, [
      button('🔗 View in App', 'hitl_view_app', request.id),
      button('❌ Cancel Request', 'hitl_cancel', request.id, 'danger'),
    ])
  );

  return blocks;
}

function buildInputMessage(request: HITLRequest): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push(header('✏️ Input Required'));
  blocks.push(
    context([
      `📋 Sequence: *${request.sequence_key}* • Step ${request.step_index + 1}`,
    ])
  );
  blocks.push(divider());

  // Prompt
  blocks.push(section(request.prompt));

  blocks.push(divider());

  // Expiration info
  if (request.expires_at) {
    const expiresDate = new Date(request.expires_at);
    blocks.push(
      context([
        `⏱️ Expires: <!date^${Math.floor(expiresDate.getTime() / 1000)}^{date_short_pretty} at {time}|${expiresDate.toISOString()}>`,
      ])
    );
  }

  // Info and link button
  blocks.push(
    section('_Structured input is required. Please respond in the app._')
  );
  blocks.push(
    actions(`hitl_input_${request.id}`, [
      button('📝 Provide Input in App', 'hitl_view_app', request.id, 'primary'),
      button('❌ Cancel Request', 'hitl_cancel', request.id, 'danger'),
    ])
  );

  return blocks;
}

function buildHITLSlackMessage(request: HITLRequest): SlackBlock[] {
  switch (request.request_type) {
    case 'confirmation':
      return buildConfirmationMessage(request);
    case 'question':
      return buildQuestionMessage(request);
    case 'choice':
      return buildChoiceMessage(request);
    case 'input':
      return buildInputMessage(request);
    default:
      return buildConfirmationMessage(request);
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const { requestId } = await req.json();

    if (!requestId) {
      throw new Error('requestId is required');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the HITL request
    const { data: hitlRequest, error: fetchError } = await supabase
      .from('hitl_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !hitlRequest) {
      throw new Error(`HITL request not found: ${fetchError?.message || 'Not found'}`);
    }

    const request = hitlRequest as HITLRequest;

    // Check if Slack is in the channels
    if (!request.channels.includes('slack')) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Slack notification not enabled for this request',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Get organization Slack settings
    const { data: orgSettings, error: orgError } = await supabase
      .from('organization_settings')
      .select('slack_bot_token, slack_default_channel_id')
      .eq('organization_id', request.organization_id)
      .maybeSingle();

    if (orgError) {
      throw new Error(`Failed to fetch org settings: ${orgError.message}`);
    }

    if (!orgSettings?.slack_bot_token) {
      console.log('Organization does not have Slack configured');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Organization does not have Slack configured',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Determine target channel
    let targetChannel = request.slack_channel_id || orgSettings.slack_default_channel_id;

    // If assigned to a specific user, try to DM them
    if (request.assigned_to_user_id) {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('slack_user_id')
        .eq('id', request.assigned_to_user_id)
        .maybeSingle();

      if (userProfile?.slack_user_id) {
        targetChannel = userProfile.slack_user_id;
      }
    }

    if (!targetChannel) {
      throw new Error('No Slack channel or user configured for notification');
    }

    // Build the message
    const blocks = buildHITLSlackMessage(request);
    const fallbackText = `${getRequestTypeEmoji(request.request_type)} HITL Request: ${request.prompt.substring(0, 100)}...`;

    // Send to Slack
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${orgSettings.slack_bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: targetChannel,
        text: fallbackText,
        blocks,
      }),
    });

    const slackResult = await slackResponse.json();

    if (!slackResult.ok) {
      throw new Error(`Slack API error: ${slackResult.error}`);
    }

    // Update the HITL request with the Slack message timestamp
    await supabase
      .from('hitl_requests')
      .update({
        slack_message_ts: slackResult.ts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    console.log(`[HITL] Slack notification sent for request ${requestId}`);

    return new Response(
      JSON.stringify({
        success: true,
        messageTs: slackResult.ts,
        channel: slackResult.channel,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[HITL] Error sending Slack notification:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// =============================================================================
// Helpers
// =============================================================================

function getRequestTypeEmoji(type: string): string {
  switch (type) {
    case 'confirmation':
      return '🤝';
    case 'question':
      return '❓';
    case 'choice':
      return '🔘';
    case 'input':
      return '✏️';
    default:
      return '📋';
  }
}

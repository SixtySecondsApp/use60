/**
 * Question Delivery Orchestrator (LEARN-006)
 *
 * Delivers contextual configuration questions via Slack Block Kit DM or
 * in-app notification. After a successful send it updates the question row to
 * 'asked' and writes an audit entry to `agent_config_question_log`.
 *
 * Fallback behaviour: if Slack delivery fails the orchestrator transparently
 * retries using the in-app channel, ensuring questions are never silently lost.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getSlackOrgSettings } from '../proactive/settings.ts';
import { getSlackRecipient } from '../proactive/recipients.ts';
import { sendSlackDM } from '../proactive/deliverySlack.ts';
import { deliverToInApp } from '../proactive/deliveryInApp.ts';
import { buildQuestionBlocks } from './questionBlockKit.ts';
import { buildInAppQuestionPayload } from './questionInApp.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export interface QuestionInput {
  question_id: string;
  config_key: string;
  question_text: string;
  category: string;
  options?: Array<{ label: string; value: string }>;
}

export interface DeliveryResult {
  delivered: boolean;
  channel: string;
  error?: string;
}

// =============================================================================
// Main Orchestrator
// =============================================================================

/**
 * Deliver a contextual configuration question to a user.
 *
 * Steps:
 * 1. Build and send via the requested channel
 * 2. If Slack fails, fall back to in_app
 * 3. Update `agent_config_questions` status to 'asked'
 * 4. Append a row to `agent_config_question_log`
 */
export async function deliverConfigQuestion(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  channel: 'slack' | 'in_app',
  question: QuestionInput,
): Promise<DeliveryResult> {
  console.log('[questionDelivery] deliverConfigQuestion', {
    orgId,
    userId,
    channel,
    question_id: question.question_id,
    config_key: question.config_key,
  });

  let deliveredChannel: string = channel;
  let deliveryError: string | undefined;

  if (channel === 'slack') {
    const slackResult = await deliverViaSlack(supabase, orgId, userId, question);

    if (slackResult.delivered) {
      deliveredChannel = 'slack';
    } else {
      // Slack failed — fall back to in_app
      console.warn('[questionDelivery] Slack delivery failed, falling back to in_app:', slackResult.error);
      deliveryError = slackResult.error;

      const inAppFallback = await deliverViaInApp(supabase, orgId, userId, question);
      if (inAppFallback.delivered) {
        deliveredChannel = 'in_app';
        deliveryError = undefined; // Fallback succeeded, clear the error
      } else {
        await writeLogEntry(supabase, orgId, userId, question.question_id, 'delivered', channel, {
          error: inAppFallback.error,
          slack_error: slackResult.error,
          fallback_attempted: true,
        });
        return {
          delivered: false,
          channel: deliveredChannel,
          error: inAppFallback.error ?? slackResult.error,
        };
      }
    }
  } else {
    const inAppResult = await deliverViaInApp(supabase, orgId, userId, question);

    if (!inAppResult.delivered) {
      await writeLogEntry(supabase, orgId, userId, question.question_id, 'delivered', 'in_app', {
        error: inAppResult.error,
      });
      return {
        delivered: false,
        channel: 'in_app',
        error: inAppResult.error,
      };
    }
    deliveredChannel = 'in_app';
  }

  // Update question status to 'asked'
  await markQuestionAsked(supabase, question.question_id, deliveredChannel);

  // Write audit log entry
  await writeLogEntry(supabase, orgId, userId, question.question_id, 'delivered', deliveredChannel, {
    original_channel: channel,
    fallback_used: channel !== deliveredChannel,
  });

  console.log('[questionDelivery] Question delivered successfully', {
    question_id: question.question_id,
    channel: deliveredChannel,
  });

  return { delivered: true, channel: deliveredChannel };
}

// =============================================================================
// Channel Handlers
// =============================================================================

async function deliverViaSlack(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  question: QuestionInput,
): Promise<{ delivered: boolean; error?: string }> {
  // Resolve Slack org settings
  const slackSettings = await getSlackOrgSettings(supabase, orgId);
  if (!slackSettings?.botAccessToken) {
    return { delivered: false, error: 'slack_not_connected' };
  }

  // Resolve recipient Slack user ID
  const recipient = await getSlackRecipient(supabase, orgId, userId);
  if (!recipient?.slackUserId) {
    return { delivered: false, error: 'no_slack_user_mapping' };
  }

  // Build Block Kit blocks
  const { blocks, text } = buildQuestionBlocks(question);

  // Send DM
  const result = await sendSlackDM({
    botToken: slackSettings.botAccessToken,
    slackUserId: recipient.slackUserId,
    blocks,
    text,
  });

  if (!result.success) {
    return { delivered: false, error: result.error };
  }

  return { delivered: true };
}

async function deliverViaInApp(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  question: QuestionInput,
): Promise<{ delivered: boolean; error?: string }> {
  const payload = buildInAppQuestionPayload(userId, orgId, question);
  const result = await deliverToInApp(supabase, payload);

  if (!result.created) {
    return { delivered: false, error: result.error };
  }

  return { delivered: true };
}

// =============================================================================
// Persistence Helpers
// =============================================================================

/**
 * Update the agent_config_questions row to status='asked' with delivery metadata.
 */
async function markQuestionAsked(
  supabase: SupabaseClient,
  questionId: string,
  deliveredChannel: string,
): Promise<void> {
  const { error } = await supabase
    .from('agent_config_questions')
    .update({
      status: 'asked',
      asked_at: new Date().toISOString(),
      delivery_channel: deliveredChannel,
    })
    .eq('id', questionId);

  if (error) {
    console.error('[questionDelivery] Failed to mark question as asked:', error);
  }
}

/**
 * Append an entry to agent_config_question_log for audit and rate-limit tracking.
 */
async function writeLogEntry(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  questionId: string,
  eventType: 'delivered' | 'answered' | 'skipped' | 'expired' | 'rate_limited',
  channel: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase
    .from('agent_config_question_log')
    .insert({
      org_id: orgId,
      user_id: userId,
      question_id: questionId,
      event_type: eventType,
      channel,
      metadata,
    });

  if (error) {
    console.error('[questionDelivery] Failed to write question log entry:', error);
  }
}

/**
 * Ping Slack Channel Adapter
 *
 * Fires when a "check with team" commitment is detected (intent = check_with_team).
 * Resolves the appropriate Slack channel from the commitment phrase, posts a
 * Block Kit message asking the team for input, and falls back to a DM to the
 * rep if the channel cannot be resolved or the bot is not in the channel.
 *
 * Upstream outputs consumed:
 * - detect-intents: { commitments: [{ intent, phrase, context, confidence }] }
 *
 * Event payload fallbacks (if detect-intents output is absent):
 * - commitment_phrase
 * - commitment_context
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import { resolveSlackChannelAsync } from '../intentActionRegistry.ts';
import { sendSlackDM } from '../../proactive/deliverySlack.ts';

// =============================================================================
// Internal helpers
// =============================================================================

interface PostMessageResult {
  success: boolean;
  channelId?: string;
  ts?: string;
  error?: string;
}

/**
 * Post a Block Kit message directly to a Slack channel (not a DM).
 * Returns the Slack API response fields we care about.
 */
async function postToChannel(
  botToken: string,
  channel: string,
  blocks: unknown[],
  fallbackText: string,
): Promise<PostMessageResult> {
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        text: fallbackText,
        blocks,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      return { success: false, error: data.error || 'Unknown Slack API error' };
    }

    return { success: true, channelId: data.channel, ts: data.ts };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error posting to Slack',
    };
  }
}

// =============================================================================
// Adapter
// =============================================================================

export const pingSlackChannelAdapter: SkillAdapter = {
  name: 'ping-slack-channel',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const orgId = state.event.org_id;
      const userId = state.event.user_id;

      // ------------------------------------------------------------------
      // 1. Extract commitment context
      // ------------------------------------------------------------------

      // Prefer the detect-intents output; fall back to raw event payload.
      const intentsOutput = state.outputs['detect-intents'] as any;
      const checkWithTeamCommitment = (intentsOutput?.commitments as any[] | undefined)
        ?.find((c: any) => c.intent === 'check_with_team');

      const commitmentPhrase: string =
        checkWithTeamCommitment?.phrase ||
        (state.event.payload.commitment_phrase as string | undefined) ||
        'check with the team';

      const commitmentContext: string =
        checkWithTeamCommitment?.context ||
        (state.event.payload.commitment_context as string | undefined) ||
        '';

      // ------------------------------------------------------------------
      // 2. Resolve Slack channel
      // ------------------------------------------------------------------

      const resolvedChannelResult = await resolveSlackChannelAsync({
        phrase: commitmentPhrase,
        context: commitmentContext,
        orgId,
      });
      const resolvedChannel = resolvedChannelResult?.channel_name ?? null;
      const resolvedChannelId = resolvedChannelResult?.channel_id ?? null;

      // ------------------------------------------------------------------
      // 3. Gather names and meeting metadata
      // ------------------------------------------------------------------

      const repName: string =
        state.context.tier1.user.name ||
        state.context.tier1.user.email ||
        'Your rep';

      const contactName: string =
        state.context.tier2?.contact?.name ||
        (state.event.payload.contact_name as string | undefined) ||
        'the prospect';

      const meetingId = state.event.payload.meeting_id as string | undefined;
      const meetingTitle: string =
        (state.event.payload.title as string | undefined) ||
        (state.event.payload.meeting_title as string | undefined) ||
        'Recent meeting';

      const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';
      const meetingUrl = meetingId ? `${appUrl}/meetings/${meetingId}` : null;

      // ------------------------------------------------------------------
      // 4. Get org Slack bot token
      // ------------------------------------------------------------------

      const supabase = getServiceClient();

      const { data: slackOrgSettings, error: tokenError } = await supabase
        .from('slack_org_settings')
        .select('bot_token')
        .eq('org_id', orgId)
        .maybeSingle();

      if (tokenError) {
        console.error('[ping-slack-channel] Error fetching slack_org_settings:', tokenError);
      }

      const botToken: string | undefined = slackOrgSettings?.bot_token;

      if (!botToken) {
        return {
          success: false,
          error: 'No Slack bot token configured for this organisation',
          output: {
            channel_resolved: resolvedChannel,
            delivered: false,
            delivery_method: null,
          },
          duration_ms: Date.now() - start,
        };
      }

      // ------------------------------------------------------------------
      // 5. Build Block Kit message
      // ------------------------------------------------------------------

      const dateLabel = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const contextElements: unknown[] = [
        {
          type: 'mrkdwn',
          text: `Meeting: ${meetingTitle} | ${dateLabel}`,
        },
      ];

      if (meetingUrl) {
        contextElements.push({
          type: 'mrkdwn',
          text: `<${meetingUrl}|Open meeting>`,
        });
      }

      const blocks: unknown[] = [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Team Input Needed', emoji: true },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${repName}* committed to checking with your team during a meeting with *${contactName}*`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `> _"${commitmentPhrase}"_`,
          },
        },
        {
          type: 'context',
          elements: contextElements,
        },
      ];

      // Action buttons (only add if we have a meeting URL for "View Meeting")
      const actionElements: unknown[] = [
        {
          type: 'button',
          text: { type: 'plain_text', text: "I'll Handle This", emoji: true },
          action_id: 'ping_slack_channel_handle',
          style: 'primary',
          value: meetingId || 'unknown',
        },
      ];

      if (meetingUrl) {
        actionElements.push({
          type: 'button',
          text: { type: 'plain_text', text: 'View Meeting', emoji: true },
          action_id: 'ping_slack_channel_view_meeting',
          url: meetingUrl,
          value: meetingId || 'unknown',
        });
      }

      blocks.push({
        type: 'actions',
        elements: actionElements,
      });

      const fallbackText =
        `Team input needed: ${repName} committed to check with the team during a meeting with ${contactName}. Commitment: "${commitmentPhrase}"`;

      // ------------------------------------------------------------------
      // 6. Post to channel (or fallback to DM)
      // ------------------------------------------------------------------

      let deliveryMethod: 'channel' | 'dm' | null = null;
      let deliveredChannel: string | undefined;
      let deliveredTs: string | undefined;
      let deliveryError: string | undefined;

      if (resolvedChannel) {
        // Prefer channel_id for the API call (more reliable than name), fall back to name
        const channelTarget = resolvedChannelId || resolvedChannel;
        console.log(`[ping-slack-channel] Posting to channel ${channelTarget}`);
        const channelResult = await postToChannel(botToken, channelTarget, blocks, fallbackText);

        if (channelResult.success) {
          deliveryMethod = 'channel';
          deliveredChannel = channelResult.channelId;
          deliveredTs = channelResult.ts;
          console.log(`[ping-slack-channel] Successfully posted to ${resolvedChannel}`);
        } else {
          // Handle not_in_channel and other channel errors gracefully — fall through to DM
          console.warn(
            `[ping-slack-channel] Channel post failed (${channelResult.error}), falling back to DM`,
          );
          deliveryError = channelResult.error;
        }
      } else {
        console.log(
          '[ping-slack-channel] No channel resolved from commitment phrase — falling back to DM',
        );
        deliveryError = 'No matching channel keyword found in commitment phrase';
      }

      // Fallback: DM the rep if channel post was skipped or failed
      if (!deliveryMethod) {
        // Get the rep's Slack user ID for DM fallback
        const { data: slackMapping } = await supabase
          .from('slack_user_mappings')
          .select('slack_user_id')
          .eq('org_id', orgId)
          .eq('sixty_user_id', userId)
          .maybeSingle();

        const repSlackUserId: string | undefined = slackMapping?.slack_user_id;

        if (!repSlackUserId) {
          console.warn('[ping-slack-channel] No Slack user mapping found for rep — cannot DM');
          return {
            success: false,
            error: deliveryError || 'Could not resolve channel and no Slack user mapping found for DM fallback',
            output: {
              channel_resolved: resolvedChannel,
              delivered: false,
              delivery_method: null,
            },
            duration_ms: Date.now() - start,
          };
        }

        console.log(`[ping-slack-channel] Sending DM fallback to rep ${repSlackUserId}`);

        const dmResult = await sendSlackDM({
          botToken,
          slackUserId: repSlackUserId,
          blocks: blocks as any[],
          text: fallbackText,
        });

        if (dmResult.success) {
          deliveryMethod = 'dm';
          deliveredChannel = dmResult.channelId;
          deliveredTs = dmResult.ts;
          console.log('[ping-slack-channel] DM fallback delivered successfully');
        } else {
          console.error('[ping-slack-channel] DM fallback also failed:', dmResult.error);
          return {
            success: false,
            error: `Channel post failed (${deliveryError}) and DM fallback also failed (${dmResult.error})`,
            output: {
              channel_resolved: resolvedChannel,
              delivered: false,
              delivery_method: null,
              channel_error: deliveryError,
              dm_error: dmResult.error,
            },
            duration_ms: Date.now() - start,
          };
        }
      }

      // ------------------------------------------------------------------
      // 7. Return success
      // ------------------------------------------------------------------

      return {
        success: true,
        output: {
          delivered: true,
          delivery_method: deliveryMethod,
          channel_resolved: resolvedChannel,
          channel_posted_to: deliveredChannel,
          ts: deliveredTs,
          rep_name: repName,
          contact_name: contactName,
          commitment_phrase: commitmentPhrase,
          fallback_reason: deliveryMethod === 'dm' ? (deliveryError || 'No channel resolved') : undefined,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[ping-slack-channel] Unexpected error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};

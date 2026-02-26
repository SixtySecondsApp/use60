/**
 * Slack Delivery for Proactive Notifications
 *
 * Handles sending Slack DMs and channel messages with safe block rendering.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ProactiveNotificationPayload } from './types.ts';
import { buildCompactNotification } from '../slackBlocks.ts';

// =============================================================================
// SLK-014: Notification Tier Routing
// =============================================================================

export type NotificationTier = 'full_card' | 'compact' | 'silent_thread';

const NOTIFICATION_TIER_MAP: Record<string, NotificationTier> = {
  // Full card — needs user action or is high-impact
  'hitl_approval': 'full_card',
  'meeting_prep': 'full_card',
  'meeting_briefing': 'full_card',
  'meeting_debrief': 'full_card',
  'deal_won': 'full_card',
  'deal_lost': 'full_card',
  'morning_brief': 'full_card',
  'follow_up_draft': 'full_card',
  'eod_synthesis': 'full_card',

  // Compact — FYI, no action needed
  'deal_stage_change': 'compact',
  'email_reply': 'compact',
  'task_completed': 'compact',
  'deal_activity': 'compact',
  'win_probability_change': 'compact',
  'crm_update': 'compact',

  // Silent thread — low-priority, accumulated daily
  'account_signal': 'silent_thread',
  'coaching_micro': 'silent_thread',
  'coaching_weekly': 'silent_thread',
  'reengagement': 'silent_thread',
  'stale_deal': 'silent_thread',
};

export function getNotificationTier(notificationType: string): NotificationTier {
  return NOTIFICATION_TIER_MAP[notificationType] || 'full_card';
}

interface SlackDeliveryOptions {
  botToken: string;
  slackUserId: string;
  blocks?: any[];
  text?: string;
  icon_url?: string;
  username?: string;
}

/**
 * Send Slack DM to a user
 */
export async function sendSlackDM(
  options: SlackDeliveryOptions
): Promise<{ success: boolean; channelId?: string; ts?: string; error?: string }> {
  const { botToken, slackUserId, blocks, text, icon_url, username } = options;

  try {
    // Open DM channel
    const openDmResponse = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        users: slackUserId,
      }),
    });

    const openDmData = await openDmResponse.json();
    
    if (!openDmData.ok || !openDmData.channel?.id) {
      return {
        success: false,
        error: `Failed to open DM: ${openDmData.error || 'Unknown error'}`,
      };
    }

    const channelId = openDmData.channel.id;

    // Send message
    const messagePayload: any = {
      channel: channelId,
      text: text || 'Notification from use60',
      unfurl_links: false,
      unfurl_media: false,
    };

    if (icon_url) messagePayload.icon_url = icon_url;
    if (username) messagePayload.username = username;

    if (blocks && blocks.length > 0) {
      // Validate and truncate blocks if needed
      const safeBlocks = truncateBlocks(blocks);
      messagePayload.blocks = safeBlocks;
    }

    const postMessageResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    });

    const postMessageData = await postMessageResponse.json();

    if (!postMessageData.ok) {
      return {
        success: false,
        error: `Failed to send message: ${postMessageData.error || 'Unknown error'}`,
      };
    }

    return {
      success: true,
      channelId,
      ts: postMessageData.ts,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Truncate blocks to fit Slack limits
 */
function truncateBlocks(blocks: any[]): any[] {
  const MAX_BLOCKS = 50;
  const MAX_TEXT_LENGTH = 3000;

  let truncated = blocks.slice(0, MAX_BLOCKS);

  // Truncate text in sections
  truncated = truncated.map(block => {
    if (block.type === 'section' && block.text?.text) {
      if (block.text.text.length > MAX_TEXT_LENGTH) {
        block.text.text = block.text.text.substring(0, MAX_TEXT_LENGTH - 3) + '...';
      }
    }
    return block;
  });

  return truncated;
}

/**
 * SLACK-020: Check quiet hours and rate limiting for a user
 */
async function checkUserDeliveryPolicy(
  supabase: SupabaseClient,
  payload: ProactiveNotificationPayload
): Promise<{ allowed: boolean; reason?: string }> {
  if (!payload.recipientUserId || !payload.orgId) {
    return { allowed: true }; // No user context, allow
  }

  try {
    // Map notification type to feature name for preferences lookup
    const featureMap: Record<string, string> = {
      // Existing proactive notification types
      morning_brief: 'morning_brief',
      stale_deal_alert: 'deal_risk',
      deal_momentum_nudge: 'deal_momentum',
      post_call_summary: 'post_meeting',
      meeting_prep: 'post_meeting',
      meeting_debrief: 'post_meeting',
      // Orchestrator event types (maps to slack_user_preferences feature keys)
      meeting_ended: 'post_meeting',
      pre_meeting_90min: 'post_meeting',
      deal_risk_scan: 'deal_risk',
      stale_deal_revival: 'deal_risk',
      coaching_weekly: 'morning_brief',
      campaign_daily_check: 'campaign_alerts',
      email_received: 'post_meeting',
      proposal_generation: 'post_meeting',
      calendar_find_times: 'post_meeting',
    };
    const feature = featureMap[payload.type];
    if (!feature) {
      console.warn(`[proactive/deliverySlack] Unknown notification type: ${payload.type}, allowing by default`);
      return { allowed: true };
    }

    // Check user preferences
    const { data: pref } = await supabase
      .from('slack_user_preferences')
      .select('is_enabled, quiet_hours_start, quiet_hours_end, max_notifications_per_hour')
      .eq('user_id', payload.recipientUserId)
      .eq('org_id', payload.orgId)
      .eq('feature', feature)
      .maybeSingle();

    // If no preferences row, allow (default enabled)
    if (!pref) return { allowed: true };

    // Check if feature is disabled
    if (!pref.is_enabled) {
      return { allowed: false, reason: 'user_disabled' };
    }

    // Check quiet hours
    if (pref.quiet_hours_start && pref.quiet_hours_end) {
      // Get user timezone from slack_user_mappings
      const { data: mapping } = await supabase
        .from('slack_user_mappings')
        .select('preferred_timezone')
        .eq('org_id', payload.orgId)
        .eq('sixty_user_id', payload.recipientUserId)
        .maybeSingle();

      const tz = mapping?.preferred_timezone || 'America/New_York';
      try {
        const now = new Date();
        const userNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
        const currentMinutes = userNow.getHours() * 60 + userNow.getMinutes();

        const [startH, startM] = pref.quiet_hours_start.split(':').map(Number);
        const [endH, endM] = pref.quiet_hours_end.split(':').map(Number);
        const quietStart = startH * 60 + startM;
        const quietEnd = endH * 60 + endM;

        // Handle overnight quiet hours (e.g., 20:00 - 07:00)
        const isQuiet = quietStart > quietEnd
          ? currentMinutes >= quietStart || currentMinutes < quietEnd
          : currentMinutes >= quietStart && currentMinutes < quietEnd;

        if (isQuiet) {
          return { allowed: false, reason: 'quiet_hours' };
        }
      } catch {
        // Invalid timezone, proceed
      }
    }

    // Check rate limit
    if (pref.max_notifications_per_hour) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const { count } = await supabase
        .from('slack_notifications_sent')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', payload.orgId)
        .eq('recipient_id', payload.recipientSlackUserId)
        .gte('sent_at', oneHourAgo.toISOString());

      if ((count || 0) >= pref.max_notifications_per_hour) {
        return { allowed: false, reason: 'rate_limited' };
      }
    }

    return { allowed: true };
  } catch (err) {
    console.warn('[proactive/deliverySlack] Error checking delivery policy, allowing:', err);
    return { allowed: true }; // Fail open
  }
}

/**
 * Deliver notification to Slack
 */
export async function deliverToSlack(
  supabase: SupabaseClient,
  payload: ProactiveNotificationPayload,
  botToken: string
): Promise<{ sent: boolean; channelId?: string; ts?: string; error?: string; interactionId?: string }> {
  if (!payload.recipientSlackUserId) {
    return {
      sent: false,
      error: 'No Slack user ID provided',
    };
  }

  // SLACK-020: Check quiet hours + rate limiting
  const policy = await checkUserDeliveryPolicy(supabase, payload);
  if (!policy.allowed) {
    console.log(`[proactive/deliverySlack] Blocked by ${policy.reason} for user ${payload.recipientSlackUserId}`);
    return {
      sent: false,
      error: policy.reason,
    };
  }

  // AOA-006: Load agent persona for voice injection
  const persona = await loadAgentPersona(supabase, payload.recipientUserId);
  const agentName = persona?.agent_name || 'Sixty';

  // SLK-014: Determine notification tier and route accordingly
  const tier = getNotificationTier(payload.type);
  console.log(`[proactive/deliverySlack] Tier for "${payload.type}": ${tier}`);

  // --- Silent thread tier (SLK-016) ---
  if (tier === 'silent_thread') {
    try {
      // Open DM channel to get channel ID
      const openDmResponse = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ users: payload.recipientSlackUserId }),
      });
      const openDmData = await openDmResponse.json();

      if (!openDmData.ok || !openDmData.channel?.id) {
        return { sent: false, error: `Failed to open DM for silent thread: ${openDmData.error || 'Unknown error'}` };
      }

      const signalMessage = `[${agentName}] ${payload.message || payload.title || 'Signal'}`;
      await sendSilentThreadNotification(
        botToken,
        openDmData.channel.id,
        payload.recipientUserId,
        signalMessage,
        supabase,
      );

      return { sent: true, channelId: openDmData.channel.id };
    } catch (err) {
      console.error('[proactive/deliverySlack] Silent thread error:', err);
      return { sent: false, error: err instanceof Error ? err.message : 'Silent thread error' };
    }
  }

  // --- Compact tier (SLK-015) ---
  if (tier === 'compact') {
    const compactData = {
      type: payload.type,
      entityName: payload.title || 'Update',
      action: payload.message || '',
      appUrl: 'https://app.use60.com',
      dealId: payload.metadata?.dealId as string | undefined,
      contactId: payload.metadata?.contactId as string | undefined,
      meetingId: payload.metadata?.meetingId as string | undefined,
    };
    const compactMessage = buildCompactNotification(compactData);

    const personalizedBlocks = injectPersonaHeader(compactMessage.blocks, agentName);
    const personalizedText = `[${agentName}] ${compactMessage.text}`;

    const result = await sendSlackDM({
      botToken,
      slackUserId: payload.recipientSlackUserId,
      blocks: personalizedBlocks,
      text: personalizedText,
    });

    let interactionId: string | undefined;
    if (result.success) {
      try {
        const { data, error } = await supabase.rpc('record_notification_interaction', {
          p_user_id: payload.recipientUserId,
          p_org_id: payload.orgId,
          p_notification_type: payload.type,
          p_delivered_via: 'slack_dm',
        });
        if (error) {
          console.error('[proactive/deliverySlack] Error recording interaction:', error);
        } else {
          interactionId = data as string;
        }
      } catch (err) {
        console.error('[proactive/deliverySlack] Error recording interaction:', err);
      }
    }

    return {
      sent: result.success,
      channelId: result.channelId,
      ts: result.ts,
      error: result.error,
      interactionId,
    };
  }

  // --- Full card tier (default) ---
  // Inject persona name prefix into message text
  const personalizedText = `[${agentName}] ${payload.message || 'Notification'}`;

  // Inject persona header into blocks if present
  const personalizedBlocks = payload.blocks
    ? injectPersonaHeader(payload.blocks, agentName)
    : undefined;

  const result = await sendSlackDM({
    botToken,
    slackUserId: payload.recipientSlackUserId,
    blocks: personalizedBlocks || payload.blocks,
    text: personalizedText,
  });

  // Record notification interaction for Smart Engagement Algorithm
  let interactionId: string | undefined;
  if (result.success) {
    try {
      const { data, error } = await supabase.rpc('record_notification_interaction', {
        p_user_id: payload.recipientUserId,
        p_org_id: payload.orgId,
        p_notification_type: payload.type,
        p_delivered_via: 'slack_dm',
      });

      if (error) {
        console.error('[proactive/deliverySlack] Error recording interaction:', error);
      } else {
        interactionId = data as string;
      }
    } catch (err) {
      console.error('[proactive/deliverySlack] Error recording interaction:', err);
    }
  }

  return {
    sent: result.success,
    channelId: result.channelId,
    ts: result.ts,
    error: result.error,
    interactionId,
  };
}

/**
 * AOA-006: Load agent persona for a user (with defaults fallback)
 */
async function loadAgentPersona(
  supabase: SupabaseClient,
  userId: string
): Promise<{ agent_name: string; tone: string } | null> {
  try {
    const { data } = await supabase
      .from('agent_persona')
      .select('agent_name, tone')
      .eq('user_id', userId)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

/**
 * AOA-006: Inject agent persona name into Slack Block Kit blocks.
 * Adds a context block at the top with the agent's name if the first block isn't already a context.
 */
function injectPersonaHeader(blocks: any[], agentName: string): any[] {
  if (!blocks || blocks.length === 0) return blocks;

  // Don't double-inject if first block is already a context with the agent name
  if (blocks[0]?.type === 'context' && JSON.stringify(blocks[0]).includes(agentName)) {
    return blocks;
  }

  const personaContext = {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `*${agentName}* | Your AI Sales Agent`,
      },
    ],
  };

  return [personaContext, ...blocks];
}

// =============================================================================
// SLK-016: Silent Thread Daily Accumulator
// =============================================================================

/**
 * Send a low-priority notification as a reply in a daily digest thread.
 * Creates the thread on first signal of the day, accumulates subsequent
 * signals as replies within the same thread.
 */
export async function sendSilentThreadNotification(
  botToken: string,
  channelId: string,
  userId: string,
  message: string,
  supabase: SupabaseClient,
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Check if we already have a daily thread for this user
  const { data: existingThread } = await supabase
    .from('slack_notifications_sent')
    .select('slack_ts, metadata')
    .eq('recipient_id', userId)
    .eq('feature', 'daily_signal_thread')
    .gte('sent_at', `${today}T00:00:00Z`)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingThread?.slack_ts) {
    // Append to existing thread
    try {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          thread_ts: existingThread.slack_ts,
          text: message,
        }),
      });

      // Update thread root message count
      const count = ((existingThread.metadata as Record<string, number>)?.signal_count || 1) + 1;
      const dateLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

      await fetch('https://slack.com/api/chat.update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          ts: existingThread.slack_ts,
          text: `Signals — ${dateLabel} (${count} today)`,
        }),
      });

      // Update metadata with new count
      await supabase
        .from('slack_notifications_sent')
        .update({ metadata: { signal_count: count } })
        .eq('slack_ts', existingThread.slack_ts);

    } catch (err) {
      console.error('[deliverySlack] Error appending to signal thread:', err);
    }
  } else {
    // Create new daily thread
    try {
      const dateLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const threadRes = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          text: `Signals — ${dateLabel}`,
        }),
      });

      const threadData = await threadRes.json();

      if (threadData.ok && threadData.ts) {
        // Record the thread root
        await supabase.from('slack_notifications_sent').insert({
          recipient_id: userId,
          feature: 'daily_signal_thread',
          slack_ts: threadData.ts,
          slack_channel_id: channelId,
          sent_at: new Date().toISOString(),
          metadata: { signal_count: 1 },
        });

        // Post the first signal as a thread reply
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: channelId,
            thread_ts: threadData.ts,
            text: message,
          }),
        });
      }
    } catch (err) {
      console.error('[deliverySlack] Error creating signal thread:', err);
    }
  }
}

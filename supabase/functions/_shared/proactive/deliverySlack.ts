/**
 * Slack Delivery for Proactive Notifications
 * 
 * Handles sending Slack DMs and channel messages with safe block rendering.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ProactiveNotificationPayload } from './types.ts';

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

  const result = await sendSlackDM({
    botToken,
    slackUserId: payload.recipientSlackUserId,
    blocks: payload.blocks,
    text: payload.message,
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

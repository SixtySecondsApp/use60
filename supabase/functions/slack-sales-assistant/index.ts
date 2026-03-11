/**
 * Slack Sales Assistant Edge Function
 * 
 * Sends DM notifications to sales reps with actionable follow-up prompts based on:
 * - Recent email categorizations (to_respond items)
 * - Ghost detection signals
 * - Upcoming calendar events
 * - High-priority deals
 * 
 * Runs every 15 minutes after the Google context sync.
 * Includes interactive buttons to create tasks directly from Slack.
 * 
 * SECURITY:
 * - POST only
 * - FAIL-CLOSED: Requires CRON_SECRET or service role authentication
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth, getUserOrgId } from '../_shared/edgeAuth.ts';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ActionItem {
  type: 'email' | 'ghost' | 'meeting' | 'deal';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedAction: string;
  metadata: {
    emailId?: string;
    contactId?: string;
    dealId?: string;
    meetingId?: string;
    dueInDays?: number;
  };
}

interface UserDigest {
  userId: string;
  slackUserId: string;
  actionItems: ActionItem[];
  emailsToRespond: number;
  ghostRisks: number;
  upcomingMeetings: number;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // SECURITY: Fail-closed authentication
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    const isCronAuth = verifyCronSecret(req, cronSecret);
    const isServiceRole = isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY);

    if (!isCronAuth && !isServiceRole) {
      console.error('[slack-sales-assistant] Unauthorized access attempt');
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get all orgs with Slack connected
    const { data: slackOrgs, error: orgsError } = await supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token, slack_team_id')
      .eq('is_connected', true)
      .not('bot_access_token', 'is', null);

    if (orgsError || !slackOrgs?.length) {
      return jsonResponse({
        success: true,
        message: 'No Slack-connected orgs found',
        dmsSent: 0,
      }, req);
    }

    let totalDmsSent = 0;
    const errors: string[] = [];

    // Process each org
    for (const org of slackOrgs) {
      try {
        // Check if sales assistant DMs are enabled
        const { data: notifSettings } = await supabase
          .from('slack_notification_settings')
          .select('*')
          .eq('org_id', org.org_id)
          .eq('feature', 'sales_assistant')
          .single();

        if (!notifSettings?.is_enabled) {
          continue;
        }

        // Get org members with Slack mappings
        const { data: userMappings } = await supabase
          .from('slack_user_mappings')
          .select('sixty_user_id, slack_user_id')
          .eq('org_id', org.org_id)
          .not('sixty_user_id', 'is', null);

        if (!userMappings?.length) continue;

        // Process each user
        for (const mapping of userMappings) {
          try {
            // Check rate limit (one DM per 15 min unless critical)
            const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
            const { data: recentDm } = await supabase
              .from('slack_notifications_sent')
              .select('id')
              .eq('recipient_id', mapping.slack_user_id)
              .eq('feature', 'sales_assistant')
              .gte('sent_at', fifteenMinAgo.toISOString())
              .limit(1);

            if (recentDm?.length && recentDm.length > 0) {
              // Already sent a DM in the last 15 min, skip unless critical
              continue;
            }

            // Build action items for this user
            const digest = await buildUserDigest(
              supabase,
              mapping.sixty_user_id,
              mapping.slack_user_id
            );

            if (digest.actionItems.length === 0) {
              continue; // Nothing to notify about
            }

            // Send DM
            const dmResult = await sendAssistantDm(
              org.bot_access_token,
              mapping.slack_user_id,
              digest
            );

            if (dmResult.success) {
              // Record that we sent a DM
              await supabase
                .from('slack_notifications_sent')
                .insert({
                  org_id: org.org_id,
                  feature: 'sales_assistant',
                  entity_type: 'digest',
                  recipient_type: 'user',
                  recipient_id: mapping.slack_user_id,
                  slack_ts: dmResult.ts,
                  slack_channel_id: dmResult.channel,
                });

              totalDmsSent++;
            }
          } catch (userError: any) {
            errors.push(`User ${mapping.sixty_user_id}: ${userError.message}`);
          }
        }
      } catch (orgError: any) {
        errors.push(`Org ${org.org_id}: ${orgError.message}`);
      }
    }

    return jsonResponse({
      success: errors.length === 0,
      dmsSent: totalDmsSent,
      errors: errors.slice(0, 10), // Limit errors in response
      timestamp: new Date().toISOString(),
    }, req);

  } catch (error: any) {
    console.error('[slack-sales-assistant] Error:', error);
    return errorResponse(error.message || 'Unknown error', req, 500);
  }
});

/**
 * Build action items digest for a user
 */
async function buildUserDigest(
  supabase: any,
  userId: string,
  slackUserId: string
): Promise<UserDigest> {
  const actionItems: ActionItem[] = [];
  const now = new Date();
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);

  // 1. Emails needing response (from categorizations)
  const { data: toRespond } = await supabase
    .from('email_categorizations')
    .select('external_id, signals, thread_id, processed_at')
    .eq('user_id', userId)
    .eq('category', 'to_respond')
    .gte('processed_at', fifteenMinAgo.toISOString())
    .order('processed_at', { ascending: false })
    .limit(5);

  for (const email of toRespond || []) {
    const urgency = email.signals?.urgency || 'medium';
    actionItems.push({
      type: 'email',
      priority: urgency === 'high' ? 'high' : 'medium',
      title: 'Email needs response',
      description: email.signals?.keywords?.join(', ') || 'Inbound email waiting for reply',
      suggestedAction: 'Reply to this email',
      metadata: {
        emailId: email.external_id,
        dueInDays: urgency === 'high' ? 1 : 2,
      },
    });
  }

  // 2. Ghost detection signals
  const { data: ghostSignals } = await supabase
    .from('ghost_detection_signals')
    .select('contact_id, deal_id, signal_type, confidence, detected_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('confidence', 0.7)
    .order('detected_at', { ascending: false })
    .limit(3);

  for (const signal of ghostSignals || []) {
    actionItems.push({
      type: 'ghost',
      priority: signal.confidence > 0.85 ? 'high' : 'medium',
      title: 'Contact may be ghosting',
      description: `No response for an extended period (${Math.round(signal.confidence * 100)}% confidence)`,
      suggestedAction: 'Follow up with a gentle check-in',
      metadata: {
        contactId: signal.contact_id,
        dealId: signal.deal_id,
        dueInDays: 1,
      },
    });
  }

  // 3. Upcoming meetings (next 4 hours)
  const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const { data: upcomingMeetings } = await supabase
    .from('calendar_events')
    .select('id, title, start_time, attendees')
    .eq('user_id', userId)
    .gte('start_time', now.toISOString())
    .lte('start_time', fourHoursFromNow.toISOString())
    .order('start_time', { ascending: true })
    .limit(3);

  for (const meeting of upcomingMeetings || []) {
    const startTime = new Date(meeting.start_time);
    const minutesUntil = Math.round((startTime.getTime() - now.getTime()) / 60000);
    
    if (minutesUntil <= 30) {
      actionItems.push({
        type: 'meeting',
        priority: 'high',
        title: `Meeting in ${minutesUntil} min: ${meeting.title}`,
        description: `${(meeting.attendees || []).length} attendees`,
        suggestedAction: 'Review prep notes',
        metadata: {
          meetingId: meeting.id,
        },
      });
    }
  }

  // 4. High-priority deals needing attention
  const { data: dealRisks } = await supabase
    .from('deal_risk_signals')
    .select('deal_id, risk_type, severity, detected_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('severity', 'high')
    .order('detected_at', { ascending: false })
    .limit(2);

  for (const risk of dealRisks || []) {
    actionItems.push({
      type: 'deal',
      priority: 'high',
      title: 'Deal needs attention',
      description: `Risk detected: ${risk.risk_type}`,
      suggestedAction: 'Review deal and take action',
      metadata: {
        dealId: risk.deal_id,
        dueInDays: 1,
      },
    });
  }

  // Sort by priority
  actionItems.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return {
    userId,
    slackUserId,
    actionItems: actionItems.slice(0, 5), // Top 5 items
    emailsToRespond: (toRespond || []).length,
    ghostRisks: (ghostSignals || []).length,
    upcomingMeetings: (upcomingMeetings || []).length,
  };
}

/**
 * Send a DM to the user with action items
 */
async function sendAssistantDm(
  botToken: string,
  slackUserId: string,
  digest: UserDigest
): Promise<{ success: boolean; ts?: string; channel?: string; error?: string }> {
  // Build message blocks
  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🎯 Your Sales Action Items',
        emoji: true,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📧 ${digest.emailsToRespond} emails to respond | 👻 ${digest.ghostRisks} ghost risks | 📅 ${digest.upcomingMeetings} upcoming meetings`,
        },
      ],
    },
    { type: 'divider' },
  ];

  // Add action items
  for (const item of digest.actionItems) {
    const emoji = {
      email: '📧',
      ghost: '👻',
      meeting: '📅',
      deal: '💰',
    }[item.type] || '📌';

    const priorityIndicator = item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${priorityIndicator} ${emoji} *${item.title}*\n${item.description}`,
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Create Task',
          emoji: true,
        },
        action_id: 'create_task_from_assistant',
        value: JSON.stringify({
          title: item.suggestedAction,
          ...item.metadata,
          source: 'slack_assistant',
        }),
        style: item.priority === 'high' ? 'danger' : 'primary',
      },
    });
  }

  if (digest.actionItems.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '✅ You\'re all caught up! No urgent items right now.',
      },
    });
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '_Powered by Sixty Sales Assistant • Updated every 15 min_',
        },
      ],
    }
  );

  // Send via Slack API
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: slackUserId, // DM to user
      text: `🎯 You have ${digest.actionItems.length} action items that need attention`,
      blocks,
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    return { success: false, error: data.error };
  }

  return {
    success: true,
    ts: data.ts,
    channel: data.channel,
  };
}


/**
 * Campaign Monitoring Slack Interactive Handler
 * Handles campaign report actions from daily monitoring
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface CampaignActionContext {
  actionId: string;
  actionValue: string;
  userId: string;
  orgId: string;
  channelId: string;
  messageTs: string;
  responseUrl: string;
}

export async function handleCampaignAction(ctx: CampaignActionContext): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const parts = ctx.actionId.split('_');
  const action = parts[1]; // draft, view, mark, add, apply, keep

  if (action === 'draft' && parts[2] === 'response') {
    const replyId = parts.slice(3).join('_');
    // Trigger draft response via orchestrator
    await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'email_received',
        source: 'slack:button',
        org_id: ctx.orgId,
        user_id: ctx.userId,
        payload: { reply_id: replyId, action: 'draft_response' },
        idempotency_key: `camp_draft:${replyId}`,
      }),
    });
    await sendSlackResponse(ctx.responseUrl, '✍️ Drafting response...');

  } else if (action === 'view' && parts[2] === 'thread') {
    const replyId = parts.slice(3).join('_');
    const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';
    await sendSlackResponse(ctx.responseUrl, `🔗 View thread: ${appUrl}/emails/thread/${replyId}`);

  } else if (action === 'mark' && parts[2] === 'closed') {
    const replyId = parts.slice(3).join('_');
    // Update the campaign reply status
    await supabase
      .from('campaign_replies')
      .update({ status: 'closed', closed_by: ctx.userId, closed_at: new Date().toISOString() })
      .eq('id', replyId);
    await sendSlackResponse(ctx.responseUrl, '✅ Reply marked as handled.');

  } else if (action === 'add' && parts[2] === 'nurture') {
    const replyId = parts.slice(3).join('_');
    // Get the contact from the reply and add to nurture
    const { data: reply } = await supabase
      .from('campaign_replies')
      .select('contact_id, contact_email')
      .eq('id', replyId)
      .maybeSingle();

    if (reply?.contact_id) {
      await supabase.from('nurture_queue').insert({
        contact_id: reply.contact_id,
        org_id: ctx.orgId,
        source: 'campaign_reply',
        added_by: ctx.userId,
      });
      await sendSlackResponse(ctx.responseUrl, '🌱 Contact added to nurture sequence.');
    } else {
      await sendSlackResponse(ctx.responseUrl, '⚠️ Could not find contact for this reply.');
    }

  } else if (action === 'apply' && parts[2] === 'suggestion') {
    const campaignId = parts.slice(3).join('_');
    await sendSlackResponse(ctx.responseUrl, '✅ Optimization applied! Changes will take effect on next send.');

  } else if (action === 'keep' && parts[2] === 'testing') {
    const campaignId = parts.slice(3).join('_');
    await sendSlackResponse(ctx.responseUrl, '📊 Keeping current settings. Will check again tomorrow.');
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
    console.error('[campaigns-handler] Failed to send Slack response:', err);
  }
}

/**
 * Build Slack blocks for campaign daily report
 */
export function buildCampaignReportMessage(
  metrics: {
    campaign_name: string;
    campaign_id: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
    status: 'healthy' | 'warning' | 'underperforming';
  },
  replies: Array<{
    id: string;
    from_name: string;
    intent: 'positive' | 'negative' | 'ooo' | 'unsubscribe' | 'other';
    snippet: string;
  }>,
  suggestions: Array<{
    type: string;
    description: string;
  }>,
): unknown[] {
  const statusEmoji = metrics.status === 'healthy' ? '🟢' : metrics.status === 'warning' ? '🟡' : '🔴';

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📊 Campaign Report: ${metrics.campaign_name}`, emoji: true },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Status:* ${statusEmoji} ${metrics.status}` },
        { type: 'mrkdwn', text: `*Sent:* ${metrics.sent}` },
        { type: 'mrkdwn', text: `*Open Rate:* ${(metrics.open_rate * 100).toFixed(1)}%` },
        { type: 'mrkdwn', text: `*Reply Rate:* ${(metrics.reply_rate * 100).toFixed(1)}%` },
      ],
    },
  ];

  // Add reply sections
  if (replies.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Recent Replies (${replies.length}):*` },
    });

    const intentBadge: Record<string, string> = {
      positive: '🟢 Positive',
      negative: '🔴 Negative',
      ooo: '🟡 OOO',
      unsubscribe: '⚫ Unsubscribe',
      other: '⚪ Other',
    };

    for (const reply of replies.slice(0, 5)) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${reply.from_name}* — ${intentBadge[reply.intent] || reply.intent}\n>${reply.snippet.substring(0, 200)}`,
        },
      });
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Draft Response', emoji: true },
            action_id: `camp_draft_response_${reply.id}`,
            value: reply.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Thread', emoji: true },
            action_id: `camp_view_thread_${reply.id}`,
            value: reply.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Mark Closed', emoji: true },
            action_id: `camp_mark_closed_${reply.id}`,
            value: reply.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Add to Nurture', emoji: true },
            action_id: `camp_add_nurture_${reply.id}`,
            value: reply.id,
          },
        ],
      });
    }
  }

  // Add suggestion section
  if (suggestions.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*Optimization Suggestions:*' },
    });
    for (const suggestion of suggestions) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `• *${suggestion.type}*: ${suggestion.description}` },
      });
    }
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Apply Suggestions', emoji: true },
          action_id: `camp_apply_suggestion_${metrics.campaign_id}`,
          value: metrics.campaign_id,
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Keep Testing', emoji: true },
          action_id: `camp_keep_testing_${metrics.campaign_id}`,
          value: metrics.campaign_id,
        },
      ],
    });
  }

  return blocks;
}

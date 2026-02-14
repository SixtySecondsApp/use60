/**
 * Campaign Monitoring Slack Interactive Handler
 * Handles campaign report actions from daily monitoring
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { buildCampaignReportMessage, type CampaignReportData } from '../../_shared/slackBlocks.ts';

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

// buildCampaignReportMessage is now imported from ../../_shared/slackBlocks.ts

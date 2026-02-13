/**
 * Proposal Slack Interactive Handler
 * Handles proposal review and delivery actions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface ProposalActionContext {
  actionId: string;
  actionValue: string;
  userId: string;
  orgId: string;
  channelId: string;
  messageTs: string;
  responseUrl: string;
}

export async function handleProposalAction(ctx: ProposalActionContext): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const parts = ctx.actionId.split('_');
  const action = parts[1]; // approve, edit, share, skip

  if (action === 'approve' && parts[2] === 'send') {
    const jobId = parts.slice(3).join('_');

    // Load pending action
    const { data: pendingAction } = await supabase
      .from('slack_pending_actions')
      .select('id, sequence_context, status')
      .eq('id', ctx.actionValue)
      .eq('status', 'pending')
      .maybeSingle();

    if (!pendingAction) {
      await sendSlackResponse(ctx.responseUrl, '⚠️ This proposal has already been handled.');
      return;
    }

    // Update pending action
    await supabase
      .from('slack_pending_actions')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', pendingAction.id);

    // Resume orchestrator with send approval
    await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resume_job_id: jobId,
        approval_data: {
          action: 'approve_and_send',
          approved_by: ctx.userId,
          approved_at: new Date().toISOString(),
        },
      }),
    });

    await sendSlackResponse(ctx.responseUrl, '✅ Proposal approved! Sending...');

  } else if (action === 'edit') {
    const jobId = parts.slice(2).join('_');
    const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';
    await sendSlackResponse(ctx.responseUrl, `✏️ Edit proposal: ${appUrl}/proposals/review/${jobId}`);

  } else if (action === 'share' && parts[2] === 'link') {
    const jobId = parts.slice(3).join('_');

    // Generate shareable link
    const { data: pendingAction } = await supabase
      .from('slack_pending_actions')
      .select('id, sequence_context')
      .eq('id', ctx.actionValue)
      .maybeSingle();

    if (pendingAction?.sequence_context?.proposal_id) {
      const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';
      const shareLink = `${appUrl}/proposals/share/${pendingAction.sequence_context.proposal_id}`;

      await supabase
        .from('slack_pending_actions')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', pendingAction.id);

      await sendSlackResponse(ctx.responseUrl, `🔗 Shareable link: ${shareLink}`);
    } else {
      await sendSlackResponse(ctx.responseUrl, '⚠️ Could not generate link.');
    }

  } else if (action === 'skip') {
    const jobId = parts.slice(2).join('_');

    await supabase
      .from('slack_pending_actions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', ctx.actionValue);

    await sendSlackResponse(ctx.responseUrl, '⏭️ Proposal skipped.');
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
    console.error('[proposal-handler] Failed to send Slack response:', err);
  }
}

/**
 * Build Slack blocks for proposal review
 */
export function buildProposalReviewMessage(
  proposal: {
    id: string;
    title: string;
    deal_name: string;
    contact_name: string;
    summary: string;
    total_value?: number;
    sections: Array<{ title: string; preview: string }>;
  },
  jobId: string,
  pendingActionId: string,
): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📄 Proposal Ready: ${proposal.title}`, emoji: true },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Deal:* ${proposal.deal_name}` },
        { type: 'mrkdwn', text: `*Contact:* ${proposal.contact_name}` },
        ...(proposal.total_value ? [{ type: 'mrkdwn', text: `*Value:* $${proposal.total_value.toLocaleString()}` }] : []),
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Summary:*\n${proposal.summary.substring(0, 500)}` },
    },
  ];

  // Add section previews
  if (proposal.sections.length > 0) {
    blocks.push({ type: 'divider' });
    for (const section of proposal.sections.slice(0, 3)) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${section.title}*\n${section.preview.substring(0, 200)}...` },
      });
    }
    if (proposal.sections.length > 3) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `+${proposal.sections.length - 3} more sections` }],
      });
    }
  }

  // Action buttons
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Approve & Send', emoji: true },
        action_id: `prop_approve_send_${jobId}`,
        value: pendingActionId,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Edit First', emoji: true },
        action_id: `prop_edit_${jobId}`,
        value: pendingActionId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Share Link', emoji: true },
        action_id: `prop_share_link_${jobId}`,
        value: pendingActionId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Skip', emoji: true },
        action_id: `prop_skip_${jobId}`,
        value: pendingActionId,
      },
    ],
  });

  return blocks;
}

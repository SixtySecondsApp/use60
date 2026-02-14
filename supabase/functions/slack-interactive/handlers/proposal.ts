/**
 * Proposal Slack Interactive Handler
 * Handles proposal review and delivery actions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { buildProposalReviewMessage, type ProposalReviewData } from '../../_shared/slackBlocks.ts';

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

// buildProposalReviewMessage is now imported from ../../_shared/slackBlocks.ts

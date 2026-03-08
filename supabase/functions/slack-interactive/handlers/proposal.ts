/**
 * Proposal Slack Interactive Handler
 * Handles proposal review and delivery actions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
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
    const approvedAt = new Date();

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

    // AUT-002: Fetch proposal to determine if it was edited before approval.
    // trackProposalEditMetrics (STY-004) persists edit metrics into style_config._edit_metrics
    // when a rep edits sections in the UI. We use those metrics here to decide which
    // autopilot signal to record (approved_edited vs approved) and to populate
    // edit_distance + edit_fields on the signal row.
    const proposalId = pendingAction.sequence_context?.proposal_id as string | undefined;
    let editDistance: number | undefined;
    let editFields: string[] | undefined;
    let dealId: string | undefined;
    let contactId: string | undefined;
    let createdAt: string | undefined;
    let currentTier = 'approve';

    if (proposalId) {
      const { data: proposalRow } = await supabase
        .from('proposals')
        .select('style_config, deal_id, contact_id, created_at')
        .eq('id', proposalId)
        .maybeSingle();

      if (proposalRow) {
        dealId = proposalRow.deal_id ?? undefined;
        contactId = proposalRow.contact_id ?? undefined;
        createdAt = proposalRow.created_at;

        const editMetrics = (proposalRow.style_config as Record<string, unknown> | null)
          ?._edit_metrics as Record<string, unknown> | undefined;
        if (editMetrics && typeof editMetrics.overall_distance === 'number' && editMetrics.overall_distance > 0) {
          editDistance = editMetrics.overall_distance as number;
          editFields = Array.isArray(editMetrics.edit_fields) ? editMetrics.edit_fields as string[] : undefined;
        }
      }

      // Fetch current autonomy tier for proposal.send action type
      const { data: tierRow } = await supabase
        .from('autopilot_confidence')
        .select('current_tier')
        .eq('user_id', ctx.userId)
        .eq('action_type', 'proposal.send')
        .maybeSingle();
      currentTier = (tierRow as Record<string, unknown> | null)?.current_tier as string ?? 'approve';
    }

    // Update pending action
    await supabase
      .from('slack_pending_actions')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', pendingAction.id);

    // Resume orchestrator with send approval
    await fetch(`${supabaseUrl}/functions/v1/agent-fleet-router`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'orchestrator',
        resume_job_id: jobId,
        approval_data: {
          action: 'approve_and_send',
          approved_by: ctx.userId,
          approved_at: approvedAt.toISOString(),
        },
      }),
    });

    // AUT-002: Record autopilot signal — approved_edited if the rep changed sections,
    // approved otherwise. Signal weight: approved (+1.0), approved_edited (+0.3).
    if (proposalId) {
      try {
        const { recordSignal } = await import('../../_shared/autopilot/signals.ts');
        const timeToRespondMs = createdAt
          ? approvedAt.getTime() - new Date(createdAt).getTime()
          : undefined;
        const signal = editDistance && editDistance > 0 ? 'approved_edited' : 'approved';

        await recordSignal(supabase as Parameters<typeof recordSignal>[0], {
          user_id: ctx.userId,
          org_id: ctx.orgId,
          action_type: 'proposal.send',
          agent_name: 'proposal-pipeline-v2',
          signal,
          edit_distance: editDistance,
          edit_fields: editFields,
          time_to_respond_ms: timeToRespondMs,
          deal_id: dealId,
          contact_id: contactId,
          autonomy_tier_at_time: currentTier,
        });
      } catch (sigErr) {
        console.error('[proposal-handler] Failed to record autopilot signal (non-fatal):', sigErr);
      }
    }

    await sendSlackResponse(ctx.responseUrl, 'Proposal approved! Sending...');

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

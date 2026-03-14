/**
 * Proposal Slack Interactive Handler
 * Handles proposal review and delivery actions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { buildProposalReviewMessage, type ProposalReviewData } from '../../_shared/slackBlocks.ts';
import { writeDocumentMemory } from '../../_shared/documents/writeDocumentMemory.ts';
import { getDailyThreadTs } from '../../_shared/slack/dailyThread.ts';
import { sendSlackDM } from '../../_shared/proactive/deliverySlack.ts';

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
    let proposalTitle: string | undefined;
    let proposalSections: Array<{ id: string; type: string; title: string; content: string }> | undefined;
    let documentType: string | undefined;

    if (proposalId) {
      const { data: proposalRow } = await supabase
        .from('proposals')
        .select('style_config, deal_id, contact_id, created_at, title, sections, document_type')
        .eq('id', proposalId)
        .maybeSingle();

      if (proposalRow) {
        dealId = proposalRow.deal_id ?? undefined;
        contactId = proposalRow.contact_id ?? undefined;
        createdAt = proposalRow.created_at;
        proposalTitle = proposalRow.title ?? undefined;
        proposalSections = Array.isArray(proposalRow.sections) ? proposalRow.sections : undefined;
        documentType = proposalRow.document_type ?? 'proposal';

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

    // DOC-006: Wire email delivery after Slack approval
    await sendSlackResponse(ctx.responseUrl, 'Proposal approved! Sending...');

    try {
      await deliverProposalEmail(supabase, {
        proposalId: proposalId!,
        dealId,
        contactId,
        documentType: documentType || 'proposal',
        proposalTitle,
        proposalSections,
        userId: ctx.userId,
        orgId: ctx.orgId,
      });
    } catch (deliveryErr) {
      console.error('[proposal-handler] DOC-006 email delivery failed (non-fatal):', deliveryErr);
    }

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

// =============================================================================
// DOC-006: Email delivery after Slack approval
// =============================================================================

interface DeliverProposalEmailParams {
  proposalId: string;
  dealId: string | undefined;
  contactId: string | undefined;
  documentType: string;
  proposalTitle: string | undefined;
  proposalSections: Array<{ id: string; type: string; title: string; content: string }> | undefined;
  userId: string;
  orgId: string;
}

async function deliverProposalEmail(
  supabase: ReturnType<typeof createClient>,
  params: DeliverProposalEmailParams,
): Promise<void> {
  const {
    proposalId, dealId, contactId, documentType, proposalTitle,
    proposalSections, userId, orgId,
  } = params;

  // 1. Resolve contact email
  if (!contactId) {
    console.warn('[DOC-006] No contactId on proposal, skipping email delivery');
    return;
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('email, first_name, last_name')
    .eq('id', contactId)
    .maybeSingle();

  if (!contact?.email) {
    console.warn(`[DOC-006] Contact ${contactId} has no email, skipping delivery`);
    return;
  }

  const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'prospect';

  // 2. Resolve deal name
  let dealName = proposalTitle || 'your project';
  if (dealId) {
    const { data: deal } = await supabase
      .from('deals')
      .select('name')
      .eq('id', dealId)
      .maybeSingle();
    if (deal?.name) dealName = deal.name;
  }

  // 3. Format document type label
  const docTypeLabel = documentType
    .split('_')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // 4. Build email subject & body from sections
  const subject = `${docTypeLabel}: ${dealName}`;

  let emailBody = '';
  if (proposalSections && proposalSections.length > 0) {
    // Find executive_summary section
    const execSummary = proposalSections.find((s) => s.type === 'executive_summary');
    const otherSections = proposalSections.filter(
      (s) => s.type !== 'executive_summary' && s.type !== 'cover',
    );

    if (execSummary?.content) {
      emailBody += execSummary.content;
    }

    emailBody += `<p>Please find the detailed ${docTypeLabel} below.</p>`;

    if (otherSections.length > 0) {
      emailBody += '<ul>';
      for (const section of otherSections) {
        emailBody += `<li>${section.title}</li>`;
      }
      emailBody += '</ul>';
    }
  } else {
    emailBody = `<p>Please find the ${docTypeLabel} for ${dealName} attached.</p>`;
  }

  // 5. Send email via email-send-as-rep
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let emailSent = false;
  try {
    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/email-send-as-rep`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        org_id: orgId,
        to: contact.email,
        subject,
        body: emailBody,
      }),
    });

    if (emailResponse.ok) {
      emailSent = true;
      console.log(`[DOC-006] Email sent to ${contact.email} for proposal ${proposalId}`);
    } else {
      const errText = await emailResponse.text().catch(() => 'unknown error');
      console.error(`[DOC-006] email-send-as-rep failed (${emailResponse.status}): ${errText}`);
    }
  } catch (emailErr) {
    console.error('[DOC-006] email-send-as-rep invocation error:', emailErr);
  }

  // 6. Update proposals table with sent_at (store in metadata JSONB if column doesn't exist)
  try {
    const sentAt = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('proposals')
      .update({
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', proposalId);

    if (updateErr) {
      // Fallback: sent_at column may not exist yet — store in style_config metadata
      console.warn('[DOC-006] sent_at column update failed, storing in style_config:', updateErr.message);
      const { data: existing } = await supabase
        .from('proposals')
        .select('style_config')
        .eq('id', proposalId)
        .maybeSingle();

      const styleConfig = (existing?.style_config as Record<string, unknown>) || {};
      styleConfig._sent_at = sentAt;

      await supabase
        .from('proposals')
        .update({ style_config: styleConfig, updated_at: sentAt })
        .eq('id', proposalId);
    }
  } catch (updateErr) {
    console.error('[DOC-006] Failed to update proposal sent_at:', updateErr);
  }

  // 7. Write Brain memory via writeDocumentMemory
  const sectionCount = proposalSections?.length ?? 0;
  await writeDocumentMemory(orgId, dealId || null, contactId, docTypeLabel, sectionCount, contactName, supabase);

  // 8. Post confirmation to daily Slack thread
  try {
    const threadTs = await getDailyThreadTs(userId, orgId, supabase);

    // Look up Slack credentials for DM
    const { data: slackOrg } = await supabase
      .from('slack_org_settings')
      .select('bot_access_token')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle();

    if (slackOrg?.bot_access_token) {
      const { data: mapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('org_id', orgId)
        .eq('sixty_user_id', userId)
        .maybeSingle();

      if (mapping?.slack_user_id) {
        const statusMsg = emailSent
          ? `${docTypeLabel} sent to ${contactName} (${contact.email})`
          : `${docTypeLabel} approved for ${contactName} (email delivery failed — please send manually)`;

        await sendSlackDM({
          botToken: slackOrg.bot_access_token,
          slackUserId: mapping.slack_user_id,
          text: statusMsg,
          ...(threadTs ? { thread_ts: threadTs } : {}),
        });
      }
    }
  } catch (threadErr) {
    console.error('[DOC-006] Failed to post daily thread confirmation:', threadErr);
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

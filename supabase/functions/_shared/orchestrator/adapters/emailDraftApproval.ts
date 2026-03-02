/**
 * Email Draft Approval Adapter (EMAIL-001)
 *
 * Wave 3.5 step in the meeting_ended sequence.
 * Runs after draft-followup-email and before notify-slack-summary.
 *
 * Responsibilities:
 * 1. Reads the email draft produced by draft-followup-email
 * 2. Creates a hitl_pending_approvals row (resource_type='email_draft', callback_type='edge_function')
 * 3. Sends a Slack Block Kit DM to the rep with email preview and four action buttons:
 *    [Approve] [Edit in 60] [Schedule] [Skip]
 * 4. Returns a pending_approval so the orchestrator runner pauses the sequence
 *
 * The slack-interactive edge function handles the button callbacks via the
 * existing approve::email_draft::{id} / reject::email_draft::{id} action ID
 * convention. "Edit in 60" is a URL button that opens the app. "Schedule" is
 * treated as a reject (defer) action handled by slack-interactive routing.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// Block Kit Helpers
// =============================================================================

function header(text: string) {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text: text.substring(0, 150),
      emoji: false,
    },
  };
}

function section(text: string) {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: text.substring(0, 3000),
    },
  };
}

function divider() {
  return { type: 'divider' };
}

function contextBlock(elements: string[]) {
  return {
    type: 'context',
    elements: elements.map((text) => ({
      type: 'mrkdwn',
      text: text.substring(0, 300),
    })),
  };
}

function button(
  text: string,
  actionId: string,
  value: string,
  style?: 'primary' | 'danger',
  url?: string,
): unknown {
  const btn: Record<string, unknown> = {
    type: 'button',
    text: {
      type: 'plain_text',
      text: text.substring(0, 75),
      emoji: false,
    },
    action_id: actionId,
    value,
  };
  if (style) btn.style = style;
  if (url) btn.url = url;
  return btn;
}

function actionsBlock(blockId: string, elements: unknown[]) {
  return {
    type: 'actions',
    block_id: blockId,
    elements,
  };
}

// =============================================================================
// Block Kit Message Builder
// =============================================================================

function buildEmailDraftApprovalBlocks(params: {
  approvalId: string;
  to: string;
  contactName: string;
  subject: string;
  body: string;
  meetingTitle: string;
  aiGenerated: boolean;
  appUrl: string;
}): unknown[] {
  const { approvalId, to, contactName, subject, body, meetingTitle, aiGenerated, appUrl } = params;

  // Truncate body for Slack display — keep it readable, not overwhelming
  const displayBody = body.length > 1500 ? body.substring(0, 1500) + '\n...' : body;

  const editUrl = `${appUrl}/meetings?approval=${approvalId}`;

  return [
    header('Follow-up Email Ready for Review'),
    contextBlock([
      `Meeting: *${meetingTitle}* | ${aiGenerated ? 'AI-generated' : 'Template'} draft`,
    ]),
    divider(),
    section(`*To:* ${contactName} (${to})\n*Subject:* ${subject}`),
    divider(),
    section(displayBody),
    divider(),
    // All four buttons follow the slack-interactive parse format: {action}::email_draft::{approvalId}
    // Slack requires unique action_ids within each actions block.
    // Approve and Edit go in one block; Schedule and Skip each get their own block so that
    // reject::email_draft::{id} (shared by Schedule and Skip) is unique within its block.
    actionsBlock(`email_draft_approval_primary_${approvalId}`, [
      button('Approve', `approve::email_draft::${approvalId}`, JSON.stringify({ approvalId }), 'primary'),
      button('Edit in 60', `edit::email_draft::${approvalId}`, JSON.stringify({ approvalId }), undefined, editUrl),
    ]),
    // Schedule: reject flow with subAction=schedule so future scheduling logic can distinguish it.
    // In its own block so reject::email_draft::{id} is unique within this block.
    actionsBlock(`email_draft_approval_sched_${approvalId}`, [
      button('Schedule', `reject::email_draft::${approvalId}`, JSON.stringify({ approvalId, subAction: 'schedule' })),
    ]),
    // Skip: reject flow with subAction=skip. Separate block from Schedule (same action_id allowed across blocks).
    actionsBlock(`email_draft_approval_skip_${approvalId}`, [
      button('Skip', `reject::email_draft::${approvalId}`, JSON.stringify({ approvalId, subAction: 'skip' }), 'danger'),
    ]),
    contextBlock([
      `Expires in 24 hours | Reply in Sixty or your email client to send`,
    ]),
  ];
}

// =============================================================================
// Adapter
// =============================================================================

export const emailDraftApprovalAdapter: SkillAdapter = {
  name: 'email-draft-approval',
  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';
      const supabase = getServiceClient();

      // --- Read upstream draft-followup-email output ---
      const emailOutput = state.outputs['draft-followup-email'] as any;

      if (!emailOutput || emailOutput.skipped || !emailOutput.email_draft) {
        console.log('[email-draft-approval] No email draft available — skipping HITL step');
        return {
          success: true,
          output: { skipped: true, reason: 'no_email_draft' },
          duration_ms: Date.now() - start,
        };
      }

      const draft = emailOutput.email_draft as {
        to: string;
        subject: string;
        body: string;
        ai_generated?: boolean;
      };

      const contactName = (emailOutput.contact_name as string) || draft.to;
      const meetingTitle = (state.event.payload.title as string) || 'Our meeting';
      const meetingId = state.event.payload.meeting_id as string | undefined;

      // --- Get Slack credentials for DM delivery ---
      const { data: slackIntegration } = await supabase
        .from('slack_integrations')
        .select('access_token')
        .eq('user_id', state.event.user_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const { data: slackMapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('org_id', state.event.org_id)
        .eq('sixty_user_id', state.event.user_id)
        .maybeSingle();

      const botToken = slackIntegration?.access_token;
      const recipientSlackUserId = slackMapping?.slack_user_id;

      if (!botToken || !recipientSlackUserId) {
        console.log('[email-draft-approval] No Slack credentials — skipping HITL step');
        return {
          success: true,
          output: { skipped: true, reason: 'no_slack_integration' },
          duration_ms: Date.now() - start,
        };
      }

      // --- Open DM channel with the rep ---
      const dmResponse = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({ users: recipientSlackUserId }),
      });

      const dmData = await dmResponse.json();
      const dmChannelId = dmData.channel?.id;
      const slackTeamId = dmData.channel?.context_team_id || '';

      if (!dmChannelId) {
        console.warn('[email-draft-approval] Failed to open DM channel:', dmData.error);
        return {
          success: true,
          output: { skipped: true, reason: 'slack_dm_failed' },
          duration_ms: Date.now() - start,
        };
      }

      // --- Build approval blocks (placeholder approval ID for display, real ID inserted below) ---
      // We need the real approval ID for the button action IDs, so we'll create the DB row first.
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // --- Create hitl_pending_approvals row ---
      const { data: approval, error: approvalError } = await supabase
        .from('hitl_pending_approvals')
        .insert({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          created_by: state.event.user_id,
          resource_type: 'email_draft',
          resource_id: meetingId || state.event.org_id,
          resource_name: `Follow-up: ${meetingTitle}`,
          slack_team_id: slackTeamId,
          slack_channel_id: dmChannelId,
          slack_message_ts: '', // updated after message is sent
          status: 'pending',
          original_content: {
            to: draft.to,
            toName: contactName,
            subject: draft.subject,
            body: draft.body,
            meeting_id: meetingId,
            meeting_title: meetingTitle,
            ai_generated: draft.ai_generated ?? false,
          },
          callback_type: 'edge_function',
          callback_target: 'hitl-send-followup-email',
          callback_metadata: {
            meeting_id: meetingId,
            job_id: (state as any).job_id || null,
            sequence_type: 'meeting_ended',
          },
          expires_at: expiresAt,
          metadata: {
            sequence_type: 'meeting_ended',
            step: 'email-draft-approval',
            meeting_id: meetingId,
          },
        })
        .select('id')
        .single();

      if (approvalError || !approval?.id) {
        console.error('[email-draft-approval] Failed to create hitl_pending_approvals row:', approvalError);
        return {
          success: true,
          output: { skipped: true, reason: 'approval_insert_failed', error: approvalError?.message },
          duration_ms: Date.now() - start,
        };
      }

      const approvalId = approval.id;

      // --- Build and send Slack Block Kit message ---
      const blocks = buildEmailDraftApprovalBlocks({
        approvalId,
        to: draft.to,
        contactName,
        subject: draft.subject,
        body: draft.body,
        meetingTitle,
        aiGenerated: draft.ai_generated ?? false,
        appUrl,
      });

      const fallbackText = `Follow-up email draft ready for review: ${draft.subject}`;

      const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({
          channel: dmChannelId,
          text: fallbackText,
          blocks,
        }),
      });

      const slackResult = await slackResponse.json();

      if (!slackResult.ok) {
        console.error('[email-draft-approval] Slack postMessage failed:', slackResult.error);
        // Clean up the approval row since Slack delivery failed
        await supabase
          .from('hitl_pending_approvals')
          .delete()
          .eq('id', approvalId);
        return {
          success: true,
          output: { skipped: true, reason: 'slack_post_failed', error: slackResult.error },
          duration_ms: Date.now() - start,
        };
      }

      // --- Update approval row with actual Slack message timestamp ---
      await supabase
        .from('hitl_pending_approvals')
        .update({
          slack_message_ts: slackResult.ts || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', approvalId);

      console.log(
        `[email-draft-approval] HITL approval created: id=${approvalId}, ` +
        `to=${draft.to}, subject=${draft.subject}, slack_ts=${slackResult.ts}`
      );

      return {
        success: true,
        output: {
          approval_id: approvalId,
          to: draft.to,
          contact_name: contactName,
          subject: draft.subject,
          slack_message_ts: slackResult.ts,
          slack_channel_id: dmChannelId,
          hitl_created: true,
        },
        duration_ms: Date.now() - start,
        // Signal the runner to pause and wait for human approval
        pending_approval: {
          step_name: 'email-draft-approval',
          action_type: 'email_draft',
          preview: `Follow-up email to ${contactName} — ${draft.subject}`,
          slack_pending_action_id: approvalId,
          created_at: new Date().toISOString(),
        },
      };
    } catch (err) {
      console.error('[email-draft-approval] Error:', err);
      // Non-fatal: return success with skipped so the sequence can continue
      return {
        success: true,
        output: { skipped: true, reason: 'unexpected_error', error: String(err) },
        duration_ms: Date.now() - start,
      };
    }
  },
};

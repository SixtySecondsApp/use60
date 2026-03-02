/**
 * HITL Callback: Send Follow-up Email
 *
 * Triggered by `slack-interactive` after a HITL approval action.
 * On approve/edit, sends the email via the existing `google-gmail` edge function.
 *
 * SECURITY:
 * - POST only
 * - FAIL-CLOSED: service role only (called server-to-server)
 *
 * EMAIL-006: Enforces a daily per-rep send cap (default 50, configurable via
 * organizations.daily_email_send_cap). If the cap is reached the send is
 * blocked and a Slack DM is posted back to the approval channel.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { logAgentAction } from '../_shared/memory/dailyLog.ts';
import { recordSignal, ApprovalSignal } from '../_shared/autopilot/signals.ts';
import { recalculateUserConfidence } from '../_shared/autopilot/confidence.ts';
import { evaluateDemotionTriggers, executeDemotion } from '../_shared/autopilot/demotionEngine.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type CallbackPayload = {
  approval_id: string;
  resource_type: string;
  action: 'approved' | 'rejected' | 'edited';
  content?: Record<string, unknown>;
  original_content?: Record<string, unknown>;
  callback_metadata?: Record<string, unknown>;
};

function pickString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
}

// ---------------------------------------------------------------------------
// EMAIL-006 helpers
// ---------------------------------------------------------------------------

/**
 * Read the configured daily email send cap for an org.
 * Falls back to 50 if the column is absent or null.
 */
async function getDailyEmailSendCap(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<number> {
  const { data } = await supabase
    .from('organizations')
    .select('daily_email_send_cap')
    .eq('id', orgId)
    .maybeSingle();

  return (data as Record<string, unknown> | null)?.daily_email_send_cap as number ?? 50;
}

/**
 * Count how many emails this user has successfully sent today (UTC midnight reset).
 * Reads from agent_daily_logs where action_type = 'send_email' and outcome = 'success'.
 */
async function countTodaySends(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<number> {
  // CURRENT_DATE in Postgres is always UTC-midnight. We pass it as a literal
  // ISO string so the comparison is server-side with timezone awareness.
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('agent_daily_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action_type', 'send_email')
    .eq('outcome', 'success')
    .gte('created_at', todayUtc.toISOString());

  if (error) {
    console.error('[hitl-send-followup-email] countTodaySends error:', error);
    // Fail open on count errors — do not block the send.
    return 0;
  }

  return count ?? 0;
}

/**
 * Post a Slack message to the approval's channel informing the rep that their
 * daily send cap has been reached.
 */
async function notifySlackCapReached(
  supabase: ReturnType<typeof createClient>,
  approval: {
    org_id: string;
    metadata?: unknown;
    slack_team_id?: string | null;
    slack_channel_id?: string | null;
  },
  cap: number
): Promise<void> {
  try {
    const meta = (approval.metadata || {}) as Record<string, unknown>;
    const slackTeamId = pickString(meta.slack_team_id) ?? pickString((approval as Record<string, unknown>).slack_team_id as string);
    const slackChannelId = pickString(meta.slack_channel_id) ?? pickString((approval as Record<string, unknown>).slack_channel_id as string);

    if (!slackTeamId || !slackChannelId) return;

    const { data: slackConn } = await supabase
      .from('slack_org_settings')
      .select('bot_access_token')
      .eq('slack_team_id', slackTeamId)
      .eq('is_connected', true)
      .maybeSingle();

    const botToken = pickString((slackConn as Record<string, unknown> | null)?.bot_access_token as string);
    if (!botToken) return;

    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackChannelId,
        text: `Daily send limit (${cap}) reached`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:no_entry: *Daily send limit (${cap}) reached*\nNo further follow-up emails will be sent today. The limit resets at midnight UTC.`,
            },
          },
        ],
      }),
    });
  } catch (err) {
    // Best-effort — don't fail the response if Slack notification fails.
    console.error('[hitl-send-followup-email] notifySlackCapReached error:', err);
  }
}

// ---------------------------------------------------------------------------
// EMAIL-009: Autopilot signal helpers
// ---------------------------------------------------------------------------

/**
 * Looks up the current autopilot tier for a (user, action_type) pair.
 * Returns 'approve' as a safe default if the row is absent or the query fails.
 */
async function getCurrentAutopilotTier(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  actionType: string
): Promise<string> {
  const { data } = await supabase
    .from('autopilot_confidence')
    .select('current_tier')
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .maybeSingle();

  return (data as Record<string, unknown> | null)?.current_tier as string ?? 'approve';
}

/**
 * Records an autopilot signal for the email.send action, then recalculates
 * confidence. If the signal is 'undone' and the user is on the 'auto' tier,
 * the demotion engine is also evaluated (fire-and-forget).
 *
 * All errors are caught and logged — this must never block the HTTP response.
 */
async function recordAutopilotSignal(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  signal: ApprovalSignal,
  approvalId: string,
  meetingId?: string | null
): Promise<void> {
  try {
    const ACTION_TYPE = 'email.send';
    const tier = await getCurrentAutopilotTier(supabase, userId, ACTION_TYPE);

    await recordSignal(supabase as Parameters<typeof recordSignal>[0], {
      user_id: userId,
      org_id: orgId,
      action_type: ACTION_TYPE,
      agent_name: 'hitl-send-followup-email',
      signal,
      autonomy_tier_at_time: tier,
      meeting_id: meetingId ?? undefined,
    });

    // Recalculate confidence score after recording the signal (fire-and-forget)
    recalculateUserConfidence(
      supabase as Parameters<typeof recalculateUserConfidence>[0],
      userId,
      orgId,
      ACTION_TYPE
    ).catch((err) =>
      console.error('[hitl-send-followup-email] recalculateUserConfidence error:', err)
    );

    // If this is an undo signal and the user is on auto tier, run demotion check
    if (signal === 'undone' || signal === 'auto_undone') {
      evaluateDemotionTriggers(
        supabase as Parameters<typeof evaluateDemotionTriggers>[0],
        userId,
        orgId,
        ACTION_TYPE
      ).then((result) => {
        if (result.triggered && result.severity) {
          return executeDemotion(
            supabase as Parameters<typeof executeDemotion>[0],
            userId,
            orgId,
            ACTION_TYPE,
            result.severity,
            result
          );
        }
      }).catch((err) =>
        console.error('[hitl-send-followup-email] demotion evaluation error:', err)
      );
    }
  } catch (err) {
    console.error('[hitl-send-followup-email] recordAutopilotSignal unexpected error:', err);
  }
}

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)) {
      return errorResponse('Unauthorized', req, 401);
    }

    const payload = (await req.json().catch(() => ({}))) as Partial<CallbackPayload>;
    const approvalId = pickString(payload.approval_id);
    const action = payload.action;

    if (!approvalId || !action) {
      return errorResponse('Missing approval_id or action', req, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: approval, error: approvalErr } = await supabase
      .from('hitl_pending_approvals')
      .select('id, org_id, user_id, status, original_content, edited_content, metadata, slack_team_id, slack_channel_id')
      .eq('id', approvalId)
      .maybeSingle();

    if (approvalErr || !approval) {
      return errorResponse('Approval not found', req, 404);
    }

    // For rejects, we do nothing other than log a mirrored in-app notification.
    if (action === 'rejected') {
      if (approval.user_id) {
        await supabase.from('notifications').insert({
          user_id: approval.user_id,
          title: 'Follow-up email rejected',
          message: 'You rejected the follow-up email draft.',
          type: 'info',
          category: 'workflow',
          entity_type: 'email_draft',
          entity_id: null,
          action_url: '/meetings',
          metadata: { approval_id: approvalId, source: 'hitl' },
        });
      }

      await logAgentAction({
        supabaseClient: supabase,
        orgId: approval.org_id,
        userId: approval.user_id ?? null,
        agentType: 'meeting_ended',
        actionType: 'send_email',
        actionDetail: {
          approval_id: approvalId,
          action: 'rejected',
          provider: 'gmail',
        },
        outcome: 'cancelled',
        creditCost: 0,
        chainId: (approval.metadata as Record<string, unknown>)?.chain_id as string ?? null,
      });

      // EMAIL-009: Record autopilot signal for rejected outcome (fire-and-forget)
      if (approval.user_id) {
        const meetingId = pickString(
          (approval.metadata as Record<string, unknown>)?.meeting_id as string
        );
        recordAutopilotSignal(
          supabase,
          approval.user_id,
          approval.org_id,
          'rejected',
          approvalId,
          meetingId
        );
      }

      return jsonResponse({ success: true, action: 'rejected', approvalId }, req);
    }

    if (!approval.user_id) {
      return errorResponse('Approval has no user_id (cannot send email)', req, 400);
    }

    // -----------------------------------------------------------------------
    // PROP-003: Proposal email assembly
    // When resource_type is 'proposal', assemble the email from the proposal
    // content stored in original_content rather than treating it as a plain
    // email draft. The contact email is resolved via deal -> primary_contact.
    // -----------------------------------------------------------------------
    const resourceType = pickString(payload.resource_type) ?? '';
    let to: string | null = null;
    let subject: string;
    let body: string;
    let isHtmlOverride: boolean | undefined;

    if (resourceType === 'proposal') {
      const oc = (approval.original_content || {}) as Record<string, unknown>;
      const dealId = pickString(oc.deal_id);
      const dealName = pickString(oc.deal_name) || 'Proposal';
      const contactName = pickString(oc.contact_name) || 'there';
      const meetingTitle = pickString(oc.meeting_title) || 'our recent meeting';
      const executiveSummary = pickString(oc.executive_summary) || '';
      const pricingSection = pickString(oc.pricing_section);

      console.log(`[PROP-003] Assembling proposal email for deal_id=${dealId}`);

      // Resolve contact email via deal -> primary_contact_id -> contacts
      if (dealId) {
        try {
          const { data: dealRow } = await supabase
            .from('deals')
            .select('primary_contact_id, name')
            .eq('id', dealId)
            .maybeSingle();

          const primaryContactId = (dealRow as Record<string, unknown> | null)?.primary_contact_id as string | null;

          if (primaryContactId) {
            const { data: contactRow } = await supabase
              .from('contacts')
              .select('email, first_name, last_name')
              .eq('id', primaryContactId)
              .maybeSingle();

            const contactEmail = pickString((contactRow as Record<string, unknown> | null)?.email as string);
            if (contactEmail) {
              to = contactEmail;
            }
          }
        } catch (lookupErr) {
          console.warn('[PROP-003] Contact email lookup failed (non-fatal):', lookupErr);
        }
      }

      // Fallback: check if to was provided directly in original_content (forward-compat)
      if (!to) {
        to = pickString(oc.to) || pickString(oc.contact_email);
      }

      if (!to) {
        console.error('[PROP-003] Could not resolve contact email for proposal approval', approvalId);
        await logAgentAction({
          supabaseClient: supabase,
          orgId: approval.org_id,
          userId: approval.user_id ?? null,
          agentType: 'meeting_ended',
          actionType: 'send_email',
          actionDetail: { approval_id: approvalId, resource_type: 'proposal', error: 'no_contact_email' },
          outcome: 'failed',
          errorMessage: 'Could not resolve contact email from deal primary contact',
          creditCost: 0,
          chainId: (approval.metadata as Record<string, unknown>)?.chain_id as string ?? null,
        });
        return errorResponse('Proposal approval: could not resolve contact email', req, 400);
      }

      // Resolve rep display name for the closing signature
      let repName = 'Your team';
      try {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('full_name, first_name, last_name')
          .eq('id', approval.user_id)
          .maybeSingle();

        const profile = profileRow as Record<string, unknown> | null;
        if (profile) {
          repName =
            pickString(profile.full_name as string) ||
            [pickString(profile.first_name as string), pickString(profile.last_name as string)]
              .filter(Boolean)
              .join(' ') ||
            repName;
        }
      } catch {
        // Non-fatal — use fallback name
      }

      // Build email subject
      subject = `Proposal for ${dealName}`;

      // Build HTML email body — personalised cover note + executive summary + optional pricing
      const pricingHtml = pricingSection
        ? `<h2 style="font-size:16px;margin-top:24px;">Pricing</h2><p style="white-space:pre-wrap;">${pricingSection}</p>`
        : '';

      body = `<p>Hi ${contactName},</p>

<p>Following our conversation about ${meetingTitle}, I've put together a proposal covering the key areas we discussed.</p>

<h2 style="font-size:16px;margin-top:24px;">Executive Summary</h2>
<p style="white-space:pre-wrap;">${executiveSummary}</p>
${pricingHtml}
<p style="margin-top:24px;">I'd love to schedule some time to walk you through this in detail. Let me know what works best.</p>

<p>Best regards,<br/>${repName}</p>`;

      isHtmlOverride = true;

      console.log(`[PROP-003] Proposal email assembled: to=${to}, subject="${subject}", html=true`);
    } else {
      // Standard follow-up email: determine final email content (prefer callback content).
      const content = (payload.content || approval.edited_content || approval.original_content || {}) as Record<string, unknown>;

      to =
        pickString(content.recipientEmail) ||
        pickString(content.recipient) ||
        pickString(content.to);
      subject = pickString(content.subject) || 'Following up';
      body = pickString(content.body) || '';
    }

    if (!to || !body) {
      return errorResponse('Email draft missing recipient or body', req, 400);
    }

    // -----------------------------------------------------------------------
    // EMAIL-006: Daily send cap enforcement
    // Read cap from org settings (COALESCE default 50). Count successful
    // send_email actions logged today (UTC) for this user in agent_daily_logs.
    // -----------------------------------------------------------------------
    const dailyCap = await getDailyEmailSendCap(supabase, approval.org_id);
    const todaySendCount = await countTodaySends(supabase, approval.user_id);

    if (todaySendCount >= dailyCap) {
      console.warn(
        `[hitl-send-followup-email] Daily cap reached for user ${approval.user_id}: ${todaySendCount}/${dailyCap}`
      );

      // Post a Slack notification back to the approval channel so the rep sees it.
      await notifySlackCapReached(supabase, approval, dailyCap);

      // Mirror as in-app notification too.
      await supabase.from('notifications').insert({
        user_id: approval.user_id,
        title: 'Daily email limit reached',
        message: `Daily send limit (${dailyCap}) reached. No further emails will be sent today.`,
        type: 'warning',
        category: 'workflow',
        entity_type: 'email_draft',
        entity_id: null,
        action_url: '/meetings',
        metadata: { approval_id: approvalId, source: 'hitl', daily_cap: dailyCap, count: todaySendCount },
      });

      await logAgentAction({
        supabaseClient: supabase,
        orgId: approval.org_id,
        userId: approval.user_id ?? null,
        agentType: 'meeting_ended',
        actionType: 'send_email',
        actionDetail: {
          approval_id: approvalId,
          action,
          provider: 'gmail',
          blocked_reason: 'daily_cap_reached',
          daily_cap: dailyCap,
          today_count: todaySendCount,
        },
        outcome: 'skipped',
        creditCost: 0,
        chainId: (approval.metadata as Record<string, unknown>)?.chain_id as string ?? null,
      });

      return jsonResponse(
        { success: false, approvalId, action, error: `Daily send limit (${dailyCap}) reached` },
        req,
        429
      );
    }
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // EMAIL-010: Detect connected email provider and route accordingly.
    // Reads user_settings.preferences.connected_email_provider.
    // Falls back to 'google' to preserve backward-compatibility for all
    // existing users who were Gmail-only before EMAIL-010.
    // -----------------------------------------------------------------------
    const { data: userSettingsRow } = await supabase
      .from('user_settings')
      .select('preferences')
      .eq('user_id', approval.user_id)
      .maybeSingle();

    const userPrefs = ((userSettingsRow as Record<string, unknown> | null)?.preferences || {}) as Record<string, unknown>;
    const emailProvider = (userPrefs.connected_email_provider as string | undefined) || 'google';

    console.log('[hitl-send-followup-email] email provider:', emailProvider);

    // Extract thread context for reply threading (EMAIL-004).
    // Sources checked in priority order: callback content > original_content > callback_metadata.
    // For proposals (PROP-003) there is no edited `content` object — read only from original_content
    // and metadata.
    const originalContent = (approval.original_content || {}) as Record<string, unknown>;
    const callbackMeta = (approval.metadata || {}) as Record<string, unknown>;
    // callbackContent is the payload content field; may be absent for proposals
    const callbackContent = (payload.content || {}) as Record<string, unknown>;

    const threadId =
      pickString(callbackContent.thread_id) ||
      pickString(originalContent.thread_id) ||
      pickString(callbackMeta.thread_id) ||
      null;
    const inReplyTo =
      pickString(callbackContent.in_reply_to) ||
      pickString(callbackContent.inReplyTo) ||
      pickString(originalContent.in_reply_to) ||
      pickString(originalContent.inReplyTo) ||
      pickString(callbackMeta.in_reply_to) ||
      pickString(callbackMeta.inReplyTo) ||
      null;
    const references =
      pickString(callbackContent.references) ||
      pickString(originalContent.references) ||
      pickString(callbackMeta.references) ||
      null;

    console.log('[hitl-send-followup-email] thread context:', { threadId, inReplyTo, references: !!references });

    // Build the shared send payload — same interface for both Gmail and MS Graph (EMAIL-010)
    const sendPayload: Record<string, unknown> = {
      userId: approval.user_id,
      to,
      subject,
      body,
      isHtml: isHtmlOverride ?? false,
    };
    if (threadId) sendPayload.threadId = threadId;
    if (inReplyTo) sendPayload.inReplyTo = inReplyTo;
    if (references) sendPayload.references = references;

    // Route to the appropriate email sending function based on provider (EMAIL-010)
    const sendFunctionName = emailProvider === 'microsoft' ? 'ms-graph-email' : 'google-gmail';
    const sendUrl = `${SUPABASE_URL}/functions/v1/${sendFunctionName}?action=send`;

    console.log(`[hitl-send-followup-email] routing to ${sendFunctionName}`);

    const sendResp = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(sendPayload),
    });

    const sendPayloadResp = await sendResp.json().catch(() => ({}));
    const sendOk = sendResp.ok && !sendPayloadResp?.error;

    // Normalise response fields — Gmail returns { id, threadId }, MS Graph returns { success, threadId }
    const sentMessageId: string | null = sendPayloadResp?.id ?? sendPayloadResp?.messageId ?? null;
    const sentThreadId: string | null = sendPayloadResp?.threadId ?? null;
    const sendError: string | null = sendOk
      ? null
      : (pickString(sendPayloadResp?.error) || pickString(sendPayloadResp?.message) || `HTTP ${sendResp.status}`);

    // Persist send result onto the approval record (best-effort)
    await supabase
      .from('hitl_pending_approvals')
      .update({
        metadata: {
          ...(approval.metadata || {}),
          email_send: {
            ok: sendOk,
            to,
            subject,
            provider: emailProvider,
            messageId: sentMessageId,
            threadId: sentThreadId,
            error: sendError,
            sent_at: new Date().toISOString(),
          },
        },
      })
      .eq('id', approvalId);

    // Mirror to in-app (success/failure)
    const providerLabel = emailProvider === 'microsoft' ? 'Outlook/Microsoft' : 'Gmail';
    const isProposal = resourceType === 'proposal';
    await supabase.from('notifications').insert({
      user_id: approval.user_id,
      title: sendOk
        ? (isProposal ? 'Proposal sent' : 'Follow-up email sent')
        : (isProposal ? 'Proposal send failed' : 'Follow-up email failed'),
      message: sendOk
        ? `Sent to ${to}`
        : `Could not send to ${to}. ${sendError || `Check your ${providerLabel} connection.`}`,
      type: sendOk ? 'success' : 'error',
      category: 'workflow',
      entity_type: isProposal ? 'proposal' : 'email_draft',
      entity_id: null,
      action_url: '/deals',
      metadata: {
        approval_id: approvalId,
        source: 'hitl',
        provider: emailProvider,
        resource_type: resourceType || 'email_draft',
        email: sendOk ? { id: sentMessageId } : { error: sendError },
      },
    });

    const proposalOc = (approval.original_content || {}) as Record<string, unknown>;
    const proposalJobId = isProposal ? pickString(proposalOc.proposal_job_id as string) : null;
    const proposalDealId = isProposal ? pickString(proposalOc.deal_id as string) : null;
    const proposalContactName = isProposal ? (pickString(proposalOc.contact_name as string) || 'the contact') : null;
    const proposalMeetingTitle = isProposal ? (pickString(proposalOc.meeting_title as string) || 'our recent meeting') : null;
    const proposalExecutiveSummary = isProposal ? pickString(proposalOc.executive_summary as string) : null;
    const proposalPricingSection = isProposal ? pickString(proposalOc.pricing_section as string) : null;

    await logAgentAction({
      supabaseClient: supabase,
      orgId: approval.org_id,
      userId: approval.user_id ?? null,
      agentType: 'meeting_ended',
      actionType: isProposal ? 'send_proposal' : 'send_email',
      actionDetail: {
        to,
        subject,
        thread_id: sentThreadId ?? null,
        in_reply_to: inReplyTo ?? null,
        threaded: !!threadId,
        provider: emailProvider,
        approval_id: approvalId,
        action,
        message_id: sentMessageId ?? null,
        resource_type: resourceType || 'email_draft',
        ...(isProposal ? {
          proposal_job_id: proposalJobId,
          deal_id: proposalDealId,
          contact_name: proposalContactName,
        } : {}),
      },
      outcome: sendOk ? 'success' : 'failed',
      errorMessage: sendError,
      creditCost: 0,
      chainId: (approval.metadata as Record<string, unknown>)?.chain_id as string ?? null,
    });

    // PROP-004: Log deal memory event for proposal send (fire-and-forget).
    if (sendOk && isProposal && proposalDealId) {
      try {
        const sentDateLabel = new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const summarySuffix = proposalExecutiveSummary
          ? ` covering ${proposalExecutiveSummary.substring(0, 100)}…`
          : ' covering key discussion topics';
        const pricingNote = proposalPricingSection ? ' with pricing details' : '';

        await supabase
          .from('deal_memory_events')
          .insert({
            deal_id: proposalDealId,
            org_id: approval.org_id,
            event_type: 'proposal_sent',
            event_category: 'commercial',
            source_type: 'agent_inference',
            source_id: proposalJobId ?? approvalId,
            source_timestamp: new Date().toISOString(),
            summary: `Proposal sent on ${sentDateLabel} to ${proposalContactName}${summarySuffix}${pricingNote}.`,
            detail: {
              sent_at: new Date().toISOString(),
              proposal_job_id: proposalJobId,
              contact_name: proposalContactName,
              contact_email: to,
              subject,
              sections_covered: proposalExecutiveSummary ? ['executive_summary'] : [],
              has_pricing: !!proposalPricingSection,
              meeting_title: proposalMeetingTitle,
            },
            confidence: 1.0,
            salience: 'high',
            is_active: true,
            extracted_by: 'agent:hitl-send-followup-email',
            model_used: null,
            credit_cost: 0,
          });
      } catch (memErr) {
        // Fire-and-forget — never block the success response
        console.error('[hitl-send-followup-email] PROP-004 deal memory write failed:', memErr);
      }
    }

    // EMAIL-009: Record autopilot signal on successful send (fire-and-forget).
    // Only emit a signal when the send actually succeeded — a failed send
    // is not a meaningful HITL outcome for confidence scoring purposes.
    if (sendOk) {
      const autopilotSignal: ApprovalSignal = action === 'edited' ? 'approved_edited' : 'approved';
      const meetingId = pickString(
        (approval.metadata as Record<string, unknown>)?.meeting_id as string
      );
      recordAutopilotSignal(
        supabase,
        approval.user_id,
        approval.org_id,
        autopilotSignal,
        approvalId,
        meetingId
      );
    }

    return jsonResponse(
      {
        success: sendOk,
        approvalId,
        action,
        provider: emailProvider,
        email: sendOk
          ? { id: sentMessageId, threadId: sentThreadId }
          : { error: sendError || sendPayloadResp },
      },
      req
    );
  } catch (error) {
    console.error('[hitl-send-followup-email] Error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', req, 500);
  }
});


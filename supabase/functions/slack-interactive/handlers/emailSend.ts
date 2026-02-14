/**
 * Email Send Slack Interactive Handler
 * Handles email send approval actions from Slack
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { buildEmailPreviewMessage, type EmailPreviewData } from '../../_shared/slackBlocks.ts';

interface EmailSendActionContext {
  actionId: string;
  actionValue: string;
  userId: string;
  orgId: string;
  channelId: string;
  messageTs: string;
  responseUrl: string;
}

export async function handleEmailSendAction(ctx: EmailSendActionContext): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Parse action: email_send_now_{job_id}, email_edit_{job_id}, email_send_later_{job_id}, email_cancel_{job_id}
  const parts = ctx.actionId.split('_');
  const action = parts[1]; // send, edit, cancel
  const subAction = parts[2]; // now, later (for send actions)
  const jobId = parts.slice(action === 'send' ? 3 : 2).join('_');

  if (action === 'send' && subAction === 'now') {
    // Send email immediately after 30-second countdown
    const { data: pendingAction } = await supabase
      .from('slack_pending_actions')
      .select('id, sequence_context, status')
      .eq('id', ctx.actionValue)
      .eq('status', 'pending')
      .maybeSingle();

    if (!pendingAction) {
      await sendSlackResponse(ctx.responseUrl, '⚠️ This email has already been handled or expired.');
      return;
    }

    // Update pending action status
    await supabase
      .from('slack_pending_actions')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', pendingAction.id);

    // Send countdown message
    await sendSlackResponse(ctx.responseUrl, '⏳ Sending email in 30 seconds... (Check your app to cancel)');

    // Wait 30 seconds before sending
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Check if action is still confirmed (user might have cancelled)
    const { data: actionCheck } = await supabase
      .from('slack_pending_actions')
      .select('status')
      .eq('id', pendingAction.id)
      .maybeSingle();

    if (actionCheck?.status !== 'confirmed') {
      await sendSlackResponse(ctx.responseUrl, '❌ Email send was cancelled.');
      return;
    }

    // Call email-send-as-rep
    const emailData = pendingAction.sequence_context?.email_draft || {};
    const response = await fetch(`${supabaseUrl}/functions/v1/email-send-as-rep`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: ctx.userId,
        org_id: ctx.orgId,
        to: emailData.to,
        subject: emailData.subject,
        body: emailData.body,
        cc: emailData.cc,
        bcc: emailData.bcc,
        thread_id: emailData.thread_id,
        in_reply_to: emailData.in_reply_to,
        references: emailData.references,
        job_id: jobId,
      }),
    });

    if (response.ok) {
      await sendSlackResponse(ctx.responseUrl, '✅ Email sent successfully!');

      // Resume orchestrator with send_complete
      await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resume_job_id: jobId,
          approval_data: {
            action: 'email_sent',
            approved_by: ctx.userId,
            approved_at: new Date().toISOString(),
          },
        }),
      });
    } else {
      const errorText = await response.text();
      await sendSlackResponse(ctx.responseUrl, `⚠️ Failed to send email: ${errorText}`);
    }

  } else if (action === 'edit') {
    // Redirect to app for editing
    await sendSlackResponse(ctx.responseUrl, `✏️ Edit email in app: ${appUrl}/orchestrator/review/${jobId}`);

  } else if (action === 'send' && subAction === 'later') {
    // Schedule for later (stub for now)
    await supabase
      .from('slack_pending_actions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', ctx.actionValue);

    await sendSlackResponse(ctx.responseUrl, '📅 Email scheduled for later. (Feature coming soon - check your app to reschedule)');

  } else if (action === 'cancel') {
    // Cancel the email
    await supabase
      .from('slack_pending_actions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', ctx.actionValue);

    await sendSlackResponse(ctx.responseUrl, '❌ Email cancelled.');
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
    console.error('[email-send-handler] Failed to send Slack response:', err);
  }
}

// buildEmailPreviewMessage is now imported from ../../_shared/slackBlocks.ts

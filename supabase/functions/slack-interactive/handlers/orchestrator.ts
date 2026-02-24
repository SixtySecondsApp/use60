/**
 * Orchestrator HITL Handler
 * Routes Slack button actions with 'orch_' prefix to the agent-orchestrator
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface OrchestratorActionContext {
  actionId: string;
  actionValue: string;
  userId: string;
  orgId: string;
  channelId: string;
  messageTs: string;
  responseUrl: string;
}

export async function handleOrchestratorAction(ctx: OrchestratorActionContext): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Parse action: orch_approve_{job_id}, orch_reject_{job_id}, orch_edit_{job_id}
  const parts = ctx.actionId.split('_');
  const action = parts[1]; // approve, reject, edit
  const jobId = parts.slice(2).join('_'); // remaining is the job ID

  if (action === 'approve') {
    // Load pending action
    const { data: pendingAction } = await supabase
      .from('slack_pending_actions')
      .select('id, sequence_key, sequence_context, status')
      .eq('id', ctx.actionValue)
      .eq('status', 'pending')
      .maybeSingle();

    if (!pendingAction) {
      await sendSlackResponse(ctx.responseUrl, '⚠️ This action has already been handled or expired.');
      return;
    }

    // Update pending action status
    await supabase
      .from('slack_pending_actions')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', pendingAction.id);

    // Resume orchestrator sequence
    await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resume_job_id: jobId,
        approval_data: {
          approved: true,
          approved_by: ctx.userId,
          approved_at: new Date().toISOString(),
        },
      }),
    });

    await sendSlackResponse(ctx.responseUrl, '✅ Approved! Processing...');

  } else if (action === 'reject') {
    // Cancel pending action
    await supabase
      .from('slack_pending_actions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', ctx.actionValue);

    await sendSlackResponse(ctx.responseUrl, '❌ Cancelled.');

  } else if (action === 'edit') {
    // Redirect to app for editing
    const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';
    await sendSlackResponse(ctx.responseUrl, `✏️ Edit in app: ${appUrl}/orchestrator/review/${jobId}`);
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
    console.error('[orchestrator-handler] Failed to send Slack response:', err);
  }
}

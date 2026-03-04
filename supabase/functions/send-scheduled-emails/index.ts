/// <reference path="../deno.d.ts" />

/**
 * send-scheduled-emails — FU-007
 *
 * Cron job: runs every 5 minutes.
 * Picks up scheduled_emails where status = 'pending' and scheduled_at <= now().
 * Uses email-send-as-rep for actual Gmail send.
 * Honours daily send cap from hitl-send-followup-email logic.
 *
 * Deploy: npx supabase functions deploy send-scheduled-emails --project-ref caerqjzvuerejfrdtygb --no-verify-jwt
 * Cron: every 5 minutes (configured in Supabase Dashboard > Edge Functions > Schedules)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { captureException } from '../_shared/sentryEdge.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEFAULT_DAILY_LIMIT = 50;

interface ScheduledEmail {
  id: string;
  org_id: string;
  user_id: string;
  to_email: string;
  subject: string;
  body: string;
  meeting_id: string | null;
  draft_id: string | null;
}

async function getDailyEmailSendCap(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<number> {
  const { data } = await supabase
    .from('organizations')
    .select('daily_email_send_cap')
    .eq('id', orgId)
    .maybeSingle();

  return (data as Record<string, unknown> | null)?.daily_email_send_cap as number ?? DEFAULT_DAILY_LIMIT;
}

async function countTodaySends(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<number> {
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('agent_daily_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action_type', 'send_email')
    .eq('outcome', 'success')
    .gte('created_at', todayUtc.toISOString());

  return count ?? 0;
}

async function sendScheduledEmail(
  supabase: ReturnType<typeof createClient>,
  email: ScheduledEmail
): Promise<{ success: boolean; error?: string }> {
  // Mark as sending to prevent duplicate processing
  const { error: lockError } = await supabase
    .from('scheduled_emails')
    .update({ status: 'sending' })
    .eq('id', email.id)
    .eq('status', 'pending');

  if (lockError) {
    return { success: false, error: 'Failed to lock email for sending' };
  }

  try {
    // Check daily send cap
    const cap = await getDailyEmailSendCap(supabase, email.org_id);
    const todaySends = await countTodaySends(supabase, email.user_id);

    if (todaySends >= cap) {
      await supabase
        .from('scheduled_emails')
        .update({ status: 'pending', error_message: `Daily send cap of ${cap} reached` })
        .eq('id', email.id);
      return { success: false, error: `Daily send cap of ${cap} reached` };
    }

    // Call email-send-as-rep function (service-role call)
    const sendResponse = await fetch(`${SUPABASE_URL}/functions/v1/email-send-as-rep`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        userId: email.user_id,
        org_id: email.org_id,
        to: email.to_email,
        subject: email.subject,
        body: email.body,
      }),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      throw new Error(`email-send-as-rep failed: ${sendResponse.status} ${errorText}`);
    }

    const sentAt = new Date().toISOString();

    await supabase
      .from('scheduled_emails')
      .update({ status: 'sent', sent_at: sentAt })
      .eq('id', email.id);

    if (email.draft_id) {
      await supabase
        .from('follow_up_drafts')
        .update({ status: 'sent', sent_at: sentAt })
        .eq('id', email.draft_id);
    }

    await supabase.from('agent_daily_logs').insert({
      user_id: email.user_id,
      org_id: email.org_id,
      action_type: 'send_email',
      outcome: 'success',
      metadata: { scheduled_email_id: email.id, meeting_id: email.meeting_id },
    });

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await supabase
      .from('scheduled_emails')
      .update({ status: 'failed', error_message: errorMessage })
      .eq('id', email.id);

    await captureException(err, { scheduled_email_id: email.id, user_id: email.user_id });
    return { success: false, error: errorMessage };
  }
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST' && req.method !== 'GET') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = new Date().toISOString();

    const { data: emails, error: fetchError } = await supabase
      .from('scheduled_emails')
      .select('id, org_id, user_id, to_email, subject, body, meeting_id, draft_id')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(100);

    if (fetchError) {
      throw new Error(`Failed to fetch scheduled emails: ${fetchError.message}`);
    }

    if (!emails || emails.length === 0) {
      return jsonResponse({ processed: 0, message: 'No emails due for sending' }, req);
    }

    const results = await Promise.allSettled(
      emails.map((email) => sendScheduledEmail(supabase, email as ScheduledEmail))
    );

    const sent = results.filter((r) => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ success: boolean }>).value.success).length;
    const failed = results.length - sent;

    return jsonResponse({ processed: emails.length, sent, failed, timestamp: now }, req);
  } catch (err) {
    await captureException(err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500
    );
  }
});

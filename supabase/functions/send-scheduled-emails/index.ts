/// <reference path="../deno.d.ts" />

/**
 * Send Scheduled Emails Edge Function
 *
 * Processes pending scheduled emails by delegating to email-send-as-rep.
 * Reads from the scheduled_emails table, finds rows due, and invokes
 * email-send-as-rep for each one.
 *
 * NOTE: The primary scheduler is the pg_cron job (process_scheduled_emails)
 * which calls email-send-as-rep via net.http_post. This edge function serves
 * as a manual trigger / fallback.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';

interface ScheduledEmail {
  id: string;
  user_id: string;
  to_email: string;
  cc_email?: string;
  bcc_email?: string;
  subject: string;
  body: string;
  scheduled_for: string;
  thread_id?: string;
  reply_to_message_id?: string;
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    console.log('[send-scheduled-emails] Starting scheduled email processing...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get all pending scheduled emails that are due
    const now = new Date().toISOString();
    const { data: pendingEmails, error: fetchError } = await supabaseAdmin
      .from('scheduled_emails')
      .select('id, user_id, to_email, cc_email, bcc_email, subject, body, scheduled_for, thread_id, reply_to_message_id')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .limit(50);

    if (fetchError) {
      console.error('[send-scheduled-emails] Error fetching pending emails:', fetchError);
      throw fetchError;
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      console.log('[send-scheduled-emails] No pending emails to send');
      return jsonResponse({ message: 'No pending emails to send', processed: 0 }, req);
    }

    console.log(`[send-scheduled-emails] Found ${pendingEmails.length} emails to send`);

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const email of pendingEmails as ScheduledEmail[]) {
      try {
        console.log(`[send-scheduled-emails] Processing email ${email.id}...`);

        // Mark as sent optimistically to prevent double-fire
        const { error: updateError } = await supabaseAdmin
          .from('scheduled_emails')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', email.id)
          .eq('status', 'pending');

        if (updateError) {
          console.warn(`[send-scheduled-emails] Could not claim email ${email.id}:`, updateError);
          continue;
        }

        // Delegate to email-send-as-rep
        const { error: sendError } = await supabaseAdmin.functions.invoke('email-send-as-rep', {
          body: {
            userId: email.user_id,
            to: email.to_email,
            subject: email.subject,
            body: email.body,
            cc: email.cc_email || undefined,
            bcc: email.bcc_email || undefined,
            thread_id: email.thread_id || undefined,
            in_reply_to: email.reply_to_message_id || undefined,
          },
        });

        if (sendError) {
          throw new Error(sendError.message || 'email-send-as-rep returned an error');
        }

        console.log(`[send-scheduled-emails] Successfully sent email ${email.id}`);
        results.sent++;
      } catch (error) {
        console.error(`[send-scheduled-emails] Error sending email ${email.id}:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.failed++;
        results.errors.push(`Email ${email.id}: ${errorMessage}`);

        // Mark email as failed
        await supabaseAdmin
          .from('scheduled_emails')
          .update({ status: 'failed', error_message: errorMessage })
          .eq('id', email.id);
      }
    }

    console.log('[send-scheduled-emails] Processing complete:', results);

    return jsonResponse({
      message: 'Scheduled email processing complete',
      processed: pendingEmails.length,
      results,
    }, req);
  } catch (error) {
    console.error('[send-scheduled-emails] Fatal error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      req,
      500
    );
  }
});

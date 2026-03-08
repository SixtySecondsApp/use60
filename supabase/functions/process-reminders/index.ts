/**
 * Process Reminders Edge Function
 *
 * Called every minute by pg_cron. Queries due reminders (remind_at <= now, not delivered),
 * delivers via notification or Slack, marks as delivered.
 * Auto-skips reminders more than 24h past due.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { verifyCronSecret } from '../_shared/edgeAuth.ts';

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    const isCronAuth = verifyCronSecret(req, Deno.env.get('CRON_SECRET'));
    if (!isCronAuth) {
      // Also allow service role auth
      const authHeader = req.headers.get('Authorization');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      if (!authHeader || !authHeader.includes(serviceKey)) {
        return errorResponse('Unauthorized', req, 401);
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = new Date();
    const expiryCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h ago

    // Fetch due reminders (not yet delivered, remind_at <= now)
    const { data: dueReminders, error: fetchError } = await supabase
      .from('reminders')
      .select('id, user_id, organization_id, remind_at, message, context_type, context_id, delivery_channel')
      .eq('delivered', false)
      .lte('remind_at', now.toISOString())
      .order('remind_at', { ascending: true })
      .limit(100);

    if (fetchError) {
      if (fetchError.message.includes('relation') || fetchError.message.includes('does not exist')) {
        return jsonResponse({ success: true, message: 'reminders table not found', processed: 0 }, req);
      }
      console.error('[process-reminders] Fetch error:', fetchError);
      return errorResponse('Failed to fetch reminders', req, 500);
    }

    if (!dueReminders || dueReminders.length === 0) {
      return jsonResponse({ success: true, processed: 0 }, req);
    }

    let delivered = 0;
    let skipped = 0;

    for (const reminder of dueReminders) {
      const remindAt = new Date(reminder.remind_at);

      // Skip expired reminders (>24h past due)
      if (remindAt < expiryCutoff) {
        await supabase
          .from('reminders')
          .update({ delivered: true })
          .eq('id', reminder.id);
        skipped++;
        continue;
      }

      try {
        if (reminder.delivery_channel === 'slack') {
          // Deliver via Slack
          await fetch(`${supabaseUrl}/functions/v1/slack-send`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
              'x-internal-call': 'true',
            },
            body: JSON.stringify({
              organization_id: reminder.organization_id,
              user_id: reminder.user_id,
              message: `*Reminder:* ${reminder.message}`,
            }),
          });
        } else {
          // Deliver as in-app notification
          await supabase.from('notifications').insert({
            user_id: reminder.user_id,
            organization_id: reminder.organization_id,
            type: 'reminder',
            title: 'Reminder',
            body: reminder.message,
            metadata: {
              context_type: reminder.context_type,
              context_id: reminder.context_id,
              remind_at: reminder.remind_at,
            },
          });
        }

        // Mark as delivered
        await supabase
          .from('reminders')
          .update({ delivered: true })
          .eq('id', reminder.id);

        delivered++;
      } catch (err) {
        console.error(`[process-reminders] Error delivering reminder ${reminder.id}:`, err);
      }
    }

    console.log(`[process-reminders] Processed ${dueReminders.length}: ${delivered} delivered, ${skipped} expired`);

    return jsonResponse({ success: true, processed: dueReminders.length, delivered, skipped }, req);
  } catch (error) {
    console.error('[process-reminders] Error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});

/**
 * Notification Triage Edge Function
 *
 * Processes pending notifications in notification_queue through the triage engine.
 * Applies suppression rules (dedup, cooldown, quiet hours, empty check),
 * routes to immediate delivery or batching, and updates triage_status.
 *
 * Called by:
 * - Cron job (every 1-2 minutes) to process pending queue
 * - Direct invocation from runner.ts for urgent items
 *
 * Story: AOA-003
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  triageNotification,
  assignToBatch,
  type TriageInput,
  type TriagePriority,
} from '../_shared/proactive/triageRules.ts';
import { deliverToSlack } from '../_shared/proactive/deliverySlack.ts';
import { insert_agent_activity } from '../_shared/proactive/deliveryInApp.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BATCH_SIZE = 50;

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // Auth: cron secret or service role only
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    const isCronAuth = verifyCronSecret(req, cronSecret);
    const isServiceRole = isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY);

    if (!isCronAuth && !isServiceRole) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Optional: process a single notification by ID (for real-time urgent items)
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // No body = batch processing mode
    }

    const singleNotificationId = body.notification_id as string | undefined;

    // Fetch pending notifications
    let query = supabase
      .from('notification_queue')
      .select('id, user_id, org_id, title, message, notification_type, metadata, priority, entity_type, entity_id, created_at')
      .eq('triage_status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (singleNotificationId) {
      query = supabase
        .from('notification_queue')
        .select('id, user_id, org_id, title, message, notification_type, metadata, priority, entity_type, entity_id, created_at')
        .eq('id', singleNotificationId)
        .limit(1);
    }

    const { data: pending, error: fetchError } = await query;

    if (fetchError) {
      console.error('[notification-triage] Failed to fetch pending:', fetchError.message);
      return errorResponse('Failed to fetch pending notifications', req, 500);
    }

    if (!pending || pending.length === 0) {
      return jsonResponse({ processed: 0, message: 'No pending notifications' }, req);
    }

    const stats = { delivered: 0, batched: 0, suppressed: 0, failed: 0 };

    for (const notification of pending) {
      try {
        const triageInput: TriageInput = {
          id: notification.id,
          userId: notification.user_id,
          orgId: notification.org_id,
          notificationType: notification.notification_type || 'unknown',
          priority: (notification.priority as TriagePriority) || 'medium',
          entityType: notification.entity_type,
          entityId: notification.entity_id,
          payload: notification.metadata || {},
          createdAt: notification.created_at,
        };

        const result = await triageNotification(supabase, triageInput);

        switch (result.decision) {
          case 'suppress': {
            await supabase
              .from('notification_queue')
              .update({
                triage_status: 'suppressed',
                triaged_at: new Date().toISOString(),
                metadata: {
                  ...(notification.metadata || {}),
                  triage_reason: result.reason,
                },
              })
              .eq('id', notification.id);
            stats.suppressed++;
            break;
          }

          case 'batch': {
            const batchId = await assignToBatch(
              supabase,
              notification.id,
              notification.user_id,
              notification.org_id,
              result.batchType || 'daily_digest'
            );

            await supabase
              .from('notification_queue')
              .update({
                triage_status: 'batched',
                delivery_channel: 'batch',
                batch_id: batchId,
                triaged_at: new Date().toISOString(),
                metadata: {
                  ...(notification.metadata || {}),
                  triage_reason: result.reason,
                  batch_type: result.batchType,
                },
              })
              .eq('id', notification.id);
            stats.batched++;
            break;
          }

          case 'deliver': {
            // Mark as queued for delivery
            await supabase
              .from('notification_queue')
              .update({
                triage_status: 'queued',
                delivery_channel: result.channel || 'slack_dm',
                triaged_at: new Date().toISOString(),
              })
              .eq('id', notification.id);

            // Attempt delivery based on channel
            const deliverySuccess = await deliverNotification(
              supabase,
              notification,
              result.channel || 'slack_dm'
            );

            if (deliverySuccess) {
              await supabase
                .from('notification_queue')
                .update({
                  triage_status: 'delivered',
                  delivered_at: new Date().toISOString(),
                })
                .eq('id', notification.id);
              stats.delivered++;
            } else {
              stats.failed++;
            }
            break;
          }
        }
      } catch (err) {
        console.error(`[notification-triage] Error processing ${notification.id}:`, err);
        stats.failed++;
      }
    }

    console.log(`[notification-triage] Processed ${pending.length}: delivered=${stats.delivered}, batched=${stats.batched}, suppressed=${stats.suppressed}, failed=${stats.failed}`);

    return jsonResponse({
      processed: pending.length,
      ...stats,
    }, req);
  } catch (err) {
    console.error('[notification-triage] Unhandled error:', err);
    return errorResponse('Internal server error', req, 500);
  }
});

/**
 * Deliver a notification via the chosen channel
 */
async function deliverNotification(
  supabase: SupabaseClient,
  notification: Record<string, any>,
  channel: string
): Promise<boolean> {
  try {
    // Write to agent_activity for in-app feed (always, regardless of channel)
    await supabase.rpc('insert_agent_activity', {
      p_user_id: notification.user_id,
      p_org_id: notification.org_id,
      p_sequence_type: notification.notification_type || 'agent_notification',
      p_title: notification.title || 'Agent notification',
      p_summary: notification.message || '',
      p_metadata: notification.metadata || {},
      p_job_id: notification.source_job_id || null,
    });

    if (channel === 'in_app') {
      return true; // Already written to agent_activity
    }

    if (channel === 'slack_dm') {
      // Look up Slack credentials for the user's org
      const { data: orgSettings } = await supabase
        .from('slack_installations')
        .select('bot_token')
        .eq('org_id', notification.org_id)
        .maybeSingle();

      if (!orgSettings?.bot_token) {
        console.warn(`[notification-triage] No Slack bot token for org ${notification.org_id}`);
        return false;
      }

      // Look up user's Slack ID
      const { data: mapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('org_id', notification.org_id)
        .eq('sixty_user_id', notification.user_id)
        .maybeSingle();

      if (!mapping?.slack_user_id) {
        console.warn(`[notification-triage] No Slack mapping for user ${notification.user_id}`);
        return false;
      }

      const result = await deliverToSlack(supabase, {
        type: notification.notification_type || 'agent_notification',
        orgId: notification.org_id,
        recipientUserId: notification.user_id,
        recipientSlackUserId: mapping.slack_user_id,
        title: notification.title,
        message: notification.message,
        blocks: notification.metadata?.blocks,
        metadata: notification.metadata,
        priority: notification.priority,
        entityType: notification.entity_type,
        entityId: notification.entity_id,
      }, orgSettings.bot_token);

      return result.sent;
    }

    console.warn(`[notification-triage] Unknown delivery channel: ${channel}`);
    return false;
  } catch (err) {
    console.error(`[notification-triage] Delivery failed:`, err);
    return false;
  }
}

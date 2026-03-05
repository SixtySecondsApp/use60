/**
 * process-notification-queue - Smart Notification Queue Processor
 *
 * Processes the notification queue with intelligent timing and frequency limiting.
 * Designed to run as a cron job (every 5 minutes) or triggered on-demand.
 *
 * Endpoints:
 * - POST /process-notification-queue - Process pending notifications
 * - POST /process-notification-queue?channel=slack_dm - Process specific channel
 * - POST /process-notification-queue?user_id=xxx - Process for specific user
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyCronSecret } from '../_shared/edgeAuth.ts';
import {
  ENGAGEMENT_CONFIG,
  checkFrequencyLimit,
  calculateOptimalSendTime,
  shouldDowngradePriority,
  getFatigueLevel,
} from "../_shared/engagement/index.ts";
import type {
  UserMetrics,
  NotificationPriority,
  FrequencyLimitResult,
} from "../_shared/engagement/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface QueuedNotification {
  queue_id: string;
  user_id: string;
  org_id: string;
  notification_type: string;
  channel: string;
  priority: string;
  payload: Record<string, unknown>;
  scheduled_for: string;
  optimal_send_time: string | null;
  metadata: Record<string, unknown>;
  engagement_score: number | null;
  notification_fatigue: number | null;
  preferred_frequency: string | null;
}

interface ProcessingResult {
  queue_id: string;
  status: "sent" | "skipped" | "failed" | "delayed";
  reason?: string;
  delay_until?: string;
}

/**
 * Process a single notification
 */
async function processNotification(
  supabase: ReturnType<typeof createClient>,
  notification: QueuedNotification
): Promise<ProcessingResult> {
  const priority = notification.priority as NotificationPriority;

  // Build user metrics for frequency checking
  const userMetrics: UserMetrics = {
    id: "",
    user_id: notification.user_id,
    org_id: notification.org_id,
    last_app_active_at: null,
    last_slack_active_at: null,
    last_notification_clicked_at: null,
    last_login_at: null,
    preferred_notification_frequency: (notification.preferred_frequency || "moderate") as "low" | "moderate" | "high",
    last_feedback_requested_at: null,
    notifications_since_last_feedback: 0,
    notification_fatigue_level: notification.notification_fatigue || 0,
    overall_engagement_score: notification.engagement_score || 50,
  };

  // Check frequency limits
  const { data: counts } = await supabase.rpc("get_user_notification_counts", {
    p_user_id: notification.user_id,
  });

  const frequencyCheck: FrequencyLimitResult = checkFrequencyLimit(
    userMetrics,
    priority,
    {
      hour: counts?.hour_count || 0,
      day: counts?.day_count || 0,
      last_sent_at: counts?.last_sent_at || null,
    }
  );

  if (!frequencyCheck.allowed) {
    // Check if we should downgrade priority instead of skipping
    const downgradedPriority = shouldDowngradePriority(priority, userMetrics);

    if (downgradedPriority !== priority) {
      // Retry with downgraded priority
      const retryCheck = checkFrequencyLimit(userMetrics, downgradedPriority, {
        hour: counts?.hour_count || 0,
        day: counts?.day_count || 0,
        last_sent_at: counts?.last_sent_at || null,
      });

      if (!retryCheck.allowed) {
        return {
          queue_id: notification.queue_id,
          status: "delayed",
          reason: frequencyCheck.reason,
          delay_until: frequencyCheck.next_allowed_at,
        };
      }
    } else {
      return {
        queue_id: notification.queue_id,
        status: "delayed",
        reason: frequencyCheck.reason,
        delay_until: frequencyCheck.next_allowed_at,
      };
    }
  }

  // Claim the notification for processing
  const { data: claimed } = await supabase.rpc("claim_notification_for_processing", {
    p_queue_id: notification.queue_id,
  });

  if (!claimed) {
    return {
      queue_id: notification.queue_id,
      status: "skipped",
      reason: "Already being processed by another worker",
    };
  }

  try {
    // Send the notification based on channel
    let sendResult: { success: boolean; error?: string; interaction_id?: string };

    switch (notification.channel) {
      case "slack_dm":
        sendResult = await sendSlackDM(supabase, notification);
        break;
      case "slack_channel":
        sendResult = await sendSlackChannel(supabase, notification);
        break;
      case "email":
        sendResult = await sendEmail(supabase, notification);
        break;
      case "in_app":
        sendResult = await sendInApp(supabase, notification);
        break;
      default:
        sendResult = { success: false, error: `Unknown channel: ${notification.channel}` };
    }

    if (sendResult.success) {
      // Mark as sent
      await supabase.rpc("mark_notification_sent", {
        p_queue_id: notification.queue_id,
        p_interaction_id: sendResult.interaction_id || null,
      });

      return {
        queue_id: notification.queue_id,
        status: "sent",
      };
    } else {
      // Mark as failed
      await supabase.rpc("mark_notification_failed", {
        p_queue_id: notification.queue_id,
        p_error_message: sendResult.error || "Unknown error",
      });

      return {
        queue_id: notification.queue_id,
        status: "failed",
        reason: sendResult.error,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await supabase.rpc("mark_notification_failed", {
      p_queue_id: notification.queue_id,
      p_error_message: errorMessage,
    });

    return {
      queue_id: notification.queue_id,
      status: "failed",
      reason: errorMessage,
    };
  }
}

/**
 * Send Slack DM notification
 */
async function sendSlackDM(
  supabase: ReturnType<typeof createClient>,
  notification: QueuedNotification
): Promise<{ success: boolean; error?: string; interaction_id?: string }> {
  // Get user's Slack ID
  const { data: profile } = await supabase
    .from("profiles")
    .select("slack_user_id")
    .eq("id", notification.user_id)
    .maybeSingle();

  if (!profile?.slack_user_id) {
    return { success: false, error: "User does not have Slack connected" };
  }

  // Get org's Slack token
  const { data: orgSettings } = await supabase
    .from("organization_settings")
    .select("slack_bot_token")
    .eq("organization_id", notification.org_id)
    .maybeSingle();

  if (!orgSettings?.slack_bot_token) {
    return { success: false, error: "Organization does not have Slack configured" };
  }

  // Send via Slack API
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${orgSettings.slack_bot_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: profile.slack_user_id,
      ...notification.payload,
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    return { success: false, error: result.error || "Slack API error" };
  }

  // Record the interaction
  const { data: interaction } = await supabase.rpc("record_notification_interaction", {
    p_user_id: notification.user_id,
    p_org_id: notification.org_id,
    p_notification_type: notification.notification_type,
    p_delivered_via: "slack_dm",
  });

  return { success: true, interaction_id: interaction };
}

/**
 * Send Slack channel notification
 */
async function sendSlackChannel(
  supabase: ReturnType<typeof createClient>,
  notification: QueuedNotification
): Promise<{ success: boolean; error?: string; interaction_id?: string }> {
  const channelId = notification.payload.channel_id as string;
  if (!channelId) {
    return { success: false, error: "No channel_id specified in payload" };
  }

  // Get org's Slack token
  const { data: orgSettings } = await supabase
    .from("organization_settings")
    .select("slack_bot_token")
    .eq("organization_id", notification.org_id)
    .maybeSingle();

  if (!orgSettings?.slack_bot_token) {
    return { success: false, error: "Organization does not have Slack configured" };
  }

  // Send via Slack API
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${orgSettings.slack_bot_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      ...notification.payload,
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    return { success: false, error: result.error || "Slack API error" };
  }

  return { success: true };
}

/**
 * Send email notification (placeholder - integrate with email service)
 */
async function sendEmail(
  _supabase: ReturnType<typeof createClient>,
  notification: QueuedNotification
): Promise<{ success: boolean; error?: string; interaction_id?: string }> {
  // TODO: Integrate with Resend or other email service
  console.log(`[process-notification-queue] Email notification queued for ${notification.user_id}:`, notification.payload);

  // For now, just mark as success
  return { success: true };
}

/**
 * Send in-app notification
 */
async function sendInApp(
  supabase: ReturnType<typeof createClient>,
  notification: QueuedNotification
): Promise<{ success: boolean; error?: string; interaction_id?: string }> {
  // Insert into in_app_notifications table
  const { error } = await supabase.from("in_app_notifications").insert({
    user_id: notification.user_id,
    org_id: notification.org_id,
    type: notification.notification_type,
    title: notification.payload.title as string || "Notification",
    message: notification.payload.message as string || "",
    data: notification.payload,
    read: false,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth: require cron secret
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!verifyCronSecret(req, cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const url = new URL(req.url);
    const channel = url.searchParams.get("channel");
    const userId = url.searchParams.get("user_id");
    const batchSize = parseInt(url.searchParams.get("batch_size") || "50", 10);

    console.log("[process-notification-queue] Starting queue processing", { channel, userId, batchSize });

    // Get pending notifications
    const { data: pendingNotifications, error: fetchError } = await supabase.rpc(
      "get_pending_notifications",
      {
        p_limit: Math.min(batchSize, ENGAGEMENT_CONFIG.queue.batch_size),
        p_channel: channel,
      }
    );

    if (fetchError) {
      throw new Error(`Failed to fetch pending notifications: ${fetchError.message}`);
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No pending notifications",
          processed: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter by user if specified
    let notificationsToProcess = pendingNotifications as QueuedNotification[];
    if (userId) {
      notificationsToProcess = notificationsToProcess.filter((n) => n.user_id === userId);
    }

    console.log(`[process-notification-queue] Processing ${notificationsToProcess.length} notifications`);

    // Process notifications
    const results: ProcessingResult[] = [];
    const stats = { sent: 0, skipped: 0, failed: 0, delayed: 0 };

    for (const notification of notificationsToProcess) {
      const result = await processNotification(supabase, notification);
      results.push(result);
      stats[result.status]++;

      // Log progress
      console.log(
        `[process-notification-queue] ${result.status}: ${notification.notification_type} -> ${notification.user_id}`,
        result.reason ? `(${result.reason})` : ""
      );
    }

    // Cancel stale notifications
    const { data: cancelledCount } = await supabase.rpc("cancel_stale_notifications");

    console.log("[process-notification-queue] Processing complete", {
      ...stats,
      cancelled: cancelledCount || 0,
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: notificationsToProcess.length,
        stats,
        cancelled: cancelledCount || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[process-notification-queue] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * send-feedback-requests - Smart Engagement Algorithm Feedback Request Sender
 *
 * Sends bi-weekly feedback requests to users who are due for a check-in.
 * Designed to run as a daily cron job.
 *
 * Endpoints:
 * - POST /send-feedback-requests - Send pending feedback requests
 * - POST /send-feedback-requests?org_id=xxx - Send for specific org
 * - POST /send-feedback-requests?user_id=xxx - Send for specific user
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { corsHeaders } from "../_shared/cors.ts";
import { buildFeedbackRequestBlocks } from "../_shared/engagement/feedback.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface UserDueForFeedback {
  user_id: string;
  org_id: string;
  slack_user_id: string;
  days_since_last_feedback: number | null;
  notifications_since_last_feedback: number;
  reason: string;
}

interface SendResult {
  user_id: string;
  status: "sent" | "failed" | "skipped";
  reason?: string;
}

/**
 * Send feedback request to a user via Slack DM
 */
async function sendFeedbackRequest(
  supabase: ReturnType<typeof createClient>,
  user: UserDueForFeedback
): Promise<SendResult> {
  try {
    // Get org's Slack bot token
    const { data: orgSettings } = await supabase
      .from("organization_settings")
      .select("slack_bot_token")
      .eq("organization_id", user.org_id)
      .maybeSingle();

    if (!orgSettings?.slack_bot_token) {
      return {
        user_id: user.user_id,
        status: "skipped",
        reason: "Organization does not have Slack configured",
      };
    }

    // Build feedback message blocks
    const blocks = buildFeedbackRequestBlocks();

    // Send via Slack API
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${orgSettings.slack_bot_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: user.slack_user_id,
        text: "Quick check-in on notification preferences",
        blocks,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      return {
        user_id: user.user_id,
        status: "failed",
        reason: result.error || "Slack API error",
      };
    }

    // Record that we sent the feedback request
    await supabase
      .from("notification_feedback")
      .insert({
        user_id: user.user_id,
        org_id: user.org_id,
        feedback_type: "feedback_request_sent",
        feedback_value: user.reason,
        feedback_source: "cron",
      });

    // Update last_feedback_requested_at (but don't reset counters yet - that happens on response)
    await supabase
      .from("user_engagement_metrics")
      .update({
        last_feedback_requested_at: new Date().toISOString(),
      })
      .eq("user_id", user.user_id);

    // Record notification interaction
    await supabase.from("notification_interactions").insert({
      user_id: user.user_id,
      org_id: user.org_id,
      notification_type: "feedback_request",
      delivered_at: new Date().toISOString(),
      delivered_via: "slack_dm",
      hour_of_day: new Date().getHours(),
      day_of_week: new Date().getDay(),
    });

    return {
      user_id: user.user_id,
      status: "sent",
    };
  } catch (error) {
    return {
      user_id: user.user_id,
      status: "failed",
      reason: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const orgId = url.searchParams.get("org_id");
    const userId = url.searchParams.get("user_id");
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const dryRun = url.searchParams.get("dry_run") === "true";

    console.log("[send-feedback-requests] Starting", { orgId, userId, limit, dryRun });

    // Get users due for feedback
    let usersDueForFeedback: UserDueForFeedback[] = [];

    if (userId) {
      // Single user mode
      const { data: feedbackCheck } = await supabase.rpc("should_request_feedback", {
        p_user_id: userId,
      });

      if (feedbackCheck?.[0]?.should_request) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, org_id, slack_user_id")
          .eq("id", userId)
          .single();

        if (profile?.slack_user_id) {
          usersDueForFeedback = [{
            user_id: profile.id,
            org_id: profile.org_id,
            slack_user_id: profile.slack_user_id,
            days_since_last_feedback: feedbackCheck[0].days_since_last_feedback,
            notifications_since_last_feedback: feedbackCheck[0].notifications_since_last_feedback,
            reason: feedbackCheck[0].reason,
          }];
        }
      }
    } else {
      // Batch mode
      const { data: users, error } = await supabase.rpc("get_users_due_for_feedback", {
        p_org_id: orgId || null,
        p_limit: limit,
      });

      if (error) {
        throw new Error(`Failed to get users due for feedback: ${error.message}`);
      }

      usersDueForFeedback = users || [];
    }

    console.log(`[send-feedback-requests] Found ${usersDueForFeedback.length} users due for feedback`);

    if (usersDueForFeedback.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No users due for feedback",
          sent: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Dry run - just return who would receive feedback
    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          users: usersDueForFeedback.map((u) => ({
            user_id: u.user_id,
            reason: u.reason,
            days_since_last_feedback: u.days_since_last_feedback,
            notifications_since_last_feedback: u.notifications_since_last_feedback,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send feedback requests
    const results: SendResult[] = [];
    const stats = { sent: 0, failed: 0, skipped: 0 };

    for (const user of usersDueForFeedback) {
      const result = await sendFeedbackRequest(supabase, user);
      results.push(result);
      stats[result.status]++;

      console.log(
        `[send-feedback-requests] ${result.status}: ${user.user_id}`,
        result.reason ? `(${result.reason})` : ""
      );
    }

    console.log("[send-feedback-requests] Complete", stats);

    return new Response(
      JSON.stringify({
        success: true,
        processed: usersDueForFeedback.length,
        stats,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-feedback-requests] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

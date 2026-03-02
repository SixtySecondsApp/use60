/**
 * api-monitor-notify - Cron job to notify platform admins of high-priority API improvements
 *
 * Runs periodically to:
 * 1. Analyze latest API monitor snapshot
 * 2. Check for high-priority improvements (error_rate > 5%, bursts > 60 req/min, etc.)
 * 3. Send Slack notifications to platform admins
 *
 * Scheduled via pg_cron (see migration)
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface ApiSnapshot {
  snapshot_time: string;
  time_bucket_start: string;
  time_bucket_end: string;
  bucket_type: "5m" | "1h" | "1d";
  total_requests: number;
  total_errors: number;
  error_rate: number;
  top_endpoints: Array<{
    endpoint: string;
    method: string;
    count: number;
    errors: number;
  }>;
  top_errors: Array<{
    status: number;
    endpoint: string;
    count: number;
    sample_message?: string;
  }>;
  suspected_bursts: Array<{
    endpoint: string;
    requests_per_minute: number;
    time_window: string;
  }>;
}

interface AIReview {
  priority: "high" | "medium" | "low";
  hypotheses: string[];
  recommended_next_changes: string[];
  estimated_impact?: {
    requests_reduction_potential: number;
    error_reduction_potential: number;
  };
}

/**
 * Get platform admin users with Slack IDs
 */
async function getPlatformAdminsWithSlack(
  supabase: ReturnType<typeof createClient>
): Promise<Array<{ userId: string; slackUserId: string; email: string; orgId: string }>> {
  // Get platform admins (is_admin = true and in internal_users)
  const { data: admins, error } = await supabase
    .from("profiles")
    .select("id, email, is_admin")
    .eq("is_admin", true);

  if (error || !admins || admins.length === 0) {
    console.warn("[api-monitor-notify] No platform admins found");
    return [];
  }

  // Check if they're internal users (by email domain)
  const { data: internalUsers } = await supabase
    .from("internal_users")
    .select("email")
    .eq("is_active", true);

  // Extract domains from internal user emails
  const internalDomainsSet = new Set(
    (internalUsers || [])
      .map((u) => u.email?.split("@")[1]?.toLowerCase())
      .filter((d): d is string => !!d)
  );

  const platformAdmins = admins.filter((admin) => {
    if (!admin.email) return false;
    const emailDomain = admin.email.split("@")[1]?.toLowerCase();
    return internalDomainsSet.has(emailDomain);
  });

  if (platformAdmins.length === 0) {
    console.warn("[api-monitor-notify] No internal platform admins found");
    return [];
  }

  // Get Slack user IDs for each admin
  const adminsWithSlack: Array<{
    userId: string;
    slackUserId: string;
    email: string;
    orgId: string;
  }> = [];

  for (const admin of platformAdmins) {
    // Find org_id from slack_user_mappings (any org they're mapped in)
    const { data: slackMapping } = await supabase
      .from("slack_user_mappings")
      .select("slack_user_id, org_id")
      .eq("sixty_user_id", admin.id)
      .limit(1)
      .maybeSingle();

    if (slackMapping?.slack_user_id) {
      adminsWithSlack.push({
        userId: admin.id,
        slackUserId: slackMapping.slack_user_id,
        email: admin.email || "",
        orgId: slackMapping.org_id || "",
      });
    }
  }

  return adminsWithSlack;
}

/**
 * Get Slack bot token for an org
 */
async function getSlackBotToken(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("slack_org_settings")
    .select("bot_access_token")
    .eq("org_id", orgId)
    .eq("is_connected", true)
    .single();

  return data?.bot_access_token || null;
}

/**
 * Send Slack DM to a user
 */
async function sendSlackDM(
  botToken: string,
  slackUserId: string,
  blocks: any[]
): Promise<{ success: boolean; error?: string }> {
  try {
    // Open DM channel
    const openDmResponse = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        users: slackUserId,
      }),
    });

    const openDmData = await openDmResponse.json();

    if (!openDmData.ok || !openDmData.channel?.id) {
      return {
        success: false,
        error: `Failed to open DM: ${openDmData.error || "Unknown error"}`,
      };
    }

    const channelId = openDmData.channel.id;

    // Send message
    const postMessageResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        text: "High-priority API improvements detected",
        blocks: blocks.slice(0, 50), // Slack limit
      }),
    });

    const postMessageData = await postMessageResponse.json();

    if (!postMessageData.ok) {
      return {
        success: false,
        error: `Failed to send message: ${postMessageData.error || "Unknown error"}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Build Slack blocks for high-priority improvements
 */
function buildSlackBlocks(
  snapshot: ApiSnapshot,
  review: AIReview,
  snapshotUrl: string
): any[] {
  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🚨 High-Priority API Improvements Detected",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Snapshot Period:* ${new Date(snapshot.time_bucket_start).toLocaleString()} - ${new Date(snapshot.time_bucket_end).toLocaleString()}`,
      },
    },
  ];

  // Summary stats
  blocks.push({
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Total Requests:*\n${snapshot.total_requests.toLocaleString()}`,
      },
      {
        type: "mrkdwn",
        text: `*Error Rate:*\n${snapshot.error_rate.toFixed(2)}%`,
      },
      {
        type: "mrkdwn",
        text: `*Bursts Detected:*\n${snapshot.suspected_bursts.length}`,
      },
      {
        type: "mrkdwn",
        text: `*Priority:*\n${review.priority.toUpperCase()}`,
      },
    ],
  });

  // Top issues
  if (snapshot.error_rate > 5) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `⚠️ *High Error Rate:* ${snapshot.error_rate.toFixed(2)}% (${snapshot.total_errors} errors)`,
      },
    });
  }

  if (snapshot.suspected_bursts.length > 0) {
    const topBurst = snapshot.suspected_bursts[0];
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `⚡ *Top Burst:* ${topBurst.endpoint}\n*Rate:* ${topBurst.requests_per_minute} req/min`,
      },
    });
  }

  // Top recommendations
  if (review.recommended_next_changes.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Top Recommendations:*\n${review.recommended_next_changes.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
      },
    });
  }

  // Estimated impact
  if (review.estimated_impact) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Estimated Impact:*\n• Requests reduction: ${review.estimated_impact.requests_reduction_potential.toLocaleString()}/day\n• Error reduction: ${review.estimated_impact.error_reduction_potential.toLocaleString()}`,
      },
    });
  }

  // Action button
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "View Full Report",
          emoji: true,
        },
        url: snapshotUrl,
        action_id: "view_report",
      },
    ],
  });

  return blocks;
}

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log("[api-monitor-notify] Starting notification check...");

    // Get latest snapshot from last 24 hours
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);

    const { data: latestSnapshot, error: snapshotError } = await supabase
      .from("api_monitor_snapshots")
      .select("*")
      .gte("time_bucket_start", from.toISOString())
      .order("snapshot_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapshotError) {
      throw new Error(`Failed to fetch snapshot: ${snapshotError.message}`);
    }

    if (!latestSnapshot) {
      console.log("[api-monitor-notify] No snapshot found in last 24 hours, skipping");
      return new Response(
        JSON.stringify({ message: "No snapshot found, skipping notification" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const snapshot = latestSnapshot as unknown as ApiSnapshot;

    // Check if this snapshot has high-priority issues
    const hasHighPriorityIssues =
      snapshot.error_rate > 5 ||
      snapshot.suspected_bursts.length > 0 ||
      snapshot.total_errors > 100;

    if (!hasHighPriorityIssues) {
      console.log("[api-monitor-notify] No high-priority issues detected, skipping notification");
      return new Response(
        JSON.stringify({ message: "No high-priority issues, skipping notification" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate AI review (or fetch from snapshot if stored)
    let review: AIReview;
    const snapshotData = latestSnapshot.snapshot_data as any;
    if (snapshotData?.ai_review) {
      review = snapshotData.ai_review;
    } else {
      // Generate basic review
      review = {
        priority: snapshot.error_rate > 10 ? "high" : snapshot.error_rate > 5 ? "high" : "medium",
        hypotheses: [],
        recommended_next_changes: [],
      };
      if (snapshot.error_rate > 5) {
        review.recommended_next_changes.push(
          `Investigate ${snapshot.error_rate.toFixed(2)}% error rate - check top error endpoints`
        );
      }
      if (snapshot.suspected_bursts.length > 0) {
        review.recommended_next_changes.push(
          `Fix ${snapshot.suspected_bursts.length} burst pattern(s) - implement caching/deduplication`
        );
      }
    }

    // Only notify for high priority
    if (review.priority !== "high") {
      console.log("[api-monitor-notify] Review priority is not 'high', skipping notification");
      return new Response(
        JSON.stringify({ message: "Not high priority, skipping notification" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get platform admins with Slack
    const admins = await getPlatformAdminsWithSlack(supabase);

    if (admins.length === 0) {
      console.warn("[api-monitor-notify] No platform admins with Slack found");
      return new Response(
        JSON.stringify({ message: "No admins with Slack found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build notification URL
    const publicUrl = Deno.env.get("PUBLIC_URL") || "https://app.use60.com";
    const snapshotUrl = `${publicUrl}/platform/dev/api-monitor?from=${encodeURIComponent(snapshot.time_bucket_start)}&to=${encodeURIComponent(snapshot.time_bucket_end)}`;

    // Build Slack blocks
    const blocks = buildSlackBlocks(snapshot, review, snapshotUrl);

    // Send notifications to each admin
    const results: Array<{ admin: string; success: boolean; error?: string }> = [];

    for (const admin of admins) {
      const botToken = await getSlackBotToken(supabase, admin.orgId);

      if (!botToken) {
        console.warn(`[api-monitor-notify] No bot token for org ${admin.orgId}`);
        results.push({
          admin: admin.email,
          success: false,
          error: "No Slack bot token",
        });
        continue;
      }

      const result = await sendSlackDM(botToken, admin.slackUserId, blocks);
      results.push({
        admin: admin.email,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        console.log(`[api-monitor-notify] Sent notification to ${admin.email}`);
      } else {
        console.error(`[api-monitor-notify] Failed to send to ${admin.email}: ${result.error}`);
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({
        message: `Sent ${successCount}/${results.length} notifications`,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[api-monitor-notify] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

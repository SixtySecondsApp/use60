/**
 * process-reengagement - Smart Engagement Algorithm Re-engagement Processor
 *
 * Processes users eligible for re-engagement and sends personalized
 * content-driven notifications to bring them back.
 *
 * Endpoints:
 * - POST /process-reengagement - Process all eligible users
 * - POST /process-reengagement?org_id=xxx - Process for specific org
 * - POST /process-reengagement?user_id=xxx - Process specific user
 * - POST /process-reengagement?segment=xxx - Process specific segment
 * - POST /process-reengagement?dry_run=true - Preview without sending
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendEmail, isSESConfigured } from "../_shared/ses.ts";
import {
  selectReengagementType,
  buildReengagementSlackBlocks,
  buildReengagementEmailContent,
  REENGAGEMENT_TYPES,
  type ReengagementType,
  type ReengagementContext,
} from "../_shared/engagement/reengagement.ts";
import type { UserSegment } from "../_shared/engagement/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface ReengagementCandidate {
  user_id: string;
  org_id: string;
  slack_user_id: string | null;
  email: string | null;
  full_name: string;
  segment: UserSegment;
  days_inactive: number;
  overall_engagement_score: number;
  reengagement_attempts: number;
  last_reengagement_at: string | null;
  last_reengagement_type: string | null;
}

interface ContentTrigger {
  trigger_type: string;
  entity_type: string;
  entity_id: string;
  context: Record<string, unknown>;
  priority: number;
}

interface ProcessResult {
  user_id: string;
  status: "sent" | "failed" | "skipped";
  channel?: "slack_dm" | "email";
  reengagement_type?: string;
  reason?: string;
}

/**
 * Get content triggers for a user
 */
async function getContentTriggers(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<ContentTrigger[]> {
  const { data, error } = await supabase.rpc("get_content_triggers_for_user", {
    p_user_id: userId,
  });

  if (error) {
    console.error(`[process-reengagement] Error getting triggers for ${userId}:`, error);
    return [];
  }

  return data || [];
}

/**
 * Build re-engagement context from triggers
 */
function buildContext(
  candidate: ReengagementCandidate,
  triggers: ContentTrigger[]
): ReengagementContext {
  const context: ReengagementContext = {
    userName: candidate.full_name,
    userFirstName: candidate.full_name.split(" ")[0],
    segment: candidate.segment,
    daysInactive: candidate.days_inactive,
  };

  // Group triggers by type
  const meetingTriggers = triggers.filter((t) => t.trigger_type === "upcoming_meeting");
  const dealTriggers = triggers.filter((t) => t.trigger_type === "deal_update");
  const emailTriggers = triggers.filter((t) => t.trigger_type === "new_email");

  if (meetingTriggers.length > 0) {
    context.upcomingMeetings = meetingTriggers.map((t) => ({
      title: t.context.title as string,
      company: t.context.company as string || "Unknown",
      date: new Date(t.context.date as string).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      prepReady: t.context.prep_ready as boolean || false,
    }));
  }

  if (dealTriggers.length > 0) {
    context.dealUpdates = dealTriggers.map((t) => ({
      dealName: t.context.deal_name as string,
      company: t.context.company as string || "Unknown",
      updateType: t.context.update_type as string,
      detail: t.context.detail as string,
    }));
  }

  if (emailTriggers.length > 0) {
    context.newEmails = emailTriggers.map((t) => ({
      from: t.context.from_name as string || t.context.from as string,
      subject: t.context.subject as string || "(no subject)",
      preview: "",
      isImportant: t.context.is_important as boolean || false,
    }));
  }

  // Build activity summary if we have data
  if (triggers.length > 0) {
    context.activitySummary = {
      newEmails: emailTriggers.length,
      dealChanges: dealTriggers.length,
      meetingsScheduled: meetingTriggers.length,
    };
  }

  return context;
}

/**
 * Send re-engagement via Slack
 */
async function sendViaSlack(
  supabase: ReturnType<typeof createClient>,
  candidate: ReengagementCandidate,
  reengagementType: ReengagementType,
  context: ReengagementContext
): Promise<{ success: boolean; error?: string }> {
  if (!candidate.slack_user_id) {
    return { success: false, error: "No Slack user ID" };
  }

  // Get org's Slack bot token
  const { data: orgSettings } = await supabase
    .from("organization_settings")
    .select("slack_bot_token")
    .eq("organization_id", candidate.org_id)
    .maybeSingle();

  if (!orgSettings?.slack_bot_token) {
    return { success: false, error: "No Slack bot token" };
  }

  // Build blocks
  const blocks = buildReengagementSlackBlocks(reengagementType, context);

  if (blocks.length === 0) {
    return { success: false, error: "No blocks generated" };
  }

  // Send message
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${orgSettings.slack_bot_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: candidate.slack_user_id,
      text: `Re-engagement: ${REENGAGEMENT_TYPES[reengagementType].name}`,
      blocks,
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    return { success: false, error: result.error || "Slack API error" };
  }

  return { success: true };
}

/**
 * Send re-engagement via email
 */
async function sendViaEmail(
  candidate: ReengagementCandidate,
  reengagementType: ReengagementType,
  context: ReengagementContext
): Promise<{ success: boolean; error?: string }> {
  if (!candidate.email) {
    return { success: false, error: "No email address" };
  }

  if (!isSESConfigured()) {
    return { success: false, error: "AWS SES not configured" };
  }

  // Build email content
  const emailContent = buildReengagementEmailContent(reengagementType, context);

  // Send via AWS SES
  const result = await sendEmail({
    to: candidate.email,
    subject: emailContent.subject,
    html: emailContent.bodyHtml,
    from: "noreply@use60.com",
    fromName: "Sixty",
  });

  if (!result.success) {
    return { success: false, error: result.error || "SES send failed" };
  }

  return { success: true };
}

/**
 * Process a single user for re-engagement
 */
async function processUser(
  supabase: ReturnType<typeof createClient>,
  candidate: ReengagementCandidate,
  dryRun: boolean
): Promise<ProcessResult> {
  try {
    // Get content triggers
    const triggers = await getContentTriggers(supabase, candidate.user_id);

    // Determine available content
    const availableContent = {
      upcomingMeetings: triggers.some((t) => t.trigger_type === "upcoming_meeting"),
      dealUpdates: triggers.some((t) => t.trigger_type === "deal_update"),
      championChanges: false, // TODO: implement champion tracking
      newEmails: triggers.some((t) => t.trigger_type === "new_email"),
      activitySummary: triggers.length > 0,
    };

    // Determine previous attempts
    const previousAttempts: ReengagementType[] = [];
    if (candidate.last_reengagement_type) {
      previousAttempts.push(candidate.last_reengagement_type as ReengagementType);
    }

    // Select re-engagement type
    const reengagementType = selectReengagementType(
      candidate.segment,
      availableContent,
      previousAttempts
    );

    // Build context
    const context = buildContext(candidate, triggers);

    // Determine channel
    const hasSlack = !!candidate.slack_user_id;
    const channel: "slack_dm" | "email" =
      candidate.segment === "churned" || candidate.segment === "dormant"
        ? "email"
        : hasSlack
        ? "slack_dm"
        : "email";

    if (dryRun) {
      return {
        user_id: candidate.user_id,
        status: "skipped",
        channel,
        reengagement_type: reengagementType,
        reason: "dry_run",
      };
    }

    // Get trigger info for logging
    const primaryTrigger = triggers.length > 0
      ? triggers.sort((a, b) => b.priority - a.priority)[0]
      : null;

    // Send notification
    let result: { success: boolean; error?: string };
    if (channel === "slack_dm") {
      result = await sendViaSlack(supabase, candidate, reengagementType, context);
    } else {
      result = await sendViaEmail(candidate, reengagementType, context);
    }

    if (!result.success) {
      return {
        user_id: candidate.user_id,
        status: "failed",
        channel,
        reengagement_type: reengagementType,
        reason: result.error,
      };
    }

    // Record the attempt
    await supabase.rpc("record_reengagement_attempt", {
      p_user_id: candidate.user_id,
      p_org_id: candidate.org_id,
      p_reengagement_type: reengagementType,
      p_channel: channel,
      p_trigger_type: primaryTrigger?.trigger_type || null,
      p_trigger_entity_type: primaryTrigger?.entity_type || null,
      p_trigger_entity_id: primaryTrigger?.entity_id || null,
      p_trigger_context: primaryTrigger?.context || null,
    });

    // Log activity
    await supabase.from("activities").insert({
      user_id: candidate.user_id,
      org_id: candidate.org_id,
      activity_type: "reengagement_sent",
      description: `Re-engagement: ${REENGAGEMENT_TYPES[reengagementType].name} via ${channel}`,
      metadata: {
        reengagement_type: reengagementType,
        channel,
        segment: candidate.segment,
        days_inactive: candidate.days_inactive,
        has_content_trigger: triggers.length > 0,
      },
    });

    return {
      user_id: candidate.user_id,
      status: "sent",
      channel,
      reengagement_type: reengagementType,
    };
  } catch (error) {
    console.error(`[process-reengagement] Error processing ${candidate.user_id}:`, error);
    return {
      user_id: candidate.user_id,
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
    // Parse from both URL params and body (body takes precedence)
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // No body or invalid JSON - use URL params only
    }

    const orgId = (body.org_id as string) || url.searchParams.get("org_id");
    const userId = (body.user_id as string) || url.searchParams.get("user_id");
    const segment = (body.segment as string) || url.searchParams.get("segment");
    const limit = (body.limit as number) || parseInt(url.searchParams.get("limit") || "50", 10);
    const dryRun = body.dry_run === true || url.searchParams.get("dry_run") === "true";

    console.log("[process-reengagement] Starting", { orgId, userId, segment, limit, dryRun });

    // Get candidates
    let candidates: ReengagementCandidate[] = [];

    if (userId) {
      // Single user mode - get user info directly
      const { data: user } = await supabase
        .from("user_engagement_metrics")
        .select(`
          user_id,
          org_id,
          user_segment,
          overall_engagement_score,
          reengagement_attempts,
          last_reengagement_at,
          last_reengagement_type,
          last_app_active_at,
          last_slack_active_at,
          last_login_at
        `)
        .eq("user_id", userId)
        .single();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("slack_user_id, email, full_name")
          .eq("id", userId)
          .single();

        if (profile) {
          const daysInactive = Math.max(
            user.last_app_active_at ? Math.floor((Date.now() - new Date(user.last_app_active_at).getTime()) / (1000 * 60 * 60 * 24)) : 999,
            user.last_slack_active_at ? Math.floor((Date.now() - new Date(user.last_slack_active_at).getTime()) / (1000 * 60 * 60 * 24)) : 999
          );

          candidates = [{
            user_id: user.user_id,
            org_id: user.org_id,
            slack_user_id: profile.slack_user_id,
            email: profile.email,
            full_name: profile.full_name || "User",
            segment: user.user_segment as UserSegment,
            days_inactive: daysInactive,
            overall_engagement_score: user.overall_engagement_score || 50,
            reengagement_attempts: user.reengagement_attempts || 0,
            last_reengagement_at: user.last_reengagement_at,
            last_reengagement_type: user.last_reengagement_type,
          }];
        }
      }
    } else {
      // Batch mode
      const { data, error } = await supabase.rpc("get_reengagement_candidates", {
        p_org_id: orgId || null,
        p_segment: segment || null,
        p_limit: limit,
      });

      if (error) {
        throw new Error(`Failed to get candidates: ${error.message}`);
      }

      candidates = data || [];
    }

    console.log(`[process-reengagement] Found ${candidates.length} candidates`);

    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No eligible candidates",
          processed: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process each candidate
    const results: ProcessResult[] = [];
    const stats = { sent: 0, failed: 0, skipped: 0 };

    for (const candidate of candidates) {
      const result = await processUser(supabase, candidate, dryRun);
      results.push(result);
      stats[result.status]++;

      console.log(
        `[process-reengagement] ${result.status}: ${candidate.user_id}`,
        result.reengagement_type ? `(${result.reengagement_type})` : "",
        result.reason ? `- ${result.reason}` : ""
      );
    }

    console.log("[process-reengagement] Complete", stats);

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        processed: candidates.length,
        stats,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[process-reengagement] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

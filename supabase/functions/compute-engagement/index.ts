/**
 * compute-engagement - Smart Engagement Algorithm
 *
 * Computes user engagement scores, segments, and optimal notification timing.
 * Designed to run daily as a cron job.
 *
 * Endpoints:
 * - POST /compute-engagement - Run engagement computation for all users
 * - POST /compute-engagement?user_id=xxx - Run for a specific user
 * - POST /compute-engagement?org_id=xxx - Run for a specific org
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Engagement algorithm configuration
const CONFIG = {
  // Scoring weights
  weights: {
    app_activity: 0.35,
    slack_activity: 0.30,
    notification_engagement: 0.35,
  },

  // Segment thresholds
  segments: {
    power_user: { min_score: 80, min_sessions_per_day: 3 },
    regular: { min_score: 50, min_sessions_per_week: 3 },
    casual: { min_score: 25, min_sessions_per_week: 1 },
    at_risk: { max_score: 25, max_days_inactive: 7 },
    dormant: { max_days_inactive: 14 },
    churned: { max_days_inactive: 30 },
  },

  // Notification preferences (default configuration)
  notification_thresholds: {
    high: { max_per_hour: 4, max_per_day: 15 },
    moderate: { max_per_hour: 2, max_per_day: 8 },
    low: { max_per_hour: 1, max_per_day: 3 },
  },

  // Feedback timing: every 2 weeks (14 days)
  feedback_interval_days: 14,

  // Time windows for analysis
  analysis_windows: {
    recent_activity_days: 7,
    notification_analysis_days: 30,
    session_analysis_days: 14,
  },
};

interface UserMetrics {
  id: string;
  user_id: string;
  org_id: string;
  last_app_active_at: string | null;
  last_slack_active_at: string | null;
  last_notification_clicked_at: string | null;
  last_login_at: string | null;
  preferred_notification_frequency: string;
  last_feedback_requested_at: string | null;
  notifications_since_last_feedback: number;
}

interface ComputedScores {
  app_engagement_score: number;
  slack_engagement_score: number;
  notification_engagement_score: number;
  overall_engagement_score: number;
  user_segment: string;
  typical_active_hours: Record<number, number[]>;
  peak_activity_hour: number | null;
  avg_daily_sessions: number;
  notification_fatigue_level: number;
  should_request_feedback: boolean;
}

/**
 * Compute engagement scores for a single user
 */
async function computeUserEngagement(
  supabase: ReturnType<typeof createClient>,
  metrics: UserMetrics
): Promise<ComputedScores> {
  const now = new Date();
  const recentWindowStart = new Date(now.getTime() - CONFIG.analysis_windows.recent_activity_days * 24 * 60 * 60 * 1000);
  const notificationWindowStart = new Date(now.getTime() - CONFIG.analysis_windows.notification_analysis_days * 24 * 60 * 60 * 1000);

  // Fetch recent activity events
  const { data: activityEvents } = await supabase
    .from("user_activity_events")
    .select("event_type, event_source, event_at, day_of_week, hour_of_day, session_id")
    .eq("user_id", metrics.user_id)
    .gte("event_at", recentWindowStart.toISOString())
    .order("event_at", { ascending: false })
    .limit(1000);

  // Fetch notification interactions
  const { data: notificationInteractions } = await supabase
    .from("notification_interactions")
    .select("delivered_at, clicked_at, dismissed_at, time_to_interaction_seconds, hour_of_day, day_of_week")
    .eq("user_id", metrics.user_id)
    .gte("delivered_at", notificationWindowStart.toISOString());

  // Calculate app engagement score (0-100)
  const appEvents = (activityEvents || []).filter((e) => e.event_source === "app");
  const appEngagementScore = calculateAppEngagementScore(appEvents, metrics);

  // Calculate Slack engagement score (0-100)
  const slackEvents = (activityEvents || []).filter((e) => e.event_source === "slack");
  const slackEngagementScore = calculateSlackEngagementScore(slackEvents, metrics);

  // Calculate notification engagement score (0-100)
  const notificationEngagementScore = calculateNotificationEngagementScore(notificationInteractions || []);

  // Calculate overall engagement score (weighted average)
  const overallEngagementScore = Math.round(
    appEngagementScore * CONFIG.weights.app_activity +
    slackEngagementScore * CONFIG.weights.slack_activity +
    notificationEngagementScore * CONFIG.weights.notification_engagement
  );

  // Determine user segment
  const userSegment = determineUserSegment(overallEngagementScore, metrics, activityEvents || []);

  // Calculate activity patterns
  const activityPatterns = calculateActivityPatterns(activityEvents || []);

  // Calculate session metrics
  const sessionMetrics = calculateSessionMetrics(activityEvents || []);

  // Calculate notification fatigue level
  const notificationFatigueLevel = calculateNotificationFatigue(notificationInteractions || [], metrics);

  // Determine if feedback should be requested
  const shouldRequestFeedback = checkShouldRequestFeedback(metrics);

  return {
    app_engagement_score: appEngagementScore,
    slack_engagement_score: slackEngagementScore,
    notification_engagement_score: notificationEngagementScore,
    overall_engagement_score: overallEngagementScore,
    user_segment: userSegment,
    typical_active_hours: activityPatterns.typicalActiveHours,
    peak_activity_hour: activityPatterns.peakHour,
    avg_daily_sessions: sessionMetrics.avgDailySessions,
    notification_fatigue_level: notificationFatigueLevel,
    should_request_feedback: shouldRequestFeedback,
  };
}

/**
 * Calculate app engagement score based on activity events
 */
function calculateAppEngagementScore(events: any[], metrics: UserMetrics): number {
  if (events.length === 0) {
    // Check if user was recently active
    if (metrics.last_app_active_at) {
      const daysSinceActive = (Date.now() - new Date(metrics.last_app_active_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceActive < 1) return 60;
      if (daysSinceActive < 3) return 40;
      if (daysSinceActive < 7) return 20;
    }
    return 10;
  }

  const daysWithActivity = new Set(events.map((e) => e.event_at.split("T")[0])).size;
  const totalEvents = events.length;
  const uniqueSessions = new Set(events.filter((e) => e.session_id).map((e) => e.session_id)).size;

  // Score components
  const frequencyScore = Math.min(daysWithActivity / 7, 1) * 40; // Max 40 points for daily usage
  const intensityScore = Math.min(totalEvents / 50, 1) * 30; // Max 30 points for high activity
  const sessionScore = Math.min(uniqueSessions / 10, 1) * 30; // Max 30 points for multiple sessions

  return Math.round(frequencyScore + intensityScore + sessionScore);
}

/**
 * Calculate Slack engagement score based on Slack activity
 */
function calculateSlackEngagementScore(events: any[], metrics: UserMetrics): number {
  if (events.length === 0) {
    if (metrics.last_slack_active_at) {
      const daysSinceActive = (Date.now() - new Date(metrics.last_slack_active_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceActive < 1) return 50;
      if (daysSinceActive < 3) return 30;
      if (daysSinceActive < 7) return 15;
    }
    return 10;
  }

  const daysWithActivity = new Set(events.map((e) => e.event_at.split("T")[0])).size;
  const totalEvents = events.length;

  // Score components
  const frequencyScore = Math.min(daysWithActivity / 7, 1) * 50; // Max 50 points for daily Slack usage
  const interactionScore = Math.min(totalEvents / 20, 1) * 50; // Max 50 points for button clicks

  return Math.round(frequencyScore + interactionScore);
}

/**
 * Calculate notification engagement score based on click-through rates
 */
function calculateNotificationEngagementScore(interactions: any[]): number {
  if (interactions.length === 0) return 50; // Neutral score if no notifications sent

  const totalNotifications = interactions.length;
  const clickedNotifications = interactions.filter((i) => i.clicked_at).length;
  const dismissedNotifications = interactions.filter((i) => i.dismissed_at && !i.clicked_at).length;

  // Calculate click-through rate
  const ctr = totalNotifications > 0 ? clickedNotifications / totalNotifications : 0;

  // Calculate average response time for clicked notifications
  const clickedWithTime = interactions.filter((i) => i.clicked_at && i.time_to_interaction_seconds);
  const avgResponseTime = clickedWithTime.length > 0
    ? clickedWithTime.reduce((sum, i) => sum + i.time_to_interaction_seconds, 0) / clickedWithTime.length
    : 3600; // Default to 1 hour if no data

  // Score components
  const ctrScore = ctr * 60; // Max 60 points for 100% CTR
  const responseTimeScore = Math.max(0, 25 - (avgResponseTime / 3600) * 25); // Max 25 points for quick responses
  const dismissalPenalty = (dismissedNotifications / Math.max(totalNotifications, 1)) * 15; // Up to 15 point penalty

  return Math.round(Math.max(0, Math.min(100, ctrScore + responseTimeScore - dismissalPenalty + 15))); // Base 15 points
}

/**
 * Determine user segment based on engagement and activity
 */
function determineUserSegment(
  overallScore: number,
  metrics: UserMetrics,
  events: any[]
): string {
  const now = Date.now();
  const lastActive = Math.max(
    metrics.last_app_active_at ? new Date(metrics.last_app_active_at).getTime() : 0,
    metrics.last_slack_active_at ? new Date(metrics.last_slack_active_at).getTime() : 0
  );

  const daysSinceActive = (now - lastActive) / (1000 * 60 * 60 * 24);

  // Check for churned first (30+ days inactive)
  if (daysSinceActive >= CONFIG.segments.churned.max_days_inactive) {
    return "churned";
  }

  // Check for dormant (14+ days inactive)
  if (daysSinceActive >= CONFIG.segments.dormant.max_days_inactive) {
    return "dormant";
  }

  // Check for at_risk (7+ days inactive OR very low score)
  if (daysSinceActive >= CONFIG.segments.at_risk.max_days_inactive || overallScore < CONFIG.segments.at_risk.max_score) {
    return "at_risk";
  }

  // Calculate sessions per day for power user detection
  const uniqueDays = new Set(events.map((e) => e.event_at.split("T")[0])).size;
  const uniqueSessions = new Set(events.filter((e) => e.session_id).map((e) => e.session_id)).size;
  const sessionsPerDay = uniqueDays > 0 ? uniqueSessions / uniqueDays : 0;

  // Check for power user
  if (overallScore >= CONFIG.segments.power_user.min_score && sessionsPerDay >= CONFIG.segments.power_user.min_sessions_per_day) {
    return "power_user";
  }

  // Check for regular user
  if (overallScore >= CONFIG.segments.regular.min_score) {
    return "regular";
  }

  // Check for casual user
  if (overallScore >= CONFIG.segments.casual.min_score) {
    return "casual";
  }

  return "at_risk";
}

/**
 * Calculate typical active hours and peak activity hour
 */
function calculateActivityPatterns(events: any[]): {
  typicalActiveHours: Record<number, number[]>;
  peakHour: number | null;
} {
  if (events.length === 0) {
    return { typicalActiveHours: {}, peakHour: null };
  }

  // Group events by day of week and hour
  const hourCounts: Record<number, number> = {};
  const dayHourCounts: Record<number, Record<number, number>> = {};

  for (const event of events) {
    const hour = event.hour_of_day;
    const day = event.day_of_week;

    hourCounts[hour] = (hourCounts[hour] || 0) + 1;

    if (!dayHourCounts[day]) dayHourCounts[day] = {};
    dayHourCounts[day][hour] = (dayHourCounts[day][hour] || 0) + 1;
  }

  // Find peak hour
  let peakHour: number | null = null;
  let maxCount = 0;
  for (const [hour, count] of Object.entries(hourCounts)) {
    if (count > maxCount) {
      maxCount = count;
      peakHour = parseInt(hour);
    }
  }

  // Build typical active hours per day (top 5 hours per day)
  const typicalActiveHours: Record<number, number[]> = {};
  for (const [day, hours] of Object.entries(dayHourCounts)) {
    const sortedHours = Object.entries(hours)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([h]) => parseInt(h));
    typicalActiveHours[parseInt(day)] = sortedHours;
  }

  return { typicalActiveHours, peakHour };
}

/**
 * Calculate session metrics
 */
function calculateSessionMetrics(events: any[]): {
  avgDailySessions: number;
} {
  if (events.length === 0) {
    return { avgDailySessions: 0 };
  }

  const uniqueDays = new Set(events.map((e) => e.event_at.split("T")[0])).size;
  const uniqueSessions = new Set(events.filter((e) => e.session_id).map((e) => e.session_id)).size;

  return {
    avgDailySessions: uniqueDays > 0 ? Math.round((uniqueSessions / uniqueDays) * 100) / 100 : 0,
  };
}

/**
 * Calculate notification fatigue level (0-100)
 */
function calculateNotificationFatigue(interactions: any[], metrics: UserMetrics): number {
  if (interactions.length === 0) return 0;

  const recentInteractions = interactions.slice(0, 20); // Last 20 notifications
  const dismissedCount = recentInteractions.filter((i) => i.dismissed_at && !i.clicked_at).length;
  const ignoredCount = recentInteractions.filter((i) => !i.clicked_at && !i.dismissed_at).length;

  // Fatigue indicators
  const dismissalRate = dismissedCount / recentInteractions.length;
  const ignoreRate = ignoredCount / recentInteractions.length;

  // Calculate fatigue score
  const fatigueScore = Math.round((dismissalRate * 50 + ignoreRate * 50) * 100);

  return Math.min(100, fatigueScore);
}

/**
 * Check if feedback should be requested (every 2 weeks)
 */
function checkShouldRequestFeedback(metrics: UserMetrics): boolean {
  const now = new Date();

  // If never requested, check if enough notifications have been sent
  if (!metrics.last_feedback_requested_at) {
    return metrics.notifications_since_last_feedback >= 10; // At least 10 notifications before first ask
  }

  const lastFeedback = new Date(metrics.last_feedback_requested_at);
  const daysSinceFeedback = (now.getTime() - lastFeedback.getTime()) / (1000 * 60 * 60 * 24);

  return daysSinceFeedback >= CONFIG.feedback_interval_days;
}

/**
 * Update user engagement metrics in database
 */
async function updateUserMetrics(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  scores: ComputedScores
): Promise<void> {
  const { error } = await supabase
    .from("user_engagement_metrics")
    .update({
      app_engagement_score: scores.app_engagement_score,
      slack_engagement_score: scores.slack_engagement_score,
      notification_engagement_score: scores.notification_engagement_score,
      overall_engagement_score: scores.overall_engagement_score,
      user_segment: scores.user_segment,
      typical_active_hours: scores.typical_active_hours,
      peak_activity_hour: scores.peak_activity_hour,
      avg_daily_sessions: scores.avg_daily_sessions,
      notification_fatigue_level: scores.notification_fatigue_level,
    })
    .eq("user_id", userId);

  if (error) {
    console.error(`[compute-engagement] Error updating metrics for user ${userId}:`, error);
    throw error;
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
    const userId = url.searchParams.get("user_id");
    const orgId = url.searchParams.get("org_id");

    console.log("[compute-engagement] Starting engagement computation", { userId, orgId });

    // Build query for metrics to process
    let query = supabase.from("user_engagement_metrics").select("*");

    if (userId) {
      query = query.eq("user_id", userId);
    } else if (orgId) {
      query = query.eq("org_id", orgId);
    }

    const { data: metricsRecords, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch metrics: ${fetchError.message}`);
    }

    if (!metricsRecords || metricsRecords.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No users to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[compute-engagement] Processing ${metricsRecords.length} users`);

    let processed = 0;
    let errors = 0;
    const results: Array<{ userId: string; segment: string; score: number }> = [];

    for (const metrics of metricsRecords) {
      try {
        const scores = await computeUserEngagement(supabase, metrics);
        await updateUserMetrics(supabase, metrics.user_id, scores);

        results.push({
          userId: metrics.user_id,
          segment: scores.user_segment,
          score: scores.overall_engagement_score,
        });

        processed++;

        // Log segment changes
        if (metrics.user_segment !== scores.user_segment) {
          console.log(`[compute-engagement] Segment change for ${metrics.user_id}: ${metrics.user_segment} -> ${scores.user_segment}`);
        }
      } catch (err) {
        console.error(`[compute-engagement] Error processing user ${metrics.user_id}:`, err);
        errors++;
      }
    }

    // Aggregate segment counts
    const segmentCounts = results.reduce((acc, r) => {
      acc[r.segment] = (acc[r.segment] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log("[compute-engagement] Computation complete", { processed, errors, segmentCounts });

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        errors,
        segmentCounts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[compute-engagement] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

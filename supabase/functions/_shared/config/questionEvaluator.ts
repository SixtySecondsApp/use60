/**
 * Question Trigger Evaluator (LEARN-005)
 *
 * Shared module for evaluating whether a contextual config question should be
 * delivered to a user based on trigger events, rate limits, quiet hours, and
 * activity signals.
 *
 * Design principle: fail open — if any ancillary check errors, default to
 * allowing delivery so questions are not silently dropped.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getSlackRecipient } from '../proactive/recipients.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export interface QuestionEligibilityResult {
  eligible: boolean;
  reason?: string;
  question_id?: string;
  config_key?: string;
  question_text?: string;
  category?: string;
  scope?: string;
  options?: unknown;
  priority?: number;
  next_eligible_at?: string;
}

export type DeliveryChannel = 'slack' | 'in_app';

// =============================================================================
// Core Evaluator
// =============================================================================

/**
 * Evaluate whether a contextual question should be delivered for a given event.
 *
 * Steps:
 * 1. Call `get_next_config_question` RPC (handles 24h rate limit + priority)
 * 2. If eligible, run additional delivery gate checks (quiet hours, recency)
 * 3. Return the question result with eligibility verdict
 */
export async function evaluateQuestionTrigger(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  triggerEvent: string,
  eventData?: Record<string, unknown>,
): Promise<QuestionEligibilityResult> {
  console.log('[questionEvaluator] evaluateQuestionTrigger', {
    orgId,
    userId,
    triggerEvent,
    hasEventData: !!eventData,
  });

  // Step 1: Call the DB RPC which handles 24h rate limiting and priority ordering
  let rpcResult: QuestionEligibilityResult;
  try {
    const { data, error } = await supabase.rpc('get_next_config_question', {
      p_org_id: orgId,
      p_user_id: userId,
      p_trigger_event: triggerEvent,
    });

    if (error) {
      console.error('[questionEvaluator] get_next_config_question RPC error:', error);
      // Fail open: treat as ineligible rather than crashing
      return { eligible: false, reason: 'rpc_error' };
    }

    rpcResult = data as QuestionEligibilityResult;
  } catch (err) {
    console.error('[questionEvaluator] Unexpected error calling RPC:', err);
    return { eligible: false, reason: 'rpc_error' };
  }

  if (!rpcResult.eligible) {
    console.log('[questionEvaluator] RPC returned ineligible:', rpcResult.reason);
    return rpcResult;
  }

  // Step 2: Additional delivery gate checks
  const shouldDeliver = await shouldDeliverQuestion(supabase, orgId, userId);
  if (!shouldDeliver.deliver) {
    console.log('[questionEvaluator] Delivery gate blocked:', shouldDeliver.reason);
    return { eligible: false, reason: shouldDeliver.reason };
  }

  console.log('[questionEvaluator] Question eligible for delivery:', {
    question_id: rpcResult.question_id,
    config_key: rpcResult.config_key,
    category: rpcResult.category,
  });

  return rpcResult;
}

// =============================================================================
// Delivery Gate Checks
// =============================================================================

/**
 * Additional rate limit and contextual checks beyond what the RPC handles.
 *
 * Checks (fail open — errors always return deliver: true):
 * 1. Quiet hours from `slack_user_preferences`
 * 2. Recent meeting in last 2 hours (don't interrupt post-meeting recovery)
 * 3. User inactivity for 3+ days (no point asking if they're not using the product)
 */
export async function shouldDeliverQuestion(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<{ deliver: boolean; reason?: string }> {
  // Run all checks in parallel; errors in any check default to allowing delivery
  const [quietHoursBlocked, recentMeetingBlocked, userInactive] = await Promise.all([
    checkQuietHours(supabase, orgId, userId),
    checkRecentMeeting(supabase, userId),
    checkUserInactivity(supabase, orgId, userId),
  ]);

  if (quietHoursBlocked) {
    return { deliver: false, reason: 'quiet_hours' };
  }

  if (recentMeetingBlocked) {
    return { deliver: false, reason: 'post_meeting_cooldown' };
  }

  if (userInactive) {
    return { deliver: false, reason: 'user_inactive' };
  }

  return { deliver: true };
}

/**
 * Check if the current time falls within the user's configured quiet hours.
 * Reads from `slack_user_preferences` for any feature row — quiet hours are
 * a user-level preference that applies globally.
 *
 * Fails open (returns false) on any error.
 */
async function checkQuietHours(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<boolean> {
  try {
    // Fetch any preference row for this user — quiet hours are not feature-specific
    const { data: pref } = await supabase
      .from('slack_user_preferences')
      .select('quiet_hours_start, quiet_hours_end')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .not('quiet_hours_start', 'is', null)
      .not('quiet_hours_end', 'is', null)
      .maybeSingle();

    if (!pref || !pref.quiet_hours_start || !pref.quiet_hours_end) {
      return false; // No quiet hours configured → deliver
    }

    // Determine user timezone from slack_user_mappings
    const { data: mapping } = await supabase
      .from('slack_user_mappings')
      .select('preferred_timezone')
      .eq('org_id', orgId)
      .eq('sixty_user_id', userId)
      .maybeSingle();

    const tz = mapping?.preferred_timezone || 'America/New_York';

    const now = new Date();
    const userNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const currentMinutes = userNow.getHours() * 60 + userNow.getMinutes();

    const [startH, startM] = (pref.quiet_hours_start as string).split(':').map(Number);
    const [endH, endM] = (pref.quiet_hours_end as string).split(':').map(Number);
    const quietStart = startH * 60 + startM;
    const quietEnd = endH * 60 + endM;

    // Handle overnight ranges (e.g., 22:00–07:00)
    const isQuiet = quietStart > quietEnd
      ? currentMinutes >= quietStart || currentMinutes < quietEnd
      : currentMinutes >= quietStart && currentMinutes < quietEnd;

    if (isQuiet) {
      console.log('[questionEvaluator] Quiet hours active for user', userId);
    }

    return isQuiet;
  } catch (err) {
    console.warn('[questionEvaluator] checkQuietHours error (fail open):', err);
    return false;
  }
}

/**
 * Check if the user had a meeting end within the last 2 hours.
 * Avoids asking configuration questions immediately after a call when the user
 * is likely processing notes or following up.
 *
 * Uses `meetings` table with `owner_user_id` column (NOT `user_id`).
 * Fails open (returns false) on any error.
 */
async function checkRecentMeeting(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: recentMeeting } = await supabase
      .from('meetings')
      .select('id, end_time')
      .eq('owner_user_id', userId) // NOTE: meetings table uses owner_user_id, NOT user_id
      .gte('end_time', twoHoursAgo)
      .order('end_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentMeeting) {
      console.log('[questionEvaluator] Recent meeting found within 2h cooldown:', recentMeeting.id);
      return true;
    }

    return false;
  } catch (err) {
    console.warn('[questionEvaluator] checkRecentMeeting error (fail open):', err);
    return false;
  }
}

/**
 * Check if the user has been inactive for 3+ days.
 * Checks `activities` table first, then falls back to `agent_activity`.
 * No point asking configuration questions to an inactive user.
 *
 * Fails open (returns false) on any error.
 */
async function checkUserInactivity(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<boolean> {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // Check activities table for recent user activity
    const { data: recentActivity } = await supabase
      .from('activities')
      .select('id, created_at')
      .eq('user_id', userId)
      .gte('created_at', threeDaysAgo)
      .limit(1)
      .maybeSingle();

    if (recentActivity) {
      return false; // Active recently → don't block
    }

    // Fallback: check agent_activity table
    const { data: recentAgentActivity } = await supabase
      .from('agent_activity')
      .select('id, created_at')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .gte('created_at', threeDaysAgo)
      .limit(1)
      .maybeSingle();

    if (recentAgentActivity) {
      return false; // Agent activity found → not inactive
    }

    console.log('[questionEvaluator] User appears inactive for 3+ days:', userId);
    return true;
  } catch (err) {
    console.warn('[questionEvaluator] checkUserInactivity error (fail open):', err);
    return false;
  }
}

// =============================================================================
// Channel Resolution
// =============================================================================

/**
 * Resolve the preferred delivery channel for a user.
 *
 * Logic:
 * - If the user has a connected Slack mapping → 'slack'
 * - Otherwise → 'in_app'
 *
 * Fails open (returns 'in_app') on any error.
 */
export async function resolveDeliveryChannel(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<DeliveryChannel> {
  try {
    const recipient = await getSlackRecipient(supabase, orgId, userId);

    if (recipient?.slackUserId) {
      console.log('[questionEvaluator] Slack recipient found, using slack channel');
      return 'slack';
    }

    console.log('[questionEvaluator] No Slack mapping, using in_app channel');
    return 'in_app';
  } catch (err) {
    console.warn('[questionEvaluator] resolveDeliveryChannel error (fail open to in_app):', err);
    return 'in_app';
  }
}

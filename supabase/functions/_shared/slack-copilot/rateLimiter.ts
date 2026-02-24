// supabase/functions/_shared/slack-copilot/rateLimiter.ts
// Rate limiting and usage tracking for Slack copilot (PRD-22, CONV-009)

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const MAX_QUERIES_PER_HOUR = 30;

interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
  message?: string;
}

/**
 * Check if a user is within their rate limit for copilot queries.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  orgId: string
): Promise<RateLimitResult> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from('slack_command_analytics')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('command_type', 'copilot_dm')
    .gte('created_at', oneHourAgo);

  if (error) {
    // Don't block on analytics errors
    console.warn('[rateLimiter] Error checking rate limit:', error);
    return { allowed: true, remaining: MAX_QUERIES_PER_HOUR };
  }

  const used = count || 0;
  const remaining = Math.max(0, MAX_QUERIES_PER_HOUR - used);

  if (remaining === 0) {
    const resetTime = new Date(Date.now() + 60 * 60 * 1000);
    const resetStr = resetTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    return {
      allowed: false,
      remaining: 0,
      message: `You've reached the limit of ${MAX_QUERIES_PER_HOUR} queries per hour. Your limit resets around ${resetStr}.\n\nIn the meantime, you can use the app directly at <https://app.use60.com|app.use60.com>.`,
    };
  }

  // Warn at 80% usage
  if (remaining <= Math.floor(MAX_QUERIES_PER_HOUR * 0.2)) {
    console.log(`[rateLimiter] User ${userId} approaching rate limit: ${remaining} remaining`);
  }

  return { allowed: true, remaining };
}

/**
 * Track copilot query usage for analytics and billing.
 */
export async function trackUsage(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  intentType: string,
  responseTimeMs: number
): Promise<void> {
  // Credit cost varies by query type
  const creditCost = getCreditCost(intentType);

  try {
    // Track in a lightweight usage table if it exists
    await supabase.from('copilot_usage_tracking').insert({
      user_id: userId,
      org_id: orgId,
      channel: 'slack_dm',
      intent_type: intentType,
      credit_cost: creditCost,
      response_time_ms: responseTimeMs,
      created_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error && error.code === '42P01') {
        // Table doesn't exist yet — not critical
        console.log('[rateLimiter] copilot_usage_tracking table not found, skipping');
      }
    });
  } catch {
    // Non-critical
  }
}

function getCreditCost(intentType: string): number {
  // AI-intensive queries cost more
  switch (intentType) {
    case 'action_request': return 3; // Draft generation uses AI
    case 'coaching_query': return 2; // May use AI for objection advice
    case 'general_chat': return 1;
    default: return 1; // Data lookups are cheap
  }
}

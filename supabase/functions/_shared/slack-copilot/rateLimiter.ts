// supabase/functions/_shared/slack-copilot/rateLimiter.ts
// Rate limiting and usage tracking for Slack copilot (PRD-22, CONV-009)

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const MAX_QUERIES_PER_HOUR = 30;

export const INTENT_CREDIT_COSTS: Record<string, number> = {
  // Simple lookups
  metrics_query: 0.2,
  help: 0.05,
  feedback: 0.05,
  clarification_needed: 0.05,

  // Medium queries
  deal_query: 0.5,
  contact_query: 0.4,
  pipeline_query: 0.3,
  risk_query: 0.4,
  general: 0.3,

  // RAG-powered queries
  history_query: 1.2,
  coaching_query: 1.0,
  competitive_query: 0.8,

  // Actions (most expensive)
  draft_email: 1.5,
  draft_check_in: 1.2,
  update_crm: 0.2,
  create_task: 0.2,
  trigger_prep: 0.3,
  trigger_enrichment: 0.3,
  schedule_meeting: 0.2,
};

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

export interface CreditBudgetResult {
  allowed: boolean;
  creditsUsed: number;
  dailyLimit: number;
  warningMessage?: string;
}

/**
 * Check whether the user is within their daily credit budget.
 * This is an additional check on top of the per-hour query rate limit.
 */
export async function checkCreditBudget(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  intent: string
): Promise<CreditBudgetResult> {
  const DAILY_LIMIT = 50; // credits per day

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let creditsUsed = 0;

  try {
    const { data, error } = await supabase
      .from('slack_copilot_analytics')
      .select('credits_consumed')
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString());

    if (error) {
      if (error.code === '42P01') {
        // Table doesn't exist yet — not critical, allow through
        console.log('[rateLimiter] slack_copilot_analytics table not found, skipping budget check');
      } else {
        console.warn('[rateLimiter] Error fetching credit usage:', error);
      }
      return { allowed: true, creditsUsed: 0, dailyLimit: DAILY_LIMIT };
    }

    creditsUsed = (data || []).reduce((sum, row) => sum + (row.credits_consumed || 0), 0);
  } catch (err) {
    console.warn('[rateLimiter] Unexpected error in checkCreditBudget:', err);
    return { allowed: true, creditsUsed: 0, dailyLimit: DAILY_LIMIT };
  }

  const intentCost = INTENT_CREDIT_COSTS[intent] ?? 0.5;

  // At 100% — only allow cheap queries (cost <= 0.3)
  if (creditsUsed >= DAILY_LIMIT) {
    const isCheapQuery = intentCost <= 0.3;
    return {
      allowed: isCheapQuery,
      creditsUsed,
      dailyLimit: DAILY_LIMIT,
      warningMessage: isCheapQuery ? undefined : 'daily_limit_reached',
    };
  }

  // At 85% — warn but allow
  if (creditsUsed >= DAILY_LIMIT * 0.85) {
    return {
      allowed: true,
      creditsUsed,
      dailyLimit: DAILY_LIMIT,
      warningMessage: 'approaching_limit',
    };
  }

  return { allowed: true, creditsUsed, dailyLimit: DAILY_LIMIT };
}

/**
 * Return the credit cost for a given intent type.
 */
export function getCreditCost(intent: string): number {
  return INTENT_CREDIT_COSTS[intent] ?? 0.5;
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
    const { error } = await supabase.from('copilot_usage_tracking').insert({
      user_id: userId,
      org_id: orgId,
      channel: 'slack_dm',
      intent_type: intentType,
      credit_cost: creditCost,
      response_time_ms: responseTimeMs,
      created_at: new Date().toISOString(),
    });

    if (error && error.code === '42P01') {
      // Table doesn't exist yet — not critical
      console.log('[rateLimiter] copilot_usage_tracking table not found, skipping');
    }
  } catch {
    // Non-critical
  }
}

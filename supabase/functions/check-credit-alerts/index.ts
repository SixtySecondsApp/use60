/// <reference path="../deno.d.ts" />

/**
 * Check Credit Alerts Edge Function
 *
 * Evaluates 6 proactive credit alert conditions for a user/org and returns
 * any alerts that should be surfaced. Each alert type has a cooldown window
 * to prevent spamming. Results are logged to credit_alert_log.
 *
 * POST /check-credit-alerts
 * Body: { org_id: string, user_id: string }
 *
 * Deployed with --no-verify-jwt (internal cron/copilot call).
 * Validates Authorization header internally.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ---------------------------------------------------------------------------
// Alert type definitions with cooldown windows (in hours)
// ---------------------------------------------------------------------------

interface AlertDefinition {
  type: string;
  cooldownHours: number;
  priority: number; // lower = higher priority
}

const ALERT_DEFINITIONS: AlertDefinition[] = [
  { type: 'negative_balance',        cooldownHours: 1,    priority: 1 },
  { type: 'budget_cap_hit',          cooldownHours: 6,    priority: 2 },
  { type: 'low_balance_10cr',        cooldownHours: 12,   priority: 3 },
  { type: 'low_balance_20pct',       cooldownHours: 24,   priority: 4 },
  { type: 'tier_upgrade_suggestion', cooldownHours: 168,  priority: 5 }, // 7 days
  { type: 'weekly_digest',           cooldownHours: 168,  priority: 6 }, // 7 days
];

interface FiredAlert {
  alert_type: string;
  message: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Cooldown check — returns alert types NOT in cooldown
// ---------------------------------------------------------------------------

async function getAlertTypesNotInCooldown(
  client: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
): Promise<Set<string>> {
  const eligible = new Set<string>();

  for (const def of ALERT_DEFINITIONS) {
    const cooldownCutoff = new Date(Date.now() - def.cooldownHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await client
      .from('credit_alert_log')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('alert_type', def.type)
      .gte('alerted_at', cooldownCutoff)
      .limit(1);

    if (error) {
      // If table doesn't exist yet, treat all as eligible
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        return new Set(ALERT_DEFINITIONS.map(d => d.type));
      }
      console.warn(`[check-credit-alerts] Cooldown check error for ${def.type}:`, error.message);
      continue; // Skip this type on error — conservative
    }

    if (!data || data.length === 0) {
      eligible.add(def.type);
    }
  }

  return eligible;
}

// ---------------------------------------------------------------------------
// Individual alert evaluators
// ---------------------------------------------------------------------------

async function evaluateNegativeBalance(
  client: ReturnType<typeof createClient>,
  orgId: string,
  balance: number,
): Promise<FiredAlert | null> {
  if (balance >= 0) return null;

  // Find the most recent credit_log entry to identify last action
  const { data: lastLog } = await client
    .from('credit_logs')
    .select('display_name')
    .eq('org_id', orgId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1);

  const lastAction = lastLog?.[0]?.display_name || 'a recent action';

  return {
    alert_type: 'negative_balance',
    message: `Your account went negative by ${Math.abs(balance).toFixed(1)} credits to complete ${lastAction}. This will be recovered from your next top-up.`,
    data: { balance, last_action: lastAction },
  };
}

function evaluateLowBalance10cr(
  balance: number,
  estimatedNextCost: number,
): FiredAlert | null {
  if (balance >= 10) return null;

  return {
    alert_type: 'low_balance_10cr',
    message: `You're down to ${balance.toFixed(1)} credits. Your next meeting will cost ~${estimatedNextCost.toFixed(1)} credits to process. Consider topping up.`,
    data: { balance, estimated_cost: estimatedNextCost },
  };
}

async function evaluateLowBalance20pct(
  client: ReturnType<typeof createClient>,
  orgId: string,
  balance: number,
): Promise<FiredAlert | null> {
  // Find the most recent credit pack to determine the "last top-up amount"
  const { data: latestPack } = await client
    .from('credit_packs')
    .select('credits_purchased')
    .eq('org_id', orgId)
    .order('purchased_at', { ascending: false })
    .limit(1);

  if (!latestPack || latestPack.length === 0) return null;

  const lastTopUp = Number(latestPack[0].credits_purchased);
  if (lastTopUp <= 0) return null;

  const threshold = lastTopUp * 0.2;
  if (balance >= threshold) return null;

  // Estimate days remaining based on 7-day burn rate
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentLogs } = await client
    .from('credit_logs')
    .select('credits_charged')
    .eq('org_id', orgId)
    .eq('status', 'completed')
    .gte('created_at', sevenDaysAgo);

  const weekTotal = (recentLogs ?? []).reduce(
    (sum: number, r: { credits_charged: number }) => sum + Number(r.credits_charged), 0
  );
  const dailyRate = weekTotal / 7;
  const daysRemaining = dailyRate > 0 ? Math.round(balance / dailyRate) : 999;

  return {
    alert_type: 'low_balance_20pct',
    message: `Heads up -- you've used 80% of your credits this period. At your current pace, you'll run out in ~${daysRemaining} days.`,
    data: { balance, last_top_up: lastTopUp, days_remaining: daysRemaining },
  };
}

async function evaluateBudgetCapHit(
  client: ReturnType<typeof createClient>,
  orgId: string,
): Promise<FiredAlert | null> {
  try {
    const { data, error } = await client.rpc('check_budget_cap', {
      p_org_id: orgId,
    });

    if (error || !data) return null;

    // allowed=true means cap not hit
    if (data.allowed !== false) return null;

    const cap = data.cap != null ? Number(data.cap) : 0;
    const capType = data.cap_type ?? 'daily';
    const resetsAt = data.resets_at ?? 'next period';

    // Count paused/blocked actions (failed credit_logs in last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await client
      .from('credit_logs')
      .select('log_id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'failed')
      .gte('created_at', oneHourAgo);

    const pausedCount = count ?? 0;

    return {
      alert_type: 'budget_cap_hit',
      message: `You've hit your ${capType} credit limit of ${cap}. ${pausedCount} scheduled actions are paused. Your cap resets ${resetsAt}.`,
      data: { cap_type: capType, cap, paused_count: pausedCount, resets_at: resetsAt },
    };
  } catch {
    return null; // Non-fatal — cap check may not exist yet
  }
}

async function evaluateWeeklyDigest(
  client: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
): Promise<FiredAlert | null> {
  // Only trigger on Monday
  const today = new Date();
  if (today.getDay() !== 1) return null;

  // Get this week's usage (Monday 00:00 UTC)
  const dayOfWeek = today.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysFromMonday);
  weekStart.setHours(0, 0, 0, 0);

  // Actually for weekly digest, we want LAST week's data
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const { data: logs } = await client
    .from('credit_logs')
    .select('action_id, display_name, credits_charged')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('created_at', lastWeekStart.toISOString())
    .lt('created_at', weekStart.toISOString());

  if (!logs || logs.length === 0) return null;

  const total = logs.reduce((sum: number, r: { credits_charged: number }) => sum + Number(r.credits_charged), 0);

  // Find top spending category/action
  const actionTotals = new Map<string, { name: string; credits: number }>();
  for (const log of logs) {
    const existing = actionTotals.get(log.action_id) ?? { name: log.display_name, credits: 0 };
    existing.credits += Number(log.credits_charged);
    actionTotals.set(log.action_id, existing);
  }

  let topCategory = 'general actions';
  let topCredits = 0;
  for (const [, v] of actionTotals) {
    if (v.credits > topCredits) {
      topCredits = v.credits;
      topCategory = v.name;
    }
  }

  return {
    alert_type: 'weekly_digest',
    message: `This week you used ${total.toFixed(1)} credits across ${logs.length} actions. Your biggest spend was ${topCategory}.`,
    data: { total_credits: total, action_count: logs.length, top_category: topCategory },
  };
}

async function evaluateTierUpgradeSuggestion(
  client: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
): Promise<FiredAlert | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get logs with intelligence_tier in the last 7 days
  const { data: logs } = await client
    .from('credit_logs')
    .select('credits_charged, intelligence_tier')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .eq('intelligence_tier', 'high')
    .gte('created_at', sevenDaysAgo);

  if (!logs || logs.length < 3) return null; // Need at least 3 high-tier actions

  const highTierCost = logs.reduce(
    (sum: number, r: { credits_charged: number }) => sum + Number(r.credits_charged), 0
  );

  // Estimate medium-tier cost: ~60% of high-tier cost (based on typical tier pricing ratios)
  const estimatedMediumCost = highTierCost * 0.6;
  const savings = highTierCost - estimatedMediumCost;

  // Only suggest if savings exceed 20% threshold
  if (estimatedMediumCost * 1.2 >= highTierCost) return null;

  return {
    alert_type: 'tier_upgrade_suggestion',
    message: `You ran ${logs.length} actions on High this week costing ${highTierCost.toFixed(1)} credits. Switching to Medium would have saved ~${savings.toFixed(1)} credits.`,
    data: {
      high_tier_count: logs.length,
      high_tier_cost: highTierCost,
      estimated_medium_cost: estimatedMediumCost,
      estimated_savings: savings,
    },
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // Validate internal auth — this function is deployed with --no-verify-jwt
    // so we validate the Authorization header manually
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401);
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);

    if (authError || !user) {
      return errorResponse('Invalid authentication', req, 401);
    }

    // Parse body
    const body = await req.json();
    const { org_id, user_id } = body;

    if (!org_id || !user_id) {
      return errorResponse('org_id and user_id are required', req, 400);
    }

    // Verify the authenticated user matches user_id (or is calling for themselves)
    if (user.id !== user_id) {
      return errorResponse('user_id does not match authenticated user', req, 403);
    }

    // 1. Get current balance
    const { data: balanceData } = await serviceClient
      .from('org_credit_balance')
      .select('balance_credits')
      .eq('org_id', org_id)
      .maybeSingle();

    const balance = Number(balanceData?.balance_credits ?? 0);

    // 2. Check which alert types are not in cooldown
    const eligible = await getAlertTypesNotInCooldown(serviceClient, org_id, user_id);

    if (eligible.size === 0) {
      return jsonResponse({ alerts: [] }, req);
    }

    // 3. Estimate next action cost (use a reasonable default)
    const estimatedNextCost = 2.5; // ~median copilot action cost

    // 4. Evaluate all alert conditions in parallel
    const evaluations = await Promise.allSettled([
      eligible.has('negative_balance')
        ? evaluateNegativeBalance(serviceClient, org_id, balance)
        : null,
      eligible.has('low_balance_10cr')
        ? Promise.resolve(evaluateLowBalance10cr(balance, estimatedNextCost))
        : null,
      eligible.has('low_balance_20pct')
        ? evaluateLowBalance20pct(serviceClient, org_id, balance)
        : null,
      eligible.has('budget_cap_hit')
        ? evaluateBudgetCapHit(serviceClient, org_id)
        : null,
      eligible.has('weekly_digest')
        ? evaluateWeeklyDigest(serviceClient, org_id, user_id)
        : null,
      eligible.has('tier_upgrade_suggestion')
        ? evaluateTierUpgradeSuggestion(serviceClient, org_id, user_id)
        : null,
    ]);

    // Collect fired alerts
    const alerts: FiredAlert[] = [];
    for (const result of evaluations) {
      if (result.status === 'fulfilled' && result.value) {
        alerts.push(result.value);
      } else if (result.status === 'rejected') {
        console.warn('[check-credit-alerts] Alert evaluation failed:', result.reason);
      }
    }

    // 5. Log fired alerts to credit_alert_log
    if (alerts.length > 0) {
      const rows = alerts.map(a => ({
        org_id,
        user_id,
        alert_type: a.alert_type,
        data: a.data,
      }));

      const { error: insertError } = await serviceClient
        .from('credit_alert_log')
        .insert(rows);

      if (insertError) {
        console.warn('[check-credit-alerts] Failed to log alerts:', insertError.message);
        // Non-fatal — still return alerts
      }
    }

    return jsonResponse({ alerts }, req);
  } catch (error) {
    console.error('[check-credit-alerts] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, req, 500);
  }
});

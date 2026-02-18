/**
 * Cost Tracking Helper for Edge Functions
 *
 * Use this in edge functions to log AI costs automatically.
 * Costs are now stored in credit units (1 credit ≈ $0.10 USD).
 * Uses FIFO pack deduction via deduct_credits_fifo().
 */

import { getActionCost, type IntelligenceTier } from './creditPacks.ts';

// ---------------------------------------------------------------------------
// Intelligence tier lookup
// ---------------------------------------------------------------------------

/**
 * Fetches the intelligence tier configured for a specific feature in this org.
 * Returns 'medium' as the safe default if nothing is configured.
 */
async function getOrgIntelligenceTier(
  supabaseClient: any,
  orgId: string,
  featureKey: string,
): Promise<IntelligenceTier> {
  try {
    const { data } = await supabaseClient
      .from('ai_feature_config')
      .select('intelligence_tier')
      .eq('org_id', orgId)
      .eq('feature_key', featureKey)
      .maybeSingle();

    const tier = data?.intelligence_tier as IntelligenceTier | undefined;
    if (tier === 'low' || tier === 'medium' || tier === 'high') return tier;
  } catch {
    // Silently fall through to default
  }
  return 'medium';
}

// ---------------------------------------------------------------------------
// Auto top-up check helper
// ---------------------------------------------------------------------------

/**
 * After a credit deduction, checks if the new balance is below the auto top-up
 * threshold and enqueues a top-up if conditions are met.
 * Fire-and-forget: does not throw on failure.
 */
async function maybeEnqueueAutoTopUp(
  supabaseClient: any,
  orgId: string,
  newBalance: number,
): Promise<void> {
  try {
    const { data: settings } = await supabaseClient
      .from('auto_top_up_settings')
      .select('enabled, threshold, pack_type, monthly_cap, stripe_payment_method_id')
      .eq('org_id', orgId)
      .maybeSingle();

    if (!settings?.enabled || !settings.stripe_payment_method_id) return;
    if (newBalance > (settings.threshold ?? 10)) return;

    // Check how many top-ups have already occurred this calendar month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count } = await supabaseClient
      .from('auto_top_up_log')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'success')
      .gte('triggered_at', monthStart.toISOString());

    if ((count ?? 0) >= (settings.monthly_cap ?? 3)) {
      // Monthly cap reached — insert a 'capped' log entry so admins can see it
      await supabaseClient.from('auto_top_up_log').insert({
        org_id: orgId,
        trigger_balance: newBalance,
        pack_type: settings.pack_type,
        status: 'capped',
        error_message: `Monthly auto top-up cap of ${settings.monthly_cap} reached`,
      });
      return;
    }

    // Invoke the auto top-up edge function asynchronously
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) return;

    // Fire-and-forget: don't await the fetch so we don't block the main path
    fetch(`${supabaseUrl}/functions/v1/credit-auto-topup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ org_id: orgId, trigger_balance: newBalance }),
    }).catch((err) => {
      console.warn('[CostTracking] Auto top-up enqueue failed (non-fatal):', err);
    });
  } catch (err) {
    // Non-fatal — never block the original deduction path
    if (err instanceof Error && !err.message.includes('relation') && !err.message.includes('does not exist')) {
      console.warn('[CostTracking] maybeEnqueueAutoTopUp error:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Shared deduction helper
// ---------------------------------------------------------------------------

async function deductAndMaybeTopUp(
  supabaseClient: any,
  orgId: string,
  creditAmount: number,
  description: string,
  featureKey: string | null,
  costEventId: string | null,
): Promise<void> {
  if (creditAmount <= 0) return;
  try {
    const { data: newBalance, error: deductError } = await supabaseClient.rpc('deduct_credits_fifo', {
      p_org_id: orgId,
      p_amount: creditAmount,
      p_description: description,
      p_feature_key: featureKey,
      p_cost_event_id: costEventId,
    });

    if (deductError) {
      if (
        !deductError.message.includes('relation') &&
        !deductError.message.includes('does not exist') &&
        !deductError.message.includes('function')
      ) {
        console.warn('[CostTracking] FIFO credit deduction error:', deductError);
      }
      return;
    }

    // newBalance is the remaining balance after deduction (or -1 for insufficient)
    if (typeof newBalance === 'number' && newBalance >= 0) {
      await maybeEnqueueAutoTopUp(supabaseClient, orgId, newBalance);
    }
  } catch (err) {
    if (err instanceof Error && !err.message.includes('relation') && !err.message.includes('does not exist')) {
      console.warn('[CostTracking] deductAndMaybeTopUp exception:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// logAICostEvent — token-based AI calls (Anthropic, Gemini, etc.)
// ---------------------------------------------------------------------------

/**
 * Log AI cost event from an edge function.
 * Determines credit cost by feature_key + org intelligence tier from ACTION_CREDIT_COSTS.
 * Calls deduct_credits_fifo() for FIFO pack consumption.
 */
export async function logAICostEvent(
  supabaseClient: any,
  userId: string,
  orgId: string | null,
  provider: 'anthropic' | 'gemini' | 'openrouter' | 'exa',
  model: string,
  inputTokens: number,
  outputTokens: number,
  feature?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    // If no orgId provided, try to get it from user
    if (!orgId) {
      const { data: membership } = await supabaseClient
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      orgId = membership?.org_id || null;
    }

    if (!orgId) {
      console.warn('[CostTracking] No org_id found for user, skipping cost log');
      return;
    }

    // Determine credit cost using feature key + org intelligence tier
    const tier = await getOrgIntelligenceTier(supabaseClient, orgId, feature ?? 'copilot_chat');
    const creditCost = getActionCost(feature ?? 'copilot_chat', tier);

    // Log to ai_cost_events table (estimated_cost now stores credit units)
    const { data: insertedCostEvent, error: insertError } = await supabaseClient
      .from('ai_cost_events')
      .insert({
        org_id: orgId,
        user_id: userId,
        provider,
        model,
        feature: feature || null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost: creditCost,
        metadata: metadata || null,
      })
      .select('id')
      .single();

    if (insertError) {
      if (!insertError.message.includes('relation') && !insertError.message.includes('does not exist')) {
        console.warn('[CostTracking] Error logging cost event:', insertError);
      }
    }

    // FIFO credit deduction
    await deductAndMaybeTopUp(
      supabaseClient,
      orgId,
      creditCost,
      `AI usage: ${feature || 'unknown'} [${tier}]`,
      feature || null,
      insertedCostEvent?.id ?? null,
    );
  } catch (err) {
    if (err instanceof Error && !err.message.includes('relation') && !err.message.includes('does not exist')) {
      console.warn('[CostTracking] Error in cost logging:', err);
    }
  }
}

/**
 * Extract token usage from Anthropic API response
 */
export function extractAnthropicUsage(response: any): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };
}

/**
 * Extract token usage from Gemini API response
 */
export function extractGeminiUsage(response: any): { inputTokens: number; outputTokens: number } {
  const usageMetadata = response.usageMetadata || {};
  return {
    inputTokens: usageMetadata.promptTokenCount || 0,
    outputTokens: usageMetadata.candidatesTokenCount || 0,
  };
}

/**
 * Log a flat-rate cost event (non-token-based providers like Exa, Apollo, AI Ark).
 * Inserts into ai_cost_events for analytics and calls deduct_credits_fifo for balance.
 *
 * @param creditAmount - Credit units to deduct (e.g. 0.3 for an Apollo search)
 */
export async function logFlatRateCostEvent(
  supabaseClient: any,
  userId: string,
  orgId: string,
  provider: string,
  model: string,
  creditAmount: number,
  feature?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    // Log to ai_cost_events for usage analytics (estimated_cost = credit units)
    const { data: insertedCostEvent, error: insertError } = await supabaseClient
      .from('ai_cost_events')
      .insert({
        org_id: orgId,
        user_id: userId,
        provider,
        model,
        feature: feature || null,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost: creditAmount,
        metadata: metadata || null,
      })
      .select('id')
      .single();

    if (insertError) {
      if (!insertError.message.includes('relation') && !insertError.message.includes('does not exist')) {
        console.warn('[CostTracking] Flat rate cost event insert error:', insertError);
      }
    }

    // FIFO credit deduction
    await deductAndMaybeTopUp(
      supabaseClient,
      orgId,
      creditAmount,
      `${provider} usage: ${feature || 'unknown'}`,
      feature || null,
      insertedCostEvent?.id ?? null,
    );
  } catch (err) {
    if (err instanceof Error && !err.message.includes('relation') && !err.message.includes('does not exist')) {
      console.warn('[CostTracking] Flat rate cost logging exception:', err);
    }
  }
}

// =============================================================================
// Agent Budget Enforcement
// =============================================================================

export interface BudgetCheckResult {
  allowed: boolean;
  todaySpend: number;
  budgetLimit: number;
  message?: string;
}

/**
 * Check if an agent call is within the org's daily budget.
 * budgetLimitCredits is in credit units (e.g. 50 = 50 credits).
 * Returns { allowed: true } if under budget or if tracking isn't set up.
 */
export async function checkAgentBudget(
  supabaseClient: any,
  orgId: string,
  budgetLimitCredits: number
): Promise<BudgetCheckResult> {
  try {
    // Query today's total AI cost for this org (in credit units)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabaseClient
      .from('ai_cost_events')
      .select('estimated_cost')
      .eq('org_id', orgId)
      .gte('created_at', todayStart.toISOString());

    if (error) {
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        return { allowed: true, todaySpend: 0, budgetLimit: budgetLimitCredits };
      }
      console.warn('[CostTracking] Budget check error:', error);
      return { allowed: true, todaySpend: 0, budgetLimit: budgetLimitCredits };
    }

    const todaySpend = (data || []).reduce(
      (sum: number, row: { estimated_cost: number | null }) =>
        sum + (row.estimated_cost || 0),
      0
    );

    if (todaySpend >= budgetLimitCredits) {
      return {
        allowed: false,
        todaySpend,
        budgetLimit: budgetLimitCredits,
        message: `Daily AI budget limit reached (${todaySpend.toFixed(1)} of ${budgetLimitCredits.toFixed(1)} credits). Multi-agent mode will resume tomorrow. You can still use single-agent mode.`,
      };
    }

    return { allowed: true, todaySpend, budgetLimit: budgetLimitCredits };
  } catch (err) {
    console.warn('[CostTracking] Budget check exception:', err);
    return { allowed: true, todaySpend: 0, budgetLimit: budgetLimitCredits };
  }
}

// =============================================================================
// Credit Balance Check
// =============================================================================

export interface CreditCheckResult {
  allowed: boolean;
  balance: number;
  message?: string;
}

/**
 * Check if an org has sufficient AI credits.
 * Returns allowed=true if credits available OR if credit system isn't set up (backward compat).
 */
export async function checkCreditBalance(
  supabaseClient: any,
  orgId: string
): Promise<CreditCheckResult> {
  try {
    const { data, error } = await supabaseClient
      .from('org_credit_balance')
      .select('balance_credits')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) {
      // If table doesn't exist, allow (backward compat)
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        return { allowed: true, balance: 0 };
      }
      console.warn('[CostTracking] Credit check error:', error);
      return { allowed: true, balance: 0 };
    }

    // No balance row = org hasn't been migrated to credit system yet -> allow
    if (!data) {
      return { allowed: true, balance: 0 };
    }

    const balance = data.balance_credits || 0;

    if (balance <= 0) {
      return {
        allowed: false,
        balance,
        message: 'Your organization has run out of AI credits. Please top up to continue.',
      };
    }

    return { allowed: true, balance };
  } catch (err) {
    console.warn('[CostTracking] Credit check exception:', err);
    return { allowed: true, balance: 0 };
  }
}

// =============================================================================
// AR Budget Check (Autonomous Research / Proactive Agents)
// =============================================================================

export interface ArBudgetCheckResult {
  allowed: boolean;
  usedThisMonth: number;
  cap: number | null;
  reason?: string;
}

/**
 * Pre-flight check for autonomous-research agent runs.
 * Calls the check_ar_budget() RPC which enforces monthly credit caps.
 * Returns allowed=true if under budget or if tracking isn't set up.
 */
export async function checkArBudget(
  supabaseClient: any,
  orgId: string
): Promise<ArBudgetCheckResult> {
  try {
    const { data, error } = await supabaseClient.rpc('check_ar_budget', {
      p_org_id: orgId,
    });

    if (error) {
      if (error.message.includes('relation') || error.message.includes('does not exist') || error.message.includes('function')) {
        return { allowed: true, usedThisMonth: 0, cap: null };
      }
      console.warn('[CostTracking] AR budget check error:', error);
      return { allowed: true, usedThisMonth: 0, cap: null };
    }

    return {
      allowed: data?.allowed ?? true,
      usedThisMonth: data?.used_this_month ?? 0,
      cap: data?.cap ?? null,
      reason: data?.reason,
    };
  } catch (err) {
    console.warn('[CostTracking] AR budget check exception:', err);
    return { allowed: true, usedThisMonth: 0, cap: null };
  }
}










/**
 * Cost Tracking Helper for Edge Functions
 *
 * Use this in edge functions to log AI costs automatically.
 * Costs are now stored in credit units (1 credit ≈ $0.10 USD).
 * Uses ordered credit deduction via deduct_credits_ordered() (subscription → onboarding → packs).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getActionCost, deductCreditsOrdered, type IntelligenceTier } from './creditPacks.ts';

// ---------------------------------------------------------------------------
// CreditLogContext — optional audit context for credit_logs writes
// ---------------------------------------------------------------------------

export interface CreditLogContext {
  source?: 'user_initiated' | 'agent_automated' | 'sequence_step' | 'scheduled';
  agentType?: string;
  contextSummary?: string;
  contextRefs?: Record<string, unknown>;
}

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
// DB-backed action cost lookup (falls back to hardcoded table)
// ---------------------------------------------------------------------------

async function getActionCostFromDB(
  supabaseClient: any,
  actionId: string,
  tier: IntelligenceTier
): Promise<number> {
  try {
    const { data, error } = await supabaseClient.rpc('get_action_credit_cost', {
      p_action_id: actionId,
      p_tier: tier,
    });
    if (!error && typeof data === 'number' && data >= 0) return data;
  } catch {
    // Fall through to hardcoded fallback
  }
  return getActionCost(actionId, tier);
}

// ---------------------------------------------------------------------------
// credit_logs write helper — fire-and-forget, never throws
// ---------------------------------------------------------------------------

async function writeCreditLog(
  supabaseClient: any,
  params: {
    userId: string;
    orgId: string;
    actionId: string;
    displayName: string;
    creditsCharged: number;
    tier: IntelligenceTier;
    balanceBefore: number;
    balanceAfter: number;
    logContext?: CreditLogContext;
  }
): Promise<void> {
  try {
    await supabaseClient.from('credit_logs').insert({
      user_id: params.userId,
      org_id: params.orgId,
      action_id: params.actionId,
      display_name: params.displayName,
      credits_charged: params.creditsCharged,
      intelligence_tier: params.tier,
      balance_before: params.balanceBefore,
      balance_after: params.balanceAfter,
      context_summary: params.logContext?.contextSummary ?? null,
      context_refs: params.logContext?.contextRefs ?? {},
      source: params.logContext?.source ?? 'agent_automated',
      agent_type: params.logContext?.agentType ?? null,
      status: 'completed',
    });
  } catch (err) {
    // NEVER block the main charge path — log warning only
    console.warn('[CostTracking] credit_logs write failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Budget Cap Check (credit_budget_caps)
// ---------------------------------------------------------------------------

export interface BudgetCapResult {
  allowed: boolean;
  spent: number;
  cap: number | null;
  capType: 'daily' | 'weekly' | 'unlimited';
  resetsAt: string | null;
}

/**
 * Check if the org is within its configured budget cap.
 * Calls the check_budget_cap RPC. If no cap is configured (no row), treats as unlimited.
 * Never throws — returns allowed=true on any error (backward compat).
 */
export async function checkBudgetCap(
  client: any,
  orgId: string
): Promise<BudgetCapResult> {
  const unlimitedDefault: BudgetCapResult = {
    allowed: true,
    spent: 0,
    cap: null,
    capType: 'unlimited',
    resetsAt: null,
  };

  try {
    const { data, error } = await client.rpc('check_budget_cap', {
      p_org_id: orgId,
    });

    if (error) {
      if (
        error.message.includes('relation') ||
        error.message.includes('does not exist') ||
        error.message.includes('function')
      ) {
        return unlimitedDefault;
      }
      console.warn('[CostTracking] check_budget_cap RPC error:', error);
      return unlimitedDefault;
    }

    // No row returned means no cap configured — treat as unlimited
    if (!data) {
      return unlimitedDefault;
    }

    const capType = data.cap_type as BudgetCapResult['capType'] ?? 'unlimited';

    // cap_type='unlimited' always allows
    if (capType === 'unlimited') {
      return {
        allowed: true,
        spent: Number(data.spent) || 0,
        cap: data.cap != null ? Number(data.cap) : null,
        capType: 'unlimited',
        resetsAt: data.resets_at ?? null,
      };
    }

    return {
      allowed: data.allowed ?? true,
      spent: Number(data.spent) || 0,
      cap: data.cap != null ? Number(data.cap) : null,
      capType,
      resetsAt: data.resets_at ?? null,
    };
  } catch (err) {
    console.warn('[CostTracking] checkBudgetCap exception:', err);
    return unlimitedDefault;
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
  userId?: string,
  actionId?: string,
  displayName?: string,
  tier?: IntelligenceTier,
  logContext?: CreditLogContext,
): Promise<{ blocked?: boolean; blockReason?: string }> {
  if (creditAmount <= 0) return {};
  try {
    // Budget cap pre-flight check
    const capResult = await checkBudgetCap(supabaseClient, orgId);
    if (!capResult.allowed) {
      // Log a failed credit_logs entry so admins can see blocked actions
      if (userId && actionId) {
        try {
          await supabaseClient.from('credit_logs').insert({
            user_id: userId,
            org_id: orgId,
            action_id: actionId,
            display_name: displayName ?? actionId,
            credits_charged: creditAmount,
            intelligence_tier: tier ?? 'medium',
            balance_before: 0,
            balance_after: 0,
            context_summary: 'Blocked by budget cap',
            context_refs: logContext?.contextRefs ?? {},
            source: logContext?.source ?? 'agent_automated',
            agent_type: logContext?.agentType ?? null,
            status: 'failed',
          });
        } catch (logErr) {
          console.warn('[CostTracking] Failed to write blocked credit_log entry:', logErr instanceof Error ? logErr.message : logErr);
        }
      }
      return {
        blocked: true,
        blockReason: `Budget cap exceeded (${capResult.spent.toFixed(1)}/${capResult.cap?.toFixed(1) ?? '∞'} credits, resets ${capResult.resetsAt ?? 'N/A'})`,
      };
    }

    // Fetch balance before deduction for credit_logs audit trail
    let balanceBefore = 0;
    try {
      const { data: bal } = await supabaseClient
        .from('org_credit_balance')
        .select('balance_credits')
        .eq('org_id', orgId)
        .maybeSingle();
      balanceBefore = bal?.balance_credits ?? 0;
    } catch { /* non-fatal */ }

    const { success: deductSuccess, newBalance } = await deductCreditsOrdered(
      supabaseClient,
      orgId,
      creditAmount,
      actionId,
      tier ?? 'medium',
      {
        description,
        feature_key: featureKey,
        cost_event_id: costEventId,
      },
    );

    if (!deductSuccess) {
      return {};
    }

    // newBalance is the remaining balance after deduction (or -1 for insufficient)
    if (newBalance >= 0) {
      await maybeEnqueueAutoTopUp(supabaseClient, orgId, newBalance);

      // Write credit_logs audit entry if we have enough context
      if (userId && actionId) {
        await writeCreditLog(supabaseClient, {
          userId,
          orgId,
          actionId,
          displayName: displayName ?? actionId,
          creditsCharged: creditAmount,
          tier: tier ?? 'medium',
          balanceBefore,
          balanceAfter: newBalance,
          logContext,
        });
      }

      // Increment budget cap spent counter — fire-and-forget
      try {
        supabaseClient.rpc('increment_budget_spent', {
          p_org_id: orgId,
          p_amount: creditAmount,
        }).then(() => {}).catch((err: unknown) => {
          console.warn('[CostTracking] increment_budget_spent failed (non-fatal):', err);
        });
      } catch {
        // Non-fatal — never block the deduction path
      }
    }

    return {};
  } catch (err) {
    if (err instanceof Error && !err.message.includes('relation') && !err.message.includes('does not exist')) {
      console.warn('[CostTracking] deductAndMaybeTopUp exception:', err);
    }
    return {};
  }
}

// ---------------------------------------------------------------------------
// Provider cost rate lookup (service-role, bypasses RLS)
// ---------------------------------------------------------------------------

/**
 * Look up the per-million-token rates for a given provider+model from cost_rates.
 * Uses service-role client to bypass RLS. Returns null if no row found or on error.
 */
async function getProviderCostRates(
  provider: string,
  model: string,
): Promise<{ inputCostPerMillion: number; outputCostPerMillion: number } | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return null;

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data, error } = await adminClient
      .from('cost_rates')
      .select('input_cost_per_million, output_cost_per_million')
      .eq('provider', provider)
      .eq('model', model)
      .maybeSingle();

    if (error || !data) return null;

    return {
      inputCostPerMillion: Number(data.input_cost_per_million) || 0,
      outputCostPerMillion: Number(data.output_cost_per_million) || 0,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// logAICostEvent — token-based AI calls (Anthropic, Gemini, etc.)
// ---------------------------------------------------------------------------

/**
 * Log AI cost event from an edge function.
 * Determines credit cost by feature_key + org intelligence tier from ACTION_CREDIT_COSTS.
 * Calls deduct_credits_ordered() for subscription-first ordered credit consumption.
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
  metadata?: Record<string, unknown>,
  logContext?: CreditLogContext,
  sourceAgent?: string
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
    const creditCost = await getActionCostFromDB(supabaseClient, feature ?? 'copilot_chat', tier);

    // Look up actual provider cost rates to compute provider_cost_usd
    const rates = await getProviderCostRates(provider, model);
    let providerCostUsd: number | null = null;
    if (rates) {
      providerCostUsd =
        (inputTokens / 1_000_000) * rates.inputCostPerMillion +
        (outputTokens / 1_000_000) * rates.outputCostPerMillion;
    }

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
        provider_cost_usd: providerCostUsd,
        credits_charged: creditCost,
        metadata: metadata || null,
        source_agent: sourceAgent || null,
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
      userId,
      feature,
      feature,
      tier,
      logContext,
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
 * Inserts into ai_cost_events for analytics and calls deduct_credits_ordered for balance.
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
  metadata?: Record<string, unknown>,
  logContext?: CreditLogContext
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
        provider_cost_usd: null,
        credits_charged: creditAmount,
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
      userId,
      feature,
      `${provider} ${feature || 'unknown'}`,
      undefined,
      logContext,
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
  inGrace?: boolean;
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
      .select('balance_credits, grace_threshold_credits')
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
    const graceThreshold = data.grace_threshold_credits ?? 10;

    // Match DB deduct_credits_fifo: blocks when new_balance < -threshold (strict less-than)
    if (balance < -graceThreshold) {
      return {
        allowed: false,
        balance,
        message: 'Credit balance exceeds grace threshold. Please top up.',
      };
    }

    if (balance < 0) {
      return {
        allowed: true,
        balance,
        inGrace: true,
        message: `Balance is ${balance.toFixed(2)} credits (in grace zone).`,
      };
    }

    return { allowed: true, balance, inGrace: false };
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










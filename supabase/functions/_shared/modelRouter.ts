// supabase/functions/_shared/modelRouter.ts
// Core model resolution and circuit breaker for V2 Architecture Foundations.
//
// Usage:
//   import { resolveModel, recordSuccess, recordFailure } from './modelRouter.ts';
//
//   const resolution = await resolveModel(supabase, {
//     feature: 'copilot',
//     userId: user.id,
//     orgId: org.id,
//     traceId: logger.trace_id,
//   });
//   // ... call provider ...
//   await recordSuccess(supabase, resolution.modelId);
//   // or on failure:
//   await recordFailure(supabase, resolution.modelId);

import { createLogger } from './logger.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Feature = 'copilot' | 'fleet_agent' | 'recording' | 'embedding' | 'enrichment';
export type IntelligenceTier = 'low' | 'medium' | 'high';

export interface ModelRequest {
  feature: Feature;
  /** If omitted, reads from org-level ai_feature_config. Falls back to 'medium'. */
  intelligenceTier?: IntelligenceTier;
  userId: string;
  orgId: string;
  traceId?: string;
}

export interface ModelResolution {
  provider: string;
  modelId: string;
  creditCost: number;
  maxTokens: number;
  /** True when the primary model was circuit-broken and a fallback was used. */
  wasFallback: boolean;
  traceId: string;
}

// ---------------------------------------------------------------------------
// Internal DB row shapes
// ---------------------------------------------------------------------------

interface ModelConfigRow {
  id: string;
  provider: string;
  model_id: string;
  intelligence_tier: IntelligenceTier;
  feature: Feature;
  is_primary: boolean;
  is_fallback: boolean;
  fallback_order: number;
  credit_cost: number;
  max_tokens: number;
  is_active: boolean;
}

interface ModelHealthRow {
  model_id: string;
  failure_count: number;
  last_failure_at: string | null;
  window_start: string | null;
  is_circuit_open: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of failures within the window before the circuit opens. */
const CIRCUIT_FAILURE_THRESHOLD = 3;

/** Width of the sliding failure window in milliseconds (5 minutes). */
const CIRCUIT_WINDOW_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the intelligence tier for a given org + feature from ai_feature_config.
 * Returns 'medium' if no config row exists or on any error.
 */
async function resolveIntelligenceTier(
  supabase: any,
  orgId: string,
  feature: Feature,
): Promise<IntelligenceTier> {
  try {
    const { data } = await supabase
      .from('ai_feature_config')
      .select('intelligence_tier')
      .eq('org_id', orgId)
      .eq('feature_key', feature)
      .maybeSingle();

    const tier = data?.intelligence_tier as IntelligenceTier | undefined;
    if (tier === 'low' || tier === 'medium' || tier === 'high') return tier;
  } catch {
    // Silently fall through to default
  }
  return 'medium';
}

/**
 * Fetch the model_health row for a given model_id.
 * Returns null if no row exists (treat as healthy).
 */
async function fetchModelHealth(
  supabase: any,
  modelId: string,
): Promise<ModelHealthRow | null> {
  try {
    const { data, error } = await supabase
      .from('model_health')
      .select('model_id, failure_count, last_failure_at, window_start, is_circuit_open')
      .eq('model_id', modelId)
      .maybeSingle();

    if (error) {
      console.warn('[modelRouter] model_health fetch error:', error.message);
      return null;
    }
    return data ?? null;
  } catch (err) {
    console.warn('[modelRouter] model_health fetch exception:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Determine whether a model is currently circuit-broken.
 *
 * Half-open logic: if the circuit is marked open but last_failure_at is
 * older than CIRCUIT_WINDOW_MS, we allow one probe request to pass through
 * (the caller handles returning wasFallback=false in that case).
 *
 * Returns:
 *  'open'      — circuit is open and still within the failure window → skip
 *  'half-open' — circuit was open but the window has expired → allow probe
 *  'closed'    — circuit is healthy → use this model
 */
function evaluateCircuitState(
  health: ModelHealthRow | null,
): 'open' | 'half-open' | 'closed' {
  if (!health || !health.is_circuit_open) return 'closed';

  if (health.last_failure_at) {
    const lastFailureMs = new Date(health.last_failure_at).getTime();
    const ageMs = Date.now() - lastFailureMs;
    if (ageMs > CIRCUIT_WINDOW_MS) {
      // Window has expired — allow a probe request
      return 'half-open';
    }
  }

  return 'open';
}

// ---------------------------------------------------------------------------
// resolveModel
// ---------------------------------------------------------------------------

/**
 * Resolve the best available model for a given feature and org.
 *
 * Resolution order:
 *  1. Determine intelligence tier (from request or org config).
 *  2. Query primary model (is_primary=true, is_active=true, matching tier+feature).
 *  3. Check circuit state — if open, skip to fallbacks.
 *  4. If half-open, return primary as probe (wasFallback=false).
 *  5. Try each fallback in fallback_order, skipping circuit-open ones.
 *  6. If no model available, throw.
 */
export async function resolveModel(
  supabase: any,
  request: ModelRequest,
): Promise<ModelResolution> {
  const traceId = request.traceId ?? crypto.randomUUID();
  const logger = createLogger('model-router', {
    traceId,
    userId: request.userId,
    orgId: request.orgId,
  });

  const span = logger.createSpan('resolve_model', { feature: request.feature });

  try {
    // Step 1: Determine intelligence tier
    const tier = request.intelligenceTier
      ?? await resolveIntelligenceTier(supabase, request.orgId, request.feature);

    logger.info('model_router.tier_resolved', { feature: request.feature, tier });

    // Step 2: Fetch primary model
    const { data: primaryRows, error: primaryError } = await supabase
      .from('model_config')
      .select('id, provider, model_id, intelligence_tier, feature, is_primary, is_fallback, fallback_order, credit_cost, max_tokens, is_active')
      .eq('feature', request.feature)
      .eq('intelligence_tier', tier)
      .eq('is_primary', true)
      .eq('is_active', true)
      .limit(1);

    if (primaryError) {
      throw new Error(`model_config primary query failed: ${primaryError.message}`);
    }

    const primary: ModelConfigRow | undefined = (primaryRows ?? [])[0];

    // Step 3: Evaluate primary circuit state
    if (primary) {
      const primaryHealth = await fetchModelHealth(supabase, primary.model_id);
      const primaryCircuit = evaluateCircuitState(primaryHealth);

      logger.info('model_router.primary_evaluated', {
        model_id: primary.model_id,
        provider: primary.provider,
        circuit: primaryCircuit,
      });

      if (primaryCircuit === 'closed' || primaryCircuit === 'half-open') {
        // Return primary (either healthy or probe attempt)
        span.stop({
          resolved_model: primary.model_id,
          provider: primary.provider,
          was_fallback: false,
          circuit: primaryCircuit,
          tier,
        });
        await logger.flush();

        return {
          provider: primary.provider,
          modelId: primary.model_id,
          creditCost: primary.credit_cost,
          maxTokens: primary.max_tokens,
          wasFallback: false,
          traceId,
        };
      }

      logger.warn('model_router.primary_circuit_open', {
        model_id: primary.model_id,
        failure_count: primaryHealth?.failure_count,
        last_failure_at: primaryHealth?.last_failure_at,
      });
    } else {
      logger.warn('model_router.no_primary_found', { feature: request.feature, tier });
    }

    // Step 5: Query fallback models ordered by fallback_order
    const { data: fallbackRows, error: fallbackError } = await supabase
      .from('model_config')
      .select('id, provider, model_id, intelligence_tier, feature, is_primary, is_fallback, fallback_order, credit_cost, max_tokens, is_active')
      .eq('feature', request.feature)
      .eq('is_fallback', true)
      .eq('is_active', true)
      .order('fallback_order', { ascending: true });

    if (fallbackError) {
      throw new Error(`model_config fallback query failed: ${fallbackError.message}`);
    }

    const fallbacks: ModelConfigRow[] = fallbackRows ?? [];

    logger.info('model_router.fallbacks_fetched', {
      count: fallbacks.length,
      fallback_ids: fallbacks.map((f) => f.model_id),
    });

    // Step 6: Try each fallback in order
    for (const fallback of fallbacks) {
      const fallbackHealth = await fetchModelHealth(supabase, fallback.model_id);
      const fallbackCircuit = evaluateCircuitState(fallbackHealth);

      logger.info('model_router.fallback_evaluated', {
        model_id: fallback.model_id,
        provider: fallback.provider,
        fallback_order: fallback.fallback_order,
        circuit: fallbackCircuit,
      });

      if (fallbackCircuit === 'open') {
        // Skip this fallback — circuit is open
        continue;
      }

      // Found a usable fallback (closed or half-open)
      span.stop({
        resolved_model: fallback.model_id,
        provider: fallback.provider,
        was_fallback: true,
        circuit: fallbackCircuit,
        tier,
      });
      await logger.flush();

      return {
        provider: fallback.provider,
        modelId: fallback.model_id,
        creditCost: fallback.credit_cost,
        maxTokens: fallback.max_tokens,
        wasFallback: true,
        traceId,
      };
    }

    // Step 7: All models exhausted
    throw new Error(
      `No available model for feature="${request.feature}" tier="${tier}". Primary and all ${fallbacks.length} fallback(s) are circuit-open.`,
    );
  } catch (err) {
    logger.error('model_router.resolve_failed', err, { feature: request.feature });
    span.stop({ error: err instanceof Error ? err.message : String(err) });
    await logger.flush();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// recordFailure
// ---------------------------------------------------------------------------

/**
 * Record a model invocation failure.
 *
 * - Increments failure_count and sets last_failure_at=now().
 * - If this is the first failure in a new window (window_start is null or
 *   older than CIRCUIT_WINDOW_MS), resets the window and sets failure_count=1.
 * - If failure_count reaches CIRCUIT_FAILURE_THRESHOLD within the window,
 *   sets is_circuit_open=true.
 *
 * Uses an upsert so the row is created if it doesn't exist yet.
 */
export async function recordFailure(supabase: any, modelId: string): Promise<void> {
  try {
    const now = new Date();
    const nowIso = now.toISOString();

    // Fetch current health state
    const existing = await fetchModelHealth(supabase, modelId);

    let newFailureCount: number;
    let newWindowStart: string;
    let newCircuitOpen: boolean;

    if (!existing || !existing.window_start) {
      // No existing row or no active window — start fresh window
      newFailureCount = 1;
      newWindowStart = nowIso;
    } else {
      const windowStartMs = new Date(existing.window_start).getTime();
      const windowAgeMs = now.getTime() - windowStartMs;

      if (windowAgeMs > CIRCUIT_WINDOW_MS) {
        // Window expired — reset to new window
        newFailureCount = 1;
        newWindowStart = nowIso;
      } else {
        // Within active window — increment
        newFailureCount = (existing.failure_count ?? 0) + 1;
        newWindowStart = existing.window_start;
      }
    }

    newCircuitOpen = newFailureCount >= CIRCUIT_FAILURE_THRESHOLD;

    const { error } = await supabase
      .from('model_health')
      .upsert(
        {
          model_id: modelId,
          failure_count: newFailureCount,
          last_failure_at: nowIso,
          window_start: newWindowStart,
          is_circuit_open: newCircuitOpen,
        },
        { onConflict: 'model_id' },
      );

    if (error) {
      console.warn('[modelRouter] recordFailure upsert error:', error.message);
      return;
    }

    if (newCircuitOpen) {
      console.warn(
        `[modelRouter] Circuit OPENED for model="${modelId}" after ${newFailureCount} failures within window.`,
      );
    }
  } catch (err) {
    // Non-fatal — never crash the calling edge function
    console.warn('[modelRouter] recordFailure exception:', err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// recordSuccess
// ---------------------------------------------------------------------------

/**
 * Record a successful model invocation.
 * Resets the circuit: failure_count=0, is_circuit_open=false, window_start=null.
 */
export async function recordSuccess(supabase: any, modelId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('model_health')
      .upsert(
        {
          model_id: modelId,
          failure_count: 0,
          last_failure_at: null,
          window_start: null,
          is_circuit_open: false,
        },
        { onConflict: 'model_id' },
      );

    if (error) {
      console.warn('[modelRouter] recordSuccess upsert error:', error.message);
    }
  } catch (err) {
    // Non-fatal — never crash the calling edge function
    console.warn('[modelRouter] recordSuccess exception:', err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Fleet Agent Per-Run Budgets
// ---------------------------------------------------------------------------

/**
 * Per-run credit budgets for fleet agents.
 * These cap how many credits a single agent run may consume.
 */
export const FLEET_AGENT_BUDGETS: Record<string, number> = {
  'morning-briefing': 8,
  'eod-summary': 8,
  'meeting-prep': 5,
  'deal-risk-scan': 5,
  'pipeline-digest': 5,
  'coaching-prep': 5,
  'default': 10,
};

/**
 * Check whether a fleet agent has exceeded its per-run credit budget.
 *
 * @param agentName    - The agent identifier (key into FLEET_AGENT_BUDGETS).
 * @param creditsUsed  - Credits consumed so far in this run.
 * @returns { exceeded, limit, used }
 */
export function checkAgentBudget(
  agentName: string,
  creditsUsed: number,
): { exceeded: boolean; limit: number; used: number } {
  const limit = FLEET_AGENT_BUDGETS[agentName] ?? FLEET_AGENT_BUDGETS['default'];
  return {
    exceeded: creditsUsed >= limit,
    limit,
    used: creditsUsed,
  };
}

// ---------------------------------------------------------------------------
// checkBudget — org credit balance pre-flight
// ---------------------------------------------------------------------------

/** Grace threshold in credits — executions blocked when balance goes below this. */
const CREDIT_GRACE_THRESHOLD = -10;

/**
 * Check whether an org has enough credits to proceed.
 *
 * Primary: sums credit_transactions.amount for the org (positive=in, negative=out).
 * Fallback: reads the org_credit_balance view if the sum query fails.
 *
 * Grace threshold: can_proceed=true when balance > -10, false when balance <= -10.
 * Never throws — returns { remaining: 0, can_proceed: true } on any error.
 */
export async function checkBudget(
  supabase: any,
  userId: string,
  orgId: string,
): Promise<{ remaining: number; can_proceed: boolean }> {
  const logger = createLogger('model-router');

  try {
    // Primary: sum all credit_transactions for this org
    const { data: txRows, error: txError } = await supabase
      .from('credit_transactions')
      .select('amount')
      .eq('org_id', orgId);

    if (!txError && txRows != null) {
      const remaining = (txRows as { amount: number | null }[]).reduce(
        (sum, row) => sum + (Number(row.amount) || 0),
        0,
      );
      const can_proceed = remaining > CREDIT_GRACE_THRESHOLD;

      logger.info('model_router.budget_checked', {
        org_id: orgId,
        user_id: userId,
        remaining,
        can_proceed,
        source: 'credit_transactions',
      });

      return { remaining, can_proceed };
    }

    // Fallback: org_credit_balance view (trigger-maintained)
    const { data: balanceRow, error: balanceError } = await supabase
      .from('org_credit_balance')
      .select('balance_credits')
      .eq('org_id', orgId)
      .maybeSingle();

    if (!balanceError && balanceRow != null) {
      const remaining = Number(balanceRow.balance_credits) || 0;
      const can_proceed = remaining > CREDIT_GRACE_THRESHOLD;

      logger.info('model_router.budget_checked', {
        org_id: orgId,
        user_id: userId,
        remaining,
        can_proceed,
        source: 'org_credit_balance',
      });

      return { remaining, can_proceed };
    }

    logger.warn('model_router.budget_check_failed', {
      org_id: orgId,
      tx_error: txError?.message,
      balance_error: balanceError?.message,
    });

    // Default: allow on error (backward compat)
    return { remaining: 0, can_proceed: true };
  } catch (err) {
    logger.warn('model_router.budget_check_exception', {
      org_id: orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { remaining: 0, can_proceed: true };
  }
}

// ---------------------------------------------------------------------------
// deductCredits — insert credit_transactions row directly
// ---------------------------------------------------------------------------

/**
 * Deduct credits for a resolved model invocation by inserting directly into
 * credit_transactions. The amount is negative (deduction).
 *
 * Logged fields: org_id, type='usage', amount (negative), description,
 * feature_key, created_by (userId), plus metadata columns for model_id,
 * tokens_used, agent_name, and trace_id.
 *
 * Returns the running balance after deduction (sum of all transactions),
 * or -1 on insert error.
 */
export async function deductCredits(
  supabase: any,
  userId: string,
  orgId: string,
  resolution: ModelResolution,
  actualTokens: number,
  agentName?: string,
): Promise<number> {
  const logger = createLogger('model-router', { traceId: resolution.traceId });

  try {
    const agentPart = agentName ? ` via ${agentName}` : '';
    const description = `AI usage: ${resolution.modelId}${agentPart} (${actualTokens} tokens)`;

    const { error: insertError } = await supabase
      .from('credit_transactions')
      .insert({
        org_id: orgId,
        type: 'usage',
        amount: -resolution.creditCost,
        description,
        feature_key: resolution.provider,
        created_by: userId,
        model_id: resolution.modelId,
        tokens_used: actualTokens,
        agent_name: agentName ?? null,
        trace_id: resolution.traceId,
      });

    if (insertError) {
      logger.warn('model_router.deduct_credits_insert_error', {
        org_id: orgId,
        user_id: userId,
        model_id: resolution.modelId,
        credit_cost: resolution.creditCost,
        error: insertError.message,
      });
      return -1;
    }

    // Compute new running balance
    const { data: txRows, error: sumError } = await supabase
      .from('credit_transactions')
      .select('amount')
      .eq('org_id', orgId);

    const newBalance = sumError
      ? -1
      : (txRows as { amount: number | null }[]).reduce(
          (sum, row) => sum + (Number(row.amount) || 0),
          0,
        );

    logger.info('model_router.credits_deducted', {
      org_id: orgId,
      user_id: userId,
      model_id: resolution.modelId,
      provider: resolution.provider,
      credit_cost: resolution.creditCost,
      tokens_used: actualTokens,
      agent_name: agentName ?? null,
      trace_id: resolution.traceId,
      new_balance: newBalance,
    });

    return newBalance;
  } catch (err) {
    logger.warn('model_router.deduct_credits_exception', {
      org_id: orgId,
      user_id: userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return -1;
  }
}

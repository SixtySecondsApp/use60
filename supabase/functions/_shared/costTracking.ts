/**
 * Cost Tracking Helper for Edge Functions
 * 
 * Use this in edge functions to log AI costs automatically
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

/**
 * Log AI cost event from an edge function
 * This should be called after every AI API call
 */
export async function logAICostEvent(
  supabaseClient: any,
  userId: string,
  orgId: string | null,
  provider: 'anthropic' | 'gemini',
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

    // Calculate cost using database function
    const { data: costData, error: costError } = await supabaseClient.rpc('calculate_token_cost', {
      p_provider: provider,
      p_model: model,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
    });

    if (costError) {
      console.warn('[CostTracking] Error calculating cost:', costError);
      return;
    }

    const estimatedCost = typeof costData === 'number' ? costData : parseFloat(costData || '0');

    // Log to ai_cost_events table
    const { error: insertError } = await supabaseClient.from('ai_cost_events').insert({
      org_id: orgId,
      user_id: userId,
      provider,
      model,
      feature: feature || null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: estimatedCost,
      metadata: metadata || null,
    });

    if (insertError) {
      // Silently fail if table doesn't exist yet (expected during initial setup)
      if (!insertError.message.includes('relation') && !insertError.message.includes('does not exist')) {
        console.warn('[CostTracking] Error logging cost event:', insertError);
      }
    }
  } catch (err) {
    // Silently fail if cost tracking isn't set up yet
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
 * Returns { allowed: true } if under budget or if tracking isn't set up.
 */
export async function checkAgentBudget(
  supabaseClient: any,
  orgId: string,
  budgetLimitUsd: number
): Promise<BudgetCheckResult> {
  try {
    // Query today's total AI cost for this org
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabaseClient
      .from('ai_cost_events')
      .select('estimated_cost')
      .eq('org_id', orgId)
      .gte('created_at', todayStart.toISOString());

    if (error) {
      // If table doesn't exist, allow the call
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        return { allowed: true, todaySpend: 0, budgetLimit: budgetLimitUsd };
      }
      console.warn('[CostTracking] Budget check error:', error);
      return { allowed: true, todaySpend: 0, budgetLimit: budgetLimitUsd };
    }

    const todaySpend = (data || []).reduce(
      (sum: number, row: { estimated_cost: number | null }) =>
        sum + (row.estimated_cost || 0),
      0
    );

    if (todaySpend >= budgetLimitUsd) {
      return {
        allowed: false,
        todaySpend,
        budgetLimit: budgetLimitUsd,
        message: `Daily AI budget limit reached ($${todaySpend.toFixed(2)} of $${budgetLimitUsd.toFixed(2)}). Multi-agent mode will resume tomorrow. You can still use single-agent mode.`,
      };
    }

    return { allowed: true, todaySpend, budgetLimit: budgetLimitUsd };
  } catch (err) {
    console.warn('[CostTracking] Budget check exception:', err);
    return { allowed: true, todaySpend: 0, budgetLimit: budgetLimitUsd };
  }
}




















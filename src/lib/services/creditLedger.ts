/**
 * Credit Ledger Service
 *
 * Client-side singleton for logging AI cost events from frontend executor code
 * (autonomousExecutor.ts and similar). Mirrors the edge-function logAICostEvent()
 * pattern but runs browser-side via the user-scoped Supabase client.
 *
 * All writes are fire-and-forget — never block the calling code.
 * Sets estimated_cost=0 and credits_charged=0: this is attribution-only logging.
 * Credit deduction is handled server-side by edge functions (avoids double-counting).
 */

import { supabase } from '@/lib/supabase/clientV2';

// =============================================================================
// Types
// =============================================================================

export interface LogCallParams {
  userId: string;
  orgId: string;
  provider: 'anthropic' | 'gemini' | 'openrouter' | 'exa';
  model: string;
  inputTokens: number;
  outputTokens: number;
  feature?: string;
  sourceAgent?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// CreditLedger Singleton
// =============================================================================

class CreditLedger {
  private static instance: CreditLedger;

  private constructor() {}

  static getInstance(): CreditLedger {
    if (!CreditLedger.instance) {
      CreditLedger.instance = new CreditLedger();
    }
    return CreditLedger.instance;
  }

  /**
   * Log an AI call to ai_cost_events. Fire-and-forget — never throws.
   * Attribution only: estimated_cost and credits_charged are set to 0.
   * Actual credit deduction is performed by edge functions.
   */
  logCall(params: LogCallParams): void {
    this.writeEvent(params).catch((err) => {
      console.warn('[CreditLedger] logCall failed (non-fatal):', err);
    });
  }

  private async writeEvent(params: LogCallParams): Promise<void> {
    const { error } = await supabase.from('ai_cost_events').insert({
      org_id: params.orgId,
      user_id: params.userId,
      provider: params.provider,
      model: params.model,
      feature: params.feature ?? null,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      estimated_cost: 0,
      provider_cost_usd: null,
      credits_charged: 0,
      metadata: params.metadata ?? null,
      source_agent: params.sourceAgent ?? null,
    });
    if (error) {
      console.warn('[CreditLedger] insert error (non-fatal):', error.message);
    }
  }
}

// =============================================================================
// Exports
// =============================================================================

export const creditLedger = CreditLedger.getInstance();

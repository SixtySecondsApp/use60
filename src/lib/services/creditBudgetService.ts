/**
 * Credit Budget Service
 *
 * Pre-flight budget enforcement for client-side AI calls.
 * Implements fleetThrottle: soft-warn at 80%, hard-kill when balance exhausted.
 *
 * Cache: 60s per-org in-memory Map to avoid DB round-trips on every AI call iteration.
 * Fails open: returns allowed=true on any DB error — never block on monitoring failure.
 *
 * Reads from org_credit_balance via user-scoped Supabase client (respects RLS).
 * Does NOT deduct credits — deduction is the edge function's responsibility.
 */

import { supabase } from '@/lib/supabase/clientV2';

// =============================================================================
// Types
// =============================================================================

export interface BudgetCheckResult {
  /** Whether this AI call is allowed to proceed */
  allowed: boolean;
  /** Credit usage as a percentage (0–100) */
  percentUsed: number;
  /** True when >= 80% used — soft throttle, non-critical calls are blocked */
  softWarn: boolean;
  /** Human-readable reason when not allowed */
  reason?: string;
}

export interface CheckBudgetOptions {
  /**
   * Critical calls (user-initiated copilot replies) bypass the soft-warn throttle.
   * Non-critical calls (background enrichment, proactive agents) are blocked at 80%.
   * Default: false (non-critical).
   */
  isCritical?: boolean;
}

interface CacheEntry {
  result: BudgetCheckResult;
  expiresAt: number; // epoch ms
}

// =============================================================================
// Constants
// =============================================================================

const SOFT_WARN_THRESHOLD = 80;  // percent
const CACHE_TTL_MS = 60_000;     // 60 seconds

// =============================================================================
// Error Class
// =============================================================================

export class CreditExhaustedError extends Error {
  readonly percentUsed: number;
  readonly orgId: string;

  constructor(message: string, percentUsed: number, orgId: string) {
    super(message);
    this.name = 'CreditExhaustedError';
    this.percentUsed = percentUsed;
    this.orgId = orgId;
  }
}

// =============================================================================
// CreditBudgetService Singleton
// =============================================================================

class CreditBudgetService {
  private static instance: CreditBudgetService;
  private cache: Map<string, CacheEntry> = new Map();

  private constructor() {}

  static getInstance(): CreditBudgetService {
    if (!CreditBudgetService.instance) {
      CreditBudgetService.instance = new CreditBudgetService();
    }
    return CreditBudgetService.instance;
  }

  /**
   * Pre-flight budget check with 60s cache per org.
   * Never throws — returns allowed=true on any error (fail open).
   */
  async checkBudget(
    orgId: string,
    opts: CheckBudgetOptions = {}
  ): Promise<BudgetCheckResult> {
    const isCritical = opts.isCritical ?? false;

    // Serve from cache if still fresh
    const cached = this.cache.get(orgId);
    if (cached && Date.now() < cached.expiresAt) {
      return this.applyThrottle(cached.result, isCritical);
    }

    try {
      const fresh = await this.fetchBudget(orgId);
      this.cache.set(orgId, {
        result: fresh,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return this.applyThrottle(fresh, isCritical);
    } catch (err) {
      console.warn('[CreditBudgetService] checkBudget error (failing open):', err);
      return { allowed: true, percentUsed: 0, softWarn: false };
    }
  }

  /**
   * Get the current percent used for an org (uses cache).
   * Critical=true so it doesn't get throttled — pure read.
   */
  async getPercentUsed(orgId: string): Promise<number> {
    const result = await this.checkBudget(orgId, { isCritical: true });
    return result.percentUsed;
  }

  /**
   * Invalidate cached budget for an org.
   * Call this after a known credit deduction to force a fresh read.
   */
  invalidate(orgId: string): void {
    this.cache.delete(orgId);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async fetchBudget(orgId: string): Promise<BudgetCheckResult> {
    const { data, error } = await supabase
      .from('org_credit_balance')
      .select('balance_credits, grace_threshold_credits, lifetime_purchased, lifetime_consumed')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) {
      // If table doesn't exist (older env), fail open
      if (
        error.message.includes('relation') ||
        error.message.includes('does not exist')
      ) {
        return { allowed: true, percentUsed: 0, softWarn: false };
      }
      throw error;
    }

    // No row means org not on credit system yet → allow
    if (!data) {
      return { allowed: true, percentUsed: 0, softWarn: false };
    }

    const balance = Number(data.balance_credits ?? 0);
    const graceThreshold = Number(data.grace_threshold_credits ?? 10);
    const lifetimePurchased = Number(data.lifetime_purchased ?? 0);
    const lifetimeConsumed = Number(data.lifetime_consumed ?? 0);

    // Hard kill: balance has gone below the grace threshold
    if (balance < -graceThreshold) {
      return {
        allowed: false,
        percentUsed: 100,
        softWarn: false,
        reason:
          'Credit balance exhausted. Please top up to continue using AI features.',
      };
    }

    // Calculate percent used from lifetime figures
    // Total ever allocated = purchased + any bonus/free credits (approximated as purchased)
    // Percent = consumed / (consumed + remaining balance) capped at 100
    let percentUsed = 0;
    if (lifetimeConsumed > 0 || balance < lifetimePurchased) {
      const totalAllocated = lifetimePurchased > 0 ? lifetimePurchased : lifetimeConsumed + Math.max(balance, 0);
      percentUsed = totalAllocated > 0
        ? Math.min(Math.round((lifetimeConsumed / totalAllocated) * 100), 100)
        : 0;
    }

    // Soft warn when approaching limit
    const softWarn = percentUsed >= SOFT_WARN_THRESHOLD;

    return { allowed: true, percentUsed, softWarn };
  }

  private applyThrottle(
    base: BudgetCheckResult,
    isCritical: boolean
  ): BudgetCheckResult {
    // Hard kill — blocks everyone regardless of criticality
    if (!base.allowed) {
      return base;
    }

    // Soft warn — only block non-critical calls
    if (base.softWarn && !isCritical) {
      return {
        ...base,
        allowed: false,
        reason:
          base.reason ??
          'AI usage paused for background operations — credit usage is at 80%+. Critical user actions are unaffected.',
      };
    }

    return base;
  }
}

// =============================================================================
// Exports
// =============================================================================

export const creditBudgetService = CreditBudgetService.getInstance();

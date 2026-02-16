/**
 * Credit Service
 *
 * Manages org credit balance, purchases, and usage tracking.
 * Credits use a 1:1 ratio with USD (1 credit = $1).
 */

import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

export interface CreditBalance {
  balance: number;
  dailyBurnRate: number;
  projectedDaysRemaining: number;
  usageByFeature: FeatureUsage[];
  recentTransactions: CreditTransaction[];
  lastPurchaseDate: string | null;
}

export interface FeatureUsage {
  featureKey: string;
  featureName: string;
  totalCost: number;
  callCount: number;
}

export interface CreditTransaction {
  id: string;
  type: 'purchase' | 'deduction' | 'refund' | 'adjustment' | 'bonus';
  amount: number;
  balanceAfter: number;
  description: string | null;
  featureKey: string | null;
  createdAt: string;
}

export interface TransactionFilters {
  type?: CreditTransaction['type'];
  page?: number;
  limit?: number;
}

export interface CreditPurchaseResult {
  url: string;
  sessionId: string;
}

function getUtcStartOfDayDaysAgo(daysAgo: number): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, 0, 0, 0));
  return utc.toISOString();
}

interface BalanceResponseDto {
  balance?: number;
  daily_burn_rate?: number;
  projected_days_remaining?: number;
  usage_by_feature?: Array<{
    feature_key: string;
    feature_name: string;
    total_cost: number;
    call_count: number;
  }>;
  recent_transactions?: Array<{
    id: string;
    type: CreditTransaction['type'];
    amount: number;
    balance_after: number;
    description: string | null;
    feature_key: string | null;
    created_at: string;
  }>;
  last_purchase_date?: string | null;
}

// ============================================================================
// Credit Balance
// ============================================================================

/**
 * Get the full credit balance snapshot for an org (used by the widget).
 */
export async function getBalance(orgId: string): Promise<CreditBalance> {
  // Try edge function first (provides full data: burn rate, usage, transactions)
  const { data, error } = await supabase.functions.invoke<BalanceResponseDto>('get-credit-balance', {
    body: { org_id: orgId },
  });

  if (!error && data) {
    return {
      balance: data?.balance ?? 0,
      dailyBurnRate: data?.daily_burn_rate ?? 0,
      projectedDaysRemaining: data?.projected_days_remaining ?? 0,
      usageByFeature: (data?.usage_by_feature ?? []).map((f) => ({
        featureKey: f.feature_key,
        featureName: f.feature_name,
        totalCost: f.total_cost,
        callCount: f.call_count,
      })),
      recentTransactions: (data?.recent_transactions ?? []).map((t) => ({
        id: t.id ?? '',
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balance_after ?? 0,
        description: t.description,
        featureKey: t.feature_key,
        createdAt: t.created_at,
      })),
      lastPurchaseDate: data?.last_purchase_date ?? null,
    };
  }

  // Fallback: read balance directly from table (when edge function fails)
  console.warn('[CreditService] Edge function failed, falling back to direct table read:', error);
  try {
    const { data: row } = await supabase
      .from('org_credit_balance')
      .select('balance_credits')
      .eq('org_id', orgId)
      .maybeSingle();

    return {
      balance: row?.balance_credits ?? 0,
      dailyBurnRate: 0,
      projectedDaysRemaining: -1, // no usage data available from fallback
      usageByFeature: [],
      recentTransactions: [],
      lastPurchaseDate: null,
    };
  } catch {
    return {
      balance: 0,
      dailyBurnRate: 0,
      projectedDaysRemaining: -1,
      usageByFeature: [],
      recentTransactions: [],
      lastPurchaseDate: null,
    };
  }
}

// ============================================================================
// Transactions
// ============================================================================

/**
 * Get paginated transaction history for an org.
 */
export async function getTransactions(
  orgId: string,
  filters: TransactionFilters = {}
): Promise<{ transactions: CreditTransaction[]; total: number }> {
  const { type, page = 0, limit = 20 } = filters;
  const from = page * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('credit_transactions')
    .select('id, type, amount, balance_after, description, feature_key, created_at', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (type) {
    query = query.eq('type', type);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[CreditService] Error fetching transactions:', error);
    return { transactions: [], total: 0 };
  }

  return {
    transactions: (data ?? []).map((t) => ({
      id: t.id,
      type: t.type as CreditTransaction['type'],
      amount: t.amount,
      balanceAfter: t.balance_after,
      description: t.description,
      featureKey: t.feature_key,
      createdAt: t.created_at,
    })),
    total: count ?? 0,
  };
}

// ============================================================================
// Purchases
// ============================================================================

/**
 * Initiate a credit purchase via Stripe checkout.
 * Returns the Stripe checkout URL to redirect the user.
 */
export async function purchaseCredits(
  orgId: string,
  creditAmount: number
): Promise<CreditPurchaseResult> {
  const { data, error } = await supabase.functions.invoke('create-credit-checkout', {
    body: {
      org_id: orgId,
      credit_amount: creditAmount,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to create checkout session');
  }

  if (!data?.url) {
    throw new Error('No checkout URL returned');
  }

  return {
    url: data.url,
    sessionId: data.session_id,
  };
}

// ============================================================================
// Admin Grant Credits (no payment)
// ============================================================================

/**
 * Admin-only: Grant credits to an org without payment.
 * Uses the add_credits PL/pgSQL function with type 'bonus'.
 */
export async function grantCredits(
  orgId: string,
  amount: number,
  reason: string
): Promise<number> {
  const { data, error } = await supabase.rpc('add_credits', {
    p_org_id: orgId,
    p_amount: amount,
    p_type: 'bonus',
    p_description: reason || 'Admin credit grant',
  });

  if (error) {
    throw new Error(error.message || 'Failed to grant credits');
  }

  return data as number; // new balance
}

// ============================================================================
// Usage Breakdown
// ============================================================================

/**
 * Get AI usage breakdown by feature for a date range.
 */
export async function getUsageBreakdown(
  orgId: string,
  days: number = 30
): Promise<FeatureUsage[]> {
  const sinceIso = getUtcStartOfDayDaysAgo(days);

  const { data, error } = await supabase
    .from('ai_cost_events')
    .select('feature, estimated_cost')
    .eq('org_id', orgId)
    .gte('created_at', sinceIso);

  if (error) {
    console.error('[CreditService] Error fetching usage breakdown:', error);
    return [];
  }

  // Aggregate by feature
  const featureMap = new Map<string, { totalCost: number; callCount: number }>();
  for (const row of data ?? []) {
    const key = row.feature || 'unknown';
    const existing = featureMap.get(key) || { totalCost: 0, callCount: 0 };
    existing.totalCost += row.estimated_cost || 0;
    existing.callCount += 1;
    featureMap.set(key, existing);
  }

  // Get feature display names
  const { data: features } = await supabase
    .from('ai_feature_config')
    .select('feature_key, display_name');

  const featureNameMap = new Map<string, string>();
  for (const f of features ?? []) {
    featureNameMap.set(f.feature_key, f.display_name);
  }

  return Array.from(featureMap.entries())
    .map(([key, val]) => ({
      featureKey: key,
      featureName: featureNameMap.get(key) || key,
      totalCost: Math.round(val.totalCost * 10000) / 10000,
      callCount: val.callCount,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

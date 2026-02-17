/**
 * Credit Service
 *
 * Manages org credit balance, pack inventory, purchases, and usage tracking.
 * Credits are in credit units (10 credits ≈ $1 USD).
 */

import { supabase } from '@/lib/supabase/clientV2';
import type { PackType } from '@/lib/config/creditPacks';

// ============================================================================
// Types
// ============================================================================

export interface PackInventory {
  activePacks: number;
  totalRemaining: number;
}

export interface OrgCreditPack {
  id: string;
  packType: PackType;
  creditsPurchased: number;
  creditsRemaining: number;
  purchasedAt: string;
  source: 'manual' | 'auto_top_up' | 'bonus' | 'migration';
  paymentId: string | null;
  expiresAt: string | null;
}

export interface AutoTopUpSettings {
  enabled: boolean;
  packType: PackType | null;
  threshold: number;
  monthlyCap: number;
  topUpsThisMonth: number;
  paymentMethodLast4: string | null;
}

export interface StorageUsage {
  audioHours: number;
  transcriptCount: number;
  documentCount: number;
  enrichmentRecords: number;
  projectedMonthlyCostCredits: number;
  lastStorageDeductionDate: string | null;
}

export interface CreditBalance {
  balance: number;
  packInventory: PackInventory;
  dailyBurnRate: number;
  projectedDaysRemaining: number;
  usageByFeature: FeatureUsage[];
  recentTransactions: CreditTransaction[];
  lastPurchaseDate: string | null;
  autoTopUp: AutoTopUpSettings | null;
  storage: StorageUsage | null;
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
  pack_inventory?: {
    active_packs: number;
    total_remaining: number;
  };
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
  storage?: {
    audio_hours: number;
    transcript_count: number;
    document_count: number;
    enrichment_records: number;
    projected_monthly_cost_credits: number;
    last_storage_deduction_date: string | null;
  } | null;
  auto_top_up?: {
    enabled: boolean;
    pack_type: string | null;
    threshold: number;
    monthly_cap: number;
    top_ups_this_month: number;
    payment_method_last4: string | null;
  } | null;
  packs?: Array<{
    id: string;
    pack_type: string;
    credits_purchased: number;
    credits_remaining: number;
    purchased_at: string;
    source: string;
    payment_id: string | null;
    expires_at: string | null;
  }>;
}

// ============================================================================
// Credit Balance
// ============================================================================

/**
 * Get the full credit balance snapshot for an org (used by the widget).
 */
export async function getBalance(orgId: string): Promise<CreditBalance> {
  // Try edge function first (provides full data: burn rate, usage, transactions, packs)
  const { data, error } = await supabase.functions.invoke<BalanceResponseDto>('get-credit-balance', {
    body: { org_id: orgId },
  });

  if (!error && data) {
    const autoTopUpRaw = data?.auto_top_up;
    return {
      balance: data?.balance ?? 0,
      packInventory: {
        activePacks: data?.pack_inventory?.active_packs ?? 0,
        totalRemaining: data?.pack_inventory?.total_remaining ?? 0,
      },
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
      autoTopUp: autoTopUpRaw
        ? {
            enabled: autoTopUpRaw.enabled,
            packType: (autoTopUpRaw.pack_type as PackType) ?? null,
            threshold: autoTopUpRaw.threshold,
            monthlyCap: autoTopUpRaw.monthly_cap,
            topUpsThisMonth: autoTopUpRaw.top_ups_this_month,
            paymentMethodLast4: autoTopUpRaw.payment_method_last4,
          }
        : null,
      storage: data?.storage
        ? {
            audioHours: data.storage.audio_hours,
            transcriptCount: data.storage.transcript_count,
            documentCount: data.storage.document_count,
            enrichmentRecords: data.storage.enrichment_records,
            projectedMonthlyCostCredits: data.storage.projected_monthly_cost_credits,
            lastStorageDeductionDate: data.storage.last_storage_deduction_date,
          }
        : null,
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
      packInventory: { activePacks: 0, totalRemaining: 0 },
      dailyBurnRate: 0,
      projectedDaysRemaining: -1, // no usage data available from fallback
      usageByFeature: [],
      recentTransactions: [],
      lastPurchaseDate: null,
      autoTopUp: null,
      storage: null,
    };
  } catch {
    return {
      balance: 0,
      packInventory: { activePacks: 0, totalRemaining: 0 },
      dailyBurnRate: 0,
      projectedDaysRemaining: -1,
      usageByFeature: [],
      recentTransactions: [],
      lastPurchaseDate: null,
      autoTopUp: null,
      storage: null,
    };
  }
}

// ============================================================================
// Pack Inventory
// ============================================================================

/**
 * Get list of active credit packs for an org (FIFO order: bonus first, then oldest).
 */
export async function getPacks(orgId: string): Promise<OrgCreditPack[]> {
  const { data, error } = await supabase
    .from('credit_packs')
    .select('id, pack_type, credits_purchased, credits_remaining, purchased_at, source, payment_id, expires_at')
    .eq('org_id', orgId)
    .gt('credits_remaining', 0)
    .order('purchased_at', { ascending: true });

  if (error) {
    console.error('[CreditService] Error fetching packs:', error);
    return [];
  }

  // Sort: bonus first, then by purchased_at ascending (matches FIFO deduction order)
  return (data ?? [])
    .map((p) => ({
      id: p.id,
      packType: p.pack_type as PackType,
      creditsPurchased: p.credits_purchased,
      creditsRemaining: p.credits_remaining,
      purchasedAt: p.purchased_at,
      source: p.source as OrgCreditPack['source'],
      paymentId: p.payment_id,
      expiresAt: p.expires_at,
    }))
    .sort((a, b) => {
      if (a.source === 'bonus' && b.source !== 'bonus') return -1;
      if (a.source !== 'bonus' && b.source === 'bonus') return 1;
      return new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime();
    });
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
 * Initiate a credit pack purchase via Stripe checkout.
 * Returns the Stripe checkout URL to redirect the user.
 */
export async function purchasePack(
  orgId: string,
  packType: PackType
): Promise<CreditPurchaseResult> {
  const { data, error } = await supabase.functions.invoke('create-credit-checkout', {
    body: {
      org_id: orgId,
      pack_type: packType,
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

/**
 * @deprecated Use purchasePack() instead.
 * Kept for backward compatibility during transition period.
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
// Auto Top-Up Settings
// ============================================================================

/**
 * Get auto top-up settings for an org.
 */
export async function getAutoTopUpSettings(orgId: string): Promise<AutoTopUpSettings | null> {
  const { data, error } = await supabase
    .from('auto_top_up_settings')
    .select('enabled, pack_type, threshold, monthly_cap, stripe_payment_method_id')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    console.error('[CreditService] Error fetching auto top-up settings:', error);
    return null;
  }

  if (!data) {
    // Return defaults so the UI renders the form for first-time setup
    return {
      enabled: false,
      packType: 'starter' as PackType,
      threshold: 10,
      monthlyCap: 3,
      topUpsThisMonth: 0,
      paymentMethodLast4: null,
    };
  }

  // Count top-ups this calendar month from the log
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: topUpsThisMonth } = await supabase
    .from('auto_top_up_log')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'success')
    .gte('triggered_at', startOfMonth.toISOString());

  return {
    enabled: data.enabled,
    packType: (data.pack_type as PackType) ?? null,
    threshold: data.threshold,
    monthlyCap: data.monthly_cap,
    topUpsThisMonth: topUpsThisMonth ?? 0,
    paymentMethodLast4: null, // resolved server-side from Stripe if needed
  };
}

/**
 * Update auto top-up settings for an org.
 */
export async function updateAutoTopUpSettings(
  orgId: string,
  settings: Partial<Pick<AutoTopUpSettings, 'enabled' | 'packType' | 'threshold' | 'monthlyCap'>>
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (settings.enabled !== undefined) update['enabled'] = settings.enabled;
  if (settings.packType !== undefined) update['pack_type'] = settings.packType;
  if (settings.threshold !== undefined) update['threshold'] = settings.threshold;
  if (settings.monthlyCap !== undefined) update['monthly_cap'] = settings.monthlyCap;

  const { error } = await supabase
    .from('auto_top_up_settings')
    .upsert({ org_id: orgId, ...update }, { onConflict: 'org_id' });

  if (error) {
    throw new Error(error.message || 'Failed to update auto top-up settings');
  }
}

// ============================================================================
// Admin Grant Credits (no payment)
// ============================================================================

/**
 * Admin-only: Grant credits to an org without payment.
 * Uses the add_credits_pack PL/pgSQL function with source 'bonus'.
 */
export async function grantCredits(
  orgId: string,
  amount: number,
  reason: string
): Promise<number> {
  const { data, error } = await supabase.rpc('add_credits_pack', {
    p_org_id: orgId,
    p_pack_type: 'custom',
    p_credits: amount,
    p_source: 'bonus',
    p_payment_id: null,
  });

  if (error) {
    // Fallback to legacy add_credits if add_credits_pack doesn't exist yet
    const { data: legacyData, error: legacyError } = await supabase.rpc('add_credits', {
      p_org_id: orgId,
      p_amount: amount,
      p_type: 'bonus',
      p_description: reason || 'Admin credit grant',
    });

    if (legacyError) {
      throw new Error(legacyError.message || 'Failed to grant credits');
    }

    return legacyData as number;
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

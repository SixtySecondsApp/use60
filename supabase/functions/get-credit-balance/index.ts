// supabase/functions/get-credit-balance/index.ts
// Returns credit balance, pack inventory, burn rate, usage breakdown, recent transactions,
// and storage usage projection for an org.

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { STORAGE_CREDIT_COSTS } from '../_shared/creditPacks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface BalanceRequest {
  org_id: string;
}

interface UsageByFeature {
  feature_key: string;
  feature_name: string;
  total_cost: number;
  call_count: number;
}

interface RecentTransaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  created_at: string;
  description: string | null;
  feature_key: string | null;
}

interface CreditPackDto {
  id: string;
  pack_type: string;
  credits_purchased: number;
  credits_remaining: number;
  purchased_at: string;
  source: string;
  payment_id: string | null;
  expires_at: string | null;
}

interface PackInventory {
  active_packs: number;
  total_remaining: number;
}

interface AutoTopUpDto {
  enabled: boolean;
  pack_type: string | null;
  threshold: number;
  monthly_cap: number;
  top_ups_this_month: number;
  payment_method_last4: string | null;
}

interface StorageUsage {
  audio_hours: number;
  transcript_count: number;
  document_count: number;
  enrichment_records: number;
  projected_monthly_cost_credits: number;
  last_storage_deduction_date: string | null;
}

interface BalanceResponse {
  balance: number;
  pack_inventory: PackInventory;
  packs: CreditPackDto[];
  auto_top_up: AutoTopUpDto | null;
  daily_burn_rate: number;
  projected_days_remaining: number;
  usage_by_feature: UsageByFeature[];
  recent_transactions: RecentTransaction[];
  last_purchase_date: string | null;
  storage: StorageUsage;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // 1. Verify JWT auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return errorResponse('Invalid authentication', req, 401);
    }

    // Parse request body
    const body: BalanceRequest = await req.json();
    const { org_id } = body;

    if (!org_id) {
      return errorResponse('Missing required field: org_id', req, 400);
    }

    // 2. Verify user is a member of this org (any role)
    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      console.error('Membership check error:', membershipError);
      return errorResponse('Failed to verify organization membership', req, 500);
    }

    if (!membership) {
      return errorResponse('You are not a member of this organization', req, 403);
    }

    // Run all queries in parallel for performance
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      balanceResult,
      burnResult,
      usageResult,
      txResult,
      lastPurchaseResult,
      packsResult,
      autoTopUpResult,
      topUpCountResult,
      // Storage metrics
      meetingDurationsResult,
      transcriptCountResult,
      documentCountResult,
      enrichmentCountResult,
      lastStorageDeductionResult,
    ] = await Promise.all([
      // 3. Get aggregate balance
      supabase
        .from('org_credit_balance')
        .select('balance_credits')
        .eq('org_id', org_id)
        .maybeSingle(),

      // 4. Burn rate: deductions last 7 days
      supabase
        .from('credit_transactions')
        .select('amount')
        .eq('org_id', org_id)
        .eq('type', 'deduction')
        .gte('created_at', sevenDaysAgo),

      // 5. Usage by feature (last 30 days)
      supabase
        .from('credit_transactions')
        .select('feature_key, amount')
        .eq('org_id', org_id)
        .eq('type', 'deduction')
        .gte('created_at', thirtyDaysAgo),

      // 6. Recent transactions
      supabase
        .from('credit_transactions')
        .select('id, type, amount, balance_after, created_at, description, feature_key')
        .eq('org_id', org_id)
        .order('created_at', { ascending: false })
        .limit(5),

      // 7. Last purchase date
      supabase
        .from('credit_transactions')
        .select('created_at')
        .eq('org_id', org_id)
        .eq('type', 'purchase')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 8. Active credit packs (FIFO order: bonus first, then oldest)
      supabase
        .from('credit_packs')
        .select('id, pack_type, credits_purchased, credits_remaining, purchased_at, source, payment_id, expires_at')
        .eq('org_id', org_id)
        .gt('credits_remaining', 0)
        .order('purchased_at', { ascending: true }),

      // 9. Auto top-up settings
      supabase
        .from('auto_top_up_settings')
        .select('enabled, pack_type, threshold, monthly_cap, stripe_payment_method_id')
        .eq('org_id', org_id)
        .maybeSingle(),

      // 10. Count successful top-ups this month
      supabase
        .from('auto_top_up_log')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org_id)
        .eq('status', 'success')
        .gte('triggered_at', monthStart.toISOString()),

      // 11. Storage: sum meeting recording durations
      supabase
        .from('meetings')
        .select('duration_seconds')
        .eq('org_id', org_id)
        .not('duration_seconds', 'is', null),

      // 12. Storage: transcript count
      supabase
        .from('meeting_transcripts')
        .select('id', { count: 'exact', head: true })
        .in(
          'meeting_id',
          supabase.from('meetings').select('id').eq('org_id', org_id)
        ),

      // 13. Storage: document count
      supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org_id),

      // 14. Storage: enriched contacts count
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org_id)
        .not('enriched_at', 'is', null),

      // 15. Last storage deduction date
      supabase
        .from('credit_transactions')
        .select('created_at')
        .eq('org_id', org_id)
        .eq('feature_key', 'storage_metering')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Log non-fatal errors
    if (balanceResult.error) console.error('Balance fetch error:', balanceResult.error);
    if (burnResult.error) console.error('Burn rate query error:', burnResult.error);
    if (usageResult.error) console.error('Usage query error:', usageResult.error);
    if (txResult.error) console.error('Transactions query error:', txResult.error);
    if (lastPurchaseResult.error) console.error('Last purchase query error:', lastPurchaseResult.error);
    if (packsResult.error) console.error('Packs query error:', packsResult.error);
    if (autoTopUpResult.error && !autoTopUpResult.error.message.includes('does not exist')) {
      console.error('Auto top-up settings error:', autoTopUpResult.error);
    }

    // --- Balance ---
    const balance = balanceResult.data?.balance_credits ?? 0;

    // --- Burn rate (credits/day) ---
    const totalCostLast7Days = (burnResult.data ?? []).reduce(
      (sum: number, row: { amount: number | null }) => sum + Math.abs(row.amount ?? 0),
      0
    );
    const dailyBurnRate = totalCostLast7Days / 7;

    // --- Projected days ---
    const projectedDaysRemaining =
      dailyBurnRate > 0
        ? Math.floor(balance / dailyBurnRate)
        : -1;

    // --- Usage by feature (aggregate last 30 days) ---
    const featureMap = new Map<string, { total_cost: number; call_count: number }>();
    for (const row of usageResult.data ?? []) {
      const key = row.feature_key ?? 'unknown';
      const existing = featureMap.get(key) ?? { total_cost: 0, call_count: 0 };
      existing.total_cost += Math.abs(row.amount ?? 0);
      existing.call_count += 1;
      featureMap.set(key, existing);
    }

    const sortedFeatures = Array.from(featureMap.entries())
      .sort((a, b) => b[1].total_cost - a[1].total_cost)
      .slice(0, 5);

    // Get display names for top feature keys
    const featureKeys = sortedFeatures.map(([key]) => key);
    let featureNameMap = new Map<string, string>();
    if (featureKeys.length > 0) {
      const { data: featureConfigs } = await supabase
        .from('ai_feature_config')
        .select('feature_key, display_name')
        .in('feature_key', featureKeys);
      for (const fc of featureConfigs ?? []) {
        featureNameMap.set(fc.feature_key, fc.display_name);
      }
    }

    const usageByFeature: UsageByFeature[] = sortedFeatures.map(([key, data]) => ({
      feature_key: key,
      feature_name: featureNameMap.get(key) ?? key,
      total_cost: Math.round(data.total_cost * 10000) / 10000,
      call_count: data.call_count,
    }));

    // --- Recent transactions ---
    const recentTransactions: RecentTransaction[] = (txResult.data ?? []).map(
      (tx: {
        id: string;
        type: string;
        amount: number;
        balance_after: number;
        created_at: string;
        description: string | null;
        feature_key: string | null;
      }) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        balance_after: tx.balance_after,
        created_at: tx.created_at,
        description: tx.description,
        feature_key: tx.feature_key,
      })
    );

    // --- Last purchase date ---
    const lastPurchaseDate = lastPurchaseResult.data?.created_at ?? null;

    // --- Active packs (FIFO sorted: bonus first, then oldest) ---
    const rawPacks = packsResult.data ?? [];
    const sortedPacks = rawPacks
      .map((p: {
        id: string;
        pack_type: string;
        credits_purchased: number;
        credits_remaining: number;
        purchased_at: string;
        source: string;
        payment_id: string | null;
        expires_at: string | null;
      }) => p)
      .sort((a, b) => {
        if (a.source === 'bonus' && b.source !== 'bonus') return -1;
        if (a.source !== 'bonus' && b.source === 'bonus') return 1;
        return new Date(a.purchased_at).getTime() - new Date(b.purchased_at).getTime();
      });

    const packInventory: PackInventory = {
      active_packs: sortedPacks.length,
      total_remaining: sortedPacks.reduce((sum, p) => sum + p.credits_remaining, 0),
    };

    // --- Auto top-up ---
    let autoTopUp: AutoTopUpDto | null = null;
    if (autoTopUpResult.data) {
      const s = autoTopUpResult.data;
      autoTopUp = {
        enabled: s.enabled ?? false,
        pack_type: s.pack_type ?? null,
        threshold: s.threshold ?? 10,
        monthly_cap: s.monthly_cap ?? 3,
        top_ups_this_month: topUpCountResult.count ?? 0,
        payment_method_last4: null, // resolved from Stripe server-side if needed
      };
    }

    // --- Storage usage ---
    const recordingSeconds = (meetingDurationsResult.data ?? []).reduce(
      (sum: number, row: { duration_seconds: number | null }) => sum + (row.duration_seconds ?? 0),
      0
    );
    const audioHours = recordingSeconds / 3600;
    const transcriptCount = transcriptCountResult.count ?? 0;
    const documentCount = documentCountResult.count ?? 0;
    const enrichmentCount = enrichmentCountResult.count ?? 0;

    const projectedMonthlyCostCredits =
      audioHours * STORAGE_CREDIT_COSTS.audio_per_hour_month +
      (transcriptCount / 100) * STORAGE_CREDIT_COSTS.transcripts_per_100_month +
      (documentCount / 100) * STORAGE_CREDIT_COSTS.docs_per_100_month +
      (enrichmentCount / 500) * STORAGE_CREDIT_COSTS.enrichment_per_500_month;

    const storageUsage: StorageUsage = {
      audio_hours: Math.round(audioHours * 100) / 100,
      transcript_count: transcriptCount,
      document_count: documentCount,
      enrichment_records: enrichmentCount,
      projected_monthly_cost_credits: Math.round(projectedMonthlyCostCredits * 10000) / 10000,
      last_storage_deduction_date: lastStorageDeductionResult.data?.created_at ?? null,
    };

    // Build response
    const response: BalanceResponse = {
      balance: Math.round(balance * 100) / 100,
      pack_inventory: packInventory,
      packs: sortedPacks,
      auto_top_up: autoTopUp,
      daily_burn_rate: Math.round(dailyBurnRate * 100) / 100,
      projected_days_remaining: projectedDaysRemaining,
      usage_by_feature: usageByFeature,
      recent_transactions: recentTransactions,
      last_purchase_date: lastPurchaseDate,
      storage: storageUsage,
    };

    return jsonResponse(response, req);
  } catch (error) {
    console.error('Error in get-credit-balance:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, req, 500);
  }
});

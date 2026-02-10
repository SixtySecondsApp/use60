// supabase/functions/get-credit-balance/index.ts
// Returns credit balance, burn rate, usage breakdown, and recent transactions for an org.

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
  type: string;
  amount: number;
  created_at: string;
  description: string | null;
  feature_key: string | null;
}

interface BalanceResponse {
  balance: number;
  daily_burn_rate: number;
  projected_days_remaining: number;
  usage_by_feature: UsageByFeature[];
  recent_transactions: RecentTransaction[];
  last_purchase_date: string | null;
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

    // 3. Get balance from org_credit_balance
    const { data: balanceRow, error: balanceError } = await supabase
      .from('org_credit_balance')
      .select('balance_credits')
      .eq('org_id', org_id)
      .maybeSingle();

    if (balanceError) {
      console.error('Balance fetch error:', balanceError);
    }

    const balance = balanceRow?.balance_credits ?? 0;

    // 4. Calculate daily burn rate (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: burnData, error: burnError } = await supabase
      .from('ai_cost_events')
      .select('estimated_cost')
      .eq('org_id', org_id)
      .gte('created_at', sevenDaysAgo);

    if (burnError) {
      console.error('Burn rate query error:', burnError);
    }

    const totalCostLast7Days = (burnData ?? []).reduce(
      (sum: number, row: { estimated_cost: number | null }) => sum + (row.estimated_cost ?? 0),
      0
    );
    const dailyBurnRate = totalCostLast7Days / 7;

    // 5. Projected days remaining (-1 signals "no usage data")
    const projectedDaysRemaining =
      dailyBurnRate > 0
        ? Math.floor(balance / dailyBurnRate)
        : -1;

    // 6. Usage by feature (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: usageData, error: usageError } = await supabase
      .from('ai_cost_events')
      .select('feature_key, estimated_cost')
      .eq('org_id', org_id)
      .gte('created_at', thirtyDaysAgo);

    if (usageError) {
      console.error('Usage query error:', usageError);
    }

    // Aggregate usage by feature_key in memory
    const featureMap = new Map<string, { total_cost: number; call_count: number }>();
    for (const row of usageData ?? []) {
      const key = row.feature_key ?? 'unknown';
      const existing = featureMap.get(key) ?? { total_cost: 0, call_count: 0 };
      existing.total_cost += row.estimated_cost ?? 0;
      existing.call_count += 1;
      featureMap.set(key, existing);
    }

    // Sort by total_cost desc and take top 5
    const sortedFeatures = Array.from(featureMap.entries())
      .sort((a, b) => b[1].total_cost - a[1].total_cost)
      .slice(0, 5);

    // Get display names for the top feature keys
    const featureKeys = sortedFeatures.map(([key]) => key);
    let featureNameMap = new Map<string, string>();

    if (featureKeys.length > 0) {
      const { data: featureConfigs, error: featureConfigError } = await supabase
        .from('ai_feature_config')
        .select('feature_key, display_name')
        .in('feature_key', featureKeys);

      if (featureConfigError) {
        console.error('Feature config query error:', featureConfigError);
      }

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

    // 7. Recent transactions
    const { data: transactionData, error: txError } = await supabase
      .from('credit_transactions')
      .select('type, amount, created_at, description, feature_key')
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (txError) {
      console.error('Transactions query error:', txError);
    }

    const recentTransactions: RecentTransaction[] = (transactionData ?? []).map(
      (tx: { type: string; amount: number; created_at: string; description: string | null; feature_key: string | null }) => ({
        type: tx.type,
        amount: tx.amount,
        created_at: tx.created_at,
        description: tx.description,
        feature_key: tx.feature_key,
      })
    );

    // 8. Last purchase date
    const { data: lastPurchaseData, error: purchaseError } = await supabase
      .from('credit_transactions')
      .select('created_at')
      .eq('org_id', org_id)
      .eq('type', 'purchase')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (purchaseError) {
      console.error('Last purchase query error:', purchaseError);
    }

    const lastPurchaseDate = lastPurchaseData?.created_at ?? null;

    // Build response
    const response: BalanceResponse = {
      balance: Math.round(balance * 100) / 100,
      daily_burn_rate: Math.round(dailyBurnRate * 100) / 100,
      projected_days_remaining: projectedDaysRemaining,
      usage_by_feature: usageByFeature,
      recent_transactions: recentTransactions,
      last_purchase_date: lastPurchaseDate,
    };

    return jsonResponse(response, req);
  } catch (error) {
    console.error('Error in get-credit-balance:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, req, 500);
  }
});

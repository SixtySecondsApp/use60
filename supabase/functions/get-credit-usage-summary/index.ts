// supabase/functions/get-credit-usage-summary/index.ts
// Returns credit usage statistics for the authenticated user.
// All credit_logs queries use a user-scoped client (RLS enforces user_id = auth.uid()).
// org_credit_balance is queried via service role (org-level data, membership verified first).

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

const VALID_QUERY_TYPES = ['today', 'this_week', 'last_30_days', 'by_category', 'burn_rate', 'top_actions'] as const;
type QueryType = typeof VALID_QUERY_TYPES[number];

interface RequestBody {
  query_type: QueryType;
  filters?: {
    category?: string;
  };
}

interface CreditLogRow {
  log_id: string;
  action_id: string;
  display_name: string;
  credits_charged: number;
  created_at: string;
  status: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // 1. Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401);
    }

    // Verify JWT and get user via service role (getUser validates the token)
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);

    if (authError || !user) {
      return errorResponse('Invalid authentication', req, 401);
    }

    // 2. Parse body
    const body: RequestBody = await req.json();
    const { query_type, filters } = body;

    if (!query_type || !VALID_QUERY_TYPES.includes(query_type)) {
      return errorResponse(
        `Invalid query_type. Must be one of: ${VALID_QUERY_TYPES.join(', ')}`,
        req,
        400
      );
    }

    // 3. User-scoped client — RLS on credit_logs filters to auth.uid() automatically
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });

    // Helper: build a map of action_id -> category from credit_menu
    // credit_menu is readable by authenticated users (is_active = true)
    async function buildCategoryMap(): Promise<Map<string, string>> {
      const { data } = await userClient
        .from('credit_menu')
        .select('action_id, category')
        .eq('is_active', true);
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        map.set(row.action_id, row.category);
      }
      return map;
    }

    // Helper: fetch credit_menu display names
    async function buildDisplayNameMap(actionIds: string[]): Promise<Map<string, string>> {
      if (actionIds.length === 0) return new Map();
      const { data } = await userClient
        .from('credit_menu')
        .select('action_id, display_name')
        .in('action_id', actionIds);
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        map.set(row.action_id, row.display_name);
      }
      return map;
    }

    // Helper: aggregate rows by category
    function aggregateByCategory(
      rows: CreditLogRow[],
      categoryMap: Map<string, string>,
      filterCategory?: string
    ): Array<{ category: string; credits: number; count: number }> {
      const agg = new Map<string, { credits: number; count: number }>();
      for (const row of rows) {
        const cat = categoryMap.get(row.action_id) ?? 'other';
        if (filterCategory && cat !== filterCategory) continue;
        const existing = agg.get(cat) ?? { credits: 0, count: 0 };
        existing.credits += Number(row.credits_charged);
        existing.count += 1;
        agg.set(cat, existing);
      }
      return Array.from(agg.entries()).map(([category, data]) => ({
        category,
        credits: Math.round(data.credits * 10000) / 10000,
        count: data.count,
      })).sort((a, b) => b.credits - a.credits);
    }

    // =========================================================================
    // Route query_type
    // =========================================================================

    switch (query_type) {
      // -----------------------------------------------------------------------
      case 'today': {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: rows, error } = await userClient
          .from('credit_logs')
          .select('log_id, action_id, display_name, credits_charged, created_at, status')
          .eq('status', 'completed')
          .gte('created_at', todayStart.toISOString());

        if (error) {
          console.error('[get-credit-usage-summary] today query error:', error);
          return errorResponse(error.message, req, 500);
        }

        const logs = (rows ?? []) as CreditLogRow[];
        const total_credits = logs.reduce((sum, r) => sum + Number(r.credits_charged), 0);
        const action_count = logs.length;

        const categoryMap = await buildCategoryMap();
        const by_category = aggregateByCategory(logs, categoryMap, filters?.category);

        return jsonResponse({ total_credits: Math.round(total_credits * 10000) / 10000, action_count, by_category }, req);
      }

      // -----------------------------------------------------------------------
      case 'this_week': {
        // DATE_TRUNC('week', NOW()) — use Monday start (ISO week)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - daysFromMonday);
        weekStart.setHours(0, 0, 0, 0);

        const { data: rows, error } = await userClient
          .from('credit_logs')
          .select('log_id, action_id, display_name, credits_charged, created_at, status')
          .eq('status', 'completed')
          .gte('created_at', weekStart.toISOString());

        if (error) {
          console.error('[get-credit-usage-summary] this_week query error:', error);
          return errorResponse(error.message, req, 500);
        }

        const logs = (rows ?? []) as CreditLogRow[];
        const total_credits = logs.reduce((sum, r) => sum + Number(r.credits_charged), 0);
        const action_count = logs.length;

        // Group by day of week
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayMap = new Map<string, number>();
        for (const row of logs) {
          const d = new Date(row.created_at);
          const dayName = dayNames[d.getDay()];
          dayMap.set(dayName, (dayMap.get(dayName) ?? 0) + Number(row.credits_charged));
        }
        const by_day = Array.from(dayMap.entries()).map(([date, credits]) => ({
          date,
          credits: Math.round(credits * 10000) / 10000,
        }));

        return jsonResponse({ total_credits: Math.round(total_credits * 10000) / 10000, action_count, by_day }, req);
      }

      // -----------------------------------------------------------------------
      case 'last_30_days': {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Current 30-day period: user-scoped client (RLS enforces user_id = auth.uid())
        const { data: currentRows, error: currentErr } = await userClient
          .from('credit_logs')
          .select('log_id, action_id, display_name, credits_charged, created_at, status')
          .eq('status', 'completed')
          .gte('created_at', thirtyDaysAgo);

        if (currentErr) {
          console.error('[get-credit-usage-summary] last_30_days query error:', currentErr);
          return errorResponse(currentErr.message, req, 500);
        }

        const logs = (currentRows ?? []) as CreditLogRow[];
        const total_credits = logs.reduce((sum, r) => sum + Number(r.credits_charged), 0);
        const action_count = logs.length;

        // Prior period trend: credit_logs RLS only covers 30 days, so use credit_log_summaries
        // (which persists aggregated data beyond the live window) via service role.
        // Summaries are keyed by month DATE (first of month). Find the prior calendar month.
        const now = new Date();
        const priorMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          .toISOString().slice(0, 10); // 'YYYY-MM-01'

        const { data: summaryRows } = await serviceClient
          .from('credit_log_summaries')
          .select('total_credits')
          .eq('user_id', user.id)
          .eq('month', priorMonthStart);

        const prev_total = (summaryRows ?? []).reduce(
          (sum: number, r: { total_credits: number }) => sum + Number(r.total_credits),
          0
        );

        // Compute trend (10% threshold)
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (prev_total > 0) {
          const pctChange = (total_credits - prev_total) / prev_total;
          if (pctChange > 0.1) trend = 'up';
          else if (pctChange < -0.1) trend = 'down';
        } else if (total_credits > 0) {
          trend = 'up';
        }

        const categoryMap = await buildCategoryMap();
        const by_category = aggregateByCategory(logs, categoryMap, filters?.category);

        return jsonResponse({
          total_credits: Math.round(total_credits * 10000) / 10000,
          action_count,
          by_category,
          trend,
          prev_total: Math.round(prev_total * 10000) / 10000,
        }, req);
      }

      // -----------------------------------------------------------------------
      case 'by_category': {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const { data: rows, error } = await userClient
          .from('credit_logs')
          .select('log_id, action_id, display_name, credits_charged, created_at, status')
          .eq('status', 'completed')
          .gte('created_at', thirtyDaysAgo);

        if (error) {
          console.error('[get-credit-usage-summary] by_category query error:', error);
          return errorResponse(error.message, req, 500);
        }

        const logs = (rows ?? []) as CreditLogRow[];
        const categoryMap = await buildCategoryMap();

        // Aggregate by category, tracking top action per category
        const catAgg = new Map<string, {
          credits: number;
          count: number;
          actionCounts: Map<string, { credits: number; count: number; display_name: string }>;
        }>();

        for (const row of logs) {
          const cat = categoryMap.get(row.action_id) ?? 'other';
          if (filters?.category && cat !== filters.category) continue;

          if (!catAgg.has(cat)) {
            catAgg.set(cat, { credits: 0, count: 0, actionCounts: new Map() });
          }
          const catEntry = catAgg.get(cat)!;
          catEntry.credits += Number(row.credits_charged);
          catEntry.count += 1;

          const existing = catEntry.actionCounts.get(row.action_id) ?? { credits: 0, count: 0, display_name: row.display_name };
          existing.credits += Number(row.credits_charged);
          existing.count += 1;
          catEntry.actionCounts.set(row.action_id, existing);
        }

        const categories = Array.from(catAgg.entries()).map(([category, data]) => {
          // Find top action by credits
          let topAction = '';
          let topCredits = 0;
          for (const [, actionData] of data.actionCounts) {
            if (actionData.credits > topCredits) {
              topCredits = actionData.credits;
              topAction = actionData.display_name;
            }
          }
          return {
            category,
            credits: Math.round(data.credits * 10000) / 10000,
            count: data.count,
            top_action: topAction,
          };
        }).sort((a, b) => b.credits - a.credits);

        return jsonResponse({ categories }, req);
      }

      // -----------------------------------------------------------------------
      case 'burn_rate': {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Fetch usage data (user-scoped)
        const [last7Result, last30Result] = await Promise.all([
          userClient
            .from('credit_logs')
            .select('credits_charged')
            .eq('status', 'completed')
            .gte('created_at', sevenDaysAgo),
          userClient
            .from('credit_logs')
            .select('credits_charged')
            .eq('status', 'completed')
            .gte('created_at', thirtyDaysAgo),
        ]);

        if (last7Result.error) {
          console.error('[get-credit-usage-summary] burn_rate 7d error:', last7Result.error);
          return errorResponse(last7Result.error.message, req, 500);
        }

        const last7Total = (last7Result.data ?? []).reduce((sum: number, r: { credits_charged: number }) => sum + Number(r.credits_charged), 0);
        const last30Total = (last30Result.data ?? []).reduce((sum: number, r: { credits_charged: number }) => sum + Number(r.credits_charged), 0);

        const daily_avg_7d = last7Total / 7;
        const daily_avg_30d = last30Total / 30;

        // Get org membership to find org_id for balance lookup
        const { data: memberships, error: memberError } = await serviceClient
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', user.id)
          .limit(1);

        if (memberError) {
          console.error('[get-credit-usage-summary] membership query error:', memberError);
          return errorResponse('Failed to resolve organization', req, 500);
        }

        const orgId = memberships?.[0]?.org_id ?? null;
        let balance = 0;

        if (orgId) {
          const { data: balanceData } = await serviceClient
            .from('org_credit_balance')
            .select('balance_credits')
            .eq('org_id', orgId)
            .maybeSingle();
          balance = Number(balanceData?.balance_credits ?? 0);
        }

        const projected_days_remaining = daily_avg_7d > 0
          ? Math.round(balance / daily_avg_7d)
          : 999;

        const projected_depletion_date = daily_avg_7d > 0
          ? new Date(Date.now() + projected_days_remaining * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          : null;

        return jsonResponse({
          daily_avg_7d: Math.round(daily_avg_7d * 10000) / 10000,
          daily_avg_30d: Math.round(daily_avg_30d * 10000) / 10000,
          balance: Math.round(balance * 100) / 100,
          projected_days_remaining,
          projected_depletion_date,
        }, req);
      }

      // -----------------------------------------------------------------------
      case 'top_actions': {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const { data: rows, error } = await userClient
          .from('credit_logs')
          .select('log_id, action_id, display_name, credits_charged, created_at, status')
          .eq('status', 'completed')
          .gte('created_at', thirtyDaysAgo);

        if (error) {
          console.error('[get-credit-usage-summary] top_actions query error:', error);
          return errorResponse(error.message, req, 500);
        }

        const logs = (rows ?? []) as CreditLogRow[];

        // Aggregate by action_id
        const actionAgg = new Map<string, {
          display_name: string;
          total_credits: number;
          count: number;
          last_used: string;
        }>();

        for (const row of logs) {
          const existing = actionAgg.get(row.action_id);
          if (!existing) {
            actionAgg.set(row.action_id, {
              display_name: row.display_name,
              total_credits: Number(row.credits_charged),
              count: 1,
              last_used: row.created_at,
            });
          } else {
            existing.total_credits += Number(row.credits_charged);
            existing.count += 1;
            if (row.created_at > existing.last_used) {
              existing.last_used = row.created_at;
            }
          }
        }

        // Get display names from credit_menu to ensure freshness
        const actionIds = Array.from(actionAgg.keys());
        const displayNameMap = await buildDisplayNameMap(actionIds);

        const top_5 = Array.from(actionAgg.entries())
          .map(([action_id, data]) => ({
            action_id,
            display_name: displayNameMap.get(action_id) ?? data.display_name,
            total_credits: Math.round(data.total_credits * 10000) / 10000,
            count: data.count,
            last_used: data.last_used,
          }))
          .sort((a, b) => b.total_credits - a.total_credits)
          .slice(0, 5);

        return jsonResponse({ top_5 }, req);
      }

      // -----------------------------------------------------------------------
      default:
        return errorResponse(`Unsupported query_type: ${query_type}`, req, 400);
    }
  } catch (error) {
    console.error('[get-credit-usage-summary] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, req, 500);
  }
});

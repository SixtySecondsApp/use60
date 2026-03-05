/**
 * useCreditHealth
 *
 * React Query hook for the Control Room Credit Health widget.
 * Fetches:
 *   - 30-day daily credit burn trend (from credit_transactions, org-scoped)
 *   - Today's agent-type breakdown (from credit_logs, user-scoped — best available under current RLS)
 *   - Budget cap settings (from check_budget_cap RPC, org-scoped)
 *
 * Refetches every 5 minutes.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface DailyBurn {
  date: string;          // YYYY-MM-DD
  credits: number;
}

export interface AgentBreakdown {
  agent_type: string;
  credits: number;
  pct: number;
}

export interface BudgetCap {
  cap_type: 'daily' | 'weekly' | 'unlimited';
  cap_amount: number | null;
  current_period_spent: number;
  period_reset_at: string | null;
}

export interface CreditHealthData {
  /** 30-day daily burn array, oldest first */
  trend: DailyBurn[];
  /** Today's credit charges grouped by agent_type */
  agentBreakdown: AgentBreakdown[];
  /** Budget cap settings */
  budgetCap: BudgetCap;
  /** Credits burned today (from credit_transactions deductions) */
  todayBurn: number;
  /** 7-day rolling average daily burn (credits/day) */
  sevenDayAvg: number;
  /**
   * Projected days until monthly budget exhausted.
   * null when no cap set or burn rate is 0.
   */
  projectedDaysRemaining: number | null;
}

// ============================================================================
// Query key factory
// ============================================================================

export const CREDIT_HEALTH_KEYS = {
  all: ['credit-health'] as const,
  org: (orgId: string) => ['credit-health', orgId] as const,
};

// ============================================================================
// Data fetchers
// ============================================================================

/** Fetch 30-day deduction totals per calendar day for the org */
async function fetchTrend(orgId: string): Promise<DailyBurn[]> {
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  // credit_transactions: org-level RLS — org members can read
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('created_at, amount')
    .eq('org_id', orgId)
    .eq('type', 'deduction')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  // Aggregate by date
  const byDate: Record<string, number> = {};
  for (const tx of data) {
    const day = tx.created_at.slice(0, 10); // YYYY-MM-DD
    // deduction amount is negative in the ledger — take abs
    byDate[day] = (byDate[day] ?? 0) + Math.abs(tx.amount as number);
  }

  // Fill every day in the 30-day window (0 if no data)
  const result: DailyBurn[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, credits: parseFloat((byDate[key] ?? 0).toFixed(4)) });
  }
  return result;
}

/** Fetch today's credit charges grouped by agent_type (user-scoped — best available) */
async function fetchAgentBreakdown(): Promise<AgentBreakdown[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('credit_logs')
    .select('agent_type, credits_charged')
    .gte('created_at', todayStart.toISOString())
    .eq('status', 'completed');

  if (error || !data || data.length === 0) return [];

  // Group by agent_type
  const grouped: Record<string, number> = {};
  let total = 0;
  for (const row of data) {
    const key = (row.agent_type as string | null) ?? 'unknown';
    const charge = parseFloat((row.credits_charged as number).toString());
    grouped[key] = (grouped[key] ?? 0) + charge;
    total += charge;
  }

  return Object.entries(grouped)
    .map(([agent_type, credits]) => ({
      agent_type,
      credits: parseFloat(credits.toFixed(4)),
      pct: total > 0 ? Math.round((credits / total) * 100) : 0,
    }))
    .sort((a, b) => b.credits - a.credits);
}

/** Fetch budget cap settings via RPC */
async function fetchBudgetCap(orgId: string): Promise<BudgetCap> {
  const defaultCap: BudgetCap = {
    cap_type: 'unlimited',
    cap_amount: null,
    current_period_spent: 0,
    period_reset_at: null,
  };

  const { data, error } = await supabase.rpc('get_budget_cap', { p_org_id: orgId });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return defaultCap;
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    cap_type: (row.cap_type as BudgetCap['cap_type']) ?? 'unlimited',
    cap_amount: row.cap_amount != null ? parseFloat(row.cap_amount) : null,
    current_period_spent: parseFloat(row.current_period_spent ?? '0'),
    period_reset_at: row.period_reset_at ?? null,
  };
}

// ============================================================================
// Derived calculations
// ============================================================================

function computeSevenDayAvg(trend: DailyBurn[]): number {
  const last7 = trend.slice(-7);
  if (last7.length === 0) return 0;
  const sum = last7.reduce((acc, d) => acc + d.credits, 0);
  return sum / last7.length;
}

function computeProjectedDays(
  budgetCap: BudgetCap,
  sevenDayAvg: number
): number | null {
  if (budgetCap.cap_type === 'unlimited') return null;
  if (!budgetCap.cap_amount || sevenDayAvg <= 0) return null;

  // Monthly budget equivalent from period cap
  let monthlyBudget: number;
  if (budgetCap.cap_type === 'daily') {
    monthlyBudget = budgetCap.cap_amount * 30;
  } else {
    // weekly → ~4.33 weeks/month
    monthlyBudget = budgetCap.cap_amount * 4.33;
  }

  const remaining = monthlyBudget - budgetCap.current_period_spent;
  if (remaining <= 0) return 0;

  return Math.ceil(remaining / sevenDayAvg);
}

// ============================================================================
// Main hook
// ============================================================================

export function useCreditHealth() {
  const orgId = useActiveOrgId();

  return useQuery<CreditHealthData>({
    queryKey: CREDIT_HEALTH_KEYS.org(orgId ?? '__no_org__'),
    enabled: !!orgId,
    refetchInterval: 300_000, // 5 minutes
    staleTime: 60_000,        // 1 minute
    queryFn: async (): Promise<CreditHealthData> => {
      if (!orgId) {
        return emptyData();
      }

      const [trend, agentBreakdown, budgetCap] = await Promise.all([
        fetchTrend(orgId),
        fetchAgentBreakdown(),
        fetchBudgetCap(orgId),
      ]);

      // Today's burn from last item in trend (today's date)
      const todayBurn = trend.length > 0 ? trend[trend.length - 1].credits : 0;

      const sevenDayAvg = computeSevenDayAvg(trend);
      const projectedDaysRemaining = computeProjectedDays(budgetCap, sevenDayAvg);

      return {
        trend,
        agentBreakdown,
        budgetCap,
        todayBurn,
        sevenDayAvg,
        projectedDaysRemaining,
      };
    },
  });
}

function emptyData(): CreditHealthData {
  return {
    trend: [],
    agentBreakdown: [],
    budgetCap: {
      cap_type: 'unlimited',
      cap_amount: null,
      current_period_spent: 0,
      period_reset_at: null,
    },
    todayBurn: 0,
    sevenDayAvg: 0,
    projectedDaysRemaining: null,
  };
}

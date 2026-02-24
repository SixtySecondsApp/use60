// src/lib/services/billingAnalyticsService.ts
// Service for billing analytics metrics (RevenueCat-inspired)

import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Types
// ============================================================================

export interface MRRData {
  total_mrr_cents: number;
  active_subscriptions: number;
  trialing_subscriptions: number;
  currency: string;
}

export interface MRRByDate {
  date: string;
  mrr_cents: number;
  active_subscriptions: number;
  trialing_subscriptions: number;
  currency: string;
}

export interface ChurnRate {
  period_start: string;
  period_end: string;
  subscriber_churn_rate: number;
  mrr_churn_rate: number;
  subscribers_canceled: number;
  mrr_lost_cents: number;
  active_subscriptions_start: number;
  mrr_start_cents: number;
  currency: string;
}

export interface RetentionCohort {
  cohort_month: string;
  cohort_size: number;
  retention_month: number;
  retained_count: number;
  retention_rate: number;
  mrr_retained_cents: number;
}

export interface RealizedLTV {
  org_id: string;
  cohort_month: string;
  total_paid_cents: number;
  subscription_months: number;
  avg_monthly_revenue_cents: number;
  currency: string;
}

export interface TrialConversion {
  period_start: string;
  period_end: string;
  trials_started: number;
  trials_converted: number;
  conversion_rate: number;
  avg_trial_days: number;
}

export interface MRRMovement {
  change_date: string;
  currency: string;
  new_subscriptions: number;
  new_mrr_cents: number;
  plan_changes: number;
  canceled_subscriptions: number;
  churned_mrr_cents: number;
}

// ============================================================================
// Current MRR
// ============================================================================

export async function getCurrentMRR(): Promise<MRRData[]> {
  const { data, error } = await supabase
    .from('mrr_current_view')
    .select('*');

  if (error) {
    console.error('Error fetching current MRR:', error);
    throw new Error('Failed to fetch current MRR');
  }

  return data || [];
}

// ============================================================================
// MRR by Date Range
// ============================================================================

export async function getMRRByDateRange(
  startDate: Date,
  endDate: Date,
  currency?: string
): Promise<MRRByDate[]> {
  const { data, error } = await supabase.rpc('get_mrr_by_date_range', {
    p_start_date: startDate.toISOString().split('T')[0],
    p_end_date: endDate.toISOString().split('T')[0],
    p_currency: currency || null,
  });

  if (error) {
    console.error('Error fetching MRR by date range:', error);
    throw new Error('Failed to fetch MRR by date range');
  }

  return data || [];
}

// ============================================================================
// Churn Rate
// ============================================================================

export async function getChurnRate(
  startDate: Date,
  endDate: Date,
  currency?: string
): Promise<ChurnRate[]> {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  // Active subscriptions at period start (status active/trialing before start date)
  const { data: activeAtStart, error: activeError } = await supabase
    .from('organization_subscriptions')
    .select('id, current_recurring_amount_cents, currency')
    .in('status', ['active', 'trialing'])
    .lte('started_at', startIso)
    .or(`canceled_at.is.null,canceled_at.gt.${startIso}`);

  if (activeError) {
    console.error('Error fetching active subscriptions for churn rate:', activeError);
    throw new Error('Failed to calculate churn rate');
  }

  // Subscriptions canceled during the period
  const { data: canceled, error: canceledError } = await supabase
    .from('organization_subscriptions')
    .select('id, current_recurring_amount_cents, currency')
    .eq('status', 'canceled')
    .gte('canceled_at', startIso)
    .lte('canceled_at', endIso);

  if (canceledError) {
    console.error('Error fetching canceled subscriptions for churn rate:', canceledError);
    throw new Error('Failed to calculate churn rate');
  }

  const activeSubs = activeAtStart || [];
  const canceledSubs = canceled || [];

  // Filter by currency if specified
  const filteredActive = currency
    ? activeSubs.filter((s) => s.currency === currency)
    : activeSubs;
  const filteredCanceled = currency
    ? canceledSubs.filter((s) => s.currency === currency)
    : canceledSubs;

  const activeCount = filteredActive.length;
  const canceledCount = filteredCanceled.length;
  const mrrStart = filteredActive.reduce(
    (sum, s) => sum + (s.current_recurring_amount_cents || 0),
    0
  );
  const mrrLost = filteredCanceled.reduce(
    (sum, s) => sum + (s.current_recurring_amount_cents || 0),
    0
  );

  const subscriberChurnRate = activeCount > 0 ? (canceledCount / activeCount) * 100 : 0;
  const mrrChurnRate = mrrStart > 0 ? (mrrLost / mrrStart) * 100 : 0;

  // Return empty array (no data) rather than zeros when there are no subscriptions at all
  if (activeCount === 0 && canceledCount === 0) {
    return [];
  }

  return [
    {
      period_start: startDate.toISOString().split('T')[0],
      period_end: endDate.toISOString().split('T')[0],
      subscriber_churn_rate: Math.round(subscriberChurnRate * 10) / 10,
      mrr_churn_rate: Math.round(mrrChurnRate * 10) / 10,
      subscribers_canceled: canceledCount,
      mrr_lost_cents: mrrLost,
      active_subscriptions_start: activeCount,
      mrr_start_cents: mrrStart,
      currency: currency || filteredActive[0]?.currency || filteredCanceled[0]?.currency || 'GBP',
    },
  ];
}

// ============================================================================
// Retention Cohorts
// ============================================================================

export async function getRetentionCohorts(
  cohortStart: Date,
  cohortEnd: Date,
  retentionMonths: number[] = [1, 3, 6, 12]
): Promise<RetentionCohort[]> {
  const { data, error } = await supabase.rpc('get_subscription_retention_cohorts', {
    p_cohort_start: cohortStart.toISOString().split('T')[0],
    p_cohort_end: cohortEnd.toISOString().split('T')[0],
    p_retention_months: retentionMonths,
  });

  if (error) {
    console.error('Error fetching retention cohorts:', error);
    throw new Error('Failed to fetch retention cohorts');
  }

  return data || [];
}

// ============================================================================
// Realized LTV
// ============================================================================

export async function getRealizedLTV(
  cohortStart?: Date,
  cohortEnd?: Date,
  currency?: string
): Promise<RealizedLTV[]> {
  const { data, error } = await supabase.rpc('calculate_realized_ltv', {
    p_cohort_start: cohortStart?.toISOString().split('T')[0] || null,
    p_cohort_end: cohortEnd?.toISOString().split('T')[0] || null,
    p_currency: currency || null,
  });

  if (error) {
    console.error('Error calculating realized LTV:', error);
    throw new Error('Failed to calculate realized LTV');
  }

  return data || [];
}

// ============================================================================
// Trial Conversion Rate
// ============================================================================

export async function getTrialConversionRate(
  startDate: Date,
  endDate: Date
): Promise<TrialConversion[]> {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  // All orgs that started a trial in the period
  const { data: trialsStarted, error: trialsError } = await supabase
    .from('organization_subscriptions')
    .select('id, status, trial_start_at, trial_ends_at')
    .gte('trial_start_at', startIso)
    .lte('trial_start_at', endIso)
    .not('trial_start_at', 'is', null);

  if (trialsError) {
    console.error('Error fetching trial starts for conversion rate:', trialsError);
    throw new Error('Failed to calculate trial conversion rate');
  }

  const trials = trialsStarted || [];

  if (trials.length === 0) {
    return [];
  }

  // Converted = trial that became active (status = 'active' and had a trial)
  const converted = trials.filter((t) => t.status === 'active');

  // Average trial duration in days
  const trialsWithDuration = trials.filter(
    (t) => t.trial_start_at && t.trial_ends_at
  );
  const avgTrialDays =
    trialsWithDuration.length > 0
      ? trialsWithDuration.reduce((sum, t) => {
          const start = new Date(t.trial_start_at!).getTime();
          const end = new Date(t.trial_ends_at!).getTime();
          return sum + (end - start) / (1000 * 60 * 60 * 24);
        }, 0) / trialsWithDuration.length
      : 0;

  const conversionRate = (converted.length / trials.length) * 100;

  return [
    {
      period_start: startDate.toISOString().split('T')[0],
      period_end: endDate.toISOString().split('T')[0],
      trials_started: trials.length,
      trials_converted: converted.length,
      conversion_rate: Math.round(conversionRate * 10) / 10,
      avg_trial_days: Math.round(avgTrialDays * 10) / 10,
    },
  ];
}

// ============================================================================
// MRR Movement
// ============================================================================

export async function getMRRMovement(limit: number = 30): Promise<MRRMovement[]> {
  const { data, error } = await supabase
    .from('mrr_movement_view')
    .select('*')
    .order('change_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching MRR movement:', error);
    throw new Error('Failed to fetch MRR movement');
  }

  return data || [];
}

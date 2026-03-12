// src/lib/hooks/useBillingAnalytics.ts
// React Query hooks for billing analytics

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import {
  getCurrentMRR,
  getMRRByDateRange,
  getChurnRate,
  getRetentionCohorts,
  getRealizedLTV,
  getTrialConversionRate,
  getMRRMovement,
} from '../services/billingAnalyticsService';
import type {
  MRRData,
  MRRByDate,
  ChurnRate,
  RetentionCohort,
  RealizedLTV,
  TrialConversion,
  MRRMovement,
} from '../services/billingAnalyticsService';

// Query keys
export const billingAnalyticsKeys = {
  all: ['billing-analytics'] as const,
  currentMRR: () => [...billingAnalyticsKeys.all, 'current-mrr'] as const,
  mrrByDateRange: (start: Date, end: Date, currency?: string) =>
    [...billingAnalyticsKeys.all, 'mrr-by-date', start.toISOString(), end.toISOString(), currency] as const,
  churnRate: (start: Date, end: Date, currency?: string) =>
    [...billingAnalyticsKeys.all, 'churn-rate', start.toISOString(), end.toISOString(), currency] as const,
  retentionCohorts: (start: Date, end: Date, months: number[]) =>
    [...billingAnalyticsKeys.all, 'retention-cohorts', start.toISOString(), end.toISOString(), months.join(',')] as const,
  realizedLTV: (start?: Date, end?: Date, currency?: string) =>
    [...billingAnalyticsKeys.all, 'realized-ltv', start?.toISOString(), end?.toISOString(), currency] as const,
  trialConversion: (start: Date, end: Date) =>
    [...billingAnalyticsKeys.all, 'trial-conversion', start.toISOString(), end.toISOString()] as const,
  mrrMovement: (limit: number) =>
    [...billingAnalyticsKeys.all, 'mrr-movement', limit] as const,
};

/**
 * Get current MRR snapshot
 */
export function useCurrentMRR() {
  return useQuery<MRRData[]>({
    queryKey: billingAnalyticsKeys.currentMRR(),
    queryFn: getCurrentMRR,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get MRR by date range
 */
export function useMRRByDateRange(
  startDate: Date,
  endDate: Date,
  currency?: string,
  enabled: boolean = true
) {
  return useQuery<MRRByDate[]>({
    queryKey: billingAnalyticsKeys.mrrByDateRange(startDate, endDate, currency),
    queryFn: () => getMRRByDateRange(startDate, endDate, currency),
    enabled: enabled && !!startDate && !!endDate,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Get churn rate for a period
 */
export function useChurnRate(
  startDate: Date,
  endDate: Date,
  currency?: string,
  enabled: boolean = true
) {
  return useQuery<ChurnRate[]>({
    queryKey: billingAnalyticsKeys.churnRate(startDate, endDate, currency),
    queryFn: () => getChurnRate(startDate, endDate, currency),
    enabled: enabled && !!startDate && !!endDate,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Get retention cohorts
 */
export function useRetentionCohorts(
  cohortStart: Date,
  cohortEnd: Date,
  retentionMonths: number[] = [1, 3, 6, 12],
  enabled: boolean = true
) {
  return useQuery<RetentionCohort[]>({
    queryKey: billingAnalyticsKeys.retentionCohorts(cohortStart, cohortEnd, retentionMonths),
    queryFn: () => getRetentionCohorts(cohortStart, cohortEnd, retentionMonths),
    enabled: enabled && !!cohortStart && !!cohortEnd,
    staleTime: 1000 * 60 * 10, // 10 minutes - cohorts change less frequently
  });
}

/**
 * Get realized LTV
 */
export function useRealizedLTV(
  cohortStart?: Date,
  cohortEnd?: Date,
  currency?: string,
  enabled: boolean = true
) {
  return useQuery<RealizedLTV[]>({
    queryKey: billingAnalyticsKeys.realizedLTV(cohortStart, cohortEnd, currency),
    queryFn: () => getRealizedLTV(cohortStart, cohortEnd, currency),
    enabled,
    staleTime: 1000 * 60 * 10,
  });
}

/**
 * Get trial conversion rate
 */
export function useTrialConversionRate(
  startDate: Date,
  endDate: Date,
  enabled: boolean = true
) {
  return useQuery<TrialConversion[]>({
    queryKey: billingAnalyticsKeys.trialConversion(startDate, endDate),
    queryFn: () => getTrialConversionRate(startDate, endDate),
    enabled: enabled && !!startDate && !!endDate,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Get MRR movement
 */
export function useMRRMovement(limit: number = 30) {
  return useQuery<MRRMovement[]>({
    queryKey: billingAnalyticsKeys.mrrMovement(limit),
    queryFn: () => getMRRMovement(limit),
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================================
// Coupon Analytics (SCS-006)
// ============================================================================

export interface CouponAnalyticsData {
  activeCoupons: number;
  totalRedemptions: number;
  totalDiscountCents: number;
  perCoupon: Array<{
    id: string;
    stripe_coupon_id: string;
    name: string;
    discount_type: string;
    discount_value: number;
    currency: string | null;
    times_redeemed: number;
    is_active: boolean;
    created_at: string;
    redemption_count: number;
    total_discount_cents: number;
    last_used: string | null;
  }>;
}

/**
 * Fetch coupon analytics: active coupons, total redemptions, discount given, per-coupon breakdown
 */
export function useCouponAnalytics() {
  return useQuery<CouponAnalyticsData>({
    queryKey: ['billing', 'coupon-analytics'],
    queryFn: async () => {
      // Get all coupons
      const { data: coupons } = await supabase
        .from('stripe_coupons')
        .select('id, stripe_coupon_id, name, discount_type, discount_value, currency, times_redeemed, is_active, created_at');

      // Get redemptions with aggregates
      const { data: redemptions } = await supabase
        .from('coupon_redemptions')
        .select('id, coupon_id, discount_amount_cents, applied_at, removed_at');

      const activeCoupons = (coupons || []).filter((c) => c.is_active).length;
      const totalRedemptions = (redemptions || []).length;
      const totalDiscountCents = (redemptions || []).reduce(
        (sum, r) => sum + (r.discount_amount_cents || 0),
        0
      );

      // Per-coupon breakdown
      const perCoupon = (coupons || []).map((c) => {
        const couponRedemptions = (redemptions || []).filter((r) => r.coupon_id === c.id);
        return {
          ...c,
          redemption_count: couponRedemptions.length,
          total_discount_cents: couponRedemptions.reduce(
            (s, r) => s + (r.discount_amount_cents || 0),
            0
          ),
          last_used:
            couponRedemptions.length > 0
              ? couponRedemptions
                  .sort(
                    (a, b) =>
                      new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()
                  )[0].applied_at
              : null,
        };
      });

      return { activeCoupons, totalRedemptions, totalDiscountCents, perCoupon };
    },
    staleTime: 1000 * 60 * 5,
  });
}

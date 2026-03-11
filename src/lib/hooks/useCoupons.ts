// src/lib/hooks/useCoupons.ts
// React Query hooks for coupon admin

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { couponAdminService } from '@/lib/services/couponAdminService';
import type { CreateCouponInput, CreatePromotionCodeInput } from '@/lib/types/subscription';
import { toast } from 'sonner';

const QUERY_KEYS = {
  coupons: ['coupons'] as const,
  promotionCodes: (couponId?: string) => ['promotion-codes', couponId] as const,
};

export function useCoupons() {
  return useQuery({
    queryKey: QUERY_KEYS.coupons,
    queryFn: () => couponAdminService.listCoupons(),
  });
}

export function useCreateCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCouponInput) => couponAdminService.createCoupon(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.coupons });
      toast.success('Coupon created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create coupon');
    },
  });
}

export function useUpdateCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ couponId, updates }: { couponId: string; updates: { name?: string; metadata?: Record<string, string> } }) =>
      couponAdminService.updateCoupon(couponId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.coupons });
      toast.success('Coupon updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update coupon');
    },
  });
}

export function useDeleteCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (couponId: string) => couponAdminService.deleteCoupon(couponId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.coupons });
      toast.success('Coupon deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete coupon');
    },
  });
}

export function usePromotionCodes(couponId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.promotionCodes(couponId),
    queryFn: () => couponAdminService.listPromotionCodes(couponId),
    enabled: !!couponId,
  });
}

export function useCreatePromotionCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePromotionCodeInput) => couponAdminService.createPromotionCode(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.promotionCodes(variables.coupon_id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.coupons });
      toast.success('Promotion code created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create promotion code');
    },
  });
}

export function useUpdatePromotionCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ promoCodeId, isActive, couponId }: { promoCodeId: string; isActive: boolean; couponId?: string }) =>
      couponAdminService.updatePromotionCode(promoCodeId, isActive),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.promotionCodes(variables.couponId) });
      toast.success(variables.isActive ? 'Promotion code activated' : 'Promotion code deactivated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update promotion code');
    },
  });
}

export function useApplyToSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, couponId }: { orgId: string; couponId: string }) =>
      couponAdminService.applyToSubscription(orgId, couponId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.coupons });
      toast.success('Coupon applied to subscription');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to apply coupon');
    },
  });
}

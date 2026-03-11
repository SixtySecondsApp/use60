// src/lib/services/couponAdminService.ts
// Frontend service for coupon admin edge function

import { supabase } from '@/lib/supabase/clientV2';
import type {
  StripeCoupon,
  StripePromotionCode,
  CreateCouponInput,
  CreatePromotionCodeInput,
} from '@/lib/types/subscription';

async function invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('coupon-admin-router', {
    body: { action, ...params },
  });

  if (error) throw new Error(error.message || 'Coupon admin request failed');
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const couponAdminService = {
  async listCoupons(): Promise<StripeCoupon[]> {
    const result = await invoke<{ coupons: StripeCoupon[] }>('list_coupons');
    return result.coupons;
  },

  async createCoupon(input: CreateCouponInput): Promise<StripeCoupon> {
    const result = await invoke<{ coupon: StripeCoupon }>('create_coupon', input);
    return result.coupon;
  },

  async updateCoupon(couponId: string, updates: { name?: string; metadata?: Record<string, string> }): Promise<StripeCoupon> {
    const result = await invoke<{ coupon: StripeCoupon }>('update_coupon', { coupon_id: couponId, ...updates });
    return result.coupon;
  },

  async deleteCoupon(couponId: string): Promise<void> {
    await invoke('delete_coupon', { coupon_id: couponId });
  },

  async listPromotionCodes(couponId?: string): Promise<StripePromotionCode[]> {
    const result = await invoke<{ promotion_codes: StripePromotionCode[] }>('list_promotion_codes', couponId ? { coupon_id: couponId } : {});
    return result.promotion_codes;
  },

  async createPromotionCode(input: CreatePromotionCodeInput): Promise<StripePromotionCode> {
    const result = await invoke<{ promotion_code: StripePromotionCode }>('create_promotion_code', input);
    return result.promotion_code;
  },

  async updatePromotionCode(promoCodeId: string, isActive: boolean): Promise<StripePromotionCode> {
    const result = await invoke<{ promotion_code: StripePromotionCode }>('update_promotion_code', { promotion_code_id: promoCodeId, is_active: isActive });
    return result.promotion_code;
  },

  async applyToSubscription(orgId: string, couponId: string): Promise<{ discount_info: Record<string, unknown> }> {
    return await invoke('apply_to_subscription', { org_id: orgId, coupon_id: couponId });
  },
};

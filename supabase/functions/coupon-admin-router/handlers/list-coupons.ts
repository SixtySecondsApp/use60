// supabase/functions/coupon-admin-router/handlers/list-coupons.ts
// Lists all coupons from local stripe_coupons table with promotion code counts

import { getCorsHeaders } from "../../_shared/corsHelper.ts";
import { captureException } from "../../_shared/sentryEdge.ts";
import { requireSuperAdmin } from "../helpers/auth.ts";

export async function handleListCoupons(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  try {
    const { supabase } = await requireSuperAdmin(req);

    // Fetch all coupons ordered by creation date
    const { data: coupons, error: couponsError } = await supabase
      .from("stripe_coupons")
      .select("id, stripe_coupon_id, name, discount_type, discount_value, currency, duration, duration_in_months, max_redemptions, times_redeemed, redeem_by, applies_to_products, is_active, metadata, created_by, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (couponsError) {
      console.error("[list-coupons] Error fetching coupons:", couponsError);
      throw new Error(`Failed to fetch coupons: ${couponsError.message}`);
    }

    // Fetch promotion code counts per coupon
    const couponIds = (coupons || []).map((c) => c.id);
    let promoCounts: Record<string, number> = {};

    if (couponIds.length > 0) {
      const { data: promoData, error: promoError } = await supabase
        .from("stripe_promotion_codes")
        .select("coupon_id");

      if (promoError) {
        console.error("[list-coupons] Error fetching promo counts:", promoError);
        // Non-fatal: continue without counts
      } else if (promoData) {
        promoCounts = promoData.reduce((acc: Record<string, number>, row) => {
          acc[row.coupon_id] = (acc[row.coupon_id] || 0) + 1;
          return acc;
        }, {});
      }
    }

    // Merge counts into coupon objects
    const result = (coupons || []).map((coupon) => ({
      ...coupon,
      promotion_code_count: promoCounts[coupon.id] || 0,
    }));

    console.log(`[list-coupons] Returned ${result.length} coupons`);

    return new Response(
      JSON.stringify({ success: true, coupons: result }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[list-coupons] Error:", error);
    await captureException(error, {
      tags: { function: "coupon-admin-router/list_coupons", integration: "stripe" },
    });
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
}

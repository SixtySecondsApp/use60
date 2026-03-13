// supabase/functions/coupon-admin-router/handlers/update-coupon.ts
// Updates a Stripe coupon (name and metadata only — Stripe limitation)

import { getStripeClient } from "../../_shared/stripe.ts";
import { getCorsHeaders } from "../../_shared/corsHelper.ts";
import { captureException } from "../../_shared/sentryEdge.ts";
import { requireSuperAdmin } from "../helpers/auth.ts";

interface UpdateCouponRequest {
  coupon_id: string; // our UUID
  name?: string;
  metadata?: Record<string, string>;
}

export async function handleUpdateCoupon(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  try {
    const { supabase } = await requireSuperAdmin(req);

    const body: { action: string } & UpdateCouponRequest = await req.json();
    const { coupon_id, name, metadata } = body;

    if (!coupon_id) throw new Error("Missing required field: coupon_id");
    if (!name && !metadata) throw new Error("At least one of name or metadata must be provided");

    // Look up the stripe_coupon_id from local table
    const { data: existing, error: lookupError } = await supabase
      .from("stripe_coupons")
      .select("stripe_coupon_id")
      .eq("id", coupon_id)
      .maybeSingle();

    if (lookupError) {
      throw new Error(`Failed to look up coupon: ${lookupError.message}`);
    }
    if (!existing) {
      throw new Error("Coupon not found");
    }

    // Build Stripe update params (only name and metadata are updatable)
    const stripeParams: Record<string, unknown> = {};
    if (name !== undefined) stripeParams.name = name;
    if (metadata !== undefined) stripeParams.metadata = metadata;

    // Update in Stripe
    const stripe = getStripeClient();
    console.log(`[update-coupon] Updating Stripe coupon ${existing.stripe_coupon_id}:`, JSON.stringify(stripeParams));
    await stripe.coupons.update(existing.stripe_coupon_id, stripeParams);

    // Update local record
    const localUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) localUpdate.name = name;
    if (metadata !== undefined) localUpdate.metadata = metadata;

    const { data: coupon, error: updateError } = await supabase
      .from("stripe_coupons")
      .update(localUpdate)
      .eq("id", coupon_id)
      .select("id, stripe_coupon_id, name, discount_type, discount_value, currency, duration, duration_in_months, max_redemptions, times_redeemed, redeem_by, applies_to_products, is_active, metadata, created_by, created_at, updated_at")
      .single();

    if (updateError) {
      console.error("[update-coupon] Error updating local record:", updateError);
      throw new Error(`Stripe coupon updated but failed to update locally: ${updateError.message}`);
    }

    console.log(`[update-coupon] Coupon updated: ${coupon_id}`);

    return new Response(
      JSON.stringify({ success: true, coupon }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[update-coupon] Error:", error);
    await captureException(error, {
      tags: { function: "coupon-admin-router/update_coupon", integration: "stripe" },
    });
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
}

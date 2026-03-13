// supabase/functions/coupon-admin-router/handlers/create-coupon.ts
// Creates a Stripe coupon and inserts a local record

import { getStripeClient } from "../../_shared/stripe.ts";
import { getCorsHeaders } from "../../_shared/corsHelper.ts";
import { captureException } from "../../_shared/sentryEdge.ts";
import { requireSuperAdmin } from "../helpers/auth.ts";

interface CreateCouponRequest {
  name: string;
  discount_type: "percent_off" | "amount_off";
  discount_value: number;
  currency?: string;
  duration: "once" | "repeating" | "forever";
  duration_in_months?: number;
  max_redemptions?: number;
  redeem_by?: string;
  applies_to_products?: string[];
  metadata?: Record<string, string>;
}

export async function handleCreateCoupon(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  try {
    const { user, supabase } = await requireSuperAdmin(req);

    const body: { action: string } & CreateCouponRequest = await req.json();
    const {
      name,
      discount_type,
      discount_value,
      currency = "GBP",
      duration,
      duration_in_months,
      max_redemptions,
      redeem_by,
      applies_to_products,
      metadata,
    } = body;

    // Validate required fields
    if (!name) throw new Error("Missing required field: name");
    if (!discount_type || !["percent_off", "amount_off"].includes(discount_type)) {
      throw new Error("discount_type must be 'percent_off' or 'amount_off'");
    }
    if (discount_value == null || discount_value <= 0) {
      throw new Error("discount_value must be a positive number");
    }
    if (!duration || !["once", "repeating", "forever"].includes(duration)) {
      throw new Error("duration must be 'once', 'repeating', or 'forever'");
    }
    if (duration === "repeating" && !duration_in_months) {
      throw new Error("duration_in_months is required when duration is 'repeating'");
    }
    if (discount_type === "percent_off" && discount_value > 100) {
      throw new Error("percent_off discount_value cannot exceed 100");
    }

    // Build Stripe coupon params
    const stripeParams: Record<string, unknown> = {
      name,
      duration,
    };

    if (discount_type === "percent_off") {
      stripeParams.percent_off = discount_value;
    } else {
      // amount_off expects integer (smallest currency unit, e.g. pence)
      stripeParams.amount_off = Math.round(discount_value);
      stripeParams.currency = currency.toLowerCase();
    }

    if (duration === "repeating" && duration_in_months) {
      stripeParams.duration_in_months = duration_in_months;
    }

    if (max_redemptions) {
      stripeParams.max_redemptions = max_redemptions;
    }

    if (redeem_by) {
      // Convert ISO date string to unix timestamp
      stripeParams.redeem_by = Math.floor(new Date(redeem_by).getTime() / 1000);
    }

    if (applies_to_products && applies_to_products.length > 0) {
      stripeParams.applies_to = { products: applies_to_products };
    }

    if (metadata && Object.keys(metadata).length > 0) {
      stripeParams.metadata = metadata;
    }

    // Create coupon in Stripe
    const stripe = getStripeClient();
    console.log("[create-coupon] Creating Stripe coupon:", JSON.stringify(stripeParams));
    const stripeCoupon = await stripe.coupons.create(stripeParams);
    console.log(`[create-coupon] Stripe coupon created: ${stripeCoupon.id}`);

    // Insert local record
    const { data: coupon, error: insertError } = await supabase
      .from("stripe_coupons")
      .insert({
        stripe_coupon_id: stripeCoupon.id,
        name,
        discount_type,
        discount_value,
        currency: discount_type === "amount_off" ? currency.toUpperCase() : null,
        duration,
        duration_in_months: duration === "repeating" ? duration_in_months : null,
        max_redemptions: max_redemptions || null,
        redeem_by: redeem_by || null,
        applies_to_products: applies_to_products || [],
        is_active: true,
        metadata: metadata || {},
        created_by: user.id,
      })
      .select("id, stripe_coupon_id, name, discount_type, discount_value, currency, duration, duration_in_months, max_redemptions, times_redeemed, redeem_by, applies_to_products, is_active, metadata, created_by, created_at, updated_at")
      .single();

    if (insertError) {
      console.error("[create-coupon] Error inserting local record:", insertError);
      throw new Error(`Stripe coupon created (${stripeCoupon.id}) but failed to save locally: ${insertError.message}`);
    }

    console.log(`[create-coupon] Local coupon record created: ${coupon.id}`);

    return new Response(
      JSON.stringify({ success: true, coupon }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[create-coupon] Error:", error);
    await captureException(error, {
      tags: { function: "coupon-admin-router/create_coupon", integration: "stripe" },
    });
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
}

// supabase/functions/coupon-admin-router/handlers/create-promotion-code.ts
import { getStripeClient } from "../../_shared/stripe.ts";
import { getCorsHeaders } from "../../_shared/corsHelper.ts";
import { captureException } from "../../_shared/sentryEdge.ts";
import { requireSuperAdmin } from "../helpers/auth.ts";

export async function handleCreatePromotionCode(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  try {
    const { supabase } = await requireSuperAdmin(req);
    const body = await req.json();
    const { coupon_id, code, max_redemptions, expires_at, first_time_only, minimum_amount_cents, minimum_amount_currency } = body;

    if (!coupon_id || !code) throw new Error("Missing required fields: coupon_id, code");

    const { data: coupon, error: lookupError } = await supabase
      .from("stripe_coupons")
      .select("stripe_coupon_id")
      .eq("id", coupon_id)
      .maybeSingle();

    if (lookupError) throw new Error(`Lookup failed: ${lookupError.message}`);
    if (!coupon) throw new Error("Coupon not found");

    const stripe = getStripeClient();
    const stripeParams: Record<string, unknown> = {
      coupon: coupon.stripe_coupon_id,
      code: code.toUpperCase(),
    };

    if (max_redemptions) stripeParams.max_redemptions = max_redemptions;
    if (expires_at) stripeParams.expires_at = Math.floor(new Date(expires_at).getTime() / 1000);

    const restrictions: Record<string, unknown> = {};
    if (first_time_only) restrictions.first_time_transaction = true;
    if (minimum_amount_cents) {
      restrictions.minimum_amount = minimum_amount_cents;
      restrictions.minimum_amount_currency = (minimum_amount_currency || "gbp").toLowerCase();
    }
    if (Object.keys(restrictions).length > 0) stripeParams.restrictions = restrictions;

    const stripePromo = await stripe.promotionCodes.create(stripeParams as any);

    const { data: promoCode, error: insertError } = await supabase
      .from("stripe_promotion_codes")
      .insert({
        coupon_id,
        stripe_promotion_code_id: stripePromo.id,
        code: code.toUpperCase(),
        is_active: true,
        max_redemptions: max_redemptions || null,
        times_redeemed: 0,
        expires_at: expires_at ? new Date(expires_at).toISOString() : null,
        first_time_only: first_time_only || false,
        minimum_amount_cents: minimum_amount_cents || null,
        minimum_amount_currency: (minimum_amount_currency || "GBP").toUpperCase(),
      })
      .select("id, coupon_id, stripe_promotion_code_id, code, is_active, max_redemptions, expires_at, first_time_only, minimum_amount_cents, created_at")
      .single();

    if (insertError) throw new Error(`Stripe promo created but local insert failed: ${insertError.message}`);

    return new Response(
      JSON.stringify({ success: true, promotion_code: promoCode }),
      { status: 201, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[create-promotion-code] Error:", error);
    await captureException(error, { tags: { function: "coupon-admin-router/create_promotion_code", integration: "stripe" } });
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
}

// supabase/functions/coupon-admin-router/handlers/apply-to-subscription.ts
import { getStripeClient } from "../../_shared/stripe.ts";
import { getCorsHeaders } from "../../_shared/corsHelper.ts";
import { captureException } from "../../_shared/sentryEdge.ts";
import { requireSuperAdmin } from "../helpers/auth.ts";

export async function handleApplyToSubscription(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  try {
    const { supabase } = await requireSuperAdmin(req);
    const body = await req.json();
    const { org_id, coupon_id } = body;

    if (!org_id || !coupon_id) throw new Error("Missing required fields: org_id, coupon_id");

    const { data: sub, error: subError } = await supabase
      .from("organization_subscriptions")
      .select("stripe_subscription_id")
      .eq("org_id", org_id)
      .maybeSingle();

    if (subError) throw new Error(`Subscription lookup failed: ${subError.message}`);
    if (!sub?.stripe_subscription_id) throw new Error("Organization has no active Stripe subscription");

    const { data: coupon, error: couponError } = await supabase
      .from("stripe_coupons")
      .select("stripe_coupon_id, name, discount_type, discount_value, duration, duration_in_months, times_redeemed")
      .eq("id", coupon_id)
      .maybeSingle();

    if (couponError) throw new Error(`Coupon lookup failed: ${couponError.message}`);
    if (!coupon) throw new Error("Coupon not found");

    const stripe = getStripeClient();
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      coupon: coupon.stripe_coupon_id,
    });
    console.log(`[apply-to-subscription] Applied coupon ${coupon.stripe_coupon_id} to ${sub.stripe_subscription_id}`);

    await supabase.from("coupon_redemptions").insert({
      coupon_id,
      org_id,
      stripe_subscription_id: sub.stripe_subscription_id,
      discount_amount_cents: 0,
      applied_at: new Date().toISOString(),
    });

    await supabase
      .from("stripe_coupons")
      .update({ times_redeemed: coupon.times_redeemed + 1, updated_at: new Date().toISOString() })
      .eq("id", coupon_id);

    const discountInfo = {
      coupon_name: coupon.name,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      duration: coupon.duration,
      duration_in_months: coupon.duration_in_months,
      promotion_code: null,
      applied_at: new Date().toISOString(),
      expires_at: null,
    };

    await supabase
      .from("organization_subscriptions")
      .update({ discount_info: discountInfo, updated_at: new Date().toISOString() })
      .eq("org_id", org_id);

    return new Response(
      JSON.stringify({ success: true, discount_info: discountInfo }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[apply-to-subscription] Error:", error);
    await captureException(error, { tags: { function: "coupon-admin-router/apply_to_subscription", integration: "stripe" } });
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
}

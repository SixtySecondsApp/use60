// supabase/functions/coupon-admin-router/handlers/delete-coupon.ts
import { getStripeClient } from "../../_shared/stripe.ts";
import { getCorsHeaders } from "../../_shared/corsHelper.ts";
import { captureException } from "../../_shared/sentryEdge.ts";
import { requireSuperAdmin } from "../helpers/auth.ts";

export async function handleDeleteCoupon(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  try {
    const { supabase } = await requireSuperAdmin(req);
    const body = await req.json();
    const { coupon_id } = body;

    if (!coupon_id) throw new Error("Missing required field: coupon_id");

    const { data: existing, error: lookupError } = await supabase
      .from("stripe_coupons")
      .select("stripe_coupon_id")
      .eq("id", coupon_id)
      .maybeSingle();

    if (lookupError) throw new Error(`Lookup failed: ${lookupError.message}`);
    if (!existing) throw new Error("Coupon not found");

    const stripe = getStripeClient();
    await stripe.coupons.del(existing.stripe_coupon_id);
    console.log(`[delete-coupon] Deleted Stripe coupon ${existing.stripe_coupon_id}`);

    const { error: updateError } = await supabase
      .from("stripe_coupons")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", coupon_id);

    if (updateError) throw new Error(`Stripe deleted but local update failed: ${updateError.message}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[delete-coupon] Error:", error);
    await captureException(error, { tags: { function: "coupon-admin-router/delete_coupon", integration: "stripe" } });
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
}

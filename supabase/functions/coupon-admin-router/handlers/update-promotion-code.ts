// supabase/functions/coupon-admin-router/handlers/update-promotion-code.ts
import { getStripeClient } from "../../_shared/stripe.ts";
import { getCorsHeaders } from "../../_shared/corsHelper.ts";
import { captureException } from "../../_shared/sentryEdge.ts";
import { requireSuperAdmin } from "../helpers/auth.ts";

export async function handleUpdatePromotionCode(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  try {
    const { supabase } = await requireSuperAdmin(req);
    const body = await req.json();
    const { promotion_code_id, is_active } = body;

    if (!promotion_code_id) throw new Error("Missing required field: promotion_code_id");
    if (typeof is_active !== "boolean") throw new Error("is_active must be a boolean");

    const { data: existing, error: lookupError } = await supabase
      .from("stripe_promotion_codes")
      .select("stripe_promotion_code_id")
      .eq("id", promotion_code_id)
      .maybeSingle();

    if (lookupError) throw new Error(`Lookup failed: ${lookupError.message}`);
    if (!existing) throw new Error("Promotion code not found");

    const stripe = getStripeClient();
    await stripe.promotionCodes.update(existing.stripe_promotion_code_id, { active: is_active });

    const { data: code, error: updateError } = await supabase
      .from("stripe_promotion_codes")
      .update({ is_active })
      .eq("id", promotion_code_id)
      .select("id, stripe_promotion_code_id, code, is_active")
      .single();

    if (updateError) throw new Error(`Stripe updated but local update failed: ${updateError.message}`);

    return new Response(
      JSON.stringify({ success: true, promotion_code: code }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[update-promotion-code] Error:", error);
    await captureException(error, { tags: { function: "coupon-admin-router/update_promotion_code", integration: "stripe" } });
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
}

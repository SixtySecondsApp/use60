// supabase/functions/coupon-admin-router/handlers/list-promotion-codes.ts
import { getCorsHeaders } from "../../_shared/corsHelper.ts";
import { captureException } from "../../_shared/sentryEdge.ts";
import { requireSuperAdmin } from "../helpers/auth.ts";

export async function handleListPromotionCodes(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  try {
    const { supabase } = await requireSuperAdmin(req);
    const body = await req.json();
    const { coupon_id } = body;

    let query = supabase
      .from("stripe_promotion_codes")
      .select("id, coupon_id, stripe_promotion_code_id, code, is_active, max_redemptions, times_redeemed, expires_at, customer_restriction, first_time_only, minimum_amount_cents, minimum_amount_currency, created_at")
      .order("created_at", { ascending: false });

    if (coupon_id) {
      query = query.eq("coupon_id", coupon_id);
    }

    const { data: codes, error } = await query;
    if (error) throw new Error(error.message);

    return new Response(
      JSON.stringify({ success: true, promotion_codes: codes || [] }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[list-promotion-codes] Error:", error);
    await captureException(error, { tags: { function: "coupon-admin-router/list_promotion_codes", integration: "stripe" } });
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
}

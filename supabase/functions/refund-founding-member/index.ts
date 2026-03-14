// supabase/functions/refund-founding-member/index.ts
// Admin-only edge function for processing 30-day Founding Member refunds.
// Refunds the Stripe payment, cancels the subscription, claws back remaining
// welcome credits, and decrements the founding_members counter.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders, handleCorsPreflightRequest } from "../_shared/corsHelper.ts";
import { getStripeClientV2 } from "../_shared/stripe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface RefundRequest {
  org_id: string;
  reason?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // ── 1. Verify authentication ──────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 2. Parse request body ────────────────────────────────────────
    const body: RefundRequest = await req.json();
    const { org_id, reason } = body;

    if (!org_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: org_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 3. Verify caller is org admin/owner ──────────────────────────
    const { data: membership, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to process refunds for this organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Look up subscription ──────────────────────────────────────
    const { data: subscription, error: subError } = await supabase
      .from("organization_subscriptions")
      .select("id, org_id, plan_id, status, stripe_customer_id, billing_cycle, started_at")
      .eq("org_id", org_id)
      .maybeSingle();

    if (subError || !subscription) {
      return new Response(
        JSON.stringify({ error: "No subscription found for this organization" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (subscription.status === "canceled") {
      return new Response(
        JSON.stringify({ error: "Subscription is already canceled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify this is a founding (lifetime) subscription
    if (subscription.billing_cycle !== "lifetime") {
      return new Response(
        JSON.stringify({ error: "This endpoint only handles Founding Member refunds. Use the standard cancellation flow for recurring subscriptions." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 5. Find the Stripe payment intent from the checkout session ──
    const stripe = getStripeClientV2();

    if (!subscription.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: "No Stripe customer ID associated with this subscription" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Find the most recent payment for this customer (the founding purchase)
    const paymentIntents = await stripe.paymentIntents.list({
      customer: subscription.stripe_customer_id,
      limit: 5,
    });

    const successfulPayment = paymentIntents.data.find(
      (pi) => pi.status === "succeeded",
    );

    if (!successfulPayment) {
      return new Response(
        JSON.stringify({ error: "No successful payment found for this customer. Cannot issue refund." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 6. Issue full refund via Stripe ──────────────────────────────
    const refund = await stripe.refunds.create({
      payment_intent: successfulPayment.id,
      reason: "requested_by_customer",
    });

    const refundedAmountPence = successfulPayment.amount;
    const refundedCurrency = successfulPayment.currency;

    console.log(
      `[refund-founding-member] Refund issued: ${refund.id}, amount: ${refundedAmountPence} ${refundedCurrency}, org: ${org_id}`,
    );

    // ── 7. Cancel subscription ───────────────────────────────────────
    const now = new Date().toISOString();

    const { error: cancelError } = await supabase
      .from("organization_subscriptions")
      .update({
        status: "canceled",
        canceled_at: now,
        cancellation_reason: reason || "Founding Member refund requested",
        updated_at: now,
      })
      .eq("id", subscription.id);

    if (cancelError) {
      console.error("[refund-founding-member] Error canceling subscription:", cancelError);
      // Non-fatal: refund was already issued, log and continue
    }

    // ── 8. Claw back remaining welcome credits ──────────────────────
    let creditsClawedBack = 0;

    const { data: balanceRow, error: balanceError } = await supabase
      .from("org_credit_balance")
      .select("balance_credits")
      .eq("org_id", org_id)
      .maybeSingle();

    if (!balanceError && balanceRow && balanceRow.balance_credits > 0) {
      // The original grant was 500 credits. Claw back whatever remains
      // (up to the original 500 — don't claw back credits they purchased separately).
      const originalGrant = 500;
      creditsClawedBack = Math.min(balanceRow.balance_credits, originalGrant);

      if (creditsClawedBack > 0) {
        // Deduct the credits
        const { error: deductError } = await supabase
          .from("org_credit_balance")
          .update({
            balance_credits: balanceRow.balance_credits - creditsClawedBack,
          })
          .eq("org_id", org_id);

        if (deductError) {
          console.error("[refund-founding-member] Error clawing back credits:", deductError);
        }

        // Record the adjustment in credit_transactions
        await supabase.from("credit_transactions").insert({
          org_id,
          type: "adjustment",
          amount: -creditsClawedBack,
          description: `Founding Member refund — clawed back ${creditsClawedBack} credits`,
          created_by: user.id,
        });
      }
    }

    // ── 9. Decrement founding_members counter ────────────────────────
    const { data: counterRow, error: counterReadError } = await supabase
      .from("platform_counters")
      .select("value")
      .eq("key", "founding_members")
      .maybeSingle();

    if (!counterReadError && counterRow && counterRow.value > 0) {
      const { error: counterUpdateError } = await supabase
        .from("platform_counters")
        .update({ value: counterRow.value - 1, updated_at: now })
        .eq("key", "founding_members");

      if (counterUpdateError) {
        console.error("[refund-founding-member] Error decrementing counter:", counterUpdateError);
      }
    }

    // ── 10. Record billing history entry ─────────────────────────────
    await supabase.from("billing_history").insert({
      org_id,
      subscription_id: subscription.id,
      event_type: "refund",
      amount: -(refundedAmountPence / 100),
      currency: refundedCurrency.toUpperCase(),
      status: "refunded",
      description: `Founding Member refund${reason ? `: ${reason}` : ""}`,
      metadata: {
        refund_id: refund.id,
        payment_intent_id: successfulPayment.id,
        credits_clawed_back: creditsClawedBack,
        requested_by: user.id,
      },
      created_at: now,
    });

    // ── 11. Return success ───────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        refund_id: refund.id,
        refunded_amount: refundedAmountPence / 100,
        refunded_currency: refundedCurrency.toUpperCase(),
        credits_clawed_back: creditsClawedBack,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[refund-founding-member] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

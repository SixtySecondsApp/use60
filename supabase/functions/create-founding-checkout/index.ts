// supabase/functions/create-founding-checkout/index.ts
// Creates a Stripe Checkout Session for the Founding Member one-time purchase (V2 workspace)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders } from "../_shared/corsHelper.ts";
import { getStripeClientV2, getOrCreateStripeCustomer, getSiteUrl } from "../_shared/stripe.ts";
import { getStripeV2PriceId, StripeCurrency } from "../_shared/stripeProducts.ts";
import { captureException } from "../_shared/sentryEdge.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface FoundingCheckoutRequest {
  org_id: string;
  currency: StripeCurrency;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  try {
    // ── 1. Verify authentication ──────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ── 2. Parse and validate request body ────────────────────────────
    const body: FoundingCheckoutRequest = await req.json();
    const { org_id, currency } = body;

    if (!org_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: org_id" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const validCurrencies: StripeCurrency[] = ['USD', 'GBP', 'EUR'];
    const normalizedCurrency = (currency || 'USD').toUpperCase() as StripeCurrency;
    if (!validCurrencies.includes(normalizedCurrency)) {
      return new Response(
        JSON.stringify({ error: "Invalid currency. Must be 'USD', 'GBP', or 'EUR'" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ── 3. Verify user is org owner/admin ─────────────────────────────
    const { data: membership, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      return new Response(
        JSON.stringify({ error: "Failed to verify permissions" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return new Response(
        JSON.stringify({ error: "You need to be an organization owner or admin to manage billing" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ── 4. NEW USERS GATE: Block if any subscription or trial exists ──
    // Checks for ANY row — active, trialing, canceled, past_due, etc.
    // An org can have multiple rows (no unique constraint on org_id),
    // so we use .limit(1) instead of .maybeSingle() to avoid PGRST116.
    const { data: existingSubs, error: subCheckError } = await supabase
      .from("organization_subscriptions")
      .select("id, status, trial_start_at")
      .eq("org_id", org_id)
      .limit(1);

    if (subCheckError) {
      console.error("Error checking existing subscription:", subCheckError);
      return new Response(
        JSON.stringify({ error: "Failed to verify eligibility" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (existingSubs && existingSubs.length > 0) {
      return new Response(
        JSON.stringify({ error: "Founding Member offer is for new users only" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ── 5. Get the Stripe V2 price ID for founding_member ─────────────
    let priceId: string;
    try {
      priceId = getStripeV2PriceId('founding_member', normalizedCurrency);
    } catch (priceError) {
      console.error("Price lookup error:", priceError);
      return new Response(
        JSON.stringify({ error: "Founding Member pricing not yet configured for this currency" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ── 6. Get organization details ───────────────────────────────────
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", org_id)
      .single();

    if (orgError || !org) {
      return new Response(
        JSON.stringify({ error: "Organization not found" }),
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ── 7. Get or create Stripe customer (V2 workspace) ───────────────
    const stripe = getStripeClientV2();

    const customer = await getOrCreateStripeCustomer(
      stripe,
      org_id,
      user.email ?? "",
      org.name,
    );

    // ── 8. Create checkout session (one-time payment) ─────────────────
    const siteUrl = getSiteUrl();

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/settings/billing?checkout=cancelled`,
      metadata: {
        org_id,
        plan_slug: "founding",
        welcome_credits: "500",
        user_id: user.id,
      },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      automatic_tax: {
        enabled: true,
      },
      tax_id_collection: {
        enabled: true,
      },
      customer_update: {
        address: "auto",
        name: "auto",
      },
    });

    if (!session.url) {
      throw new Error("Failed to create checkout session URL");
    }

    // ── 9. Return checkout URL ────────────────────────────────────────
    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error creating founding checkout session:", error);
    await captureException(error, {
      tags: {
        function: 'create-founding-checkout',
        integration: 'stripe',
      },
    });
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});

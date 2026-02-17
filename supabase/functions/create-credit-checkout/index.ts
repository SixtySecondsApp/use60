// supabase/functions/create-credit-checkout/index.ts
// Creates a Stripe Checkout Session for one-time credit pack purchase (GBP)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from "../_shared/corsHelper.ts";
import { getStripeClient, getOrCreateStripeCustomer, getSiteUrl } from "../_shared/stripe.ts";
import { captureException } from "../_shared/sentryEdge.ts";
import { CREDIT_PACKS, type PackType } from "../_shared/creditPacks.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Only individual packs are purchasable via checkout; agency packs go through sales.
const PURCHASABLE_PACK_TYPES: PackType[] = ["starter", "growth", "scale"];

interface CreditCheckoutRequest {
  org_id: string;
  pack_type: PackType;
  success_url?: string;
  cancel_url?: string;
}

interface CreditCheckoutResponse {
  url: string;
  session_id: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", req, 405);
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Missing authorization header", req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user from auth token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return errorResponse("Invalid authentication", req, 401);
    }

    // Parse request body
    const body: CreditCheckoutRequest = await req.json();
    const { org_id, pack_type, success_url, cancel_url } = body;

    if (!org_id || !pack_type) {
      return errorResponse("Missing required fields: org_id, pack_type", req, 400);
    }

    // Validate pack_type: only individual packs are self-serve
    if (!PURCHASABLE_PACK_TYPES.includes(pack_type)) {
      return errorResponse(
        `Invalid pack_type "${pack_type}". Must be one of: ${PURCHASABLE_PACK_TYPES.join(", ")}`,
        req,
        400,
      );
    }

    const pack = CREDIT_PACKS[pack_type];
    if (!pack) {
      return errorResponse(`Pack definition not found for type: ${pack_type}`, req, 500);
    }

    // Verify user has permission to manage this org's billing (owner or admin)
    const { data: membership, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) {
      return errorResponse(
        "You do not have permission to manage billing for this organization",
        req,
        403,
      );
    }

    // Get organization details
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", org_id)
      .single();

    if (orgError || !org) {
      return errorResponse("Organization not found", req, 404);
    }

    // Check for existing Stripe customer via subscription record
    const { data: existingSub } = await supabase
      .from("organization_subscriptions")
      .select("stripe_customer_id")
      .eq("org_id", org_id)
      .maybeSingle();

    // Initialize Stripe
    const stripe = getStripeClient();

    // Get or create Stripe customer
    const customer = await getOrCreateStripeCustomer(
      stripe,
      org_id,
      user.email ?? "",
      org.name,
      existingSub?.stripe_customer_id,
    );

    const siteUrl = getSiteUrl();

    // Price in pence (GBP): priceGBP is in whole pounds, convert to pence
    const unitAmountPence = pack.priceGBP * 100;

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `${pack.label} — ${pack.credits} Credits`,
              description: pack.description,
            },
            unit_amount: unitAmountPence,
          },
          quantity: 1,
        },
      ],
      success_url: success_url || `${siteUrl}/settings/credits/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${siteUrl}/settings/credits`,
      metadata: {
        type: "credit_pack_purchase",
        org_id,
        pack_type,
        credits: String(pack.credits),
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

    const response: CreditCheckoutResponse = {
      url: session.url,
      session_id: session.id,
    };

    return jsonResponse(response, req);
  } catch (error) {
    console.error("Error creating credit checkout session:", error);
    await captureException(error, {
      tags: {
        function: "create-credit-checkout",
        integration: "stripe",
      },
    });
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(message, req, 500);
  }
});

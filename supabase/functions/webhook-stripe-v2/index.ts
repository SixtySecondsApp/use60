// supabase/functions/webhook-stripe-v2/index.ts
// Stripe V2 workspace webhook handler — processes Founding Member checkout completions.
// Deploy with --no-verify-jwt (webhooks are public endpoints verified by signature).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { getCorsHeaders } from "../_shared/corsHelper.ts";
import { captureException } from "../_shared/sentryEdge.ts";
import {
  verifyWebhookSignature,
  getStripeWebhookSecretV2,
  getStripeClientV2,
  extractMetadata,
} from "../_shared/stripe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ── Event handlers ────────────────────────────────────────────────────

/**
 * Handle checkout.session.completed for the Founding Member plan.
 *
 * 1. Insert organization_subscriptions row (lifetime, active)
 * 2. Grant 500 welcome credits via add_credits_pack RPC
 * 3. Increment platform_counters founding_members
 * 4. Fire founding-welcome-email (fire-and-forget)
 */
async function handleFoundingCheckoutCompleted(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ success: boolean; message: string }> {
  const metadata = extractMetadata(session);
  const orgId = metadata.org_id;
  const welcomeCredits = parseInt(metadata.welcome_credits || "500", 10);

  if (!orgId) {
    console.error("[V2 Webhook] Missing org_id in session metadata");
    return { success: false, message: "Missing org_id in session metadata" };
  }

  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id ?? null;

  console.log(`[V2 Webhook] Processing founding checkout for org ${orgId}, customer ${customerId}`);

  // ── 1. Look up the founding plan ID ─────────────────────────────────
  const { data: foundingPlan, error: planError } = await supabase
    .from("subscription_plans")
    .select("id")
    .eq("slug", "founding")
    .single();

  if (planError || !foundingPlan) {
    console.error("[V2 Webhook] Could not find 'founding' plan:", planError);
    return { success: false, message: "Founding plan not found in subscription_plans" };
  }

  // ── 2. Idempotency: skip if subscription already exists for this org ─
  const { data: existingSub } = await supabase
    .from("organization_subscriptions")
    .select("id, status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (existingSub?.status === "active") {
    console.log(`[V2 Webhook] Subscription already active for org ${orgId} — skipping`);
    return { success: true, message: "Already processed (idempotent)" };
  }

  // ── 3. Insert / upsert organization_subscriptions ───────────────────
  const now = new Date().toISOString();
  const { error: subError } = await supabase
    .from("organization_subscriptions")
    .upsert(
      {
        org_id: orgId,
        plan_id: foundingPlan.id,
        status: "active",
        billing_cycle: "lifetime",
        stripe_customer_id: customerId,
        started_at: now,
        current_period_start: now,
        // lifetime = never expires — set far-future date to satisfy NOT NULL constraint
        current_period_end: "2099-12-31T23:59:59.999Z",
        updated_at: now,
      },
      { onConflict: "org_id" },
    );

  if (subError) {
    console.error("[V2 Webhook] Error inserting subscription:", subError);
    return { success: false, message: `Subscription insert failed: ${subError.message}` };
  }

  console.log(`[V2 Webhook] Subscription created for org ${orgId} — lifetime/active`);

  // ── 4. Grant welcome credits ────────────────────────────────────────
  const { data: newBalance, error: creditError } = await supabase
    .rpc("add_credits_pack", {
      p_org_id: orgId,
      p_pack_type: "scale",
      p_credits: welcomeCredits,
      p_source: "bonus",
      p_payment_id: session.id,
      p_created_by: null,
    });

  if (creditError) {
    // Non-fatal: log but don't fail the webhook (subscription is already active)
    console.error("[V2 Webhook] Error granting welcome credits:", creditError);
  } else {
    console.log(`[V2 Webhook] Granted ${welcomeCredits} welcome credits to org ${orgId}. New balance: ${newBalance}`);
  }

  // ── 5. Increment founding_members counter ───────────────────────────
  // Read current value then write incremented value (service role has full access)
  const { data: counterRow, error: counterReadError } = await supabase
    .from("platform_counters")
    .select("value")
    .eq("key", "founding_members")
    .single();

  if (counterReadError || !counterRow) {
    console.error("[V2 Webhook] Error reading founding_members counter:", counterReadError);
  } else {
    const { error: counterUpdateError } = await supabase
      .from("platform_counters")
      .update({ value: counterRow.value + 1, updated_at: now })
      .eq("key", "founding_members");

    if (counterUpdateError) {
      console.error("[V2 Webhook] Error incrementing founding_members counter:", counterUpdateError);
    } else {
      console.log(`[V2 Webhook] Incremented founding_members counter to ${counterRow.value + 1}`);
    }
  }

  // ── 6. Fire welcome email (fire-and-forget) ─────────────────────────
  try {
    const supabaseUrl = SUPABASE_URL;
    const functionUrl = `${supabaseUrl}/functions/v1/founding-welcome-email`;

    fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        org_id: orgId,
        session_id: session.id,
        customer_id: customerId,
      }),
    }).catch((emailErr) => {
      // Fire-and-forget — log but don't block
      console.warn("[V2 Webhook] Welcome email fire-and-forget failed:", emailErr);
    });
  } catch (emailError) {
    console.warn("[V2 Webhook] Error dispatching welcome email:", emailError);
  }

  return { success: true, message: `Founding Member activated for org ${orgId}` };
}

// ── Main webhook handler ──────────────────────────────────────────────

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    // ── 1. Verify webhook signature using V2 workspace secret ─────────
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    const webhookSecret = getStripeWebhookSecretV2();

    let event: Stripe.Event;
    try {
      event = await verifyWebhookSignature(rawBody, signature, webhookSecret);
    } catch (sigError) {
      console.error("[V2 Webhook] Signature verification failed:", sigError);
      return new Response(
        JSON.stringify({ error: "Invalid webhook signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[V2 Webhook] Received event: ${event.type} (${event.id})`);

    // ── 2. Route to event handler ─────────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = extractMetadata(session);

        // Only handle founding member checkouts
        if (metadata.plan_slug !== "founding") {
          console.log(`[V2 Webhook] Ignoring non-founding checkout (plan_slug: ${metadata.plan_slug})`);
          return new Response(
            JSON.stringify({ received: true, message: "Non-founding checkout — ignored" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const result = await handleFoundingCheckoutCompleted(supabase, session);

        return new Response(
          JSON.stringify(result),
          {
            status: result.success ? 200 : 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      default: {
        console.log(`[V2 Webhook] Unhandled event type: ${event.type}`);
        return new Response(
          JSON.stringify({ received: true, message: `Unhandled event type: ${event.type}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
  } catch (error) {
    console.error("[V2 Webhook] Unhandled error:", error);
    await captureException(error, {
      tags: {
        function: "webhook-stripe-v2",
        integration: "stripe",
      },
    });
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

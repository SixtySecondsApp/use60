// supabase/functions/update-subscription/index.ts
// Handles plan upgrades and downgrades for existing Stripe subscribers.
//
// - Upgrade (Basic → Pro): immediate with proration, grants 250 subscription credits
// - Downgrade (Pro → Basic): scheduled at period end (no proration charge)
// - Billing cycle switch: scheduled at next billing date
// - Logs all changes to billing_event_log

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
} from "../_shared/corsHelper.ts";
import { getStripeClient } from "../_shared/stripe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Pro plan bundled credits granted immediately on upgrade
const PRO_SUBSCRIPTION_CREDITS = 250;

interface UpdateSubscriptionRequest {
  org_id: string;
  new_plan_slug: "basic" | "pro";
  billing_cycle: "monthly" | "yearly";
}

interface UpdateSubscriptionResponse {
  success: boolean;
  change_type: "upgrade" | "downgrade" | "cycle_change";
  effective: "immediate" | "period_end";
  effective_date: string;       // ISO date string
  new_plan: string;             // plan name
  proration_amount?: number;    // in pence, upgrades only
  currency?: string;
  message: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request
    const body: UpdateSubscriptionRequest = await req.json();
    const { org_id, new_plan_slug, billing_cycle } = body;

    if (!org_id || !new_plan_slug || !billing_cycle) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: org_id, new_plan_slug, billing_cycle" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["basic", "pro"].includes(new_plan_slug)) {
      return new Response(
        JSON.stringify({ error: "Invalid new_plan_slug. Must be 'basic' or 'pro'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["monthly", "yearly"].includes(billing_cycle)) {
      return new Response(
        JSON.stringify({ error: "Invalid billing_cycle. Must be 'monthly' or 'yearly'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is org owner/admin
    const { data: membership, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to manage billing for this organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the org's current subscription
    const { data: currentSub, error: subError } = await supabase
      .from("organization_subscriptions")
      .select("stripe_subscription_id, stripe_customer_id, status, billing_cycle, plan_id, current_period_end")
      .eq("org_id", org_id)
      .maybeSingle();

    if (subError || !currentSub) {
      return new Response(
        JSON.stringify({ error: "No active subscription found for this organization" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!currentSub.stripe_subscription_id) {
      return new Response(
        JSON.stringify({ error: "No Stripe subscription linked. Use checkout to start a new subscription." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["active", "trialing"].includes(currentSub.status)) {
      return new Response(
        JSON.stringify({ error: `Cannot change plan for a subscription with status: ${currentSub.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current plan details
    const { data: currentPlan, error: currentPlanError } = await supabase
      .from("subscription_plans")
      .select("id, slug, name, stripe_price_id_monthly, stripe_price_id_yearly")
      .eq("id", currentSub.plan_id)
      .maybeSingle();

    if (currentPlanError || !currentPlan) {
      return new Response(
        JSON.stringify({ error: "Could not find current plan details" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get new plan details
    const { data: newPlan, error: newPlanError } = await supabase
      .from("subscription_plans")
      .select("id, slug, name, price_monthly, price_yearly, currency, stripe_price_id_monthly, stripe_price_id_yearly, features")
      .eq("slug", new_plan_slug)
      .eq("is_active", true)
      .maybeSingle();

    if (newPlanError || !newPlan) {
      return new Response(
        JSON.stringify({ error: `Plan '${new_plan_slug}' not found or inactive` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine the new Stripe price ID
    const normalizedCycle = billing_cycle === "yearly" ? "yearly" : "monthly";
    const newPriceId = normalizedCycle === "yearly"
      ? newPlan.stripe_price_id_yearly
      : newPlan.stripe_price_id_monthly;

    if (!newPriceId) {
      return new Response(
        JSON.stringify({ error: `No Stripe price configured for plan '${new_plan_slug}' with ${billing_cycle} billing` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine current price ID to compare
    const currentPriceId = currentSub.billing_cycle === "yearly"
      ? currentPlan.stripe_price_id_yearly
      : currentPlan.stripe_price_id_monthly;

    // If nothing is actually changing, return early
    if (newPriceId === currentPriceId) {
      return new Response(
        JSON.stringify({
          success: true,
          change_type: "upgrade",
          effective: "immediate",
          effective_date: new Date().toISOString(),
          new_plan: newPlan.name,
          message: "Already on this plan and billing cycle",
        } satisfies UpdateSubscriptionResponse),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine change type (tier order: basic < pro)
    const TIER_ORDER: Record<string, number> = { basic: 0, pro: 1 };
    const currentTier = TIER_ORDER[currentPlan.slug] ?? 0;
    const newTier = TIER_ORDER[new_plan_slug] ?? 0;

    const isUpgrade = newTier > currentTier;
    const isDowngrade = newTier < currentTier;

    const change_type: UpdateSubscriptionResponse["change_type"] = isUpgrade
      ? "upgrade"
      : isDowngrade
      ? "downgrade"
      : "cycle_change";

    const stripe = getStripeClient();

    // Retrieve the current Stripe subscription to get the subscription item ID
    const stripeSub = await stripe.subscriptions.retrieve(
      currentSub.stripe_subscription_id,
      { expand: ["items"] }
    );

    const subItemId = stripeSub.items.data[0]?.id;
    if (!subItemId) {
      return new Response(
        JSON.stringify({ error: "Could not find subscription item in Stripe" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let stripeUpdate: Stripe.SubscriptionUpdateParams;
    let prorationAmount: number | undefined;

    if (isUpgrade) {
      // Upgrades: immediate with proration. Preview invoice to surface prorated charge.
      const now = Math.floor(Date.now() / 1000);
      try {
        const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
          customer: currentSub.stripe_customer_id ?? undefined,
          subscription: currentSub.stripe_subscription_id,
          subscription_items: [
            { id: subItemId, price: newPriceId, quantity: 1 },
          ],
          subscription_proration_date: now,
          subscription_proration_behavior: "create_prorations",
        });

        // Sum proration lines (positive = charge, negative = credit)
        const prorationLines = upcomingInvoice.lines.data.filter((l) => l.proration);
        prorationAmount = prorationLines.reduce((sum, l) => sum + l.amount, 0);
      } catch (err) {
        // Non-fatal — proration preview failure should not block the upgrade
        console.warn("Could not preview proration:", err);
      }

      stripeUpdate = {
        items: [{ id: subItemId, price: newPriceId, quantity: 1 }],
        proration_behavior: "create_prorations",
        billing_cycle_anchor: "unchanged",
      };
    } else {
      // Downgrade or cycle change: no proration, takes effect at renewal
      stripeUpdate = {
        items: [{ id: subItemId, price: newPriceId, quantity: 1 }],
        proration_behavior: "none",
        billing_cycle_anchor: "unchanged",
      };
    }

    // Apply the change in Stripe
    const updatedStripeSub = await stripe.subscriptions.update(
      currentSub.stripe_subscription_id,
      stripeUpdate
    );

    const newPeriodEnd = new Date(updatedStripeSub.current_period_end * 1000).toISOString();

    // Update our DB subscription record
    const { error: updateError } = await supabase
      .from("organization_subscriptions")
      .update({
        plan_id: newPlan.id,
        billing_cycle: normalizedCycle,
        stripe_price_id: newPriceId,
        status: updatedStripeSub.status,
        current_period_start: new Date(updatedStripeSub.current_period_start * 1000).toISOString(),
        current_period_end: newPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", org_id);

    if (updateError) {
      console.error("Failed to update subscription record:", updateError);
      // Don't fail — Stripe succeeded; the webhook will re-sync
    }

    // =========================================================================
    // Post-change side effects
    // =========================================================================

    // 1. On upgrade to Pro: grant subscription credits immediately.
    //    The stripe-webhook will also call this on the next invoice.paid event,
    //    but granting here ensures credits are available right away.
    if (isUpgrade && new_plan_slug === "pro") {
      const bundledCredits = (newPlan.features as Record<string, unknown>)?.bundled_credits;
      const creditAmount = typeof bundledCredits === "number" && bundledCredits > 0
        ? bundledCredits
        : PRO_SUBSCRIPTION_CREDITS;

      const { data: newBalance, error: creditError } = await supabase.rpc(
        "grant_subscription_credits",
        {
          p_org_id: org_id,
          p_amount: creditAmount,
          p_period_end: newPeriodEnd,
        }
      );

      if (creditError) {
        console.error("grant_subscription_credits failed:", creditError);
      } else if (newBalance === -1) {
        console.error(`grant_subscription_credits: org_credit_balance row not found for org ${org_id}`);
      } else {
        console.log(`Granted ${creditAmount} subscription credits to org ${org_id}, new balance: ${newBalance}`);
      }
    }

    // 2. Log the plan change to billing_event_log
    const eventId = `plan_change_${org_id}_${Date.now()}`;
    const { error: logError } = await supabase
      .from("billing_event_log")
      .insert({
        provider: "stripe",
        provider_event_id: eventId,
        event_type: `subscription.${change_type}`,
        org_id,
        occurred_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        payload: {
          stripe_subscription_id: currentSub.stripe_subscription_id,
          from_plan: currentPlan.slug,
          to_plan: new_plan_slug,
          billing_cycle: normalizedCycle,
          change_type,
          proration_amount: prorationAmount,
          user_id: user.id,
        },
      });

    if (logError) {
      // Non-fatal — logging failure should not surface to the user
      console.error("Failed to log billing event:", logError);
    }

    // =========================================================================
    // Build response
    // =========================================================================

    const effective: UpdateSubscriptionResponse["effective"] = isUpgrade
      ? "immediate"
      : "period_end";

    // effective_date: now for upgrades, period_end for downgrades/cycle changes
    const effective_date = isUpgrade
      ? new Date().toISOString()
      : currentSub.current_period_end ?? newPeriodEnd;

    let message: string;
    if (isUpgrade) {
      message = `Upgraded to ${newPlan.name} immediately. Proration applied to your next invoice.`;
    } else if (isDowngrade) {
      message = `Downgrade to ${newPlan.name} scheduled for end of current billing period.`;
    } else {
      message = `Billing cycle changed to ${billing_cycle}. Takes effect at your next billing date.`;
    }

    const response: UpdateSubscriptionResponse = {
      success: true,
      change_type,
      effective,
      effective_date,
      new_plan: newPlan.name,
      message,
      ...(prorationAmount !== undefined && {
        proration_amount: prorationAmount,
        currency: newPlan.currency ?? "GBP",
      }),
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error updating subscription:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

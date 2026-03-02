// supabase/functions/start-free-trial/index.ts
// Starts a free trial without requiring payment information

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { corsHeaders } from "../_shared/cors.ts";
import { getStripeClient, getOrCreateStripeCustomer } from "../_shared/stripe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface StartTrialRequest {
  org_id: string;
  plan_id: string;
}

interface StartTrialResponse {
  success: boolean;
  subscription: {
    id: string;
    status: string;
    trial_ends_at: string;
    plan_name: string;
    plan_slug: string;
  };
  message: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    // Get user from auth token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: StartTrialRequest = await req.json();
    const { org_id, plan_id } = body;

    if (!org_id || !plan_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: org_id, plan_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has permission to manage this org (owner or admin)
    const { data: membership, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to start a trial for this organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for existing active subscription
    const { data: existingSub } = await supabase
      .from("organization_subscriptions")
      .select("id, status, stripe_customer_id")
      .eq("org_id", org_id)
      .single();

    if (existingSub && ["active", "trialing"].includes(existingSub.status)) {
      return new Response(
        JSON.stringify({ error: "Organization already has an active subscription or trial" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the plan details
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: "Plan not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get organization details
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", org_id)
      .single();

    if (orgError || !org) {
      return new Response(
        JSON.stringify({ error: "Organization not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Stripe and create customer (without payment method)
    const stripe = getStripeClient();
    const customer = await getOrCreateStripeCustomer(
      stripe,
      org_id,
      user.email ?? "",
      org.name,
      existingSub?.stripe_customer_id
    );

    // Calculate trial dates
    const trialDays = plan.trial_days ?? 14;
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Create or update subscription record
    const subscriptionData = {
      org_id,
      plan_id,
      stripe_customer_id: customer.id,
      status: "trialing",
      billing_cycle: "monthly",
      trial_start_at: now.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
      started_at: now.toISOString(),
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      updated_at: now.toISOString(),
    };

    let subscriptionId: string;

    if (existingSub) {
      // Update existing subscription
      const { error: updateError } = await supabase
        .from("organization_subscriptions")
        .update(subscriptionData)
        .eq("id", existingSub.id);

      if (updateError) {
        throw new Error(`Failed to update subscription: ${updateError.message}`);
      }
      subscriptionId = existingSub.id;
    } else {
      // Insert new subscription
      const { data: newSub, error: insertError } = await supabase
        .from("organization_subscriptions")
        .insert(subscriptionData)
        .select("id")
        .single();

      if (insertError || !newSub) {
        throw new Error(`Failed to create subscription: ${insertError?.message}`);
      }
      subscriptionId = newSub.id;
    }

    // Record billing event
    await supabase.from("billing_history").insert({
      org_id,
      subscription_id: subscriptionId,
      event_type: "plan_change",
      amount: 0,
      currency: plan.currency || "GBP",
      status: "paid",
      description: `Started ${trialDays}-day free trial of ${plan.name}`,
      metadata: {
        plan_id,
        plan_slug: plan.slug,
        trial_days: trialDays,
      },
      created_at: now.toISOString(),
    });

    const response: StartTrialResponse = {
      success: true,
      subscription: {
        id: subscriptionId,
        status: "trialing",
        trial_ends_at: trialEndsAt.toISOString(),
        plan_name: plan.name,
        plan_slug: plan.slug,
      },
      message: `Your ${trialDays}-day free trial has started!`,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error starting free trial:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

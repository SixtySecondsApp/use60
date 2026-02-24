// supabase/functions/stripe-sync-product/index.ts
// Syncs product data from Stripe back to the database

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getStripeClient } from "../_shared/stripe.ts";
import { captureException } from "../_shared/sentryEdge.ts";
import { getCorsHeaders } from "../_shared/corsHelper.ts";

interface SyncProductRequest {
  plan_id: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user is a super admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Invalid or expired token");
    }

    // Check if user is super admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_super_admin) {
      throw new Error("Only super admins can sync Stripe products");
    }

    // Parse request
    const body: SyncProductRequest = await req.json();
    const { plan_id } = body;

    if (!plan_id) {
      throw new Error("Missing plan_id");
    }

    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .single();

    if (planError || !plan) {
      throw new Error("Plan not found");
    }

    // Check if product exists
    if (!plan.stripe_product_id) {
      throw new Error("No Stripe product ID configured for this plan");
    }

    // Initialize Stripe
    const stripe = getStripeClient();

    // Retrieve the product from Stripe
    const product = await stripe.products.retrieve(plan.stripe_product_id);

    if (!product) {
      throw new Error("Product not found in Stripe");
    }

    // Get active prices for this product
    const prices = await stripe.prices.list({
      product: plan.stripe_product_id,
      active: true,
      limit: 10,
    });

    // Find monthly and yearly prices
    let monthlyPrice = prices.data.find(
      (p) => p.recurring?.interval === "month"
    );
    let yearlyPrice = prices.data.find(
      (p) => p.recurring?.interval === "year"
    );

    // Update the plan with synced data
    const updateData: Record<string, unknown> = {
      stripe_synced_at: new Date().toISOString(),
      stripe_sync_error: null,
      updated_at: new Date().toISOString(),
    };

    // Update price IDs if found
    if (monthlyPrice) {
      updateData.stripe_price_id_monthly = monthlyPrice.id;
      // Optionally update price_monthly if you want to sync from Stripe
      // updateData.price_monthly = monthlyPrice.unit_amount;
    }

    if (yearlyPrice) {
      updateData.stripe_price_id_yearly = yearlyPrice.id;
      // Optionally update price_yearly if you want to sync from Stripe
      // updateData.price_yearly = yearlyPrice.unit_amount;
    }

    const { error: updateError } = await supabase
      .from("subscription_plans")
      .update(updateData)
      .eq("id", plan_id);

    if (updateError) {
      console.error("Error updating plan with synced data:", updateError);
      throw new Error("Failed to update plan with synced data");
    }

    console.log(`Synced Stripe product ${plan.stripe_product_id} for plan ${plan.slug}`);

    return new Response(
      JSON.stringify({
        success: true,
        stripe_product_id: product.id,
        stripe_price_id_monthly: monthlyPrice?.id || null,
        stripe_price_id_yearly: yearlyPrice?.id || null,
        product_name: product.name,
        product_active: product.active,
        monthly_amount: monthlyPrice?.unit_amount || null,
        yearly_amount: yearlyPrice?.unit_amount || null,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error syncing Stripe product:", error);
    await captureException(error, {
      tags: {
        function: 'stripe-sync-product',
        integration: 'stripe',
      },
    });
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});

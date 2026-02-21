// supabase/functions/stripe-update-product/index.ts
// Updates an existing Stripe product and creates new prices if needed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getStripeClient } from "../_shared/stripe.ts";
import { captureException } from "../_shared/sentryEdge.ts";
import { getCorsHeaders } from "../_shared/corsHelper.ts";

interface UpdateProductRequest {
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
      throw new Error("Only super admins can manage Stripe products");
    }

    // Parse request
    const body: UpdateProductRequest = await req.json();
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

    // Don't update Stripe products for free tier
    if (plan.is_free_tier) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Free tier plans don't need Stripe products",
        }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Check if product exists
    if (!plan.stripe_product_id) {
      throw new Error("No Stripe product exists for this plan. Create one first.");
    }

    // Initialize Stripe
    const stripe = getStripeClient();

    // Update the product
    await stripe.products.update(plan.stripe_product_id, {
      name: plan.name,
      description: plan.description || undefined,
      active: plan.is_active,
      metadata: {
        plan_id: plan.id,
        plan_slug: plan.slug,
      },
    });

    let monthlyPriceId = plan.stripe_price_id_monthly;
    let yearlyPriceId = plan.stripe_price_id_yearly;

    // Check if we need to create new prices (price changes require new price objects)
    // Note: Stripe doesn't allow updating price amounts, so we create new prices

    // Get current prices from Stripe
    const existingMonthlyPrice = monthlyPriceId
      ? await stripe.prices.retrieve(monthlyPriceId)
      : null;
    const existingYearlyPrice = yearlyPriceId
      ? await stripe.prices.retrieve(yearlyPriceId)
      : null;

    // Create new monthly price if amount changed or doesn't exist
    if (plan.price_monthly > 0) {
      const needsNewMonthlyPrice =
        !existingMonthlyPrice ||
        existingMonthlyPrice.unit_amount !== plan.price_monthly;

      if (needsNewMonthlyPrice) {
        // Archive old price if it exists
        if (existingMonthlyPrice) {
          await stripe.prices.update(existingMonthlyPrice.id, { active: false });
        }

        // Create new price
        const newMonthlyPrice = await stripe.prices.create({
          product: plan.stripe_product_id,
          unit_amount: plan.price_monthly,
          currency: plan.currency.toLowerCase(),
          recurring: {
            interval: "month",
          },
          metadata: {
            plan_id: plan.id,
            billing_cycle: "monthly",
          },
        });
        monthlyPriceId = newMonthlyPrice.id;
      }
    } else if (existingMonthlyPrice) {
      // Archive if price is now 0
      await stripe.prices.update(existingMonthlyPrice.id, { active: false });
      monthlyPriceId = null;
    }

    // Create new yearly price if amount changed or doesn't exist
    if (plan.price_yearly > 0) {
      const needsNewYearlyPrice =
        !existingYearlyPrice ||
        existingYearlyPrice.unit_amount !== plan.price_yearly;

      if (needsNewYearlyPrice) {
        // Archive old price if it exists
        if (existingYearlyPrice) {
          await stripe.prices.update(existingYearlyPrice.id, { active: false });
        }

        // Create new price
        const newYearlyPrice = await stripe.prices.create({
          product: plan.stripe_product_id,
          unit_amount: plan.price_yearly,
          currency: plan.currency.toLowerCase(),
          recurring: {
            interval: "year",
          },
          metadata: {
            plan_id: plan.id,
            billing_cycle: "yearly",
          },
        });
        yearlyPriceId = newYearlyPrice.id;
      }
    } else if (existingYearlyPrice) {
      // Archive if price is now 0
      await stripe.prices.update(existingYearlyPrice.id, { active: false });
      yearlyPriceId = null;
    }

    // Update the plan with new Stripe IDs
    const { error: updateError } = await supabase
      .from("subscription_plans")
      .update({
        stripe_price_id_monthly: monthlyPriceId,
        stripe_price_id_yearly: yearlyPriceId,
        stripe_synced_at: new Date().toISOString(),
        stripe_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan_id);

    if (updateError) {
      console.error("Error updating plan with Stripe IDs:", updateError);
    }

    console.log(`Updated Stripe product ${plan.stripe_product_id} for plan ${plan.slug}`);

    return new Response(
      JSON.stringify({
        success: true,
        stripe_product_id: plan.stripe_product_id,
        stripe_price_id_monthly: monthlyPriceId,
        stripe_price_id_yearly: yearlyPriceId,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error updating Stripe product:", error);
    await captureException(error, {
      tags: {
        function: 'stripe-update-product',
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

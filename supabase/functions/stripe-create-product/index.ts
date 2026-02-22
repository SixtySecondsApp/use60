// supabase/functions/stripe-create-product/index.ts
// Creates a Stripe product and prices for a subscription plan

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getStripeClient } from "../_shared/stripe.ts";
import { captureException } from "../_shared/sentryEdge.ts";
import { getCorsHeaders } from "../_shared/corsHelper.ts";

interface CreateProductRequest {
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
    const body: CreateProductRequest = await req.json();
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

    // Don't create Stripe products for free tier
    if (plan.is_free_tier) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Free tier plans don't need Stripe products",
        }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Check if product already exists
    if (plan.stripe_product_id) {
      throw new Error("Stripe product already exists for this plan");
    }

    // Initialize Stripe
    const stripe = getStripeClient();

    // Create the product with tax code for software/SaaS
    // Tax code for Software as a Service (SaaS): txcd_10103000
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description || undefined,
      // Tax code for SaaS/Software subscriptions
      // This ensures correct VAT treatment across different jurisdictions
      tax_code: "txcd_10103000",
      metadata: {
        plan_id: plan.id,
        plan_slug: plan.slug,
      },
    });

    let monthlyPriceId: string | null = null;
    let yearlyPriceId: string | null = null;
    let seatPriceId: string | null = null;

    // Create monthly price if applicable
    // Tax behavior: "exclusive" means VAT is added on top of this price
    // Use "inclusive" if your displayed prices already include VAT
    if (plan.price_monthly > 0) {
      const monthlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price_monthly,
        currency: plan.currency.toLowerCase(),
        recurring: {
          interval: "month",
        },
        // VAT/Tax will be calculated and added on top of this price
        tax_behavior: "exclusive",
        metadata: {
          plan_id: plan.id,
          billing_cycle: "monthly",
        },
      });
      monthlyPriceId = monthlyPrice.id;
    }

    // Create yearly price if applicable
    if (plan.price_yearly > 0) {
      const yearlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price_yearly,
        currency: plan.currency.toLowerCase(),
        recurring: {
          interval: "year",
        },
        // VAT/Tax will be calculated and added on top of this price
        tax_behavior: "exclusive",
        metadata: {
          plan_id: plan.id,
          billing_cycle: "yearly",
        },
      });
      yearlyPriceId = yearlyPrice.id;
    }

    // Create per-seat price for Team plans (additional seats beyond included)
    if (plan.per_seat_price > 0 && plan.slug === "team") {
      const seatPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.per_seat_price,
        currency: plan.currency.toLowerCase(),
        recurring: {
          interval: "month",
        },
        // VAT/Tax will be calculated and added on top of this price
        tax_behavior: "exclusive",
        nickname: "Additional Seat",
        metadata: {
          plan_id: plan.id,
          price_type: "per_seat",
        },
      });
      seatPriceId = seatPrice.id;
    }

    // Update the plan with Stripe IDs
    const { error: updateError } = await supabase
      .from("subscription_plans")
      .update({
        stripe_product_id: product.id,
        stripe_price_id_monthly: monthlyPriceId,
        stripe_price_id_yearly: yearlyPriceId,
        stripe_seat_price_id: seatPriceId,
        stripe_synced_at: new Date().toISOString(),
        stripe_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan_id);

    if (updateError) {
      console.error("Error updating plan with Stripe IDs:", updateError);
      // Don't throw - product was created successfully
    }

    console.log(`Created Stripe product ${product.id} for plan ${plan.slug}`);

    return new Response(
      JSON.stringify({
        success: true,
        stripe_product_id: product.id,
        stripe_price_id_monthly: monthlyPriceId,
        stripe_price_id_yearly: yearlyPriceId,
        stripe_seat_price_id: seatPriceId,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating Stripe product:", error);
    await captureException(error, {
      tags: {
        function: 'stripe-create-product',
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

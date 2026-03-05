// supabase/functions/reconcile-billing/index.ts
// Daily reconciliation job to sync Stripe subscription state with database

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyCronSecret } from '../_shared/edgeAuth.ts';
import { captureException } from "../_shared/sentryEdge.ts";
import { getStripeClient } from "../_shared/stripe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface ReconciliationResult {
  success: boolean;
  subscriptions_checked: number;
  subscriptions_updated: number;
  subscriptions_missing: number;
  errors: string[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth: require cron secret
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!verifyCronSecret(req, cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const stripe = getStripeClient();

    const result = await reconcileSubscriptions(supabase, stripe);

    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Reconciliation error:", error);
    await captureException(error, {
      tags: {
        function: 'reconcile-billing',
        integration: 'stripe',
      },
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function reconcileSubscriptions(
  supabase: any,
  stripe: Stripe
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    success: true,
    subscriptions_checked: 0,
    subscriptions_updated: 0,
    subscriptions_missing: 0,
    errors: [],
  };

  try {
    // Get all active subscriptions from database
    const { data: dbSubscriptions, error: dbError } = await supabase
      .from("organization_subscriptions")
      .select("id, org_id, stripe_subscription_id, status, current_period_end")
      .in("status", ["active", "trialing", "past_due"]);

    if (dbError) {
      throw new Error(`Failed to fetch subscriptions: ${dbError.message}`);
    }

    if (!dbSubscriptions || dbSubscriptions.length === 0) {
      console.log("No active subscriptions to reconcile");
      return result;
    }

    result.subscriptions_checked = dbSubscriptions.length;

    // Check each subscription against Stripe
    for (const dbSub of dbSubscriptions) {
      if (!dbSub.stripe_subscription_id) {
        result.subscriptions_missing++;
        continue;
      }

      try {
        // Fetch subscription from Stripe
        const stripeSub = await stripe.subscriptions.retrieve(dbSub.stripe_subscription_id, {
          expand: ["items.data.price"],
        });

        // Compare status
        const stripeStatus = stripeSub.status;
        const dbStatus = dbSub.status;

        // Map Stripe status to our status
        const statusMap: Record<string, string> = {
          active: "active",
          trialing: "trialing",
          past_due: "past_due",
          canceled: "canceled",
          unpaid: "past_due",
          incomplete: "past_due",
          incomplete_expired: "canceled",
          paused: "paused",
        };

        const mappedStatus = statusMap[stripeStatus] || "canceled";

        // If status differs, update database
        if (mappedStatus !== dbStatus) {
          console.log(
            `Status mismatch for subscription ${dbSub.stripe_subscription_id}: DB=${dbStatus}, Stripe=${mappedStatus}`
          );

          // Update subscription status
          const { error: updateError } = await supabase
            .from("organization_subscriptions")
            .update({
              status: mappedStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", dbSub.id);

          if (updateError) {
            result.errors.push(
              `Failed to update subscription ${dbSub.id}: ${updateError.message}`
            );
          } else {
            result.subscriptions_updated++;

            // Log reconciliation event
            await supabase.from("billing_event_log").insert({
              provider: "stripe",
              provider_event_id: `reconcile_${dbSub.stripe_subscription_id}_${Date.now()}`,
              event_type: "subscription_updated",
              occurred_at: new Date().toISOString(),
              org_id: dbSub.org_id,
              payload: {
                reconciliation: true,
                old_status: dbStatus,
                new_status: mappedStatus,
                stripe_subscription_id: dbSub.stripe_subscription_id,
              },
              metadata: {
                reconciliation: true,
                old_status: dbStatus,
                new_status: mappedStatus,
              },
              processed_at: new Date().toISOString(),
            });
          }
        }

        // Check for subscriptions in Stripe that aren't in our DB
        // (This would require a separate pass through Stripe subscriptions)
      } catch (stripeError: any) {
        if (stripeError.statusCode === 404) {
          // Subscription not found in Stripe - mark as canceled
          console.log(`Subscription ${dbSub.stripe_subscription_id} not found in Stripe`);
          result.subscriptions_missing++;

          const { error: updateError } = await supabase
            .from("organization_subscriptions")
            .update({
              status: "canceled",
              updated_at: new Date().toISOString(),
            })
            .eq("id", dbSub.id);

          if (updateError) {
            result.errors.push(
              `Failed to mark missing subscription ${dbSub.id} as canceled: ${updateError.message}`
            );
          }
        } else {
          result.errors.push(
            `Error checking subscription ${dbSub.stripe_subscription_id}: ${stripeError.message}`
          );
        }
      }
    }

    // Check for unprocessed events
    const { data: unprocessedEvents } = await supabase.rpc("get_unprocessed_billing_events", {
      p_provider: "stripe",
      p_limit: 100,
    });

    if (unprocessedEvents && unprocessedEvents.length > 0) {
      console.log(`Found ${unprocessedEvents.length} unprocessed events`);
      result.errors.push(
        `Warning: ${unprocessedEvents.length} unprocessed billing events found. Review billing_event_log.`
      );
    }

    return result;
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}

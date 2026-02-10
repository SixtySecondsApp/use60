/**
 * Credit Auto Top-Up Edge Function
 *
 * Called by a cron job or inline from deduct_credits.
 * When auto_topup_enabled and balance < auto_topup_threshold:
 *   1. Check cooldown (no more than 1 charge per hour per org)
 *   2. Create Stripe PaymentIntent using the org's saved default payment method
 *   3. On success, add credits via add_credits()
 *
 * POST /credit-auto-topup
 * Body: { org_id: string }   (optional — if omitted, checks ALL orgs below threshold)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getStripeClient } from '../_shared/stripe.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Cooldown: minimum 1 hour between auto-topup charges for a given org
const COOLDOWN_MS = 60 * 60 * 1000;

interface AutoTopupResult {
  org_id: string;
  success: boolean;
  credits_added?: number;
  error?: string;
  skipped?: string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const targetOrgId: string | undefined = body.org_id;

    // Find orgs that need auto-topup
    let query = supabase
      .from('org_credit_balance')
      .select('org_id, balance_credits, auto_topup_amount, auto_topup_threshold')
      .eq('auto_topup_enabled', true);

    if (targetOrgId) {
      query = query.eq('org_id', targetOrgId);
    }

    const { data: orgs, error: queryError } = await query;

    if (queryError) {
      console.error('[credit-auto-topup] Query error:', queryError);
      return new Response(
        JSON.stringify({ error: 'Failed to query org balances', details: queryError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!orgs || orgs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No orgs need auto-topup', results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: AutoTopupResult[] = [];

    for (const org of orgs) {
      const { org_id, balance_credits, auto_topup_amount, auto_topup_threshold } = org;

      // Skip if balance is above threshold
      if (balance_credits > (auto_topup_threshold ?? 0)) {
        results.push({ org_id, success: true, skipped: 'Balance above threshold' });
        continue;
      }

      // Skip if topup amount not configured
      if (!auto_topup_amount || auto_topup_amount <= 0) {
        results.push({ org_id, success: false, error: 'auto_topup_amount not configured' });
        continue;
      }

      // Cooldown check: look for recent auto-topup transactions
      const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS).toISOString();
      const { data: recentTopup } = await supabase
        .from('credit_transactions')
        .select('id')
        .eq('org_id', org_id)
        .eq('type', 'purchase')
        .ilike('description', '%auto%topup%')
        .gte('created_at', cooldownCutoff)
        .limit(1)
        .maybeSingle();

      if (recentTopup) {
        results.push({ org_id, success: true, skipped: 'Cooldown active (charged < 1h ago)' });
        continue;
      }

      // Find Stripe customer for this org
      const { data: sub } = await supabase
        .from('organization_subscriptions')
        .select('stripe_customer_id')
        .eq('org_id', org_id)
        .maybeSingle();

      if (!sub?.stripe_customer_id) {
        results.push({ org_id, success: false, error: 'No Stripe customer found' });
        continue;
      }

      try {
        const stripe = getStripeClient();

        // Get customer's default payment method
        const customer = await stripe.customers.retrieve(sub.stripe_customer_id);

        if ('deleted' in customer && customer.deleted) {
          results.push({ org_id, success: false, error: 'Stripe customer deleted' });
          continue;
        }

        const defaultPaymentMethod =
          (customer as any).invoice_settings?.default_payment_method ||
          (customer as any).default_source;

        if (!defaultPaymentMethod) {
          results.push({ org_id, success: false, error: 'No default payment method on file' });
          continue;
        }

        // Create PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(auto_topup_amount * 100), // cents
          currency: 'usd',
          customer: sub.stripe_customer_id,
          payment_method: typeof defaultPaymentMethod === 'string' ? defaultPaymentMethod : defaultPaymentMethod.id,
          off_session: true,
          confirm: true,
          description: `Auto top-up: ${auto_topup_amount} AI credits`,
          metadata: {
            type: 'credit_auto_topup',
            org_id,
            credit_amount: String(auto_topup_amount),
          },
        });

        if (paymentIntent.status === 'succeeded') {
          // Add credits
          const { data: newBalance, error: addError } = await supabase.rpc('add_credits', {
            p_org_id: org_id,
            p_amount: auto_topup_amount,
            p_type: 'purchase',
            p_description: `Auto top-up: $${auto_topup_amount} (PI: ${paymentIntent.id})`,
            p_stripe_session_id: paymentIntent.id,
          });

          if (addError) {
            console.error(`[credit-auto-topup] add_credits error for ${org_id}:`, addError);
            results.push({ org_id, success: false, error: `Credits not added: ${addError.message}` });
          } else {
            console.log(`[credit-auto-topup] Success: ${auto_topup_amount} credits added to ${org_id}, new balance: ${newBalance}`);
            results.push({ org_id, success: true, credits_added: auto_topup_amount });
          }
        } else {
          results.push({ org_id, success: false, error: `PaymentIntent status: ${paymentIntent.status}` });
        }
      } catch (stripeErr) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error(`[credit-auto-topup] Stripe error for ${org_id}:`, msg);
        results.push({ org_id, success: false, error: msg });
      }
    }

    return new Response(
      JSON.stringify({ message: `Processed ${results.length} org(s)`, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[credit-auto-topup] Error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

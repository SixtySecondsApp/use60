/**
 * Credit Auto Top-Up Edge Function
 *
 * Reads config from auto_top_up_settings (not legacy org_credit_balance fields).
 * Charges the configured pack_type at the correct GBP price via Stripe PaymentIntent
 * (off-session, confirm=true). Enforces monthly_cap and retry logic with notifications.
 *
 * POST /credit-auto-topup
 * Body: { org_id: string, trigger_balance?: number }
 *   - org_id: required — which org to top up
 *   - trigger_balance: optional — balance that triggered the top-up (for logging)
 *
 * The stripe-webhook handles payment_intent.succeeded and payment_intent.payment_failed
 * to fulfill packs and write auto_top_up_log records.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getStripeClient } from '../_shared/stripe.ts';
import { CREDIT_PACKS, type PackType } from '../_shared/creditPacks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Minimum gap between charges for the same org (prevents rapid re-triggers)
const COOLDOWN_MINUTES = 5;

interface TopUpResult {
  org_id: string;
  success: boolean;
  skipped?: string;
  error?: string;
  payment_intent_id?: string;
  credits?: number;
  pack_type?: string;
}

// ---------------------------------------------------------------------------
// Monthly cap enforcement
// ---------------------------------------------------------------------------

async function getSuccessfulTopUpsThisMonth(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('auto_top_up_log')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'success')
    .gte('triggered_at', monthStart.toISOString());

  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Consecutive failure detection
// ---------------------------------------------------------------------------

async function getConsecutiveFailureCount(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  // Look at the last N log entries (in reverse order) to count consecutive failures
  const { data } = await supabase
    .from('auto_top_up_log')
    .select('status')
    .eq('org_id', orgId)
    .in('status', ['success', 'failed'])
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return 0;

  let count = 0;
  for (const row of data) {
    if (row.status === 'failed') {
      count++;
    } else {
      break; // stop at the first non-failure
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Cooldown check (prevents rapid re-triggers within a few minutes)
// ---------------------------------------------------------------------------

async function isInCooldown(supabase: SupabaseClient, orgId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('auto_top_up_log')
    .select('id')
    .eq('org_id', orgId)
    .in('status', ['success', 'retrying'])
    .gte('triggered_at', cutoff)
    .limit(1)
    .maybeSingle();

  return data !== null;
}

// ---------------------------------------------------------------------------
// Notify org admins
// ---------------------------------------------------------------------------

async function notifyAdmins(
  supabase: SupabaseClient,
  orgId: string,
  title: string,
  message: string,
  actionUrl = '/settings/credits'
): Promise<void> {
  const { data: members } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .in('role', ['owner', 'admin']);

  if (!members?.length) return;

  const notifications = members.map((m: { user_id: string }) => ({
    user_id: m.user_id,
    org_id: orgId,
    type: 'credit_auto_topup',
    title,
    message,
    action_url: actionUrl,
    action_text: 'Manage Credits',
    is_read: false,
    created_at: new Date().toISOString(),
  }));

  await supabase.from('user_notifications').insert(notifications);
}

// ---------------------------------------------------------------------------
// Top-up a single org
// ---------------------------------------------------------------------------

async function topUpOrg(
  supabase: SupabaseClient,
  orgId: string,
  triggerBalance: number
): Promise<TopUpResult> {
  // 1. Read settings from auto_top_up_settings
  const { data: settings, error: settingsError } = await supabase
    .from('auto_top_up_settings')
    .select('enabled, pack_type, threshold, monthly_cap, stripe_payment_method_id')
    .eq('org_id', orgId)
    .maybeSingle();

  if (settingsError || !settings) {
    return { org_id: orgId, success: false, error: 'Auto top-up settings not found' };
  }

  if (!settings.enabled) {
    return { org_id: orgId, success: false, skipped: 'Auto top-up is disabled' };
  }

  if (!settings.stripe_payment_method_id) {
    return { org_id: orgId, success: false, error: 'No payment method configured' };
  }

  const packType = settings.pack_type as PackType;
  const pack = CREDIT_PACKS[packType];

  if (!pack) {
    return { org_id: orgId, success: false, error: `Unknown pack type: ${packType}` };
  }

  // 2. Re-check balance — may have recovered since trigger
  const { data: balData } = await supabase
    .from('org_credit_balance')
    .select('balance_credits')
    .eq('org_id', orgId)
    .maybeSingle();

  const currentBalance = balData?.balance_credits ?? 0;
  if (currentBalance > (settings.threshold ?? 10)) {
    return { org_id: orgId, success: true, skipped: `Balance (${currentBalance}) above threshold (${settings.threshold})` };
  }

  // 3. Cooldown check
  if (await isInCooldown(supabase, orgId)) {
    return { org_id: orgId, success: true, skipped: `Cooldown active (${COOLDOWN_MINUTES}min)` };
  }

  // 4. Monthly cap enforcement
  const successCount = await getSuccessfulTopUpsThisMonth(supabase, orgId);
  if (successCount >= (settings.monthly_cap ?? 3)) {
    await supabase.from('auto_top_up_log').insert({
      org_id: orgId,
      trigger_balance: triggerBalance,
      pack_type: packType,
      status: 'capped',
      error_message: `Monthly cap of ${settings.monthly_cap} auto top-ups reached`,
    });
    return { org_id: orgId, success: false, skipped: 'Monthly cap reached' };
  }

  // 5. Find Stripe customer
  const { data: sub } = await supabase
    .from('organization_subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return { org_id: orgId, success: false, error: 'No Stripe customer found' };
  }

  // 6. Charge via Stripe PaymentIntent (off-session, GBP)
  const unitAmountPence = pack.priceGBP * 100;

  try {
    const stripe = getStripeClient();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: unitAmountPence,
      currency: 'gbp',
      customer: sub.stripe_customer_id,
      payment_method: settings.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      description: `Auto top-up: ${pack.label} (${pack.credits} credits)`,
      metadata: {
        type: 'auto_top_up',
        org_id: orgId,
        pack_type: packType,
        credits: String(pack.credits),
        trigger_balance: String(triggerBalance),
      },
    });

    if (paymentIntent.status === 'succeeded') {
      // stripe-webhook will handle add_credits_pack + auto_top_up_log insert on success.
      // Return the payment_intent_id so callers can track it.
      console.log(`[credit-auto-topup] Payment succeeded for org ${orgId}: PI ${paymentIntent.id}`);
      return {
        org_id: orgId,
        success: true,
        payment_intent_id: paymentIntent.id,
        credits: pack.credits,
        pack_type: packType,
      };
    }

    // Payment requires action or pending — log as retrying
    const errMsg = `PaymentIntent status: ${paymentIntent.status}`;
    await supabase.from('auto_top_up_log').insert({
      org_id: orgId,
      trigger_balance: triggerBalance,
      pack_type: packType,
      stripe_payment_intent_id: paymentIntent.id,
      status: 'retrying',
      error_message: errMsg,
    });

    return { org_id: orgId, success: false, error: errMsg, payment_intent_id: paymentIntent.id };
  } catch (stripeErr) {
    const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
    console.error(`[credit-auto-topup] Stripe error for ${orgId}:`, msg);

    // Log the failure
    await supabase.from('auto_top_up_log').insert({
      org_id: orgId,
      trigger_balance: triggerBalance,
      pack_type: packType,
      status: 'failed',
      error_message: msg,
    });

    // Check for second consecutive failure — disable auto top-up and notify
    const consecutive = await getConsecutiveFailureCount(supabase, orgId);
    if (consecutive >= 2) {
      await supabase
        .from('auto_top_up_settings')
        .update({ enabled: false })
        .eq('org_id', orgId);

      await notifyAdmins(
        supabase,
        orgId,
        'Auto Top-Up Disabled',
        'Your automatic credit top-up has been disabled after two consecutive payment failures. Please update your payment method and re-enable auto top-up.',
        '/settings/credits'
      );
    }

    return { org_id: orgId, success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

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
    const orgId: string | undefined = body.org_id;
    const triggerBalance: number = parseFloat(body.trigger_balance ?? '0');

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: org_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await topUpOrg(supabase, orgId, triggerBalance);

    return new Response(
      JSON.stringify(result),
      {
        status: result.success || result.skipped ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
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

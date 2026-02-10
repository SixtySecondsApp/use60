// supabase/functions/stripe-webhook/index.ts
// Stripe webhook handler for subscription events

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { corsHeaders } from "../_shared/cors.ts";
import { captureException } from "../_shared/sentryEdge.ts";
import {
  verifyWebhookSignature,
  mapStripeStatus,
  getTrialEndDate,
  getPeriodDates,
  extractMetadata,
  isStripeSubscription,
  isStripeInvoice,
  isStripeCheckoutSession,
} from "../_shared/stripe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface WebhookResult {
  success: boolean;
  event_id: string;
  event_type: string;
  message?: string;
  error?: string;
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

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;

  try {
    event = await verifyWebhookSignature(rawBody, signature);
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return new Response(
      JSON.stringify({ error: "Invalid webhook signature" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const result = await processStripeEvent(supabase, event);

  return new Response(
    JSON.stringify(result),
    {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});

async function processStripeEvent(
  supabase: SupabaseClient,
  event: Stripe.Event
): Promise<WebhookResult> {
  const eventId = event.id;
  const eventType = event.type;

  console.log(`Processing Stripe event: ${eventType} (${eventId})`);

  // Extract org_id early for event logging
  let orgId: string | null = extractOrgIdFromEvent(event);

  // Log event to billing_event_log BEFORE processing (idempotent)
  // This ensures we have a record even if processing fails
  try {
    await logBillingEvent(supabase, event, orgId);
  } catch (logError) {
    // Log error but don't fail - we still want to process the event
    console.error('Error logging billing event (non-fatal):', logError);
    await captureException(logError as Error, {
      tags: {
        function: 'stripe-webhook',
        event_type: eventType,
        event_id: eventId,
        integration: 'stripe',
        phase: 'event_logging',
      },
    });
  }

  try {
    switch (eventType) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(supabase, event.data.object);
        break;

      case "customer.subscription.created":
        await handleSubscriptionCreated(supabase, event.data.object);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(supabase, event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(supabase, event.data.object);
        break;

      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(supabase, event.data.object);
        break;

      case "invoice.paid":
        await handleInvoicePaid(supabase, event.data.object);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(supabase, event.data.object);
        break;

      case "invoice.finalized":
        await handleInvoiceFinalized(supabase, event.data.object);
        break;

      case "charge.refunded":
        await handleChargeRefunded(supabase, event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
        return {
          success: true,
          event_id: eventId,
          event_type: eventType,
          message: "Event type not handled",
        };
    }

    // Mark event as processed successfully
    await markEventProcessed(supabase, eventId, null);

    return {
      success: true,
      event_id: eventId,
      event_type: eventType,
      message: "Event processed successfully",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error processing ${eventType}:`, error);
    
    // Mark event as processed with error
    await markEventProcessed(supabase, eventId, errorMessage);
    
    await captureException(error, {
      tags: {
        function: 'stripe-webhook',
        event_type: eventType,
        event_id: eventId,
        integration: 'stripe',
      },
      extra: {
        eventType,
        eventId,
      },
    });
    return {
      success: false,
      event_id: eventId,
      event_type: eventType,
      error: errorMessage,
    };
  }
}

// Mark billing event as processed
async function markEventProcessed(
  supabase: SupabaseClient,
  providerEventId: string,
  error: string | null
): Promise<void> {
  const { error: updateError } = await supabase
    .from('billing_event_log')
    .update({
      processed_at: new Date().toISOString(),
      processing_error: error,
    })
    .eq('provider', 'stripe')
    .eq('provider_event_id', providerEventId);

  if (updateError) {
    console.error('Error marking event as processed:', updateError);
    // Don't throw - this is not critical
  }
}

// ============================================================================
// CHECKOUT SESSION COMPLETED
// ============================================================================
async function handleCheckoutCompleted(
  supabase: SupabaseClient,
  session: unknown
): Promise<void> {
  if (!isStripeCheckoutSession(session)) {
    throw new Error("Invalid checkout session object");
  }

  const metadata = extractMetadata(session);
  const orgId = metadata.org_id;
  const planId = metadata.plan_id;

  // Handle credit purchase fulfillment (one-time payment, not subscription)
  if ((session as any).mode === 'payment' && metadata.type === 'credit_purchase') {
    const creditAmount = parseFloat(metadata.credit_amount ?? '0');
    const userId = metadata.user_id;
    const sessionId = (session as any).id;

    if (!orgId || !creditAmount || isNaN(creditAmount)) {
      console.error('[Webhook] Invalid credit purchase metadata:', metadata);
      // Don't throw — acknowledge webhook to prevent Stripe retries
      return;
    }

    // Idempotency: check if we already processed this session
    const { data: existingTxn } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('stripe_session_id', sessionId)
      .maybeSingle();

    if (existingTxn) {
      console.log(`[Webhook] Credit purchase already processed for session ${sessionId}`);
      return;
    }

    // Add credits via RPC
    const { data: newBalance, error: creditError } = await supabase
      .rpc('add_credits', {
        p_org_id: orgId,
        p_amount: creditAmount,
        p_type: 'purchase',
        p_description: `Credit pack purchase — $${creditAmount}`,
        p_stripe_session_id: sessionId,
        p_created_by: userId || null,
      });

    if (creditError) {
      console.error('[Webhook] Error adding credits:', creditError);
    } else {
      console.log(`[Webhook] Added ${creditAmount} credits to org ${orgId}. New balance: ${newBalance}`);
    }

    return;
  }

  if (!orgId) {
    console.warn("Checkout session missing org_id in metadata");
    // Try to find org by customer ID if available
    const customerId = typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
    if (customerId) {
      const { data: existingSub } = await supabase
        .from("organization_subscriptions")
        .select("org_id")
        .eq("stripe_customer_id", customerId)
        .single();
      if (existingSub) {
        // Update event log with found org_id
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
        if (subscriptionId) {
          await supabase
            .from('billing_event_log')
            .update({ org_id: existingSub.org_id })
            .eq('provider', 'stripe')
            .eq('provider_event_id', (session as any).id || '');
        }
      }
    }
    return;
  }

  console.log(`Checkout completed for org: ${orgId}, plan: ${planId}`);

  // Get subscription ID from session
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;

  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id;

  if (!subscriptionId) {
    console.warn("Checkout session has no subscription");
    return;
  }

  // Update organization subscription with Stripe IDs
  const { error } = await supabase
    .from("organization_subscriptions")
    .update({
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId);

  if (error) {
    console.error("Error updating subscription after checkout:", error);
    throw error;
  }

  // Record billing history event
  await recordBillingEvent(supabase, orgId, {
    event_type: "plan_change",
    amount: session.amount_total ?? 0,
    currency: session.currency?.toUpperCase() ?? "GBP",
    status: "paid",
    description: "Subscription started via checkout",
    metadata: { checkout_session_id: session.id, plan_id: planId },
  });
}

// ============================================================================
// SUBSCRIPTION CREATED
// ============================================================================
async function handleSubscriptionCreated(
  supabase: SupabaseClient,
  subscription: unknown
): Promise<void> {
  if (!isStripeSubscription(subscription)) {
    throw new Error("Invalid subscription object");
  }

  const metadata = extractMetadata(subscription);
  const orgId = metadata.org_id;

  if (!orgId) {
    console.warn("Subscription missing org_id in metadata, checking customer...");
    // Try to find org by customer ID
    const customerId = typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

    if (customerId) {
      const { data: existingSub } = await supabase
        .from("organization_subscriptions")
        .select("org_id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (existingSub) {
        await syncSubscriptionToDatabase(supabase, existingSub.org_id, subscription);
        return;
      }
    }
    console.warn("Could not find org for subscription");
    return;
  }

  await syncSubscriptionToDatabase(supabase, orgId, subscription);
}

// ============================================================================
// SUBSCRIPTION UPDATED
// ============================================================================
async function handleSubscriptionUpdated(
  supabase: SupabaseClient,
  subscription: unknown
): Promise<void> {
  if (!isStripeSubscription(subscription)) {
    throw new Error("Invalid subscription object");
  }

  // Find the organization by Stripe subscription ID
  const { data: existingSub, error: findError } = await supabase
    .from("organization_subscriptions")
    .select("org_id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  let orgId: string | null = null;

  if (findError || !existingSub) {
    // Try finding by customer ID
    const customerId = typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

    if (customerId) {
      const { data: subByCustomer } = await supabase
        .from("organization_subscriptions")
        .select("org_id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (subByCustomer) {
        orgId = subByCustomer.org_id;
        // Update event log with found org_id
        await supabase
          .from('billing_event_log')
          .update({ org_id })
          .eq('provider', 'stripe')
          .eq('provider_event_id', subscription.id);
        await syncSubscriptionToDatabase(supabase, orgId, subscription);
        return;
      }
    }

    console.warn(`Could not find subscription for Stripe ID: ${subscription.id}`);
    return;
  }

  orgId = existingSub.org_id;
  // Update event log with org_id if not already set
  await supabase
    .from('billing_event_log')
    .update({ org_id })
    .eq('provider', 'stripe')
    .eq('provider_event_id', subscription.id)
    .is('org_id', null);

  await syncSubscriptionToDatabase(supabase, orgId, subscription);
}

// ============================================================================
// SUBSCRIPTION DELETED
// ============================================================================
async function handleSubscriptionDeleted(
  supabase: SupabaseClient,
  subscription: unknown
): Promise<void> {
  if (!isStripeSubscription(subscription)) {
    throw new Error("Invalid subscription object");
  }

  const { data: existingSub } = await supabase
    .from("organization_subscriptions")
    .select("org_id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (!existingSub) {
    console.warn(`Could not find subscription to delete: ${subscription.id}`);
    return;
  }

  const { error } = await supabase
    .from("organization_subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error("Error marking subscription as canceled:", error);
    throw error;
  }

  // Create notification for org admins
  await createOrgNotification(supabase, existingSub.org_id, {
    type: "subscription_updated",
    title: "Subscription Cancelled",
    message: "Your subscription has been cancelled. You will lose access to premium features at the end of your billing period.",
    action_url: "/team/billing",
    action_text: "View Billing",
  });
}

// ============================================================================
// TRIAL WILL END
// ============================================================================
async function handleTrialWillEnd(
  supabase: SupabaseClient,
  subscription: unknown
): Promise<void> {
  if (!isStripeSubscription(subscription)) {
    throw new Error("Invalid subscription object");
  }

  const { data: existingSub } = await supabase
    .from("organization_subscriptions")
    .select("org_id, trial_ends_at")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (!existingSub) {
    console.warn(`Could not find subscription for trial warning: ${subscription.id}`);
    return;
  }

  const trialEnd = getTrialEndDate(subscription);
  const daysRemaining = trialEnd
    ? Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 3;

  // Create notification for org admins
  await createOrgNotification(supabase, existingSub.org_id, {
    type: "trial_ending",
    title: "Trial Ending Soon",
    message: `Your free trial ends in ${daysRemaining} days. Add a payment method to continue using premium features.`,
    action_url: "/team/billing",
    action_text: "Upgrade Now",
  });
}

// ============================================================================
// INVOICE PAID
// ============================================================================
async function handleInvoicePaid(
  supabase: SupabaseClient,
  invoice: unknown
): Promise<void> {
  if (!isStripeInvoice(invoice)) {
    throw new Error("Invalid invoice object");
  }

  const subscriptionId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;

  if (!subscriptionId) {
    console.log("Invoice not associated with a subscription");
    return;
  }

  const { data: existingSub } = await supabase
    .from("organization_subscriptions")
    .select("org_id, id")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!existingSub) {
    console.warn(`Could not find subscription for invoice: ${invoice.id}`);
    return;
  }

  // Update subscription status to active (in case it was past_due)
  // Also update payment dates for analytics
  const paymentDate = new Date().toISOString();
  await supabase
    .from("organization_subscriptions")
    .update({
      status: "active",
      stripe_latest_invoice_id: invoice.id,
      last_payment_at: paymentDate,
      first_payment_at: paymentDate, // Set if not already set
      updated_at: paymentDate,
    })
    .eq("stripe_subscription_id", subscriptionId);

  // Record billing history
  await recordBillingEvent(supabase, existingSub.org_id, {
    event_type: "payment",
    amount: invoice.amount_paid ?? 0,
    currency: invoice.currency?.toUpperCase() ?? "GBP",
    status: "paid",
    description: invoice.description || "Subscription payment",
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id: typeof invoice.payment_intent === "string"
      ? invoice.payment_intent
      : invoice.payment_intent?.id,
    receipt_url: invoice.hosted_invoice_url ?? undefined,
    hosted_invoice_url: invoice.hosted_invoice_url ?? undefined,
    period_start: invoice.period_start
      ? new Date(invoice.period_start * 1000).toISOString()
      : undefined,
    period_end: invoice.period_end
      ? new Date(invoice.period_end * 1000).toISOString()
      : undefined,
    subscription_id: existingSub.id,
  });
}

// ============================================================================
// INVOICE PAYMENT FAILED
// ============================================================================
async function handleInvoicePaymentFailed(
  supabase: SupabaseClient,
  invoice: unknown
): Promise<void> {
  if (!isStripeInvoice(invoice)) {
    throw new Error("Invalid invoice object");
  }

  const subscriptionId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;

  if (!subscriptionId) {
    return;
  }

  const { data: existingSub } = await supabase
    .from("organization_subscriptions")
    .select("org_id, id")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!existingSub) {
    return;
  }

  // Update subscription status to past_due
  await supabase
    .from("organization_subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);

  // Record failed payment in billing history
  await recordBillingEvent(supabase, existingSub.org_id, {
    event_type: "payment",
    amount: invoice.amount_due ?? 0,
    currency: invoice.currency?.toUpperCase() ?? "GBP",
    status: "failed",
    description: "Payment failed",
    stripe_invoice_id: invoice.id,
    subscription_id: existingSub.id,
  });

  // Create notification for org admins
  await createOrgNotification(supabase, existingSub.org_id, {
    type: "payment_failed",
    title: "Payment Failed",
    message: "We couldn't process your payment. Please update your payment method to avoid service interruption.",
    action_url: "/team/billing",
    action_text: "Update Payment",
  });
}

// ============================================================================
// INVOICE FINALIZED
// ============================================================================
async function handleInvoiceFinalized(
  supabase: SupabaseClient,
  invoice: unknown
): Promise<void> {
  if (!isStripeInvoice(invoice)) {
    throw new Error("Invalid invoice object");
  }

  const subscriptionId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;

  if (!subscriptionId) {
    return;
  }

  const { data: existingSub } = await supabase
    .from("organization_subscriptions")
    .select("org_id, id")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!existingSub) {
    return;
  }

  // Record pending invoice in billing history
  await recordBillingEvent(supabase, existingSub.org_id, {
    event_type: "invoice",
    amount: invoice.amount_due ?? 0,
    currency: invoice.currency?.toUpperCase() ?? "GBP",
    status: "pending",
    description: invoice.description || "Invoice created",
    stripe_invoice_id: invoice.id,
    hosted_invoice_url: invoice.hosted_invoice_url ?? undefined,
    pdf_url: invoice.invoice_pdf ?? undefined,
    period_start: invoice.period_start
      ? new Date(invoice.period_start * 1000).toISOString()
      : undefined,
    period_end: invoice.period_end
      ? new Date(invoice.period_end * 1000).toISOString()
      : undefined,
    subscription_id: existingSub.id,
  });
}

// ============================================================================
// CHARGE REFUNDED (credit purchase reversal)
// ============================================================================
async function handleChargeRefunded(
  supabase: SupabaseClient,
  charge: unknown
): Promise<void> {
  const chargeObj = charge as any;
  const metadata = chargeObj?.metadata ?? {};

  // Only handle credit purchase refunds
  if (metadata.type !== 'credit_purchase') {
    console.log('[Webhook] Charge refund is not a credit purchase, skipping credit reversal');
    return;
  }

  const orgId = metadata.org_id;
  if (!orgId) {
    console.warn('[Webhook] Credit refund charge missing org_id in metadata');
    return;
  }

  // Refund amount is in cents — convert to dollars
  const refundAmount = (chargeObj.amount_refunded ?? 0) / 100;

  if (refundAmount <= 0) {
    console.warn('[Webhook] Refund amount is zero or negative, skipping');
    return;
  }

  const { error: deductError } = await supabase.rpc('deduct_credits', {
    p_org_id: orgId,
    p_amount: refundAmount,
    p_description: 'Refund — credit purchase reversed',
    p_feature_key: null,
    p_cost_event_id: null,
  });

  if (deductError) {
    console.error('[Webhook] Error deducting credits on refund:', deductError);
  } else {
    console.log(`[Webhook] Deducted ${refundAmount} credits from org ${orgId} due to refund`);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function syncSubscriptionToDatabase(
  supabase: SupabaseClient,
  orgId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const status = mapStripeStatus(subscription.status);
  const { periodStart, periodEnd } = getPeriodDates(subscription);
  const trialEnd = getTrialEndDate(subscription);

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;

  // Get the price ID from the first subscription item
  const priceId = subscription.items.data[0]?.price?.id;

  const updateData: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId,
    stripe_price_id: priceId,
    status,
    current_period_start: periodStart.toISOString(),
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    quantity: subscription.items.data[0]?.quantity ?? 1,
    updated_at: new Date().toISOString(),
  };

  if (trialEnd) {
    updateData.trial_ends_at = trialEnd.toISOString();
  }

  if (subscription.canceled_at) {
    updateData.canceled_at = new Date(subscription.canceled_at * 1000).toISOString();
  }

  if (subscription.default_payment_method) {
    updateData.stripe_payment_method_id = typeof subscription.default_payment_method === "string"
      ? subscription.default_payment_method
      : subscription.default_payment_method.id;
  }

  const { error } = await supabase
    .from("organization_subscriptions")
    .update(updateData)
    .eq("org_id", orgId);

  if (error) {
    console.error("Error syncing subscription to database:", error);
    throw error;
  }

  console.log(`Synced subscription for org ${orgId}: status=${status}, MRR=${recurringAmountCents / 100} ${interval}`);
}

interface BillingEventData {
  event_type: string;
  amount: number;
  currency: string;
  status: string;
  description?: string;
  stripe_invoice_id?: string;
  stripe_payment_intent_id?: string;
  stripe_charge_id?: string;
  receipt_url?: string;
  hosted_invoice_url?: string;
  pdf_url?: string;
  period_start?: string;
  period_end?: string;
  subscription_id?: string;
  metadata?: Record<string, unknown>;
}

async function recordBillingEvent(
  supabase: SupabaseClient,
  orgId: string,
  data: BillingEventData
): Promise<void> {
  const { error } = await supabase.from("billing_history").insert({
    org_id: orgId,
    event_type: data.event_type,
    amount: data.amount,
    currency: data.currency,
    status: data.status,
    description: data.description,
    stripe_invoice_id: data.stripe_invoice_id,
    stripe_payment_intent_id: data.stripe_payment_intent_id,
    stripe_charge_id: data.stripe_charge_id,
    receipt_url: data.receipt_url,
    hosted_invoice_url: data.hosted_invoice_url,
    pdf_url: data.pdf_url,
    period_start: data.period_start,
    period_end: data.period_end,
    subscription_id: data.subscription_id,
    metadata: data.metadata ?? {},
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Error recording billing event:", error);
    // Don't throw - billing history is not critical
  }
}

interface NotificationData {
  type: string;
  title: string;
  message: string;
  action_url?: string;
  action_text?: string;
}

async function createOrgNotification(
  supabase: SupabaseClient,
  orgId: string,
  data: NotificationData
): Promise<void> {
  // Get all org owners and admins
  const { data: members, error: membersError } = await supabase
    .from("organization_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .in("role", ["owner", "admin"]);

  if (membersError || !members?.length) {
    console.warn(`Could not find members for org ${orgId} to notify`);
    return;
  }

  // Create notification for each admin/owner
  const notifications = members.map((member) => ({
    user_id: member.user_id,
    org_id: orgId,
    type: data.type,
    title: data.title,
    message: data.message,
    action_url: data.action_url,
    action_text: data.action_text,
    is_read: false,
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("user_notifications").insert(notifications);

  if (error) {
    console.error("Error creating notifications:", error);
    // Don't throw - notifications are not critical
  }
}

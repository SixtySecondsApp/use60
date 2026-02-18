// supabase/functions/_shared/stripe.ts
// Shared Stripe utilities for Edge Functions

import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

// Initialize Stripe client with secret key
export function getStripeClient(): Stripe {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }
  return new Stripe(secretKey, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

// Verify Stripe webhook signature using native Web Crypto API.
// The Stripe SDK's constructEvent / constructEventAsync both pull in
// Node.js crypto polyfills that crash in the Supabase Edge Runtime,
// so we verify the HMAC-SHA256 signature manually.
const DEFAULT_TOLERANCE_SECONDS = 300; // 5 minutes

export async function verifyWebhookSignature(
  payload: string,
  signature: string | null,
): Promise<Stripe.Event> {
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");
  }

  if (!signature) {
    throw new Error("Missing Stripe signature header");
  }

  // 1. Parse the signature header: "t=<timestamp>,v1=<sig1>,v1=<sig2>,..."
  const parts = signature.split(",");
  let timestamp: string | undefined;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") {
      timestamp = value;
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error("Webhook signature verification failed: Invalid signature header format");
  }

  // 2. Check timestamp tolerance
  const timestampNum = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNum) > DEFAULT_TOLERANCE_SECONDS) {
    throw new Error("Webhook signature verification failed: Timestamp outside tolerance zone");
  }

  // 3. Compute expected signature: HMAC-SHA256(secret, "<timestamp>.<payload>")
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signedPayload = `${timestamp}.${payload}`;
  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));

  // Convert to hex string
  const expectedSig = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // 4. Constant-time comparison against any provided v1 signature
  const match = signatures.some((sig) => timingSafeEqual(sig, expectedSig));

  if (!match) {
    throw new Error("Webhook signature verification failed: No matching signature found");
  }

  // 5. Parse and return the event
  return JSON.parse(payload) as Stripe.Event;
}

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Map Stripe subscription status to our internal status
export function mapStripeStatus(stripeStatus: string): string {
  const statusMapping: Record<string, string> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
    incomplete: "past_due",
    incomplete_expired: "canceled",
    paused: "paused",
  };
  return statusMapping[stripeStatus] || "canceled";
}

// Format amount from pence to display format
export function formatAmount(amountInPence: number, currency: string = "GBP"): string {
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  return formatter.format(amountInPence / 100);
}

// Convert amount from pounds to pence
export function toPence(pounds: number): number {
  return Math.round(pounds * 100);
}

// Convert amount from pence to pounds
export function fromPence(pence: number): number {
  return pence / 100;
}

// Type definitions for Stripe webhook events we handle
export type StripeEventType =
  | "checkout.session.completed"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "customer.subscription.trial_will_end"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "invoice.finalized"
  | "customer.updated";

// Get SITE_URL for redirect URLs
export function getSiteUrl(): string {
  return Deno.env.get("SITE_URL") || "http://localhost:5173";
}

// Type guard for Stripe Subscription
export function isStripeSubscription(obj: unknown): obj is Stripe.Subscription {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "status" in obj &&
    "items" in obj
  );
}

// Type guard for Stripe Invoice
export function isStripeInvoice(obj: unknown): obj is Stripe.Invoice {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "amount_paid" in obj &&
    "status" in obj
  );
}

// Type guard for Stripe Customer
export function isStripeCustomer(obj: unknown): obj is Stripe.Customer {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "email" in obj &&
    !("deleted" in obj && (obj as { deleted: boolean }).deleted)
  );
}

// Type guard for Stripe Checkout Session
export function isStripeCheckoutSession(obj: unknown): obj is Stripe.Checkout.Session {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "mode" in obj
  );
}

// Extract metadata from Stripe object
export function extractMetadata(
  obj: { metadata?: Stripe.Metadata | null } | null | undefined,
): Record<string, string> {
  if (!obj?.metadata) return {};
  return obj.metadata as Record<string, string>;
}

// Calculate trial end date from Stripe subscription
export function getTrialEndDate(subscription: Stripe.Subscription): Date | null {
  if (!subscription.trial_end) return null;
  return new Date(subscription.trial_end * 1000);
}

// Get period dates from Stripe subscription
export function getPeriodDates(subscription: Stripe.Subscription): {
  periodStart: Date;
  periodEnd: Date;
} {
  return {
    periodStart: new Date(subscription.current_period_start * 1000),
    periodEnd: new Date(subscription.current_period_end * 1000),
  };
}

// Get or create Stripe customer for an organization
export async function getOrCreateStripeCustomer(
  stripe: Stripe,
  orgId: string,
  email: string,
  name?: string,
  existingCustomerId?: string | null,
): Promise<Stripe.Customer> {
  // If we have an existing customer ID, try to retrieve it
  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId);
      if (!("deleted" in customer) || !customer.deleted) {
        return customer as Stripe.Customer;
      }
    } catch (error) {
      console.warn(`Could not retrieve customer ${existingCustomerId}:`, error);
    }
  }

  // Create a new customer with tax settings
  // Tax exempt status will be determined automatically by Stripe Tax
  // based on customer location and VAT number (if provided)
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      org_id: orgId,
    },
    // Let Stripe automatically determine tax exempt status
    // This will be updated when customer provides address/VAT number at checkout
    tax_exempt: "none",
  });

  return customer;
}

// Update customer with VAT number (for B2B sales)
export async function updateCustomerTaxId(
  stripe: Stripe,
  customerId: string,
  taxIdType: "gb_vat" | "eu_vat",
  taxIdValue: string,
): Promise<Stripe.TaxId> {
  // Create tax ID for the customer
  // For UK VAT: type = "gb_vat", value = "GB123456789"
  // For EU VAT: type = "eu_vat", value = "DE123456789" (country code + number)
  const taxId = await stripe.customers.createTaxId(customerId, {
    type: taxIdType,
    value: taxIdValue,
  });

  return taxId;
}

// Get customer's tax IDs
export async function getCustomerTaxIds(
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.TaxId[]> {
  const taxIds = await stripe.customers.listTaxIds(customerId);
  return taxIds.data;
}

// src/lib/types/subscription.ts
// TypeScript types for subscription management

// Plan tier identifiers
export type PlanTier = 'basic' | 'pro' | 'trial' | 'cancelled';
// Legacy tiers (deprecated): 'starter' | 'growth' | 'team' | 'free'

// Subscription status
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused';

// Billing cycle
export type BillingCycle = 'monthly' | 'yearly';

// Plan features structure
export interface PlanFeatures {
  analytics: boolean;
  team_insights: boolean;
  api_access: boolean;
  custom_branding: boolean;
  priority_support: boolean;
  bundled_credits: number;
  webhooks: boolean;
  advanced_analytics: boolean;
  coaching_digests: boolean;
  [key: string]: boolean | number;
}

// Subscription plan from database
export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number; // in pence
  price_yearly: number; // in pence
  currency: string;
  max_users: number | null;
  max_meetings_per_month: number | null;
  max_ai_tokens_per_month: number | null;
  max_storage_mb: number | null;
  stripe_product_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  stripe_seat_price_id: string | null;
  included_seats: number;
  per_seat_price: number; // in pence
  meeting_retention_months: number | null;
  trial_days: number;
  features: PlanFeatures;
  is_active: boolean;
  is_default: boolean;
  is_free_tier: boolean;
  is_public: boolean;
  display_order: number;
  badge_text: string | null;
  cta_text: string;
  cta_url: string | null;
  highlight_features: string[];
  stripe_synced_at: string | null;
  stripe_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

// Organization subscription from database
export interface OrganizationSubscription {
  id: string;
  org_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  started_at: string;
  current_period_start: string;
  current_period_end: string;
  trial_start_at: string | null;
  trial_ends_at: string | null;
  canceled_at: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_latest_invoice_id: string | null;
  quantity: number;
  cancel_at_period_end: boolean;
  cancellation_reason: string | null;
  custom_max_users: number | null;
  custom_max_meetings: number | null;
  custom_max_ai_tokens: number | null;
  custom_max_storage_mb: number | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

// Subscription with plan details
export interface SubscriptionWithPlan extends OrganizationSubscription {
  plan: SubscriptionPlan;
}

// Trial status
export interface TrialStatus {
  isTrialing: boolean;
  daysRemaining: number;
  endsAt: Date | null;
  startedAt: Date | null;
  hasExpired: boolean;
  hasPaymentMethod: boolean;
  meetingsUsed: number;
  meetingsLimit: number;
  meetingsRemaining: number;
}

export interface SubscriptionCreditState {
  subscriptionCreditsBalance: number;
  subscriptionCreditsExpiry: string | null;
  onboardingCreditsBalance: number;
  onboardingComplete: boolean;
  packCreditsBalance: number;
  totalBalance: number;
}

// Usage limits
export interface UsageLimits {
  meetings: {
    limit: number | null;
    used: number;
    remaining: number | null;
    percentUsed: number;
  };
  users: {
    limit: number | null;
    active: number;
    remaining: number | null;
    overageCount: number;
    overageAmount: number; // in pence
  };
  retentionMonths: number | null;
  // True if this is a free tier limit (total meetings) vs paid tier (per month)
  isFreeTierLimit?: boolean;
}

// Organization usage from database
export interface OrganizationUsage {
  id: string;
  org_id: string;
  period_start: string;
  period_end: string;
  meetings_count: number;
  meetings_duration_minutes: number;
  ai_tokens_used: number;
  storage_used_mb: number;
  active_users_count: number;
  usage_breakdown: Record<string, number>;
  created_at: string;
  updated_at: string;
}

// Billing history item
export interface BillingHistoryItem {
  id: string;
  org_id: string;
  subscription_id: string | null;
  event_type: 'invoice' | 'payment' | 'refund' | 'credit' | 'plan_change';
  amount: number; // in pence
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  description: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  receipt_url: string | null;
  hosted_invoice_url: string | null;
  pdf_url: string | null;
  period_start: string | null;
  period_end: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// User notification
export interface UserNotification {
  id: string;
  user_id: string;
  org_id: string | null;
  type: 'trial_ending' | 'trial_ended' | 'payment_failed' | 'subscription_updated' | 'usage_warning';
  title: string;
  message: string;
  action_url: string | null;
  action_text: string | null;
  is_read: boolean;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

// Complete subscription state
export interface SubscriptionState {
  subscription: SubscriptionWithPlan | null;
  trial: TrialStatus;
  usage: UsageLimits | null;
  isLoading: boolean;
  error: string | null;
}

// API request/response types
export interface CreateCheckoutSessionRequest {
  org_id: string;
  plan_id?: string;
  plan_slug?: 'basic' | 'pro';
  billing_cycle?: BillingCycle;
  success_url?: string;
  cancel_url?: string;
}

export interface CreateCheckoutSessionResponse {
  url: string;
  session_id: string;
}

export interface CreatePortalSessionRequest {
  org_id: string;
  return_url?: string;
}

export interface CreatePortalSessionResponse {
  url: string;
}

export interface StartFreeTrialRequest {
  org_id: string;
  plan_id: string;
}

export interface StartFreeTrialResponse {
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

// Feature access check result
export interface FeatureAccessResult {
  allowed: boolean;
  reason?: 'plan_limit' | 'trial_expired' | 'subscription_inactive' | 'retention_expired';
  upgradeRequired?: PlanTier;
  message?: string;
}

// Limit check result
export interface LimitCheckResult {
  canProceed: boolean;
  limitType: 'hard' | 'soft' | 'none';
  currentUsage: number;
  limit: number | null;
  percentUsed: number;
  warning?: string;
  blockReason?: string;
}

// Helper type for pricing display
export interface PricingDisplayInfo {
  monthlyPrice: string;
  yearlyPrice: string;
  yearlyMonthlyEquivalent: string;
  yearlySavings: string;
  yearlySavingsPercent: number;
}

// Helper function to format currency
export function formatCurrency(amountInPence: number, currency: string = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountInPence / 100);
}

// Helper function to calculate pricing display info
export function getPricingDisplayInfo(plan: SubscriptionPlan): PricingDisplayInfo {
  const monthlyPrice = formatCurrency(plan.price_monthly, plan.currency);
  const yearlyPrice = formatCurrency(plan.price_yearly, plan.currency);
  const yearlyMonthlyEquivalent = formatCurrency(Math.round(plan.price_yearly / 12), plan.currency);

  const monthlyCostForYear = plan.price_monthly * 12;
  const savings = monthlyCostForYear - plan.price_yearly;
  const savingsPercent = Math.round((savings / monthlyCostForYear) * 100);

  return {
    monthlyPrice,
    yearlyPrice,
    yearlyMonthlyEquivalent,
    yearlySavings: formatCurrency(savings, plan.currency),
    yearlySavingsPercent: savingsPercent,
  };
}

// Helper function to get tier from plan slug
export function getTierFromSlug(slug: string): PlanTier {
  const tierMap: Record<string, PlanTier> = {
    basic: 'basic',
    pro: 'pro',
    free: 'basic', // Legacy mapping
    starter: 'basic',
    growth: 'pro',
    team: 'pro',
    enterprise: 'pro',
  };
  return tierMap[slug.toLowerCase()] || 'basic';
}

// Helper function to check if plan tier is higher
export function isTierHigher(current: PlanTier, required: PlanTier): boolean {
  const tierOrder: PlanTier[] = ['trial', 'cancelled', 'basic', 'pro'];
  return tierOrder.indexOf(current) >= tierOrder.indexOf(required);
}

// ============================================================================
// ADMIN TYPES FOR PRICING CONTROL
// ============================================================================

// Public plan for pricing page display
export interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_users: number | null;
  max_meetings_per_month: number | null;
  max_ai_tokens_per_month: number | null;
  max_storage_mb: number | null;
  meeting_retention_months: number | null;
  included_seats: number;
  per_seat_price: number;
  trial_days: number;
  features: PlanFeatures;
  is_free_tier: boolean;
  display_order: number;
  badge_text: string | null;
  cta_text: string;
  cta_url: string | null;
  highlight_features: string[];
}

// Input for creating a new plan
export interface CreatePlanInput {
  name: string;
  slug: string;
  description?: string;
  price_monthly: number;
  price_yearly: number;
  currency?: string;
  max_users?: number | null;
  max_meetings_per_month?: number | null;
  max_ai_tokens_per_month?: number | null;
  max_storage_mb?: number | null;
  meeting_retention_months?: number | null;
  included_seats?: number;
  per_seat_price?: number;
  trial_days?: number;
  features?: Partial<PlanFeatures>;
  is_active?: boolean;
  is_default?: boolean;
  is_free_tier?: boolean;
  is_public?: boolean;
  display_order?: number;
  badge_text?: string | null;
  cta_text?: string;
  cta_url?: string | null;
  highlight_features?: string[];
  stripe_product_id?: string | null;
  stripe_price_id_monthly?: string | null;
  stripe_price_id_yearly?: string | null;
  stripe_seat_price_id?: string | null;
}

// Input for updating a plan
export interface UpdatePlanInput extends Partial<CreatePlanInput> {
  id: string;
}

// Stripe sync request
export interface StripeSyncRequest {
  plan_id: string;
  action: 'create' | 'update' | 'sync';
}

// Stripe sync response
export interface StripeSyncResponse {
  success: boolean;
  stripe_product_id?: string;
  stripe_price_id_monthly?: string;
  stripe_price_id_yearly?: string;
  error?: string;
}

// Plan validation result
export interface PlanValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

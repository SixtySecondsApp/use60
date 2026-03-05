/**
 * SaaS Admin Types
 *
 * Type definitions for subscription plans, usage tracking, and feature management
 */

// ============================================================================
// Subscription Plans
// ============================================================================

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;

  // Pricing (in cents)
  price_monthly: number;
  price_yearly: number;
  currency: string;

  // Limits (null = unlimited)
  max_users: number | null;
  max_meetings_per_month: number | null;
  max_ai_tokens_per_month: number | null;
  max_storage_mb: number | null;
  meeting_retention_months: number | null;

  // Seat-based pricing
  included_seats: number;
  per_seat_price: number;

  // Features
  features: PlanFeatures;

  // Stripe integration
  stripe_product_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  stripe_seat_price_id: string | null;
  stripe_synced_at: string | null;
  stripe_sync_error: string | null;

  // Trial
  trial_days: number;

  // Status
  is_active: boolean;
  is_default: boolean;
  is_free_tier: boolean;
  is_public: boolean;

  // Display
  display_order: number;
  badge_text: string | null;
  cta_text: string | null;
  cta_url: string | null;
  highlight_features: string[];

  created_at: string;
  updated_at: string;
}

export interface PlanFeatures {
  analytics: boolean;
  team_insights: boolean;
  api_access: boolean;
  custom_branding: boolean;
  priority_support: boolean;
  [key: string]: boolean; // Allow additional features
}

export type PlanSlug = 'free' | 'starter' | 'pro' | 'enterprise';

// ============================================================================
// Organization Subscriptions
// ============================================================================

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused' | 'grace_period' | 'expired';
export type BillingCycle = 'monthly' | 'yearly';

export interface OrganizationSubscription {
  id: string;
  org_id: string;
  plan_id: string;

  // Status
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;

  // Dates
  started_at: string;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  canceled_at: string | null;
  grace_period_started_at: string | null;
  grace_period_ends_at: string | null;

  // External references
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;

  // Custom overrides
  custom_max_users: number | null;
  custom_max_meetings: number | null;
  custom_max_ai_tokens: number | null;
  custom_max_storage_mb: number | null;

  // Admin notes
  admin_notes: string | null;

  created_at: string;
  updated_at: string;

  // Joined data
  plan?: SubscriptionPlan;
  organization?: Organization;
}

// ============================================================================
// Organizations (extended for SaaS admin)
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;

  // Joined data for admin views
  subscription?: OrganizationSubscription;
  member_count?: number;
  usage?: OrganizationUsage;
}

export interface OrganizationMembership {
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'readonly';
  created_at: string;
  updated_at: string;

  // Joined data
  user?: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
}

// ============================================================================
// Usage Tracking
// ============================================================================

export interface OrganizationUsage {
  id: string;
  org_id: string;

  // Period
  period_start: string;
  period_end: string;

  // Usage counts
  meetings_count: number;
  meetings_duration_minutes: number;
  ai_tokens_used: number;
  storage_used_mb: number;
  active_users_count: number;

  // Breakdown
  usage_breakdown: UsageBreakdown;

  created_at: string;
  updated_at: string;
}

export interface UsageBreakdown {
  transcription_tokens?: number;
  analysis_tokens?: number;
  summary_tokens?: number;
  [key: string]: number | undefined;
}

export type UsageEventType = 'meeting' | 'ai_tokens' | 'storage' | 'api_call';

export interface UsageEvent {
  id: string;
  org_id: string;
  user_id: string | null;

  event_type: UsageEventType;
  event_subtype: string | null;
  quantity: number;

  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// Feature Flags
// ============================================================================

export interface OrganizationFeatureFlag {
  id: string;
  org_id: string;

  feature_key: string;
  is_enabled: boolean;
  usage_limit: number | null;

  override_reason: string | null;
  enabled_by: string | null;
  enabled_at: string;
  expires_at: string | null;

  created_at: string;
  updated_at: string;
}

// Well-known feature keys
export type FeatureKey =
  | 'analytics'
  | 'team_insights'
  | 'api_access'
  | 'custom_branding'
  | 'priority_support'
  | 'beta_features'
  | 'advanced_ai'
  | 'unlimited_storage';

// ============================================================================
// Billing History
// ============================================================================

export type BillingEventType = 'invoice' | 'payment' | 'refund' | 'credit' | 'plan_change';
export type BillingStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface BillingHistoryItem {
  id: string;
  org_id: string;
  subscription_id: string | null;

  event_type: BillingEventType;
  amount: number; // in cents
  currency: string;
  status: BillingStatus;

  description: string | null;

  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;

  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface OrgCreditBalance {
  org_id: string;
  balance_credits: number;
  lifetime_purchased: number;
  lifetime_consumed: number;
}

export interface CustomerWithDetails extends Organization {
  subscription: OrganizationSubscription | null;
  plan: SubscriptionPlan | null;
  member_count: number;
  current_usage: OrganizationUsage | null;
  feature_flags: OrganizationFeatureFlag[];
  credit_balance: OrgCreditBalance | null;
  owner_email: string | null;
}

export interface UsageStats {
  total_meetings: number;
  total_ai_tokens: number;
  total_storage_mb: number;
  active_users: number;
  trend: {
    meetings_change_percent: number;
    tokens_change_percent: number;
    storage_change_percent: number;
  };
}

export interface AdminDashboardStats {
  total_customers: number;
  active_subscriptions: number;
  total_mrr: number; // Monthly recurring revenue in cents
  total_arr: number; // Annual recurring revenue in cents
  customers_by_plan: Record<string, number>;
  churn_rate: number;
  trial_conversions: number;
}

// ============================================================================
// Form Types
// ============================================================================

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
  cta_text?: string | null;
  cta_url?: string | null;
  highlight_features?: string[];
  stripe_product_id?: string | null;
  stripe_price_id_monthly?: string | null;
  stripe_price_id_yearly?: string | null;
  stripe_seat_price_id?: string | null;
}

export interface UpdateSubscriptionInput {
  plan_id?: string;
  status?: SubscriptionStatus;
  billing_cycle?: BillingCycle;
  custom_max_users?: number | null;
  custom_max_meetings?: number | null;
  custom_max_ai_tokens?: number | null;
  custom_max_storage_mb?: number | null;
  admin_notes?: string;
}

export interface SetFeatureFlagInput {
  org_id: string;
  feature_key: string;
  is_enabled: boolean;
  usage_limit?: number | null;
  override_reason?: string;
  expires_at?: string | null;
}

// src/lib/services/subscriptionService.ts
// Service layer for subscription management

import { supabase } from '@/lib/supabase/clientV2';
import type {
  SubscriptionPlan,
  OrganizationSubscription,
  SubscriptionWithPlan,
  OrganizationUsage,
  BillingHistoryItem,
  UserNotification,
  TrialStatus,
  UsageLimits,
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  CreatePortalSessionRequest,
  CreatePortalSessionResponse,
  StartFreeTrialRequest,
  StartFreeTrialResponse,
  BillingCycle,
  SubscriptionCreditState,
} from '../types/subscription';

export interface TrialProgress {
  daysRemaining: number;
  daysTotal: number;
  meetingsUsed: number;
  meetingsLimit: number;
  percentUsed: number;
  isExpired: boolean;
  expiryReason: 'days' | 'meetings' | null;
}

// ============================================================================
// Plan Operations
// ============================================================================

/**
 * Fetch all active subscription plans
 */
export async function getPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching plans:', error);
    throw new Error('Failed to fetch subscription plans');
  }

  return data || [];
}

/**
 * Fetch a specific plan by ID
 */
export async function getPlanById(planId: string): Promise<SubscriptionPlan | null> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Error fetching plan:', error);
    throw new Error('Failed to fetch plan');
  }

  return data;
}

/**
 * Fetch a plan by slug
 */
export async function getPlanBySlug(slug: string): Promise<SubscriptionPlan | null> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching plan by slug:', error);
    throw new Error('Failed to fetch plan');
  }

  return data;
}

// ============================================================================
// Subscription Operations
// ============================================================================

/**
 * Get subscription for an organization with plan details
 */
export async function getOrgSubscription(orgId: string): Promise<SubscriptionWithPlan | null> {
  // First get the subscription
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: subscription, error: subError } = await (supabase as any)
    .from('organization_subscriptions')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();

  if (subError) {
    // 406 errors typically indicate RLS policy blocking access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (subError.code === 'PGRST116' || (subError as any).status === 406) {
      console.warn('Subscription not found or access denied:', subError.message);
      return null;
    }
    console.error('Error fetching subscription:', subError);
    throw new Error(`Failed to fetch subscription: ${subError.message}`);
  }

  if (!subscription) return null;

  // Then get the plan separately
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: plan, error: planError } = await (supabase as any)
    .from('subscription_plans')
    .select('*')
    .eq('id', subscription.plan_id)
    .maybeSingle();

  if (planError) {
    console.error('Error fetching plan:', planError);
    throw new Error(`Failed to fetch subscription plan: ${planError.message}`);
  }

  if (!plan) {
    console.warn('Plan not found for subscription:', subscription.plan_id);
    return null;
  }

  return {
    ...subscription,
    plan: plan,
  } as SubscriptionWithPlan;
}

/**
 * Calculate trial status from subscription
 */
export function calculateTrialStatus(subscription: SubscriptionWithPlan | null): TrialStatus {
  if (!subscription) {
    return {
      isTrialing: false,
      daysRemaining: 0,
      endsAt: null,
      startedAt: null,
      hasExpired: false,
      hasPaymentMethod: false,
    };
  }

  const now = new Date();
  const trialEndsAt = subscription.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  const trialStartedAt = subscription.trial_start_at ? new Date(subscription.trial_start_at) : null;
  const isTrialing = subscription.status === 'trialing' && trialEndsAt && trialEndsAt > now;
  const hasExpired = trialEndsAt ? trialEndsAt <= now && subscription.status === 'trialing' : false;

  let daysRemaining = 0;
  if (isTrialing && trialEndsAt) {
    daysRemaining = Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  return {
    isTrialing: isTrialing || false,
    daysRemaining,
    endsAt: trialEndsAt,
    startedAt: trialStartedAt,
    hasExpired,
    hasPaymentMethod: !!subscription.stripe_payment_method_id,
  };
}

/**
 * Get usage limits for an organization
 * For free tier: counts TOTAL meetings ever (not per month)
 * For paid tiers: counts meetings in current billing period
 */
export async function getOrgUsageLimits(orgId: string): Promise<UsageLimits | null> {
  const subscription = await getOrgSubscription(orgId);
  if (!subscription) return null;

  const plan = subscription.plan;
  const isFreeTier = plan.is_free_tier === true;

  let meetingsUsed = 0;

  if (isFreeTier) {
    // For free tier: count TOTAL meetings ever (not per month)
    // This uses the meeting limit as a lifetime cap
    const { count: totalMeetings } = await supabase
      .from('meetings')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId);

    meetingsUsed = totalMeetings || 0;
  } else {
    // For paid tiers: count meetings in current billing period
    const billingStartDate = subscription.current_period_start
      ? new Date(subscription.current_period_start).toISOString().slice(0, 10)
      : null;
    const billingEndDate = subscription.current_period_end
      ? new Date(subscription.current_period_end).toISOString().slice(0, 10)
      : null;

    // organization_usage stores DATE fields (not timestamps), and may not have a row yet.
    // Use overlap logic + maybeSingle() to avoid PostgREST 406 when zero rows match.
    const { data: usage } = await supabase
      .from('organization_usage')
      .select('*')
      .eq('org_id', orgId)
      // Find the usage period that overlaps the billing window
      .lte('period_start', billingEndDate || '9999-12-31')
      .gte('period_end', billingStartDate || '0001-01-01')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usageData = usage as any;
    meetingsUsed = usageData?.meetings_count || 0;
  }

  // Get active user count (all members in the table are active - no status column)
  const { count: activeUsers } = await supabase
    .from('organization_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId);

  const meetingsLimit = subscription.custom_max_meetings || plan.max_meetings_per_month;
  const usersLimit = subscription.custom_max_users || plan.max_users;
  const includedSeats = plan.included_seats || 1;
  const perSeatPrice = plan.per_seat_price || 0;
  const activeUserCount = activeUsers || 1;

  // Calculate overage
  const overageCount = usersLimit ? Math.max(0, activeUserCount - includedSeats) : 0;
  const overageAmount = overageCount * perSeatPrice;

  return {
    meetings: {
      limit: meetingsLimit,
      used: meetingsUsed,
      remaining: meetingsLimit ? meetingsLimit - meetingsUsed : null,
      percentUsed: meetingsLimit ? Math.round((meetingsUsed / meetingsLimit) * 100) : 0,
    },
    users: {
      limit: usersLimit,
      active: activeUserCount,
      remaining: usersLimit ? usersLimit - activeUserCount : null,
      overageCount,
      overageAmount,
    },
    retentionMonths: subscription.custom_max_storage_mb
      ? null
      : plan.meeting_retention_months,
    // Include flag so UI knows how to display the limit
    isFreeTierLimit: isFreeTier,
  };
}

// ============================================================================
// Stripe Integration
// ============================================================================

/**
 * Create a Stripe Checkout session for subscription
 */
export async function createCheckoutSession(
  request: CreateCheckoutSessionRequest
): Promise<CreateCheckoutSessionResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const response = await supabase.functions.invoke('create-checkout-session', {
    body: request,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (response.error) {
    console.error('Checkout session error:', response.error);
    throw new Error(response.error.message || 'Failed to create checkout session');
  }

  return response.data as CreateCheckoutSessionResponse;
}

/**
 * Create a test checkout session for admin testing
 * Uses the current user's org to test the checkout flow
 */
export async function createTestCheckoutSession(
  planId: string,
  billingCycle: BillingCycle = 'monthly'
): Promise<CreateCheckoutSessionResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || !session.user) {
    throw new Error('Not authenticated');
  }

  // Get the user's organization (first one they're a member of)
  const { data: membership, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    throw new Error('No organization found for test. Create an organization first.');
  }

  // Create checkout session for testing
  const response = await supabase.functions.invoke('create-checkout-session', {
    body: {
      org_id: membership.org_id,
      plan_id: planId,
      billing_cycle: billingCycle,
      // Return to the pricing control page after test
      success_url: `${window.location.origin}/platform/pricing-control?test_checkout=success`,
      cancel_url: `${window.location.origin}/platform/pricing-control?test_checkout=cancelled`,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (response.error) {
    console.error('Test checkout session error:', response.error);
    throw new Error(response.error.message || 'Failed to create test checkout session');
  }

  return response.data as CreateCheckoutSessionResponse;
}

/**
 * Create a Stripe Customer Portal session
 */
export async function createPortalSession(
  request: CreatePortalSessionRequest
): Promise<CreatePortalSessionResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const response = await supabase.functions.invoke('create-portal-session', {
    body: request,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (response.error) {
    console.error('Portal session error:', response.error);
    throw new Error(response.error.message || 'Failed to create portal session');
  }

  return response.data as CreatePortalSessionResponse;
}

/**
 * Start a free trial without payment method
 */
export async function startFreeTrial(
  request: StartFreeTrialRequest
): Promise<StartFreeTrialResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const response = await supabase.functions.invoke('start-free-trial', {
    body: request,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (response.error) {
    console.error('Start trial error:', response.error);
    throw new Error(response.error.message || 'Failed to start free trial');
  }

  return response.data as StartFreeTrialResponse;
}

// ============================================================================
// Billing History
// ============================================================================

/**
 * Get billing history for an organization
 */
export async function getBillingHistory(
  orgId: string,
  limit = 20,
  offset = 0
): Promise<{ items: BillingHistoryItem[]; total: number }> {
  const { data, error, count } = await supabase
    .from('billing_history')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching billing history:', error);
    throw new Error('Failed to fetch billing history');
  }

  return {
    items: data || [],
    total: count || 0,
  };
}

// ============================================================================
// Notifications
// ============================================================================

/**
 * Get unread notifications for a user
 */
export async function getUserNotifications(
  userId: string,
  limit = 10
): Promise<UserNotification[]> {
  const { data, error } = await supabase
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching notifications:', error);
    throw new Error('Failed to fetch notifications');
  }

  return data || [];
}

/**
 * Mark a notification as read
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('user_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    } as never)
    .eq('id', notificationId);

  if (error) {
    console.error('Error marking notification read:', error);
    throw new Error('Failed to mark notification as read');
  }
}

/**
 * Dismiss a notification
 */
export async function dismissNotification(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('user_notifications')
    .update({
      dismissed_at: new Date().toISOString(),
    } as never)
    .eq('id', notificationId);

  if (error) {
    console.error('Error dismissing notification:', error);
    throw new Error('Failed to dismiss notification');
  }
}

/**
 * Get count of unread notifications
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .is('dismissed_at', null);

  if (error) {
    console.error('Error counting notifications:', error);
    return 0;
  }

  return count || 0;
}

// ============================================================================
// Feature Access & Gating
// ============================================================================

/**
 * Check if organization has access to a feature
 */
export async function hasFeatureAccess(
  orgId: string,
  feature: string
): Promise<boolean> {
  const subscription = await getOrgSubscription(orgId);
  if (!subscription) return false;

  // Check subscription status
  if (!['active', 'trialing'].includes(subscription.status)) {
    return false;
  }

  // Check plan features
  const plan = subscription.plan;
  if (plan.features && typeof plan.features === 'object') {
    return !!plan.features[feature];
  }

  return false;
}

/**
 * Check if organization can perform an action (within limits)
 */
export async function canPerformAction(
  orgId: string,
  action: 'create_meeting' | 'add_user'
): Promise<{ allowed: boolean; reason?: string }> {
  const limits = await getOrgUsageLimits(orgId);
  if (!limits) {
    return { allowed: false, reason: 'No active subscription' };
  }

  switch (action) {
    case 'create_meeting':
      if (limits.meetings.limit === null) {
        return { allowed: true };
      }
      if (limits.meetings.remaining !== null && limits.meetings.remaining <= 0) {
        return {
          allowed: false,
          reason: `Meeting limit reached (${limits.meetings.limit} per month)`
        };
      }
      return { allowed: true };

    case 'add_user':
      // Team plan allows unlimited users with overage billing
      const subscription = await getOrgSubscription(orgId);
      if (subscription?.plan.slug === 'team') {
        return { allowed: true };
      }
      // Other plans have hard limits
      if (limits.users.limit === null) {
        return { allowed: true };
      }
      if (limits.users.remaining !== null && limits.users.remaining <= 0) {
        return {
          allowed: false,
          reason: `User limit reached (${limits.users.limit} users)`
        };
      }
      return { allowed: true };

    default:
      return { allowed: true };
  }
}

// ============================================================================
// Subscription Helpers
// ============================================================================

/**
 * Check if organization has an active subscription
 */
export async function hasActiveSubscription(orgId: string): Promise<boolean> {
  const subscription = await getOrgSubscription(orgId);
  if (!subscription) return false;
  return ['active', 'trialing'].includes(subscription.status);
}

/**
 * Get subscription status summary
 */
export async function getSubscriptionSummary(orgId: string): Promise<{
  hasSubscription: boolean;
  status: string;
  planName: string;
  planSlug: string;
  isTrialing: boolean;
  trialDaysRemaining: number;
  needsPaymentMethod: boolean;
} | null> {
  const subscription = await getOrgSubscription(orgId);
  if (!subscription) return null;

  const trial = calculateTrialStatus(subscription);

  return {
    hasSubscription: true,
    status: subscription.status,
    planName: subscription.plan.name,
    planSlug: subscription.plan.slug,
    isTrialing: trial.isTrialing,
    trialDaysRemaining: trial.daysRemaining,
    needsPaymentMethod: trial.isTrialing && !trial.hasPaymentMethod,
  };
}

/**
 * Upgrade or change subscription plan
 */
export async function changePlan(
  orgId: string,
  newPlanSlug: 'basic' | 'pro',
  billingCycle: BillingCycle = 'monthly'
): Promise<CreateCheckoutSessionResponse> {
  // For plan changes, we use Stripe Checkout which handles prorations
  return createCheckoutSession({
    org_id: orgId,
    plan_slug: newPlanSlug,
    billing_cycle: billingCycle,
  });
}

// ============================================================================
// Plan Check Methods
// ============================================================================

/**
 * Check if organization is on an active Pro plan
 */
export async function isProPlan(orgId: string): Promise<boolean> {
  const subscription = await getOrgSubscription(orgId);
  return (
    subscription?.plan?.slug === 'pro' &&
    ['active', 'trialing'].includes(subscription.status)
  );
}

/**
 * Check if organization is on an active Basic plan
 */
export async function isBasicPlan(orgId: string): Promise<boolean> {
  const subscription = await getOrgSubscription(orgId);
  return (
    subscription?.plan?.slug === 'basic' &&
    ['active', 'trialing'].includes(subscription.status)
  );
}

/**
 * Get trial progress details for an organization
 * Returns null if the org is not currently trialing
 */
export async function getTrialProgress(orgId: string): Promise<TrialProgress | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('organization_subscriptions')
    .select('trial_start_at, trial_ends_at, trial_meetings_used, trial_meetings_limit, status')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching trial progress:', error);
    return null;
  }

  if (!data || data.status !== 'trialing') return null;

  const now = new Date();
  const trialEndsAt = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
  const daysTotal = 14;
  const daysRemaining = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const meetingsUsed: number = data.trial_meetings_used ?? 0;
  const meetingsLimit: number = data.trial_meetings_limit ?? 0;

  const daysPercent = daysTotal > 0 ? Math.round(((daysTotal - daysRemaining) / daysTotal) * 100) : 100;
  const meetingsPercent = meetingsLimit > 0 ? Math.round((meetingsUsed / meetingsLimit) * 100) : 0;
  const percentUsed = Math.max(daysPercent, meetingsPercent);

  const daysExpired = daysRemaining <= 0;
  const meetingsExpired = meetingsLimit > 0 && meetingsUsed >= meetingsLimit;
  const isExpired = daysExpired || meetingsExpired;

  let expiryReason: 'days' | 'meetings' | null = null;
  if (isExpired) {
    expiryReason = meetingsExpired ? 'meetings' : 'days';
  }

  return {
    daysRemaining,
    daysTotal,
    meetingsUsed,
    meetingsLimit,
    percentUsed,
    isExpired,
    expiryReason,
  };
}

/**
 * Check if organization's trial has expired (status = 'expired')
 */
export async function isTrialExpired(orgId: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('organization_subscriptions')
    .select('status')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error || !data) return false;
  return data.status === 'expired';
}

/**
 * Check if organization's trial is at or above the 75% warning threshold
 * (either 75%+ of meetings used or 75%+ of days elapsed)
 */
export async function isTrialWarning(orgId: string): Promise<boolean> {
  const progress = await getTrialProgress(orgId);
  if (!progress) return false;
  return progress.percentUsed >= 75;
}

/**
 * Check if organization has API access via their plan
 */
export async function hasApiAccess(orgId: string): Promise<boolean> {
  const subscription = await getOrgSubscription(orgId);
  if (!subscription) return false;
  return (
    subscription.plan.features?.api_access === true &&
    ['active', 'trialing'].includes(subscription.status)
  );
}

/**
 * Get subscription credit state for an organization
 */
export async function getSubscriptionCreditState(orgId: string): Promise<SubscriptionCreditState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('org_credit_balance')
    .select('balance_credits, subscription_credits_balance, subscription_credits_expiry, onboarding_credits_balance, onboarding_complete')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching credit state:', error);
  }

  const balanceCredits: number = data?.balance_credits ?? 0;
  const subscriptionCreditsBalance: number = data?.subscription_credits_balance ?? 0;
  const onboardingCreditsBalance: number = data?.onboarding_credits_balance ?? 0;
  const packCreditsBalance = balanceCredits - subscriptionCreditsBalance - onboardingCreditsBalance;

  return {
    subscriptionCreditsBalance,
    subscriptionCreditsExpiry: data?.subscription_credits_expiry ?? null,
    onboardingCreditsBalance,
    onboardingComplete: data?.onboarding_complete ?? false,
    packCreditsBalance: Math.max(0, packCreditsBalance),
    totalBalance: balanceCredits,
  };
}

// ============================================================================
// Plan Update (Upgrade / Downgrade)
// ============================================================================

export interface UpdateSubscriptionRequest {
  org_id: string;
  new_plan_slug: 'basic' | 'pro';
  billing_cycle: BillingCycle;
}

export interface UpdateSubscriptionResponse {
  success: boolean;
  change_type: 'upgrade' | 'downgrade' | 'cycle_change';
  effective: 'immediate' | 'period_end';
  proration_amount?: number; // in pence
  currency?: string;
  message: string;
}

/**
 * Update an existing Stripe subscription (upgrade/downgrade/cycle change).
 * Upgrades are immediate with proration. Downgrades take effect at period end.
 */
export async function updateSubscription(
  request: UpdateSubscriptionRequest
): Promise<UpdateSubscriptionResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const response = await supabase.functions.invoke('update-subscription', {
    body: request,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (response.error) {
    console.error('Update subscription error:', response.error);
    throw new Error(response.error.message || 'Failed to update subscription');
  }

  // The edge function may return an error in the body even with a 200 status
  if (response.data?.error) {
    throw new Error(response.data.error);
  }

  return response.data as UpdateSubscriptionResponse;
}

// ============================================================================
// Free Tier Enforcement
// ============================================================================

/**
 * Check if organization is on free tier
 */
export async function isOnFreeTier(orgId: string): Promise<boolean> {
  const subscription = await getOrgSubscription(orgId);
  if (!subscription) return false;
  return subscription.plan.is_free_tier === true;
}

/**
 * Get free tier usage status for upgrade prompts
 * For free tier: limit is TOTAL meetings ever
 * For paid tiers: limit is per billing period
 */
export async function getFreeTierUsageStatus(orgId: string): Promise<{
  isFreeTier: boolean;
  meetingsUsed: number;
  meetingsLimit: number | null;
  percentUsed: number;
  shouldShowUpgradePrompt: boolean;
  remainingMeetings: number | null;
  /** True if limit is total (free tier), false if per month (paid tier) */
  isTotalLimit: boolean;
} | null> {
  const subscription = await getOrgSubscription(orgId);
  if (!subscription) return null;

  const limits = await getOrgUsageLimits(orgId);
  if (!limits) return null;

  const isFreeTier = subscription.plan.is_free_tier === true;
  const meetingsUsed = limits.meetings.used || 0;
  const meetingsLimit = limits.meetings.limit;
  const remainingMeetings = limits.meetings.remaining;

  // Calculate percentage used (for free tier only)
  const percentUsed = meetingsLimit ? Math.round((meetingsUsed / meetingsLimit) * 100) : 0;

  // Show upgrade prompt when 80% of free tier limit is used
  const shouldShowUpgradePrompt = isFreeTier && percentUsed >= 80;

  return {
    isFreeTier,
    meetingsUsed,
    meetingsLimit,
    percentUsed,
    shouldShowUpgradePrompt,
    remainingMeetings,
    // Free tier = total meetings limit, Paid tier = per month limit
    isTotalLimit: isFreeTier,
  };
}

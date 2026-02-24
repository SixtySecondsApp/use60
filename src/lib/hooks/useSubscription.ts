// src/lib/hooks/useSubscription.ts
// React Query hooks for subscription management

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import {
  getPlans,
  getPlanById,
  getPlanBySlug,
  getOrgSubscription,
  calculateTrialStatus,
  getOrgUsageLimits,
  createCheckoutSession,
  createPortalSession,
  startFreeTrial,
  getBillingHistory,
  getUserNotifications,
  markNotificationRead,
  dismissNotification,
  getUnreadNotificationCount,
  hasFeatureAccess,
  canPerformAction,
  hasActiveSubscription,
  getSubscriptionSummary,
  changePlan,
  isOnFreeTier,
  getFreeTierUsageStatus,
  getTrialProgress,
  updateSubscription,
  type UpdateSubscriptionRequest,
  type TrialProgress,
} from '../services/subscriptionService';
import {
  getPublicPlans,
  getFreeTierPlan,
} from '../services/stripeSyncService';
import type {
  SubscriptionPlan,
  SubscriptionWithPlan,
  TrialStatus,
  UsageLimits,
  BillingHistoryItem,
  UserNotification,
  CreateCheckoutSessionRequest,
  CreatePortalSessionRequest,
  StartFreeTrialRequest,
  BillingCycle,
  SubscriptionState,
} from '../types/subscription';

// Query keys
export const subscriptionKeys = {
  all: ['subscription'] as const,
  plans: () => [...subscriptionKeys.all, 'plans'] as const,
  plan: (id: string) => [...subscriptionKeys.plans(), id] as const,
  planBySlug: (slug: string) => [...subscriptionKeys.plans(), 'slug', slug] as const,
  org: (orgId: string) => [...subscriptionKeys.all, 'org', orgId] as const,
  usage: (orgId: string) => [...subscriptionKeys.all, 'usage', orgId] as const,
  billing: (orgId: string) => [...subscriptionKeys.all, 'billing', orgId] as const,
  notifications: (userId: string) => [...subscriptionKeys.all, 'notifications', userId] as const,
  notificationCount: (userId: string) => [...subscriptionKeys.all, 'notification-count', userId] as const,
  summary: (orgId: string) => [...subscriptionKeys.all, 'summary', orgId] as const,
};

// ============================================================================
// Plan Hooks
// ============================================================================

/**
 * Fetch all active subscription plans
 */
export function usePlans() {
  return useQuery({
    queryKey: subscriptionKeys.plans(),
    queryFn: getPlans,
    staleTime: 1000 * 60 * 30, // 30 minutes - plans rarely change
  });
}

/**
 * Fetch a specific plan by ID
 */
export function usePlan(planId: string | undefined) {
  return useQuery({
    queryKey: subscriptionKeys.plan(planId || ''),
    queryFn: () => getPlanById(planId!),
    enabled: !!planId,
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * Fetch a plan by slug
 */
export function usePlanBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: subscriptionKeys.planBySlug(slug || ''),
    queryFn: () => getPlanBySlug(slug!),
    enabled: !!slug,
    staleTime: 1000 * 60 * 30,
  });
}

// ============================================================================
// Subscription Hooks
// ============================================================================

/**
 * Get organization subscription with plan details
 */
export function useOrgSubscription(orgId: string | undefined) {
  const { user, loading } = useAuth();

  return useQuery({
    queryKey: subscriptionKeys.org(orgId || ''),
    queryFn: () => getOrgSubscription(orgId!),
    enabled: !!orgId && !!user && !loading, // Wait for auth to complete before querying
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get complete subscription state including trial and usage
 */
export function useSubscriptionState(orgId: string | undefined): SubscriptionState & {
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const subscriptionQuery = useOrgSubscription(orgId);
  const usageQuery = useOrgUsage(orgId);

  const subscription = subscriptionQuery.data || null;
  const trial = calculateTrialStatus(subscription);
  const usage = usageQuery.data || null;

  return {
    subscription,
    trial,
    usage,
    isLoading: subscriptionQuery.isLoading || usageQuery.isLoading,
    error: subscriptionQuery.error?.message || usageQuery.error?.message || null,
    refetch: () => {
      subscriptionQuery.refetch();
      usageQuery.refetch();
    },
  };
}

/**
 * Get subscription summary for quick status checks
 */
export function useSubscriptionSummary(orgId: string | undefined) {
  const { user, loading } = useAuth();

  return useQuery({
    queryKey: subscriptionKeys.summary(orgId || ''),
    queryFn: () => getSubscriptionSummary(orgId!),
    enabled: !!orgId && !!user && !loading, // Wait for auth to complete before querying
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================================
// Trial Status Hook
// ============================================================================

/**
 * Get trial status for an organization
 */
export function useTrialStatus(orgId: string | undefined): TrialStatus & {
  isLoading: boolean;
} {
  const { data: subscription, isLoading } = useOrgSubscription(orgId);

  if (isLoading || !subscription) {
    return {
      isTrialing: false,
      daysRemaining: 0,
      endsAt: null,
      startedAt: null,
      hasExpired: false,
      hasPaymentMethod: false,
      isLoading,
    };
  }

  return {
    ...calculateTrialStatus(subscription),
    isLoading: false,
  };
}

// ============================================================================
// Usage Hooks
// ============================================================================

/**
 * Get usage limits for an organization
 */
export function useOrgUsage(orgId: string | undefined) {
  const { user, loading } = useAuth();

  return useQuery({
    queryKey: subscriptionKeys.usage(orgId || ''),
    queryFn: () => getOrgUsageLimits(orgId!),
    enabled: !!orgId && !!user && !loading, // Wait for auth to complete before querying
    staleTime: 1000 * 60 * 2, // 2 minutes - usage changes more frequently
  });
}

/**
 * Check if organization can perform a specific action
 */
export function useCanPerformAction(
  orgId: string | undefined,
  action: 'create_meeting' | 'add_user'
) {
  const { user, loading } = useAuth();

  return useQuery({
    queryKey: [...subscriptionKeys.usage(orgId || ''), 'can', action],
    queryFn: () => canPerformAction(orgId!, action),
    enabled: !!orgId && !!user && !loading, // Wait for auth to complete before querying
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * Check if organization has access to a feature
 */
export function useHasFeatureAccess(orgId: string | undefined, feature: string) {
  const { user, loading } = useAuth();

  return useQuery({
    queryKey: [...subscriptionKeys.org(orgId || ''), 'feature', feature],
    queryFn: () => hasFeatureAccess(orgId!, feature),
    enabled: !!orgId && !!user && !loading, // Wait for auth to complete before querying
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================================
// Billing Hooks
// ============================================================================

/**
 * Get billing history for an organization
 */
export function useBillingHistory(
  orgId: string | undefined,
  limit = 20,
  offset = 0
) {
  const { user, loading } = useAuth();

  return useQuery({
    queryKey: [...subscriptionKeys.billing(orgId || ''), limit, offset],
    queryFn: () => getBillingHistory(orgId!, limit, offset),
    enabled: !!orgId && !!user && !loading, // Wait for auth to complete before querying
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================================
// Notification Hooks
// ============================================================================

/**
 * Get user notifications
 * NOTE: Realtime updates are handled via useRealtimeHub which subscribes to user_notifications.
 * Polling is disabled since realtime pushes updates. Only refetch on window focus for stale data.
 */
export function useNotifications(userId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: subscriptionKeys.notifications(userId || ''),
    queryFn: () => getUserNotifications(userId!, limit),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes - realtime handles live updates
    // Removed aggressive polling - realtime subscriptions handle updates
    // refetchInterval: false means we rely on cache invalidation + realtime
  });
}

/**
 * Get unread notification count
 * NOTE: Shares cache invalidation with useNotifications - no separate polling needed.
 * When notifications change (via realtime), the count is invalidated too.
 */
export function useUnreadNotificationCount(userId: string | undefined) {
  return useQuery({
    queryKey: subscriptionKeys.notificationCount(userId || ''),
    queryFn: () => getUnreadNotificationCount(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes - same as notifications
    // Removed polling - count is invalidated when notifications change
  });
}

/**
 * Mark notification as read
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
}

/**
 * Dismiss notification
 */
export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: dismissNotification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
}

// ============================================================================
// Stripe Action Hooks
// ============================================================================

/**
 * Create checkout session and redirect to Stripe
 */
export function useCreateCheckoutSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCheckoutSession,
    onSuccess: (data) => {
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      console.error('Checkout error:', error);
    },
  });
}

/**
 * Create portal session and redirect to Stripe
 */
export function useCreatePortalSession() {
  return useMutation({
    mutationFn: createPortalSession,
    onSuccess: (data) => {
      // Redirect to Stripe Customer Portal
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      console.error('Portal error:', error);
    },
  });
}

/**
 * Start free trial
 */
export function useStartFreeTrial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startFreeTrial,
    onSuccess: (data, variables) => {
      // Invalidate subscription queries to refetch
      queryClient.invalidateQueries({
        queryKey: subscriptionKeys.org(variables.org_id),
      });
      queryClient.invalidateQueries({
        queryKey: subscriptionKeys.summary(variables.org_id),
      });
    },
    onError: (error) => {
      console.error('Start trial error:', error);
    },
  });
}

/**
 * Update an existing subscription (upgrade/downgrade/cycle change via Stripe).
 * Invalidates subscription cache on success.
 */
export function useUpdateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateSubscriptionRequest) => updateSubscription(request),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.org(variables.org_id) });
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.summary(variables.org_id) });
    },
  });
}

/**
 * Change subscription plan
 */
export function useChangePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      newPlanSlug,
      billingCycle = 'monthly' as BillingCycle,
    }: {
      orgId: string;
      newPlanSlug: 'basic' | 'pro';
      billingCycle?: BillingCycle;
    }) => changePlan(orgId, newPlanSlug, billingCycle),
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      console.error('Change plan error:', error);
    },
  });
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook that provides subscription status for the current user's organization
 * Combines auth context with subscription data
 */
export function useCurrentSubscription() {
  const { user } = useAuth();
  const { activeOrgId } = useOrg();

  const subscriptionState = useSubscriptionState(activeOrgId);
  const notificationCount = useUnreadNotificationCount(user?.id);

  return {
    ...subscriptionState,
    userId: user?.id,
    orgId: activeOrgId,
    unreadNotifications: notificationCount.data || 0,
    isAuthenticated: !!user,
  };
}

/**
 * Hook for checking if current org has active subscription
 */
export function useHasActiveSubscription() {
  const { user, loading } = useAuth();
  const { activeOrgId } = useOrg();

  return useQuery({
    queryKey: [...subscriptionKeys.org(activeOrgId || ''), 'active'],
    queryFn: () => hasActiveSubscription(activeOrgId!),
    enabled: !!activeOrgId && !!user && !loading, // Wait for auth to complete before querying
    staleTime: 1000 * 60 * 5,
  });
}

// ============================================================================
// Public Pricing Hooks
// ============================================================================

/**
 * Fetch public plans for the pricing page
 * Only returns plans marked as is_public and is_active
 * Sorted by display_order
 */
export function usePublicPlans() {
  return useQuery({
    queryKey: [...subscriptionKeys.plans(), 'public'],
    queryFn: getPublicPlans,
    staleTime: 1000 * 60 * 30, // 30 minutes - plans rarely change
  });
}

/**
 * Get the free tier plan
 */
export function useFreeTierPlan() {
  return useQuery({
    queryKey: [...subscriptionKeys.plans(), 'free-tier'],
    queryFn: getFreeTierPlan,
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * Check if organization is on free tier
 */
export function useIsOnFreeTier(orgId: string | undefined) {
  const { user, loading } = useAuth();

  return useQuery({
    queryKey: [...subscriptionKeys.org(orgId || ''), 'is-free-tier'],
    queryFn: () => isOnFreeTier(orgId!),
    enabled: !!orgId && !!user && !loading, // Wait for auth to complete before querying
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Get free tier usage status for upgrade prompts
 */
export function useFreeTierUsageStatus(orgId: string | undefined) {
  const { user, loading } = useAuth();

  return useQuery({
    queryKey: [...subscriptionKeys.usage(orgId || ''), 'free-tier-status'],
    queryFn: () => getFreeTierUsageStatus(orgId!),
    enabled: !!orgId && !!user && !loading, // Wait for auth to complete before querying
    staleTime: 1000 * 60 * 2, // 2 minutes - usage changes more frequently
  });
}

// Re-export TrialProgress type for consumers
export type { TrialProgress };

/**
 * Get trial progress details for an organization
 * Returns null if not trialing. Includes meetings and days tracking.
 */
export function useTrialProgress(orgId: string | undefined) {
  const { user, loading } = useAuth();

  return useQuery({
    queryKey: [...subscriptionKeys.org(orgId || ''), 'trial-progress'],
    queryFn: () => getTrialProgress(orgId!),
    enabled: !!orgId && !!user && !loading,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

/**
 * SaaS Admin Service
 *
 * API service for managing customers, subscriptions, plans, and usage
 */

import { supabase } from '@/lib/supabase/clientV2';
import type {
  SubscriptionPlan,
  OrganizationSubscription,
  Organization,
  OrganizationMembership,
  OrganizationUsage,
  OrganizationFeatureFlag,
  BillingHistoryItem,
  CustomerWithDetails,
  AdminDashboardStats,
  CreatePlanInput,
  UpdateSubscriptionInput,
  SetFeatureFlagInput,
} from '@/lib/types/saasAdmin';
import logger from '@/lib/utils/logger';

// ============================================================================
// Subscription Plans
// ============================================================================

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    logger.error('[SaaS Admin] Error fetching subscription plans:', error);
    throw error;
  }

  return data || [];
}

export async function getActivePlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    logger.error('[SaaS Admin] Error fetching active plans:', error);
    throw error;
  }

  return data || [];
}

export async function getPlanBySlug(slug: string): Promise<SubscriptionPlan | null> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[SaaS Admin] Error fetching plan by slug:', error);
    throw error;
  }

  return data;
}

export async function createPlan(input: CreatePlanInput): Promise<SubscriptionPlan> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .insert(input)
    .select()
    .single();

  if (error) {
    logger.error('[SaaS Admin] Error creating plan:', error);
    throw error;
  }

  return data;
}

export async function updatePlan(
  planId: string,
  updates: Partial<CreatePlanInput>
): Promise<SubscriptionPlan> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', planId)
    .select()
    .single();

  if (error) {
    logger.error('[SaaS Admin] Error updating plan:', error);
    throw error;
  }

  return data;
}

export async function deletePlan(planId: string): Promise<void> {
  const { error } = await supabase.from('subscription_plans').delete().eq('id', planId);

  if (error) {
    logger.error('[SaaS Admin] Error deleting plan:', error);
    throw error;
  }
}

// ============================================================================
// Customers (Organizations)
// ============================================================================

export async function getCustomers(): Promise<CustomerWithDetails[]> {
  // Fetch organizations (without nested subscriptions - RLS issues with nested queries)
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });

  if (orgsError) {
    logger.error('[SaaS Admin] Error fetching customers:', orgsError);
    throw orgsError;
  }

  // Fetch subscriptions separately (direct query works better with RLS)
  const { data: subscriptions, error: subsError } = await supabase
    .from('organization_subscriptions')
    .select('*');

  if (subsError) {
    logger.error('[SaaS Admin] Error fetching subscriptions:', subsError);
  }

  // Fetch subscription plans
  const { data: plans, error: plansError } = await supabase
    .from('subscription_plans')
    .select('*');

  if (plansError) {
    logger.error('[SaaS Admin] Error fetching plans:', plansError);
  }

  // Build subscription map with plan data
  const plansMap = (plans || []).reduce(
    (acc, p) => {
      acc[p.id] = p;
      return acc;
    },
    {} as Record<string, SubscriptionPlan>
  );

  const subscriptionMap = (subscriptions || []).reduce(
    (acc, s) => {
      acc[s.org_id] = {
        ...s,
        plan: s.plan_id ? plansMap[s.plan_id] : null,
      };
      return acc;
    },
    {} as Record<string, OrganizationSubscription & { plan: SubscriptionPlan | null }>
  );

  // Get member counts for each org
  const { data: memberCounts, error: membersError } = await supabase
    .from('organization_memberships')
    .select('org_id');

  if (membersError) {
    logger.error('[SaaS Admin] Error fetching member counts:', membersError);
    throw membersError;
  }

  // Count members per org
  const memberCountMap = (memberCounts || []).reduce(
    (acc, m) => {
      acc[m.org_id] = (acc[m.org_id] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Get current usage for each org
  const currentMonth = new Date();
  const periodStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const { data: usageData, error: usageError } = await supabase
    .from('organization_usage')
    .select('*')
    .eq('period_start', periodStart);

  if (usageError) {
    logger.error('[SaaS Admin] Error fetching usage:', usageError);
  }

  const usageMap = (usageData || []).reduce(
    (acc, u) => {
      acc[u.org_id] = u;
      return acc;
    },
    {} as Record<string, OrganizationUsage>
  );

  // Get feature flags
  const { data: flags, error: flagsError } = await supabase
    .from('organization_feature_flags')
    .select('*');

  if (flagsError) {
    logger.error('[SaaS Admin] Error fetching feature flags:', flagsError);
  }

  const flagsMap = (flags || []).reduce(
    (acc, f) => {
      if (!acc[f.org_id]) acc[f.org_id] = [];
      acc[f.org_id].push(f);
      return acc;
    },
    {} as Record<string, OrganizationFeatureFlag[]>
  );

  // Combine all data
  return (orgs || []).map((org) => {
    const subscription = subscriptionMap[org.id] || null;

    return {
      ...org,
      subscription,
      plan: subscription?.plan || null,
      member_count: memberCountMap[org.id] || 0,
      current_usage: usageMap[org.id] || null,
      feature_flags: flagsMap[org.id] || [],
    };
  });
}

export async function getCustomerById(orgId: string): Promise<CustomerWithDetails | null> {
  // Fetch organization (without nested subscriptions - RLS issues with nested queries)
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (orgError) {
    if (orgError.code === 'PGRST116') return null;
    logger.error('[SaaS Admin] Error fetching customer:', orgError);
    throw orgError;
  }

  // Fetch subscription separately (direct query works better with RLS)
  const { data: subscriptionData } = await supabase
    .from('organization_subscriptions')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();

  // Fetch plan if subscription exists
  let plan: SubscriptionPlan | null = null;
  if (subscriptionData?.plan_id) {
    const { data: planData } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', subscriptionData.plan_id)
      .single();
    plan = planData;
  }

  const subscription = subscriptionData
    ? { ...subscriptionData, plan }
    : null;

  // Get member count
  const { count: memberCount } = await supabase
    .from('organization_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId);

  // Get current usage
  const currentMonth = new Date();
  const periodStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    .toISOString()
    .split('T')[0];

  const { data: usage } = await supabase
    .from('organization_usage')
    .select('*')
    .eq('org_id', orgId)
    .eq('period_start', periodStart)
    .single();

  // Get feature flags
  const { data: flags } = await supabase
    .from('organization_feature_flags')
    .select('*')
    .eq('org_id', orgId);

  return {
    ...org,
    subscription,
    plan: subscription?.plan || null,
    member_count: memberCount || 0,
    current_usage: usage || null,
    feature_flags: flags || [],
  };
}

export async function getCustomerMembers(orgId: string): Promise<OrganizationMembership[]> {
  // Query memberships first (works with RLS)
  const { data: memberships, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('user_id, role, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (membershipError) {
    logger.error('[SaaS Admin] Error fetching organization memberships:', membershipError);
    throw membershipError;
  }

  if (!memberships || memberships.length === 0) {
    return [];
  }

  // Get user IDs
  const userIds = memberships.map((m) => m.user_id);

  // Query profiles separately (RLS allows viewing profiles when you have their IDs)
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, avatar_url')
    .in('id', userIds);

  if (profileError) {
    logger.error('[SaaS Admin] Error fetching member profiles:', profileError);
    throw profileError;
  }

  // Create profile map for efficient lookup
  const profileMap = new Map(
    profiles?.map((p) => [p.id, p]) || []
  );

  // Combine memberships with profiles
  const membersWithProfiles = memberships.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    created_at: m.created_at,
    org_id: orgId,
    user: profileMap.get(m.user_id) || null,
  }));

  return membersWithProfiles;
}

// ============================================================================
// Subscriptions
// ============================================================================

export async function getSubscription(orgId: string): Promise<OrganizationSubscription | null> {
  const { data, error } = await supabase
    .from('organization_subscriptions')
    .select(`
      *,
      plan:subscription_plans (*)
    `)
    .eq('org_id', orgId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[SaaS Admin] Error fetching subscription:', error);
    throw error;
  }

  return data;
}

export async function createSubscription(
  orgId: string,
  planId: string,
  billingCycle: 'monthly' | 'yearly' = 'monthly'
): Promise<OrganizationSubscription> {
  const periodEnd = new Date();
  if (billingCycle === 'monthly') {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  }

  const { data, error } = await supabase
    .from('organization_subscriptions')
    .insert({
      org_id: orgId,
      plan_id: planId,
      billing_cycle: billingCycle,
      current_period_end: periodEnd.toISOString(),
    })
    .select(`
      *,
      plan:subscription_plans (*)
    `)
    .single();

  if (error) {
    logger.error('[SaaS Admin] Error creating subscription:', error);
    throw error;
  }

  return data;
}

export async function updateSubscription(
  subscriptionId: string,
  updates: UpdateSubscriptionInput
): Promise<OrganizationSubscription> {
  const { data, error } = await supabase
    .from('organization_subscriptions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', subscriptionId)
    .select(`
      *,
      plan:subscription_plans (*)
    `)
    .single();

  if (error) {
    logger.error('[SaaS Admin] Error updating subscription:', error);
    throw error;
  }

  return data;
}

export async function cancelSubscription(subscriptionId: string): Promise<OrganizationSubscription> {
  return updateSubscription(subscriptionId, {
    status: 'canceled',
  });
}

// ============================================================================
// Feature Flags
// ============================================================================

export async function getFeatureFlags(orgId: string): Promise<OrganizationFeatureFlag[]> {
  const { data, error } = await supabase
    .from('organization_feature_flags')
    .select('*')
    .eq('org_id', orgId)
    .order('feature_key', { ascending: true });

  if (error) {
    logger.error('[SaaS Admin] Error fetching feature flags:', error);
    throw error;
  }

  return data || [];
}

export async function setFeatureFlag(input: SetFeatureFlagInput): Promise<OrganizationFeatureFlag> {
  const { data: currentUser } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('organization_feature_flags')
    .upsert(
      {
        org_id: input.org_id,
        feature_key: input.feature_key,
        is_enabled: input.is_enabled,
        usage_limit: input.usage_limit,
        override_reason: input.override_reason,
        enabled_by: currentUser?.user?.id,
        enabled_at: new Date().toISOString(),
        expires_at: input.expires_at,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'org_id,feature_key',
      }
    )
    .select()
    .single();

  if (error) {
    logger.error('[SaaS Admin] Error setting feature flag:', error);
    throw error;
  }

  return data;
}

export async function deleteFeatureFlag(orgId: string, featureKey: string): Promise<void> {
  const { error } = await supabase
    .from('organization_feature_flags')
    .delete()
    .eq('org_id', orgId)
    .eq('feature_key', featureKey);

  if (error) {
    logger.error('[SaaS Admin] Error deleting feature flag:', error);
    throw error;
  }
}

// ============================================================================
// Usage
// ============================================================================

export async function getOrganizationUsage(
  orgId: string,
  months: number = 6
): Promise<OrganizationUsage[]> {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  const startDateStr = startDate.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('organization_usage')
    .select('*')
    .eq('org_id', orgId)
    .gte('period_start', startDateStr)
    .order('period_start', { ascending: true });

  if (error) {
    logger.error('[SaaS Admin] Error fetching usage:', error);
    throw error;
  }

  return data || [];
}

export async function getAllUsageForPeriod(periodStart: string): Promise<OrganizationUsage[]> {
  const { data, error } = await supabase
    .from('organization_usage')
    .select(`
      *,
      organization:organizations (
        id,
        name
      )
    `)
    .eq('period_start', periodStart)
    .order('ai_tokens_used', { ascending: false });

  if (error) {
    logger.error('[SaaS Admin] Error fetching all usage:', error);
    throw error;
  }

  return data || [];
}

// ============================================================================
// Billing History
// ============================================================================

export async function getBillingHistory(orgId: string): Promise<BillingHistoryItem[]> {
  const { data, error } = await supabase
    .from('billing_history')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[SaaS Admin] Error fetching billing history:', error);
    throw error;
  }

  return data || [];
}

// ============================================================================
// Admin Dashboard Stats
// ============================================================================

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  // Get total customers
  const { count: totalCustomers } = await supabase
    .from('organizations')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  // Get subscription stats
  const { data: subscriptions } = await supabase
    .from('organization_subscriptions')
    .select(`
      status,
      billing_cycle,
      plan:subscription_plans (
        slug,
        price_monthly,
        price_yearly
      )
    `);

  const activeSubscriptions = (subscriptions || []).filter(
    (s) => s.status === 'active' || s.status === 'trialing'
  );

  // Calculate MRR
  let totalMrr = 0;
  const customersByPlan: Record<string, number> = {};

  activeSubscriptions.forEach((sub) => {
    const plan = sub.plan as SubscriptionPlan | null;
    if (plan) {
      const planSlug = plan.slug;
      customersByPlan[planSlug] = (customersByPlan[planSlug] || 0) + 1;

      if (sub.billing_cycle === 'monthly') {
        totalMrr += plan.price_monthly;
      } else {
        totalMrr += Math.round(plan.price_yearly / 12);
      }
    }
  });

  return {
    total_customers: totalCustomers || 0,
    active_subscriptions: activeSubscriptions.length,
    total_mrr: totalMrr,
    total_arr: totalMrr * 12,
    customers_by_plan: customersByPlan,
    churn_rate: 0, // TODO: Calculate based on historical data
    trial_conversions: 0, // TODO: Calculate based on historical data
  };
}

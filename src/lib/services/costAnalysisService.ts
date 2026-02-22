/**
 * Cost Analysis Service
 *
 * Service for calculating and analyzing costs per organization, tier, and model
 */

import { supabase } from '@/lib/supabase/clientV2';
import type {
  CostRate,
  AICostEvent,
  OrganizationCostAnalysis,
  CostAnalysisSummary,
  TierCostAnalysis,
  ModelUsageBreakdown,
  CostEstimationInput,
  CostEstimationResult,
  MarginCalculation,
} from '@/lib/types/costAnalysis';
import {
  DEFAULT_COST_RATES,
  calculateTokenCost,
  getCostRateForModel,
} from '@/lib/types/costAnalysis';

// ============================================================================
// Cost Rates Management
// ============================================================================

/**
 * Get all active cost rates
 */
export async function getCostRates(): Promise<CostRate[]> {
  const { data, error } = await supabase
    .from('cost_rates')
    .select('*')
    .is('effective_to', null)
    .order('provider', { ascending: true })
    .order('model', { ascending: true });

  if (error) {
    console.error('Error fetching cost rates:', error);
    // Return default rates if table doesn't exist yet
    return DEFAULT_COST_RATES.map((rate, idx) => ({
      id: `default-${idx}`,
      ...rate,
      effective_from: new Date().toISOString(),
      effective_to: null,
      created_at: new Date().toISOString(),
    }));
  }

  return data || [];
}

/**
 * Get cost rate for a specific model
 */
export async function getCostRate(
  provider: 'anthropic' | 'gemini',
  model: string
): Promise<CostRate | null> {
  const rates = await getCostRates();
  return getCostRateForModel(model, provider, rates);
}

// ============================================================================
// AI Cost Events
// ============================================================================

/**
 * Record an AI cost event
 */
export async function recordAICostEvent(
  event: Omit<AICostEvent, 'id' | 'created_at'>
): Promise<void> {
  // Try to insert, but don't fail if table doesn't exist yet
  const { error } = await supabase.from('ai_cost_events').insert({
    ...event,
    created_at: new Date().toISOString(),
  } as any);

  if (error) {
    // Silently fail if table doesn't exist - this is expected during initial setup
    if (error.code !== '42P01') {
      console.warn('Error recording AI cost event:', error);
    }
  }
}

/**
 * Get AI cost events for an organization
 */
export async function getAICostEvents(
  orgId: string,
  startDate?: string,
  endDate?: string
): Promise<AICostEvent[]> {
  let query = supabase
    .from('ai_cost_events')
    .select(
      'id, org_id, user_id, provider, model, feature, input_tokens, output_tokens, estimated_cost, provider_cost_usd, credits_charged, metadata, created_at'
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching AI cost events:', error);
    return [];
  }

  return (data || []) as AICostEvent[];
}

/**
 * Get aggregated model usage breakdown for an organization
 */
export async function getModelUsageBreakdown(
  orgId: string,
  startDate?: string,
  endDate?: string
): Promise<ModelUsageBreakdown[]> {
  const events = await getAICostEvents(orgId, startDate, endDate);
  const rates = await getCostRates();

  // Group by model
  const modelMap = new Map<string, ModelUsageBreakdown>();

  for (const event of events) {
    const key = `${event.provider}:${event.model}`;
    const existing = modelMap.get(key);
    const hasProviderCost = event.provider_cost_usd != null;

    if (existing) {
      existing.input_tokens += event.input_tokens;
      existing.output_tokens += event.output_tokens;
      existing.estimated_cost += event.estimated_cost;
      existing.call_count += 1;
      if (hasProviderCost) {
        existing.total_provider_cost_usd = (existing.total_provider_cost_usd ?? 0) + event.provider_cost_usd!;
      } else {
        existing.has_estimated_rows = true;
      }
      if (event.credits_charged != null) {
        existing.total_credits_charged = (existing.total_credits_charged ?? 0) + event.credits_charged;
      }
    } else {
      modelMap.set(key, {
        model: event.model,
        provider: event.provider,
        input_tokens: event.input_tokens,
        output_tokens: event.output_tokens,
        estimated_cost: event.estimated_cost,
        call_count: 1,
        total_provider_cost_usd: hasProviderCost ? event.provider_cost_usd! : null,
        total_credits_charged: event.credits_charged ?? null,
        has_estimated_rows: !hasProviderCost,
      });
    }
  }

  return Array.from(modelMap.values());
}

// ============================================================================
// Organization Cost Analysis
// ============================================================================

// Type definitions for database query results
interface OrganizationUsageRow {
  org_id: string;
  period_start: string;
  period_end: string;
  storage_used_mb: number;
  meetings_count: number;
  active_users_count: number;
}

interface SubscriptionWithPlan {
  org_id: string;
  billing_cycle: 'monthly' | 'yearly';
  plan: {
    name: string;
    slug: string;
    price_monthly: number;
    price_yearly: number;
  } | null;
}

/**
 * Calculate cost analysis for a specific organization
 */
export async function getOrganizationCostAnalysis(
  orgId: string,
  periodStart: string,
  periodEnd: string
): Promise<OrganizationCostAnalysis | null> {
  // Get organization usage
  const { data: usage, error: usageError } = await supabase
    .from('organization_usage')
    .select('*')
    .eq('org_id', orgId)
    .eq('period_start', periodStart)
    .single();

  if (usageError || !usage) {
    console.error('Error fetching organization usage:', usageError);
    return null;
  }

  // Cast usage to proper type
  const typedUsage = usage as unknown as OrganizationUsageRow;

  // Get organization details
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  if (orgError || !org) {
    console.error('Error fetching organization:', orgError);
    return null;
  }

  // Get subscription and plan
  const { data: subscription, error: subError } = await supabase
    .from('organization_subscriptions')
    .select(`
      *,
      plan:subscription_plans (
        name,
        slug,
        price_monthly,
        price_yearly
      )
    `)
    .eq('org_id', orgId)
    .single();

  if (subError) {
    console.error('Error fetching subscription:', subError);
    return null;
  }

  // Cast subscription to proper type
  const typedSubscription = subscription as unknown as SubscriptionWithPlan | null;

  // Get model usage breakdown
  const modelBreakdown = await getModelUsageBreakdown(orgId, periodStart, periodEnd);

  // Calculate costs
  const totalAICost = modelBreakdown.reduce((sum, m) => sum + m.estimated_cost, 0);

  // Estimate infrastructure costs (Supabase pricing)
  const storageCost = (typedUsage.storage_used_mb / 1024) * 0.021; // $0.021/GB/month
  const databaseCost = (typedUsage.storage_used_mb / 1024) * 0.09; // $0.09/GB/month (rough estimate)

  const totalCost = totalAICost + storageCost + databaseCost;

  // Calculate revenue
  const plan = typedSubscription?.plan;
  const revenue = plan
    ? typedSubscription?.billing_cycle === 'yearly'
      ? plan.price_yearly / 12
      : plan.price_monthly
    : 0;

  const marginPercent = revenue > 0 ? ((revenue - totalCost) / revenue) * 100 : 0;
  const costPerMeeting = typedUsage.meetings_count > 0 ? totalCost / typedUsage.meetings_count : 0;
  const costPerUser = typedUsage.active_users_count > 0 ? totalCost / typedUsage.active_users_count : 0;

  return {
    org_id: orgId,
    org_name: (org as any).name,
    plan_name: plan?.name || 'Unknown',
    plan_slug: plan?.slug || 'unknown',
    period_start: periodStart,
    period_end: periodEnd,
    meetings_count: typedUsage.meetings_count,
    active_users_count: typedUsage.active_users_count,
    storage_mb: typedUsage.storage_used_mb,
    model_breakdown: modelBreakdown,
    total_ai_cost: totalAICost,
    storage_cost: storageCost,
    database_cost: databaseCost,
    total_cost: totalCost,
    revenue: revenue / 100, // Convert from pence to dollars
    margin_percent: marginPercent,
    cost_per_meeting: costPerMeeting,
    cost_per_user: costPerUser,
  };
}

/**
 * Get cost analysis summary across all organizations
 * If periodStart is very early (e.g., '2020-01-01'), treats as lifetime query
 */
export async function getCostAnalysisSummary(
  periodStart: string,
  periodEnd: string
): Promise<CostAnalysisSummary> {
  // Check if this is a lifetime query (periodStart is very early)
  const isLifetime = periodStart < '2021-01-01';
  
  // Get all organization usage for the period
  // Note: organization_usage links to organizations, not directly to subscriptions
  let usageQuery = supabase
    .from('organization_usage')
    .select(`
      *,
      organization:organizations (
        id,
        name
      )
    `);
  
  if (isLifetime) {
    // For lifetime, get all usage records up to periodEnd
    usageQuery = usageQuery.lte('period_start', periodEnd);
  } else {
    // For period query, match exact period_start
    usageQuery = usageQuery.eq('period_start', periodStart);
  }
  
  const { data: allUsageData, error: usageError } = await usageQuery;

  if (usageError || !allUsageData) {
    console.error('Error fetching usage data:', usageError);
    return {
      total_organizations: 0,
      total_meetings: 0,
      total_active_users: 0,
      total_ai_cost: 0,
      total_infrastructure_cost: 0,
      total_cost: 0,
      total_revenue: 0,
      average_margin_percent: 0,
      average_cost_per_meeting: 0,
      average_cost_per_user: 0,
      total_provider_cost_usd: 0,
      total_credits_charged: 0,
      credits_revenue_gbp: 0,
      provider_cost_gbp: 0,
      credits_margin_pct: null,
      has_estimated_rows: false,
      model_breakdown: [],
      tier_breakdown: [],
    };
  }

  // Cast to proper type
  const allUsage = allUsageData as unknown as OrganizationUsageRow[];

  // Aggregate totals
  let totalMeetings = 0;
  let totalUsers = 0;
  let totalStorageMB = 0;
  const modelMap = new Map<string, ModelUsageBreakdown>();
  const tierMap = new Map<string, TierCostAnalysis>();

  // For lifetime queries, we need to aggregate across all periods
  // For period queries, we sum usage from the single period
  const orgUsageMap = new Map<string, { meetings: number; users: number; storage: number }>();

  // Process each organization usage record
  for (const usage of allUsage) {
    const orgId = usage.org_id;
    const existing = orgUsageMap.get(orgId);

    if (isLifetime && existing) {
      // For lifetime, sum across all periods
      existing.meetings += usage.meetings_count;
      existing.users = Math.max(existing.users, usage.active_users_count); // Use max for users
      existing.storage = Math.max(existing.storage, usage.storage_used_mb); // Use max for storage
    } else {
      orgUsageMap.set(orgId, {
        meetings: usage.meetings_count,
        users: usage.active_users_count,
        storage: usage.storage_used_mb,
      });
    }
  }
  
  // Sum up totals
  for (const usage of orgUsageMap.values()) {
    totalMeetings += usage.meetings;
    totalUsers += usage.users;
    totalStorageMB += usage.storage;
  }

  // Build a map of org_id -> subscription plan for efficient lookup
  const orgSubscriptionMap = new Map<string, { slug: string; name: string }>();
  const uniqueOrgIds = Array.from(new Set(allUsage.map((u: any) => u.org_id)));
  
  // Query all subscriptions at once for better performance
  const { data: allSubscriptions } = await supabase
    .from('organization_subscriptions')
    .select(`
      org_id,
      plan:subscription_plans (
        slug,
        name
      )
    `)
    .in('org_id', uniqueOrgIds);
  
  // Build subscription map
  if (allSubscriptions) {
    for (const sub of allSubscriptions as unknown as Array<{ org_id: string; plan: { slug: string; name: string } | null }>) {
      const plan = sub.plan;
      if (plan) {
        orgSubscriptionMap.set(sub.org_id, plan);
      }
    }
  }

  // Process each organization for model breakdown
  for (const orgId of uniqueOrgIds) {
    // Get model breakdown (for lifetime, use earliest date)
    const breakdownStart = isLifetime ? '2020-01-01' : periodStart;
    const breakdown = await getModelUsageBreakdown(orgId, breakdownStart, periodEnd);
    for (const model of breakdown) {
      const key = `${model.provider}:${model.model}`;
      const existing = modelMap.get(key);
      if (existing) {
        existing.input_tokens += model.input_tokens;
        existing.output_tokens += model.output_tokens;
        existing.estimated_cost += model.estimated_cost;
        existing.call_count += model.call_count;
        if (model.total_provider_cost_usd != null) {
          existing.total_provider_cost_usd = (existing.total_provider_cost_usd ?? 0) + model.total_provider_cost_usd;
        }
        if (model.total_credits_charged != null) {
          existing.total_credits_charged = (existing.total_credits_charged ?? 0) + model.total_credits_charged;
        }
        if (model.has_estimated_rows) {
          existing.has_estimated_rows = true;
        }
      } else {
        modelMap.set(key, { ...model });
      }
    }

    // Get tier info from subscription map
    const plan = orgSubscriptionMap.get(orgId);
    const tierSlug = plan?.slug || 'unknown';
    const tierName = plan?.name || 'Unknown';
    
    const orgUsageData = orgUsageMap.get(orgId)!;

    const existingTier = tierMap.get(tierSlug);
    if (existingTier) {
      existingTier.organization_count += 1;
      existingTier.total_meetings += orgUsageData.meetings;
    } else {
      tierMap.set(tierSlug, {
        tier_slug: tierSlug,
        tier_name: tierName,
        organization_count: 1,
        total_meetings: orgUsageData.meetings,
        total_cost: 0, // Will calculate below
        total_revenue: 0, // Will calculate below
        average_cost_per_org: 0,
        average_margin_percent: 0,
      });
    }
  }

  // Calculate costs for each tier
  for (const [tierSlug, tier] of tierMap.entries()) {
    // Get unique organizations in this tier from subscription map
    const orgsInTier = uniqueOrgIds.filter(orgId => {
      const plan = orgSubscriptionMap.get(orgId);
      return plan?.slug === tierSlug;
    });

    let tierTotalCost = 0;
    let tierTotalRevenue = 0;

    for (const orgId of orgsInTier) {
      const breakdownStart = isLifetime ? '2020-01-01' : periodStart;
      const breakdown = await getModelUsageBreakdown(orgId, breakdownStart, periodEnd);
      const aiCost = breakdown.reduce((sum, m) => sum + m.estimated_cost, 0);
      
      const orgUsageData = orgUsageMap.get(orgId);
      if (orgUsageData) {
        const storageCost = (orgUsageData.storage / 1024) * 0.021;
        const dbCost = (orgUsageData.storage / 1024) * 0.09;
        tierTotalCost += aiCost + storageCost + dbCost;
      } else {
        tierTotalCost += aiCost;
      }

      // Get revenue
      const { data: subData } = await supabase
        .from('organization_subscriptions')
        .select(`
          billing_cycle,
          plan:subscription_plans (
            price_monthly,
            price_yearly
          )
        `)
        .eq('org_id', orgId)
        .single();

      if (subData) {
        const sub = subData as unknown as { billing_cycle: 'monthly' | 'yearly'; plan: { price_monthly: number; price_yearly: number } | null };
        const plan = sub.plan;
        if (plan) {
          tierTotalRevenue +=
            sub.billing_cycle === 'yearly' ? plan.price_yearly / 12 : plan.price_monthly;
        }
      }
    }

    tier.total_cost = tierTotalCost;
    tier.total_revenue = tierTotalRevenue / 100; // Convert pence to dollars
    tier.average_cost_per_org = tier.organization_count > 0 ? tierTotalCost / tier.organization_count : 0;
    tier.average_margin_percent =
      tierTotalRevenue > 0 ? ((tierTotalRevenue / 100 - tierTotalCost) / (tierTotalRevenue / 100)) * 100 : 0;
  }

  // Calculate totals
  const totalAICost = Array.from(modelMap.values()).reduce((sum, m) => sum + m.estimated_cost, 0);
  const totalInfrastructureCost = (totalStorageMB / 1024) * (0.021 + 0.09);
  const totalCost = totalAICost + totalInfrastructureCost;

  // Calculate total revenue
  let totalRevenue = 0;
  for (const usage of allUsage) {
    const { data: subData } = await supabase
      .from('organization_subscriptions')
      .select(`
        billing_cycle,
        plan:subscription_plans (
          price_monthly,
          price_yearly
        )
      `)
      .eq('org_id', usage.org_id)
      .single();

    if (subData) {
      const sub = subData as unknown as { billing_cycle: 'monthly' | 'yearly'; plan: { price_monthly: number; price_yearly: number } | null };
      const plan = sub.plan;
      if (plan) {
        totalRevenue += sub.billing_cycle === 'yearly' ? plan.price_yearly / 12 : plan.price_monthly;
      }
    }
  }

  const averageMargin = totalRevenue > 0 ? ((totalRevenue / 100 - totalCost) / (totalRevenue / 100)) * 100 : 0;
  const avgCostPerMeeting = totalMeetings > 0 ? totalCost / totalMeetings : 0;
  const avgCostPerUser = totalUsers > 0 ? totalCost / totalUsers : 0;

  // Aggregate credit-based margin data from model breakdown
  const allModels = Array.from(modelMap.values());
  const totalProviderCostUsd = allModels.reduce(
    (sum, m) => sum + (m.total_provider_cost_usd ?? 0),
    0
  );
  const totalCreditsCharged = allModels.reduce(
    (sum, m) => sum + (m.total_credits_charged ?? 0),
    0
  );
  const hasEstimatedRows = allModels.some((m) => m.has_estimated_rows);

  // £0.396 per credit is the Insight pack rate; USD→GBP at ~0.79
  const INSIGHT_PACK_RATE_GBP = 0.396;
  const USD_TO_GBP = 0.79;
  const creditsRevenueGbp = totalCreditsCharged * INSIGHT_PACK_RATE_GBP;
  const providerCostGbp = totalProviderCostUsd * USD_TO_GBP;
  const creditsMarginPct =
    creditsRevenueGbp > 0
      ? ((creditsRevenueGbp - providerCostGbp) / creditsRevenueGbp) * 100
      : null;

  return {
    total_organizations: allUsage.length,
    total_meetings: totalMeetings,
    total_active_users: totalUsers,
    total_ai_cost: totalAICost,
    total_infrastructure_cost: totalInfrastructureCost,
    total_cost: totalCost,
    total_revenue: totalRevenue / 100, // Convert pence to dollars
    average_margin_percent: averageMargin,
    average_cost_per_meeting: avgCostPerMeeting,
    average_cost_per_user: avgCostPerUser,
    total_provider_cost_usd: totalProviderCostUsd,
    total_credits_charged: totalCreditsCharged,
    credits_revenue_gbp: creditsRevenueGbp,
    provider_cost_gbp: providerCostGbp,
    credits_margin_pct: creditsMarginPct,
    has_estimated_rows: hasEstimatedRows,
    model_breakdown: allModels,
    tier_breakdown: Array.from(tierMap.values()),
  };
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Estimate costs based on usage scenarios
 */
export async function estimateCosts(input: CostEstimationInput): Promise<CostEstimationResult> {
  const rates = await getCostRates();

  // Per-meeting processing (Haiku 4.5)
  const haikuRate = getCostRateForModel('claude-haiku-4-5', 'anthropic', rates);
  const meetingProcessingCost = haikuRate
    ? calculateTokenCost(2000, 1000, haikuRate) * input.meetings_per_month
    : 0.002 * input.meetings_per_month; // Fallback estimate

  // Copilot conversations (Sonnet 4)
  const sonnetRate = getCostRateForModel('claude-sonnet-4', 'anthropic', rates);
  const copilotCost = sonnetRate && input.copilot_conversations_per_month
    ? calculateTokenCost(5000, 2000, sonnetRate) * input.copilot_conversations_per_month
    : 0; // Estimate ~$0.05 per conversation

  // Proposals (Sonnet 4)
  const proposalCost = sonnetRate && input.proposals_per_month
    ? calculateTokenCost(10000, 5000, sonnetRate) * input.proposals_per_month
    : 0;

  // Meeting searches (Gemini)
  const geminiRate = getCostRateForModel('gemini-2.5-flash', 'gemini', rates);
  const searchCost = geminiRate && input.meeting_searches_per_month
    ? calculateTokenCost(2000, 500, geminiRate) * input.meeting_searches_per_month
    : 0;

  // Infrastructure
  const storageGB = input.storage_gb || (input.meetings_per_month * 0.05); // ~50MB per meeting
  const storageCost = storageGB * 0.021;
  const databaseCost = storageGB * 0.09;

  const totalAICost = meetingProcessingCost + copilotCost + proposalCost + searchCost;
  const totalInfrastructureCost = storageCost + databaseCost;
  const totalCost = totalAICost + totalInfrastructureCost;

  // Calculate breakdown by model
  const modelBreakdown = [
    {
      model: 'claude-haiku-4-5',
      cost: meetingProcessingCost,
      percentage: totalCost > 0 ? (meetingProcessingCost / totalCost) * 100 : 0,
    },
    {
      model: 'claude-sonnet-4',
      cost: copilotCost + proposalCost,
      percentage: totalCost > 0 ? ((copilotCost + proposalCost) / totalCost) * 100 : 0,
    },
    {
      model: 'gemini-2.5-flash',
      cost: searchCost,
      percentage: totalCost > 0 ? (searchCost / totalCost) * 100 : 0,
    },
  ].filter((m) => m.cost > 0);

  return {
    meeting_processing_cost: meetingProcessingCost,
    copilot_cost: copilotCost,
    proposal_cost: proposalCost,
    search_cost: searchCost,
    storage_cost: storageCost,
    database_cost: databaseCost,
    total_ai_cost: totalAICost,
    total_infrastructure_cost: totalInfrastructureCost,
    total_cost: totalCost,
    model_breakdown: modelBreakdown,
  };
}

/**
 * Calculate recommended pricing based on target margin
 */
export async function calculateMarginPricing(
  targetMarginPercent: number,
  estimatedCost: number
): Promise<MarginCalculation> {
  const recommendedPrice = estimatedCost / (1 - targetMarginPercent / 100);
  const actualMargin = recommendedPrice > 0 ? ((recommendedPrice - estimatedCost) / recommendedPrice) * 100 : 0;

  // Generate scenarios (simplified for now - can be enhanced later)
  const scenarios = [
    { meetings_per_month: 30, estimated_cost: 0.3, recommended_price: 1.0, margin_percent: 70 },
    { meetings_per_month: 100, estimated_cost: 1.0, recommended_price: 3.33, margin_percent: 70 },
    { meetings_per_month: 500, estimated_cost: 5.0, recommended_price: 16.67, margin_percent: 70 },
  ];

  // For now, return synchronous calculation
  // TODO: Make this async and calculate scenarios properly
  return {
    target_margin_percent: targetMarginPercent,
    estimated_cost_per_month: estimatedCost,
    recommended_price: recommendedPrice,
    actual_margin_percent: actualMargin,
    scenarios: [
      { meetings_per_month: 30, estimated_cost: 0.3, recommended_price: 1.0, margin_percent: 70 },
      { meetings_per_month: 100, estimated_cost: 1.0, recommended_price: 3.33, margin_percent: 70 },
      { meetings_per_month: 500, estimated_cost: 5.0, recommended_price: 16.67, margin_percent: 70 },
    ],
  };
}


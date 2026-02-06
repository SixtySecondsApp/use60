/**
 * AI Usage Service
 *
 * Service for tracking and analyzing AI usage across the platform
 * - Usage by feature, organization, user, model
 * - Time-based aggregations
 * - Cost tracking
 */

import { supabase } from '@/lib/supabase/clientV2';
import type {
  AIUsageByFeature,
  AIUsageByOrg,
  AIUsageByUser,
  AIUsageSummary,
  OrgUsageSummary,
  AIUsageFilters,
  AIProvider,
  FeatureCategory,
} from '@/lib/types/aiModels';

// ============================================================================
// Usage by Feature
// ============================================================================

/**
 * Get usage aggregated by feature
 */
export async function getUsageByFeature(filters: AIUsageFilters): Promise<AIUsageByFeature[]> {
  let query = supabase
    .from('ai_usage_by_feature')
    .select('*')
    .order('usage_date', { ascending: false });

  if (filters.startDate) {
    query = query.gte('usage_date', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('usage_date', filters.endDate);
  }
  if (filters.provider) {
    query = query.eq('provider', filters.provider);
  }
  if (filters.feature_key) {
    query = query.eq('feature_key', filters.feature_key);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching usage by feature:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// Usage by Organization
// ============================================================================

/**
 * Get usage aggregated by organization
 */
export async function getUsageByOrg(filters: AIUsageFilters): Promise<AIUsageByOrg[]> {
  let query = supabase
    .from('ai_usage_by_org')
    .select('*')
    .order('usage_date', { ascending: false });

  if (filters.startDate) {
    query = query.gte('usage_date', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('usage_date', filters.endDate);
  }
  if (filters.org_id) {
    query = query.eq('org_id', filters.org_id);
  }
  if (filters.provider) {
    query = query.eq('provider', filters.provider);
  }
  if (filters.feature_key) {
    query = query.eq('feature_key', filters.feature_key);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching usage by org:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// Usage by User
// ============================================================================

/**
 * Get usage aggregated by user
 */
export async function getUsageByUser(filters: AIUsageFilters): Promise<AIUsageByUser[]> {
  let query = supabase
    .from('ai_usage_by_user')
    .select('*')
    .order('usage_date', { ascending: false });

  if (filters.startDate) {
    query = query.gte('usage_date', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('usage_date', filters.endDate);
  }
  if (filters.org_id) {
    query = query.eq('org_id', filters.org_id);
  }
  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }
  if (filters.provider) {
    query = query.eq('provider', filters.provider);
  }
  if (filters.feature_key) {
    query = query.eq('feature_key', filters.feature_key);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching usage by user:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// Platform Summary (All Orgs)
// ============================================================================

/**
 * Get platform-wide usage summary
 */
export async function getPlatformUsageSummary(filters: AIUsageFilters): Promise<AIUsageSummary> {
  // Get raw usage data
  const usageData = await getUsageByFeature(filters);

  // Initialize summary
  const summary: AIUsageSummary = {
    total_calls: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cost: 0,
    by_provider: {} as Record<AIProvider, { calls: number; input_tokens: number; output_tokens: number; cost: number }>,
    by_feature: {},
    by_model: {},
    daily_trend: [],
  };

  // Group by date for trend
  const dateMap = new Map<string, { calls: number; cost: number }>();

  for (const row of usageData) {
    // Totals
    summary.total_calls += row.call_count;
    summary.total_input_tokens += row.total_input_tokens;
    summary.total_output_tokens += row.total_output_tokens;
    summary.total_cost += row.total_cost;

    // By provider
    if (!summary.by_provider[row.provider]) {
      summary.by_provider[row.provider] = { calls: 0, input_tokens: 0, output_tokens: 0, cost: 0 };
    }
    summary.by_provider[row.provider].calls += row.call_count;
    summary.by_provider[row.provider].input_tokens += row.total_input_tokens;
    summary.by_provider[row.provider].output_tokens += row.total_output_tokens;
    summary.by_provider[row.provider].cost += row.total_cost;

    // By feature
    if (!summary.by_feature[row.feature_key]) {
      summary.by_feature[row.feature_key] = {
        feature_name: row.feature_name || row.feature_key,
        category: (row.category as FeatureCategory) || 'Other',
        calls: 0,
        cost: 0,
      };
    }
    summary.by_feature[row.feature_key].calls += row.call_count;
    summary.by_feature[row.feature_key].cost += row.total_cost;

    // By model
    const modelKey = `${row.provider}:${row.model}`;
    if (!summary.by_model[modelKey]) {
      summary.by_model[modelKey] = {
        display_name: row.model,
        provider: row.provider,
        calls: 0,
        cost: 0,
      };
    }
    summary.by_model[modelKey].calls += row.call_count;
    summary.by_model[modelKey].cost += row.total_cost;

    // Daily trend
    const dateKey = row.usage_date.split('T')[0];
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, { calls: 0, cost: 0 });
    }
    const dayData = dateMap.get(dateKey)!;
    dayData.calls += row.call_count;
    dayData.cost += row.total_cost;
  }

  // Convert date map to sorted array
  summary.daily_trend = Array.from(dateMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return summary;
}

// ============================================================================
// Organization Summary
// ============================================================================

/**
 * Get usage summary for a specific organization
 */
export async function getOrgUsageSummary(orgId: string, filters: AIUsageFilters): Promise<OrgUsageSummary | null> {
  // Get org details
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle();

  if (orgError || !org) {
    console.error('Error fetching organization:', orgError);
    return null;
  }

  // Get org usage data
  const usageData = await getUsageByOrg({ ...filters, org_id: orgId });

  // Initialize summary
  const summary: OrgUsageSummary = {
    org_id: orgId,
    org_name: org.name,
    total_calls: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cost: 0,
    by_provider: {} as Record<AIProvider, { calls: number; input_tokens: number; output_tokens: number; cost: number }>,
    by_feature: {},
    by_model: {},
    daily_trend: [],
    features_used: [],
  };

  const featuresSet = new Set<string>();
  const dateMap = new Map<string, { calls: number; cost: number }>();

  for (const row of usageData) {
    // Totals
    summary.total_calls += row.call_count;
    summary.total_input_tokens += row.total_input_tokens;
    summary.total_output_tokens += row.total_output_tokens;
    summary.total_cost += row.total_cost;

    // Track features used
    featuresSet.add(row.feature_key);

    // By provider
    if (!summary.by_provider[row.provider]) {
      summary.by_provider[row.provider] = { calls: 0, input_tokens: 0, output_tokens: 0, cost: 0 };
    }
    summary.by_provider[row.provider].calls += row.call_count;
    summary.by_provider[row.provider].input_tokens += row.total_input_tokens;
    summary.by_provider[row.provider].output_tokens += row.total_output_tokens;
    summary.by_provider[row.provider].cost += row.total_cost;

    // By feature
    if (!summary.by_feature[row.feature_key]) {
      summary.by_feature[row.feature_key] = {
        feature_name: row.feature_name || row.feature_key,
        category: (row.category as FeatureCategory) || 'Other',
        calls: 0,
        cost: 0,
      };
    }
    summary.by_feature[row.feature_key].calls += row.call_count;
    summary.by_feature[row.feature_key].cost += row.total_cost;

    // By model
    const modelKey = `${row.provider}:${row.model}`;
    if (!summary.by_model[modelKey]) {
      summary.by_model[modelKey] = {
        display_name: row.model,
        provider: row.provider,
        calls: 0,
        cost: 0,
      };
    }
    summary.by_model[modelKey].calls += row.call_count;
    summary.by_model[modelKey].cost += row.total_cost;

    // Daily trend
    const dateKey = row.usage_date.split('T')[0];
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, { calls: 0, cost: 0 });
    }
    const dayData = dateMap.get(dateKey)!;
    dayData.calls += row.call_count;
    dayData.cost += row.total_cost;
  }

  summary.features_used = Array.from(featuresSet);
  summary.daily_trend = Array.from(dateMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return summary;
}

// ============================================================================
// Top Organizations by Usage
// ============================================================================

/**
 * Get top organizations by AI usage/cost
 */
export async function getTopOrgsByUsage(
  filters: AIUsageFilters,
  limit: number = 10
): Promise<Array<{ org_id: string; org_name: string; total_calls: number; total_cost: number }>> {
  const usageData = await getUsageByOrg(filters);

  // Aggregate by org
  const orgMap = new Map<string, { org_name: string; total_calls: number; total_cost: number }>();

  for (const row of usageData) {
    if (!orgMap.has(row.org_id)) {
      orgMap.set(row.org_id, {
        org_name: row.org_name || 'Unknown',
        total_calls: 0,
        total_cost: 0,
      });
    }
    const org = orgMap.get(row.org_id)!;
    org.total_calls += row.call_count;
    org.total_cost += row.total_cost;
  }

  // Sort by cost and limit
  return Array.from(orgMap.entries())
    .map(([org_id, data]) => ({ org_id, ...data }))
    .sort((a, b) => b.total_cost - a.total_cost)
    .slice(0, limit);
}

// ============================================================================
// Top Users by Usage
// ============================================================================

/**
 * Get top users by AI usage/cost
 */
export async function getTopUsersByUsage(
  filters: AIUsageFilters,
  limit: number = 10
): Promise<Array<{ user_id: string; user_email: string; user_name: string; total_calls: number; total_cost: number }>> {
  const usageData = await getUsageByUser(filters);

  // Aggregate by user
  const userMap = new Map<string, { user_email: string; user_name: string; total_calls: number; total_cost: number }>();

  for (const row of usageData) {
    if (!userMap.has(row.user_id)) {
      userMap.set(row.user_id, {
        user_email: row.user_email || 'Unknown',
        user_name: row.user_name || 'Unknown',
        total_calls: 0,
        total_cost: 0,
      });
    }
    const user = userMap.get(row.user_id)!;
    user.total_calls += row.call_count;
    user.total_cost += row.total_cost;
  }

  // Sort by cost and limit
  return Array.from(userMap.entries())
    .map(([user_id, data]) => ({ user_id, ...data }))
    .sort((a, b) => b.total_cost - a.total_cost)
    .slice(0, limit);
}

// ============================================================================
// Raw Events (for audit/detail views)
// ============================================================================

/**
 * Get raw AI cost events with pagination
 */
export async function getAICostEvents(
  filters: AIUsageFilters,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: any[]; count: number }> {
  const page = options?.page || 0;
  const pageSize = options?.pageSize || 50;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('ai_cost_events')
    .select('*, organizations(name), profiles(email, full_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.startDate) {
    query = query.gte('created_at', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('created_at', filters.endDate);
  }
  if (filters.org_id) {
    query = query.eq('org_id', filters.org_id);
  }
  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }
  if (filters.provider) {
    query = query.eq('provider', filters.provider);
  }
  if (filters.feature_key) {
    query = query.eq('feature_key', filters.feature_key);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching AI cost events:', error);
    return { data: [], count: 0 };
  }

  return { data: data || [], count: count || 0 };
}

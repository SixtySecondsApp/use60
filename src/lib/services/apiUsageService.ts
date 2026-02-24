/**
 * API Usage Service
 *
 * Service for fetching and managing API usage data for the
 * platform admin dashboard.
 */

import { supabase } from '@/lib/supabase/clientV2';
import type {
  ApiProvider,
  UsageSnapshot,
  ProviderUsage,
  UsageMetric,
  RefreshResult,
  UsageDashboardData,
} from '@/lib/types/apiUsage';
import { getUsageStatus, providerDisplayNames, formatMetricName } from '@/lib/types/apiUsage';

const PROVIDERS: ApiProvider[] = ['meetingbaas', 'gladia', 'deepgram'];

/**
 * Get the latest usage data for all providers
 */
export async function getLatestUsage(): Promise<UsageDashboardData> {
  const providers: ProviderUsage[] = [];
  let latestRefresh: string | null = null;

  for (const provider of PROVIDERS) {
    try {
      // Get latest snapshots for this provider
      const { data: snapshots, error } = await supabase
        .from('api_usage_snapshots')
        .select('*')
        .eq('provider', provider)
        .order('fetched_at', { ascending: false })
        .limit(20); // Get recent snapshots to find latest per metric

      if (error) {
        console.error(`Error fetching ${provider} usage:`, error);
        providers.push({
          provider,
          displayName: providerDisplayNames[provider],
          metrics: [],
          lastUpdated: null,
          fetchStatus: 'error',
          error: error.message,
        });
        continue;
      }

      // Deduplicate to get latest per metric
      const latestByMetric = new Map<string, UsageSnapshot>();
      for (const snapshot of snapshots || []) {
        // Skip status/error metrics
        if (snapshot.metric_name === 'api_fetch_status' || snapshot.metric_name === 'raw_response') {
          continue;
        }

        if (!latestByMetric.has(snapshot.metric_name)) {
          latestByMetric.set(snapshot.metric_name, snapshot);
        }
      }

      // Convert to metrics array
      const metrics: UsageMetric[] = [];
      let providerLastUpdated: string | null = null;

      for (const [_, snapshot] of latestByMetric) {
        const percent = snapshot.plan_limit ? (snapshot.metric_value / snapshot.plan_limit) * 100 : null;

        metrics.push({
          name: formatMetricName(snapshot.metric_name),
          value: snapshot.metric_value,
          unit: snapshot.metric_unit || '',
          limit: snapshot.plan_limit,
          percent: percent !== null ? Math.round(percent * 10) / 10 : null,
          status: getUsageStatus(percent),
        });

        // Track latest update time
        if (!providerLastUpdated || snapshot.fetched_at > providerLastUpdated) {
          providerLastUpdated = snapshot.fetched_at;
        }
      }

      // Track overall latest refresh
      if (providerLastUpdated && (!latestRefresh || providerLastUpdated > latestRefresh)) {
        latestRefresh = providerLastUpdated;
      }

      providers.push({
        provider,
        displayName: providerDisplayNames[provider],
        metrics,
        lastUpdated: providerLastUpdated,
        fetchStatus: metrics.length > 0 ? 'success' : 'pending',
      });
    } catch (err) {
      console.error(`Error processing ${provider} usage:`, err);
      providers.push({
        provider,
        displayName: providerDisplayNames[provider],
        metrics: [],
        lastUpdated: null,
        fetchStatus: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return {
    providers,
    lastRefresh: latestRefresh,
    isRefreshing: false,
  };
}

/**
 * Trigger a manual refresh of all usage data
 */
export async function refreshUsage(): Promise<RefreshResult> {
  try {
    const { data, error } = await supabase.functions.invoke<RefreshResult>('api-usage-cron', {
      method: 'POST',
    });

    if (error) {
      throw error;
    }

    return data || { success: false, message: 'No response', duration_ms: 0, results: [] };
  } catch (err) {
    console.error('Error refreshing usage:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Unknown error',
      duration_ms: 0,
      results: [],
    };
  }
}

/**
 * Get usage history for a specific provider and metric
 */
export async function getUsageHistory(
  provider: ApiProvider,
  metricName: string,
  days: number = 30
): Promise<UsageSnapshot[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const { data, error } = await supabase
    .from('api_usage_snapshots')
    .select('*')
    .eq('provider', provider)
    .eq('metric_name', metricName)
    .gte('fetched_at', cutoffDate.toISOString())
    .order('fetched_at', { ascending: true });

  if (error) {
    console.error('Error fetching usage history:', error);
    return [];
  }

  return data || [];
}

// Export as default object for consistency with other services
const apiUsageService = {
  getLatestUsage,
  refreshUsage,
  getUsageHistory,
};

export default apiUsageService;

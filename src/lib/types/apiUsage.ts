/**
 * API Usage Types
 *
 * Types for the platform admin API usage monitoring dashboard.
 */

export type ApiProvider = 'meetingbaas' | 'gladia' | 'deepgram';

export interface UsageSnapshot {
  id: string;
  provider: ApiProvider;
  metric_name: string;
  metric_value: number;
  metric_unit: string | null;
  plan_name: string | null;
  plan_limit: number | null;
  period_start: string | null;
  period_end: string | null;
  fetched_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UsageMetric {
  name: string;
  value: number;
  unit: string;
  limit: number | null;
  percent: number | null;
  status: 'ok' | 'warning' | 'critical';
}

export interface ProviderUsage {
  provider: ApiProvider;
  displayName: string;
  metrics: UsageMetric[];
  lastUpdated: string | null;
  fetchStatus: 'success' | 'error' | 'pending';
  error?: string;
}

export interface UsageDashboardData {
  providers: ProviderUsage[];
  lastRefresh: string | null;
  isRefreshing: boolean;
}

export interface RefreshResult {
  success: boolean;
  message: string;
  duration_ms: number;
  results: Array<{
    provider: string;
    success: boolean;
    snapshots_stored?: number;
    error?: string;
  }>;
}

// Helper to determine status based on usage percentage
export function getUsageStatus(percent: number | null): 'ok' | 'warning' | 'critical' {
  if (percent === null) return 'ok';
  if (percent >= 100) return 'critical';
  if (percent >= 80) return 'warning';
  return 'ok';
}

// Helper to format provider names
export const providerDisplayNames: Record<ApiProvider, string> = {
  meetingbaas: 'MeetingBaaS',
  gladia: 'Gladia',
  deepgram: 'Deepgram',
};

// Helper to format metric names
export function formatMetricName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Helper to format metric values
export function formatMetricValue(value: number, unit: string | null): string {
  if (unit === 'hours') {
    return `${value.toFixed(1)}h`;
  }
  if (unit === 'minutes') {
    return `${value.toFixed(0)}m`;
  }
  if (unit === 'gb') {
    return `${value.toFixed(2)} GB`;
  }
  if (unit === 'usd') {
    return `$${value.toFixed(2)}`;
  }
  if (unit === 'count') {
    return value.toLocaleString();
  }
  return `${value}${unit ? ` ${unit}` : ''}`;
}

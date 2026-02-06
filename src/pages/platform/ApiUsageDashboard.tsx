/**
 * API Usage Dashboard
 *
 * Platform admin page for monitoring API usage across MeetingBaaS, Gladia, and Deepgram.
 * Shows usage metrics with progress bars against plan limits and alerts at thresholds.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Video,
  Mic,
  Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import apiUsageService from '@/lib/services/apiUsageService';
import type { UsageDashboardData, ProviderUsage, UsageMetric } from '@/lib/types/apiUsage';
import { formatMetricValue } from '@/lib/types/apiUsage';
import { toast } from 'sonner';

// Provider icons and colors
const providerConfig: Record<string, { icon: typeof Video; color: string; bgColor: string }> = {
  meetingbaas: {
    icon: Video,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  gladia: {
    icon: Mic,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  deepgram: {
    icon: Database,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
};

export default function ApiUsageDashboard() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();

  const [data, setData] = useState<UsageDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const usageData = await apiUsageService.getLatestUsage();
      setData(usageData);
    } catch (error) {
      console.error('Error loading API usage:', error);
      toast.error('Failed to load API usage data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    toast.info('Refreshing usage data from all providers...');

    try {
      const result = await apiUsageService.refreshUsage();

      if (result.success) {
        toast.success(`Usage data refreshed (${result.duration_ms}ms)`);
        // Reload the data after refresh
        await loadData();
      } else {
        toast.error(result.message || 'Failed to refresh usage data');
      }
    } catch (error) {
      console.error('Error refreshing usage:', error);
      toast.error('Failed to refresh usage data');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Access control
  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You need platform admin permissions to view this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const formatLastUpdated = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/platform')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">60 Notetaker Build</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Monitor usage across MeetingBaaS, Gladia, and Deepgram
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {data?.lastRefresh && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Clock className="h-4 w-4" />
                  Last updated: {formatLastUpdated(data.lastRefresh)}
                </div>
              )}
              <Button onClick={handleRefresh} disabled={isRefreshing} className="gap-2">
                <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                {isRefreshing ? 'Refreshing...' : 'Refresh All'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {data?.providers.map((provider) => (
              <ProviderCard key={provider.provider} provider={provider} />
            ))}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <div className="flex gap-3">
            <Activity className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900 dark:text-blue-100">About Usage Monitoring</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Usage data is fetched daily at 9am UTC via cron job. Use the refresh button above to fetch the latest
                data manually. Slack alerts are sent when usage reaches 80%, 90%, or 100% of plan limits.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Provider Card Component
function ProviderCard({ provider }: { provider: ProviderUsage }) {
  const config = providerConfig[provider.provider] || {
    icon: Activity,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
  };
  const Icon = config.icon;

  const hasWarning = provider.metrics.some((m) => m.status === 'warning');
  const hasCritical = provider.metrics.some((m) => m.status === 'critical');

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card
        className={cn(
          'h-full',
          hasCritical && 'ring-2 ring-red-500 dark:ring-red-400',
          hasWarning && !hasCritical && 'ring-2 ring-yellow-500 dark:ring-yellow-400'
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', config.bgColor)}>
                <Icon className={cn('h-5 w-5', config.color)} />
              </div>
              <div>
                <CardTitle className="text-lg">{provider.displayName}</CardTitle>
                {provider.lastUpdated && (
                  <CardDescription className="text-xs">
                    Updated{' '}
                    {new Date(provider.lastUpdated).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </CardDescription>
                )}
              </div>
            </div>
            <StatusBadge status={provider.fetchStatus} hasWarning={hasWarning} hasCritical={hasCritical} />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {provider.fetchStatus === 'error' && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
              {provider.error || 'Failed to fetch usage data'}
            </div>
          )}

          {provider.fetchStatus === 'pending' && provider.metrics.length === 0 && (
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400 text-center">
              No usage data yet. Click refresh to fetch.
            </div>
          )}

          {provider.metrics.map((metric) => (
            <MetricRow key={metric.name} metric={metric} />
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Status Badge Component
function StatusBadge({
  status,
  hasWarning,
  hasCritical,
}: {
  status: 'success' | 'error' | 'pending';
  hasWarning: boolean;
  hasCritical: boolean;
}) {
  if (hasCritical) {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Critical
      </Badge>
    );
  }

  if (hasWarning) {
    return (
      <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600 dark:text-yellow-400">
        <AlertTriangle className="h-3 w-3" />
        Warning
      </Badge>
    );
  }

  if (status === 'error') {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Error
      </Badge>
    );
  }

  if (status === 'pending') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 border-green-500 text-green-600 dark:text-green-400">
      <CheckCircle2 className="h-3 w-3" />
      OK
    </Badge>
  );
}

// Metric Row Component
function MetricRow({ metric }: { metric: UsageMetric }) {
  const progressColor =
    metric.status === 'critical' ? 'bg-red-500' : metric.status === 'warning' ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">{metric.name}</span>
        <span className="text-gray-500 dark:text-gray-400">
          {formatMetricValue(metric.value, metric.unit)}
          {metric.limit !== null && (
            <span className="text-gray-400 dark:text-gray-500"> / {formatMetricValue(metric.limit, metric.unit)}</span>
          )}
        </span>
      </div>

      {metric.limit !== null && metric.percent !== null && (
        <div className="space-y-1">
          <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', progressColor)}
              style={{ width: `${Math.min(metric.percent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{metric.percent.toFixed(1)}% used</span>
            {metric.percent >= 80 && (
              <span className={metric.status === 'critical' ? 'text-red-500' : 'text-yellow-500'}>
                {metric.status === 'critical' ? 'Limit reached!' : 'Approaching limit'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

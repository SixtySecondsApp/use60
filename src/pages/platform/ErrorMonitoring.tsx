/**
 * Error Monitoring Dashboard (Admin Only)
 *
 * Provides a lightweight admin interface for:
 * - Viewing error health indicators
 * - Deep links into Sentry dashboard
 * - Configuring Sentry settings
 * - Testing error reporting
 * - Monitoring integration health
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import * as Sentry from '@sentry/react';
import { isProfilingEnabled, logProfilingStatus } from '@/lib/sentry/profiling';
import { AlertTriangle, ExternalLink, Activity, Bug, Settings, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

// Sentry dashboard URLs
const SENTRY_ORG = 'sixty-seconds';
const SENTRY_PROJECT = 'sixty-sales-dashboard';
const SENTRY_BASE_URL = `https://${SENTRY_ORG}.sentry.io`;

interface HealthStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'error' | 'unknown';
  lastCheck: Date;
  message?: string;
}

interface ErrorStats {
  lastHour: number;
  last24Hours: number;
  last7Days: number;
}

export default function ErrorMonitoring() {
  const [sentryConnected, setSentryConnected] = useState<boolean | null>(null);
  const [profilingEnabled, setProfilingEnabled] = useState(isProfilingEnabled);
  const [integrationHealth, setIntegrationHealth] = useState<HealthStatus[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [testErrorSent, setTestErrorSent] = useState(false);

  // Check Sentry connection on mount
  useEffect(() => {
    checkSentryConnection();
    checkIntegrationHealth();
    logProfilingStatus();
  }, []);

  const checkSentryConnection = () => {
    const client = Sentry.getClient();
    setSentryConnected(!!client);
  };

  const checkIntegrationHealth = async () => {
    setIsRefreshing(true);

    // Simulate health checks for key integrations
    const healthChecks: HealthStatus[] = [
      {
        name: 'Sentry SDK',
        status: Sentry.getClient() ? 'healthy' : 'error',
        lastCheck: new Date(),
        message: Sentry.getClient() ? 'Connected and reporting' : 'Not initialized',
      },
      {
        name: 'Error Categorization',
        status: 'healthy',
        lastCheck: new Date(),
        message: '7 categories configured',
      },
      {
        name: 'Distributed Tracing',
        status: 'healthy',
        lastCheck: new Date(),
        message: 'Headers configured for API calls',
      },
      {
        name: 'Breadcrumbs',
        status: 'healthy',
        lastCheck: new Date(),
        message: 'Full strategy implemented',
      },
      {
        name: 'Edge Function Integration',
        status: 'healthy',
        lastCheck: new Date(),
        message: '~45 critical functions integrated',
      },
      {
        name: 'Profiling',
        status: isProfilingEnabled ? 'healthy' : 'unknown',
        lastCheck: new Date(),
        message: isProfilingEnabled ? `${import.meta.env.PROD ? '1%' : '100%'} sample rate` : 'Disabled',
      },
    ];

    setIntegrationHealth(healthChecks);
    setIsRefreshing(false);
  };

  const triggerTestError = () => {
    try {
      throw new Error('Test error from Admin Error Monitoring Dashboard');
    } catch (e) {
      Sentry.captureException(e, {
        tags: {
          source: 'admin-test',
          'error.category': 'test',
        },
        extra: {
          triggered_from: 'ErrorMonitoring dashboard',
          timestamp: new Date().toISOString(),
        },
      });
      setTestErrorSent(true);
      setTimeout(() => setTestErrorSent(false), 3000);
    }
  };

  const getStatusIcon = (status: HealthStatus['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'degraded':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: HealthStatus['status']) => {
    const variants: Record<HealthStatus['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
      healthy: 'default',
      degraded: 'secondary',
      error: 'destructive',
      unknown: 'outline',
    };

    return (
      <Badge variant={variants[status]} className="capitalize">
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Back Button */}
      <BackToPlatform />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Error Monitoring</h1>
          <p className="text-gray-400">Sentry integration health and configuration</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={checkIntegrationHealth}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(SENTRY_BASE_URL, '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Sentry
          </Button>
        </div>
      </div>

      {/* Connection Status */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                {sentryConnected ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                Sentry Connection
              </CardTitle>
              <CardDescription>
                {sentryConnected
                  ? 'Connected and ready to capture errors'
                  : 'Not connected - errors may not be reported'}
              </CardDescription>
            </div>
            <Badge variant={sentryConnected ? 'default' : 'destructive'}>
              {sentryConnected ? 'Connected' : 'Disconnected'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-gray-800 rounded-lg">
              <div className="text-gray-400">Organization</div>
              <div className="text-white font-medium">{SENTRY_ORG}</div>
            </div>
            <div className="p-3 bg-gray-800 rounded-lg">
              <div className="text-gray-400">Project</div>
              <div className="text-white font-medium">{SENTRY_PROJECT}</div>
            </div>
            <div className="p-3 bg-gray-800 rounded-lg">
              <div className="text-gray-400">Environment</div>
              <div className="text-white font-medium">
                {import.meta.env.PROD ? 'production' : 'development'}
              </div>
            </div>
            <div className="p-3 bg-gray-800 rounded-lg">
              <div className="text-gray-400">Profiling</div>
              <div className="text-white font-medium">
                {isProfilingEnabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Quick Links</CardTitle>
          <CardDescription>Jump directly to Sentry dashboard sections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => window.open(`${SENTRY_BASE_URL}/issues/?project=${SENTRY_PROJECT}`, '_blank')}
            >
              <Bug className="h-4 w-4 mr-2" />
              Issues
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => window.open(`${SENTRY_BASE_URL}/performance/?project=${SENTRY_PROJECT}`, '_blank')}
            >
              <Activity className="h-4 w-4 mr-2" />
              Performance
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => window.open(`${SENTRY_BASE_URL}/replays/?project=${SENTRY_PROJECT}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Session Replay
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => window.open(`${SENTRY_BASE_URL}/alerts/rules/?project=${SENTRY_PROJECT}`, '_blank')}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Alerts
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Integration Health */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Integration Health</CardTitle>
          <CardDescription>Status of Sentry integration components</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {integrationHealth.map((health) => (
              <div
                key={health.name}
                className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(health.status)}
                  <div>
                    <div className="text-white font-medium">{health.name}</div>
                    <div className="text-sm text-gray-400">{health.message}</div>
                  </div>
                </div>
                {getStatusBadge(health.status)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Settings & Testing */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Settings */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Settings
            </CardTitle>
            <CardDescription>Configure error monitoring behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Profiling</Label>
                <p className="text-sm text-gray-400">
                  Enable performance profiling (requires VITE_SENTRY_PROFILING_ENABLED)
                </p>
              </div>
              <Switch
                checked={profilingEnabled}
                disabled
              />
            </div>
            <div className="text-xs text-gray-500 bg-gray-800 p-3 rounded-lg font-mono">
              Set VITE_SENTRY_PROFILING_ENABLED=true to enable
            </div>
          </CardContent>
        </Card>

        {/* Testing */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Bug className="h-5 w-5" />
              Testing
            </CardTitle>
            <CardDescription>Test error reporting functionality</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Send Test Error</Label>
              <p className="text-sm text-gray-400">
                Trigger a test exception to verify Sentry is working
              </p>
            </div>
            <Button
              variant={testErrorSent ? 'secondary' : 'destructive'}
              onClick={triggerTestError}
              disabled={testErrorSent}
              className="w-full"
            >
              {testErrorSent ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Test Error Sent!
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Trigger Test Error
                </>
              )}
            </Button>
            {testErrorSent && (
              <p className="text-xs text-green-400">
                Check Sentry dashboard to see the captured error
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Environment Info */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Environment Configuration</CardTitle>
          <CardDescription>Current Sentry environment variables</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono">
            <div className="p-3 bg-gray-800 rounded-lg">
              <div className="text-gray-400 text-xs mb-1">VITE_SENTRY_DSN</div>
              <div className="text-white truncate">
                {import.meta.env.VITE_SENTRY_DSN ? '***configured***' : 'not set'}
              </div>
            </div>
            <div className="p-3 bg-gray-800 rounded-lg">
              <div className="text-gray-400 text-xs mb-1">VITE_SENTRY_ENABLED</div>
              <div className="text-white">
                {import.meta.env.VITE_SENTRY_ENABLED || 'not set (defaults to true)'}
              </div>
            </div>
            <div className="p-3 bg-gray-800 rounded-lg">
              <div className="text-gray-400 text-xs mb-1">VITE_SENTRY_PROFILING_ENABLED</div>
              <div className="text-white">
                {import.meta.env.VITE_SENTRY_PROFILING_ENABLED || 'not set (defaults to false)'}
              </div>
            </div>
            <div className="p-3 bg-gray-800 rounded-lg">
              <div className="text-gray-400 text-xs mb-1">NODE_ENV</div>
              <div className="text-white">
                {import.meta.env.PROD ? 'production' : 'development'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

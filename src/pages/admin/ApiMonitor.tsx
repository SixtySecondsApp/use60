import React, { useState, useEffect, useCallback } from 'react';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Copy,
  Download,
  RefreshCw,
  Loader2,
  BarChart3,
  Zap,
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUser } from '@/lib/hooks/useUser';

interface ApiSnapshot {
  snapshot_time: string;
  time_bucket_start: string;
  time_bucket_end: string;
  bucket_type: '5m' | '1h' | '1d';
  total_requests: number;
  total_errors: number;
  error_rate: number;
  top_endpoints: Array<{
    endpoint: string;
    method: string;
    count: number;
    errors: number;
  }>;
  top_errors: Array<{
    status: number;
    endpoint: string;
    count: number;
    sample_message?: string;
  }>;
  top_callers: Array<{
    ip?: string;
    user_agent?: string;
    count: number;
  }>;
  suspected_bursts: Array<{
    endpoint: string;
    requests_per_minute: number;
    time_window: string;
  }>;
}

interface Improvement {
  id: string;
  title: string;
  description: string;
  shipped_at: string;
  expected_delta_requests_per_day?: number;
  expected_delta_error_rate?: number;
  actual_delta_requests_per_day?: number;
  actual_delta_error_rate?: number;
  actual_delta_requests_per_user_per_day?: number;
  code_changes?: Array<{ file: string; type: string }>;
}

interface AIReview {
  timeframe: {
    from: string;
    to: string;
    duration_hours: number;
  };
  totals: {
    total_requests: number;
    total_errors: number;
    error_rate: number;
  };
  top_endpoints: Array<any>;
  top_errors: Array<any>;
  suspected_sources: {
    browser: number;
    edge_functions: number;
    cron: number;
  };
  hypotheses: string[];
  recommended_next_changes: string[];
  code_pointers: string[];
}

export default function ApiMonitor() {
  const { userData } = useUser();
  const [snapshot, setSnapshot] = useState<ApiSnapshot | null>(null);
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [aiReview, setAiReview] = useState<AIReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 1),
    to: new Date(),
  });

  const fetchSnapshot = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        from: timeRange.from.toISOString(),
        to: timeRange.to.toISOString(),
      });
      const { data, error } = await supabase.functions.invoke('api-services-router', {
        body: {
          action: 'monitor',
          method: 'GET',
          from: timeRange.from.toISOString(),
          to: timeRange.to.toISOString(),
        },
      });

      if (error) {
        console.error('API Monitor error:', error);
        const errorMessage = (error as any)?.message || error?.toString() || 'Unknown error';
        const errorContext = (error as any)?.context;
        console.error('Error context:', errorContext);
        
        // Fallback: Try to load from database snapshots
        console.log('Attempting fallback: loading from database snapshots...');
        const { data: snapshotData, error: dbError } = await supabase
          .from('api_monitor_snapshots')
          .select('*')
          .gte('time_bucket_start', timeRange.from.toISOString())
          .lte('time_bucket_end', timeRange.to.toISOString())
          .order('snapshot_time', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!dbError && snapshotData) {
          console.log('Loaded snapshot from database:', snapshotData.id);
          // Convert DB format to snapshot format
          setSnapshot({
            snapshot_time: snapshotData.snapshot_time,
            time_bucket_start: snapshotData.time_bucket_start,
            time_bucket_end: snapshotData.time_bucket_end,
            bucket_type: snapshotData.bucket_type,
            total_requests: snapshotData.total_requests,
            total_errors: snapshotData.total_errors,
            error_rate: snapshotData.error_rate,
            top_endpoints: snapshotData.top_endpoints as any,
            top_errors: snapshotData.top_errors as any,
            top_callers: snapshotData.top_callers as any,
            suspected_bursts: snapshotData.suspected_bursts as any,
          });
          toast.warning('Loaded from database snapshot (function unavailable)');
          return;
        }
        
        throw new Error(errorMessage);
      }

      if (data?.success === false) {
        throw new Error(data?.error || 'Failed to fetch metrics');
      }

      setSnapshot(data?.snapshot || null);
    } catch (err) {
      console.error('Failed to fetch snapshot:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load API metrics';
      toast.error('Failed to load API metrics', {
        description: errorMessage,
      });
    }
  }, [timeRange]);

  const fetchImprovements = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('api-services-router', {
        body: {
          action: 'monitor',
          path: '/improvements',
          method: 'GET',
        },
      });

      if (error) {
        console.error('Improvements fetch error:', error);
        throw error;
      }

      if (data?.success === false) {
        throw new Error(data?.error || 'Failed to fetch improvements');
      }

      setImprovements(data?.improvements || []);
    } catch (err) {
      console.error('Failed to fetch improvements:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load improvements';
      toast.error('Failed to load improvements', {
        description: errorMessage,
      });
    }
  }, []);

  const fetchAIReview = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('api-services-router', {
        body: {
          action: 'monitor',
          path: '/ai-review',
          method: 'GET',
          from: timeRange.from.toISOString(),
          to: timeRange.to.toISOString(),
        },
      });

      if (error) {
        console.error('AI Review error:', error);
        const errorMessage = (error as any)?.message || error?.toString() || 'Unknown error';
        throw new Error(errorMessage);
      }

      if (data?.success === false) {
        throw new Error(data?.error || 'Failed to generate AI review');
      }

      setAiReview(data?.review || null);
    } catch (err) {
      console.error('Failed to fetch AI review:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate AI review';
      toast.error('Failed to generate AI review', {
        description: errorMessage,
      });
    }
  }, [timeRange]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchSnapshot(), fetchImprovements()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchSnapshot, fetchImprovements]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchSnapshot(), fetchImprovements(), fetchAIReview()]);
    setRefreshing(false);
    toast.success('Refreshed');
  };

  const handleCopyJSON = (json: any) => {
    navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    toast.success('JSON copied to clipboard');
  };

  const handleDownloadJSON = (json: any, filename: string) => {
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('JSON downloaded');
  };

  const handleCreateSnapshot = async () => {
    try {
      const { error } = await supabase.functions.invoke('api-services-router', {
        body: {
          action: 'monitor',
          path: '/snapshot',
          from: timeRange.from.toISOString(),
          to: timeRange.to.toISOString(),
        },
      });

      if (error) throw error;
      toast.success('Snapshot created');
      await fetchSnapshot();
    } catch (err) {
      console.error('Failed to create snapshot:', err);
      toast.error('Failed to create snapshot');
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">API Monitor</h1>
          <p className="text-sm text-muted-foreground">
            Monitor REST API usage, errors, bursts, and track improvements
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} variant="outline" disabled={refreshing}>
            <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button onClick={handleCreateSnapshot} variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Create Snapshot
          </Button>
        </div>
      </div>

      {/* Time Range Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">From</label>
              <Input
                type="datetime-local"
                value={format(timeRange.from, "yyyy-MM-dd'T'HH:mm")}
                onChange={(e) =>
                  setTimeRange((prev) => ({ ...prev, from: new Date(e.target.value) }))
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">To</label>
              <Input
                type="datetime-local"
                value={format(timeRange.to, "yyyy-MM-dd'T'HH:mm")}
                onChange={(e) =>
                  setTimeRange((prev) => ({ ...prev, to: new Date(e.target.value) }))
                }
              />
            </div>
            <Button onClick={fetchSnapshot} className="mt-6">
              Update Range
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      {snapshot && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Requests</p>
                  <p className="text-2xl font-bold">{snapshot.total_requests.toLocaleString()}</p>
                </div>
                <Activity className="h-8 w-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Errors</p>
                  <p className="text-2xl font-bold text-red-500">
                    {snapshot.total_errors.toLocaleString()}
                  </p>
                </div>
                <XCircle className="h-8 w-8 text-red-500/30" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Error Rate</p>
                  <p
                    className={cn(
                      'text-2xl font-bold',
                      snapshot.error_rate > 5 ? 'text-red-500' : 'text-emerald-500'
                    )}
                  >
                    {snapshot.error_rate.toFixed(2)}%
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bursts Detected</p>
                  <p className="text-2xl font-bold">
                    {snapshot.suspected_bursts.length}
                  </p>
                </div>
                <Zap className="h-8 w-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="errors">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Errors
          </TabsTrigger>
          <TabsTrigger value="bursts">
            <Zap className="h-4 w-4 mr-2" />
            Bursts/Loops
          </TabsTrigger>
          <TabsTrigger value="improvements">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Improvements
          </TabsTrigger>
          <TabsTrigger value="ai-review">
            <FileText className="h-4 w-4 mr-2" />
            AI Review
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {snapshot ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Top Endpoints</CardTitle>
                  <CardDescription>Most frequently called API endpoints</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {snapshot.top_endpoints.slice(0, 20).map((endpoint, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="font-mono text-xs">
                            {endpoint.method}
                          </Badge>
                          <span className="font-mono text-sm">{endpoint.endpoint}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-muted-foreground">
                            {endpoint.count.toLocaleString()} requests
                          </span>
                          {endpoint.errors > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {endpoint.errors} errors
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Callers</CardTitle>
                  <CardDescription>IP addresses and user agents making requests</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {snapshot.top_callers.slice(0, 10).map((caller, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        <div>
                          {caller.ip && (
                            <p className="font-mono text-sm">{caller.ip}</p>
                          )}
                          {caller.user_agent && (
                            <p className="text-xs text-muted-foreground truncate max-w-md">
                              {caller.user_agent}
                            </p>
                          )}
                        </div>
                        <span className="text-sm font-medium">{caller.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No snapshot data available
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Errors Tab */}
        <TabsContent value="errors" className="space-y-4">
          {snapshot && snapshot.top_errors.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Error Breakdown</CardTitle>
                <CardDescription>Most common errors by status code</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {snapshot.top_errors.map((error, idx) => (
                    <div
                      key={idx}
                      className="p-4 border border-red-200 dark:border-red-800 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="destructive" className="text-sm">
                          {error.status}
                        </Badge>
                        <span className="text-sm font-medium">{error.count} occurrences</span>
                      </div>
                      <p className="font-mono text-sm mb-1">{error.endpoint}</p>
                      {error.sample_message && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {error.sample_message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No errors detected in this time range
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Bursts Tab */}
        <TabsContent value="bursts" className="space-y-4">
          {snapshot && snapshot.suspected_bursts.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Suspected Bursts</CardTitle>
                <CardDescription>
                  Endpoints with high request rates (possible polling loops)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {snapshot.suspected_bursts.map((burst, idx) => (
                    <div
                      key={idx}
                      className="p-4 border border-yellow-200 dark:border-yellow-800 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-mono text-sm">{burst.endpoint}</p>
                        <Badge variant="outline" className="text-yellow-600 dark:text-yellow-400">
                          {burst.requests_per_minute} req/min
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(burst.time_window), 'MMM d, yyyy HH:mm')}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No bursts detected in this time range
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Improvements Tab */}
        <TabsContent value="improvements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Improvements Log</CardTitle>
              <CardDescription>
                Tracked optimizations with expected vs actual impact
              </CardDescription>
            </CardHeader>
            <CardContent>
              {improvements.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No improvements logged yet
                </p>
              ) : (
                <div className="space-y-4">
                  {improvements.map((imp) => (
                    <div
                      key={imp.id}
                      className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold">{imp.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{imp.description}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {format(new Date(imp.shipped_at), 'MMM d, yyyy')}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Expected Δ Requests/Day</p>
                          <p className="font-medium">
                            {imp.expected_delta_requests_per_day !== null &&
                            imp.expected_delta_requests_per_day !== undefined
                              ? imp.expected_delta_requests_per_day > 0
                                ? `+${imp.expected_delta_requests_per_day}`
                                : imp.expected_delta_requests_per_day
                              : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Actual Δ Requests/Day</p>
                          <p
                            className={cn(
                              'font-medium',
                              imp.actual_delta_requests_per_day !== null &&
                              imp.actual_delta_requests_per_day !== undefined
                                ? imp.actual_delta_requests_per_day < 0
                                  ? 'text-emerald-500'
                                  : 'text-red-500'
                                : ''
                            )}
                          >
                            {imp.actual_delta_requests_per_day !== null &&
                            imp.actual_delta_requests_per_day !== undefined
                              ? imp.actual_delta_requests_per_day > 0
                                ? `+${imp.actual_delta_requests_per_day}`
                                : imp.actual_delta_requests_per_day
                              : 'Computing...'}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Actual Δ Per User/Day</p>
                          <p className="font-medium">
                            {imp.actual_delta_requests_per_user_per_day !== null &&
                            imp.actual_delta_requests_per_user_per_day !== undefined
                              ? imp.actual_delta_requests_per_user_per_day > 0
                                ? `+${imp.actual_delta_requests_per_user_per_day.toFixed(2)}`
                                : imp.actual_delta_requests_per_user_per_day.toFixed(2)
                              : '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Review Tab */}
        <TabsContent value="ai-review" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Review</CardTitle>
              <CardDescription>
                Generate a JSON prompt for AI tools to analyze and fix API issues
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    if (!aiReview) {
                      fetchAIReview();
                    } else {
                      handleCopyJSON(aiReview);
                    }
                  }}
                  variant="outline"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {aiReview ? 'Copy JSON' : 'Generate Review'}
                </Button>
                {aiReview && (
                  <Button
                    onClick={() => handleDownloadJSON(aiReview, 'api-review.json')}
                    variant="outline"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download JSON
                  </Button>
                )}
              </div>

              {aiReview && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Hypotheses</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {aiReview.hypotheses.map((h, idx) => (
                        <li key={idx}>{h}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Recommended Changes</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {aiReview.recommended_next_changes.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Code Pointers</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm font-mono">
                      {aiReview.code_pointers.map((p, idx) => (
                        <li key={idx}>{p}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(aiReview, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

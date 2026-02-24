/**
 * Cost Analysis Dashboard
 *
 * Platform admin page for analyzing costs per organization, tier, and model
 * Shows token usage breakdown by Claude Haiku 4.5, Claude Sonnet 4, and Gemini
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Video,
  Zap,
  HardDrive,
  ArrowLeft,
  RefreshCw,
  Loader2,
  BarChart3,
  PieChart,
  Calculator,
  AlertCircle,
  Percent,
  Coins,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import {
  getCostAnalysisSummary,
  getOrganizationCostAnalysis,
  estimateCosts,
  calculateMarginPricing,
  getAICostEvents,
} from '@/lib/services/costAnalysisService';
import type {
  CostAnalysisSummary,
  OrganizationCostAnalysis,
  CostEstimationInput,
  CostEstimationResult,
  MarginCalculation,
  AICostEvent,
} from '@/lib/types/costAnalysis';
import { formatCost, formatTokens } from '@/lib/types/costAnalysis';

const CURRENCY = 'GBP'; // Default to GBP
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';

export default function CostAnalysis() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();

  const [summary, setSummary] = useState<CostAnalysisSummary | null>(null);
  const [lifetimeSummary, setLifetimeSummary] = useState<CostAnalysisSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingLifetime, setIsLoadingLifetime] = useState(false);
  const [viewMode, setViewMode] = useState<'period' | 'lifetime'>('period');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    // Default to current month
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });

  // Calculate period end
  const periodEnd = (() => {
    const start = new Date(selectedPeriod);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return end.toISOString().split('T')[0];
  })();

  useEffect(() => {
    loadSummary();
  }, [selectedPeriod]);

  useEffect(() => {
    if (viewMode === 'lifetime') {
      loadLifetimeSummary();
    }
  }, [viewMode]);

  const loadSummary = async () => {
    try {
      setIsLoading(true);
      const data = await getCostAnalysisSummary(selectedPeriod, periodEnd);
      setSummary(data);
    } catch (error) {
      console.error('Error loading cost analysis:', error);
      toast.error('Failed to load cost analysis');
    } finally {
      setIsLoading(false);
    }
  };

  const loadLifetimeSummary = async () => {
    try {
      setIsLoadingLifetime(true);
      // Get all-time summary (from beginning of time)
      const data = await getCostAnalysisSummary('2020-01-01', new Date().toISOString().split('T')[0]);
      setLifetimeSummary(data);
    } catch (error) {
      console.error('Error loading lifetime cost analysis:', error);
      toast.error('Failed to load lifetime cost analysis');
    } finally {
      setIsLoadingLifetime(false);
    }
  };

  // Access control
  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">You don't have permission to access this page.</p>
        <Button variant="outline" onClick={() => navigate('/platform')}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-6 space-y-6 max-w-7xl">
      {/* Back Button */}
      <BackToPlatform />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Cost Analysis</h1>
            <p className="text-muted-foreground">
              Analyze costs per organization, tier, and AI model
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 border rounded-md p-1">
            <Button
              variant={viewMode === 'period' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('period')}
            >
              Period
            </Button>
            <Button
              variant={viewMode === 'lifetime' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('lifetime')}
            >
              Lifetime
            </Button>
          </div>
          {viewMode === 'period' && (
            <input
              type="month"
              value={selectedPeriod.substring(0, 7)}
              onChange={(e) => setSelectedPeriod(`${e.target.value}-01`)}
              className="px-3 py-2 border rounded-md"
            />
          )}
          <Button variant="outline" onClick={viewMode === 'period' ? loadSummary : loadLifetimeSummary} disabled={isLoading || isLoadingLifetime}>
            <RefreshCw className={cn('h-4 w-4', (isLoading || isLoadingLifetime) && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {(isLoading || isLoadingLifetime) ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (viewMode === 'lifetime' ? lifetimeSummary : summary) ? (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="models">By Model</TabsTrigger>
            <TabsTrigger value="tiers">By Tier</TabsTrigger>
            <TabsTrigger value="calculator">Margin Calculator</TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {viewMode === 'lifetime' && (
              <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-600" />
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Showing lifetime usage to date (all-time cumulative)
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <SummaryCard
                title={viewMode === 'lifetime' ? 'Total Cost (All Time)' : 'Total Cost'}
                value={formatCost((viewMode === 'lifetime' ? lifetimeSummary : summary)!.total_cost, CURRENCY)}
                icon={DollarSign}
                trend={(viewMode === 'lifetime' ? lifetimeSummary : summary)!.total_cost > 0 ? 'up' : 'neutral'}
                color="text-blue-600"
              />
              <SummaryCard
                title={viewMode === 'lifetime' ? 'Total Revenue (All Time)' : 'Total Revenue'}
                value={formatCost((viewMode === 'lifetime' ? lifetimeSummary : summary)!.total_revenue, CURRENCY)}
                icon={TrendingUp}
                trend="up"
                color="text-emerald-600"
              />
              <SummaryCard
                title="Avg Margin"
                value={`${(viewMode === 'lifetime' ? lifetimeSummary : summary)!.average_margin_percent.toFixed(1)}%`}
                icon={BarChart3}
                trend={(viewMode === 'lifetime' ? lifetimeSummary : summary)!.average_margin_percent > 70 ? 'up' : 'down'}
                color={
                  (viewMode === 'lifetime' ? lifetimeSummary : summary)!.average_margin_percent > 70
                    ? 'text-emerald-600'
                    : (viewMode === 'lifetime' ? lifetimeSummary : summary)!.average_margin_percent > 50
                    ? 'text-amber-600'
                    : 'text-red-600'
                }
              />
              <SummaryCard
                title="Cost/Meeting"
                value={formatCost((viewMode === 'lifetime' ? lifetimeSummary : summary)!.average_cost_per_meeting, CURRENCY)}
                icon={Video}
                trend="neutral"
                color="text-purple-600"
              />
            </div>

            {/* Credit-Based Margin Cards */}
            {(() => {
              const s = (viewMode === 'lifetime' ? lifetimeSummary : summary)!;
              const marginPct = s.credits_margin_pct;
              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SummaryCard
                    title={`Provider Cost (USD)${s.has_estimated_rows ? ' *' : ''}`}
                    value={`$${s.total_provider_cost_usd.toFixed(4)}`}
                    icon={DollarSign}
                    trend="neutral"
                    color="text-orange-600"
                  />
                  <SummaryCard
                    title={`Credits Charged${s.has_estimated_rows ? ' *' : ''}`}
                    value={s.total_credits_charged.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    icon={Coins}
                    trend="neutral"
                    color="text-indigo-600"
                  />
                  <SummaryCard
                    title={`Credits Margin${s.has_estimated_rows ? ' (est.)' : ''}`}
                    value={marginPct != null ? `${marginPct.toFixed(1)}%` : 'N/A'}
                    icon={Percent}
                    trend={marginPct != null ? (marginPct > 70 ? 'up' : marginPct > 50 ? 'neutral' : 'down') : 'neutral'}
                    color={
                      marginPct == null
                        ? 'text-muted-foreground'
                        : marginPct > 70
                        ? 'text-emerald-600'
                        : marginPct > 50
                        ? 'text-amber-600'
                        : 'text-red-600'
                    }
                  />
                </div>
              );
            })()}
            {(viewMode === 'lifetime' ? lifetimeSummary : summary)!.has_estimated_rows && (
              <p className="text-xs text-muted-foreground">
                * Some events predate the <code>provider_cost_usd</code> column. Values marked with * include only rows where the column is populated; older rows are excluded from this calculation.
              </p>
            )}

            {/* Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>AI Costs</CardTitle>
                  <CardDescription>Total AI processing costs</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{formatCost((viewMode === 'lifetime' ? lifetimeSummary : summary)!.total_ai_cost, CURRENCY)}</div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {(viewMode === 'lifetime' ? lifetimeSummary : summary)!.total_meetings > 0
                      ? `${formatCost((viewMode === 'lifetime' ? lifetimeSummary : summary)!.total_ai_cost / (viewMode === 'lifetime' ? lifetimeSummary : summary)!.total_meetings, CURRENCY)} per meeting`
                      : 'No meetings'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Infrastructure Costs</CardTitle>
                  <CardDescription>Storage and database costs</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {formatCost((viewMode === 'lifetime' ? lifetimeSummary : summary)!.total_infrastructure_cost, CURRENCY)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Storage + Database hosting
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Usage Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Usage Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Organizations</p>
                    <p className="text-2xl font-bold">{(viewMode === 'lifetime' ? lifetimeSummary : summary)!.total_organizations}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Meetings</p>
                    <p className="text-2xl font-bold">{(viewMode === 'lifetime' ? lifetimeSummary : summary)!.total_meetings.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Active Users</p>
                    <p className="text-2xl font-bold">{(viewMode === 'lifetime' ? lifetimeSummary : summary)!.total_active_users}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* By Model Tab */}
          <TabsContent value="models" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Token Usage by Model</CardTitle>
                <CardDescription>Breakdown of AI costs by model and provider</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(viewMode === 'lifetime' ? lifetimeSummary : summary)!.model_breakdown.length > 0 ? (
                    (viewMode === 'lifetime' ? lifetimeSummary : summary)!.model_breakdown.map((model, idx) => {
                      const totalTokens = model.input_tokens + model.output_tokens;
                      const currentSummary = viewMode === 'lifetime' ? lifetimeSummary! : summary!;
                      const percentage =
                        currentSummary.total_ai_cost > 0
                          ? (model.estimated_cost / currentSummary.total_ai_cost) * 100
                          : 0;

                      return (
                        <div key={idx} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <h4 className="font-semibold">
                                {model.model} ({model.provider})
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {formatTokens(model.input_tokens)} in / {formatTokens(model.output_tokens)} out
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-xl font-bold">{formatCost(model.estimated_cost, CURRENCY)}</div>
                              <div className="text-sm text-muted-foreground">{percentage.toFixed(1)}%</div>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t text-xs">
                            <div>
                              <p className="text-muted-foreground">API calls</p>
                              <p className="font-medium">{model.call_count.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Provider Cost (USD){model.has_estimated_rows ? ' *' : ''}
                              </p>
                              <p className="font-medium">
                                {model.total_provider_cost_usd != null
                                  ? `$${model.total_provider_cost_usd.toFixed(4)}`
                                  : 'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Credits Charged{model.has_estimated_rows ? ' *' : ''}
                              </p>
                              <p className="font-medium">
                                {model.total_credits_charged != null
                                  ? model.total_credits_charged.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                  : 'N/A'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No AI usage data available for this period
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* By Tier Tab */}
          <TabsContent value="tiers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Cost Analysis by Tier</CardTitle>
                <CardDescription>Average costs and margins per subscription tier</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(viewMode === 'lifetime' ? lifetimeSummary : summary)!.tier_breakdown.length > 0 ? (
                    (viewMode === 'lifetime' ? lifetimeSummary : summary)!.tier_breakdown.map((tier, idx) => (
                      <div key={idx} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h4 className="font-semibold text-lg">{tier.tier_name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {tier.organization_count} organization{tier.organization_count !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <Badge
                            variant={
                              tier.average_margin_percent > 70
                                ? 'default'
                                : tier.average_margin_percent > 50
                                ? 'secondary'
                                : 'destructive'
                            }
                          >
                            {tier.average_margin_percent.toFixed(1)}% margin
                          </Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Total Cost</p>
                            <p className="font-semibold">{formatCost(tier.total_cost, CURRENCY)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Total Revenue</p>
                            <p className="font-semibold">{formatCost(tier.total_revenue, CURRENCY)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Avg Cost/Org</p>
                            <p className="font-semibold">{formatCost(tier.average_cost_per_org, CURRENCY)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Meetings</p>
                            <p className="font-semibold">{tier.total_meetings.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No tier data available for this period
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Margin Calculator Tab */}
          <TabsContent value="calculator">
            <MarginCalculator />
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="audit">
            <AuditLogsView />
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No cost data available for this period</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Audit Logs View Component
// ============================================================================

function AuditLogsView() {
  const [events, setEvents] = useState<AICostEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start: start.toISOString().split('T')[0],
      end: now.toISOString().split('T')[0],
    };
  });

  useEffect(() => {
    loadAuditLogs();
  }, [selectedOrg, dateRange]);

  const loadAuditLogs = async () => {
    try {
      setIsLoading(true);
      
      let query = supabase
        .from('ai_cost_events')
        .select(`
          id, org_id, user_id, provider, model, feature,
          input_tokens, output_tokens, estimated_cost,
          provider_cost_usd, credits_charged,
          metadata, created_at,
          organization:organizations (
            id,
            name
          ),
          user:profiles!ai_cost_events_user_id_fkey (
            id,
            email
          )
        `)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (selectedOrg) {
        query = query.eq('org_id', selectedOrg);
      }

      if (dateRange.start) {
        query = query.gte('created_at', dateRange.start);
      }
      if (dateRange.end) {
        query = query.lte('created_at', `${dateRange.end}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading audit logs:', error);
        toast.error('Failed to load audit logs');
        return;
      }

      setEvents(data || []);
    } catch (error) {
      console.error('Error loading audit logs:', error);
      toast.error('Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  // Get unique organizations for filter
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    supabase
      .from('organizations')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        if (data) setOrgs(data);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cost Event Audit Logs</CardTitle>
          <CardDescription>
            Detailed log of all AI API calls with token usage and costs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Organization</label>
              <select
                value={selectedOrg || ''}
                onChange={(e) => setSelectedOrg(e.target.value || null)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">All Organizations</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Start Date</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">End Date</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Total Events</p>
              <p className="text-2xl font-bold">{events.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Cost</p>
              <p className="text-2xl font-bold">
                {formatCost(
                  events.reduce((sum, e) => sum + (e.estimated_cost || 0), 0),
                  CURRENCY
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Input Tokens</p>
              <p className="text-2xl font-bold">
                {formatTokens(events.reduce((sum, e) => sum + (e.input_tokens || 0), 0))}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Output Tokens</p>
              <p className="text-2xl font-bold">
                {formatTokens(events.reduce((sum, e) => sum + (e.output_tokens || 0), 0))}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Provider Cost (USD)</p>
              <p className="text-2xl font-bold">
                ${events
                  .reduce((sum, e) => sum + ((e as any).provider_cost_usd || 0), 0)
                  .toFixed(4)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Credits Charged</p>
              <p className="text-2xl font-bold">
                {events
                  .reduce((sum, e) => sum + ((e as any).credits_charged || 0), 0)
                  .toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Cost Events</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No cost events found for the selected filters
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Timestamp</th>
                    <th className="text-left p-2">Organization</th>
                    <th className="text-left p-2">User</th>
                    <th className="text-left p-2">Provider</th>
                    <th className="text-left p-2">Model</th>
                    <th className="text-left p-2">Feature</th>
                    <th className="text-right p-2">Input Tokens</th>
                    <th className="text-right p-2">Output Tokens</th>
                    <th className="text-right p-2">Cost</th>
                    <th className="text-right p-2">Provider Cost (USD)</th>
                    <th className="text-right p-2">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event: any) => (
                    <tr key={event.id} className="border-b hover:bg-muted/50">
                      <td className="p-2">
                        {new Date(event.created_at).toLocaleString()}
                      </td>
                      <td className="p-2">
                        {event.organization?.name || 'Unknown'}
                      </td>
                      <td className="p-2">
                        {event.user?.email || 'Unknown'}
                      </td>
                      <td className="p-2">
                        <Badge variant="outline">{event.provider}</Badge>
                      </td>
                      <td className="p-2 font-mono text-xs">{event.model}</td>
                      <td className="p-2">
                        {event.feature ? (
                          <Badge variant="secondary">{event.feature}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-right">{formatTokens(event.input_tokens)}</td>
                      <td className="p-2 text-right">{formatTokens(event.output_tokens)}</td>
                      <td className="p-2 text-right font-semibold">
                        {formatCost(event.estimated_cost || 0, CURRENCY)}
                      </td>
                      <td className="p-2 text-right text-xs">
                        {event.provider_cost_usd != null ? (
                          `$${(event.provider_cost_usd as number).toFixed(6)}`
                        ) : (
                          <span className="text-muted-foreground">est.</span>
                        )}
                      </td>
                      <td className="p-2 text-right text-xs">
                        {event.credits_charged != null ? (
                          (event.credits_charged as number).toLocaleString(undefined, { maximumFractionDigits: 4 })
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Components
// ============================================================================

interface SummaryCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  trend: 'up' | 'down' | 'neutral';
  color: string;
}

function SummaryCard({ title, value, icon: Icon, trend, color }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={cn('text-2xl font-bold mt-1', color)}>{value}</p>
          </div>
          <div className={cn('p-3 rounded-lg', color.replace('text-', 'bg-').replace('-600', '-100'))}>
            <Icon className={cn('h-6 w-6', color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Margin Calculator Component
function MarginCalculator() {
  const [targetMargin, setTargetMargin] = useState(70);
  const [meetings, setMeetings] = useState(100);
  const [copilotConvos, setCopilotConvos] = useState(10);
  const [estimation, setEstimation] = useState<CostEstimationInput | null>(null);
  const [result, setResult] = useState<CostEstimationResult | null>(null);
  const [marginCalc, setMarginCalc] = useState<MarginCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const calculate = useCallback(async () => {
    setIsCalculating(true);
    try {
      const input: CostEstimationInput = {
        meetings_per_month: meetings,
        copilot_conversations_per_month: copilotConvos,
      };
      setEstimation(input);
      const est = await estimateCosts(input);
      setResult(est);
      const margin = await calculateMarginPricing(targetMargin, est.total_cost);
      setMarginCalc(margin);
    } catch (error) {
      console.error('Error calculating:', error);
      toast.error('Failed to calculate costs');
    } finally {
      setIsCalculating(false);
    }
  }, [meetings, copilotConvos, targetMargin]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cost & Margin Calculator</CardTitle>
          <CardDescription>
            Estimate costs and calculate recommended pricing based on target margin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Target Margin (%)</label>
              <input
                type="number"
                value={targetMargin}
                onChange={(e) => setTargetMargin(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                min={0}
                max={100}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Meetings/Month</label>
              <input
                type="number"
                value={meetings}
                onChange={(e) => setMeetings(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                min={0}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Copilot Conversations/Month</label>
              <input
                type="number"
                value={copilotConvos}
                onChange={(e) => setCopilotConvos(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                min={0}
              />
            </div>
          </div>
          <Button onClick={calculate} disabled={isCalculating}>
            {isCalculating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Calculating...
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4 mr-2" />
                Calculate
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && marginCalc && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span>Meeting Processing:</span>
                <span className="font-semibold">{formatCost(result.meeting_processing_cost, CURRENCY)}</span>
              </div>
              <div className="flex justify-between">
                <span>Copilot:</span>
                <span className="font-semibold">{formatCost(result.copilot_cost, CURRENCY)}</span>
              </div>
              <div className="flex justify-between">
                <span>Infrastructure:</span>
                <span className="font-semibold">{formatCost(result.total_infrastructure_cost, CURRENCY)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Total Cost:</span>
                <span>{formatCost(result.total_cost, CURRENCY)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing Recommendation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span>Estimated Cost:</span>
                <span className="font-semibold">{formatCost(marginCalc.estimated_cost_per_month, CURRENCY)}</span>
              </div>
              <div className="flex justify-between">
                <span>Target Margin:</span>
                <span className="font-semibold">{marginCalc.target_margin_percent}%</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold text-lg">
                <span>Recommended Price:</span>
                <span className="text-emerald-600">{formatCost(marginCalc.recommended_price, CURRENCY)}/mo</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Actual Margin:</span>
                <span>{marginCalc.actual_margin_percent.toFixed(1)}%</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}


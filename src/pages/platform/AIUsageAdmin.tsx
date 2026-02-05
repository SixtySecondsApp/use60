/**
 * AI Usage Admin Dashboard
 *
 * Platform admin page for comprehensive AI usage tracking and model configuration
 * - Overview of platform-wide AI usage and costs
 * - Usage breakdown by feature, organization, user, and model
 * - Model configuration with fallbacks
 * - Live model sync from providers
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  AlertCircle,
  Cpu,
  Building2,
  Users,
  Layers,
  Settings,
  Zap,
  TrendingUp,
  DollarSign,
  Activity,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { toast } from 'sonner';

// Services
import {
  getAvailableModels,
  getFeatureConfigs,
  updateFeatureConfig,
  syncModelsFromProviders,
  getLastSyncTime,
} from '@/lib/services/aiModelService';
import {
  getPlatformUsageSummary,
  getTopOrgsByUsage,
  getTopUsersByUsage,
  getUsageByFeature,
} from '@/lib/services/aiUsageService';

// Types
import type {
  AIModel,
  AIFeatureConfig,
  AIUsageSummary,
  AIUsageFilters,
  AIProvider,
} from '@/lib/types/aiModels';
import {
  AI_PROVIDERS,
  formatTokens,
  formatCost,
  getProviderColor,
  getTimeRangeDates,
  DEFAULT_TIME_RANGES,
} from '@/lib/types/aiModels';

export default function AIUsageAdmin() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'this_month'>('30d');
  const [summary, setSummary] = useState<AIUsageSummary | null>(null);
  const [models, setModels] = useState<AIModel[]>([]);
  const [featureConfigs, setFeatureConfigs] = useState<AIFeatureConfig[]>([]);
  const [topOrgs, setTopOrgs] = useState<Array<{ org_id: string; org_name: string; total_calls: number; total_cost: number }>>([]);
  const [topUsers, setTopUsers] = useState<Array<{ user_id: string; user_email: string; user_name: string; total_calls: number; total_cost: number }>>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Load data on mount and time range change
  useEffect(() => {
    if (isPlatformAdmin) {
      loadData();
    }
  }, [isPlatformAdmin, timeRange]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const { startDate, endDate } = getTimeRangeDates(timeRange);
      const filters: AIUsageFilters = { startDate, endDate };

      const [summaryData, modelsData, configsData, orgsData, usersData, syncTime] = await Promise.all([
        getPlatformUsageSummary(filters),
        getAvailableModels(),
        getFeatureConfigs(),
        getTopOrgsByUsage(filters, 10),
        getTopUsersByUsage(filters, 10),
        getLastSyncTime(),
      ]);

      setSummary(summaryData);
      setModels(modelsData);
      setFeatureConfigs(configsData);
      setTopOrgs(orgsData);
      setTopUsers(usersData);
      setLastSyncTime(syncTime);
    } catch (error) {
      console.error('Error loading AI usage data:', error);
      toast.error('Failed to load AI usage data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncModels = async () => {
    try {
      setIsSyncing(true);
      const result = await syncModelsFromProviders();

      if (result.success) {
        toast.success(`Synced ${result.totalModels} models from providers`);
        // Reload models
        const modelsData = await getAvailableModels();
        setModels(modelsData);
        setLastSyncTime(result.syncedAt);
      } else {
        toast.error('Failed to sync some providers');
      }
    } catch (error) {
      console.error('Error syncing models:', error);
      toast.error('Failed to sync models');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateFeatureModel = async (
    featureKey: string,
    field: 'primary_model_id' | 'fallback_model_id',
    modelId: string | null
  ) => {
    try {
      await updateFeatureConfig(featureKey, { [field]: modelId });
      toast.success('Feature configuration updated');
      // Reload configs
      const configsData = await getFeatureConfigs();
      setFeatureConfigs(configsData);
    } catch (error) {
      console.error('Error updating feature config:', error);
      toast.error('Failed to update feature configuration');
    }
  };

  const handleToggleFeature = async (featureKey: string, isEnabled: boolean) => {
    try {
      await updateFeatureConfig(featureKey, { is_enabled: isEnabled });
      toast.success(`Feature ${isEnabled ? 'enabled' : 'disabled'}`);
      const configsData = await getFeatureConfigs();
      setFeatureConfigs(configsData);
    } catch (error) {
      console.error('Error toggling feature:', error);
      toast.error('Failed to update feature');
    }
  };

  // Access control
  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
        <Button variant="outline" onClick={() => navigate('/platform')}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/platform')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">AI Usage & Model Configuration</h1>
            <p className="text-muted-foreground">
              Track usage across features, organizations, and configure AI models
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as any)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEFAULT_TIME_RANGES.filter((r) => r.value !== 'custom' && r.value !== 'today' && r.value !== 'last_month').map((range) => (
                <SelectItem key={range.value} value={range.value}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          <Button onClick={handleSyncModels} disabled={isSyncing}>
            {isSyncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Sync Models
          </Button>
        </div>
      </div>

      {/* Last sync info */}
      {lastSyncTime && (
        <p className="text-sm text-muted-foreground">
          Models last synced: {new Date(lastSyncTime).toLocaleString()}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">
              <Activity className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="features">
              <Layers className="h-4 w-4 mr-2" />
              By Feature
            </TabsTrigger>
            <TabsTrigger value="orgs">
              <Building2 className="h-4 w-4 mr-2" />
              By Organization
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-2" />
              By User
            </TabsTrigger>
            <TabsTrigger value="config">
              <Settings className="h-4 w-4 mr-2" />
              Model Config
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <SummaryCard
                title="Total API Calls"
                value={summary?.total_calls.toLocaleString() || '0'}
                icon={Activity}
                color="text-blue-600"
              />
              <SummaryCard
                title="Total Cost"
                value={formatCost(summary?.total_cost || 0)}
                icon={DollarSign}
                color="text-emerald-600"
              />
              <SummaryCard
                title="Input Tokens"
                value={formatTokens(summary?.total_input_tokens || 0)}
                icon={TrendingUp}
                color="text-purple-600"
              />
              <SummaryCard
                title="Output Tokens"
                value={formatTokens(summary?.total_output_tokens || 0)}
                icon={Cpu}
                color="text-orange-600"
              />
            </div>

            {/* Provider Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Usage by Provider</CardTitle>
                <CardDescription>Cost and call distribution across AI providers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {summary && Object.entries(summary.by_provider).length > 0 ? (
                    Object.entries(summary.by_provider).map(([provider, data]) => {
                      const percentage = summary.total_cost > 0
                        ? (data.cost / summary.total_cost) * 100
                        : 0;

                      return (
                        <div key={provider} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: getProviderColor(provider as AIProvider) }}
                              />
                              <span className="font-medium">
                                {AI_PROVIDERS[provider as AIProvider]?.name || provider}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-semibold">{formatCost(data.cost)}</span>
                              <span className="text-muted-foreground text-sm ml-2">
                                ({data.calls.toLocaleString()} calls)
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: getProviderColor(provider as AIProvider),
                              }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No usage data available for this period
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Daily Trend */}
            {summary && summary.daily_trend.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Daily Usage Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48 flex items-end gap-1">
                    {summary.daily_trend.slice(-30).map((day, idx) => {
                      const maxCost = Math.max(...summary.daily_trend.map((d) => d.cost));
                      const height = maxCost > 0 ? (day.cost / maxCost) * 100 : 0;

                      return (
                        <div
                          key={day.date}
                          className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer group relative"
                          style={{ height: `${Math.max(height, 2)}%` }}
                          title={`${day.date}: ${formatCost(day.cost)} (${day.calls} calls)`}
                        >
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                            <div className="bg-popover border rounded-md shadow-lg p-2 text-xs whitespace-nowrap">
                              <p className="font-medium">{day.date}</p>
                              <p>{formatCost(day.cost)}</p>
                              <p className="text-muted-foreground">{day.calls} calls</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* By Feature Tab */}
          <TabsContent value="features" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Usage by Feature</CardTitle>
                <CardDescription>AI usage breakdown across platform features</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary && Object.entries(summary.by_feature).length > 0 ? (
                      Object.entries(summary.by_feature)
                        .sort(([, a], [, b]) => b.cost - a.cost)
                        .map(([featureKey, data]) => {
                          const percentage = summary.total_cost > 0
                            ? (data.cost / summary.total_cost) * 100
                            : 0;

                          return (
                            <TableRow key={featureKey}>
                              <TableCell className="font-medium">{data.feature_name}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{data.category}</Badge>
                              </TableCell>
                              <TableCell className="text-right">{data.calls.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{formatCost(data.cost)}</TableCell>
                              <TableCell className="text-right">{percentage.toFixed(1)}%</TableCell>
                            </TableRow>
                          );
                        })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No feature usage data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* By Organization Tab */}
          <TabsContent value="orgs" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Organizations by Usage</CardTitle>
                <CardDescription>Organizations with highest AI usage and costs</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead className="text-right">API Calls</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Avg Cost/Call</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topOrgs.length > 0 ? (
                      topOrgs.map((org, idx) => (
                        <TableRow key={org.org_id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-sm">#{idx + 1}</span>
                              <span className="font-medium">{org.org_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{org.total_calls.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCost(org.total_cost)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {org.total_calls > 0 ? formatCost(org.total_cost / org.total_calls) : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No organization usage data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* By User Tab */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Users by Usage</CardTitle>
                <CardDescription>Users with highest AI usage and costs</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">API Calls</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Avg Cost/Call</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topUsers.length > 0 ? (
                      topUsers.map((user, idx) => (
                        <TableRow key={user.user_id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-sm">#{idx + 1}</span>
                              <div>
                                <p className="font-medium">{user.user_name}</p>
                                <p className="text-sm text-muted-foreground">{user.user_email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{user.total_calls.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCost(user.total_cost)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {user.total_calls > 0 ? formatCost(user.total_cost / user.total_calls) : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No user usage data available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Model Config Tab */}
          <TabsContent value="config" className="space-y-6">
            {/* Available Models */}
            <Card>
              <CardHeader>
                <CardTitle>Available Models</CardTitle>
                <CardDescription>
                  {models.length} models synced from {Object.keys(AI_PROVIDERS).length} providers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(AI_PROVIDERS).map(([provider, info]) => {
                    const providerModels = models.filter((m) => m.provider === provider);

                    return (
                      <div key={provider} className="border rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: info.color }}
                          />
                          <h4 className="font-semibold">{info.name}</h4>
                          <Badge variant="secondary">{providerModels.length}</Badge>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {providerModels.map((model) => (
                            <div
                              key={model.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="truncate" title={model.model_id}>
                                {model.display_name}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                ${model.input_cost_per_million}/${model.output_cost_per_million}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Feature Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Feature Model Configuration</CardTitle>
                <CardDescription>Configure which models power each platform feature</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Primary Model</TableHead>
                      <TableHead>Fallback Model</TableHead>
                      <TableHead className="text-center">Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {featureConfigs.map((config) => (
                      <TableRow key={config.feature_key}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{config.display_name}</p>
                            <p className="text-xs text-muted-foreground">{config.feature_key}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{config.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <ModelSelector
                            models={models}
                            value={config.primary_model_id}
                            onChange={(modelId) =>
                              handleUpdateFeatureModel(config.feature_key, 'primary_model_id', modelId)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <ModelSelector
                            models={models}
                            value={config.fallback_model_id}
                            onChange={(modelId) =>
                              handleUpdateFeatureModel(config.feature_key, 'fallback_model_id', modelId)
                            }
                            placeholder="No fallback"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={config.is_enabled}
                            onCheckedChange={(checked) =>
                              handleToggleFeature(config.feature_key, checked)
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ============================================================================
// Summary Card Component
// ============================================================================

function SummaryCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <Icon className={cn('h-8 w-8', color)} />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Model Selector Component
// ============================================================================

function ModelSelector({
  models,
  value,
  onChange,
  placeholder = 'Select model',
}: {
  models: AIModel[];
  value: string | null;
  onChange: (modelId: string | null) => void;
  placeholder?: string;
}) {
  const selectedModel = models.find((m) => m.id === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between text-left font-normal">
          <span className="truncate">
            {selectedModel ? selectedModel.display_name : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 max-h-80 overflow-y-auto">
        <DropdownMenuItem onClick={() => onChange(null)}>
          <X className="h-4 w-4 mr-2 text-muted-foreground" />
          None
        </DropdownMenuItem>
        {Object.entries(AI_PROVIDERS).map(([provider, info]) => {
          const providerModels = models.filter((m) => m.provider === provider);
          if (providerModels.length === 0) return null;

          return (
            <div key={provider}>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: info.color }}
                />
                {info.name}
              </div>
              {providerModels.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => onChange(model.id)}
                >
                  {value === model.id && <Check className="h-4 w-4 mr-2" />}
                  <span className={value === model.id ? '' : 'ml-6'}>{model.display_name}</span>
                </DropdownMenuItem>
              ))}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

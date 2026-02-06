/**
 * Organization AI Usage Settings Component
 *
 * Shows organization's AI usage breakdown and allows model overrides
 * - Only shows features the org has actually used
 * - Org admins can override model selection per feature
 * - Shows cost breakdown and trends
 */

import { useState, useEffect } from 'react';
import {
  Loader2,
  Activity,
  DollarSign,
  Cpu,
  TrendingUp,
  Settings,
  Check,
  X,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

// Services
import {
  getAvailableModels,
  getEffectiveAIConfig,
  upsertOrgAIConfig,
  deleteOrgAIConfig,
} from '@/lib/services/aiModelService';
import { getOrgUsageSummary } from '@/lib/services/aiUsageService';

// Types
import type {
  AIModel,
  EffectiveAIConfig,
  OrgUsageSummary,
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

interface OrgAIUsageProps {
  orgId: string;
  orgName?: string;
  canManage?: boolean; // Whether user can change model overrides
}

export function OrgAIUsage({ orgId, orgName, canManage = false }: OrgAIUsageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'this_month'>('30d');
  const [summary, setSummary] = useState<OrgUsageSummary | null>(null);
  const [effectiveConfig, setEffectiveConfig] = useState<EffectiveAIConfig[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    loadData();
  }, [orgId, timeRange]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const { startDate, endDate } = getTimeRangeDates(timeRange);

      const [summaryData, configData, modelsData] = await Promise.all([
        getOrgUsageSummary(orgId, { startDate, endDate }),
        getEffectiveAIConfig(orgId),
        getAvailableModels(),
      ]);

      setSummary(summaryData);
      setEffectiveConfig(configData);
      setModels(modelsData);
    } catch (error) {
      console.error('Error loading org AI usage:', error);
      toast.error('Failed to load AI usage data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOverrideModel = async (featureKey: string, modelId: string | null) => {
    try {
      await upsertOrgAIConfig(orgId, featureKey, { model_id: modelId });
      toast.success('Model override saved');
      // Reload config
      const configData = await getEffectiveAIConfig(orgId);
      setEffectiveConfig(configData);
    } catch (error) {
      console.error('Error saving model override:', error);
      toast.error('Failed to save model override');
    }
  };

  const handleResetToDefault = async (featureKey: string) => {
    try {
      await deleteOrgAIConfig(orgId, featureKey);
      toast.success('Reset to default model');
      // Reload config
      const configData = await getEffectiveAIConfig(orgId);
      setEffectiveConfig(configData);
    } catch (error) {
      console.error('Error resetting model:', error);
      toast.error('Failed to reset model');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Filter to only show features the org has used
  const usedFeatures = effectiveConfig.filter((config) =>
    summary?.features_used.includes(config.feature_key)
  );

  return (
    <div className="space-y-6">
      {/* Header with time range selector */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">AI Usage</h3>
          <p className="text-sm text-muted-foreground">
            Track your organization&apos;s AI usage and costs
          </p>
        </div>
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
      </div>

      {summary ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SummaryCard
              title="API Calls"
              value={summary.total_calls.toLocaleString()}
              icon={Activity}
              color="text-blue-600"
            />
            <SummaryCard
              title="Total Cost"
              value={formatCost(summary.total_cost)}
              icon={DollarSign}
              color="text-emerald-600"
            />
            <SummaryCard
              title="Input Tokens"
              value={formatTokens(summary.total_input_tokens)}
              icon={TrendingUp}
              color="text-purple-600"
            />
            <SummaryCard
              title="Output Tokens"
              value={formatTokens(summary.total_output_tokens)}
              icon={Cpu}
              color="text-orange-600"
            />
          </div>

          {/* Provider Breakdown */}
          {Object.keys(summary.by_provider).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Usage by Provider</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(summary.by_provider).map(([provider, data]) => {
                    const percentage = summary.total_cost > 0
                      ? (data.cost / summary.total_cost) * 100
                      : 0;

                    return (
                      <div key={provider} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: getProviderColor(provider as AIProvider) }}
                            />
                            <span>{AI_PROVIDERS[provider as AIProvider]?.name || provider}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-medium">{formatCost(data.cost)}</span>
                            <span className="text-muted-foreground ml-2">
                              ({data.calls.toLocaleString()} calls)
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: getProviderColor(provider as AIProvider),
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Feature Usage */}
          {Object.keys(summary.by_feature).length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Usage by Feature</CardTitle>
                  <CardDescription>
                    {summary.features_used.length} features used
                  </CardDescription>
                </div>
                {canManage && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowConfig(!showConfig)}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    {showConfig ? 'Hide Config' : 'Configure Models'}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      {showConfig && canManage && (
                        <TableHead>Model Override</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(summary.by_feature)
                      .sort(([, a], [, b]) => b.cost - a.cost)
                      .map(([featureKey, data]) => {
                        const config = effectiveConfig.find((c) => c.feature_key === featureKey);

                        return (
                          <TableRow key={featureKey}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{data.feature_name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Badge variant="outline" className="text-xs">
                                    {data.category}
                                  </Badge>
                                  {config?.is_override && (
                                    <Badge variant="secondary" className="text-xs">
                                      Custom model
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {data.calls.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCost(data.cost)}
                            </TableCell>
                            {showConfig && canManage && (
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <ModelOverrideSelector
                                    models={models}
                                    currentModelId={config?.model_id || null}
                                    currentModelName={config?.model_name || 'Default'}
                                    isOverride={config?.is_override || false}
                                    onChange={(modelId) => handleOverrideModel(featureKey, modelId)}
                                    onReset={() => handleResetToDefault(featureKey)}
                                  />
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Daily Trend */}
          {summary.daily_trend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily Usage Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-32 flex items-end gap-0.5">
                  {summary.daily_trend.slice(-30).map((day) => {
                    const maxCost = Math.max(...summary.daily_trend.map((d) => d.cost));
                    const height = maxCost > 0 ? (day.cost / maxCost) * 100 : 0;

                    return (
                      <div
                        key={day.date}
                        className="flex-1 bg-primary/70 rounded-t hover:bg-primary transition-colors cursor-pointer"
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={`${day.date}: ${formatCost(day.cost)} (${day.calls} calls)`}
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No AI usage data available for this period
            </p>
          </CardContent>
        </Card>
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
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-xl font-bold">{value}</p>
          </div>
          <Icon className={cn('h-6 w-6', color)} />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Model Override Selector Component
// ============================================================================

function ModelOverrideSelector({
  models,
  currentModelId,
  currentModelName,
  isOverride,
  onChange,
  onReset,
}: {
  models: AIModel[];
  currentModelId: string | null;
  currentModelName: string;
  isOverride: boolean;
  onChange: (modelId: string | null) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <span className="truncate max-w-[120px]">{currentModelName}</span>
            <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 max-h-64 overflow-y-auto">
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
                    className="text-xs"
                  >
                    {currentModelId === model.id && <Check className="h-3 w-3 mr-2" />}
                    <span className={currentModelId === model.id ? '' : 'ml-5'}>
                      {model.display_name}
                    </span>
                  </DropdownMenuItem>
                ))}
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {isOverride && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onReset}
          title="Reset to default"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

export default OrgAIUsage;

import { RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface AIModel {
  id: string;
  display_name: string;
  provider: string;
  model_id: string;
  input_cost_per_million: number | null;
  output_cost_per_million: number | null;
}

export interface FeatureModelRowProps {
  featureKey: string;
  displayName: string;
  description?: string;
  category: string;
  currentDriverModelId: string | null;
  currentDriverModelName: string;
  currentPlannerModelId: string | null;
  currentPlannerModelName: string | null;
  isDriverOverride: boolean;
  isPlannerOverride: boolean;
  availableModels: AIModel[];
  onDriverChange: (modelId: string | null) => void;
  onPlannerChange: (modelId: string | null) => void;
  readOnly?: boolean;
}

function getCostTier(model: AIModel | undefined): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
} {
  if (!model || model.input_cost_per_million == null) {
    return { label: 'Unknown', variant: 'outline', className: '' };
  }
  const inputCost = model.input_cost_per_million;
  if (inputCost <= 1) {
    return {
      label: 'Economy',
      variant: 'default',
      className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0',
    };
  }
  if (inputCost <= 5) {
    return {
      label: 'Standard',
      variant: 'default',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0',
    };
  }
  return {
    label: 'Power',
    variant: 'default',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-0',
  };
}

function formatCost(cost: number | null): string {
  if (cost == null) return '?';
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

function getProviderLabel(provider: string): string {
  const map: Record<string, string> = {
    anthropic: 'Anthropic',
    google: 'Google',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
  };
  return map[provider] || provider;
}

export function FeatureModelRow({
  displayName,
  description,
  currentDriverModelId,
  currentDriverModelName,
  currentPlannerModelId,
  currentPlannerModelName,
  isDriverOverride,
  isPlannerOverride,
  availableModels,
  onDriverChange,
  onPlannerChange,
  readOnly,
}: FeatureModelRowProps) {
  const driverModel = availableModels.find((m) => m.id === currentDriverModelId);
  const driverTier = getCostTier(driverModel);
  const hasPlannerSupport = currentPlannerModelId !== null || currentPlannerModelName !== null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 bg-white dark:bg-gray-900/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
              {displayName}
            </span>
            <Badge variant={driverTier.variant} className={driverTier.className}>
              {driverTier.label}
            </Badge>
          </div>
          {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
          )}
        </div>
        {!readOnly && (isDriverOverride || isPlannerOverride) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 shrink-0"
            onClick={() => {
              if (isDriverOverride) onDriverChange(null);
              if (isPlannerOverride) onPlannerChange(null);
            }}
            title="Reset to default"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Driver model selector */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Driver Model
          </label>
          <Select
            value={currentDriverModelId || ''}
            onValueChange={(val) => onDriverChange(val || null)}
            disabled={readOnly}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={currentDriverModelName || 'Select model'} />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((model) => (
                <SelectItem key={model.id} value={model.id} className="text-xs">
                  <div className="flex flex-col">
                    <span>{model.display_name}</span>
                    <span className="text-[10px] text-gray-400">
                      {getProviderLabel(model.provider)} &middot;{' '}
                      {formatCost(model.input_cost_per_million)} /{' '}
                      {formatCost(model.output_cost_per_million)} per 1M tokens
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isDriverOverride && (
            <span className="text-[10px] text-blue-500 dark:text-blue-400">Custom override</span>
          )}
        </div>

        {/* Planner model selector (only if feature supports planning) */}
        {hasPlannerSupport && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Planner Model
            </label>
            <Select
              value={currentPlannerModelId || ''}
              onValueChange={(val) => onPlannerChange(val || null)}
              disabled={readOnly}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue
                  placeholder={currentPlannerModelName || 'Select planner model'}
                />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model.id} value={model.id} className="text-xs">
                    <div className="flex flex-col">
                      <span>{model.display_name}</span>
                      <span className="text-[10px] text-gray-400">
                        {getProviderLabel(model.provider)} &middot;{' '}
                        {formatCost(model.input_cost_per_million)} /{' '}
                        {formatCost(model.output_cost_per_million)} per 1M tokens
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isPlannerOverride && (
              <span className="text-[10px] text-blue-500 dark:text-blue-400">Custom override</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

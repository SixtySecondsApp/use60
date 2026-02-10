/**
 * CreditEstimator
 *
 * Shows users what they can do with X credits at their current tier settings.
 * Calculates estimated action counts per category based on model pricing
 * and typical token usage per action type.
 *
 * Self-contained: fetches model data and detects current tiers independently.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Calculator, MessageSquare, Users, FileText, Mic, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { useCreditBalance } from '@/lib/hooks/useCreditBalance';
import {
  SIMPLE_CATEGORIES,
  estimateActionCost,
  getModelForTier,
  type AIModel,
  type Tier,
  type SimpleCategory,
} from './SimpleModelTierSelector';

// ─── Category icons ─────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, typeof MessageSquare> = {
  copilot: MessageSquare,
  meetings: Mic,
  research: Users,
  content: FileText,
};

// ─── Quick-pick credit amounts ──────────────────────────────────────────

const CREDIT_AMOUNTS = [10, 25, 50, 100, 250];

// ─── Helpers ────────────────────────────────────────────────────────────

function formatActionCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${(count / 1_000).toFixed(0)}K`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return Math.floor(count).toLocaleString();
}

function detectTierFromConfig(
  features: { feature_key: string; category: string; model_id: string | null }[],
  models: AIModel[],
  dbCategories: string[]
): Tier {
  const catFeatures = features.filter((f) =>
    dbCategories.includes(f.category.toLowerCase())
  );
  if (catFeatures.length === 0) return 'medium';

  let totalCost = 0;
  let count = 0;
  for (const f of catFeatures) {
    const model = models.find((m) => m.id === f.model_id);
    if (model?.input_cost_per_million != null) {
      totalCost += model.input_cost_per_million;
      count++;
    }
  }
  if (count === 0) return 'medium';

  const avgCost = totalCost / count;
  if (avgCost <= 1) return 'low';
  if (avgCost <= 5) return 'medium';
  return 'high';
}

// ─── Component ──────────────────────────────────────────────────────────

export function CreditEstimator() {
  const orgId = useOrgId();
  const { data: balance } = useCreditBalance();
  const [models, setModels] = useState<AIModel[]>([]);
  const [tiers, setTiers] = useState<Record<string, Tier>>({});
  const [loading, setLoading] = useState(true);
  const [creditAmount, setCreditAmount] = useState<number>(25);

  // Set initial credit amount from balance
  useEffect(() => {
    if (balance && balance.balance > 0) {
      setCreditAmount(Math.round(balance.balance * 100) / 100);
    }
  }, [balance]);

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [configResult, modelsResult] = await Promise.all([
        supabase.rpc('get_org_effective_ai_config', { p_org_id: orgId }),
        supabase
          .from('ai_models')
          .select('id, display_name, provider, model_id, input_cost_per_million, output_cost_per_million')
          .eq('is_available', true)
          .eq('is_deprecated', false)
          .order('provider')
          .order('display_name'),
      ]);

      if (configResult.error || modelsResult.error) return;

      const featureData = configResult.data ?? [];
      const modelData = modelsResult.data ?? [];
      setModels(modelData);

      const detectedTiers: Record<string, Tier> = {};
      for (const cat of SIMPLE_CATEGORIES) {
        detectedTiers[cat.key] = detectTierFromConfig(featureData, modelData, cat.dbCategories);
      }
      setTiers(detectedTiers);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate actions per category at current tier
  const estimates = useMemo(() => {
    return SIMPLE_CATEGORIES.map((cat) => {
      const tier = tiers[cat.key] ?? 'medium';
      const model = getModelForTier(models, tier);
      const costPerAction = estimateActionCost(cat, model);
      const actions = costPerAction > 0 ? creditAmount / costPerAction : 0;

      return {
        category: cat,
        tier,
        costPerAction,
        actions,
      };
    });
  }, [models, tiers, creditAmount]);

  if (loading || models.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      </div>
    );
  }

  const currentBalance = balance?.balance ?? 0;

  return (
    <div className="space-y-4">
      {/* Credit amount selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          With
        </span>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
          <input
            type="number"
            min={1}
            max={10000}
            step={1}
            value={creditAmount}
            onChange={(e) => setCreditAmount(Math.max(1, Number(e.target.value) || 1))}
            className="w-24 pl-7 pr-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#37bd7e]/50 tabular-nums"
          />
        </div>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          in credits, you can do approximately:
        </span>
      </div>

      {/* Quick picks */}
      <div className="flex gap-1.5 flex-wrap">
        {CREDIT_AMOUNTS.map((amount) => (
          <button
            key={amount}
            onClick={() => setCreditAmount(amount)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md border transition-colors',
              creditAmount === amount
                ? 'border-[#37bd7e] bg-[#37bd7e]/10 text-[#37bd7e] font-medium'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'
            )}
          >
            ${amount}
          </button>
        ))}
        {currentBalance > 0 && !CREDIT_AMOUNTS.includes(Math.round(currentBalance)) && (
          <button
            onClick={() => setCreditAmount(Math.round(currentBalance * 100) / 100)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md border transition-colors',
              creditAmount === Math.round(currentBalance * 100) / 100
                ? 'border-[#37bd7e] bg-[#37bd7e]/10 text-[#37bd7e] font-medium'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'
            )}
          >
            My balance (${currentBalance.toFixed(2)})
          </button>
        )}
      </div>

      {/* Estimate cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {estimates.map(({ category, tier, costPerAction, actions }) => {
          const Icon = CATEGORY_ICONS[category.key] ?? Calculator;
          const tierColors: Record<Tier, string> = {
            low: 'text-emerald-600 dark:text-emerald-400',
            medium: 'text-amber-600 dark:text-amber-400',
            high: 'text-orange-600 dark:text-orange-400',
          };
          const tierBgs: Record<Tier, string> = {
            low: 'bg-emerald-50 dark:bg-emerald-900/20',
            medium: 'bg-amber-50 dark:bg-amber-900/20',
            high: 'bg-orange-50 dark:bg-orange-900/20',
          };

          return (
            <div
              key={category.key}
              className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 flex flex-col"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                  {category.label}
                </span>
              </div>

              <div className="flex-1">
                <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                  {actions > 0 ? formatActionCount(actions) : '--'}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {category.actionLabel}s
                </p>
              </div>

              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', tierBgs[tier], tierColors[tier])}>
                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                </span>
                {costPerAction > 0 && (
                  <span className="text-[10px] text-gray-400 tabular-nums">
                    ${costPerAction < 0.001 ? '<0.001' : costPerAction.toFixed(4)}/ea
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        Estimates based on typical usage and current model pricing. Actual costs vary with input size and complexity.
      </p>
    </div>
  );
}

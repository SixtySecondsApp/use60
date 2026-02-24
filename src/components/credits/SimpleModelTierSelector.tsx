/**
 * SimpleModelTierSelector
 *
 * User-facing AI intelligence tier selector.
 * Groups features into simple categories and lets users pick
 * Low / Medium / High intelligence per category.
 * Shows estimated cost-per-action for each tier.
 *
 * Granular per-feature config lives in Platform Admin (ModelConfigPanel).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Brain, Zap, Cpu, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { useUser } from '@/lib/hooks/useUser';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ACTION_CREDIT_COSTS } from '@/lib/config/creditPacks';
import type { IntelligenceTier } from '@/lib/config/creditPacks';

// ─── Types ──────────────────────────────────────────────────────────────

interface FeatureConfig {
  feature_key: string;
  display_name: string;
  category: string;
  model_id: string | null;
  model_name: string;
  provider: string;
  is_override: boolean;
  is_enabled: boolean;
  planner_model_id: string | null;
  planner_model_name: string | null;
  planner_provider: string | null;
  is_planner_override: boolean;
}

export interface AIModel {
  id: string;
  display_name: string;
  provider: string;
  model_id: string;
  input_cost_per_million: number | null;
  output_cost_per_million: number | null;
}

export type Tier = 'low' | 'medium' | 'high';

// ─── User-facing category mapping ───────────────────────────────────────

export interface SimpleCategory {
  key: string;
  label: string;
  description: string;
  actionLabel: string;
  dbCategories: string[];
  /** Typical tokens per action (used for cost estimates) */
  typicalInputTokens: number;
  typicalOutputTokens: number;
}

export const SIMPLE_CATEGORIES: SimpleCategory[] = [
  {
    key: 'copilot',
    label: 'Copilot',
    description: 'AI chat assistant, autonomous actions, and entity resolution',
    actionLabel: 'message',
    dbCategories: ['copilot'],
    typicalInputTokens: 2000,
    typicalOutputTokens: 500,
  },
  {
    key: 'meetings',
    label: 'Meetings',
    description: 'Meeting summaries, action items, and scorecards',
    actionLabel: 'summary',
    dbCategories: ['meetings'],
    typicalInputTokens: 5000,
    typicalOutputTokens: 800,
  },
  {
    key: 'research',
    label: 'Research & Enrichment',
    description: 'Contact enrichment, company profiling, and data enrichment',
    actionLabel: 'enrichment',
    dbCategories: ['enrichment'],
    typicalInputTokens: 1500,
    typicalOutputTokens: 400,
  },
  {
    key: 'content',
    label: 'Content & Documents',
    description: 'Email analysis, proposals, marketing content, and skills',
    actionLabel: 'generation',
    dbCategories: ['content', 'documents', 'skills', 'intelligence'],
    typicalInputTokens: 3000,
    typicalOutputTokens: 1500,
  },
];

// ─── Tier definitions ───────────────────────────────────────────────────

const TIER_META: Record<Tier, {
  label: string;
  description: string;
  icon: typeof Cpu;
  color: string;
  bgColor: string;
  borderColor: string;
  selectedBg: string;
}> = {
  low: {
    label: 'Low',
    description: 'Fastest & most affordable',
    icon: Cpu,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    selectedBg: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-500 dark:border-emerald-500 ring-1 ring-emerald-500/30',
  },
  medium: {
    label: 'Medium',
    description: 'Balanced quality & speed',
    icon: Brain,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-300 dark:border-amber-700',
    selectedBg: 'bg-amber-100 dark:bg-amber-900/40 border-amber-500 dark:border-amber-500 ring-1 ring-amber-500/30',
  },
  high: {
    label: 'High',
    description: 'Maximum intelligence',
    icon: Zap,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-300 dark:border-orange-700',
    selectedBg: 'bg-orange-100 dark:bg-orange-900/40 border-orange-500 dark:border-orange-500 ring-1 ring-orange-500/30',
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────

function detectTier(features: FeatureConfig[], models: AIModel[]): Tier {
  if (features.length === 0) return 'medium';

  let totalCost = 0;
  let count = 0;
  for (const f of features) {
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

export function getModelForTier(models: AIModel[], tier: Tier): AIModel | undefined {
  const sorted = [...models]
    .filter((m) => m.input_cost_per_million != null)
    .sort((a, b) => (a.input_cost_per_million ?? 999) - (b.input_cost_per_million ?? 999));

  if (sorted.length === 0) return undefined;

  switch (tier) {
    case 'low':
      return sorted[0];
    case 'medium':
      return sorted[Math.floor(sorted.length / 2)];
    case 'high':
      return sorted[sorted.length - 1];
  }
}

/** Calculate estimated cost for a single action in a category at a given tier. */
export function estimateActionCost(
  category: SimpleCategory,
  model: AIModel | undefined
): number {
  if (!model || model.input_cost_per_million == null || model.output_cost_per_million == null) {
    return 0;
  }
  const inputCost = (category.typicalInputTokens / 1_000_000) * model.input_cost_per_million;
  const outputCost = (category.typicalOutputTokens / 1_000_000) * model.output_cost_per_million;
  return inputCost + outputCost;
}

/** Map SimpleCategory key to ACTION_CREDIT_COSTS key */
const CATEGORY_TO_CREDIT_KEY: Record<string, keyof typeof ACTION_CREDIT_COSTS> = {
  copilot: 'copilot_chat',
  meetings: 'meeting_summary',
  research: 'research_enrichment',
  content: 'content_generation',
};

const TIER_TO_CREDIT_TIER: Record<Tier, IntelligenceTier> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
};

/** Format a credit cost as readable string (e.g. "~0.3 cr/msg") */
function formatCreditCost(catKey: string, tier: Tier, actionLabel: string): string {
  const creditKey = CATEGORY_TO_CREDIT_KEY[catKey];
  if (!creditKey) return '--';
  const costs = ACTION_CREDIT_COSTS[creditKey];
  const cost = costs[TIER_TO_CREDIT_TIER[tier]];
  return `~${cost} credits/${actionLabel}`;
}

// ─── Component ──────────────────────────────────────────────────────────

export function SimpleModelTierSelector() {
  const orgId = useOrgId();
  const { userData } = useUser();
  const isAdmin = userData ? isUserAdmin(userData) : false;
  const readOnly = !isAdmin;

  const [features, setFeatures] = useState<FeatureConfig[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState<Record<string, Tier>>({});
  const [initialTiers, setInitialTiers] = useState<Record<string, Tier>>({});

  // ─── Data fetching ──────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
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

      if (configResult.error) {
        console.error('Failed to fetch AI config:', configResult.error);
        toast.error('Failed to load AI configuration');
        return;
      }
      if (modelsResult.error) {
        console.error('Failed to fetch models:', modelsResult.error);
        return;
      }

      const featureData = configResult.data ?? [];
      const modelData = modelsResult.data ?? [];
      setFeatures(featureData);
      setModels(modelData);

      const tiers: Record<string, Tier> = {};
      for (const cat of SIMPLE_CATEGORIES) {
        const catFeatures = featureData.filter((f: FeatureConfig) =>
          cat.dbCategories.includes(f.category.toLowerCase())
        );
        tiers[cat.key] = detectTier(catFeatures, modelData);
      }
      setSelectedTiers(tiers);
      setInitialTiers(tiers);
    } catch (err) {
      console.error('Error loading model config:', err);
      toast.error('Failed to load AI configuration');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ─── Changed detection ─────────────────────────────────────────────

  const hasChanges = useMemo(() => {
    return SIMPLE_CATEGORIES.some(
      (cat) => selectedTiers[cat.key] !== initialTiers[cat.key]
    );
  }, [selectedTiers, initialTiers]);

  // costEstimates removed — cost display now uses ACTION_CREDIT_COSTS from creditPacks config

  // ─── Save ──────────────────────────────────────────────────────────

  const saveChanges = async () => {
    if (!orgId || !hasChanges) return;
    setSaving(true);
    try {
      const upserts: Record<string, unknown>[] = [];

      for (const cat of SIMPLE_CATEGORIES) {
        if (selectedTiers[cat.key] === initialTiers[cat.key]) continue;

        const tier = selectedTiers[cat.key];
        const model = getModelForTier(models, tier);
        if (!model) continue;

        const catFeatures = features.filter((f) =>
          cat.dbCategories.includes(f.category.toLowerCase())
        );

        for (const f of catFeatures) {
          const row: Record<string, unknown> = {
            org_id: orgId,
            feature_key: f.feature_key,
            model_id: model.id,
          };
          if (f.planner_model_id !== null || f.planner_model_name !== null) {
            row.planner_model_id = model.id;
          }
          upserts.push(row);
        }
      }

      for (const row of upserts) {
        const { error } = await supabase
          .from('org_ai_config')
          .upsert(row, { onConflict: 'org_id,feature_key' });
        if (error) throw error;
      }

      toast.success('AI intelligence settings saved');
      setInitialTiers({ ...selectedTiers });
      await fetchConfig();
    } catch (err) {
      console.error('Error saving tier config:', err);
      toast.error('Failed to save AI settings');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Loading AI settings...</span>
      </div>
    );
  }

  if (features.length === 0) {
    return (
      <div className="text-center py-12">
        <Brain className="w-10 h-10 mx-auto mb-3 text-gray-400" />
        <p className="text-sm text-gray-500">No AI features configured yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Choose the intelligence level for each area. Higher tiers use more capable
        models but cost more credits per use.
        {readOnly && (
          <span className="block mt-1 text-xs text-amber-600 dark:text-amber-400">
            Only organization admins can modify AI settings.
          </span>
        )}
      </p>

      <div className="space-y-4">
        {SIMPLE_CATEGORIES.map((cat) => {
          const catFeatures = features.filter((f) =>
            cat.dbCategories.includes(f.category.toLowerCase())
          );
          if (catFeatures.length === 0) return null;
          const currentTier = selectedTiers[cat.key] ?? 'medium';

          return (
            <div
              key={cat.key}
              className="rounded-xl border border-gray-200 dark:border-gray-800 p-4"
            >
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {cat.label}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {cat.description}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as Tier[]).map((tier) => {
                  const meta = TIER_META[tier];
                  const Icon = meta.icon;
                  const isSelected = currentTier === tier;

                  return (
                    <button
                      key={tier}
                      disabled={readOnly}
                      onClick={() =>
                        setSelectedTiers((prev) => ({ ...prev, [cat.key]: tier }))
                      }
                      className={cn(
                        'relative flex flex-col items-center gap-1 rounded-lg border p-3 transition-all',
                        isSelected
                          ? meta.selectedBg
                          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700',
                        readOnly && 'opacity-60 cursor-not-allowed'
                      )}
                    >
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5">
                          <Check className={cn('w-3.5 h-3.5', meta.color)} />
                        </div>
                      )}
                      <Icon className={cn('w-5 h-5', isSelected ? meta.color : 'text-gray-400')} />
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          isSelected ? meta.color : 'text-gray-600 dark:text-gray-400'
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-500 text-center leading-tight">
                        {meta.description}
                      </span>
                      <span className={cn(
                        'text-[10px] font-medium tabular-nums mt-0.5',
                        isSelected ? meta.color : 'text-gray-400'
                      )}>
                        {formatCreditCost(cat.key, tier, cat.actionLabel)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save bar */}
      {!readOnly && hasChanges && (
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-1.5"
            onClick={() => setSelectedTiers({ ...initialTiers })}
            disabled={saving}
          >
            Discard
          </button>
          <button
            className={cn(
              'text-xs font-medium px-4 py-1.5 rounded-lg transition-colors',
              'bg-[#37bd7e] hover:bg-[#2da76c] text-white',
              saving && 'opacity-50 cursor-not-allowed'
            )}
            onClick={saveChanges}
            disabled={saving}
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving...
              </span>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

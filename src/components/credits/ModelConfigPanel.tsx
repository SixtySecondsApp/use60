import { useState, useEffect, useCallback, useMemo } from 'react';
import { Brain, Cpu, Zap, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { useUser } from '@/lib/hooks/useUser';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { toast } from 'sonner';
import { FeatureModelRow, type AIModel } from './FeatureModelRow';

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

interface PendingChange {
  feature_key: string;
  model_id?: string | null;
  planner_model_id?: string | null;
}

// ─── Category metadata ──────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: typeof Brain }> = {
  copilot: { label: 'Copilot', icon: Brain },
  enrichment: { label: 'Enrichment', icon: Cpu },
  meetings: { label: 'Meetings', icon: Cpu },
  content: { label: 'Content', icon: Cpu },
  documents: { label: 'Documents', icon: Cpu },
  skills: { label: 'Skills', icon: Cpu },
  intelligence: { label: 'Intelligence', icon: Cpu },
};

// ─── Presets ────────────────────────────────────────────────────────────

type PresetKey = 'economy' | 'balanced' | 'power';

function getPresetModels(
  models: AIModel[],
  preset: PresetKey
): { driver: AIModel | undefined; planner: AIModel | undefined } {
  const sorted = [...models].sort(
    (a, b) => (a.input_cost_per_million ?? 999) - (b.input_cost_per_million ?? 999)
  );
  if (sorted.length === 0) return { driver: undefined, planner: undefined };

  switch (preset) {
    case 'economy': {
      const cheapest = sorted[0];
      return { driver: cheapest, planner: cheapest };
    }
    case 'balanced': {
      const mid = sorted[Math.floor(sorted.length / 2)];
      return { driver: mid, planner: mid };
    }
    case 'power': {
      const best = sorted[sorted.length - 1];
      return { driver: best, planner: best };
    }
  }
}

// ─── Component ──────────────────────────────────────────────────────────

export function ModelConfigPanel() {
  const orgId = useOrgId();
  const { userData } = useUser();
  const isAdmin = userData ? isUserAdmin(userData) : false;
  const readOnly = !isAdmin;

  const [features, setFeatures] = useState<FeatureConfig[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingChange>>(new Map());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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
        toast.error('Failed to load AI model configuration');
        return;
      }
      if (modelsResult.error) {
        console.error('Failed to fetch models:', modelsResult.error);
        toast.error('Failed to load available models');
        return;
      }

      setFeatures(configResult.data ?? []);
      setModels(modelsResult.data ?? []);

      // Auto-expand first category
      const cats = new Set((configResult.data ?? []).map((f: FeatureConfig) => f.category));
      if (cats.size > 0) {
        setExpandedCategories(new Set([Array.from(cats)[0]]));
      }
    } catch (err) {
      console.error('Error loading model config:', err);
      toast.error('Failed to load model configuration');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ─── Grouped features ──────────────────────────────────────────────

  const grouped = useMemo(() => {
    const map = new Map<string, FeatureConfig[]>();
    for (const f of features) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return map;
  }, [features]);

  // ─── Handlers ─────────────────────────────────────────────────────

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleDriverChange = (featureKey: string, modelId: string | null) => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const existing = next.get(featureKey) ?? { feature_key: featureKey };
      existing.model_id = modelId;
      next.set(featureKey, existing);
      return next;
    });
    // Optimistically update UI
    setFeatures((prev) =>
      prev.map((f) => {
        if (f.feature_key !== featureKey) return f;
        if (modelId === null) {
          return { ...f, is_override: false };
        }
        const model = models.find((m) => m.id === modelId);
        return {
          ...f,
          model_id: modelId,
          model_name: model?.display_name ?? f.model_name,
          provider: model?.provider ?? f.provider,
          is_override: true,
        };
      })
    );
  };

  const handlePlannerChange = (featureKey: string, modelId: string | null) => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const existing = next.get(featureKey) ?? { feature_key: featureKey };
      existing.planner_model_id = modelId;
      next.set(featureKey, existing);
      return next;
    });
    // Optimistically update UI
    setFeatures((prev) =>
      prev.map((f) => {
        if (f.feature_key !== featureKey) return f;
        if (modelId === null) {
          return { ...f, is_planner_override: false };
        }
        const model = models.find((m) => m.id === modelId);
        return {
          ...f,
          planner_model_id: modelId,
          planner_model_name: model?.display_name ?? f.planner_model_name,
          planner_provider: model?.provider ?? f.planner_provider,
          is_planner_override: true,
        };
      })
    );
  };

  const applyPreset = (preset: PresetKey) => {
    const { driver, planner } = getPresetModels(models, preset);
    if (!driver) {
      toast.error('No models available for this preset');
      return;
    }
    const next = new Map<string, PendingChange>();
    setFeatures((prev) =>
      prev.map((f) => {
        const change: PendingChange = { feature_key: f.feature_key, model_id: driver.id };
        if (f.planner_model_id !== null || f.planner_model_name !== null) {
          change.planner_model_id = planner?.id ?? null;
        }
        next.set(f.feature_key, change);
        return {
          ...f,
          model_id: driver.id,
          model_name: driver.display_name,
          provider: driver.provider,
          is_override: true,
          ...(f.planner_model_id !== null || f.planner_model_name !== null
            ? {
                planner_model_id: planner?.id ?? null,
                planner_model_name: planner?.display_name ?? null,
                planner_provider: planner?.provider ?? null,
                is_planner_override: true,
              }
            : {}),
        };
      })
    );
    setPendingChanges(next);
    toast.success(`Applied "${preset}" preset. Save to persist changes.`);
  };

  const saveChanges = async () => {
    if (!orgId || pendingChanges.size === 0) return;
    setSaving(true);
    try {
      const upserts = Array.from(pendingChanges.values()).map((change) => {
        const row: Record<string, unknown> = {
          org_id: orgId,
          feature_key: change.feature_key,
        };
        if ('model_id' in change) row.model_id = change.model_id;
        if ('planner_model_id' in change) row.planner_model_id = change.planner_model_id;
        return row;
      });

      for (const row of upserts) {
        const { error } = await supabase
          .from('org_ai_config')
          .upsert(row, { onConflict: 'org_id,feature_key' });
        if (error) throw error;
      }

      setPendingChanges(new Map());
      toast.success('Model configuration saved');
      // Refresh to get authoritative state
      await fetchConfig();
    } catch (err) {
      console.error('Error saving model config:', err);
      toast.error('Failed to save model configuration');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Loading model configuration...</span>
        </CardContent>
      </Card>
    );
  }

  if (features.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Brain className="w-10 h-10 mx-auto mb-3 text-gray-400" />
          <p className="text-sm text-gray-500">No AI features configured yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5" />
          AI Model Configuration
        </CardTitle>
        <CardDescription>
          Configure which AI models power each feature. Planner models handle
          reasoning and routing; driver models execute the task.
          {readOnly && (
            <span className="block mt-1 text-xs text-amber-600 dark:text-amber-400">
              Only organization admins can modify model configuration.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick-set presets */}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">
              Quick set:
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => applyPreset('economy')}
            >
              <Cpu className="w-3 h-3 text-emerald-500" />
              Economy
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => applyPreset('balanced')}
            >
              <Brain className="w-3 h-3 text-amber-500" />
              Balanced
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => applyPreset('power')}
            >
              <Zap className="w-3 h-3 text-orange-500" />
              Maximum Intelligence
            </Button>
          </div>
        )}

        {/* Feature categories */}
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([category, featureList]) => {
            const meta = CATEGORY_META[category] ?? {
              label: category.charAt(0).toUpperCase() + category.slice(1),
              icon: Cpu,
            };
            const Icon = meta.icon;
            const isExpanded = expandedCategories.has(category);

            return (
              <div
                key={category}
                className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden"
              >
                <button
                  className="flex items-center gap-2 w-full px-4 py-3 text-left bg-gray-50 dark:bg-gray-900/70 hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors"
                  onClick={() => toggleCategory(category)}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                  <Icon className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {meta.label}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {featureList.length} feature{featureList.length !== 1 ? 's' : ''}
                  </span>
                </button>
                {isExpanded && (
                  <div className="p-3 space-y-3 bg-gray-25 dark:bg-gray-950/30">
                    {featureList.map((feature) => (
                      <FeatureModelRow
                        key={feature.feature_key}
                        featureKey={feature.feature_key}
                        displayName={feature.display_name}
                        category={feature.category}
                        currentDriverModelId={feature.model_id}
                        currentDriverModelName={feature.model_name}
                        currentPlannerModelId={feature.planner_model_id}
                        currentPlannerModelName={feature.planner_model_name}
                        isDriverOverride={feature.is_override}
                        isPlannerOverride={feature.is_planner_override}
                        availableModels={models}
                        onDriverChange={(id) => handleDriverChange(feature.feature_key, id)}
                        onPlannerChange={(id) => handlePlannerChange(feature.feature_key, id)}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Save bar */}
        {!readOnly && pendingChanges.size > 0 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <span className="text-xs text-gray-500">
              {pendingChanges.size} unsaved change{pendingChanges.size !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPendingChanges(new Map());
                  fetchConfig();
                }}
                disabled={saving}
              >
                Discard
              </Button>
              <Button size="sm" onClick={saveChanges} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

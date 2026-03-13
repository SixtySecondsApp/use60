/**
 * ModelPreferencesPage
 *
 * Settings page for AI model quality tier preferences (ROUTE-005, ROUTE-006, ROUTE-008).
 * Per-feature quality tier selection: Economy / Standard / Premium.
 * Org-wide admin restrictions on allowed providers and max tier.
 *
 * Reads/writes:
 *   - model_preferences (per org + feature tier selection)
 *   - org_model_restrictions (admin-level provider/model restrictions)
 *   - feature_model_map (read-only: what model each tier maps to)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Brain,
  Zap,
  Shield,
  Check,
  Loader2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useUser } from '@/lib/hooks/useUser';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { toast } from 'sonner';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { ACTION_CREDIT_COSTS } from '@/lib/config/creditPacks';

// ============================================================================
// Types
// ============================================================================

type QualityTier = 'economy' | 'standard' | 'premium';

type FeatureCategory =
  | 'copilot_chat'
  | 'meeting_summary'
  | 'research_enrichment'
  | 'content_generation'
  | 'crm_update'
  | 'task_execution';

interface FeatureModelEntry {
  provider: string;
  model_id: string;
  display_name: string;
}

interface OrgPreference {
  feature: FeatureCategory;
  tier: QualityTier;
}

interface OrgRestrictions {
  allowed_providers: string[];
  blocked_model_ids: string[];
  max_tier: QualityTier | null;
}

// ============================================================================
// Config
// ============================================================================

const FEATURES: {
  key: FeatureCategory;
  label: string;
  description: string;
  creditKey: keyof typeof ACTION_CREDIT_COSTS;
}[] = [
  {
    key: 'copilot_chat',
    label: 'Copilot Chat',
    description: 'AI chat assistant, autonomous actions, and entity resolution',
    creditKey: 'copilot_chat',
  },
  {
    key: 'meeting_summary',
    label: 'Meeting Summaries',
    description: 'Meeting summaries, action items, and coaching scorecards',
    creditKey: 'meeting_summary',
  },
  {
    key: 'research_enrichment',
    label: 'Research & Enrichment',
    description: 'Contact enrichment, company profiling, and data enrichment',
    creditKey: 'research_enrichment',
  },
  {
    key: 'content_generation',
    label: 'Content Generation',
    description: 'Follow-up emails, proposals, and marketing content',
    creditKey: 'content_generation',
  },
  {
    key: 'crm_update',
    label: 'CRM Updates',
    description: 'AI-powered CRM field extraction and auto-update',
    creditKey: 'crm_update',
  },
  {
    key: 'task_execution',
    label: 'Task Execution',
    description: 'Autonomous task planning and execution by the AI agent',
    creditKey: 'task_execution',
  },
];

const TIER_META: Record<
  QualityTier,
  {
    label: string;
    description: string;
    icon: React.ElementType;
    color: string;
    bg: string;
    border: string;
    selectedBg: string;
  }
> = {
  economy: {
    label: 'Economy',
    description: 'Fastest & most affordable',
    icon: Cpu,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-200 dark:border-emerald-800',
    selectedBg:
      'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-500 dark:border-emerald-500 ring-1 ring-emerald-500/30',
  },
  standard: {
    label: 'Standard',
    description: 'Balanced quality & speed',
    icon: Brain,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    selectedBg:
      'bg-amber-100 dark:bg-amber-900/40 border-amber-500 dark:border-amber-500 ring-1 ring-amber-500/30',
  },
  premium: {
    label: 'Premium',
    description: 'Maximum intelligence',
    icon: Zap,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    selectedBg:
      'bg-orange-100 dark:bg-orange-900/40 border-orange-500 dark:border-orange-500 ring-1 ring-orange-500/30',
  },
};

const ALL_PROVIDERS = ['anthropic', 'google', 'openai', 'openrouter'];
const TIER_ORDER: QualityTier[] = ['economy', 'standard', 'premium'];

// ============================================================================
// Helpers
// ============================================================================

function formatCreditCost(creditKey: keyof typeof ACTION_CREDIT_COSTS, tier: QualityTier): string {
  const tierMap: Record<QualityTier, 'low' | 'medium' | 'high'> = {
    economy: 'low',
    standard: 'medium',
    premium: 'high',
  };
  const cost = ACTION_CREDIT_COSTS[creditKey][tierMap[tier]];
  return `~${cost} credits`;
}

// ============================================================================
// Main Component
// ============================================================================

export default function ModelPreferencesPage() {
  const orgId = useActiveOrgId();
  const { userData } = useUser();
  const isAdmin = userData ? isUserAdmin(userData) : false;

  const [preferences, setPreferences] = useState<Record<FeatureCategory, QualityTier>>(
    Object.fromEntries(FEATURES.map((f) => [f.key, 'standard'])) as Record<
      FeatureCategory,
      QualityTier
    >,
  );
  const [initialPrefs, setInitialPrefs] = useState<Record<FeatureCategory, QualityTier>>(
    Object.fromEntries(FEATURES.map((f) => [f.key, 'standard'])) as Record<
      FeatureCategory,
      QualityTier
    >,
  );
  const [modelMap, setModelMap] = useState<
    Record<string, Record<QualityTier, FeatureModelEntry>>
  >({});
  const [restrictions, setRestrictions] = useState<OrgRestrictions>({
    allowed_providers: [],
    blocked_model_ids: [],
    max_tier: null,
  });
  const [initialRestrictions, setInitialRestrictions] = useState<OrgRestrictions>({
    allowed_providers: [],
    blocked_model_ids: [],
    max_tier: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showRestrictions, setShowRestrictions] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [prefResult, mapResult, restrictResult] = await Promise.all([
        supabase
          .from('model_preferences')
          .select('feature, tier')
          .eq('org_id', orgId),
        supabase
          .from('feature_model_map')
          .select('feature, tier, provider, model_id, display_name'),
        supabase
          .from('org_model_restrictions')
          .select('allowed_providers, blocked_model_ids, max_tier')
          .eq('org_id', orgId)
          .maybeSingle(),
      ]);

      // Build preferences map
      const prefs = Object.fromEntries(
        FEATURES.map((f) => [f.key, 'standard']),
      ) as Record<FeatureCategory, QualityTier>;
      for (const row of prefResult.data ?? []) {
        prefs[row.feature as FeatureCategory] = row.tier as QualityTier;
      }
      setPreferences(prefs);
      setInitialPrefs({ ...prefs });

      // Build model map: feature → tier → model info
      const map: Record<string, Record<QualityTier, FeatureModelEntry>> = {};
      for (const row of mapResult.data ?? []) {
        if (!map[row.feature]) map[row.feature] = {} as Record<QualityTier, FeatureModelEntry>;
        map[row.feature][row.tier as QualityTier] = {
          provider: row.provider,
          model_id: row.model_id,
          display_name: row.display_name,
        };
      }
      setModelMap(map);

      // Restrictions
      const r = restrictResult.data;
      if (r) {
        const parsed: OrgRestrictions = {
          allowed_providers: r.allowed_providers ?? [],
          blocked_model_ids: r.blocked_model_ids ?? [],
          max_tier: r.max_tier ?? null,
        };
        setRestrictions(parsed);
        setInitialRestrictions(parsed);
      }
    } catch (err) {
      console.error('ModelPreferencesPage fetch error:', err);
      toast.error('Failed to load model preferences');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Save preferences ───────────────────────────────────────────────────────

  const savePreferences = async () => {
    if (!orgId || !isAdmin) return;
    setSaving(true);
    try {
      // Upsert changed preferences
      const upserts = FEATURES.filter((f) => preferences[f.key] !== initialPrefs[f.key]).map(
        (f) => ({
          org_id: orgId,
          feature: f.key,
          tier: preferences[f.key],
        }),
      );

      if (upserts.length > 0) {
        const { error } = await supabase
          .from('model_preferences')
          .upsert(upserts, { onConflict: 'org_id,feature' });
        if (error) throw error;
      }

      // Save restrictions if changed
      const restrictionsChanged =
        JSON.stringify(restrictions) !== JSON.stringify(initialRestrictions);
      if (restrictionsChanged) {
        const { error: rErr } = await supabase
          .from('org_model_restrictions')
          .upsert(
            { org_id: orgId, ...restrictions },
            { onConflict: 'org_id' },
          );
        if (rErr) throw rErr;
      }

      setInitialPrefs({ ...preferences });
      setInitialRestrictions({ ...restrictions });
      toast.success('Model preferences saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    FEATURES.some((f) => preferences[f.key] !== initialPrefs[f.key]) ||
    JSON.stringify(restrictions) !== JSON.stringify(initialRestrictions);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SettingsPageWrapper title="AI Model Preferences" description="Choose quality tiers for each AI feature category.">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Loading preferences...</span>
        </div>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper
      title="AI Model Preferences"
      description="Choose the quality tier for each AI feature. Higher tiers use more capable models and more credits."
    >
      <div className="space-y-6 max-w-3xl">
        {!isAdmin && (
          <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            Only organization admins can modify model preferences.
          </div>
        )}

        {/* Per-feature tier selection */}
        <div className="space-y-4">
          {FEATURES.map((feature) => {
            const currentTier = preferences[feature.key];
            const effectiveTier =
              restrictions.max_tier &&
              TIER_ORDER.indexOf(currentTier) > TIER_ORDER.indexOf(restrictions.max_tier)
                ? restrictions.max_tier
                : currentTier;
            const isRestricted = effectiveTier !== currentTier;

            return (
              <div
                key={feature.key}
                className="rounded-xl border border-gray-200 dark:border-gray-800 p-4"
              >
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {feature.label}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {feature.description}
                  </p>
                  {isRestricted && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      Org restriction caps this to {restrictions.max_tier}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(TIER_ORDER).map((tier) => {
                    const meta = TIER_META[tier];
                    const Icon = meta.icon;
                    const isSelected = currentTier === tier;
                    const modelInfo = modelMap[feature.key]?.[tier];

                    return (
                      <button
                        key={tier}
                        type="button"
                        disabled={!isAdmin}
                        onClick={() =>
                          setPreferences((prev) => ({ ...prev, [feature.key]: tier }))
                        }
                        className={cn(
                          'relative flex flex-col items-center gap-1 rounded-lg border p-3 transition-all text-left',
                          isSelected
                            ? meta.selectedBg
                            : cn(
                                'hover:border-gray-300 dark:hover:border-gray-700',
                                meta.border,
                              ),
                          !isAdmin && 'opacity-60 cursor-not-allowed',
                        )}
                      >
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5">
                            <Check className={cn('w-3.5 h-3.5', meta.color)} />
                          </div>
                        )}
                        <Icon
                          className={cn(
                            'w-5 h-5',
                            isSelected ? meta.color : 'text-gray-400',
                          )}
                        />
                        <span
                          className={cn(
                            'text-xs font-semibold',
                            isSelected ? meta.color : 'text-gray-600 dark:text-gray-400',
                          )}
                        >
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-500 text-center leading-tight">
                          {meta.description}
                        </span>
                        {modelInfo && (
                          <span
                            className={cn(
                              'text-[10px] font-medium tabular-nums mt-0.5',
                              isSelected ? meta.color : 'text-gray-400',
                            )}
                          >
                            {modelInfo.display_name}
                          </span>
                        )}
                        <span
                          className={cn(
                            'text-[10px] tabular-nums',
                            isSelected ? meta.color : 'text-gray-400',
                          )}
                        >
                          {formatCreditCost(feature.creditKey, tier)}/use
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Admin restrictions section (ROUTE-008) */}
        {isAdmin && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setShowRestrictions((v) => !v)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  Org-Wide Restrictions
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">Admin only</span>
              </div>
              {showRestrictions ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {showRestrictions && (
              <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Restrict which AI providers can be used org-wide. Overrides individual tier selections.
                </p>

                {/* Max tier cap */}
                <div>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Maximum tier allowed
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRestrictions((r) => ({ ...r, max_tier: null }))}
                      className={cn(
                        'px-3 py-1.5 text-xs rounded-lg border transition-colors',
                        restrictions.max_tier === null
                          ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300',
                      )}
                    >
                      No cap
                    </button>
                    {TIER_ORDER.map((tier) => {
                      const meta = TIER_META[tier];
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setRestrictions((r) => ({ ...r, max_tier: tier }))}
                          className={cn(
                            'px-3 py-1.5 text-xs rounded-lg border transition-colors',
                            restrictions.max_tier === tier
                              ? cn(meta.selectedBg, meta.color)
                              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300',
                          )}
                        >
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Allowed providers */}
                <div>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Allowed providers{' '}
                    <span className="text-gray-400 font-normal">(empty = all allowed)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_PROVIDERS.map((provider) => {
                      const isAllowed =
                        restrictions.allowed_providers.length === 0 ||
                        restrictions.allowed_providers.includes(provider);
                      const isExplicit = restrictions.allowed_providers.includes(provider);

                      return (
                        <button
                          key={provider}
                          type="button"
                          onClick={() => {
                            setRestrictions((r) => {
                              const current = r.allowed_providers;
                              if (current.length === 0) {
                                // Switching from "all" to explicit — allow all except this one
                                return {
                                  ...r,
                                  allowed_providers: ALL_PROVIDERS.filter((p) => p !== provider),
                                };
                              }
                              if (current.includes(provider)) {
                                const next = current.filter((p) => p !== provider);
                                // If all removed, reset to "all allowed"
                                return { ...r, allowed_providers: next };
                              }
                              return { ...r, allowed_providers: [...current, provider] };
                            });
                          }}
                          className={cn(
                            'px-3 py-1.5 text-xs rounded-lg border transition-colors capitalize',
                            isExplicit
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-700 dark:text-blue-400'
                              : isAllowed
                                ? 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                                : 'border-red-200 dark:border-red-800 text-red-500 line-through opacity-60',
                          )}
                        >
                          {provider}
                        </button>
                      );
                    })}
                  </div>
                  {restrictions.allowed_providers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRestrictions((r) => ({ ...r, allowed_providers: [] }))}
                      className="mt-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                    >
                      Reset to all providers
                    </button>
                  )}
                </div>

                {/* Warning banner */}
                {(restrictions.allowed_providers.length > 0 || restrictions.max_tier) && (
                  <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    These restrictions apply to all org members. If a selected tier's model is restricted, the system will fall back to the nearest allowed model.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Credit usage link */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Wallet className="w-3.5 h-3.5" />
          <a href="/settings/credits" className="hover:underline text-[#37bd7e]">
            View credit usage dashboard
          </a>
          {' '}to see how much each tier costs in practice.
        </div>

        {/* Save bar */}
        {isAdmin && hasChanges && (
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-1.5"
              onClick={() => {
                setPreferences({ ...initialPrefs });
                setRestrictions({ ...initialRestrictions });
              }}
              disabled={saving}
            >
              Discard
            </button>
            <button
              type="button"
              onClick={savePreferences}
              disabled={saving}
              className={cn(
                'text-xs font-medium px-4 py-1.5 rounded-lg transition-colors',
                'bg-[#37bd7e] hover:bg-[#2da76c] text-white',
                saving && 'opacity-50 cursor-not-allowed',
              )}
            >
              {saving ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              ) : (
                'Save Preferences'
              )}
            </button>
          </div>
        )}
      </div>
    </SettingsPageWrapper>
  );
}

/**
 * AgentConfigConfirmStep
 *
 * Shown after EnrichmentResultStep. Displays AI-inferred agent configuration
 * items so the user can review and confirm (or edit) them before proceeding.
 *
 * Inference is performed client-side by calling the `infer-agent-config` edge
 * function which wraps the shared agentConfigInference module. The results are
 * displayed grouped into three categories: Company Profile, Sales Process, and
 * Pipeline. The top 5-7 most important items are shown prominently; the rest
 * are collapsed under an "Advanced" disclosure.
 *
 * On confirm, all values are written to `agent_config_org_overrides` via
 * `agentConfigService.setOrgOverride()`. The user may also skip this step
 * entirely with the "Edit in Settings" link.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  Pencil,
  X,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOnboardingV2Store } from '@/lib/stores/onboardingV2Store';
import { supabase } from '@/lib/supabase/clientV2';
import { setOrgOverride, type AgentType } from '@/lib/services/agentConfigService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InferredConfigItem {
  config_key: string;
  value: unknown;
  confidence: 'low' | 'medium' | 'high';
  source: 'enrichment' | 'crm_data' | 'country_rule' | 'industry_norm' | 'ai_inference';
  agent_type: string;
}

// ---------------------------------------------------------------------------
// Display metadata
// ---------------------------------------------------------------------------

interface ConfigMeta {
  label: string;
  category: 'company' | 'sales' | 'pipeline';
  inputType: 'text' | 'dropdown' | 'tags' | 'number';
  options?: string[];
  prominent: boolean;
}

const CONFIG_META: Record<string, ConfigMeta> = {
  sales_methodology: {
    label: 'Sales Methodology',
    category: 'sales',
    inputType: 'dropdown',
    options: ['generic', 'meddic', 'bant', 'spin', 'challenger'],
    prominent: true,
  },
  sales_motion_type: {
    label: 'Sales Motion',
    category: 'sales',
    inputType: 'dropdown',
    options: ['plg', 'mid_market', 'enterprise', 'transactional'],
    prominent: true,
  },
  key_competitors: {
    label: 'Key Competitors',
    category: 'sales',
    inputType: 'tags',
    prominent: true,
  },
  fiscal_year_start_month: {
    label: 'Fiscal Year Start Month',
    category: 'pipeline',
    inputType: 'dropdown',
    options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    prominent: true,
  },
  typical_deal_size_range: {
    label: 'Typical Deal Size',
    category: 'pipeline',
    inputType: 'text',
    prominent: true,
  },
  average_sales_cycle_days: {
    label: 'Avg. Sales Cycle (days)',
    category: 'pipeline',
    inputType: 'number',
    prominent: true,
  },
  pricing_model: {
    label: 'Pricing Model',
    category: 'sales',
    inputType: 'dropdown',
    options: ['subscription', 'usage_based', 'one_time', 'hybrid', 'freemium'],
    prominent: false,
  },
  target_customer_profile: {
    label: 'Target Customer Profile',
    category: 'sales',
    inputType: 'text',
    prominent: false,
  },
  common_objections: {
    label: 'Common Objections',
    category: 'sales',
    inputType: 'tags',
    prominent: false,
  },
  industry_vertical: {
    label: 'Industry',
    category: 'company',
    inputType: 'text',
    prominent: false,
  },
  company_size: {
    label: 'Company Size',
    category: 'company',
    inputType: 'text',
    prominent: false,
  },
  product_service_category: {
    label: 'Product / Service Category',
    category: 'company',
    inputType: 'text',
    prominent: false,
  },
  crm_stage_mapping: {
    label: 'CRM Pipeline Stages',
    category: 'pipeline',
    inputType: 'text',
    prominent: false,
  },
  team_size: {
    label: 'Team Size',
    category: 'company',
    inputType: 'number',
    prominent: false,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(value: unknown, configKey: string): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return (value as string[]).join(', ') || '—';
  if (typeof value === 'object') {
    return Object.values(value as Record<string, string>).join(' → ') || '—';
  }
  if (configKey === 'fiscal_year_start_month') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const idx = Number(value) - 1;
    return months[idx] ?? String(value);
  }
  return String(value);
}

function sourceLabel(source: InferredConfigItem['source']): string {
  switch (source) {
    case 'enrichment': return 'from your website';
    case 'crm_data': return 'from your CRM';
    case 'country_rule': return 'based on your country';
    case 'industry_norm': return 'industry default';
    case 'ai_inference': return 'AI inferred';
  }
}

function agentTypeForKey(configKey: string): AgentType {
  const meta = CONFIG_META[configKey];
  const raw = meta?.category ?? 'global';
  // Map display category to AgentType
  const map: Record<string, AgentType> = {
    sales: 'crm_update',
    pipeline: 'deal_risk',
    company: 'morning_briefing',
  };
  return map[raw] ?? 'global';
}

// ---------------------------------------------------------------------------
// Confidence dot
// ---------------------------------------------------------------------------

function ConfidenceDot({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const colors: Record<string, string> = {
    high: 'bg-emerald-500',
    medium: 'bg-yellow-400',
    low: 'bg-red-400',
  };
  const labels: Record<string, string> = {
    high: 'High confidence',
    medium: 'Medium confidence',
    low: 'Low confidence — you may want to update this',
  };
  return (
    <span
      title={labels[confidence]}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${colors[confidence]}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Editable tag list
// ---------------------------------------------------------------------------

function TagEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setDraft('');
  };

  const remove = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {values.map((v, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-violet-900/50 text-violet-200"
        >
          {v}
          <button
            onClick={() => remove(i)}
            className="text-violet-400 hover:text-white transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Add…"
        className="px-2 py-0.5 text-xs rounded-md bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 min-w-[70px]"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single config row
// ---------------------------------------------------------------------------

interface ConfigRowProps {
  item: InferredConfigItem;
  onValueChange: (key: string, newVal: unknown) => void;
}

function ConfigRow({ item, onValueChange }: ConfigRowProps) {
  const meta = CONFIG_META[item.config_key];
  const label = meta?.label ?? item.config_key;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(
    Array.isArray(item.value) ? '' : item.value != null ? String(item.value) : ''
  );
  const [tagValues, setTagValues] = useState<string[]>(
    Array.isArray(item.value) ? (item.value as string[]) : []
  );

  const isTagInput = meta?.inputType === 'tags';
  const isDropdown = meta?.inputType === 'dropdown';

  const commitEdit = () => {
    if (isTagInput) {
      onValueChange(item.config_key, tagValues);
    } else if (meta?.inputType === 'number') {
      const num = Number(draft);
      onValueChange(item.config_key, isNaN(num) ? item.value : num);
    } else {
      onValueChange(item.config_key, draft);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(Array.isArray(item.value) ? '' : item.value != null ? String(item.value) : '');
    setTagValues(Array.isArray(item.value) ? (item.value as string[]) : []);
    setEditing(false);
  };

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-800/60 last:border-0">
      <ConfidenceDot confidence={item.confidence} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
          <span className="text-xs text-gray-600 italic shrink-0">{sourceLabel(item.source)}</span>
        </div>

        {item.confidence === 'low' && (
          <div className="flex items-center gap-1 text-xs text-yellow-500 mb-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>We're not sure about this — you can change it anytime</span>
          </div>
        )}

        {!editing ? (
          <div className="flex items-center gap-2 group">
            <span className="text-sm text-white break-words">
              {isTagInput
                ? tagValues.length
                  ? (
                    <span className="flex flex-wrap gap-1">
                      {tagValues.map((t, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 text-xs rounded-md bg-gray-800 text-gray-300"
                        >
                          {t}
                        </span>
                      ))}
                    </span>
                  )
                  : <span className="text-gray-500">—</span>
                : formatValue(item.value, item.config_key)}
            </span>
            <button
              onClick={() => setEditing(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-white"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="mt-1 space-y-1">
            {isTagInput ? (
              <TagEditor values={tagValues} onChange={setTagValues} />
            ) : isDropdown && meta.options ? (
              <select
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full px-2 py-1 text-sm rounded-md bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-violet-500"
              >
                {meta.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={meta?.inputType === 'number' ? 'number' : 'text'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') cancelEdit();
                }}
                autoFocus
                className="w-full px-2 py-1 text-sm rounded-md bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-violet-500"
              />
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={commitEdit}
                className="px-2 py-0.5 text-xs rounded bg-violet-600 hover:bg-violet-700 text-white transition-colors"
              >
                Save
              </button>
              <button
                onClick={cancelEdit}
                className="px-2 py-0.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category section
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  company: 'Company Profile',
  sales: 'Sales Process',
  pipeline: 'Pipeline & Deals',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentConfigConfirmStep() {
  const { enrichment, organizationId, setStep } = useOnboardingV2Store();

  const [items, setItems] = useState<InferredConfigItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Fetch inferred config from edge function on mount
  useEffect(() => {
    if (!enrichment && !organizationId) {
      setIsLoading(false);
      return;
    }

    const fetchInferred = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('infer-agent-config', {
          body: {
            organization_id: organizationId,
            enrichment_data: enrichment
              ? {
                  company_industry: enrichment.industry,
                  company_size: enrichment.employee_count,
                  company_bio: enrichment.description,
                  company_domain: enrichment.domain,
                }
              : undefined,
          },
        });

        if (error) throw error;

        if (data?.items && Array.isArray(data.items)) {
          setItems(data.items as InferredConfigItem[]);
        } else {
          // Edge function not deployed yet — fall back to client-side stub
          setItems(buildClientSideFallback(enrichment));
        }
      } catch (err) {
        console.error('[AgentConfigConfirmStep] Failed to fetch inferred config:', err);
        // Graceful fallback: derive what we can from local enrichment data
        setItems(buildClientSideFallback(enrichment));
      } finally {
        setIsLoading(false);
      }
    };

    fetchInferred();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const handleValueChange = (key: string, newVal: unknown) => {
    setItems((prev) =>
      prev.map((item) =>
        item.config_key === key ? { ...item, value: newVal } : item
      )
    );
  };

  const handleConfirm = async () => {
    if (!organizationId || isSaving) return;
    setIsSaving(true);

    try {
      // Write all confirmed items as org overrides
      await Promise.all(
        items.map((item) => {
          const agentType = agentTypeForKey(item.config_key);
          return setOrgOverride(organizationId, agentType, item.config_key, item.value);
        })
      );

      toast.success('Agent configuration saved');
      setStep('skills_config');
    } catch (err) {
      console.error('[AgentConfigConfirmStep] Failed to save config:', err);
      toast.error('Failed to save configuration. You can update it in Settings later.');
      // Allow proceeding anyway — config can be updated in settings
      setStep('skills_config');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    setStep('skills_config');
  };

  // Split items into prominent and advanced
  const prominentItems = items.filter((item) => {
    const meta = CONFIG_META[item.config_key];
    return meta?.prominent ?? false;
  });

  const advancedItems = items.filter((item) => {
    const meta = CONFIG_META[item.config_key];
    return meta ? !meta.prominent : true;
  });

  // Group items by category
  const groupByCategory = (list: InferredConfigItem[]) => {
    const groups: Record<string, InferredConfigItem[]> = {
      company: [],
      sales: [],
      pipeline: [],
    };
    for (const item of list) {
      const cat = CONFIG_META[item.config_key]?.category ?? 'company';
      groups[cat].push(item);
    }
    return groups;
  };

  const prominentGroups = groupByCategory(prominentItems);
  const advancedGroups = groupByCategory(advancedItems);

  // ---------------------------------------------------------------------------
  // Loading skeleton
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full max-w-2xl mx-auto px-4"
      >
        <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="bg-violet-600 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              </div>
              <div>
                <h2 className="font-bold text-white">Personalising your AI agent</h2>
                <p className="text-violet-100 text-sm">Inferring your sales configuration…</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-gray-800 animate-pulse" />
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state (no items inferred)
  // ---------------------------------------------------------------------------

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full max-w-2xl mx-auto px-4"
      >
        <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="bg-violet-600 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-white">Agent Configuration</h2>
                <p className="text-violet-100 text-sm">Set this up later in Settings</p>
              </div>
            </div>
          </div>
          <div className="p-6 text-center">
            <p className="text-gray-400 mb-6">
              We weren't able to infer any configuration yet. You can customise your AI agent
              settings later from the Settings page.
            </p>
            <button
              onClick={handleSkip}
              className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 group"
            >
              Continue
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-2xl mx-auto px-4"
    >
      <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 overflow-hidden">
        {/* Header */}
        <div className="bg-violet-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white">Your AI agent is almost ready</h2>
              <p className="text-violet-100 text-sm">
                We've inferred your sales setup — confirm or edit before we lock it in
              </p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="px-6 pt-4 pb-2 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            High confidence
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />
            Medium
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
            Low — review recommended
          </span>
        </div>

        {/* Prominent items */}
        <div className="px-6 pb-4">
          {Object.entries(prominentGroups).map(([cat, catItems]) => {
            if (catItems.length === 0) return null;
            return (
              <div key={cat} className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-1">
                  {CATEGORY_LABELS[cat] ?? cat}
                </p>
                <div className="rounded-xl bg-gray-800/40 border border-gray-800 px-4">
                  {catItems.map((item) => (
                    <ConfigRow
                      key={item.config_key}
                      item={item}
                      onValueChange={handleValueChange}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Advanced disclosure */}
        {advancedItems.length > 0 && (
          <div className="px-6 pb-4">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              {showAdvanced ? 'Hide advanced settings' : `Show ${advancedItems.length} more settings`}
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 space-y-4">
                    {Object.entries(advancedGroups).map(([cat, catItems]) => {
                      if (catItems.length === 0) return null;
                      return (
                        <div key={cat}>
                          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-1">
                            {CATEGORY_LABELS[cat] ?? cat}
                          </p>
                          <div className="rounded-xl bg-gray-800/40 border border-gray-800 px-4">
                            {catItems.map((item) => (
                              <ConfigRow
                                key={item.config_key}
                                item={item}
                                onValueChange={handleValueChange}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pb-6 space-y-3">
          <button
            onClick={handleConfirm}
            disabled={isSaving}
            className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 group"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Looks good, continue
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>

          <div className="text-center">
            <button
              onClick={handleSkip}
              className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
            >
              Edit in Settings later
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Client-side fallback (when edge function is not yet deployed)
// ---------------------------------------------------------------------------

function buildClientSideFallback(enrichment: ReturnType<typeof useOnboardingV2Store.getState>['enrichment']): InferredConfigItem[] {
  const items: InferredConfigItem[] = [];

  if (!enrichment) return items;

  if (enrichment.industry) {
    items.push({
      config_key: 'industry_vertical',
      value: enrichment.industry,
      confidence: 'high',
      source: 'enrichment',
      agent_type: 'pipeline',
    });
  }

  if (enrichment.employee_count) {
    items.push({
      config_key: 'company_size',
      value: enrichment.employee_count,
      confidence: 'high',
      source: 'enrichment',
      agent_type: 'pipeline',
    });
  }

  if (enrichment.competitors && enrichment.competitors.length > 0) {
    items.push({
      config_key: 'key_competitors',
      value: enrichment.competitors.map((c) =>
        typeof c === 'string' ? c : c.name
      ),
      confidence: 'high',
      source: 'enrichment',
      agent_type: 'research',
    });
  }

  // Default fiscal year (January) as low-confidence fallback
  items.push({
    config_key: 'fiscal_year_start_month',
    value: 1,
    confidence: 'low',
    source: 'industry_norm',
    agent_type: 'pipeline',
  });

  // Default methodology
  items.push({
    config_key: 'sales_methodology',
    value: 'generic',
    confidence: 'low',
    source: 'industry_norm',
    agent_type: 'pipeline',
  });

  return items;
}

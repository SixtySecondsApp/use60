import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Send, Loader2, Plus, Sparkles, Calculator, Zap, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import type { InstantlyColumnConfig, InstantlyCampaign, InstantlyFieldMapping } from '@/lib/types/instantly';

interface ExistingColumn {
  key: string;
  label: string;
}

interface StepContentConfig {
  subjectMode: 'formula' | 'ai';
  bodyMode: 'formula' | 'ai';
  subjectFormula: string;
  bodyFormula: string;
  subjectPrompt: string;
  bodyPrompt: string;
}

interface StepColumnDef {
  key: string;
  label: string;
  columnType: string;
  isEnrichment: boolean;
  formulaExpression?: string;
  enrichmentPrompt?: string;
  autoRunRows?: number | 'all';
  integrationConfig?: Record<string, unknown>;
}

interface EditInstantlySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: Partial<InstantlyColumnConfig>) => void;
  onAddStepColumns?: (columns: StepColumnDef[]) => void;
  columnLabel: string;
  currentConfig?: InstantlyColumnConfig;
  orgId?: string;
  existingColumns?: ExistingColumn[];
  initialMode?: 'select' | 'create';
  onCampaignCreated?: (campaignId: string, campaignName: string) => void;
}

function buildSequenceFromStepColumns(columns: { key: string }[]): any[] {
  const stepPattern = /^instantly_step_(\d+)_(subject|body)$/;
  const steps = new Map<number, Set<string>>();
  for (const col of columns) {
    const m = col.key.match(stepPattern);
    if (!m) continue;
    const num = parseInt(m[1]);
    if (!steps.has(num)) steps.set(num, new Set());
    steps.get(num)!.add(m[2]);
  }
  const sorted = [...steps.entries()].sort((a, b) => a[0] - b[0]);
  return [{
    steps: sorted.map(([num], idx) => ({
      type: 'email',
      delay: idx === 0 ? 0 : 2,
      variants: [{ subject: `{{step_${num}_subject}}`, body: `{{step_${num}_body}}` }],
    })),
  }];
}

function makeDefaultStepConfig(stepNum: number): StepContentConfig {
  return {
    subjectMode: 'formula',
    bodyMode: 'ai',
    subjectFormula: stepNum === 1
      ? '"Hey " & @first_name & ", quick question about " & @company_name'
      : `"Re: " & @company_name & " — follow-up #${stepNum}"`,
    bodyFormula: '',
    subjectPrompt: `Write a short, personalized cold email subject line for @first_name at @company_name. Step ${stepNum} of the sequence. Keep it casual and under 60 characters.`,
    bodyPrompt: stepNum === 1
      ? 'Write a 2-3 sentence personalized cold email body for @first_name at @company_name. Reference their role and company. Keep it casual, concise, and end with a soft CTA.'
      : `Write a brief follow-up email (step ${stepNum}) for @first_name at @company_name. Reference the previous outreach. Keep it shorter than the first email — 1-2 sentences max.`,
  };
}

export function EditInstantlySettingsModal({
  isOpen,
  onClose,
  onSave,
  onAddStepColumns,
  columnLabel,
  currentConfig,
  orgId,
  existingColumns = [],
}: EditInstantlySettingsModalProps) {
  const [campaigns, setCampaigns] = useState<InstantlyCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [fieldMapping, setFieldMapping] = useState<InstantlyFieldMapping>({
    email: '',
  });
  const modalRef = useRef<HTMLDivElement>(null);

  // Add steps state
  const [showAddSteps, setShowAddSteps] = useState(false);
  const [stepCount, setStepCount] = useState(1);
  const [stepConfigs, setStepConfigs] = useState<StepContentConfig[]>(
    Array.from({ length: 5 }, (_, i) => makeDefaultStepConfig(i + 1))
  );

  useEffect(() => {
    if (isOpen && currentConfig) {
      setSelectedCampaignId(currentConfig.campaign_id ?? currentConfig.push_config?.campaign_id ?? '');
      setFieldMapping(currentConfig.field_mapping ?? { email: '' });
      setShowAddSteps(false);
    }
  }, [isOpen, currentConfig]);

  useEffect(() => {
    if (isOpen && orgId) {
      loadCampaigns();
    }
  }, [isOpen, orgId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    setStepConfigs(prev => {
      const next = [...prev];
      while (next.length < stepCount) {
        next.push(makeDefaultStepConfig(next.length + 1));
      }
      return next;
    });
  }, [stepCount]);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'list_campaigns', org_id: orgId },
      });
      if (data?.campaigns) {
        setCampaigns(data.campaigns);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const handleSave = () => {
    const updates: Partial<InstantlyColumnConfig> = {};
    if (selectedCampaignId) {
      const campaign = campaigns.find((c) => c.id === selectedCampaignId);
      updates.campaign_id = selectedCampaignId;
      updates.campaign_name = campaign?.name ?? currentConfig?.campaign_name;
    }
    if (fieldMapping.email) {
      updates.field_mapping = fieldMapping;
    }
    onSave(updates);
    onClose();
  };

  const handleAddSteps = () => {
    if (!onAddStepColumns) return;

    const columns: StepColumnDef[] = [];
    for (let i = 1; i <= stepCount; i++) {
      const cfg = stepConfigs[i - 1];
      if (!cfg) continue;

      const stepIntegrationBase = { instantly_subtype: 'sequence_step' as const };

      // Subject column
      if (cfg.subjectMode === 'formula') {
        columns.push({
          key: `instantly_step_${i}_subject`,
          label: `Step ${i} Subject`,
          columnType: 'formula',
          isEnrichment: false,
          formulaExpression: cfg.subjectFormula,
          integrationConfig: { ...stepIntegrationBase, step_config: { step_number: i, field: 'subject' } },
        });
      } else {
        columns.push({
          key: `instantly_step_${i}_subject`,
          label: `Step ${i} Subject`,
          columnType: 'enrichment',
          isEnrichment: true,
          enrichmentPrompt: cfg.subjectPrompt,
          autoRunRows: 'all' as const,
          integrationConfig: { ...stepIntegrationBase, step_config: { step_number: i, field: 'subject' } },
        });
      }

      // Body column
      if (cfg.bodyMode === 'formula') {
        columns.push({
          key: `instantly_step_${i}_body`,
          label: `Step ${i} Body`,
          columnType: 'formula',
          isEnrichment: false,
          formulaExpression: cfg.bodyFormula,
          integrationConfig: { ...stepIntegrationBase, step_config: { step_number: i, field: 'body' } },
        });
      } else {
        columns.push({
          key: `instantly_step_${i}_body`,
          label: `Step ${i} Body`,
          columnType: 'enrichment',
          isEnrichment: true,
          enrichmentPrompt: cfg.bodyPrompt,
          autoRunRows: 'all' as const,
          integrationConfig: { ...stepIntegrationBase, step_config: { step_number: i, field: 'body' } },
        });
      }
    }

    onAddStepColumns(columns);
    onClose();
  };

  if (!isOpen) return null;

  const subtype = currentConfig?.instantly_subtype ?? 'campaign_config';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700/60 px-6 py-4 shrink-0">
          <h2 className="text-lg font-semibold text-gray-100">
            Edit Instantly Column: {columnLabel}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5 overflow-y-auto">
          {/* Subtype (read-only) */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Column Type
            </label>
            <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-400 font-mono">
              {subtype.replace(/_/g, ' ')}
            </div>
          </div>

          {/* Campaign selector — only for campaign_config and push_action */}
          {(subtype === 'campaign_config' || subtype === 'push_action') && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Campaign
              </label>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading campaigns...
                </div>
              ) : (
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-violet-500"
                >
                  <option value="">Select campaign...</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Field mapping — only for campaign_config */}
          {subtype === 'campaign_config' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Field Mapping
              </label>
              {(['email', 'first_name', 'last_name', 'company_name'] as const).map((field) => (
                <div key={field} className="flex items-center gap-2">
                  <label className="w-28 text-xs text-gray-400 capitalize">
                    {field.replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={(fieldMapping as any)[field] ?? ''}
                    onChange={(e) => setFieldMapping({ ...fieldMapping, [field]: e.target.value })}
                    placeholder="Column key..."
                    className="flex-1 rounded border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-violet-500 placeholder-gray-600"
                  />
                </div>
              ))}
            </div>
          )}

          {subtype === 'campaign_config' && (
            <p className="text-xs text-gray-500">
              Changes will apply to future pushes. Existing leads in the campaign are not affected.
            </p>
          )}

          {/* Add Email Steps — only for campaign_config */}
          {subtype === 'campaign_config' && onAddStepColumns && (
            <div className="border-t border-gray-700/60 pt-4">
              {!showAddSteps ? (
                <button
                  onClick={() => setShowAddSteps(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-600 bg-gray-800/30 px-4 py-3 text-sm font-medium text-gray-300 transition-colors hover:border-violet-500/50 hover:text-violet-300"
                >
                  <Plus className="h-4 w-4" />
                  Add Email Step Columns
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300">Email Steps</label>
                    <button
                      onClick={() => setShowAddSteps(false)}
                      className="text-xs text-gray-500 hover:text-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Generate email subject &amp; body using formulas or AI. Use <code className="rounded bg-gray-800 px-1 text-violet-300">@column_key</code> to reference other columns.
                  </p>

                  {/* Step count */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">Number of Steps</label>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setStepCount(n)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            stepCount === n
                              ? 'border-violet-500 bg-violet-500/15 text-violet-300'
                              : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Per-step config */}
                  {Array.from({ length: stepCount }, (_, i) => {
                    const cfg = stepConfigs[i];
                    if (!cfg) return null;
                    const updateCfg = (patch: Partial<StepContentConfig>) =>
                      setStepConfigs(prev => prev.map((c, j) => j === i ? { ...c, ...patch } : c));
                    return (
                      <div key={i} className="rounded-lg border border-gray-700 bg-gray-800/30 p-3 space-y-2.5">
                        <p className="text-xs font-medium text-gray-300">Step {i + 1}</p>

                        {/* Subject */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-xs text-gray-500">Subject</span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => updateCfg({ subjectMode: 'formula' })}
                                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                                  cfg.subjectMode === 'formula'
                                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/40'
                                    : 'text-gray-500 border border-gray-700 hover:border-gray-600'
                                }`}
                              >
                                <Calculator className="h-3 w-3" />
                                Formula
                              </button>
                              <button
                                onClick={() => updateCfg({ subjectMode: 'ai' })}
                                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                                  cfg.subjectMode === 'ai'
                                    ? 'bg-violet-500/15 text-violet-300 border border-violet-500/40'
                                    : 'text-gray-500 border border-gray-700 hover:border-gray-600'
                                }`}
                              >
                                <Sparkles className="h-3 w-3" />
                                AI Prompt
                              </button>
                            </div>
                          </div>
                          {cfg.subjectMode === 'formula' ? (
                            <input
                              type="text"
                              value={cfg.subjectFormula}
                              onChange={(e) => updateCfg({ subjectFormula: e.target.value })}
                              placeholder='"Hey " & @first_name & ", ..."'
                              className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 font-mono placeholder-gray-600 outline-none focus:border-blue-500"
                            />
                          ) : (
                            <textarea
                              value={cfg.subjectPrompt}
                              onChange={(e) => updateCfg({ subjectPrompt: e.target.value })}
                              placeholder="Write a cold email subject for @first_name at @company_name..."
                              rows={2}
                              className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 outline-none focus:border-violet-500 resize-none"
                            />
                          )}
                        </div>

                        {/* Body */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-xs text-gray-500">Body</span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => updateCfg({ bodyMode: 'formula' })}
                                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                                  cfg.bodyMode === 'formula'
                                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/40'
                                    : 'text-gray-500 border border-gray-700 hover:border-gray-600'
                                }`}
                              >
                                <Calculator className="h-3 w-3" />
                                Formula
                              </button>
                              <button
                                onClick={() => updateCfg({ bodyMode: 'ai' })}
                                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                                  cfg.bodyMode === 'ai'
                                    ? 'bg-violet-500/15 text-violet-300 border border-violet-500/40'
                                    : 'text-gray-500 border border-gray-700 hover:border-gray-600'
                                }`}
                              >
                                <Sparkles className="h-3 w-3" />
                                AI Prompt
                              </button>
                            </div>
                          </div>
                          {cfg.bodyMode === 'formula' ? (
                            <textarea
                              value={cfg.bodyFormula}
                              onChange={(e) => updateCfg({ bodyFormula: e.target.value })}
                              placeholder='"Hi " & @first_name & "..."'
                              rows={3}
                              className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 font-mono placeholder-gray-600 outline-none focus:border-blue-500 resize-none"
                            />
                          ) : (
                            <textarea
                              value={cfg.bodyPrompt}
                              onChange={(e) => updateCfg({ bodyPrompt: e.target.value })}
                              placeholder="Write a personalized cold email body for @first_name at @company_name..."
                              rows={3}
                              className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 outline-none focus:border-violet-500 resize-none"
                            />
                          )}
                        </div>

                        {/* Column reference helper */}
                        {existingColumns.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-gray-600">Columns:</span>
                            {existingColumns.slice(0, 8).map((col) => (
                              <button
                                key={col.key}
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(`@${col.key}`);
                                  toast.success(`Copied @${col.key}`);
                                }}
                                className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400 hover:text-violet-300 hover:bg-gray-700 transition-colors"
                                title={`Click to copy @${col.key}`}
                              >
                                @{col.key}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <button
                    onClick={handleAddSteps}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
                  >
                    <Plus className="h-4 w-4" />
                    Add {stepCount * 2} Step Columns
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-700/60 px-6 py-4 shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            <Send className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditInstantlySettingsModal;

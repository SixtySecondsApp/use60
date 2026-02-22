/**
 * CustomMethodologyWizard
 *
 * Multi-step dialog for creating a custom sales methodology:
 *   Step 1: Name + description
 *   Step 2: Pick base methodology to fork from
 *   Step 3: Edit qualification criteria
 *   Step 4: Edit stage rules
 *
 * Saves as a new row in agent_methodology_templates (using edge function /
 * agent-config-admin) and stores the custom methodology key as an org override.
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useMethodologies, useSetOrgOverride } from '@/lib/hooks/useAgentConfig';
import { supabase } from '@/lib/supabase/clientV2';
import type { MethodologyTemplate } from '@/lib/services/agentConfigService';

const STEP_LABELS = ['Name & Description', 'Base Framework', 'Qualification Criteria', 'Stage Rules'];

interface Props {
  orgId: string;
  onClose: () => void;
}

interface CriteriaItem {
  key: string;
  label: string;
  threshold: number;
}

interface StageRule {
  stageName: string;
  criteria: string[];
}

export function CustomMethodologyWizard({ orgId, onClose }: Props) {
  const { data: methodologies } = useMethodologies();
  const setOrgOverride = useSetOrgOverride();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Step 2
  const [baseKey, setBaseKey] = useState<string>('generic');

  // Step 3
  const [criteria, setCriteria] = useState<CriteriaItem[]>([]);
  const [newCriteriaLabel, setNewCriteriaLabel] = useState('');

  // Step 4
  const [stageRules, setStageRules] = useState<StageRule[]>([
    { stageName: 'discovery', criteria: [] },
    { stageName: 'qualification', criteria: [] },
    { stageName: 'proposal', criteria: [] },
    { stageName: 'negotiation', criteria: [] },
  ]);

  function handleBaseSelect(key: string) {
    setBaseKey(key);
    // Pre-populate criteria from base methodology
    const base = methodologies?.find((m) => m.methodology_key === key);
    if (base) {
      const qc = base.qualification_criteria ?? {};
      const requiredFields: string[] = (qc as any).required_fields ?? Object.keys(qc).filter(k => k !== 'framework' && k !== 'scoring' && k !== 'question_types' && k !== 'progression_score' && k !== 'key_behaviors' && k !== 'key_signals' && k !== 'commercial_insight_required');
      setCriteria(
        requiredFields.map((f) => ({
          key: f,
          label: f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          threshold: 70,
        }))
      );
    }
  }

  function addCriteria() {
    const label = newCriteriaLabel.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/\s+/g, '_');
    if (criteria.find((c) => c.key === key)) return;
    setCriteria((prev) => [...prev, { key, label, threshold: 70 }]);
    setNewCriteriaLabel('');
  }

  function removeCriteria(key: string) {
    setCriteria((prev) => prev.filter((c) => c.key !== key));
  }

  function updateCriteriaThreshold(key: string, threshold: number) {
    setCriteria((prev) => prev.map((c) => c.key === key ? { ...c, threshold } : c));
  }

  function updateStageCriteria(index: number, value: string) {
    setStageRules((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        criteria: value.split(',').map((s) => s.trim()).filter(Boolean),
      };
      return next;
    });
  }

  function canGoNext(): boolean {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return !!baseKey;
    return true;
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Please enter a methodology name');
      return;
    }

    setSaving(true);
    try {
      // Build custom methodology key from name
      const customKey = `custom_${name.trim().toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;

      // Build qualification_criteria object
      const qcObj: Record<string, unknown> = { framework: 'custom' };
      criteria.forEach((c) => {
        qcObj[c.key] = { threshold: c.threshold };
      });

      // Build stage_rules object
      const srObj: Record<string, string[]> = {};
      stageRules.forEach((sr) => {
        if (sr.criteria.length > 0) {
          srObj[sr.stageName] = sr.criteria;
        }
      });

      // Save as org override: custom_methodologies is a JSONB array of custom templates
      const { data: currentConfig } = await supabase.functions.invoke('agent-config-admin', {
        body: { action: 'get_config', org_id: orgId, agent_type: 'global' },
      });
      const existingCustom =
        (currentConfig?.config?.entries?.['custom_methodologies']?.config_value as MethodologyTemplate[]) ?? [];

      const newTemplate: MethodologyTemplate = {
        id: customKey,
        methodology_key: customKey,
        name: name.trim(),
        description: description.trim(),
        qualification_criteria: qcObj,
        stage_rules: srObj,
        coaching_focus: {},
      };

      await setOrgOverride.mutateAsync({
        orgId,
        agentType: 'global',
        configKey: 'custom_methodologies',
        configValue: [...existingCustom, newTemplate],
      });

      toast.success(`Custom methodology "${name}" created`);
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? 'Failed to create custom methodology');
    } finally {
      setSaving(false);
    }
  }

  const baseTemplate = methodologies?.find((m) => m.methodology_key === baseKey);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Custom Methodology</DialogTitle>
          <DialogDescription>
            Fork an existing framework and tailor it to your sales process.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-2">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div
                className={[
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0',
                  i < step ? 'bg-emerald-500 text-white' :
                  i === step ? 'bg-emerald-500/20 text-emerald-600 border border-emerald-500' :
                  'bg-gray-100 dark:bg-gray-800 text-gray-400',
                ].join(' ')}
              >
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={`h-px flex-1 ${i < step ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mb-4">{STEP_LABELS[step]}</p>

        {/* Step 0: Name & description */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="meth-name">Methodology name</Label>
              <Input
                id="meth-name"
                placeholder="e.g. Enterprise MEDDIC Lite"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meth-desc">Description</Label>
              <Textarea
                id="meth-desc"
                placeholder="Briefly describe when to use this methodology…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Step 1: Base methodology */}
        {step === 1 && (
          <div className="grid grid-cols-1 gap-2">
            {(methodologies ?? []).map((m) => (
              <button
                key={m.methodology_key}
                onClick={() => handleBaseSelect(m.methodology_key)}
                className={[
                  'text-left p-3 rounded-xl border transition-all',
                  baseKey === m.methodology_key
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-emerald-400',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{m.name}</span>
                  {baseKey === m.methodology_key && (
                    <Check className="w-4 h-4 text-emerald-500" />
                  )}
                </div>
                {m.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{m.description}</p>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Qualification criteria */}
        {step === 2 && (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {criteria.map((c) => (
              <div key={c.key} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
                <span className="flex-1 text-sm">{c.label}</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={c.threshold}
                  onChange={(e) => updateCriteriaThreshold(c.key, Number(e.target.value))}
                  className="w-16 h-7 text-xs"
                />
                <span className="text-xs text-gray-400">%</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                  onClick={() => removeCriteria(c.key)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                placeholder="Add criterion…"
                value={newCriteriaLabel}
                onChange={(e) => setNewCriteriaLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCriteria()}
                className="text-sm h-8"
              />
              <Button variant="outline" size="sm" onClick={addCriteria} className="h-8">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Stage rules */}
        {step === 3 && (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            <p className="text-xs text-gray-500">Enter comma-separated criteria required to advance to each stage.</p>
            {stageRules.map((sr, i) => (
              <div key={sr.stageName} className="space-y-1">
                <Label className="text-xs capitalize">{sr.stageName}</Label>
                <Input
                  placeholder="e.g. budget_confirmed, champion_identified"
                  value={sr.criteria.join(', ')}
                  onChange={(e) => updateStageCriteria(i, e.target.value)}
                  className="text-sm h-8"
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex justify-between gap-2 mt-4">
          <Button variant="ghost" onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}>
            {step === 0 ? 'Cancel' : (
              <>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </>
            )}
          </Button>
          <div className="flex gap-2">
            {step < STEP_LABELS.length - 1 ? (
              <Button
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canGoNext()}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={handleSave}
                disabled={saving || !name.trim()}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Create Methodology
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

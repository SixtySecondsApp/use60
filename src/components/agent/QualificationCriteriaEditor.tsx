/**
 * QualificationCriteriaEditor
 *
 * Renders methodology-specific qualification criteria with:
 * - MEDDIC: 6 element cards with completeness thresholds
 * - BANT: 4 elements with scoring weight sliders
 * - Generic/Custom: free-form criteria list
 *
 * Saves to agent_config_org_overrides with key 'qualification_criteria'.
 */

import { useState, useEffect } from 'react';
import { Plus, Save, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useSetOrgOverride, useAgentConfig } from '@/lib/hooks/useAgentConfig';

// ─── Static definitions ────────────────────────────────────────────────────

interface CriteriaDefinition {
  key: string;
  label: string;
  description: string;
}

const MEDDIC_CRITERIA: CriteriaDefinition[] = [
  { key: 'metrics', label: 'Metrics', description: 'Quantifiable business impact' },
  { key: 'economic_buyer', label: 'Economic Buyer', description: 'Decision maker with budget authority' },
  { key: 'decision_criteria', label: 'Decision Criteria', description: 'Requirements for purchase decision' },
  { key: 'decision_process', label: 'Decision Process', description: 'Steps to make the decision' },
  { key: 'identify_pain', label: 'Identify Pain', description: 'Business problem being solved' },
  { key: 'champion', label: 'Champion', description: 'Internal advocate for your solution' },
];

const BANT_CRITERIA: CriteriaDefinition[] = [
  { key: 'budget', label: 'Budget', description: 'Available budget for the solution' },
  { key: 'authority', label: 'Authority', description: 'Power to make the purchasing decision' },
  { key: 'need', label: 'Need', description: 'Identified business requirement' },
  { key: 'timeline', label: 'Timeline', description: 'Expected purchase timeframe' },
];

const SPIN_CRITERIA: CriteriaDefinition[] = [
  { key: 'situation', label: 'Situation', description: 'Current state of the prospect' },
  { key: 'problem', label: 'Problem', description: 'Core challenge or pain point' },
  { key: 'implication', label: 'Implication', description: 'Consequences of the problem' },
  { key: 'need_payoff', label: 'Need-Payoff', description: 'Value of solving the problem' },
];

const CHALLENGER_CRITERIA: CriteriaDefinition[] = [
  { key: 'teach', label: 'Teach', description: 'Commercial insights shared with prospect' },
  { key: 'tailor', label: 'Tailor', description: 'Messaging tailored to stakeholder' },
  { key: 'take_control', label: 'Take Control', description: 'Drive the buying process' },
];

function getCriteriaForMethodology(key: string): CriteriaDefinition[] | null {
  switch (key) {
    case 'meddic': return MEDDIC_CRITERIA;
    case 'bant': return BANT_CRITERIA;
    case 'spin': return SPIN_CRITERIA;
    case 'challenger': return CHALLENGER_CRITERIA;
    default: return null;
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface CriteriaValue {
  threshold?: number; // 0-100 completeness %
  weight?: number;    // 0-100 scoring weight
  description?: string;
}

type CriteriaMap = Record<string, CriteriaValue>;

interface QualificationCriteriaEditorProps {
  orgId: string;
  methodologyKey: string;
  disabled?: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function QualificationCriteriaEditor({
  orgId,
  methodologyKey,
  disabled = false,
}: QualificationCriteriaEditorProps) {
  const setOrgOverride = useSetOrgOverride();
  const { data: config } = useAgentConfig(orgId, 'global');

  const predefinedCriteria = getCriteriaForMethodology(methodologyKey);
  const isGeneric = predefinedCriteria === null;

  const [criteriaMap, setCriteriaMap] = useState<CriteriaMap>({});
  const [customCriteria, setCustomCriteria] = useState<string[]>([]);
  const [newCriteriaName, setNewCriteriaName] = useState('');
  const [dirty, setDirty] = useState(false);

  // Initialise from saved config
  useEffect(() => {
    const saved = config?.entries?.['qualification_criteria']?.config_value as CriteriaMap | undefined;
    if (saved) {
      setCriteriaMap(saved);
      if (isGeneric) {
        setCustomCriteria(Object.keys(saved));
      }
    } else if (predefinedCriteria) {
      // Default thresholds / weights
      const defaults: CriteriaMap = {};
      predefinedCriteria.forEach((c) => {
        defaults[c.key] = methodologyKey === 'bant'
          ? { weight: 25 }
          : { threshold: 70 };
      });
      setCriteriaMap(defaults);
    }
  }, [config, methodologyKey]);

  function updateValue(key: string, field: 'threshold' | 'weight', value: number) {
    setCriteriaMap((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
    setDirty(true);
  }

  function addCustomCriteria() {
    const name = newCriteriaName.trim();
    if (!name || customCriteria.includes(name)) return;
    setCustomCriteria((prev) => [...prev, name]);
    setCriteriaMap((prev) => ({ ...prev, [name]: { threshold: 70 } }));
    setNewCriteriaName('');
    setDirty(true);
  }

  function removeCustomCriteria(name: string) {
    setCustomCriteria((prev) => prev.filter((c) => c !== name));
    setCriteriaMap((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setDirty(true);
  }

  async function handleSave() {
    try {
      await setOrgOverride.mutateAsync({
        orgId,
        agentType: 'global',
        configKey: 'qualification_criteria',
        configValue: criteriaMap,
      });
      setDirty(false);
    } catch {
      // error toast from mutation
    }
  }

  // ─── Render helpers ─────────────────────────────────────────────────────

  function renderMeddicCard(def: CriteriaDefinition) {
    const val = criteriaMap[def.key] ?? { threshold: 70 };
    return (
      <div
        key={def.key}
        className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700/50"
      >
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{def.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{def.description}</p>
          </div>
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 ml-2">
            {val.threshold ?? 70}%
          </span>
        </div>
        <div className="mt-3">
          <Label className="text-xs text-gray-500 mb-1 block">Completeness threshold</Label>
          <Slider
            value={[val.threshold ?? 70]}
            min={0}
            max={100}
            step={5}
            disabled={disabled}
            onValueChange={([v]) => updateValue(def.key, 'threshold', v)}
            className="w-full"
          />
        </div>
      </div>
    );
  }

  function renderBantCard(def: CriteriaDefinition) {
    const val = criteriaMap[def.key] ?? { weight: 25 };
    return (
      <div
        key={def.key}
        className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700/50"
      >
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{def.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{def.description}</p>
          </div>
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 ml-2">
            {val.weight ?? 25}%
          </span>
        </div>
        <div className="mt-3">
          <Label className="text-xs text-gray-500 mb-1 block">Scoring weight</Label>
          <Slider
            value={[val.weight ?? 25]}
            min={0}
            max={100}
            step={5}
            disabled={disabled}
            onValueChange={([v]) => updateValue(def.key, 'weight', v)}
            className="w-full"
          />
        </div>
      </div>
    );
  }

  // ─── Main render ────────────────────────────────────────────────────────

  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-gray-200 dark:border-gray-800/60">
      <CardHeader>
        <CardTitle className="text-base">Qualification Criteria</CardTitle>
        <CardDescription>
          Configure how the AI evaluates deal qualification for the{' '}
          <span className="font-medium capitalize">{methodologyKey}</span> methodology.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Predefined criteria */}
        {predefinedCriteria && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {predefinedCriteria.map((def) =>
              methodologyKey === 'bant' ? renderBantCard(def) : renderMeddicCard(def)
            )}
          </div>
        )}

        {/* Generic / custom criteria */}
        {isGeneric && (
          <div className="space-y-3">
            {customCriteria.map((name) => (
              <div
                key={name}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700/50"
              >
                <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{name}</span>
                <div className="flex items-center gap-2 w-36">
                  <Slider
                    value={[criteriaMap[name]?.threshold ?? 70]}
                    min={0}
                    max={100}
                    step={5}
                    disabled={disabled}
                    onValueChange={([v]) => updateValue(name, 'threshold', v)}
                  />
                  <span className="text-xs text-emerald-600 w-8 text-right">
                    {criteriaMap[name]?.threshold ?? 70}%
                  </span>
                </div>
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                    onClick={() => removeCustomCriteria(name)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}

            {/* Add new */}
            {!disabled && (
              <div className="flex gap-2">
                <Input
                  placeholder="New criteria name…"
                  value={newCriteriaName}
                  onChange={(e) => setNewCriteriaName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomCriteria()}
                  className="text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addCustomCriteria}
                  disabled={!newCriteriaName.trim()}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Save button */}
        {!disabled && dirty && (
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={handleSave}
              disabled={setOrgOverride.isPending}
            >
              {setOrgOverride.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Criteria
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

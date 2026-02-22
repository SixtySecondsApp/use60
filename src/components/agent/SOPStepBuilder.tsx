/**
 * SOPStepBuilder
 * SOP-004: Ordered step builder with add/remove/reorder and type-specific config forms.
 * Uses simple up/down arrow reordering (no external DnD lib required).
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Database,
  Mail,
  Bell,
  UserCheck,
  CheckSquare,
  Wrench,
  ChevronDown as ChevronDownFold,
  ChevronRight as ChevronRightFold,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import CRMActionStep, { type CRMActionConfig } from './steps/CRMActionStep';
import EmailDraftStep, { type EmailDraftConfig } from './steps/EmailDraftStep';
import AlertStep, { type AlertConfig } from './steps/AlertStep';
import EnrichStep, { type EnrichConfig } from './steps/EnrichStep';
import TaskStep, { type TaskConfig } from './steps/TaskStep';

// ============================================================
// Types
// ============================================================

export type StepActionType =
  | 'crm_action'
  | 'draft_email'
  | 'alert_rep'
  | 'alert_manager'
  | 'enrich_contact'
  | 'create_task'
  | 'custom';

export interface SOPStep {
  id: string; // client-side only
  step_order: number;
  action_type: StepActionType;
  action_config: Record<string, unknown>;
  requires_approval: boolean;
}

// ============================================================
// Credit cost per step type
// ============================================================

const STEP_CREDIT_COSTS: Record<StepActionType, number> = {
  crm_action: 0.5,
  draft_email: 1.0,
  alert_rep: 0.2,
  alert_manager: 0.2,
  enrich_contact: 2.0,
  create_task: 0.3,
  custom: 1.0,
};

// ============================================================
// Step type metadata
// ============================================================

interface StepTypeOption {
  value: StepActionType;
  label: string;
  description: string;
  icon: React.ElementType;
  credits: number;
}

const STEP_TYPES: StepTypeOption[] = [
  { value: 'crm_action', label: 'CRM Action', description: 'Update a CRM field or log activity', icon: Database, credits: STEP_CREDIT_COSTS.crm_action },
  { value: 'draft_email', label: 'Draft Email', description: 'AI-draft an email for rep review', icon: Mail, credits: STEP_CREDIT_COSTS.draft_email },
  { value: 'alert_rep', label: 'Alert Rep', description: 'Send a notification to the rep', icon: Bell, credits: STEP_CREDIT_COSTS.alert_rep },
  { value: 'alert_manager', label: 'Alert Manager', description: 'Send a notification to the manager', icon: Bell, credits: STEP_CREDIT_COSTS.alert_manager },
  { value: 'enrich_contact', label: 'Enrich Contact', description: 'Pull intelligence on a contact or company', icon: UserCheck, credits: STEP_CREDIT_COSTS.enrich_contact },
  { value: 'create_task', label: 'Create Task', description: 'Create a follow-up task in CRM', icon: CheckSquare, credits: STEP_CREDIT_COSTS.create_task },
  { value: 'custom', label: 'Custom', description: 'Custom action via AI', icon: Wrench, credits: STEP_CREDIT_COSTS.custom },
];

function getDefaultConfig(type: StepActionType): Record<string, unknown> {
  switch (type) {
    case 'crm_action': return { action: '', description: '' };
    case 'draft_email': return { template: 'custom', tone: 'professional' };
    case 'alert_rep':
    case 'alert_manager': return { channel: 'slack', message: '' };
    case 'enrich_contact': return { enrich_type: 'contact_profile' };
    case 'create_task': return { title: '', priority: 'medium' };
    case 'custom': return { description: '' };
    default: return {};
  }
}

function stepLabel(type: StepActionType): string {
  return STEP_TYPES.find((s) => s.value === type)?.label ?? type;
}

function StepIcon({ type }: { type: StepActionType }) {
  const Icon = STEP_TYPES.find((s) => s.value === type)?.icon ?? Wrench;
  return <Icon className="w-4 h-4" />;
}

// ============================================================
// Step config form renderer
// ============================================================

function StepConfigForm({
  step,
  onChange,
  disabled,
}: {
  step: SOPStep;
  onChange: (config: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  switch (step.action_type) {
    case 'crm_action':
      return (
        <CRMActionStep
          value={step.action_config as CRMActionConfig}
          onChange={(c) => onChange(c as Record<string, unknown>)}
          disabled={disabled}
        />
      );
    case 'draft_email':
      return (
        <EmailDraftStep
          value={step.action_config as EmailDraftConfig}
          onChange={(c) => onChange(c as Record<string, unknown>)}
          disabled={disabled}
        />
      );
    case 'alert_rep':
    case 'alert_manager':
      return (
        <AlertStep
          value={step.action_config as AlertConfig}
          onChange={(c) => onChange(c as Record<string, unknown>)}
          disabled={disabled}
          variant={step.action_type === 'alert_manager' ? 'manager' : 'rep'}
        />
      );
    case 'enrich_contact':
      return (
        <EnrichStep
          value={step.action_config as EnrichConfig}
          onChange={(c) => onChange(c as Record<string, unknown>)}
          disabled={disabled}
        />
      );
    case 'create_task':
      return (
        <TaskStep
          value={step.action_config as TaskConfig}
          onChange={(c) => onChange(c as Record<string, unknown>)}
          disabled={disabled}
        />
      );
    default:
      return (
        <p className="text-xs text-gray-400 italic">
          Custom step — configure via the AI copilot at runtime.
        </p>
      );
  }
}

// ============================================================
// Main component
// ============================================================

interface Props {
  steps: SOPStep[];
  onChange: (steps: SOPStep[]) => void;
  disabled?: boolean;
}

export default function SOPStepBuilder({ steps, onChange, disabled }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [addingStep, setAddingStep] = useState(false);

  const totalCredits = steps.reduce(
    (sum, s) => sum + (STEP_CREDIT_COSTS[s.action_type] ?? 0),
    0,
  );

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addStep(type: StepActionType) {
    const newStep: SOPStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      step_order: steps.length + 1,
      action_type: type,
      action_config: getDefaultConfig(type),
      requires_approval: type === 'draft_email',
    };
    const updated = [...steps, newStep];
    onChange(updated.map((s, i) => ({ ...s, step_order: i + 1 })));
    setExpandedIds((prev) => new Set([...prev, newStep.id]));
    setAddingStep(false);
  }

  function removeStep(id: string) {
    const updated = steps.filter((s) => s.id !== id);
    onChange(updated.map((s, i) => ({ ...s, step_order: i + 1 })));
  }

  function moveStep(id: string, direction: 'up' | 'down') {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === steps.length - 1) return;
    const newSteps = [...steps];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newSteps[idx], newSteps[swapIdx]] = [newSteps[swapIdx], newSteps[idx]];
    onChange(newSteps.map((s, i) => ({ ...s, step_order: i + 1 })));
  }

  function updateStepConfig(id: string, config: Record<string, unknown>) {
    onChange(steps.map((s) => (s.id === id ? { ...s, action_config: config } : s)));
  }

  function updateApproval(id: string, checked: boolean) {
    onChange(steps.map((s) => (s.id === id ? { ...s, requires_approval: checked } : s)));
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Steps <span className="text-gray-400 font-normal">({steps.length})</span>
          </p>
          {steps.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              Estimated cost: <span className="font-medium text-[#37bd7e]">{totalCredits.toFixed(1)} credits</span> per execution
            </p>
          )}
        </div>
        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddingStep((v) => !v)}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Step
          </Button>
        )}
      </div>

      {/* Step type selector */}
      {addingStep && !disabled && (
        <div className="border border-dashed border-[#37bd7e]/50 rounded-xl p-3 bg-[#37bd7e]/5 dark:bg-[#37bd7e]/10">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Select step type</p>
          <div className="grid grid-cols-2 gap-1.5">
            {STEP_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => addStep(type.value)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 hover:border-[#37bd7e]/50 text-left transition-colors"
                >
                  <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{type.label}</p>
                    <p className="text-[10px] text-gray-400">{type.credits} credit{type.credits !== 1 ? 's' : ''}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 text-xs text-gray-400"
            onClick={() => setAddingStep(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Empty state */}
      {steps.length === 0 && !addingStep && (
        <div className="border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400">No steps yet. Add your first step above.</p>
        </div>
      )}

      {/* Step list */}
      <div className="space-y-2">
        {steps.map((step, idx) => {
          const expanded = expandedIds.has(step.id);
          const credits = STEP_CREDIT_COSTS[step.action_type] ?? 0;
          return (
            <div
              key={step.id}
              className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl overflow-hidden"
            >
              {/* Step header */}
              <div className="flex items-center gap-2 p-3">
                {/* Step number */}
                <div className="w-6 h-6 rounded-full bg-[#37bd7e]/10 dark:bg-[#37bd7e]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-[#37bd7e]">{idx + 1}</span>
                </div>

                {/* Icon + label */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className="text-gray-500 dark:text-gray-400">
                    <StepIcon type={step.action_type} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {stepLabel(step.action_type)}
                  </span>
                  {step.requires_approval && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-400/50 text-amber-600 dark:text-amber-400 flex-shrink-0">
                      Approval
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 flex-shrink-0">
                    {credits} cr
                  </Badge>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!disabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => moveStep(step.id, 'up')}
                        disabled={idx === 0}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(step.id, 'down')}
                        disabled={idx === steps.length - 1}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStep(step.id)}
                        className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(step.id)}
                    className="p-1 rounded text-gray-400 hover:text-gray-600"
                  >
                    {expanded ? (
                      <ChevronDownFold className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRightFold className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded config */}
              {expanded && (
                <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
                  <StepConfigForm
                    step={step}
                    onChange={(config) => updateStepConfig(step.id, config)}
                    disabled={disabled}
                  />

                  {/* Approval toggle */}
                  <div className={cn(
                    'flex items-center gap-3 rounded-lg p-2.5 border',
                    step.requires_approval
                      ? 'border-amber-300/50 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-900/10'
                      : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30'
                  )}>
                    <Checkbox
                      id={`approval-${step.id}`}
                      checked={step.requires_approval}
                      onCheckedChange={(checked) => !disabled && updateApproval(step.id, checked === true)}
                      disabled={disabled}
                    />
                    <Label htmlFor={`approval-${step.id}`} className="text-sm cursor-pointer select-none">
                      Requires rep approval before executing
                    </Label>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Total credit summary */}
      {steps.length > 0 && (
        <div className="flex items-center justify-end gap-2 text-xs text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-800">
          <span>Total estimated:</span>
          <span className="font-semibold text-[#37bd7e]">{totalCredits.toFixed(1)} credits / execution</span>
        </div>
      )}
    </div>
  );
}

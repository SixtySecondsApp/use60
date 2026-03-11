/**
 * SvgAnimationColumnWizard — Inline wizard for creating a Gemini SVG animation column in Ops.
 *
 * Steps:
 *   1. Prompt Template
 *   2. Complexity
 *   3. Cost Preview & Create
 */

import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Type,
  Settings,
  DollarSign,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { INTEGRATION_CREDIT_COSTS, formatCredits } from '@/lib/config/creditPacks';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SvgAnimationColumnConfig {
  prompt_template: string;
  complexity: 'simple' | 'medium' | 'complex';
}

interface SvgAnimationColumnWizardProps {
  tableId: string;
  existingColumns: Array<{ key: string; label: string; column_type: string }>;
  onComplete: (config: SvgAnimationColumnConfig) => void;
  onCancel: () => void;
  initialConfig?: SvgAnimationColumnConfig;
}

type WizardStep = 'prompt' | 'complexity' | 'preview';

const STEP_LABELS: Record<WizardStep, string> = {
  prompt: 'Prompt Template',
  complexity: 'Complexity',
  preview: 'Cost Preview',
};

const ALL_STEPS: WizardStep[] = ['prompt', 'complexity', 'preview'];

// ─── Complexity options ──────────────────────────────────────────────────────

const COMPLEXITY_OPTIONS: Array<{
  value: SvgAnimationColumnConfig['complexity'];
  label: string;
  credits: number;
  description: string;
}> = [
  {
    value: 'simple',
    label: 'Simple',
    credits: INTEGRATION_CREDIT_COSTS.gemini_svg_simple,
    description: 'Spinners, checkmarks, simple icons. Fast generation.',
  },
  {
    value: 'medium',
    label: 'Medium',
    credits: INTEGRATION_CREDIT_COSTS.gemini_svg_medium,
    description: 'Scenes, illustrations, onboarding animations. Moderate detail.',
  },
  {
    value: 'complex',
    label: 'Complex',
    credits: INTEGRATION_CREDIT_COSTS.gemini_svg_complex,
    description: 'Narrative sequences, isometric scenes, interactive. Highest quality.',
  },
];

// ─── Credit cost lookup ──────────────────────────────────────────────────────

const COMPLEXITY_CREDIT_MAP: Record<SvgAnimationColumnConfig['complexity'], number> = {
  simple: INTEGRATION_CREDIT_COSTS.gemini_svg_simple,
  medium: INTEGRATION_CREDIT_COSTS.gemini_svg_medium,
  complex: INTEGRATION_CREDIT_COSTS.gemini_svg_complex,
};

// ─── Component ───────────────────────────────────────────────────────────────

export function SvgAnimationColumnWizard({
  existingColumns,
  onComplete,
  onCancel,
  initialConfig,
}: SvgAnimationColumnWizardProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>('prompt');
  const [config, setConfig] = useState<SvgAnimationColumnConfig>({
    prompt_template: initialConfig?.prompt_template ?? '',
    complexity: initialConfig?.complexity ?? 'medium',
  });
  const [error, setError] = useState<string | null>(null);

  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const stepIndex = ALL_STEPS.indexOf(step);

  const estimatedCostPerSvg = COMPLEXITY_CREDIT_MAP[config.complexity];

  // ── Navigation helpers ─────────────────────────────────────────────────────

  function goNext() {
    setError(null);

    if (step === 'prompt') {
      if (!config.prompt_template.trim()) {
        setError('Please enter a prompt template.');
        return;
      }
    }

    const nextIndex = stepIndex + 1;
    if (nextIndex < ALL_STEPS.length) {
      setStep(ALL_STEPS[nextIndex]);
    }
  }

  function goBack() {
    setError(null);
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setStep(ALL_STEPS[prevIndex]);
    }
  }

  function handleCreate() {
    if (!config.prompt_template.trim()) {
      toast.error('Prompt template is required');
      return;
    }
    onComplete(config);
  }

  // ── Prompt variable insertion ──────────────────────────────────────────────

  function insertVariable(key: string) {
    const ta = promptTextareaRef.current;
    const snippet = `{{${key}}}`;
    if (!ta) {
      setConfig((c) => ({ ...c, prompt_template: c.prompt_template + snippet }));
      return;
    }
    const start = ta.selectionStart ?? config.prompt_template.length;
    const end = ta.selectionEnd ?? config.prompt_template.length;
    const next =
      config.prompt_template.slice(0, start) + snippet + config.prompt_template.slice(end);
    setConfig((c) => ({ ...c, prompt_template: next }));
    // Restore focus + cursor position after React re-render
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {ALL_STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                i === stepIndex
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : i < stepIndex
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-gray-600'
              }`}
            >
              {i < stepIndex ? (
                <Check className="w-3 h-3" />
              ) : (
                <span className="text-[10px]">{i + 1}</span>
              )}
              {STEP_LABELS[s]}
            </div>
            {i < ALL_STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-gray-700 shrink-0" />}
          </React.Fragment>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* ── Step 1: Prompt Template ──────────────────────────────────────── */}
      {step === 'prompt' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3.5 py-3">
            <Type className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
            <p className="text-xs text-gray-300">
              Describe the SVG animation. Be specific about motion, colors, and choreography. Use{' '}
              <span className="font-mono text-purple-300">{'{{column_key}}'}</span> to insert values
              from each row.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Prompt Template
            </label>
            <textarea
              ref={promptTextareaRef}
              value={config.prompt_template}
              onChange={(e) => setConfig((c) => ({ ...c, prompt_template: e.target.value }))}
              placeholder="An animated logo for {{company_name}} with their brand color {{brand_color}} pulsing gently"
              rows={4}
              className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
            />
            <p className="mt-1 text-[11px] text-gray-600">
              Tip: Describe scene composition, color palette, animation style, and timing.
            </p>
          </div>

          {/* Variable chips */}
          {existingColumns.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">
                Insert Variable
              </p>
              <div className="flex flex-wrap gap-1.5">
                {existingColumns.map((col) => (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => insertVariable(col.key)}
                    className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-[11px] text-gray-300 hover:border-purple-500/40 hover:text-purple-300 transition-colors"
                  >
                    <span className="font-mono text-[10px] text-purple-400">&#123;&#123;</span>
                    {col.label}
                    <span className="font-mono text-[10px] text-purple-400">&#125;&#125;</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Complexity ───────────────────────────────────────────── */}
      {step === 'complexity' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3.5 py-3">
            <Settings className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
            <p className="text-xs text-gray-300">
              Choose the animation complexity. Higher complexity produces richer animations but uses
              more credits.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {COMPLEXITY_OPTIONS.map((opt) => {
              const isSelected = config.complexity === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setConfig((c) => ({ ...c, complexity: opt.value }));
                    setError(null);
                  }}
                  className={`w-full text-left rounded-lg border px-3.5 py-3 transition-all ${
                    isSelected
                      ? 'border-purple-500/50 bg-purple-500/10 ring-1 ring-purple-500/30'
                      : 'border-gray-700/50 bg-gray-800/30 hover:border-gray-600/50 hover:bg-gray-800/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-100">{opt.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-sm font-semibold text-purple-300">
                        {formatCredits(opt.credits)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 3: Cost Preview ──────────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-3">
            <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-xs text-gray-300">
              Review your configuration and estimated credit usage before creating the column.
            </p>
          </div>

          {/* Settings summary */}
          <div className="rounded-lg border border-gray-700/50 bg-gray-800/30 divide-y divide-gray-700/30">
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-xs text-gray-500">Complexity</span>
              <span className="text-xs font-medium text-gray-200 capitalize">{config.complexity}</span>
            </div>
          </div>

          {/* Cost breakdown */}
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-3.5 py-3 space-y-2">
            <p className="text-xs font-medium text-purple-300 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Credit Cost Estimate
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">
                  {config.complexity} complexity
                </span>
                <span className="font-semibold text-gray-100">
                  {formatCredits(estimatedCostPerSvg)} per SVG
                </span>
              </div>
              <p className="text-[11px] text-gray-600">
                Charged per generated SVG animation. Credits deducted when a row is processed.
              </p>
            </div>
          </div>

          {/* Prompt preview */}
          {config.prompt_template && (
            <div className="rounded-lg border border-gray-700/50 bg-gray-800/20 px-3.5 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-gray-600 mb-1.5">
                Prompt Template
              </p>
              <p className="text-xs text-gray-400 leading-relaxed break-words">
                {config.prompt_template}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
        <button
          type="button"
          onClick={stepIndex === 0 ? onCancel : goBack}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          {stepIndex === 0 ? 'Cancel' : 'Back'}
        </button>

        {step === 'preview' ? (
          <button
            type="button"
            onClick={handleCreate}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-500 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Create Column
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-500 transition-colors"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

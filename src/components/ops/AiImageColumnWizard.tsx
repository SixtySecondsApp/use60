/**
 * AiImageColumnWizard — Inline wizard for creating a fal.ai image generation column in Ops.
 *
 * Steps:
 *   1. Prompt Template
 *   2. Image Settings (resolution, aspect ratio)
 *   3. Cost Preview & Create
 */

import React, { useState, useRef } from 'react';
import {
  Image,
  Type,
  Settings,
  DollarSign,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { INTEGRATION_CREDIT_COSTS, formatCredits } from '@/lib/config/creditPacks';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AiImageColumnConfig {
  model_id: string;           // 'fal-ai/nano-banana-2'
  prompt_template: string;    // with {{column_key}} variables
  resolution: string;         // '0.5K' | '1K' | '2K' | '4K'
  aspect_ratio: string;       // '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3'
}

interface AiImageColumnWizardProps {
  tableId: string;
  existingColumns: Array<{ key: string; label: string; column_type: string }>;
  onComplete: (config: AiImageColumnConfig) => void;
  onCancel: () => void;
  initialConfig?: AiImageColumnConfig;
}

type WizardStep = 'prompt' | 'settings' | 'preview';

const STEP_LABELS: Record<WizardStep, string> = {
  prompt: 'Prompt Template',
  settings: 'Image Settings',
  preview: 'Cost Preview',
};

const ALL_STEPS: WizardStep[] = ['prompt', 'settings', 'preview'];

// ─── Resolution / Aspect Ratio options ──────────────────────────────────────

const RESOLUTION_OPTIONS = [
  { value: '0.5K', label: '0.5K', cost: INTEGRATION_CREDIT_COSTS.nano_banana_2_05k },
  { value: '1K', label: '1K', cost: INTEGRATION_CREDIT_COSTS.nano_banana_2_1k },
  { value: '2K', label: '2K', cost: INTEGRATION_CREDIT_COSTS.nano_banana_2_2k },
  { value: '4K', label: '4K', cost: INTEGRATION_CREDIT_COSTS.nano_banana_2_4k },
] as const;

const ASPECT_RATIO_OPTIONS = [
  { value: '1:1', label: '1:1', description: 'Square' },
  { value: '16:9', label: '16:9', description: 'Landscape' },
  { value: '9:16', label: '9:16', description: 'Portrait' },
  { value: '4:3', label: '4:3', description: 'Standard' },
  { value: '3:4', label: '3:4', description: 'Portrait Std' },
  { value: '3:2', label: '3:2', description: 'Photo' },
  { value: '2:3', label: '2:3', description: 'Photo Portrait' },
] as const;

// ─── Resolution → credit cost mapping ──────────────────────────────────────

const RESOLUTION_CREDIT_MAP: Record<string, number> = {
  '0.5K': INTEGRATION_CREDIT_COSTS.nano_banana_2_05k,
  '1K': INTEGRATION_CREDIT_COSTS.nano_banana_2_1k,
  '2K': INTEGRATION_CREDIT_COSTS.nano_banana_2_2k,
  '4K': INTEGRATION_CREDIT_COSTS.nano_banana_2_4k,
};

// ─── Component ───────────────────────────────────────────────────────────────

export function AiImageColumnWizard({
  tableId,
  existingColumns,
  onComplete,
  onCancel,
  initialConfig,
}: AiImageColumnWizardProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>('prompt');
  const [config, setConfig] = useState<AiImageColumnConfig>({
    model_id: initialConfig?.model_id ?? 'fal-ai/nano-banana-2',
    prompt_template: initialConfig?.prompt_template ?? '',
    resolution: initialConfig?.resolution ?? '1K',
    aspect_ratio: initialConfig?.aspect_ratio ?? '1:1',
  });
  const [error, setError] = useState<string | null>(null);

  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const stepIndex = ALL_STEPS.indexOf(step);

  const estimatedCostPerImage = RESOLUTION_CREDIT_MAP[config.resolution] ?? INTEGRATION_CREDIT_COSTS.nano_banana_2_1k;

  // ── Navigation helpers ─────────────────────────────────────────────────────

  function goNext() {
    setError(null);

    if (step === 'prompt') {
      if (!config.prompt_template.trim()) {
        setError('Please enter a prompt template.');
        return;
      }
    }

    if (step === 'settings') {
      if (!config.resolution) {
        setError('Please select a resolution.');
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
              Describe the image you want to generate for each row. Use{' '}
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
              placeholder={`A professional product photo of {{product_name}} with a clean white background, studio lighting, commercial photography style`}
              rows={4}
              className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
            />
            <p className="mt-1 text-[11px] text-gray-600">
              Tip: Be specific — describe subject, style, lighting, composition, and mood.
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

      {/* ── Step 2: Image Settings ───────────────────────────────────────── */}
      {step === 'settings' && (
        <div className="space-y-5">
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3.5 py-3">
            <Settings className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-xs text-gray-300">
              Configure the output format for generated images.
            </p>
          </div>

          {/* Resolution */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-300">
              <Image className="w-3.5 h-3.5 text-gray-500" /> Resolution
            </label>
            <div className="flex gap-2 flex-wrap">
              {RESOLUTION_OPTIONS.map(({ value, label, cost }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, resolution: value }))}
                  className={`flex flex-col items-center px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    config.resolution === value
                      ? 'border-purple-500/50 bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30'
                      : 'border-gray-700/50 bg-gray-800/30 text-gray-400 hover:border-gray-600/50 hover:text-gray-300'
                  }`}
                >
                  <span className="font-mono">{label}</span>
                  <span className="text-[10px] text-gray-500 mt-0.5 font-normal">
                    {formatCredits(cost)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-300">
              <Settings className="w-3.5 h-3.5 text-gray-500" /> Aspect Ratio
            </label>
            <div className="flex gap-2 flex-wrap">
              {ASPECT_RATIO_OPTIONS.map(({ value, label, description }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, aspect_ratio: value }))}
                  className={`flex flex-col items-center px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    config.aspect_ratio === value
                      ? 'border-purple-500/50 bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30'
                      : 'border-gray-700/50 bg-gray-800/30 text-gray-400 hover:border-gray-600/50 hover:text-gray-300'
                  }`}
                >
                  <span className="font-mono">{label}</span>
                  <span className="text-[10px] text-gray-500 mt-0.5 font-normal">{description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Cost Preview ─────────────────────────────────────────── */}
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
              <span className="text-xs text-gray-500">Model</span>
              <span className="text-xs font-medium text-gray-200">Nano Banana 2</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-xs text-gray-500">Resolution</span>
              <span className="text-xs font-medium text-gray-200">{config.resolution}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-xs text-gray-500">Aspect Ratio</span>
              <span className="text-xs font-medium text-gray-200">{config.aspect_ratio}</span>
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
                  {config.resolution} resolution
                </span>
                <span className="font-semibold text-gray-100">
                  {formatCredits(estimatedCostPerImage)} per image
                </span>
              </div>
              <p className="text-[11px] text-gray-600">
                Charged per generated image. Credits deducted when a row is processed.
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
            <Image className="w-3.5 h-3.5" />
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

/**
 * FalVideoColumnWizard — Inline wizard for creating a fal.ai video generation column in Ops.
 *
 * Steps:
 *   1. Choose AI Model
 *   2. Configure Generation Mode (T2V / I2V)
 *   3. Prompt Template
 *   4. Video Settings (duration, aspect ratio, audio)
 *   5. Cost Preview & Create
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Image,
  Type,
  Settings,
  DollarSign,
  Clock,
  Maximize2,
  Volume2,
  VolumeX,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { INTEGRATION_CREDIT_COSTS, formatCredits } from '@/lib/config/creditPacks';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FalVideoColumnConfig {
  model_id: string;
  mode: 'text-to-video' | 'image-to-video';
  prompt_template: string;
  image_column_key?: string;
  duration: string;
  aspect_ratio: string;
  generate_audio?: boolean;
}

interface FalVideoColumnWizardProps {
  tableId: string;
  existingColumns: Array<{ key: string; label: string; column_type?: string }>;
  onComplete: (config: FalVideoColumnConfig) => void;
  onCancel: () => void;
  initialConfig?: FalVideoColumnConfig;
}

interface FalVideoModel {
  id: string;
  name: string;
  provider: string;
  fal_model_id: string;
  /** fal model ID for I2V mode (may differ from id/fal_model_id which is T2V) */
  fal_model_id_i2v?: string;
  supports_t2v: boolean;
  supports_i2v: boolean;
  max_duration: number;
  supports_audio: boolean;
  credit_cost_per_second: number;
  is_active: boolean;
}

type WizardStep = 'model' | 'mode' | 'prompt' | 'settings' | 'preview';

const STEP_LABELS: Record<WizardStep, string> = {
  model: 'Choose Model',
  mode: 'Mode',
  prompt: 'Prompt Template',
  settings: 'Video Settings',
  preview: 'Cost Preview',
};

const ALL_STEPS: WizardStep[] = ['model', 'mode', 'prompt', 'settings', 'preview'];

// ─── Fallback model list (used when DB query fails) ──────────────────────────

const FALLBACK_MODELS: FalVideoModel[] = [
  {
    id: 'fal-ai/kling-video/v3/pro/text-to-video',
    name: 'Kling 3.0 Pro',
    provider: 'fal.ai',
    fal_model_id: 'fal-ai/kling-video/v3/pro/text-to-video',
    fal_model_id_i2v: 'fal-ai/kling-video/v3/pro/image-to-video',
    supports_t2v: true,
    supports_i2v: true,
    max_duration: 15,
    supports_audio: true,
    credit_cost_per_second: INTEGRATION_CREDIT_COSTS.fal_video_kling_v3_pro,
    is_active: true,
  },
  {
    id: 'fal-ai/kling-video/v2/master/text-to-video',
    name: 'Kling 2.5 Master',
    provider: 'fal.ai',
    fal_model_id: 'fal-ai/kling-video/v2/master/text-to-video',
    supports_t2v: true,
    supports_i2v: false,
    max_duration: 10,
    supports_audio: false,
    credit_cost_per_second: INTEGRATION_CREDIT_COSTS.fal_video_kling_v2_master,
    is_active: true,
  },
  {
    id: 'fal-ai/veo3',
    name: 'Google Veo 3',
    provider: 'fal.ai',
    fal_model_id: 'fal-ai/veo3',
    supports_t2v: true,
    supports_i2v: false,
    max_duration: 8,
    supports_audio: true,
    credit_cost_per_second: INTEGRATION_CREDIT_COSTS.fal_video_veo3,
    is_active: true,
  },
  {
    id: 'fal-ai/wan-ai/wan2.1-i2v-720p',
    name: 'Wan 2.5',
    provider: 'fal.ai',
    fal_model_id: 'fal-ai/wan-ai/wan2.1-i2v-720p',
    supports_t2v: false,
    supports_i2v: true,
    max_duration: 5,
    supports_audio: false,
    credit_cost_per_second: INTEGRATION_CREDIT_COSTS.fal_video_wan_2_5,
    is_active: true,
  },
];

const DURATION_OPTIONS = ['3', '5', '10', '15'] as const;
const ASPECT_RATIO_OPTIONS = [
  { value: '16:9', label: '16:9', description: 'Landscape (Widescreen)' },
  { value: '9:16', label: '9:16', description: 'Portrait (Mobile)' },
  { value: '1:1', label: '1:1', description: 'Square' },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function FalVideoColumnWizard({
  existingColumns,
  onComplete,
  onCancel,
  initialConfig,
}: FalVideoColumnWizardProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>('model');
  const [models, setModels] = useState<FalVideoModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [selectedModel, setSelectedModel] = useState<FalVideoModel | null>(null);
  const [config, setConfig] = useState<FalVideoColumnConfig>({
    model_id: initialConfig?.model_id ?? '',
    mode: initialConfig?.mode ?? 'text-to-video',
    prompt_template: initialConfig?.prompt_template ?? '',
    image_column_key: initialConfig?.image_column_key,
    duration: initialConfig?.duration ?? '5',
    aspect_ratio: initialConfig?.aspect_ratio ?? '16:9',
    generate_audio: initialConfig?.generate_audio ?? false,
  });
  const [error, setError] = useState<string | null>(null);

  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  // Steps to show — skip 'mode' if model only supports one mode
  const steps = React.useMemo<WizardStep[]>(() => {
    if (!selectedModel) return ALL_STEPS;
    const bothModes = selectedModel.supports_t2v && selectedModel.supports_i2v;
    if (!bothModes) return ALL_STEPS.filter((s) => s !== 'mode');
    return ALL_STEPS;
  }, [selectedModel]);

  const stepIndex = steps.indexOf(step);

  // Columns that are likely image/URL sources for I2V mode
  const imageColumns = existingColumns.filter((c) =>
    ['url', 'image', 'text', 'ai_image', 'svg_animation'].includes(c.column_type)
  );

  // Estimated credit cost
  const estimatedCostPerVideo = selectedModel
    ? parseInt(config.duration, 10) * selectedModel.credit_cost_per_second
    : 0;

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function fetchModels() {
      setLoadingModels(true);
      try {
        const { data, error: dbError } = await supabase
          .from('fal_video_models')
          .select('id, display_name, provider, mode, max_duration_seconds, supports_audio, credit_cost_per_second, is_active, sort_order')
          .eq('is_active', true)
          .order('sort_order');

        if (cancelled) return;

        if (dbError || !data || data.length === 0) {
          setModels(FALLBACK_MODELS);
        } else {
          // Group DB rows by base model (strip /text-to-video or /image-to-video suffix)
          const grouped = new Map<string, FalVideoModel>();
          for (const row of data) {
            // Derive a stable group key: strip mode suffix from id
            const baseId = (row.id as string)
              .replace(/\/text-to-video$/, '')
              .replace(/\/image-to-video$/, '');
            const isT2V = (row.mode as string) === 'text-to-video';
            const isI2V = (row.mode as string) === 'image-to-video';

            const existing = grouped.get(baseId);
            if (existing) {
              if (isT2V) { existing.supports_t2v = true; existing.id = row.id as string; existing.fal_model_id = row.id as string; }
              if (isI2V) { existing.supports_i2v = true; existing.fal_model_id_i2v = row.id as string; }
              existing.max_duration = Math.max(existing.max_duration, row.max_duration_seconds as number);
            } else {
              const cleanName = (row.display_name as string).replace(/\s*\((?:T2V|I2V)\)\s*$/, '');
              grouped.set(baseId, {
                id: row.id as string,
                name: cleanName,
                provider: row.provider as string,
                fal_model_id: isT2V ? (row.id as string) : '',
                fal_model_id_i2v: isI2V ? (row.id as string) : undefined,
                supports_t2v: isT2V,
                supports_i2v: isI2V,
                max_duration: row.max_duration_seconds as number,
                supports_audio: row.supports_audio as boolean,
                credit_cost_per_second: parseFloat(row.credit_cost_per_second as string) || 2.5,
                is_active: true,
              });
            }
          }
          setModels(Array.from(grouped.values()));
        }
      } catch {
        if (!cancelled) setModels(FALLBACK_MODELS);
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    }
    fetchModels();
    return () => { cancelled = true; };
  }, []);

  // When models load and we have an initialConfig, pre-select the model
  useEffect(() => {
    if (models.length > 0 && initialConfig?.model_id && !selectedModel) {
      const found = models.find((m) =>
        m.id === initialConfig.model_id ||
        m.fal_model_id === initialConfig.model_id ||
        m.fal_model_id_i2v === initialConfig.model_id
      );
      if (found) setSelectedModel(found);
    }
  }, [models, initialConfig, selectedModel]);

  // When model changes, auto-set mode if only one is supported
  useEffect(() => {
    if (!selectedModel) return;
    if (selectedModel.supports_t2v && !selectedModel.supports_i2v) {
      setConfig((c) => ({ ...c, mode: 'text-to-video' }));
    } else if (!selectedModel.supports_t2v && selectedModel.supports_i2v) {
      setConfig((c) => ({ ...c, mode: 'image-to-video' }));
    }
  }, [selectedModel]);

  // ── Navigation helpers ─────────────────────────────────────────────────────

  function goNext() {
    setError(null);

    if (step === 'model') {
      if (!selectedModel) {
        setError('Please select a model to continue.');
        return;
      }
      // Use fal_model_id (the real fal.ai endpoint), resolved to T2V/I2V at submit
      setConfig((c) => ({ ...c, model_id: selectedModel.fal_model_id || selectedModel.id }));
    }

    if (step === 'mode') {
      if (config.mode === 'image-to-video' && !config.image_column_key) {
        setError('Please select a source image column for Image-to-Video mode.');
        return;
      }
    }

    if (step === 'prompt') {
      if (!config.prompt_template.trim()) {
        setError('Please enter a prompt template.');
        return;
      }
    }

    if (step === 'settings') {
      if (!config.duration) {
        setError('Please select a video duration.');
        return;
      }
    }

    const nextIndex = stepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  }

  function goBack() {
    setError(null);
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex]);
    }
  }

  function handleCreate() {
    if (!selectedModel) {
      toast.error('No model selected');
      return;
    }
    // Resolve the correct fal model ID based on the selected mode
    const resolvedModelId = config.mode === 'image-to-video' && selectedModel.fal_model_id_i2v
      ? selectedModel.fal_model_id_i2v
      : selectedModel.fal_model_id || selectedModel.id;
    onComplete({ ...config, model_id: resolvedModelId });
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

  // ── Available durations filtered by model max ─────────────────────────────

  const availableDurations = selectedModel
    ? DURATION_OPTIONS.filter((d) => parseInt(d, 10) <= selectedModel.max_duration)
    : DURATION_OPTIONS;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {steps.map((s, i) => (
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
            {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-gray-700 shrink-0" />}
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

      {/* ── Step 1: Choose Model ──────────────────────────────────────────── */}
      {step === 'model' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3.5 py-3">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
            <p className="text-xs text-gray-300">
              Choose the AI video generation model. Each model has different capabilities, quality
              levels, and costs.
            </p>
          </div>

          {loadingModels ? (
            <div className="flex items-center justify-center py-8 text-xs text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading models...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {models.map((model) => {
                const isSelected = selectedModel?.id === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setSelectedModel(model);
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-100">{model.name}</span>
                          <span className="text-[10px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">
                            {model.provider}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {/* Mode badges */}
                          {model.supports_t2v && (
                            <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                              <Type className="w-2.5 h-2.5" /> T2V
                            </span>
                          )}
                          {model.supports_i2v && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              <Image className="w-2.5 h-2.5" /> I2V
                            </span>
                          )}
                          {/* Audio badge */}
                          {model.supports_audio && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                              <Volume2 className="w-2.5 h-2.5" /> Audio
                            </span>
                          )}
                          {/* Max duration */}
                          <span className="flex items-center gap-1 text-[10px] text-gray-500">
                            <Clock className="w-2.5 h-2.5" /> max {model.max_duration}s
                          </span>
                        </div>
                      </div>
                      {/* Cost */}
                      <div className="shrink-0 text-right">
                        <span className="text-sm font-semibold text-purple-300">
                          {model.credit_cost_per_second}
                        </span>
                        <span className="text-[10px] text-gray-500 block">credits/sec</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Mode ─────────────────────────────────────────────────── */}
      {step === 'mode' && selectedModel && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3.5 py-3">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
            <p className="text-xs text-gray-300">
              Choose how to generate videos. Text-to-Video generates from a written prompt.
              Image-to-Video animates an existing image from your table.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {/* Text-to-Video */}
            {selectedModel.supports_t2v && (
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, mode: 'text-to-video', image_column_key: undefined }))}
                className={`w-full text-left rounded-lg border px-3.5 py-3 transition-all ${
                  config.mode === 'text-to-video'
                    ? 'border-blue-500/50 bg-blue-500/10 ring-1 ring-blue-500/30'
                    : 'border-gray-700/50 bg-gray-800/30 hover:border-gray-600/50 hover:bg-gray-800/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-1.5 rounded-md mt-0.5 ${config.mode === 'text-to-video' ? 'bg-blue-500/20' : 'bg-gray-700/50'}`}>
                    <Type className={`w-4 h-4 ${config.mode === 'text-to-video' ? 'text-blue-400' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-100">Text-to-Video</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Generate a video purely from a text prompt. You can use column values in the prompt.
                    </p>
                  </div>
                </div>
              </button>
            )}

            {/* Image-to-Video */}
            {selectedModel.supports_i2v && (
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, mode: 'image-to-video' }))}
                className={`w-full text-left rounded-lg border px-3.5 py-3 transition-all ${
                  config.mode === 'image-to-video'
                    ? 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                    : 'border-gray-700/50 bg-gray-800/30 hover:border-gray-600/50 hover:bg-gray-800/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-1.5 rounded-md mt-0.5 ${config.mode === 'image-to-video' ? 'bg-emerald-500/20' : 'bg-gray-700/50'}`}>
                    <Image className={`w-4 h-4 ${config.mode === 'image-to-video' ? 'text-emerald-400' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-100">Image-to-Video</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Animate a source image from one of your table columns. The image URL will be
                      read per row.
                    </p>
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Image column picker (only shown for I2V) */}
          {config.mode === 'image-to-video' && (
            <div className="space-y-1.5 mt-2">
              <label className="text-xs font-medium text-gray-400">Source Image Column</label>
              {imageColumns.length === 0 ? (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  No URL/image columns found in this table. Add a URL or text column containing image
                  URLs first.
                </p>
              ) : (
                <select
                  value={config.image_column_key ?? ''}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, image_column_key: e.target.value || undefined }))
                  }
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                >
                  <option value="">Select a column…</option>
                  {imageColumns.map((col) => (
                    <option key={col.key} value={col.key}>
                      {col.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Prompt Template ──────────────────────────────────────── */}
      {step === 'prompt' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3.5 py-3">
            <Type className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
            <p className="text-xs text-gray-300">
              Write the prompt that will be used to generate each video. Use{' '}
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
              placeholder={`Create a professional video greeting for {{first_name}} at {{company_name}} about our {{product}} solution`}
              rows={4}
              className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
            />
            <p className="mt-1 text-[11px] text-gray-600">
              Tip: Be specific — describe scene, style, mood, and key message.
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

      {/* ── Step 4: Video Settings ───────────────────────────────────────── */}
      {step === 'settings' && selectedModel && (
        <div className="space-y-5">
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3.5 py-3">
            <Settings className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-xs text-gray-300">
              Configure the output format for generated videos.
            </p>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-300">
              <Clock className="w-3.5 h-3.5 text-gray-500" /> Duration
            </label>
            <div className="flex gap-2 flex-wrap">
              {availableDurations.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, duration: d }))}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    config.duration === d
                      ? 'border-purple-500/50 bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30'
                      : 'border-gray-700/50 bg-gray-800/30 text-gray-400 hover:border-gray-600/50 hover:text-gray-300'
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-300">
              <Maximize2 className="w-3.5 h-3.5 text-gray-500" /> Aspect Ratio
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

          {/* Audio toggle (only if model supports it) */}
          {selectedModel.supports_audio && (
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-300">
                <Volume2 className="w-3.5 h-3.5 text-gray-500" /> Audio Generation
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, generate_audio: true }))}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    config.generate_audio
                      ? 'border-amber-500/50 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
                      : 'border-gray-700/50 bg-gray-800/30 text-gray-400 hover:border-gray-600/50 hover:text-gray-300'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" /> With Audio
                </button>
                <button
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, generate_audio: false }))}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    !config.generate_audio
                      ? 'border-purple-500/50 bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30'
                      : 'border-gray-700/50 bg-gray-800/30 text-gray-400 hover:border-gray-600/50 hover:text-gray-300'
                  }`}
                >
                  <VolumeX className="w-3.5 h-3.5" /> Silent
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 5: Cost Preview ─────────────────────────────────────────── */}
      {step === 'preview' && selectedModel && (
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
              <span className="text-xs font-medium text-gray-200">{selectedModel.name}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-xs text-gray-500">Mode</span>
              <span className="text-xs font-medium text-gray-200">
                {config.mode === 'text-to-video' ? 'Text-to-Video' : 'Image-to-Video'}
              </span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-xs text-gray-500">Duration</span>
              <span className="text-xs font-medium text-gray-200">{config.duration}s</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-xs text-gray-500">Aspect Ratio</span>
              <span className="text-xs font-medium text-gray-200">{config.aspect_ratio}</span>
            </div>
            {selectedModel.supports_audio && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-xs text-gray-500">Audio</span>
                <span className="text-xs font-medium text-gray-200">
                  {config.generate_audio ? 'Enabled' : 'Silent'}
                </span>
              </div>
            )}
            {config.mode === 'image-to-video' && config.image_column_key && (
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-xs text-gray-500">Image Source</span>
                <span className="text-xs font-medium text-gray-200">
                  {existingColumns.find((c) => c.key === config.image_column_key)?.label ??
                    config.image_column_key}
                </span>
              </div>
            )}
          </div>

          {/* Cost breakdown */}
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-3.5 py-3 space-y-2">
            <p className="text-xs font-medium text-purple-300 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Credit Cost Estimate
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">
                  {selectedModel.credit_cost_per_second} credits/sec × {config.duration}s
                </span>
                <span className="font-semibold text-gray-100">
                  {formatCredits(estimatedCostPerVideo)} per video
                </span>
              </div>
              <p className="text-[11px] text-gray-600">
                Charged per generated video. Credits deducted when a row is processed.
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
            <Video className="w-3.5 h-3.5" />
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

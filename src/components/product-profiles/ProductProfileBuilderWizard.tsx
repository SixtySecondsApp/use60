import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  Sparkles,
  Wand2,
  CheckCircle2,
  RotateCcw,
  SkipForward,
  AlertTriangle,
  Code,
  Eye,
  Package,
  Users,
  DollarSign,
  Swords,
  Lightbulb,
  Shield,
  Heart,
  Zap,
  Plug,
  ChevronRight,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { toneSettingsService } from '@/lib/services/toneSettingsService';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  type ProductProfile,
  type ProductProfileResearchData,
} from '@/lib/types/productProfile';

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

type SectionKey = keyof ProductProfileResearchData;

interface BuilderSection {
  key: SectionKey;
  title: string;
  prompt: string;
  placeholder: string;
  icon: React.ReactNode;
}

const BUILDER_SECTIONS: BuilderSection[] = [
  {
    key: 'overview',
    title: 'Overview',
    prompt: 'How would you describe this product/service in plain words?',
    placeholder: 'What it does, who it helps, and the key promise...',
    icon: <Package className="h-3.5 w-3.5" />,
  },
  {
    key: 'target_market',
    title: 'Target Market',
    prompt: 'Who is the best-fit customer?',
    placeholder: 'Industries, company sizes, regions, buyer personas...',
    icon: <Users className="h-3.5 w-3.5" />,
  },
  {
    key: 'value_propositions',
    title: 'Value Propositions',
    prompt: 'Why should a buyer choose this over alternatives?',
    placeholder: 'Primary value, supporting points, proof points...',
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
  {
    key: 'pricing',
    title: 'Pricing',
    prompt: 'How is this priced and packaged?',
    placeholder: 'Model, tiers, billing options, range...',
    icon: <DollarSign className="h-3.5 w-3.5" />,
  },
  {
    key: 'competitors',
    title: 'Competitors',
    prompt: 'Who are the direct and indirect competitors?',
    placeholder: 'Names, domains, differentiators...',
    icon: <Swords className="h-3.5 w-3.5" />,
  },
  {
    key: 'use_cases',
    title: 'Use Cases',
    prompt: 'What are the top use cases and who owns them?',
    placeholder: 'Primary and secondary use cases...',
    icon: <Lightbulb className="h-3.5 w-3.5" />,
  },
  {
    key: 'differentiators',
    title: 'Differentiators',
    prompt: 'What makes this genuinely different?',
    placeholder: 'Differentiators, unique capabilities, awards...',
    icon: <Shield className="h-3.5 w-3.5" />,
  },
  {
    key: 'pain_points_solved',
    title: 'Pain Points Solved',
    prompt: 'What pains are removed and what outcomes improve?',
    placeholder: 'Pain -> solution -> impact examples...',
    icon: <Heart className="h-3.5 w-3.5" />,
  },
  {
    key: 'key_features',
    title: 'Key Features',
    prompt: 'Which features matter most for buyers?',
    placeholder: 'Feature names, descriptions, categories...',
    icon: <Zap className="h-3.5 w-3.5" />,
  },
  {
    key: 'integrations',
    title: 'Integrations',
    prompt: 'What integrations and platforms are supported?',
    placeholder: 'Native integrations, API availability, platforms...',
    icon: <Plug className="h-3.5 w-3.5" />,
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProductProfileBuilderWizardProps {
  profile: ProductProfile;
  organizationId?: string;
  basics: {
    name: string;
    description: string;
    category: string;
    productUrl: string;
  };
  onApprove: (researchData: ProductProfileResearchData) => Promise<void>;
}

// ---------------------------------------------------------------------------
// JSON parsing helpers
// ---------------------------------------------------------------------------

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function parseJsonObject(raw: string): ProductProfileResearchData {
  const cleaned = stripCodeFence(raw);
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('No JSON object found in AI response');
  }
  const objectText = cleaned.slice(firstBrace, lastBrace + 1);
  return JSON.parse(objectText) as ProductProfileResearchData;
}

// ---------------------------------------------------------------------------
// Section card review helpers
// ---------------------------------------------------------------------------

function PillBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F8FAFC] dark:bg-gray-800 text-[#1E293B] dark:text-gray-200 border border-[#E2E8F0] dark:border-gray-700">
      {children}
    </span>
  );
}

function ReviewSectionCard({
  section,
  data,
  editingSectionKey,
  editJson,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditJsonChange,
}: {
  section: BuilderSection;
  data: Record<string, unknown>;
  editingSectionKey: SectionKey | null;
  editJson: string;
  onStartEdit: (key: SectionKey) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditJsonChange: (val: string) => void;
}) {
  const isEditing = editingSectionKey === section.key;
  const isEmpty = !data || Object.keys(data).length === 0;

  return (
    <div className="rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F8FAFC]/50 dark:bg-gray-800/30 border-b border-[#E2E8F0] dark:border-gray-700/50">
        <span className="text-[#64748B] dark:text-gray-400">{section.icon}</span>
        <span className="flex-1 text-xs font-semibold text-[#1E293B] dark:text-gray-100">
          {section.title}
        </span>
        {!isEditing ? (
          <button
            type="button"
            onClick={() => onStartEdit(section.key)}
            className="text-[#64748B] hover:text-[#1E293B] dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onSaveEdit}
              className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-[#64748B] hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="px-4 py-3">
        {isEditing ? (
          <Textarea
            value={editJson}
            onChange={(e) => onEditJsonChange(e.target.value)}
            rows={6}
            className="font-mono text-xs"
          />
        ) : isEmpty ? (
          <p className="text-xs text-[#94A3B8] dark:text-gray-500 italic">No data generated</p>
        ) : (
          <SectionContent sectionKey={section.key} data={data} />
        )}
      </div>
    </div>
  );
}

function SectionContent({ sectionKey, data }: { sectionKey: SectionKey; data: Record<string, unknown> }) {
  switch (sectionKey) {
    case 'overview': {
      const d = data as ProductProfileResearchData['overview'];
      return (
        <div className="space-y-2">
          {d.tagline && (
            <p className="text-xs font-medium text-[#1E293B] dark:text-gray-100 italic">&ldquo;{d.tagline}&rdquo;</p>
          )}
          {d.description && (
            <p className="text-xs text-[#1E293B] dark:text-gray-100 leading-relaxed">{d.description}</p>
          )}
        </div>
      );
    }
    case 'target_market': {
      const d = data as ProductProfileResearchData['target_market'];
      return (
        <div className="space-y-2">
          <TagRow label="Industries" items={d.industries} />
          <TagRow label="Company Sizes" items={d.company_sizes} />
          <TagRow label="Regions" items={d.regions} />
          <TagRow label="Buyer Personas" items={d.buyer_personas} />
        </div>
      );
    }
    case 'value_propositions': {
      const d = data as ProductProfileResearchData['value_propositions'];
      return (
        <div className="space-y-2">
          {d.primary_value_prop && (
            <div className="rounded border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{d.primary_value_prop}</p>
            </div>
          )}
          <TagRow label="Supporting" items={d.supporting_points} />
          <TagRow label="Proof Points" items={d.proof_points} />
        </div>
      );
    }
    case 'pricing': {
      const d = data as ProductProfileResearchData['pricing'];
      return (
        <div className="space-y-2">
          <div className="flex gap-4 text-xs">
            {d.model && <span><strong>Model:</strong> {d.model}</span>}
            {d.price_range && <span><strong>Range:</strong> {d.price_range}</span>}
          </div>
          {d.tiers?.length > 0 && (
            <div className="text-xs text-[#64748B] dark:text-gray-400">
              {d.tiers.map((t, i) => (
                <span key={i} className="mr-3">{t.name}{t.price ? ` (${t.price})` : ''}</span>
              ))}
            </div>
          )}
          <TagRow label="Billing" items={d.billing_options} />
        </div>
      );
    }
    case 'competitors': {
      const d = data as ProductProfileResearchData['competitors'];
      return (
        <div className="space-y-2">
          {d.direct_competitors?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {d.direct_competitors.map((c, i) => (
                <PillBadge key={i}>{c.name}</PillBadge>
              ))}
            </div>
          )}
          <TagRow label="Indirect" items={d.indirect_competitors} />
        </div>
      );
    }
    case 'use_cases': {
      const d = data as ProductProfileResearchData['use_cases'];
      return (
        <div className="space-y-1.5">
          {d.primary_use_cases?.map((uc, i) => (
            <div key={i} className="text-xs text-[#1E293B] dark:text-gray-100">
              <strong>{uc.title}</strong>{uc.persona ? ` (${uc.persona})` : ''}
              {uc.description && <span className="text-[#64748B] dark:text-gray-400"> — {uc.description}</span>}
            </div>
          ))}
          <TagRow label="Secondary" items={d.secondary_use_cases} />
        </div>
      );
    }
    case 'differentiators': {
      const d = data as ProductProfileResearchData['differentiators'];
      return (
        <div className="space-y-2">
          <TagRow label="Key" items={d.key_differentiators} />
          <TagRow label="Capabilities" items={d.unique_capabilities} />
          <TagRow label="Awards" items={d.awards} />
        </div>
      );
    }
    case 'pain_points_solved': {
      const d = data as ProductProfileResearchData['pain_points_solved'];
      return (
        <div className="space-y-1.5">
          {d.pain_points?.map((pp, i) => (
            <div key={i} className="text-xs">
              <span className="text-[#1E293B] dark:text-gray-100 font-medium">{pp.pain}</span>
              <span className="text-[#64748B] dark:text-gray-400"> → {pp.solution}</span>
              {pp.impact && <span className="text-emerald-600 dark:text-emerald-400"> ({pp.impact})</span>}
            </div>
          ))}
        </div>
      );
    }
    case 'key_features': {
      const d = data as ProductProfileResearchData['key_features'];
      return (
        <div className="flex flex-wrap gap-1.5">
          {d.features?.map((f, i) => (
            <PillBadge key={i}>{f.name}</PillBadge>
          ))}
        </div>
      );
    }
    case 'integrations': {
      const d = data as ProductProfileResearchData['integrations'];
      return (
        <div className="space-y-2">
          {d.api_available && (
            <Badge variant="secondary" className="text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" />
              API Available
            </Badge>
          )}
          <TagRow label="Native" items={d.native_integrations} />
          <TagRow label="Platforms" items={d.platforms} />
        </div>
      );
    }
    default:
      return <pre className="text-xs overflow-auto">{JSON.stringify(data, null, 2)}</pre>;
  }
}

function TagRow({ label, items }: { label: string; items: string[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-medium text-[#64748B] dark:text-gray-400 uppercase tracking-wide">{label}:</span>
      {items.map((item, i) => (
        <PillBadge key={i}>{item}</PillBadge>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard component
// ---------------------------------------------------------------------------

export function ProductProfileBuilderWizard({
  profile,
  organizationId,
  basics,
  onApprove,
}: ProductProfileBuilderWizardProps) {
  // Collection phase state
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<SectionKey, string>>({
    overview: '',
    target_market: '',
    value_propositions: '',
    pricing: '',
    competitors: '',
    use_cases: '',
    differentiators: '',
    pain_points_solved: '',
    key_features: '',
    integrations: '',
  });

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Review phase state
  const [generatedDraft, setGeneratedDraft] = useState<ProductProfileResearchData | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [jsonEditor, setJsonEditor] = useState('');
  const [revisionPrompt, setRevisionPrompt] = useState('');
  const [editingSectionKey, setEditingSectionKey] = useState<SectionKey | null>(null);
  const [editSectionJson, setEditSectionJson] = useState('');

  // Save state
  const [isSaving, setIsSaving] = useState(false);

  const currentSection = BUILDER_SECTIONS[stepIndex];
  const isLastStep = stepIndex === BUILDER_SECTIONS.length - 1;

  const completedCount = useMemo(
    () => BUILDER_SECTIONS.filter((s) => answers[s.key].trim().length > 0).length,
    [answers],
  );

  // --- Prompt construction ---
  const buildPrompt = useCallback(
    async (existingDraft?: ProductProfileResearchData, reviseNote?: string) => {
      const emailTone = await toneSettingsService.getToneSettings('email');
      const toneBlock = [
        `Tone style: ${emailTone.tone_style || 'friendly and professional'}`,
        `Formality level (1-10): ${emailTone.formality_level ?? 5}`,
        `Brand voice: ${emailTone.brand_voice_description || 'Use a confident, practical B2B tone.'}`,
        `Preferred keywords: ${(emailTone.preferred_keywords || []).join(', ') || 'N/A'}`,
        `Words to avoid: ${(emailTone.words_to_avoid || []).join(', ') || 'N/A'}`,
        `Sample phrases: ${(emailTone.sample_phrases || []).join(' | ') || 'N/A'}`,
      ].join('\n');

      const qaBlock = BUILDER_SECTIONS.map(
        (section) => `- ${section.title}: ${answers[section.key].trim() || 'No answer provided'}`,
      ).join('\n');

      return `You are generating a complete product/service profile JSON for internal CRM usage.

Product basics:
- Name: ${basics.name || profile.name}
- Category: ${basics.category || profile.category || 'Service'}
- Description: ${basics.description || profile.description || 'N/A'}
- URL: ${basics.productUrl || profile.product_url || 'N/A'}

Collected user inputs by section:
${qaBlock}

Tone requirements:
${toneBlock}

${existingDraft ? `Current draft JSON to improve:\n${JSON.stringify(existingDraft, null, 2)}\n` : ''}
${reviseNote ? `User revision request:\n${reviseNote}\n` : ''}

Task:
1) Infer and complete all fields with realistic B2B detail.
2) Keep language aligned to the tone requirements.
3) Return ONLY one valid JSON object (no markdown) matching this exact schema:
{
  "overview": { "description": "", "tagline": "", "category": "", "product_url": "" },
  "target_market": { "industries": [], "company_sizes": [], "regions": [], "buyer_personas": [] },
  "value_propositions": { "primary_value_prop": "", "supporting_points": [], "proof_points": [] },
  "pricing": { "model": "", "tiers": [{"name":"", "price":"", "features":[]}], "price_range": "", "billing_options": [] },
  "competitors": { "direct_competitors": [{"name":"", "domain":"", "differentiator":""}], "indirect_competitors": [] },
  "use_cases": { "primary_use_cases": [{"title":"", "description":"", "persona":""}], "secondary_use_cases": [] },
  "differentiators": { "key_differentiators": [], "unique_capabilities": [], "awards": [] },
  "pain_points_solved": { "pain_points": [{"pain":"", "solution":"", "impact":""}] },
  "key_features": { "features": [{"name":"", "description":"", "category":""}] },
  "integrations": { "native_integrations": [], "api_available": false, "platforms": [] }
}`;
    },
    [answers, basics, profile],
  );

  // --- Generation with abort + error recovery ---
  const runGeneration = useCallback(
    async (existingDraft?: ProductProfileResearchData, reviseNote?: string) => {
      // Abort any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setIsGenerating(true);
      setGenerationError(null);

      try {
        const prompt = await buildPrompt(existingDraft, reviseNote);

        // Check if aborted before making the request
        if (controller.signal.aborted) return;

        const { data, error } = await supabase.functions.invoke('copilot-autonomous', {
          body: {
            message: prompt,
            organizationId,
            context: {
              source: 'product_profile_builder',
              silent_mode: true,
              force_single_agent: true,
            },
            stream: false,
            product_profile_id: profile.id,
          },
        });

        // Check if aborted after response
        if (controller.signal.aborted) return;

        if (error) {
          throw new Error(error.message || 'Failed to generate profile draft');
        }

        const aiText = (data?.response as string) || '';
        if (!aiText.trim()) {
          throw new Error('AI returned an empty response. Please try again.');
        }

        const parsed = parseJsonObject(aiText);
        setGeneratedDraft(parsed);
        setJsonEditor(JSON.stringify(parsed, null, 2));
        setRevisionPrompt('');
        toast.success('Draft profile generated');
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Failed to generate draft';
        setGenerationError(message);
        toast.error(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsGenerating(false);
        }
      }
    },
    [buildPrompt, organizationId, profile.id],
  );

  // --- Section editing in review phase ---
  const handleStartEdit = useCallback(
    (key: SectionKey) => {
      if (!generatedDraft) return;
      setEditingSectionKey(key);
      setEditSectionJson(JSON.stringify(generatedDraft[key], null, 2));
    },
    [generatedDraft],
  );

  const handleSaveEdit = useCallback(() => {
    if (!editingSectionKey || !generatedDraft) return;
    try {
      const parsed = JSON.parse(editSectionJson);
      const updated = { ...generatedDraft, [editingSectionKey]: parsed };
      setGeneratedDraft(updated);
      setJsonEditor(JSON.stringify(updated, null, 2));
      setEditingSectionKey(null);
      setEditSectionJson('');
    } catch {
      toast.error('Invalid JSON for this section');
    }
  }, [editingSectionKey, editSectionJson, generatedDraft]);

  const handleCancelEdit = useCallback(() => {
    setEditingSectionKey(null);
    setEditSectionJson('');
  }, []);

  // --- Approve ---
  const handleApprove = useCallback(async () => {
    try {
      setIsSaving(true);
      // If raw JSON view was used, parse from there; otherwise use the draft object
      const draft = showRawJson ? parseJsonObject(jsonEditor) : generatedDraft;
      if (!draft) {
        throw new Error('No draft to save');
      }
      await onApprove(draft);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [showRawJson, jsonEditor, generatedDraft, onApprove]);

  // --- Apply raw JSON changes back to draft ---
  const handleSyncJsonToDraft = useCallback(() => {
    try {
      const parsed = parseJsonObject(jsonEditor);
      setGeneratedDraft(parsed);
      setShowRawJson(false);
      toast.success('JSON changes applied');
    } catch {
      toast.error('Invalid JSON — fix errors before switching views');
    }
  }, [jsonEditor]);

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-blue" />
          <h2 className="text-sm font-semibold text-[#1E293B] dark:text-gray-100">
            AI Guided Product Builder
          </h2>
        </div>
        <div className="text-xs text-[#64748B] dark:text-gray-400">
          {completedCount}/{BUILDER_SECTIONS.length} sections answered
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* PHASE 1: Collecting answers                                       */}
      {/* ----------------------------------------------------------------- */}
      {!generatedDraft && !isGenerating && !generationError ? (
        <div className="space-y-4">
          {/* Progress dots */}
          <div className="flex items-center gap-1">
            {BUILDER_SECTIONS.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStepIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === stepIndex
                    ? 'w-6 bg-brand-blue'
                    : answers[s.key].trim()
                      ? 'w-2 bg-emerald-400 dark:bg-emerald-500'
                      : 'w-2 bg-[#E2E8F0] dark:bg-gray-700'
                }`}
                title={s.title}
              />
            ))}
          </div>

          {/* Current question card */}
          <div className="rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-gray-400">
                {currentSection.icon}
                <span>Step {stepIndex + 1} of {BUILDER_SECTIONS.length}</span>
              </div>
              {answers[currentSection.key].trim() && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              )}
            </div>
            <h3 className="text-sm font-semibold text-[#1E293B] dark:text-gray-100">
              {currentSection.title}
            </h3>
            <p className="text-sm text-[#64748B] dark:text-gray-400">{currentSection.prompt}</p>
            <Textarea
              value={answers[currentSection.key]}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [currentSection.key]: e.target.value }))
              }
              placeholder={currentSection.placeholder}
              rows={4}
            />
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
              disabled={stepIndex === 0}
            >
              Back
            </Button>

            <div className="flex items-center gap-2">
              {/* Generate early button (available after at least 1 answer) */}
              {completedCount >= 1 && !isLastStep && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runGeneration()}
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                  Generate Now
                </Button>
              )}

              {!isLastStep ? (
                <div className="flex items-center gap-1">
                  {!answers[currentSection.key].trim() && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStepIndex((prev) => Math.min(BUILDER_SECTIONS.length - 1, prev + 1))}
                    >
                      <SkipForward className="h-3.5 w-3.5 mr-1" />
                      Skip
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => setStepIndex((prev) => Math.min(BUILDER_SECTIONS.length - 1, prev + 1))}
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              ) : (
                <Button size="sm" onClick={() => runGeneration()}>
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                  Generate Profile Draft
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ----------------------------------------------------------------- */}
      {/* GENERATING state                                                  */}
      {/* ----------------------------------------------------------------- */}
      {isGenerating && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 p-6 text-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin text-brand-blue mx-auto" />
          <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100">
            Generating your product profile...
          </p>
          <p className="text-xs text-[#64748B] dark:text-gray-400">
            AI is enriching your answers into a structured profile with your brand tone.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              abortRef.current?.abort();
              setIsGenerating(false);
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* ERROR state with retry                                            */}
      {/* ----------------------------------------------------------------- */}
      {generationError && !isGenerating && !generatedDraft && (
        <div className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-5 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                Generation failed
              </p>
              <p className="text-xs text-red-600 dark:text-red-400/80">
                {generationError}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => runGeneration()}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setGenerationError(null);
              }}
            >
              Back to Questions
            </Button>
          </div>
          <p className="text-[10px] text-[#94A3B8] dark:text-gray-500">
            Your answers are preserved. You can edit them and try again.
          </p>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* PHASE 2: Review + Edit + Revise                                   */}
      {/* ----------------------------------------------------------------- */}
      {generatedDraft && !isGenerating && (
        <div className="space-y-4">
          {/* Success banner */}
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            Review the generated profile below. Edit any section, then approve to save.
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-2">
            <Button
              variant={showRawJson ? 'outline' : 'default'}
              size="sm"
              onClick={() => {
                if (showRawJson) handleSyncJsonToDraft();
                else setShowRawJson(false);
              }}
              disabled={!showRawJson}
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              Cards
            </Button>
            <Button
              variant={showRawJson ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                if (!showRawJson) {
                  setJsonEditor(JSON.stringify(generatedDraft, null, 2));
                  setShowRawJson(true);
                }
              }}
              disabled={showRawJson}
            >
              <Code className="h-3.5 w-3.5 mr-1" />
              JSON
            </Button>
          </div>

          {/* Section cards view */}
          {!showRawJson && (
            <div className="grid grid-cols-1 gap-3">
              {BUILDER_SECTIONS.map((section) => (
                <ReviewSectionCard
                  key={section.key}
                  section={section}
                  data={(generatedDraft[section.key] ?? {}) as Record<string, unknown>}
                  editingSectionKey={editingSectionKey}
                  editJson={editSectionJson}
                  onStartEdit={handleStartEdit}
                  onCancelEdit={handleCancelEdit}
                  onSaveEdit={handleSaveEdit}
                  onEditJsonChange={setEditSectionJson}
                />
              ))}
            </div>
          )}

          {/* Raw JSON view */}
          {showRawJson && (
            <div className="space-y-2">
              <Label htmlFor="builder-json">Editable Draft JSON</Label>
              <Textarea
                id="builder-json"
                value={jsonEditor}
                onChange={(e) => setJsonEditor(e.target.value)}
                rows={16}
                className="font-mono text-xs"
              />
              <Button variant="outline" size="sm" onClick={handleSyncJsonToDraft}>
                Apply Changes & Switch to Cards
              </Button>
            </div>
          )}

          {/* Revise with AI */}
          <div className="space-y-2">
            <Label htmlFor="revision-prompt">Revise with AI</Label>
            <div className="flex items-center gap-2">
              <Input
                id="revision-prompt"
                value={revisionPrompt}
                onChange={(e) => setRevisionPrompt(e.target.value)}
                placeholder="e.g. Make positioning more enterprise-focused and less technical."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && revisionPrompt.trim()) {
                    runGeneration(generatedDraft, revisionPrompt);
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => runGeneration(generatedDraft, revisionPrompt)}
                disabled={isGenerating || !revisionPrompt.trim()}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0] dark:border-gray-700/50">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setGeneratedDraft(null);
                setJsonEditor('');
                setShowRawJson(false);
                setEditingSectionKey(null);
              }}
            >
              Back to Questions
            </Button>
            <Button onClick={handleApprove} disabled={isSaving || isGenerating}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve & Save Profile
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

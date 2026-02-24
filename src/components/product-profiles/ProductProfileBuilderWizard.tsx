import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Wifi,
  Brain,
  Clock,
  ChevronDown,
  ChevronUp,
  Circle,
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

// Calculate completeness for a section
function calculateCompleteness(sectionKey: SectionKey, data: Record<string, unknown>): { filled: number; total: number; percentage: number } {
  if (!data || Object.keys(data).length === 0) {
    return { filled: 0, total: 1, percentage: 0 };
  }

  let filled = 0;
  let total = 0;

  switch (sectionKey) {
    case 'overview': {
      const d = data as ProductProfileResearchData['overview'];
      total = 2;
      if (d.tagline) filled++;
      if (d.description) filled++;
      break;
    }
    case 'target_market': {
      const d = data as ProductProfileResearchData['target_market'];
      total = 4;
      if (d.industries?.length) filled++;
      if (d.company_sizes?.length) filled++;
      if (d.regions?.length) filled++;
      if (d.buyer_personas?.length) filled++;
      break;
    }
    case 'value_propositions': {
      const d = data as ProductProfileResearchData['value_propositions'];
      total = 3;
      if (d.primary_value_prop) filled++;
      if (d.supporting_points?.length) filled++;
      if (d.proof_points?.length) filled++;
      break;
    }
    case 'pricing': {
      const d = data as ProductProfileResearchData['pricing'];
      total = 3;
      if (d.model) filled++;
      if (d.tiers?.length) filled++;
      if (d.billing_options?.length) filled++;
      break;
    }
    case 'competitors': {
      const d = data as ProductProfileResearchData['competitors'];
      total = 2;
      if (d.direct_competitors?.length) filled++;
      if (d.indirect_competitors?.length) filled++;
      break;
    }
    case 'use_cases': {
      const d = data as ProductProfileResearchData['use_cases'];
      total = 2;
      if (d.primary_use_cases?.length) filled++;
      if (d.secondary_use_cases?.length) filled++;
      break;
    }
    case 'differentiators': {
      const d = data as ProductProfileResearchData['differentiators'];
      total = 3;
      if (d.key_differentiators?.length) filled++;
      if (d.unique_capabilities?.length) filled++;
      if (d.awards?.length) filled++;
      break;
    }
    case 'pain_points_solved': {
      const d = data as ProductProfileResearchData['pain_points_solved'];
      total = 1;
      if (d.pain_points?.length) filled++;
      break;
    }
    case 'key_features': {
      const d = data as ProductProfileResearchData['key_features'];
      total = 1;
      if (d.features?.length) filled++;
      break;
    }
    case 'integrations': {
      const d = data as ProductProfileResearchData['integrations'];
      total = 2;
      if (d.native_integrations?.length) filled++;
      if (d.platforms?.length) filled++;
      break;
    }
  }

  return { filled, total, percentage: total > 0 ? Math.round((filled / total) * 100) : 0 };
}

// Generate a 1-line summary for collapsed state
function generateSummary(sectionKey: SectionKey, data: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return 'No data generated';

  switch (sectionKey) {
    case 'overview': {
      const d = data as ProductProfileResearchData['overview'];
      return d.tagline || d.description?.slice(0, 80) + '...' || 'Overview content';
    }
    case 'target_market': {
      const d = data as ProductProfileResearchData['target_market'];
      const industries = d.industries?.slice(0, 3).join(', ') || '';
      return industries ? `${industries}${d.industries && d.industries.length > 3 ? '...' : ''}` : 'Target market details';
    }
    case 'value_propositions': {
      const d = data as ProductProfileResearchData['value_propositions'];
      return d.primary_value_prop?.slice(0, 80) + '...' || 'Value propositions';
    }
    case 'pricing': {
      const d = data as ProductProfileResearchData['pricing'];
      return d.model ? `${d.model}${d.price_range ? ' • ' + d.price_range : ''}` : 'Pricing details';
    }
    case 'competitors': {
      const d = data as ProductProfileResearchData['competitors'];
      const comps = d.direct_competitors?.slice(0, 3).map(c => c.name).join(', ') || '';
      return comps ? `${comps}${d.direct_competitors && d.direct_competitors.length > 3 ? '...' : ''}` : 'Competitor analysis';
    }
    case 'use_cases': {
      const d = data as ProductProfileResearchData['use_cases'];
      const uses = d.primary_use_cases?.slice(0, 2).map(u => u.title).join(', ') || '';
      return uses ? `${uses}${d.primary_use_cases && d.primary_use_cases.length > 2 ? '...' : ''}` : 'Use case details';
    }
    case 'differentiators': {
      const d = data as ProductProfileResearchData['differentiators'];
      const diffs = d.key_differentiators?.slice(0, 2).join(', ') || '';
      return diffs ? `${diffs}${d.key_differentiators && d.key_differentiators.length > 2 ? '...' : ''}` : 'Differentiators';
    }
    case 'pain_points_solved': {
      const d = data as ProductProfileResearchData['pain_points_solved'];
      const pains = d.pain_points?.slice(0, 2).map(p => p.pain).join(', ') || '';
      return pains ? `${pains}${d.pain_points && d.pain_points.length > 2 ? '...' : ''}` : 'Pain points addressed';
    }
    case 'key_features': {
      const d = data as ProductProfileResearchData['key_features'];
      const features = d.features?.slice(0, 3).map(f => f.name).join(', ') || '';
      return features ? `${features}${d.features && d.features.length > 3 ? '...' : ''}` : 'Key features';
    }
    case 'integrations': {
      const d = data as ProductProfileResearchData['integrations'];
      const integs = d.native_integrations?.slice(0, 3).join(', ') || '';
      return integs ? `${integs}${d.native_integrations && d.native_integrations.length > 3 ? '...' : ''}` : 'Integration details';
    }
    default:
      return 'Section content';
  }
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

// Section color mapping (matches ProductProfileView patterns)
const SECTION_COLORS: Record<SectionKey, { border: string; iconBg: string; icon: string }> = {
  overview: {
    border: 'border-l-4 border-l-slate-400 dark:border-l-slate-500',
    iconBg: 'bg-slate-50 dark:bg-slate-500/10',
    icon: 'text-slate-600 dark:text-slate-400',
  },
  target_market: {
    border: 'border-l-4 border-l-blue-400 dark:border-l-blue-500',
    iconBg: 'bg-blue-50 dark:bg-blue-500/10',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  value_propositions: {
    border: 'border-l-4 border-l-emerald-400 dark:border-l-emerald-500',
    iconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  pricing: {
    border: 'border-l-4 border-l-amber-400 dark:border-l-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-500/10',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  competitors: {
    border: 'border-l-4 border-l-red-400 dark:border-l-red-500',
    iconBg: 'bg-red-50 dark:bg-red-500/10',
    icon: 'text-red-600 dark:text-red-400',
  },
  use_cases: {
    border: 'border-l-4 border-l-violet-400 dark:border-l-violet-500',
    iconBg: 'bg-violet-50 dark:bg-violet-500/10',
    icon: 'text-violet-600 dark:text-violet-400',
  },
  differentiators: {
    border: 'border-l-4 border-l-cyan-400 dark:border-l-cyan-500',
    iconBg: 'bg-cyan-50 dark:bg-cyan-500/10',
    icon: 'text-cyan-600 dark:text-cyan-400',
  },
  pain_points_solved: {
    border: 'border-l-4 border-l-pink-400 dark:border-l-pink-500',
    iconBg: 'bg-pink-50 dark:bg-pink-500/10',
    icon: 'text-pink-600 dark:text-pink-400',
  },
  key_features: {
    border: 'border-l-4 border-l-indigo-400 dark:border-l-indigo-500',
    iconBg: 'bg-indigo-50 dark:bg-indigo-500/10',
    icon: 'text-indigo-600 dark:text-indigo-400',
  },
  integrations: {
    border: 'border-l-4 border-l-teal-400 dark:border-l-teal-500',
    iconBg: 'bg-teal-50 dark:bg-teal-500/10',
    icon: 'text-teal-600 dark:text-teal-400',
  },
};

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
  const [isExpanded, setIsExpanded] = useState(true);
  const isEditing = editingSectionKey === section.key;
  const isEmpty = !data || Object.keys(data).length === 0;
  const colors = SECTION_COLORS[section.key];
  const completeness = calculateCompleteness(section.key, data);
  const summary = generateSummary(section.key, data);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={`group rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 ${colors.border} overflow-hidden bg-white dark:bg-gray-900/80 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-3 px-4 py-3.5 ${colors.iconBg} border-b border-[#E2E8F0] dark:border-gray-700/50 cursor-pointer`}
        onClick={() => !isEditing && setIsExpanded(!isExpanded)}
      >
        <span className={`flex-shrink-0 ${colors.icon}`}>{section.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-[#1E293B] dark:text-gray-100">
              {section.title}
            </h3>
            {/* Completeness indicator */}
            {!isEmpty && (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: completeness.total }).map((_, i) => (
                    <Circle
                      key={i}
                      className={`h-1.5 w-1.5 ${
                        i < completeness.filled
                          ? 'fill-current text-emerald-500'
                          : 'fill-current text-[#E2E8F0] dark:text-gray-700'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[10px] font-medium text-[#64748B] dark:text-gray-400">
                  {completeness.percentage}%
                </span>
              </div>
            )}
          </div>
          {/* Summary line when collapsed */}
          {!isExpanded && !isEditing && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-[#64748B] dark:text-gray-400 truncate mt-1"
            >
              {summary}
            </motion.p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {!isEditing ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEdit(section.key);
                  setIsExpanded(true);
                }}
                className="opacity-0 group-hover:opacity-100 text-[#64748B] hover:text-[#1E293B] dark:text-gray-400 dark:hover:text-gray-200 transition-all p-1.5 rounded-md hover:bg-white/50 dark:hover:bg-gray-800/50"
                title="Edit section"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="text-[#64748B] hover:text-[#1E293B] dark:text-gray-400 dark:hover:text-gray-200 transition-colors p-0.5"
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveEdit();
                }}
                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors p-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                title="Save changes"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelEdit();
                }}
                className="text-[#64748B] hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content area with AnimatePresence */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 py-4">
              {isEditing ? (
                <Textarea
                  value={editJson}
                  onChange={(e) => onEditJsonChange(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                />
              ) : isEmpty ? (
                <p className="text-xs text-[#94A3B8] dark:text-gray-500 italic">No data generated</p>
              ) : (
                <SectionContent sectionKey={section.key} data={data} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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
  const [errorType, setErrorType] = useState<'network' | 'parse' | 'timeout' | 'unknown'>('unknown');
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const [showSuccessCelebration, setShowSuccessCelebration] = useState(false);
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

  // Textarea autofocus ref
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentSection = BUILDER_SECTIONS[stepIndex];
  const isLastStep = stepIndex === BUILDER_SECTIONS.length - 1;

  // Autofocus textarea when step changes
  useEffect(() => {
    if (!generatedDraft && !isGenerating && !generationError && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [stepIndex, generatedDraft, isGenerating, generationError]);

  // Simulate generation progress animation
  useEffect(() => {
    if (!isGenerating) {
      setGenerationProgress(0);
      return;
    }

    const interval = setInterval(() => {
      setGenerationProgress((prev) => {
        if (prev >= BUILDER_SECTIONS.length) return prev;
        return prev + 1;
      });
    }, 600); // Each section "completes" every 600ms

    return () => clearInterval(interval);
  }, [isGenerating]);

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
      setErrorType('unknown');
      setGenerationProgress(0);

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

        // Show success celebration briefly
        setShowSuccessCelebration(true);
        setTimeout(() => setShowSuccessCelebration(false), 2000);

        toast.success('Draft profile generated');
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Failed to generate draft';

        // Categorize error type
        let detectedErrorType: 'network' | 'parse' | 'timeout' | 'unknown' = 'unknown';
        if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
          detectedErrorType = 'network';
        } else if (message.includes('JSON') || message.includes('parse') || message.includes('object')) {
          detectedErrorType = 'parse';
        } else if (message.includes('timeout') || message.includes('aborted')) {
          detectedErrorType = 'timeout';
        }

        setGenerationError(message);
        setErrorType(detectedErrorType);
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
      <AnimatePresence>
        {!generatedDraft && !isGenerating && !generationError ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
          {/* Progress dots with tooltips */}
          <div className="flex items-center gap-1">
            {BUILDER_SECTIONS.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStepIndex(i)}
                className={`group relative h-2 rounded-full transition-all ${
                  i === stepIndex
                    ? 'w-6 bg-brand-blue'
                    : answers[s.key].trim()
                      ? 'w-2 bg-emerald-400 dark:bg-emerald-500'
                      : 'w-2 bg-[#E2E8F0] dark:bg-gray-700'
                }`}
              >
                {/* Tooltip on hover */}
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#1E293B] dark:bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {s.title}
                </span>
              </button>
            ))}
          </div>

          {/* Section summary chips - show answered sections */}
          {completedCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {BUILDER_SECTIONS.filter((s) => answers[s.key].trim()).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStepIndex(BUILDER_SECTIONS.indexOf(s))}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-xs hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                >
                  <span className="text-emerald-600 dark:text-emerald-400">{s.icon}</span>
                  <span className="font-medium">{s.title}</span>
                  <span className="text-[10px] opacity-70 max-w-[120px] truncate">
                    {answers[s.key].substring(0, 30)}...
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Current question card with animation */}
          <AnimatePresence mode="wait">
            <motion.div
              key={stepIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 p-4 space-y-3"
            >
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
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={answers[currentSection.key]}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [currentSection.key]: e.target.value }))
                  }
                  placeholder={currentSection.placeholder}
                  rows={4}
                />
                {/* Character count guidance */}
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span
                    className={`${
                      answers[currentSection.key].length >= 50
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-[#94A3B8] dark:text-gray-500'
                    }`}
                  >
                    {answers[currentSection.key].length} characters
                    {answers[currentSection.key].length < 50 && (
                      <span className="ml-1 opacity-70">(50+ recommended)</span>
                    )}
                  </span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

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
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ----------------------------------------------------------------- */}
      {/* GENERATING state with progress checklist                          */}
      {/* ----------------------------------------------------------------- */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 p-6 space-y-4"
          >
            <div className="flex items-center gap-3 justify-center">
              <Brain className="h-5 w-5 text-brand-blue animate-pulse" />
              <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100">
                Generating your product profile...
              </p>
            </div>

            {/* Section checklist showing progress */}
            <div className="space-y-1.5 max-w-sm mx-auto">
              {BUILDER_SECTIONS.map((section, idx) => {
                const isCompleted = idx < generationProgress;
                const isCurrent = idx === generationProgress;
                return (
                  <motion.div
                    key={section.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`flex items-center gap-2 text-xs transition-all ${
                      isCompleted
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : isCurrent
                          ? 'text-brand-blue'
                          : 'text-[#94A3B8] dark:text-gray-500'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
                    ) : (
                      <span className="h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 border-current" />
                    )}
                    <span className={isCompleted ? 'font-medium' : ''}>{section.title}</span>
                  </motion.div>
                );
              })}
            </div>

            <div className="text-center">
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* ----------------------------------------------------------------- */}
      {/* ERROR state with categorized recovery options                     */}
      {/* ----------------------------------------------------------------- */}
      <AnimatePresence>
        {generationError && !isGenerating && !generatedDraft && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-5 space-y-3"
          >
            <div className="flex items-start gap-2">
              {errorType === 'network' ? (
                <Wifi className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              ) : errorType === 'timeout' ? (
                <Clock className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="space-y-1 flex-1">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  {errorType === 'network'
                    ? 'Network Error'
                    : errorType === 'parse'
                      ? 'Response Parsing Error'
                      : errorType === 'timeout'
                        ? 'Request Timeout'
                        : 'Generation Failed'}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400/80">
                  {generationError}
                </p>

                {/* Contextual recovery suggestions */}
                {errorType === 'network' && (
                  <p className="text-xs text-[#64748B] dark:text-gray-400 mt-2">
                    Check your internet connection and try again.
                  </p>
                )}
                {errorType === 'parse' && (
                  <p className="text-xs text-[#64748B] dark:text-gray-400 mt-2">
                    Try simplifying your answers or providing more structured information. Avoid special characters.
                  </p>
                )}
                {errorType === 'timeout' && (
                  <p className="text-xs text-[#64748B] dark:text-gray-400 mt-2">
                    The request took too long. Try providing shorter answers or generate with fewer sections answered.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={() => runGeneration()}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Retry Generation
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setGenerationError(null);
                  setErrorType('unknown');
                }}
              >
                Back to Questions
              </Button>
            </div>

            <p className="text-[10px] text-[#94A3B8] dark:text-gray-500">
              Your answers are preserved and safe. You can edit them and try again.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ----------------------------------------------------------------- */}
      {/* PHASE 2: Review + Edit + Revise                                   */}
      {/* ----------------------------------------------------------------- */}
      <AnimatePresence>
        {generatedDraft && !isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            {/* Success celebration banner */}
            <AnimatePresence>
              {showSuccessCelebration && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-lg border border-emerald-300 dark:border-emerald-400/30 bg-gradient-to-r from-emerald-100 to-emerald-50 dark:from-emerald-500/20 dark:to-emerald-500/10 px-4 py-3 flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300 shadow-sm"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: 'spring' }}
                  >
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                  </motion.div>
                  <span className="font-medium">Profile generated successfully!</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Success banner */}
            {!showSuccessCelebration && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                Review the generated profile below. Edit any section, then approve to save.
              </div>
            )}

          {/* View toggle */}
          <div className="inline-flex items-center rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/30 p-1">
            <button
              type="button"
              onClick={() => {
                if (showRawJson) handleSyncJsonToDraft();
                else setShowRawJson(false);
              }}
              disabled={!showRawJson}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                !showRawJson
                  ? 'bg-white dark:bg-gray-900 text-[#1E293B] dark:text-gray-100 shadow-sm'
                  : 'text-[#64748B] dark:text-gray-400 hover:text-[#1E293B] dark:hover:text-gray-200'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              type="button"
              onClick={() => {
                if (!showRawJson) {
                  setJsonEditor(JSON.stringify(generatedDraft, null, 2));
                  setShowRawJson(true);
                }
              }}
              disabled={showRawJson}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                showRawJson
                  ? 'bg-white dark:bg-gray-900 text-[#1E293B] dark:text-gray-100 shadow-sm'
                  : 'text-[#64748B] dark:text-gray-400 hover:text-[#1E293B] dark:hover:text-gray-200'
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              JSON
            </button>
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

          {/* Revise with AI - Chat-like input */}
          <div className="rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC]/30 dark:bg-gray-800/20 p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Input
                  id="revision-prompt"
                  value={revisionPrompt}
                  onChange={(e) => setRevisionPrompt(e.target.value)}
                  placeholder="Ask AI to revise... (e.g., make it more enterprise-focused)"
                  className="border-0 bg-white dark:bg-gray-900 shadow-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && revisionPrompt.trim()) {
                      runGeneration(generatedDraft, revisionPrompt);
                    }
                  }}
                />
                <p className="text-[10px] text-[#94A3B8] dark:text-gray-500 mt-1.5 ml-1">
                  Press Enter or click send to regenerate with your feedback
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => runGeneration(generatedDraft, revisionPrompt)}
                disabled={isGenerating || !revisionPrompt.trim()}
                className="mt-0.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t border-[#E2E8F0] dark:border-gray-700/50">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setGeneratedDraft(null);
                setJsonEditor('');
                setShowRawJson(false);
                setEditingSectionKey(null);
              }}
              className="text-[#64748B] dark:text-gray-400"
            >
              Back to Questions
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isSaving || isGenerating}
              size="default"
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-md hover:shadow-lg transition-all px-6"
            >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

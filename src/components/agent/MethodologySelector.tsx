/**
 * MethodologySelector
 *
 * Renders cards for each sales methodology template.
 * Supports selection with visual highlight and current methodology badge.
 */

import { useState } from 'react';
import { CheckCircle2, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMethodologies, type MethodologyTemplate } from '@/lib/hooks/useAgentConfig';

interface MethodologySelectorProps {
  selected: string | null;
  current: string | null;
  onSelect: (key: string) => void;
  disabled?: boolean;
}

const METHODOLOGY_ICONS: Record<string, string> = {
  generic: 'G',
  meddic: 'M',
  bant: 'B',
  spin: 'S',
  challenger: 'C',
};

const METHODOLOGY_INFO: Record<string, { bestFor: string; learnMore: string }> = {
  generic: {
    bestFor: 'Getting started — 60 uses general best practices',
    learnMore: 'The generic framework works for any sales process. 60 will analyze your deals and coach your conversations using universal sales best practices. You can switch to a specific methodology anytime.',
  },
  meddic: {
    bestFor: 'Enterprise deals with complex buying committees',
    learnMore: 'MEDDIC focuses on 6 key elements: Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, and Champion. It helps you qualify complex enterprise deals by ensuring every critical stakeholder and process step is covered.',
  },
  bant: {
    bestFor: 'High-volume sales with clear budget conversations',
    learnMore: 'BANT qualifies deals on Budget, Authority, Need, and Timeline. It works best when you need quick qualification in high-volume pipelines — helping you focus on deals that have money, a decision-maker, a real need, and urgency.',
  },
  spin: {
    bestFor: 'Consultative selling where discovery drives the deal',
    learnMore: 'SPIN Selling structures your discovery calls around Situation, Problem, Implication, and Need-Payoff questions. It helps you uncover deep needs and build value through guided conversation rather than pitching features.',
  },
  challenger: {
    bestFor: 'Teams that lead with insights and industry POV',
    learnMore: 'The Challenger approach focuses on teaching prospects something new, tailoring your message to each stakeholder, and taking control of the buying process. Best when you have strong industry expertise and unique perspectives to share.',
  },
};

function getPreviewCriteria(template: MethodologyTemplate): string[] {
  const criteria = template.qualification_criteria;
  if (!criteria) return [];
  return Object.keys(criteria).slice(0, 4);
}

function getCoachingFocusSummary(template: MethodologyTemplate): string {
  const focus = template.coaching_focus;
  if (!focus) return '';
  const keys = Object.keys(focus);
  if (keys.length === 0) return '';
  return keys.slice(0, 3).join(', ');
}

export function MethodologySelector({
  selected,
  current,
  onSelect,
  disabled = false,
}: MethodologySelectorProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const { data: methodologies, isLoading, error } = useMethodologies();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading methodologies…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-8 text-red-500">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">Failed to load methodologies</span>
      </div>
    );
  }

  const templates = methodologies ?? [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((template) => {
        const isSelected = selected === template.methodology_key;
        const isCurrent = current === template.methodology_key;
        const previewCriteria = getPreviewCriteria(template);
        const coachingSummary = getCoachingFocusSummary(template);
        const letter = METHODOLOGY_ICONS[template.methodology_key] ?? template.methodology_key.charAt(0).toUpperCase();
        const info = METHODOLOGY_INFO[template.methodology_key];
        const isExpanded = expandedKey === template.methodology_key;

        return (
          <button
            key={template.id}
            onClick={() => !disabled && onSelect(template.methodology_key)}
            disabled={disabled}
            className={cn(
              'relative text-left rounded-2xl border p-5 transition-all focus:outline-none',
              'bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl',
              isSelected
                ? 'border-emerald-500 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/10'
                : 'border-gray-200 dark:border-gray-800/60 hover:border-emerald-400/60 hover:shadow-md',
              disabled && 'opacity-60 cursor-not-allowed'
            )}
          >
            {/* Selected check */}
            {isSelected && (
              <CheckCircle2 className="absolute top-3 right-3 w-5 h-5 text-emerald-500" />
            )}

            {/* Icon + badges */}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{letter}</span>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {isCurrent && (
                  <Badge variant="default" className="bg-emerald-500 text-white text-xs">
                    Current
                  </Badge>
                )}
              </div>
            </div>

            {/* Name */}
            <h3 className="font-semibold text-[#1E293B] dark:text-white text-sm mb-1">
              {template.name}
            </h3>

            {/* Description */}
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">
              {template.description}
            </p>

            {/* Best for */}
            {info && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
                <span className="font-medium">Best for: </span>
                {info.bestFor}
              </p>
            )}

            {/* Learn more toggle */}
            {info?.learnMore && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedKey(isExpanded ? null : template.methodology_key);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
                >
                  <ChevronDown className={cn('w-3 h-3 transition-transform', isExpanded && 'rotate-180')} />
                  {isExpanded ? 'Show less' : 'Learn more'}
                </button>
                {isExpanded && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                    {info.learnMore}
                  </p>
                )}
              </div>
            )}

            {/* Qualification criteria preview */}
            {previewCriteria.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">
                  Key criteria
                </p>
                <div className="flex flex-wrap gap-1">
                  {previewCriteria.map((key) => (
                    <span
                      key={key}
                      className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full"
                    >
                      {key}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Coaching focus summary */}
            {coachingSummary && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                <span className="font-medium">Focus: </span>
                {coachingSummary}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

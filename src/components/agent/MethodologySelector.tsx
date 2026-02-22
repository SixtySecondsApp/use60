/**
 * MethodologySelector
 *
 * Renders cards for each sales methodology template.
 * Supports selection with visual highlight and current methodology badge.
 */

import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
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
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
              {template.description}
            </p>

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

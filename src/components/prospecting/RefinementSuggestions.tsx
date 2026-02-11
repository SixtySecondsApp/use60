import React, { useState } from 'react';
import {
  Lightbulb,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Minus,
  Target,
  Expand,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ICPCriteria } from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Suggestion {
  type: 'add_filter' | 'narrow_filter' | 'broaden_filter' | 'remove_filter';
  description: string;
  filter_change: Record<string, unknown>;
  estimated_impact: string;
}

interface RefinementSuggestionsProps {
  resultsSample: Record<string, unknown>[];
  currentCriteria: ICPCriteria;
  provider?: 'apollo' | 'ai_ark';
  action?: 'people_search' | 'company_search';
  onApplySuggestion: (filterChange: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Suggestion Type Config
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<Suggestion['type'], { label: string; icon: React.ReactNode; variant: 'default' | 'success' | 'warning' | 'secondary' }> = {
  add_filter: {
    label: 'Add',
    icon: <Plus className="h-3 w-3" />,
    variant: 'success',
  },
  narrow_filter: {
    label: 'Narrow',
    icon: <Target className="h-3 w-3" />,
    variant: 'default',
  },
  broaden_filter: {
    label: 'Broaden',
    icon: <Expand className="h-3 w-3" />,
    variant: 'warning',
  },
  remove_filter: {
    label: 'Remove',
    icon: <Minus className="h-3 w-3" />,
    variant: 'secondary',
  },
};

// ---------------------------------------------------------------------------
// Suggestion Card
// ---------------------------------------------------------------------------

function SuggestionCard({
  suggestion,
  onApply,
  onDismiss,
}: {
  suggestion: Suggestion;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const config = TYPE_CONFIG[suggestion.type] ?? TYPE_CONFIG.add_filter;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-3 transition-colors hover:border-gray-300 dark:hover:border-gray-600 backdrop-blur-sm">
      <div className="mt-0.5 shrink-0">
        <Badge variant={config.variant} className="gap-1 text-[10px]">
          {config.icon}
          {config.label}
        </Badge>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-[#1E293B] dark:text-gray-100">{suggestion.description}</p>
        {suggestion.estimated_impact && (
          <p className="mt-0.5 text-xs text-[#64748B] dark:text-gray-500">
            Estimated impact: {suggestion.estimated_impact}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onApply}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-brand-blue dark:text-blue-400 hover:bg-brand-blue/10 dark:hover:bg-blue-500/10 transition-colors"
        >
          Apply
        </button>
        <button
          onClick={onDismiss}
          className="rounded-lg p-1 text-[#94A3B8] hover:text-[#64748B] dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RefinementSuggestions({
  resultsSample,
  currentCriteria,
  provider,
  action,
  onApplySuggestion,
}: RefinementSuggestionsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  // Fetch suggestions from edge function
  const {
    data: suggestions,
    mutate: fetchSuggestions,
    isPending,
    isIdle,
  } = useMutation<Suggestion[], Error>({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('prospecting-refine', {
        body: {
          results_sample: resultsSample.slice(0, 50),
          current_criteria: currentCriteria,
          provider,
          action,
        },
      });

      if (error) throw error;
      return (data?.suggestions ?? []) as Suggestion[];
    },
  });

  // Filter out dismissed suggestions
  const visibleSuggestions = (suggestions ?? []).filter(
    (_, i) => !dismissedIds.has(i)
  );

  const handleDismiss = (index: number) => {
    setDismissedIds((prev) => new Set(prev).add(index));
  };

  // Don't render if no results to analyze
  if (resultsSample.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200/50 dark:border-amber-500/20 bg-amber-50/30 dark:bg-amber-500/5 backdrop-blur-sm">
      {/* Collapsible Header */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
          // Fetch on first expand if idle
          if (isIdle && !isExpanded) {
            fetchSuggestions();
          }
        }}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium text-[#1E293B] dark:text-gray-100">
            AI Refinement Suggestions
          </span>
          {visibleSuggestions.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {visibleSuggestions.length}
            </Badge>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-[#94A3B8]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[#94A3B8]" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-amber-200/30 dark:border-amber-500/10 px-4 pb-4 pt-3">
          {isPending && (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
              <span className="text-sm text-[#64748B] dark:text-gray-400">
                Analyzing results...
              </span>
            </div>
          )}

          {isIdle && (
            <div className="flex flex-col items-center py-4">
              <p className="mb-3 text-sm text-[#64748B] dark:text-gray-400">
                Get AI-powered suggestions to improve your search targeting
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchSuggestions()}
                className="gap-2"
              >
                <Lightbulb className="h-4 w-4" />
                Analyze Results
              </Button>
            </div>
          )}

          {!isPending && !isIdle && visibleSuggestions.length === 0 && (
            <p className="py-4 text-center text-sm text-[#64748B] dark:text-gray-500">
              No suggestions available. Your filters look well-optimized.
            </p>
          )}

          {visibleSuggestions.length > 0 && (
            <div className="space-y-2">
              {visibleSuggestions.map((suggestion, i) => {
                // Find original index for dismiss tracking
                const originalIndex = (suggestions ?? []).indexOf(suggestion);
                return (
                  <SuggestionCard
                    key={originalIndex}
                    suggestion={suggestion}
                    onApply={() => onApplySuggestion(suggestion.filter_change)}
                    onDismiss={() => handleDismiss(originalIndex)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

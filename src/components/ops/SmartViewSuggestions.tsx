import React from 'react';
import { X, Sparkles, Filter, ArrowUpDown } from 'lucide-react';
import type { FilterCondition, SortConfig } from '@/lib/services/opsTableService';

interface ViewSuggestion {
  name: string;
  description: string;
  filterConditions: FilterCondition[];
  sortConfig: SortConfig[];
}

interface SmartViewSuggestionsProps {
  suggestions: ViewSuggestion[];
  onApply: (suggestion: ViewSuggestion) => void;
  onDismiss: () => void;
}

export function SmartViewSuggestions({
  suggestions,
  onApply,
  onDismiss,
}: SmartViewSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-violet-400">
          <Sparkles className="h-3.5 w-3.5" />
          Suggested views for your data
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onApply(s)}
            className="group inline-flex flex-col items-start gap-0.5 rounded-md border border-gray-700 bg-gray-800/50 px-3 py-2 text-left transition-all hover:border-violet-500/40 hover:bg-gray-800"
          >
            <span className="text-xs font-medium text-gray-200 group-hover:text-white">
              {s.name}
            </span>
            <span className="text-[10px] text-gray-500 line-clamp-1">
              {s.description}
            </span>
            <div className="mt-1 flex items-center gap-2">
              {s.filterConditions.length > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                  <Filter className="h-2.5 w-2.5" />
                  {s.filterConditions.length}
                </span>
              )}
              {s.sortConfig.length > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                  <ArrowUpDown className="h-2.5 w-2.5" />
                  {s.sortConfig.length}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

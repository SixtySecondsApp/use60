import { SlidersHorizontal, Plus, Sparkles, Loader2 } from 'lucide-react';

interface ApolloSourceControlsProps {
  onEditFilters: () => void;
  onCollectMore: () => void;
  onEnrichAll?: () => void;
  isEnriching?: boolean;
}

export function ApolloSourceControls({
  onEditFilters,
  onCollectMore,
  onEnrichAll,
  isEnriching,
}: ApolloSourceControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onEditFilters}
        className="inline-flex items-center gap-1.5 rounded-lg border border-purple-700/40 bg-purple-900/20 px-3 py-1.5 text-sm font-medium text-purple-300 transition-colors hover:bg-purple-900/40 hover:text-purple-200"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
      </button>
      <button
        onClick={onCollectMore}
        className="inline-flex items-center gap-1.5 rounded-lg border border-purple-700/40 bg-purple-900/20 px-3 py-1.5 text-sm font-medium text-purple-300 transition-colors hover:bg-purple-900/40 hover:text-purple-200"
      >
        <Plus className="h-3.5 w-3.5" />
        Collect More
      </button>
      {onEnrichAll && (
        <button
          onClick={onEnrichAll}
          disabled={isEnriching}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm shadow-purple-500/20 transition-all hover:from-purple-400 hover:to-indigo-500 hover:shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isEnriching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isEnriching ? 'Enriching...' : 'Enrich All'}
        </button>
      )}
    </div>
  );
}

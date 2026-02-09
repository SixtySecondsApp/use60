import { SlidersHorizontal, Plus } from 'lucide-react';

interface ApolloSourceControlsProps {
  onEditFilters: () => void;
  onCollectMore: () => void;
}

export function ApolloSourceControls({
  onEditFilters,
  onCollectMore,
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
    </div>
  );
}

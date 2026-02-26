/**
 * CCFilterBar — CC-005
 *
 * Replaces the 5-tab system with 4 pill filters: All | Needs You | Deals | Signals
 * "Needs You" always shows its badge count regardless of which filter is active.
 */

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// Types
// ============================================================================

export type CCFilter = 'all' | 'needs-you' | 'deals' | 'signals';

export interface CCFilterBarProps {
  activeFilter: CCFilter;
  onFilterChange: (filter: CCFilter) => void;
  needsYouCount: number;
}

// ============================================================================
// Filter definitions
// ============================================================================

const FILTERS: { id: CCFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'needs-you', label: 'Needs You' },
  { id: 'deals', label: 'Deals' },
  { id: 'signals', label: 'Signals' },
];

// ============================================================================
// Component
// ============================================================================

export function CCFilterBar({ activeFilter, onFilterChange, needsYouCount }: CCFilterBarProps) {
  return (
    <div className="flex items-center gap-1">
      {FILTERS.map((filter) => {
        const isActive = activeFilter === filter.id;

        return (
          <button
            key={filter.id}
            onClick={() => onFilterChange(filter.id)}
            className={cn(
              'h-8 px-4 text-xs rounded-md font-medium transition-colors inline-flex items-center gap-1.5',
              isActive
                ? 'bg-slate-100 dark:bg-gray-800 text-slate-800 dark:text-gray-100'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-800/60',
            )}
          >
            {filter.label}
            {filter.id === 'needs-you' && needsYouCount > 0 && (
              <Badge className="ml-0.5 h-4 min-w-4 px-1 text-[10px] bg-amber-500 text-white border-0">
                {needsYouCount}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}

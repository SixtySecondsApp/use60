/**
 * useCommandCentreDeepLinks Hook
 *
 * Manages URL search params for the Command Centre page.
 * Supports deep linking to a specific item and/or filter on page load.
 *
 * Supported URL shapes:
 *   /command-centre?item={id}                       — auto-opens detail panel
 *   /command-centre?filter=needs-you                — opens with filter active
 *   /command-centre?filter=deals&item={id}          — filter + specific item panel
 *
 * @see src/lib/services/commandCentreItemsService.ts
 */

import { useSearchParams } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { commandCentreItemsService, type CCItem } from '@/lib/services/commandCentreItemsService';

// ============================================================================
// Constants
// ============================================================================

// Maps URL filter param values to internal filter identifiers
const FILTER_MAP: Record<string, string> = {
  'all': 'all',
  'needs-you': 'needs-you',
  'deals': 'deals',
  'signals': 'signals',
};

// ============================================================================
// Types
// ============================================================================

interface UseCommandCentreDeepLinksOptions {
  /** Current list of items already loaded in the feed */
  items: CCItem[];
  /** Callback to open/close the detail panel for a given item */
  onSelectItem: (item: CCItem | null) => void;
  /** Callback to switch the active filter */
  onSelectFilter: (filter: string) => void;
}

interface UseCommandCentreDeepLinksReturn {
  /** Call when the user opens/closes a detail panel — updates ?item= param */
  updateItemParam: (itemId: string | null) => void;
  /** Call when the user changes the active filter — updates ?filter= param */
  updateFilterParam: (filter: string) => void;
  /** True once the initial deep-link resolution attempt has completed */
  initialLoadDone: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useCommandCentreDeepLinks(
  options: UseCommandCentreDeepLinksOptions
): UseCommandCentreDeepLinksReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // ------------------------------------------------------------------
  // On mount (and whenever items arrive), resolve the initial deep link.
  // The effect re-runs each render until initialLoadDone becomes true.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (initialLoadDone) return;

    const filterParam = searchParams.get('filter');
    const itemParam = searchParams.get('item');

    // Apply filter first — happens immediately regardless of item resolution
    if (filterParam && FILTER_MAP[filterParam]) {
      options.onSelectFilter(FILTER_MAP[filterParam]);
    }

    if (!itemParam) {
      // No item param — nothing more to do
      setInitialLoadDone(true);
      return;
    }

    // Try to find the item in the already-loaded feed
    const found = options.items.find(i => i.id === itemParam);
    if (found) {
      options.onSelectItem(found);
      setInitialLoadDone(true);
      return;
    }

    // Items have loaded but the target item isn't among them — fetch directly
    if (options.items.length > 0) {
      commandCentreItemsService.getItemById(itemParam).then(item => {
        if (item) {
          options.onSelectItem(item);
        }
        setInitialLoadDone(true);
      });
      return;
    }

    // Items haven't loaded yet — the effect will re-run once they arrive
  }, [options.items, searchParams, initialLoadDone, options]);

  // ------------------------------------------------------------------
  // Update ?item= param when panel opens/closes.
  // Uses replace:true to avoid polluting browser history on every toggle.
  // ------------------------------------------------------------------
  const updateItemParam = useCallback(
    (itemId: string | null) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (itemId) {
            next.set('item', itemId);
          } else {
            next.delete('item');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // ------------------------------------------------------------------
  // Update ?filter= param when the active filter changes.
  // 'all' is the default — omit the param rather than showing ?filter=all.
  // ------------------------------------------------------------------
  const updateFilterParam = useCallback(
    (filter: string) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (filter && filter !== 'all') {
            next.set('filter', filter);
          } else {
            next.delete('filter');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return {
    updateItemParam,
    updateFilterParam,
    initialLoadDone,
  };
}

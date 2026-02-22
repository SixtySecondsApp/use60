/**
 * EntityMentionDropdown
 *
 * Floating autocomplete dropdown for @ mentions.
 * Shows contacts, companies, and deals matching the query.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { User, Building2, Briefcase, Loader2 } from 'lucide-react';
import { useEntitySearch } from '@/lib/hooks/useEntitySearch';
import { cn } from '@/lib/utils';
import type { EntitySearchResult, EntityReference, EntityType } from '@/lib/types/entitySearch';

interface EntityMentionDropdownProps {
  query: string;
  caretRect: DOMRect | null;
  onSelect: (entity: EntityReference) => void;
  onDismiss: () => void;
  /** For keyboard navigation forwarded from the input */
  onKeyDown?: (e: React.KeyboardEvent) => boolean; // return true if handled
}

const TYPE_ICONS: Record<EntityType, typeof User> = {
  contact: User,
  company: Building2,
  deal: Briefcase,
};

const TYPE_LABELS: Record<EntityType, string> = {
  contact: 'Contacts',
  company: 'Companies',
  deal: 'Deals',
};

export function EntityMentionDropdown({
  query,
  caretRect,
  onSelect,
  onDismiss,
}: EntityMentionDropdownProps) {
  const { results, isLoading } = useEntitySearch(query);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Group results by type
  const grouped = groupByType(results);
  const flatItems = results; // for keyboard navigation indexing

  // Keyboard navigation — exposed to parent via ref pattern
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (flatItems.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % flatItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const selected = flatItems[selectedIndex];
        if (selected) {
          onSelect({ id: selected.id, type: selected.type, name: selected.name });
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    },
    [flatItems, selectedIndex, onSelect, onDismiss],
  );

  // Attach keyboard listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  // Click outside to dismiss
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onDismiss]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Position the dropdown near the caret
  const style: React.CSSProperties = caretRect
    ? {
        position: 'fixed',
        left: caretRect.left,
        bottom: window.innerHeight - caretRect.top + 8,
        maxHeight: 320,
        zIndex: 50,
      }
    : { display: 'none' };

  if (!isLoading && results.length === 0 && query.length > 0) {
    return (
      <div ref={listRef} style={style} className="w-72 rounded-lg border border-gray-700/60 bg-gray-900/95 backdrop-blur-sm shadow-xl p-3 text-sm text-gray-400">
        No results for &ldquo;{query}&rdquo;
      </div>
    );
  }

  return (
    <div ref={listRef} style={style} className="w-80 rounded-lg border border-gray-700/60 bg-gray-900/95 backdrop-blur-sm shadow-xl overflow-hidden">
      {isLoading && results.length === 0 && (
        <div className="flex items-center gap-2 p-3 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Searching...
        </div>
      )}

      <div className="max-h-80 overflow-y-auto py-1">
        {grouped.map(({ type, items }) => (
          <div key={type}>
            <div className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
              {TYPE_LABELS[type]}
            </div>
            {items.map((item) => {
              const globalIdx = flatItems.indexOf(item);
              const Icon = TYPE_ICONS[item.type];
              return (
                <button
                  key={item.id}
                  type="button"
                  data-index={globalIdx}
                  onClick={() => onSelect({ id: item.id, type: item.type, name: item.name })}
                  onMouseEnter={() => setSelectedIndex(globalIdx)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                    globalIdx === selectedIndex
                      ? 'bg-violet-500/20 text-gray-100'
                      : 'text-gray-300 hover:bg-gray-800/60',
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    {item.subtitle && (
                      <div className="text-xs text-gray-500 truncate">{item.subtitle}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// Group results by entity type, maintaining order
function groupByType(
  results: EntitySearchResult[],
): { type: EntityType; items: EntitySearchResult[] }[] {
  const order: EntityType[] = ['contact', 'company', 'deal'];
  const map = new Map<EntityType, EntitySearchResult[]>();

  for (const r of results) {
    if (!map.has(r.type)) map.set(r.type, []);
    map.get(r.type)!.push(r);
  }

  return order.filter((t) => map.has(t)).map((t) => ({ type: t, items: map.get(t)! }));
}

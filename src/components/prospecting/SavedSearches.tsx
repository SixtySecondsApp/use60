import { useState, useEffect } from 'react';
import { Clock, Search, Trash2, Building2, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SavedSearch {
  id: string;
  name: string;
  provider: 'ai_ark' | 'apollo';
  searchType: 'company' | 'people';
  resultCount: number;
  createdAt: string; // ISO string
  filters: Record<string, unknown>;
}

const STORAGE_KEY = 'prospecting_saved_searches';

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

export function getSavedSearches(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedSearch[];
  } catch {
    return [];
  }
}

export function addSavedSearch(search: Omit<SavedSearch, 'id' | 'createdAt'>): SavedSearch {
  const saved: SavedSearch = {
    ...search,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const existing = getSavedSearches();
  // Keep last 50
  const updated = [saved, ...existing].slice(0, 50);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* quota exceeded — ignore */ }
  return saved;
}

export function removeSavedSearch(id: string): void {
  const existing = getSavedSearches();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.filter((s) => s.id !== id)));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SavedSearchesProps {
  onSelect?: (search: SavedSearch) => void;
  className?: string;
}

const PROVIDER_LABELS: Record<SavedSearch['provider'], string> = {
  ai_ark: 'AI Ark',
  apollo: 'Apollo',
};

const PROVIDER_COLORS: Record<SavedSearch['provider'], string> = {
  ai_ark: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  apollo: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
};

export function SavedSearches({ onSelect, className }: SavedSearchesProps) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    setSearches(getSavedSearches());
  }, []);

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeSavedSearch(id);
    setSearches((prev) => prev.filter((s) => s.id !== id));
  };

  if (searches.length === 0) {
    return (
      <div className={className}>
        <h3 className="text-xs font-medium text-zinc-400 mb-3 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Recent Searches
        </h3>
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-4 py-6 text-center">
          <Search className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
          <p className="text-xs text-zinc-600">No saved searches yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <h3 className="text-xs font-medium text-zinc-400 mb-3 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" />
        Recent Searches
      </h3>
      <div className="space-y-1.5">
        {searches.map((search) => (
          <button
            key={search.id}
            type="button"
            onClick={() => onSelect?.(search)}
            className="w-full group flex items-start gap-2.5 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5 text-left hover:border-zinc-700 hover:bg-zinc-800/40 transition-colors"
          >
            <div className="mt-0.5 shrink-0">
              {search.searchType === 'company' ? (
                <Building2 className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <Users className="w-3.5 h-3.5 text-zinc-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs font-medium text-zinc-200 truncate">{search.name}</span>
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-medium ${PROVIDER_COLORS[search.provider]}`}>
                  {PROVIDER_LABELS[search.provider]}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                <span>{search.resultCount.toLocaleString()} results</span>
                <span>·</span>
                <span>{formatDistanceToNow(new Date(search.createdAt), { addSuffix: true })}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => handleRemove(search.id, e)}
              className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
              title="Remove"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}

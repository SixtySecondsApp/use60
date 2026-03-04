/**
 * TranscriptSearch
 *
 * LIB-003: Search bar with transcript search integration.
 * Calls the meeting-analytics search endpoint via useMeetingSearch.
 * Results highlight matching transcript segments.
 * Filters combine with search query via callback.
 */

import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2, MessageSquare, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMeetingSearch } from '@/lib/hooks/useMeetingSearch';
import { format } from 'date-fns';

// ============================================================================
// Highlight helper — wraps matched terms in <mark>
// ============================================================================

function highlightSnippet(text: string, query: string): string {
  if (!query.trim()) return text;
  const words = query.trim().split(/\s+/).filter(Boolean);
  let result = text;
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`(${escaped})`, 'gi'),
      '<mark class="bg-yellow-200 dark:bg-yellow-500/30 text-inherit rounded-sm px-0.5">$1</mark>',
    );
  }
  return result;
}

// ============================================================================
// Types
// ============================================================================

interface TranscriptSearchProps {
  /** Called when user submits search — parent can combine with other filters */
  onQueryChange?: (query: string) => void;
  className?: string;
  /** Show inline results panel (true) or just fire onQueryChange (false) */
  showResults?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function TranscriptSearch({ onQueryChange, className, showResults = true }: TranscriptSearchProps) {
  const navigate = useNavigate();
  const { results, isSearching, error, search, clearResults } = useMeetingSearch();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    onQueryChange?.(value);

    if (!showResults) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    if (!value.trim()) {
      clearResults();
      setOpen(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      search(value.trim());
      setOpen(true);
    }, 400);
  }, [onQueryChange, search, clearResults, showResults]);

  function handleClear() {
    setQuery('');
    clearResults();
    setOpen(false);
    onQueryChange?.('');
    inputRef.current?.focus();
  }

  function handleResultClick(meetingId: string) {
    setOpen(false);
    navigate(`/meetings/${meetingId}`);
  }

  return (
    <div className={cn('relative', className)}>
      {/* Search input */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search across meeting transcripts..."
          className="pl-9 pr-9 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-sm"
        />
        {(query || isSearching) && (
          <div className="absolute right-2 flex items-center">
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <button onClick={handleClear} className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results dropdown */}
      {showResults && open && (results.length > 0 || error) && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          {error ? (
            <div className="px-4 py-3 text-sm text-red-500 dark:text-red-400">
              Search failed — {error}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto">
              {results.map((result, i) => (
                <li key={`${result.meeting_id}-${i}`}>
                  <button
                    onClick={() => handleResultClick(result.meeting_id)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                        {result.meeting_title || 'Untitled Meeting'}
                      </span>
                      {result.meeting_date && (
                        <span className="flex items-center gap-1 text-[10px] text-gray-400 flex-shrink-0">
                          <Calendar className="h-2.5 w-2.5" />
                          {format(new Date(result.meeting_date), 'MMM d')}
                        </span>
                      )}
                    </div>
                    {result.snippet && (
                      <div className="flex items-start gap-1.5">
                        <MessageSquare className="h-3 w-3 text-gray-400 flex-shrink-0 mt-0.5" />
                        <p
                          className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2"
                          dangerouslySetInnerHTML={{
                            __html: highlightSnippet(result.snippet, query),
                          }}
                        />
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {results.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40">
              <span className="text-[10px] text-gray-400">
                {results.length} result{results.length !== 1 ? 's' : ''} across transcripts
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

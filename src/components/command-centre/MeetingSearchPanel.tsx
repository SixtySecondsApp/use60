import { useState, useRef, useCallback } from 'react';
import { Search, Video, Clock, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { useMeetingSearch } from '@/lib/hooks/useMeetingSearch';
import { cn } from '@/lib/utils';

interface MeetingSearchPanelProps {
  contactId?: string;
  dealId?: string;
}

export function MeetingSearchPanel({ contactId, dealId }: MeetingSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const { results, isSearching, error, search, clearResults } = useMeetingSearch();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      clearResults();
      return;
    }

    debounceRef.current = setTimeout(() => {
      search(value, { contact_id: contactId, deal_id: dealId });
    }, 500);
  }, [contactId, dealId, search, clearResults]);

  const highlightSnippet = (text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text;
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/30 rounded px-0.5">{part}</mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search meeting transcripts..."
          className="w-full h-8 rounded-lg border border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 pl-8 pr-3 text-xs text-slate-700 dark:text-gray-300 placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
        />
        {isSearching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-400 animate-spin" />
        )}
      </div>

      {/* Filters hint */}
      {(contactId || dealId) && (
        <p className="text-[10px] text-slate-400 dark:text-gray-500">
          Searching {contactId ? "this contact's " : ''}{dealId ? "this deal's " : ''}meetings
        </p>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-slate-400 dark:text-gray-500 uppercase tracking-wider font-medium">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </p>
          {results.map((result) => (
            <button
              key={`${result.meeting_id}-${result.timestamp || Math.random()}`}
              onClick={() => setExpandedResult(
                expandedResult === result.meeting_id ? null : result.meeting_id
              )}
              className="w-full text-left rounded-lg border border-slate-200 dark:border-gray-700/50 p-2.5 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-start gap-2">
                <Video className="h-3.5 w-3.5 text-indigo-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 dark:text-gray-300 truncate">
                    {result.meeting_title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {result.meeting_date && (
                      <span className="text-[10px] text-slate-400 dark:text-gray-500">
                        {new Date(result.meeting_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {result.speaker && (
                      <>
                        <span className="text-slate-300 dark:text-gray-600">·</span>
                        <span className="text-[10px] text-slate-400 dark:text-gray-500">{result.speaker}</span>
                      </>
                    )}
                    {result.timestamp && (
                      <>
                        <span className="text-slate-300 dark:text-gray-600">·</span>
                        <span className="text-[10px] text-slate-400 dark:text-gray-500 flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" /> {result.timestamp}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-gray-400 mt-1.5 leading-relaxed line-clamp-3">
                    {highlightSnippet(result.snippet, query)}
                  </p>
                </div>
                <ChevronRight className={cn(
                  'h-3 w-3 text-slate-300 transition-transform shrink-0',
                  expandedResult === result.meeting_id && 'rotate-90'
                )} />
              </div>

              {/* Expanded view */}
              {expandedResult === result.meeting_id && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-gray-700/30">
                  <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                    {highlightSnippet(result.snippet, query)}
                  </p>
                  <a
                    href={`/meetings/${result.meeting_id}`}
                    className="inline-flex items-center gap-1 mt-2 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View full meeting
                    <ChevronRight className="h-2.5 w-2.5" />
                  </a>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isSearching && query.trim() && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Search className="h-6 w-6 text-slate-300 dark:text-gray-600 mb-2" />
          <p className="text-xs text-slate-500 dark:text-gray-400">No results found</p>
          <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5">Try different keywords</p>
        </div>
      )}

      {/* Initial state */}
      {!query.trim() && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Search className="h-6 w-6 text-slate-300 dark:text-gray-600 mb-2" />
          <p className="text-xs text-slate-500 dark:text-gray-400">Search across meeting transcripts</p>
          <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5">
            e.g. &ldquo;what did they say about budget?&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}

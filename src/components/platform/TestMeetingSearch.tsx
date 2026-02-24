/**
 * TestMeetingSearch
 *
 * Search component for finding and selecting any meeting for skill testing.
 */

import { useState, useCallback, useEffect } from 'react';
import { Search, Loader2, Video, Building2, Clock, FileText, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { searchTestMeetings, type TestMeeting } from '@/lib/hooks/useTestMeetings';
import { getTierColorClasses } from '@/lib/utils/entityTestTypes';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { format } from 'date-fns';

interface TestMeetingSearchProps {
  selectedMeeting: TestMeeting | null;
  onSelect: (meeting: TestMeeting | null) => void;
}

export function TestMeetingSearch({ selectedMeeting, onSelect }: TestMeetingSearchProps) {
  const { user } = useAuth();
  const { activeOrgId } = useOrgStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TestMeeting[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Debounce the search query
  const debouncedQuery = useDebounce(query, 300);

  // Perform search when debounced query changes
  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedQuery.trim() || !user?.id) {
        setResults([]);
        setHasSearched(false);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const meetings = await searchTestMeetings(user.id, user?.email, activeOrgId, debouncedQuery, 10);
        setResults(meetings);
        setHasSearched(true);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedQuery, user?.id, user?.email, activeOrgId]);

  // Show loading when query is different from debounced query
  const showLoading = isSearching || (query.trim() && query !== debouncedQuery);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
  }, []);

  const handleClearSelection = () => {
    onSelect(null);
    setQuery('');
    setResults([]);
    setHasSearched(false);
  };

  // If a meeting is selected, show it as a selected card
  if (selectedMeeting) {
    const displayTitle = selectedMeeting.title || 'Untitled Meeting';
    const tierColors = getTierColorClasses(selectedMeeting.qualityScore.tier);
    const hasTranscript = !!selectedMeeting.transcript_text;
    const hasSummary = !!selectedMeeting.summary;

    return (
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Selected Meeting
        </label>
        <div
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg border',
            tierColors.border,
            tierColors.bg
          )}
        >
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
              tierColors.bg,
              tierColors.text
            )}
          >
            <Video className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {displayTitle}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {selectedMeeting.meeting_start && (
                <span>{format(new Date(selectedMeeting.meeting_start), 'MMM d, yyyy')}</span>
              )}
              {selectedMeeting.duration_minutes && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {Math.round(selectedMeeting.duration_minutes)}m
                </span>
              )}
              {selectedMeeting.company_name && (
                <span className="flex items-center gap-1 truncate max-w-[100px]">
                  <Building2 className="w-3 h-3" />
                  {selectedMeeting.company_name}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1">
              {hasTranscript && (
                <span className="flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <FileText className="w-3 h-3" />
                </span>
              )}
              {hasSummary && (
                <span className="text-xs text-blue-600 dark:text-blue-400">AI</span>
              )}
            </div>
            <span className={cn('text-xs font-semibold', tierColors.text)}>
              {selectedMeeting.qualityScore.tier} ({selectedMeeting.qualityScore.score}/100)
            </span>
            <button
              type="button"
              onClick={handleClearSelection}
              className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Search Meetings
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search by meeting title..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="pl-9"
        />
        {showLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
        )}
      </div>

      {/* Search results */}
      {hasSearched && results.length === 0 && !showLoading && (
        <div className="text-center py-4">
          <Video className="w-6 h-6 text-gray-300 dark:text-gray-600 mx-auto mb-1" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No meetings found for "{query}"
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1 max-h-[220px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 p-2">
          {results.map((meeting) => {
            const displayTitle = meeting.title || 'Untitled Meeting';
            const tierColors = getTierColorClasses(meeting.qualityScore.tier);
            const hasTranscript = !!meeting.transcript_text;
            const hasSummary = !!meeting.summary;

            return (
              <button
                key={meeting.id}
                type="button"
                onClick={() => onSelect(meeting)}
                className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left transition-colors"
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                    tierColors.bg,
                    tierColors.text
                  )}
                >
                  <Video className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {displayTitle}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    {meeting.meeting_start && (
                      <span>{format(new Date(meeting.meeting_start), 'MMM d')}</span>
                    )}
                    {meeting.duration_minutes && (
                      <span>{Math.round(meeting.duration_minutes)}m</span>
                    )}
                    {hasTranscript && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        <FileText className="w-3 h-3 inline" />
                      </span>
                    )}
                    {hasSummary && (
                      <span className="text-blue-600 dark:text-blue-400">AI</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className={cn('text-xs font-medium', tierColors.text)}>
                    {meeting.qualityScore.tier}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {meeting.qualityScore.score}/100
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

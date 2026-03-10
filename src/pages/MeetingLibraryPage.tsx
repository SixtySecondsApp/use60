/**
 * MeetingLibraryPage
 *
 * LIB-001: Meeting library at /meetings/library.
 * Grid of recording cards with metadata.
 * Filters: date range, meeting type, source, has_recording.
 * Transcript search integration (LIB-003).
 * BestCallsPanel sidebar (LIB-006).
 * Infinite-scroll pagination.
 */

import { useState, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import {
  Video,
  Grid2X2,
  List,
  SlidersHorizontal,
  Star,
  ChevronDown,
  Loader2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

import { useUnifiedMeetings, type UnifiedMeetingsFilters } from '@/lib/hooks/useUnifiedMeetings';
import { RecordingCard } from '@/components/meetings/RecordingCard';
import { TranscriptSearch } from '@/components/meetings/TranscriptSearch';
import { BestCallsPanel } from '@/components/meetings/BestCallsCollection';
import { ShareMeetingDialog } from '@/components/meetings/ShareMeetingDialog';
import { ContentGenerationMenu } from '@/components/meetings/ContentGenerationMenu';
import type { UnifiedMeeting, UnifiedSource } from '@/lib/types/unifiedMeeting';

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_FILTERS: UnifiedMeetingsFilters = {
  scope: 'me',
  sourceFilter: 'all',
  statusFilter: 'all',
  platformFilter: 'all',
  sortField: 'meeting_start',
  sortDirection: 'desc',
  dateRange: undefined,
  selectedRepId: null,
  durationBucket: 'all',
  sentimentCategory: 'all',
  coachingCategory: 'all',
};

const ITEMS_PER_PAGE = 30;

// ============================================================================
// List row variant
// ============================================================================

function RecordingListRow({
  meeting,
  onShare,
  onGenerate,
}: {
  meeting: UnifiedMeeting;
  onShare: (m: UnifiedMeeting) => void;
  onGenerate: (m: UnifiedMeeting) => void;
}) {
  const navigate = useNavigate();

  return (
    <div
      className="group flex items-center gap-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 px-4 py-3 hover:border-gray-300 dark:hover:border-gray-700 transition-colors cursor-pointer"
      onClick={() => navigate(meeting.detailPath)}
    >
      {/* Thumbnail (small) */}
      <div className="h-12 w-16 flex-shrink-0 rounded overflow-hidden bg-gray-100 dark:bg-gray-800">
        {meeting.thumbnailUrl ? (
          <img src={meeting.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="h-4 w-4 text-gray-400" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {meeting.title || 'Untitled Meeting'}
        </h3>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
          {meeting.date && <span>{format(new Date(meeting.date), 'MMM d, yyyy')}</span>}
          {meeting.companyName && (
            <>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span className="truncate">{meeting.companyName}</span>
            </>
          )}
          {meeting.durationMinutes && (
            <>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span>
                {meeting.durationMinutes >= 60
                  ? `${Math.floor(meeting.durationMinutes / 60)}h ${meeting.durationMinutes % 60}m`
                  : `${meeting.durationMinutes}m`
                }
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions (visible on hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={(e) => { e.stopPropagation(); onShare(meeting); }}
        >
          Share
        </Button>
        <ContentGenerationMenu meetingId={meeting.id} meetingTitle={meeting.title}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={(e) => e.stopPropagation()}
          >
            Generate
          </Button>
        </ContentGenerationMenu>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function MeetingLibraryPage() {
  const [filters, setFilters] = useState<UnifiedMeetingsFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showBestCalls, setShowBestCalls] = useState(false);

  // Share state
  const [shareTarget, setShareTarget] = useState<UnifiedMeeting | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const dateFilter = useDateRangeFilter('30d');

  const { items, totalCount, totalPages, isLoading } = useUnifiedMeetings(
    { ...filters, dateRange: dateFilter.dateRange },
    page,
  );

  function updateFilter<K extends keyof UnifiedMeetingsFilters>(
    key: K,
    value: UnifiedMeetingsFilters[K],
  ) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function handleShare(meeting: UnifiedMeeting) {
    setShareTarget(meeting);
    setShareOpen(true);
  }

  function handleGenerate(meeting: UnifiedMeeting) {
    // ContentGenerationMenu opens its own modal; this is a no-op fallback
    toast.info('Use the Generate button on the card menu');
  }

  const hasActiveFilters =
    filters.sourceFilter !== 'all' ||
    filters.durationBucket !== 'all' ||
    filters.sentimentCategory !== 'all' ||
    dateFilter.datePreset !== '30d';

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    dateFilter.handleClear();
    setPage(1);
  }

  return (
    <>
      <Helmet>
        <title>Meeting Library — 60</title>
      </Helmet>

      <div className="flex h-full min-h-0">
        {/* Best Calls sidebar */}
        {showBestCalls && (
          <aside className="w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-4 overflow-y-auto">
            <BestCallsPanel />
          </aside>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-6 py-4">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Meeting Library
                </h1>
                {!isLoading && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {totalCount} recording{totalCount !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={showBestCalls ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setShowBestCalls(!showBestCalls)}
                >
                  <Star className={cn('h-3.5 w-3.5', showBestCalls && 'text-amber-300')} />
                  Best Calls
                </Button>

                <div className="flex items-center rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-8 w-8 p-0 rounded-none',
                      viewMode === 'grid' && 'bg-gray-100 dark:bg-gray-800',
                    )}
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid2X2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-8 w-8 p-0 rounded-none',
                      viewMode === 'list' && 'bg-gray-100 dark:bg-gray-800',
                    )}
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Search + Filters */}
            <div className="flex items-center gap-3">
              {/* Transcript search */}
              <TranscriptSearch className="flex-1 max-w-sm" showResults />

              {/* Source filter */}
              <Select
                value={filters.sourceFilter}
                onValueChange={(v) => updateFilter('sourceFilter', v as UnifiedSource | 'all')}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All sources</SelectItem>
                  <SelectItem value="fathom" className="text-xs">Fathom</SelectItem>
                  <SelectItem value="fireflies" className="text-xs">Fireflies</SelectItem>
                  <SelectItem value="voice" className="text-xs">Voice</SelectItem>
                  <SelectItem value="60_notetaker" className="text-xs">60 Notetaker</SelectItem>
                </SelectContent>
              </Select>

              {/* Duration filter */}
              <Select
                value={filters.durationBucket}
                onValueChange={(v) => updateFilter('durationBucket', v as UnifiedMeetingsFilters['durationBucket'])}
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Any length</SelectItem>
                  <SelectItem value="short" className="text-xs">Short (&lt;30m)</SelectItem>
                  <SelectItem value="medium" className="text-xs">Medium (30–60m)</SelectItem>
                  <SelectItem value="long" className="text-xs">Long (&gt;60m)</SelectItem>
                </SelectContent>
              </Select>

              {/* Date range */}
              <DateRangeFilter {...dateFilter} />

              {/* Sort */}
              <Select
                value={`${filters.sortField}:${filters.sortDirection}`}
                onValueChange={(v) => {
                  const [field, dir] = v.split(':');
                  setFilters((prev) => ({
                    ...prev,
                    sortField: field as UnifiedMeetingsFilters['sortField'],
                    sortDirection: dir as 'asc' | 'desc',
                  }));
                }}
              >
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting_start:desc" className="text-xs">Newest first</SelectItem>
                  <SelectItem value="meeting_start:asc" className="text-xs">Oldest first</SelectItem>
                  <SelectItem value="duration_minutes:desc" className="text-xs">Longest first</SelectItem>
                  <SelectItem value="sentiment_score:desc" className="text-xs">Best sentiment</SelectItem>
                  <SelectItem value="coach_rating:desc" className="text-xs">Best coaching</SelectItem>
                </SelectContent>
              </Select>

              {/* Clear filters */}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-[11px] text-gray-500 hover:text-gray-700"
                  onClick={clearFilters}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading && items.length === 0 ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Video className="h-10 w-10 text-gray-300 dark:text-gray-700 mb-4" />
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  No recordings found
                </h3>
                <p className="text-xs text-gray-400 dark:text-gray-600">
                  {hasActiveFilters ? 'Try clearing your filters' : 'Recordings will appear here once you have meetings'}
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map((meeting) => (
                  <RecordingCard
                    key={meeting.id}
                    meeting={meeting}
                    onShare={handleShare}
                    onGenerate={handleGenerate}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2 max-w-4xl">
                {items.map((meeting) => (
                  <RecordingListRow
                    key={meeting.id}
                    meeting={meeting}
                    onShare={handleShare}
                    onGenerate={handleGenerate}
                  />
                ))}
              </div>
            )}

            {/* Load more */}
            {!isLoading && page < totalPages && (
              <div className="flex justify-center mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 text-xs"
                >
                  <ChevronDown className="h-3.5 w-3.5 mr-1.5" />
                  Load more
                </Button>
              </div>
            )}

            {isLoading && items.length > 0 && (
              <div className="flex justify-center mt-6">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Share dialog */}
      {shareTarget && (
        <ShareMeetingDialog
          open={shareOpen}
          onOpenChange={(v) => {
            setShareOpen(v);
            if (!v) setShareTarget(null);
          }}
          meetingId={shareTarget.id}
          meetingTitle={shareTarget.title}
        />
      )}
    </>
  );
}

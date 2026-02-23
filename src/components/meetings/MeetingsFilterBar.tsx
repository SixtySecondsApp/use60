import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Filter, X, Loader2, Video, Mic, Radio, Bot } from 'lucide-react'
import { SortControl } from './SortControl'
import { DurationFilter } from './filters/DurationFilter'
import { SentimentFilter } from './filters/SentimentFilter'
import { CoachingScoreFilter } from './filters/CoachingScoreFilter'
import { DateRangeFilter, UseDateRangeFilterReturn } from '@/components/ui/DateRangeFilter'
import { OwnerFilterV3 } from '@/components/OwnerFilterV3'
import { cn } from '@/lib/utils'
import type { UnifiedSource } from '@/lib/types/unifiedMeeting'
import type { RecordingStatus, MeetingPlatform } from '@/lib/types/meetingBaaS'

interface MeetingsFilterBarProps {
  // Search
  searchQuery: string
  onSearchChange: (value: string) => void
  isSearching: boolean

  // Sort
  sortField: string
  sortDirection: 'asc' | 'desc'
  onSortFieldChange: (field: string) => void
  onSortDirectionToggle: () => void

  // Filters
  dateFilter: UseDateRangeFilterReturn

  selectedRepId: string | null | undefined
  onRepChange: (repId: string | null | undefined) => void
  scope: 'me' | 'team'

  durationBucket: string
  onDurationChange: (bucket: string) => void

  sentimentCategory: string
  onSentimentChange: (category: string) => void

  coachingCategory: string
  onCoachingChange: (category: string) => void

  // Source / Status / Platform filters (unified list)
  sourceFilter?: UnifiedSource | 'all'
  onSourceChange?: (source: UnifiedSource | 'all') => void
  statusFilter?: RecordingStatus | 'all'
  onStatusChange?: (status: RecordingStatus | 'all') => void
  platformFilter?: MeetingPlatform | 'all'
  onPlatformChange?: (platform: MeetingPlatform | 'all') => void

  // Clear
  activeFilterCount: number
  onClearAll: () => void
}

export const MeetingsFilterBar: React.FC<MeetingsFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  isSearching,
  sortField,
  sortDirection,
  onSortFieldChange,
  onSortDirectionToggle,
  dateFilter,
  selectedRepId,
  onRepChange,
  scope,
  durationBucket,
  onDurationChange,
  sentimentCategory,
  onSentimentChange,
  coachingCategory,
  onCoachingChange,
  sourceFilter = 'all',
  onSourceChange,
  statusFilter = 'all',
  onStatusChange,
  platformFilter = 'all',
  onPlatformChange,
  activeFilterCount,
  onClearAll
}) => {
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false)

  const hasActiveFilters = activeFilterCount > 0

  return (
    <>
      {/* Desktop Filter Bar - Hidden on mobile */}
      <div className="hidden lg:block">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10"
        >
          {/* Row 1: Search + Sort */}
          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-200/50 dark:border-gray-700/30">
            <div className="relative flex-1">
              <Input
                type="text"
                placeholder="Search meetings by title or company..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full h-9 text-sm bg-white/80 dark:bg-gray-900/40 border-gray-200/50 dark:border-gray-700/30"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              )}
            </div>
            <SortControl
              sortField={sortField}
              sortDirection={sortDirection}
              onFieldChange={onSortFieldChange}
              onDirectionToggle={onSortDirectionToggle}
            />
          </div>

          {/* Row 2: Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {onSourceChange && (
              <Select value={sourceFilter} onValueChange={(v) => onSourceChange(v as UnifiedSource | 'all')}>
                <SelectTrigger className="w-[140px] h-9 text-xs bg-white/80 dark:bg-gray-900/40 border-gray-200/50 dark:border-gray-700/30">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="fathom">
                    <span className="flex items-center gap-1.5"><Video className="h-3 w-3" /> Fathom</span>
                  </SelectItem>
                  <SelectItem value="fireflies">
                    <span className="flex items-center gap-1.5"><Mic className="h-3 w-3" /> Fireflies</span>
                  </SelectItem>
                  <SelectItem value="voice">
                    <span className="flex items-center gap-1.5"><Radio className="h-3 w-3" /> Voice</span>
                  </SelectItem>
                  <SelectItem value="60_notetaker">
                    <span className="flex items-center gap-1.5"><Bot className="h-3 w-3" /> 60 Notetaker</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}

            {onStatusChange && (sourceFilter === 'all' || sourceFilter === '60_notetaker') && (
              <Select value={statusFilter} onValueChange={(v) => onStatusChange(v as RecordingStatus | 'all')}>
                <SelectTrigger className="w-[130px] h-9 text-xs bg-white/80 dark:bg-gray-900/40 border-gray-200/50 dark:border-gray-700/30">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="recording">Recording</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            )}

            {onPlatformChange && (sourceFilter === 'all' || sourceFilter === '60_notetaker') && (
              <Select value={platformFilter} onValueChange={(v) => onPlatformChange(v as MeetingPlatform | 'all')}>
                <SelectTrigger className="w-[140px] h-9 text-xs bg-white/80 dark:bg-gray-900/40 border-gray-200/50 dark:border-gray-700/30">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="zoom">Zoom</SelectItem>
                  <SelectItem value="google_meet">Google Meet</SelectItem>
                  <SelectItem value="microsoft_teams">Teams</SelectItem>
                </SelectContent>
              </Select>
            )}

            <DateRangeFilter {...dateFilter} />

            {scope === 'team' && (
              <OwnerFilterV3
                selectedOwnerId={selectedRepId}
                onOwnerChange={onRepChange}
                placeholder="All Reps"
                compact
                showQuickFilters={false}
                defaultToCurrentUser={false}
              />
            )}

            <DurationFilter
              value={durationBucket as 'all' | 'short' | 'medium' | 'long'}
              onChange={onDurationChange}
            />

            <SentimentFilter
              value={sentimentCategory as 'all' | 'positive' | 'neutral' | 'challenging'}
              onChange={onSentimentChange}
            />

            <CoachingScoreFilter
              value={coachingCategory as 'all' | 'excellent' | 'good' | 'needs-work'}
              onChange={onCoachingChange}
            />

            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearAll}
                className="h-9 gap-2 text-xs bg-white/80 dark:bg-gray-900/40 border-gray-200/50 dark:border-gray-700/30 hover:bg-red-50/50 dark:hover:bg-red-900/20 hover:border-red-200 dark:hover:border-red-700/30 text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400"
              >
                <X className="h-3.5 w-3.5" />
                Clear All
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {activeFilterCount}
                </Badge>
              </Button>
            )}
          </div>
        </motion.div>
      </div>

      {/* Mobile Filter Bar - Visible only on mobile */}
      <div className="lg:hidden">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 mb-4"
        >
          {/* Search Bar */}
          <div className="relative flex-1">
            <Input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-9 text-sm bg-white/80 dark:bg-gray-900/40 border-gray-200/50 dark:border-gray-700/30"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            )}
          </div>

          {/* Filter Panel Trigger */}
          <Dialog open={isMobileFilterOpen} onOpenChange={setIsMobileFilterOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-9 gap-2 text-sm flex-shrink-0',
                  hasActiveFilters
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                    : 'bg-white/80 dark:bg-gray-900/40 border-gray-200/50 dark:border-gray-700/30'
                )}
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
                {hasActiveFilters && (
                  <Badge variant="secondary" className="h-5 px-1.5">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filter Meetings
                  {hasActiveFilters && (
                    <Badge variant="secondary">{activeFilterCount} active</Badge>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-4">
                {/* Source */}
                {onSourceChange && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                      Source
                    </label>
                    <Select value={sourceFilter} onValueChange={(v) => onSourceChange(v as UnifiedSource | 'all')}>
                      <SelectTrigger className="w-full bg-white/80 dark:bg-gray-900/40">
                        <SelectValue placeholder="Source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sources</SelectItem>
                        <SelectItem value="fathom">Fathom</SelectItem>
                        <SelectItem value="fireflies">Fireflies</SelectItem>
                        <SelectItem value="voice">Voice</SelectItem>
                        <SelectItem value="60_notetaker">60 Notetaker</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Status (visible when source includes 60_notetaker) */}
                {onStatusChange && (sourceFilter === 'all' || sourceFilter === '60_notetaker') && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                      Recording Status
                    </label>
                    <Select value={statusFilter} onValueChange={(v) => onStatusChange(v as RecordingStatus | 'all')}>
                      <SelectTrigger className="w-full bg-white/80 dark:bg-gray-900/40">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="ready">Ready</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="recording">Recording</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Platform (visible when source includes 60_notetaker) */}
                {onPlatformChange && (sourceFilter === 'all' || sourceFilter === '60_notetaker') && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                      Platform
                    </label>
                    <Select value={platformFilter} onValueChange={(v) => onPlatformChange(v as MeetingPlatform | 'all')}>
                      <SelectTrigger className="w-full bg-white/80 dark:bg-gray-900/40">
                        <SelectValue placeholder="Platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Platforms</SelectItem>
                        <SelectItem value="zoom">Zoom</SelectItem>
                        <SelectItem value="google_meet">Google Meet</SelectItem>
                        <SelectItem value="microsoft_teams">Teams</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Sort */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                    Sort By
                  </label>
                  <SortControl
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onFieldChange={onSortFieldChange}
                    onDirectionToggle={onSortDirectionToggle}
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                    Date Range
                  </label>
                  <DateRangeFilter {...dateFilter} />
                </div>

                {/* Rep Filter - Only show in team scope */}
                {scope === 'team' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                      Team Member
                    </label>
                    <OwnerFilterV3
                      selectedOwnerId={selectedRepId}
                      onOwnerChange={onRepChange}
                      placeholder="All Reps"
                      showQuickFilters={false}
                      defaultToCurrentUser={false}
                    />
                  </div>
                )}

                {/* Duration */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                    Duration
                  </label>
                  <DurationFilter
                    value={durationBucket as 'all' | 'short' | 'medium' | 'long'}
                    onChange={onDurationChange}
                  />
                </div>

                {/* Sentiment */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                    Sentiment
                  </label>
                  <SentimentFilter
                    value={sentimentCategory as 'all' | 'positive' | 'neutral' | 'challenging'}
                    onChange={onSentimentChange}
                  />
                </div>

                {/* Coaching Score */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                    Coaching Score
                  </label>
                  <CoachingScoreFilter
                    value={coachingCategory as 'all' | 'excellent' | 'good' | 'needs-work'}
                    onChange={onCoachingChange}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-gray-200/50 dark:border-gray-700/30">
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      onClick={onClearAll}
                      className="flex-1 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      Clear All
                    </Button>
                  )}
                  <Button
                    onClick={() => setIsMobileFilterOpen(false)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Done
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>
      </div>
    </>
  )
}

import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { MeetingsEmptyState } from './MeetingsEmptyState'
import { MeetingsFilterBar } from './MeetingsFilterBar'
import { useDateRangeFilter } from '@/components/ui/DateRangeFilter'
import { toast } from 'sonner'
import { recordingService } from '@/lib/services/recordingService'
import { useRecordingUsage } from '@/lib/hooks/useRecordings'
import { JoinMeetingModal } from '@/components/recordings/JoinMeetingModal'
import { useUnifiedMeetings } from '@/lib/hooks/useUnifiedMeetings'
import { useOrg } from '@/lib/contexts/OrgContext'
import { useAuth } from '@/lib/contexts/AuthContext'
import {
  SourceBadge,
  SentimentBadge,
  CoachRatingBadge,
  TalkTimeBadge,
  VideoThumbnail,
  statusConfig,
  platformConfig,
} from './shared/RecordingBadges'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { format } from 'date-fns'
import {
  Grid2X2,
  List,
  Users,
  User,
  Video,
  Clock,
  MessageSquare,
  TrendingUp,
  Award,
  Calendar,
  ExternalLink,
  Play,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  Sparkles,
  RefreshCw,
  Mic,
  Bot,
  Plus,
  Settings,
  AlertCircle,
  Filter,
} from 'lucide-react'
import { MeetingUsageBar } from '@/components/MeetingUsageIndicator'
import type { UnifiedMeeting, UnifiedSource } from '@/lib/types/unifiedMeeting'
import type { RecordingStatus, MeetingPlatform } from '@/lib/types/meetingBaaS'

// ============================================================================
// Helpers
// ============================================================================

const formatDuration = (minutes: number | null | undefined): string => {
  if (!minutes || minutes <= 0 || minutes > 480) return '—'
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }
  return `${minutes}m`
}

function sentimentLabel(score: number | null): string {
  if (score === null) return 'Unknown'
  if (score <= -0.25) return 'Challenging'
  if (score < 0.25) return 'Neutral'
  return 'Positive'
}

function sentimentTone(score: number | null): 'destructive' | 'default' | 'success' {
  if (score === null) return 'default'
  if (score <= -0.25) return 'destructive'
  if (score < 0.25) return 'default'
  return 'success'
}

// ============================================================================
// Stat Card
// ============================================================================

const StatCard: React.FC<{
  title: string
  value: string
  sub?: string
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
}> = ({ title, value, sub, icon, trend }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    whileHover={{ y: -2 }}
    className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 hover:border-gray-300/50 dark:hover:border-gray-600/40 transition-all duration-300 group w-full flex flex-col"
  >
    <div className="flex items-start justify-between gap-3 mb-3">
      {icon && (
        <div className="p-2 sm:p-2.5 rounded-xl bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30 text-gray-500 dark:text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:border-emerald-200 dark:group-hover:border-emerald-500/30 transition-all duration-300 flex-shrink-0">
          <div className="w-5 h-5 flex items-center justify-center">{icon}</div>
        </div>
      )}
    </div>
    <div className="flex flex-col gap-2 flex-1">
      <div className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider leading-snug">{title}</div>
      <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50 leading-tight">{value}</div>
      {sub && (
        <div className={cn(
          "text-xs font-medium",
          trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' :
          trend === 'down' ? 'text-red-600 dark:text-red-400' :
          'text-gray-500 dark:text-gray-400'
        )}>
          {sub}
        </div>
      )}
    </div>
  </motion.div>
)

// ============================================================================
// Skeletons
// ============================================================================

const StatCardSkeleton: React.FC = () => (
  <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 sm:p-6 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 flex flex-col">
    {/* Icon row — matches real StatCard's icon container */}
    <div className="flex items-start justify-between gap-3 mb-3">
      <Skeleton className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gray-200/60 dark:bg-gray-700/40 flex-shrink-0" />
    </div>
    {/* Title + value */}
    <div className="flex flex-col gap-2 flex-1">
      <Skeleton className="h-3 w-20 bg-gray-200/60 dark:bg-gray-700/40" />
      <Skeleton className="h-8 sm:h-9 w-16 bg-gray-200/60 dark:bg-gray-700/40" />
    </div>
  </div>
)

const MeetingCardSkeleton: React.FC = () => (
  <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-5 border border-gray-200/50 dark:border-gray-700/30">
    <Skeleton className="aspect-video rounded-xl mb-4 bg-gray-200/60 dark:bg-gray-700/40" />
    <div className="space-y-3">
      <Skeleton className="h-5 w-3/4 bg-gray-200/60 dark:bg-gray-700/40" />
      <Skeleton className="h-4 w-1/2 bg-gray-200/60 dark:bg-gray-700/40" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-5 w-20 rounded-full bg-gray-200/60 dark:bg-gray-700/40" />
      </div>
    </div>
  </div>
)

const MeetingRowSkeleton: React.FC = () => (
  <TableRow className="border-gray-200/50 dark:border-gray-700/30">
    <TableCell>
      <div className="flex items-center gap-2">
        <Skeleton className="w-12 h-8 rounded bg-gray-200/60 dark:bg-gray-700/40 flex-shrink-0" />
        <Skeleton className="h-4 w-32 bg-gray-200/60 dark:bg-gray-700/40" />
      </div>
    </TableCell>
    <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-16 rounded-full bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-20 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-4 w-14 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-12 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-16 rounded-full bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-16 rounded-full bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell className="hidden xl:table-cell"><Skeleton className="h-5 w-12 rounded-full bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-8 w-8 rounded-lg bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
  </TableRow>
)

const ListSkeleton: React.FC<{ view: 'list' | 'grid' }> = ({ view }) => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4 sm:space-y-6 w-full overflow-x-hidden">
    {/* MeetingUsageBar placeholder */}
    <Skeleton className="h-2 w-full rounded-full bg-gray-200/60 dark:bg-gray-700/40" />

    {/* Header — matches real: w-14 h-14 icon + title + subtitle */}
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 w-full">
      <div className="flex items-center gap-4 min-w-0">
        <Skeleton className="w-10 h-10 rounded-xl bg-gray-200/60 dark:bg-gray-700/40 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-8 sm:h-9 w-32 mb-2 bg-gray-200/60 dark:bg-gray-700/40" />
          <div className="flex items-center gap-2">
            <Skeleton className="w-1.5 h-1.5 rounded-full bg-gray-200/60 dark:bg-gray-700/40" />
            <Skeleton className="h-4 w-56 bg-gray-200/60 dark:bg-gray-700/40" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Skeleton className="h-8 w-28 rounded-lg bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-8 w-20 rounded-lg bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-8 w-20 rounded-xl bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-8 w-16 rounded-xl bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-8 w-16 rounded-xl bg-gray-200/60 dark:bg-gray-700/40" />
      </div>
    </div>

    {/* Stats grid */}
    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 w-full overflow-hidden">
      {[...Array(5)].map((_, i) => <StatCardSkeleton key={i} />)}
    </div>

    {/* Filter bar placeholder */}
    <div className="flex items-center gap-2 flex-wrap">
      <Skeleton className="h-9 w-48 rounded-xl bg-gray-200/60 dark:bg-gray-700/40" />
      <Skeleton className="h-8 w-20 rounded-lg bg-gray-200/60 dark:bg-gray-700/40" />
      <Skeleton className="h-8 w-24 rounded-lg bg-gray-200/60 dark:bg-gray-700/40" />
      <Skeleton className="h-8 w-20 rounded-lg bg-gray-200/60 dark:bg-gray-700/40" />
    </div>

    {/* Content */}
    {view === 'grid' ? (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 w-full">
        {[...Array(6)].map((_, i) => <MeetingCardSkeleton key={i} />)}
      </div>
    ) : (
      <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 overflow-hidden shadow-sm w-full">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200/50 dark:border-gray-700/30">
              <TableHead className="text-gray-500 dark:text-gray-400">Title</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">Source</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">Company</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400">Date</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">Duration</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400 hidden lg:table-cell">Type/Status</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400 hidden lg:table-cell">Sentiment</TableHead>
              <TableHead className="text-gray-500 dark:text-gray-400 hidden xl:table-cell">Coach</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(6)].map((_, i) => <MeetingRowSkeleton key={i} />)}
          </TableBody>
        </Table>
      </div>
    )}
  </div>
)

// ============================================================================
// Main Component
// ============================================================================

const ITEMS_PER_PAGE = 30

const UnifiedMeetingsList: React.FC = () => {
  const navigate = useNavigate()
  const { activeOrgId } = useOrg()
  const { user } = useAuth()

  // View state
  const [view, setView] = useState<'list' | 'grid'>('grid')
  const [scope, setScope] = useState<'me' | 'team'>('me')
  const [currentPage, setCurrentPage] = useState(1)

  // Filter state
  const [sortField, setSortField] = useState<'title' | 'meeting_start' | 'duration_minutes' | 'sentiment_score' | 'coach_rating'>('meeting_start')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const dateFilter = useDateRangeFilter('month')
  const [selectedRepId, setSelectedRepId] = useState<string | null | undefined>(undefined)
  const [durationBucket, setDurationBucket] = useState<'all' | 'short' | 'medium' | 'long'>('all')
  const [sentimentCategory, setSentimentCategory] = useState<'all' | 'positive' | 'neutral' | 'challenging'>('all')
  const [coachingCategory, setCoachingCategory] = useState<'all' | 'excellent' | 'good' | 'needs-work'>('all')
  const [sourceFilter, setSourceFilter] = useState<UnifiedSource | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<RecordingStatus | 'all'>('all')
  const [platformFilter, setPlatformFilter] = useState<MeetingPlatform | 'all'>('all')

  // Join meeting modal
  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [isRefreshingAll, setIsRefreshingAll] = useState(false)

  // Recording usage
  const { data: usageData } = useRecordingUsage()

  // Unified data hook
  const {
    items,
    allFilteredItems,
    totalCount,
    totalPages,
    stats,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    isSearching,
    signedUrls,
    activeRecordings,
    attentionRecordings,
    syncState,
    isSyncing,
    isConnected,
    triggerSync,
    refetch,
  } = useUnifiedMeetings(
    {
      scope,
      sourceFilter,
      statusFilter,
      platformFilter,
      sortField,
      sortDirection,
      dateRange: dateFilter.dateRange,
      selectedRepId,
      durationBucket,
      sentimentCategory,
      coachingCategory,
    },
    currentPage
  )

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (dateFilter.datePreset !== 'month') count++
    if (selectedRepId) count++
    if (durationBucket !== 'all') count++
    if (sentimentCategory !== 'all') count++
    if (coachingCategory !== 'all') count++
    if (searchQuery.trim()) count++
    if (sourceFilter !== 'all') count++
    if (statusFilter !== 'all') count++
    if (platformFilter !== 'all') count++
    return count
  }, [dateFilter.datePreset, selectedRepId, durationBucket, sentimentCategory, coachingCategory, searchQuery, sourceFilter, statusFilter, platformFilter])

  // Reset to page 1 on filter/scope changes
  useEffect(() => {
    setCurrentPage(1)
  }, [scope, activeOrgId, sortField, sortDirection, dateFilter.dateRange, selectedRepId, durationBucket, sentimentCategory, coachingCategory, sourceFilter, statusFilter, platformFilter])

  // Join meeting handler
  const handleJoinMeeting = async (meetingUrl: string, meetingTitle?: string) => {
    if (!activeOrgId || !user?.id) {
      return { success: false, error: 'Not authenticated' }
    }
    setIsJoining(true)
    try {
      const result = await recordingService.startRecording(activeOrgId, user.id, { meetingUrl, meetingTitle })
      if (result.success) {
        toast.success('Bot is joining the meeting', {
          description: meetingTitle || 'Recording will start shortly',
        })
      }
      return result
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to join meeting' }
    } finally {
      setIsJoining(false)
    }
  }

  // Refresh all stuck bots
  const handleRefreshAll = async () => {
    setIsRefreshingAll(true)
    try {
      const result = await recordingService.pollAllStuckBots()
      if (!result.success) {
        toast.error(result.error || 'Failed to refresh')
        return
      }
      const s = result.summary
      if (s && s.processing_triggered > 0) {
        toast.success(`${s.processing_triggered} recording${s.processing_triggered > 1 ? 's' : ''} triggered for processing`)
      } else if (s && s.marked_failed > 0) {
        toast.info(`${s.marked_failed} recording${s.marked_failed > 1 ? 's' : ''} marked as failed`)
      } else if (s && s.total_checked === 0) {
        toast.info('No stuck recordings found')
      } else {
        toast.info('Status check complete')
      }
    } catch {
      toast.error('Failed to refresh recordings')
    } finally {
      setIsRefreshingAll(false)
    }
  }

  const openItem = (item: UnifiedMeeting) => {
    navigate(item.detailPath)
  }

  const clearAllFilters = () => {
    setSearchQuery('')
    setSortField('meeting_start')
    setSortDirection('desc')
    dateFilter.handleClear()
    setSelectedRepId(undefined)
    setDurationBucket('all')
    setSentimentCategory('all')
    setCoachingCategory('all')
    setSourceFilter('all')
    setStatusFilter('all')
    setPlatformFilter('all')
  }

  // Thumbnail rendering
  const renderThumbnail = (item: UnifiedMeeting, className: string) => {
    if (item.source === '60_notetaker') {
      return (
        <VideoThumbnail
          videoUrl={signedUrls?.[item.id]?.video_url}
          thumbnailUrl={signedUrls?.[item.id]?.thumbnail_url || item.thumbnailUrl}
          title={item.title}
          className={className}
        />
      )
    }

    if (item.source === 'voice') {
      return (
        <div className={cn("relative bg-gradient-to-br from-emerald-500/10 via-emerald-600/5 to-teal-500/10 dark:from-emerald-500/20 dark:via-emerald-600/10 dark:to-teal-500/20 rounded-lg overflow-hidden flex flex-col items-center justify-center", className)}>
          <div className="flex items-end gap-1 h-8 mb-1">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-emerald-500/60 dark:bg-emerald-400/60 rounded-full"
                style={{
                  height: `${12 + Math.sin(i * 0.8) * 8 + (i % 3) * 3}px`,
                  animation: `waveform ${0.5 + i * 0.1}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
          <Mic className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
      )
    }

    if (item.source === 'fireflies') {
      return (
        <div className={cn("relative bg-gradient-to-br from-orange-500/10 via-orange-600/5 to-amber-500/10 dark:from-orange-500/20 dark:via-orange-600/10 dark:to-amber-500/20 rounded-lg overflow-hidden flex flex-col items-center justify-center", className)}>
          <Mic className="h-6 w-6 text-orange-500/60 dark:text-orange-400/60" />
        </div>
      )
    }

    // Fathom meeting thumbnail
    return (
      <div className={cn("relative bg-gray-100/80 dark:bg-gray-800/40 rounded-lg overflow-hidden border border-gray-200/30 dark:border-gray-700/20", className)}>
        {item.thumbnailUrl && !item.thumbnailUrl.includes('dummyimage.com') ? (
          <img
            src={item.thumbnailUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="h-6 w-6 text-gray-400" />
          </div>
        )}
        {item.thumbnailStatus === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
            <Loader2 className="h-5 w-5 text-white animate-spin" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
          <Play className="h-5 w-5 text-white/90 drop-shadow-lg" />
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <ListSkeleton view={view} />
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4 sm:space-y-6 w-full overflow-x-hidden">
      {/* Meeting Usage Bar */}
      <MeetingUsageBar />

      {/* Active Recordings Banner */}
      {activeRecordings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-red-500/10 via-red-600/10 to-orange-500/10 dark:from-red-500/20 dark:via-red-600/20 dark:to-orange-500/20 backdrop-blur-xl rounded-2xl p-3 sm:p-4 border border-red-500/30 dark:border-red-500/40"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <Mic className="h-5 w-5 text-red-600 dark:text-red-400" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                {activeRecordings.length} recording{activeRecordings.length > 1 ? 's' : ''} in progress
              </p>
              <p className="text-xs text-red-600/80 dark:text-red-400/80">
                {activeRecordings.map(r => r.meeting_title || 'Untitled').join(', ')}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Attention Required Banner */}
      {attentionRecordings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-yellow-500/10 dark:from-amber-500/20 dark:via-amber-600/20 dark:to-yellow-500/20 backdrop-blur-xl rounded-2xl p-3 sm:p-4 border border-amber-500/30 dark:border-amber-500/40"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  {attentionRecordings.length} recording{attentionRecordings.length > 1 ? 's' : ''} need your attention
                </p>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                  Speaker or deal confirmation required
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/meetings/recordings/${attentionRecordings[0].id}`)}
              className="border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
            >
              Review
            </Button>
          </div>
        </motion.div>
      )}

      {/* Sync Progress Banner */}
      {isSyncing && syncState &&
       !(syncState.meetings_synced > 0 && syncState.meetings_synced >= syncState.total_meetings_found) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-emerald-500/10 via-emerald-600/10 to-teal-500/10 dark:from-emerald-500/20 dark:via-emerald-600/20 dark:to-teal-500/20 backdrop-blur-xl rounded-2xl p-3 sm:p-4 border border-emerald-500/30 dark:border-emerald-500/40 w-full"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Loader2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 animate-spin flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 truncate">
                  Syncing meetings from Fathom...
                </p>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 truncate">
                  {syncState.meetings_synced > 0
                    ? `${syncState.meetings_synced.toLocaleString()} of ${syncState.total_meetings_found.toLocaleString()} synced`
                    : 'Fetching meeting list...'}
                </p>
              </div>
            </div>
            {syncState.total_meetings_found > 0 && (
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="w-32 h-2 bg-emerald-200/50 dark:bg-emerald-900/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round((syncState.meetings_synced / syncState.total_meetings_found) * 100)}%` }}
                    transition={{ duration: 0.5 }}
                    className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full"
                  />
                </div>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  {Math.round((syncState.meetings_synced / syncState.total_meetings_found) * 100)}%
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 w-full"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 dark:border-zinc-800/60 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex-shrink-0">
            <Video className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold">
              <span className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-100 dark:to-white bg-clip-text text-transparent">
                Meetings
              </span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                All your recorded conversations in one place
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {/* Join Meeting Button */}
          <Button
            size="sm"
            onClick={() => setJoinModalOpen(true)}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Join Meeting</span>
            <span className="sm:hidden">Join</span>
          </Button>

          {/* Refresh All */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isRefreshingAll}
            className="gap-2"
            title="Check status of all pending recordings"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshingAll && "animate-spin")} />
            <span className="hidden sm:inline">{isRefreshingAll ? 'Checking...' : 'Refresh'}</span>
          </Button>

          {/* Settings */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/settings/meeting-settings')}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </Button>

          {/* Scope Toggle */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-1 border border-gray-200/50 dark:border-gray-700/30"
          >
            <Button
              variant={scope === 'me' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setScope('me')}
              className={scope === 'me' ? 'bg-gray-100 dark:bg-gray-800/60' : ''}
            >
              <User className="h-4 w-4 hidden sm:inline mr-1.5" />
              My
            </Button>
            <Button
              variant={scope === 'team' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setScope('team')}
              className={scope === 'team' ? 'bg-gray-100 dark:bg-gray-800/60' : ''}
            >
              <Users className="h-4 w-4 hidden sm:inline mr-1.5" />
              Team
            </Button>
          </motion.div>

          {/* View Toggle */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-1 border border-gray-200/50 dark:border-gray-700/30"
          >
            <Button
              variant={view === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('list')}
              className={view === 'list' ? 'bg-gray-100 dark:bg-gray-800/60' : ''}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={view === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('grid')}
              className={view === 'grid' ? 'bg-gray-100 dark:bg-gray-800/60' : ''}
            >
              <Grid2X2 className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 w-full overflow-hidden">
        <StatCard
          title="This Month"
          value={stats.meetingsThisMonth.toString()}
          icon={<Calendar className="h-5 w-5" />}
          trend={stats.meetingsThisMonth > 0 ? 'up' : 'neutral'}
        />
        <StatCard
          title="Avg Duration"
          value={`${stats.avgDuration}m`}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Open Tasks"
          value={stats.actionItemsOpen.toString()}
          icon={<MessageSquare className="h-5 w-5" />}
          trend={stats.actionItemsOpen > 0 ? 'down' : 'neutral'}
        />
        <StatCard
          title="Sentiment"
          value={sentimentLabel(stats.avgSentiment)}
          sub={stats.avgSentiment !== 0 ? `${stats.avgSentiment > 0 ? '+' : ''}${stats.avgSentiment.toFixed(2)}` : undefined}
          icon={<TrendingUp className="h-5 w-5" />}
          trend={stats.avgSentiment > 0.25 ? 'up' : stats.avgSentiment < -0.25 ? 'down' : 'neutral'}
        />
        <StatCard
          title="Coach Score"
          value={stats.avgCoachRating ? `${Math.min(stats.avgCoachRating, 10)}/10` : 'N/A'}
          icon={<Award className="h-5 w-5" />}
          trend={stats.avgCoachRating > 7 ? 'up' : stats.avgCoachRating < 5 ? 'down' : 'neutral'}
        />
      </div>

      {/* Filter Bar */}
      <MeetingsFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isSearching={isSearching}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortFieldChange={setSortField}
        onSortDirectionToggle={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
        dateFilter={dateFilter}
        selectedRepId={selectedRepId}
        onRepChange={setSelectedRepId}
        scope={scope}
        durationBucket={durationBucket}
        onDurationChange={setDurationBucket}
        sentimentCategory={sentimentCategory}
        onSentimentChange={setSentimentCategory}
        coachingCategory={coachingCategory}
        onCoachingChange={setCoachingCategory}
        sourceFilter={sourceFilter}
        onSourceChange={setSourceFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        platformFilter={platformFilter}
        onPlatformChange={setPlatformFilter}
        activeFilterCount={activeFilterCount}
        onClearAll={clearAllFilters}
      />

      {/* Items Display */}
      <AnimatePresence mode="wait">
        {view === 'list' ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 overflow-hidden shadow-sm w-full"
          >
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-200/50 dark:border-gray-700/30">
                    <TableHead className="text-gray-500 dark:text-gray-400">Title</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">Source</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">Company</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400">Date</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">Duration</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden lg:table-cell">Type/Status</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden lg:table-cell">Sentiment</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden xl:table-cell">Coach</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <motion.tr
                      key={`${item.sourceTable}-${item.id}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.03 }}
                      className="border-gray-200/50 dark:border-gray-700/30 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer group"
                      onClick={() => openItem(item)}
                    >
                      <TableCell className="font-medium text-gray-900 dark:text-gray-200 max-w-[200px] sm:max-w-xs">
                        <div className="flex items-center gap-2">
                          {renderThumbnail(item, 'w-12 h-8 flex-shrink-0')}
                          <span className="break-words line-clamp-2">{item.title}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <SourceBadge source={item.source} compact />
                      </TableCell>
                      <TableCell className="text-gray-700 dark:text-gray-400 hidden sm:table-cell max-w-[120px] truncate">
                        {item.companyName || '—'}
                      </TableCell>
                      <TableCell className="text-gray-700 dark:text-gray-400 whitespace-nowrap text-sm">
                        {item.date ? format(new Date(item.date), 'dd MMM') : '—'}
                      </TableCell>
                      <TableCell className="text-gray-700 dark:text-gray-400 hidden sm:table-cell">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(item.durationMinutes)}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {item.source === '60_notetaker' && item.status && statusConfig[item.status] ? (
                          <Badge variant={statusConfig[item.status].variant} className="gap-1 text-xs">
                            {statusConfig[item.status].icon}
                            {statusConfig[item.status].label}
                          </Badge>
                        ) : item.meetingType ? (
                          <Badge
                            variant="outline"
                            className="capitalize bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20 text-xs whitespace-nowrap"
                          >
                            {item.meetingType.replace('_', ' ')}
                          </Badge>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge
                          variant={sentimentTone(item.sentimentScore) as any}
                          className="backdrop-blur-sm whitespace-nowrap text-xs"
                        >
                          {sentimentLabel(item.sentimentScore)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {item.coachRating !== null && (
                          <Badge variant="secondary" className="backdrop-blur-sm whitespace-nowrap text-xs">
                            {item.coachRating}/10
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); openItem(item) }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 w-full"
          >
            {items.map((item, index) => (
              <motion.div
                key={`${item.sourceTable}-${item.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
                whileHover={{ y: -2 }}
                className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-3 sm:p-5 border border-gray-200/50 dark:border-gray-700/30 hover:border-gray-300/50 dark:hover:border-gray-600/40 transition-all duration-300 cursor-pointer group w-full"
                onClick={() => openItem(item)}
              >
                {/* Thumbnail */}
                <div className="relative aspect-video rounded-xl mb-3 sm:mb-4 overflow-hidden border border-gray-200/30 dark:border-gray-700/20">
                  {renderThumbnail(item, 'w-full h-full')}

                  {/* Processing badges for meetings */}
                  {item.sourceTable === 'meetings' && (item.transcriptStatus === 'processing' || item.summaryStatus === 'processing') && (
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      {item.transcriptStatus === 'processing' && (
                        <div className="px-2 py-1 bg-blue-500/90 backdrop-blur-sm rounded-md text-[10px] text-white flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <FileText className="h-3 w-3" />
                        </div>
                      )}
                      {item.summaryStatus === 'processing' && (
                        <div className="px-2 py-1 bg-purple-500/90 backdrop-blur-sm rounded-md text-[10px] text-white flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <Sparkles className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-14 h-14 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <Play className="h-7 w-7 text-emerald-600 dark:text-emerald-400 fill-current ml-1" />
                    </div>
                  </div>

                  {/* Duration badge */}
                  <div className="absolute bottom-2 right-2 px-2 py-1 bg-white/90 dark:bg-gray-900/70 backdrop-blur-md rounded-lg text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1 border border-gray-200/30 dark:border-gray-700/30">
                    <Clock className="h-3 w-3" />
                    {formatDuration(item.durationMinutes)}
                  </div>
                </div>

                {/* Content */}
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                      {item.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {item.companyName || (item.source === '60_notetaker' && item.platform ? platformConfig[item.platform]?.label : 'No company')}
                    </p>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2">
                    <SourceBadge source={item.source} compact />
                    {item.source === '60_notetaker' && item.status && statusConfig[item.status] && (
                      <Badge variant={statusConfig[item.status].variant} className="gap-1 text-xs">
                        {statusConfig[item.status].icon}
                        {statusConfig[item.status].label}
                      </Badge>
                    )}
                    {item.meetingType && (
                      <Badge
                        variant="outline"
                        className="capitalize bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20 text-xs"
                      >
                        {item.meetingType.replace('_', ' ')}
                      </Badge>
                    )}
                    <Badge
                      variant={sentimentTone(item.sentimentScore) as any}
                      className="backdrop-blur-sm text-xs"
                    >
                      {sentimentLabel(item.sentimentScore)}
                    </Badge>
                    {item.coachRating !== null && (
                      <Badge variant="secondary" className="backdrop-blur-sm text-xs">
                        Coach: {item.coachRating}/10
                      </Badge>
                    )}
                    {item.openTaskCount > 0 && (
                      <Badge variant="outline" className="text-xs border-amber-600/50 text-amber-600 dark:text-amber-400">
                        {item.openTaskCount} tasks
                      </Badge>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200/50 dark:border-gray-700/30">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {item.date ? format(new Date(item.date), 'dd MMM yyyy') : 'No date'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      {item.ownerEmail ? (
                        <>
                          <User className="h-3 w-3" />
                          {item.ownerEmail.split('@')[0]}
                        </>
                      ) : item.source === '60_notetaker' && item.platform ? (
                        <>
                          <Bot className="h-3 w-3" />
                          {platformConfig[item.platform]?.label}
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pagination */}
      {totalCount > ITEMS_PER_PAGE && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-3 sm:p-4 border border-gray-200/50 dark:border-gray-700/30 w-full"
        >
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="gap-1 text-xs sm:text-sm px-2 sm:px-3"
            >
              <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Previous</span>
              <span className="sm:hidden">Prev</span>
            </Button>
            <div className="flex items-center gap-0.5 sm:gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      'w-7 h-7 sm:w-9 sm:h-9 text-xs sm:text-sm p-0',
                      currentPage === pageNum && 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    )}
                  >
                    {pageNum}
                  </Button>
                )
              })}
              {totalPages > 5 && currentPage < totalPages - 2 && (
                <>
                  <span className="text-gray-400 px-1 text-xs">...</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    className="w-7 h-7 sm:w-9 sm:h-9 text-xs sm:text-sm p-0"
                  >
                    {totalPages}
                  </Button>
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="gap-1 text-xs sm:text-sm px-2 sm:px-3"
            >
              <span>Next</span>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Error State */}
      {error && items.length === 0 && !isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 px-4"
        >
          <div className="w-24 h-24 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-6">
            <Video className="w-12 h-12 text-red-500 dark:text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
            Unable to Load Meetings
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-center max-w-md">{error}</p>
          <Button onClick={refetch} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <RefreshCw className="mr-2 w-4 h-4" />
            Try Again
          </Button>
        </motion.div>
      )}

      {/* No filter results */}
      {items.length === 0 && totalCount > 0 && !isLoading && !error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 px-4"
        >
          <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-6">
            <Filter className="w-12 h-12 text-gray-400 dark:text-gray-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
            No meetings match your filters
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-center max-w-md">
            Try adjusting your search terms, date range, or filter selection
          </p>
          <Button onClick={clearAllFilters} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Clear All Filters
          </Button>
        </motion.div>
      )}

      {/* Empty State */}
      {totalCount === 0 && !isLoading && !error && (
        <MeetingsEmptyState
          meetingCount={0}
          isSyncing={syncState?.sync_status === 'syncing'}
        />
      )}

      {/* Join Meeting Modal */}
      <JoinMeetingModal
        open={joinModalOpen}
        onOpenChange={setJoinModalOpen}
        onJoin={handleJoinMeeting}
        isLoading={isJoining}
      />

      {/* Waveform animation */}
      <style>{`
        @keyframes waveform {
          0% { transform: scaleY(0.5); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  )
}

export default UnifiedMeetingsList

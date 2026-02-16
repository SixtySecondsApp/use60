import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useOrg } from '@/lib/contexts/OrgContext'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useRecordings, useRecordingUsage, useActiveRecordings, useRecordingsRequiringAttention } from '@/lib/hooks/useRecordings'
import { recordingService } from '@/lib/services/recordingService'
import { JoinMeetingModal } from './JoinMeetingModal'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Grid2X2,
  List,
  Video,
  Clock,
  Calendar,
  ExternalLink,
  Play,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  Sparkles,
  Settings,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Bot,
  Mic,
  Building2,
  Users,
  Search,
  Filter,
  Radio,
  Plus,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Star,
  BarChart3,
  Smile,
  Frown,
  Meh,
  RefreshCw
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Recording, RecordingStatus, MeetingPlatform } from '@/lib/types/meetingBaaS'

// Helper to format duration
const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0) return '—'
  const minutes = Math.floor(seconds / 60)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }
  return `${minutes}m`
}

// Status badge configuration
const statusConfig: Record<RecordingStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  pending: { label: 'Pending', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  bot_joining: { label: 'Joining', variant: 'secondary', icon: <Bot className="h-3 w-3 animate-pulse" /> },
  recording: { label: 'Recording', variant: 'default', icon: <Mic className="h-3 w-3 animate-pulse text-red-500" /> },
  processing: { label: 'Processing', variant: 'secondary', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  ready: { label: 'Ready', variant: 'default', icon: <CheckCircle2 className="h-3 w-3 text-emerald-500" /> },
  failed: { label: 'Failed', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
}

// Platform badge configuration
const platformConfig: Record<MeetingPlatform, { label: string; color: string }> = {
  zoom: { label: 'Zoom', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  google_meet: { label: 'Google Meet', color: 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' },
  microsoft_teams: { label: 'Teams', color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400' },
}

// Sentiment Badge Component
const SentimentBadge: React.FC<{ score: number | null | undefined }> = ({ score }) => {
  if (score === null || score === undefined) return null

  const getSentimentConfig = (s: number) => {
    if (s >= 0.3) return { label: 'Positive', icon: <Smile className="h-3 w-3" />, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-500/30' }
    if (s >= -0.3) return { label: 'Neutral', icon: <Meh className="h-3 w-3" />, color: 'bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400 border-gray-500/30' }
    return { label: 'Needs Review', icon: <Frown className="h-3 w-3" />, color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-500/30' }
  }

  const config = getSentimentConfig(score)

  return (
    <Badge variant="outline" className={cn("text-xs gap-1 border", config.color)}>
      {config.icon}
      {config.label}
    </Badge>
  )
}

// Coach Rating Badge Component
const CoachRatingBadge: React.FC<{ rating: number | null | undefined }> = ({ rating }) => {
  if (rating === null || rating === undefined) return null

  const getRatingConfig = (r: number) => {
    if (r >= 80) return { label: `${r}`, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-500/30' }
    if (r >= 60) return { label: `${r}`, color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-500/30' }
    if (r >= 40) return { label: `${r}`, color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-500/30' }
    return { label: `${r}`, color: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-red-500/30' }
  }

  const config = getRatingConfig(rating)

  return (
    <Badge variant="outline" className={cn("text-xs gap-1 border", config.color)}>
      <Star className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

// Talk Time Badge Component
const TalkTimeBadge: React.FC<{ repPct: number | null | undefined; judgement: 'good' | 'high' | 'low' | null | undefined }> = ({ repPct, judgement }) => {
  if (repPct === null || repPct === undefined) return null

  const getConfig = (j: 'good' | 'high' | 'low' | null | undefined) => {
    if (j === 'good') return { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-500/30' }
    if (j === 'high') return { color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-500/30' }
    return { color: 'bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400 border-gray-500/30' }
  }

  const config = getConfig(judgement)

  return (
    <Badge variant="outline" className={cn("text-xs gap-1 border", config.color)}>
      <BarChart3 className="h-3 w-3" />
      {Math.round(repPct)}% rep
    </Badge>
  )
}

// Thumbnail Component
const RecordingThumbnail: React.FC<{ url?: string | null; title?: string; className?: string }> = ({ url, title, className }) => {
  if (!url) {
    // Placeholder thumbnail
    const initial = (title || 'M')[0].toUpperCase()
    return (
      <div className={cn("bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center", className)}>
        <span className="text-white text-xl font-bold">{initial}</span>
      </div>
    )
  }

  return (
    <div className={cn("rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800", className)}>
      <img
        src={url}
        alt={title || 'Recording thumbnail'}
        className="w-full h-full object-cover"
        onError={(e) => {
          // Hide image on error, show placeholder
          e.currentTarget.style.display = 'none'
        }}
      />
    </div>
  )
}

// Stats Card Component
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
    whileHover={{ scale: 1.02, y: -2 }}
    className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-5 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 hover:border-gray-300/50 dark:hover:border-gray-600/40 transition-all duration-300 group"
  >
    <div className="flex items-start justify-between">
      <div className="flex flex-col gap-1.5">
        <div className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">{title}</div>
        <div className="text-3xl font-bold text-gray-900 dark:text-gray-50">{value}</div>
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
      {icon && (
        <div className="p-2.5 rounded-xl bg-gray-100/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30 text-gray-500 dark:text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:border-emerald-200 dark:group-hover:border-emerald-500/30 transition-all duration-300">
          {icon}
        </div>
      )}
    </div>
  </motion.div>
)

// Skeleton Components
const StatCardSkeleton: React.FC = () => (
  <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-5 border border-gray-200/50 dark:border-gray-700/30">
    <div className="flex items-start justify-between">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-16 bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-9 w-14 bg-gray-200/60 dark:bg-gray-700/40" />
      </div>
      <Skeleton className="h-10 w-10 rounded-xl bg-gray-200/60 dark:bg-gray-700/40" />
    </div>
  </div>
)

const RecordingCardSkeleton: React.FC = () => (
  <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-5 border border-gray-200/50 dark:border-gray-700/30">
    <div className="space-y-3">
      <div>
        <Skeleton className="h-5 w-3/4 mb-2 bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-4 w-1/2 bg-gray-200/60 dark:bg-gray-700/40" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-5 w-16 rounded-full bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-5 w-20 rounded-full bg-gray-200/60 dark:bg-gray-700/40" />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-gray-200/50 dark:border-gray-700/30">
        <Skeleton className="h-3 w-20 bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-3 w-16 bg-gray-200/60 dark:bg-gray-700/40" />
      </div>
    </div>
  </div>
)

const RecordingRowSkeleton: React.FC = () => (
  <TableRow className="border-gray-200/50 dark:border-gray-700/30">
    <TableCell><Skeleton className="h-4 w-32 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-4 w-16 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-4 w-20 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-4 w-12 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-5 w-16 rounded-full bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-8 w-8 rounded-lg bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
  </TableRow>
)

const RecordingsListSkeleton: React.FC<{ view: 'list' | 'grid' }> = ({ view }) => (
  <div className="p-6 space-y-6">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-xl bg-gray-200/60 dark:bg-gray-700/40" />
        <div>
          <Skeleton className="h-8 w-32 mb-2 bg-gray-200/60 dark:bg-gray-700/40" />
          <Skeleton className="h-4 w-56 bg-gray-200/60 dark:bg-gray-700/40" />
        </div>
      </div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {[...Array(5)].map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
    {view === 'list' ? (
      <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200/50 dark:border-gray-700/30">
              <TableHead>Title</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(6)].map((_, i) => (
              <RecordingRowSkeleton key={i} />
            ))}
          </TableBody>
        </Table>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <RecordingCardSkeleton key={i} />
        ))}
      </div>
    )}
  </div>
)

// Empty State Component
const RecordingsEmptyState: React.FC = () => {
  const navigate = useNavigate()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="w-24 h-24 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center mb-6">
        <Video className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">
        No Recordings Yet
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6 text-center max-w-md">
        Set up automatic recording rules to capture your meetings, or manually start a recording when you join a call.
      </p>
      <Button
        onClick={() => navigate('/meetings/recordings/settings')}
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        <Settings className="mr-2 w-4 h-4" />
        Configure Recording Settings
      </Button>
    </motion.div>
  )
}

const ITEMS_PER_PAGE = 20

const RecordingsList: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeOrgId } = useOrg()
  const { user } = useAuth()
  const [view, setView] = useState<'list' | 'grid'>('grid')
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<RecordingStatus | 'all'>('all')
  const [platformFilter, setPlatformFilter] = useState<MeetingPlatform | 'all'>('all')
  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [isRefreshingAll, setIsRefreshingAll] = useState(false)

  // Fetch recordings with React Query
  const { recordings, total: totalCount, isLoading, error } = useRecordings({
    limit: ITEMS_PER_PAGE,
    offset: (currentPage - 1) * ITEMS_PER_PAGE,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  })

  // Fetch usage data
  const { data: usageData } = useRecordingUsage()

  // Fetch active recordings for live updates
  const { data: activeRecordings } = useActiveRecordings()

  // Fetch recordings requiring attention (HITL)
  const { data: attentionRecordings } = useRecordingsRequiringAttention()
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  // Filter recordings client-side for search and platform
  const filteredRecordings = recordings.filter(recording => {
    const matchesSearch = !searchQuery ||
      recording.meeting_title?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesPlatform = platformFilter === 'all' || recording.meeting_platform === platformFilter
    return matchesSearch && matchesPlatform
  })

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, platformFilter, searchQuery])

  const openRecording = (recordingId: string) => {
    navigate(`/meetings/recordings/${recordingId}`)
  }

  // Handle join meeting from modal
  const handleJoinMeeting = async (meetingUrl: string, meetingTitle?: string) => {
    if (!activeOrgId || !user?.id) {
      return { success: false, error: 'Not authenticated' }
    }

    setIsJoining(true)
    try {
      const result = await recordingService.startRecording(activeOrgId, user.id, {
        meetingUrl,
        meetingTitle,
      })

      if (result.success) {
        toast.success('Bot is joining the meeting', {
          description: meetingTitle || 'Recording will start shortly',
        })
        // Recordings list will auto-refresh via React Query
      }

      return result
    } catch (error) {
      console.error('[RecordingsList] Join meeting error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to join meeting',
      }
    } finally {
      setIsJoining(false)
    }
  }

  // Handle refresh all stuck bots
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
      } else if (s && s.still_active > 0) {
        toast.info(`${s.still_active} recording${s.still_active > 1 ? 's are' : ' is'} still active`)
      } else {
        toast.info('Status check complete')
      }
    } catch {
      toast.error('Failed to refresh recordings')
    } finally {
      setIsRefreshingAll(false)
    }
  }

  if (isLoading) {
    return <RecordingsListSkeleton view={view} />
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load recordings. Please try again.</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Recording Source Tabs */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2"
      >
        <Button
          variant={location.pathname === '/meetings' || location.pathname === '/meetings/' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/meetings')}
          className={cn(
            'gap-2',
            (location.pathname === '/meetings' || location.pathname === '/meetings/') &&
            'bg-emerald-600 hover:bg-emerald-700 text-white'
          )}
        >
          <Radio className="h-4 w-4" />
          External Recorders
        </Button>
        <Button
          variant={location.pathname.startsWith('/meetings/recordings') ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/meetings/recordings')}
          className={cn(
            'gap-2',
            location.pathname.startsWith('/meetings/recordings') &&
            'bg-emerald-600 hover:bg-emerald-700 text-white'
          )}
        >
          <Bot className="h-4 w-4" />
          60 Notetaker
        </Button>
      </motion.div>

      {/* Usage Banner */}
      {usageData && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Video className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Recording Usage
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {usageData.used} of {usageData.limit} recordings this month
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    usageData.used / usageData.limit > 0.9 ? 'bg-red-500' :
                    usageData.used / usageData.limit > 0.7 ? 'bg-amber-500' :
                    'bg-emerald-500'
                  )}
                  style={{ width: `${Math.min(100, (usageData.used / usageData.limit) * 100)}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {Math.round((usageData.used / usageData.limit) * 100)}%
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Active Recordings Banner */}
      {activeRecordings && activeRecordings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-red-500/10 via-red-600/10 to-orange-500/10 dark:from-red-500/20 dark:via-red-600/20 dark:to-orange-500/20 backdrop-blur-xl rounded-2xl p-4 border border-red-500/30 dark:border-red-500/40"
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
      {attentionRecordings && attentionRecordings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-yellow-500/10 dark:from-amber-500/20 dark:via-amber-600/20 dark:to-yellow-500/20 backdrop-blur-xl rounded-2xl p-4 border border-amber-500/30 dark:border-amber-500/40"
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

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-600/10 dark:bg-emerald-500/20 backdrop-blur-sm rounded-xl border border-emerald-600/20 dark:border-emerald-500/20">
            <Video className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Recordings
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              View and manage your meeting recordings
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Refresh All Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isRefreshingAll}
            className="gap-2"
            title="Check status of all pending recordings"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshingAll && "animate-spin")} />
            {isRefreshingAll ? 'Checking...' : 'Refresh All'}
          </Button>

          {/* Join Meeting Button */}
          <Button
            size="sm"
            onClick={() => setJoinModalOpen(true)}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-4 w-4" />
            Join Meeting
          </Button>

          {/* Settings Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/meetings/recordings/settings')}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          title="This Month"
          value={usageData?.used?.toString() || '0'}
          sub={`of ${usageData?.limit || 0} limit`}
          icon={<Calendar className="h-5 w-5" />}
        />
        <StatCard
          title="Total Recordings"
          value={totalCount.toString()}
          icon={<Video className="h-5 w-5" />}
        />
        <StatCard
          title="Ready"
          value={recordings.filter(r => r.status === 'ready').length.toString()}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          title="Processing"
          value={(activeRecordings?.length || 0).toString()}
          icon={<Loader2 className="h-5 w-5" />}
        />
        <StatCard
          title="Need Review"
          value={(attentionRecordings?.length || 0).toString()}
          sub={attentionRecordings && attentionRecordings.length > 0 ? 'Action required' : undefined}
          icon={<AlertCircle className="h-5 w-5" />}
          trend={attentionRecordings && attentionRecordings.length > 0 ? 'down' : 'neutral'}
        />
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-3"
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search recordings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white/80 dark:bg-gray-900/40"
          />
        </div>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as RecordingStatus | 'all')}>
          <SelectTrigger className="w-[140px] bg-white/80 dark:bg-gray-900/40">
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

        {/* Platform Filter */}
        <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as MeetingPlatform | 'all')}>
          <SelectTrigger className="w-[150px] bg-white/80 dark:bg-gray-900/40">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="zoom">Zoom</SelectItem>
            <SelectItem value="google_meet">Google Meet</SelectItem>
            <SelectItem value="microsoft_teams">Teams</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Recordings Display */}
      <AnimatePresence mode="wait">
        {filteredRecordings.length === 0 ? (
          <RecordingsEmptyState />
        ) : view === 'list' ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 overflow-hidden"
          >
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200/50 dark:border-gray-700/30">
                  <TableHead className="text-gray-500 dark:text-gray-400">Title</TableHead>
                  <TableHead className="text-gray-500 dark:text-gray-400">Platform</TableHead>
                  <TableHead className="text-gray-500 dark:text-gray-400">Date</TableHead>
                  <TableHead className="text-gray-500 dark:text-gray-400">Duration</TableHead>
                  <TableHead className="text-gray-500 dark:text-gray-400">AI Insights</TableHead>
                  <TableHead className="text-gray-500 dark:text-gray-400">Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecordings.map((recording, index) => {
                  const status = statusConfig[recording.status]
                  const platform = platformConfig[recording.meeting_platform]

                  return (
                    <motion.tr
                      key={recording.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="border-gray-200/50 dark:border-gray-700/30 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer"
                      onClick={() => openRecording(recording.id)}
                    >
                      <TableCell className="font-medium text-gray-900 dark:text-gray-200">
                        <div className="flex items-center gap-3">
                          <RecordingThumbnail
                            url={recording.thumbnail_url}
                            title={recording.meeting_title}
                            className="w-12 h-8 flex-shrink-0"
                          />
                          <span className="line-clamp-1">{recording.meeting_title || 'Untitled Recording'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-xs", platform?.color)}>
                          {platform?.label || recording.meeting_platform}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-700 dark:text-gray-400">
                        {recording.meeting_start_time
                          ? format(new Date(recording.meeting_start_time), 'dd MMM yyyy')
                          : recording.created_at
                          ? format(new Date(recording.created_at), 'dd MMM yyyy')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-gray-700 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(recording.meeting_duration_seconds)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <SentimentBadge score={recording.sentiment_score} />
                          <CoachRatingBadge rating={recording.coach_rating} />
                          <TalkTimeBadge repPct={recording.talk_time_rep_pct} judgement={recording.talk_time_judgement} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="gap-1">
                          {status.icon}
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            openRecording(recording.id)
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  )
                })}
              </TableBody>
            </Table>
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            {filteredRecordings.map((recording, index) => {
              const status = statusConfig[recording.status]
              const platform = platformConfig[recording.meeting_platform]

              return (
                <motion.div
                  key={recording.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={{ scale: 1.02, y: -4 }}
                  className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl overflow-hidden border border-gray-200/50 dark:border-gray-700/30 hover:border-gray-300/50 dark:hover:border-gray-600/40 transition-all duration-300 cursor-pointer group"
                  onClick={() => openRecording(recording.id)}
                >
                  {/* Thumbnail */}
                  <RecordingThumbnail
                    url={recording.thumbnail_url}
                    title={recording.meeting_title}
                    className="w-full h-32"
                  />

                  <div className="p-5">
                    {/* Header with Status */}
                    <div className="flex items-start justify-between mb-3">
                      <Badge variant={status.variant} className="gap-1">
                        {status.icon}
                        {status.label}
                      </Badge>
                      <Badge variant="outline" className={cn("text-xs", platform?.color)}>
                        {platform?.label || recording.meeting_platform}
                      </Badge>
                    </div>

                    {/* Content */}
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-2">
                          {recording.meeting_title || 'Untitled Recording'}
                        </h3>
                        {recording.summary && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                            {recording.summary}
                          </p>
                        )}
                      </div>

                      {/* AI Metrics Badges */}
                      <div className="flex flex-wrap gap-2">
                        <SentimentBadge score={recording.sentiment_score} />
                        <CoachRatingBadge rating={recording.coach_rating} />
                        <TalkTimeBadge repPct={recording.talk_time_rep_pct} judgement={recording.talk_time_judgement} />
                      </div>

                      {/* Additional Badges */}
                      <div className="flex flex-wrap gap-2">
                        {recording.speakers && recording.speakers.length > 0 && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Users className="h-3 w-3" />
                            {recording.speakers.length} speakers
                          </Badge>
                        )}
                        {recording.hitl_required && (
                          <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600 dark:text-amber-400 gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Review needed
                          </Badge>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-200/50 dark:border-gray-700/30">
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {recording.meeting_start_time
                            ? formatDistanceToNow(new Date(recording.meeting_start_time), { addSuffix: true })
                            : recording.created_at
                            ? formatDistanceToNow(new Date(recording.created_at), { addSuffix: true })
                            : '—'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(recording.meeting_duration_seconds)}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pagination */}
      {totalCount > ITEMS_PER_PAGE && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/30"
        >
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} recordings
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
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
                      'w-9 h-9',
                      currentPage === pageNum && 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    )}
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Join Meeting Modal */}
      <JoinMeetingModal
        open={joinModalOpen}
        onOpenChange={setJoinModalOpen}
        onJoin={handleJoinMeeting}
        isLoading={isJoining}
      />
    </div>
  )
}

export default RecordingsList

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase/clientV2'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useOrg } from '@/lib/contexts/OrgContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { MeetingsEmptyState } from './MeetingsEmptyState'
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration'
import { useDebouncedSearch, filterItems } from '@/lib/hooks/useDebounce'
import { MeetingsFilterBar } from './MeetingsFilterBar'
import { DateRangePreset, DateRange, getDateRangeFromPreset } from '@/components/ui/date-filter'
import { toast } from 'sonner'
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
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  Sparkles,
  RefreshCw,
  Mic,
  AudioLines,
  Bot,
  Radio,
  Filter
} from 'lucide-react'
import { MeetingUsageBar } from '@/components/MeetingUsageIndicator'

// Helper to format duration safely (filters out corrupted data)
const formatDuration = (minutes: number | null | undefined): string => {
  if (!minutes || minutes <= 0 || minutes > 480) {
    return '—' // 8 hours max, anything more is bad data
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }
  return `${minutes}m`
}

// Processing status type for real-time UI updates
type ProcessingStatus = 'pending' | 'processing' | 'complete' | 'failed'

interface Meeting {
  id: string
  fathom_recording_id: string
  title: string
  share_url: string
  calls_url: string
  meeting_start: string
  meeting_end: string
  duration_minutes: number
  owner_user_id: string
  owner_email: string
  team_name: string
  company_id: string | null
  primary_contact_id: string | null
  summary: string
  transcript_doc_url: string | null
  thumbnail_url: string | null
  sentiment_score: number | null
  coach_rating: number | null
  talk_time_rep_pct: number | null
  talk_time_customer_pct: number | null
  talk_time_judgement: string | null
  next_actions_count: number | null
  meeting_type?: 'discovery' | 'demo' | 'negotiation' | 'closing' | 'follow_up' | 'general' | null
  classification_confidence?: number | null
  // Source type for voice, 60 Notetaker, or Fathom meetings
  source_type?: 'fathom' | 'voice' | '60_notetaker'
  voice_recording_id?: string | null
  // Meeting provider (fathom, fireflies, etc.)
  provider?: string
  // Processing status columns for real-time UI updates
  thumbnail_status?: ProcessingStatus
  transcript_status?: ProcessingStatus
  summary_status?: ProcessingStatus
  company?: {
    name: string
    domain: string
  }
  action_items?: {
    completed: boolean
  }[]
  tasks?: {
    status: string
  }[]
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
          <div className="w-5 h-5 sm:w-5 sm:h-5 flex items-center justify-center">
            {icon}
          </div>
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

// Skeleton Components for Loading State
const StatCardSkeleton: React.FC = () => (
  <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-3 sm:p-5 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-2 w-20 bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-8 sm:h-9 w-16 bg-gray-200/60 dark:bg-gray-700/40" />
      </div>
      <Skeleton className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gray-200/60 dark:bg-gray-700/40 mt-2 sm:mt-0" />
    </div>
  </div>
)

const MeetingCardSkeleton: React.FC = () => (
  <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-5 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
    {/* Video Thumbnail Skeleton */}
    <Skeleton className="aspect-video rounded-xl mb-4 bg-gray-200/60 dark:bg-gray-700/40" />

    {/* Content */}
    <div className="space-y-3">
      <div>
        <Skeleton className="h-5 w-3/4 mb-2 bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-4 w-1/2 bg-gray-200/60 dark:bg-gray-700/40" />
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-5 w-16 rounded-full bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-5 w-14 rounded-full bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-5 w-20 rounded-full bg-gray-200/60 dark:bg-gray-700/40" />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200/50 dark:border-gray-700/30">
        <Skeleton className="h-3 w-20 bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-3 w-16 bg-gray-200/60 dark:bg-gray-700/40" />
      </div>
    </div>
  </div>
)

const MeetingRowSkeleton: React.FC = () => (
  <TableRow className="border-gray-200/50 dark:border-gray-700/30">
    <TableCell><Skeleton className="h-4 w-32 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-4 w-24 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-4 w-16 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-4 w-20 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-4 w-12 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-5 w-16 rounded-full bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-5 w-14 rounded-full bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-5 w-10 rounded-full bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-4 w-6 bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
    <TableCell><Skeleton className="h-8 w-8 rounded-lg bg-gray-200/60 dark:bg-gray-700/40" /></TableCell>
  </TableRow>
)

const MeetingsListSkeleton: React.FC<{ view: 'list' | 'grid' }> = ({ view }) => (
  <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 min-h-full bg-[#F8FAFC] dark:bg-transparent">
    {/* Header Skeleton */}
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gray-200/60 dark:bg-gray-700/40 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-6 sm:h-8 w-24 mb-2 bg-gray-200/60 dark:bg-gray-700/40" />
          <Skeleton className="h-3 w-32 sm:w-56 bg-gray-200/60 dark:bg-gray-700/40" />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Skeleton className="h-8 w-24 sm:w-32 rounded-xl bg-gray-200/60 dark:bg-gray-700/40" />
        <Skeleton className="h-8 w-16 sm:w-20 rounded-xl bg-gray-200/60 dark:bg-gray-700/40" />
      </div>
    </div>

    {/* Stats Skeleton */}
    <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
      {[...Array(5)].map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>

    {/* Content Skeleton */}
    {view === 'list' ? (
      <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 overflow-hidden shadow-sm dark:shadow-lg dark:shadow-black/10">
        <div className="overflow-x-scroll">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200/50 dark:border-gray-700/30">
                <TableHead className="text-gray-500 dark:text-gray-400">Title</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">Company</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400 hidden md:table-cell">Rep</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400">Date</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">Duration</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400 hidden lg:table-cell">Type</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400 hidden lg:table-cell">Sentiment</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400 hidden xl:table-cell">Coach</TableHead>
                <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">Tasks</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(6)].map((_, i) => (
                <MeetingRowSkeleton key={i} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {[...Array(6)].map((_, i) => (
          <MeetingCardSkeleton key={i} />
        ))}
      </div>
    )}
  </div>
)

const ITEMS_PER_PAGE = 30

const MeetingsList: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { activeOrgId } = useOrg()
  const { syncState, isConnected, isSyncing, triggerSync } = useFathomIntegration()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [scope, setScope] = useState<'me' | 'team'>('me')
  const [view, setView] = useState<'list' | 'grid'>('grid')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [stats, setStats] = useState({
    meetingsThisMonth: 0,
    avgDuration: 0,
    actionItemsOpen: 0,
    avgSentiment: 0,
    avgCoachRating: 0
  })
  const [thumbnailsEnsured, setThumbnailsEnsured] = useState(false)
  const autoSyncAttemptedRef = useRef(false)

  // Sorting state
  const [sortField, setSortField] = useState<'title' | 'owner_email' | 'meeting_start' | 'duration_minutes' | 'sentiment_score' | 'coach_rating'>('meeting_start')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // Filtering state
  const { searchQuery, debouncedSearchQuery, isSearching, setSearchQuery } = useDebouncedSearch('', 400)
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all')
  const [customDateRange, setCustomDateRange] = useState<DateRange | null>(null)
  const [selectedRepId, setSelectedRepId] = useState<string | null | undefined>(undefined)
  const [durationBucket, setDurationBucket] = useState<'all' | 'short' | 'medium' | 'long'>('all')
  const [sentimentCategory, setSentimentCategory] = useState<'all' | 'positive' | 'neutral' | 'challenging'>('all')
  const [coachingCategory, setCoachingCategory] = useState<'all' | 'excellent' | 'good' | 'needs-work'>('all')

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (datePreset !== 'all') count++
    if (selectedRepId) count++
    if (durationBucket !== 'all') count++
    if (sentimentCategory !== 'all') count++
    if (coachingCategory !== 'all') count++
    if (searchQuery.trim()) count++
    return count
  }, [datePreset, selectedRepId, durationBucket, sentimentCategory, coachingCategory, searchQuery])

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  // Reset to page 1 when scope or org changes
  useEffect(() => {
    setCurrentPage(1)
  }, [scope, activeOrgId])

  // Reset to page 1 when any filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [sortField, sortDirection, datePreset, customDateRange, selectedRepId, durationBucket, sentimentCategory, coachingCategory, debouncedSearchQuery])

  useEffect(() => {
    fetchMeetings()
  }, [scope, user, activeOrgId, currentPage, sortField, sortDirection, datePreset, customDateRange, selectedRepId])

  // Auto-sync when user arrives with Fathom connected but no meetings
  // This handles users coming from onboarding who skipped the sync step
  // Only runs ONCE per page load - uses ref to prevent re-triggering
  // IMPORTANT: Only sync if Fathom is actually connected
  useEffect(() => {
    // Skip if we've already attempted auto-sync this session
    if (autoSyncAttemptedRef.current) return
    
    // CRITICAL: Don't attempt sync if Fathom is not connected
    if (!isConnected) {
      return;
    }

    const shouldAutoSync =
      !loading &&
      isConnected &&
      !isSyncing &&
      meetings.length === 0

    if (shouldAutoSync) {
      // Mark as attempted BEFORE starting sync to prevent re-triggers
      autoSyncAttemptedRef.current = true

      toast.info('Syncing your meetings...', {
        description: 'We\'re importing your recent Fathom recordings in the background.'
      })

      // Trigger initial sync with limit of 10 meetings for quick feedback
      triggerSync({ sync_type: 'initial', limit: 10 })
        .then(() => {
          toast.success('Initial sync complete!', {
            description: 'Your most recent meetings are now available.'
          })
          // Refresh meetings list after sync
          fetchMeetings()
        })
        .catch((err) => {
          console.error('Auto-sync failed:', err)
          toast.error('Sync encountered an issue', {
            description: 'You can try syncing again from Settings.'
          })
        })
    }
  }, [loading, isConnected, isSyncing, meetings.length, triggerSync])

  // Ensure thumbnails exist for any listed meeting with a video
  useEffect(() => {
    const ensureThumbnails = async () => {
      if (thumbnailsEnsured || meetings.length === 0) return
      try {
        for (const m of meetings) {
          if (m.thumbnail_url || !(m.share_url || m.fathom_recording_id)) continue
          // Skip non-Fathom meetings (no embeddable video)
          if (m.provider && m.provider !== 'fathom') continue

          // Build embed URL from share_url or recording id
          let embedUrl: string | null = null
          if (m.share_url) {
            try {
              const u = new URL(m.share_url)
              const token = u.pathname.split('/').filter(Boolean).pop()
              if (token) embedUrl = `https://fathom.video/embed/${token}`
            } catch {
              // ignore parse errors
            }
          }
          if (!embedUrl && m.fathom_recording_id) {
            embedUrl = `https://app.fathom.video/recording/${m.fathom_recording_id}`
          }

          let thumbnailUrl: string | null = null
          if (embedUrl) {
            // Choose a representative timestamp: midpoint, clamped to >=5s
            const midpointSeconds = Math.max(5, Math.floor((m.duration_minutes || 0) * 60 / 2))
            const { data, error } = await supabase.functions.invoke('generate-video-thumbnail-v2', {
              body: {
                recording_id: m.fathom_recording_id,
                share_url: m.share_url,
                fathom_embed_url: embedUrl,
                timestamp_seconds: midpointSeconds,
                meeting_id: m.id,
              },
            })
            if (!error && (data as any)?.success && (data as any)?.thumbnail_url) {
              thumbnailUrl = (data as any).thumbnail_url as string
            }
          }

          // Fallback placeholder if generation not possible
          if (!thumbnailUrl) {
            const firstLetter = (m.title || 'M')[0].toUpperCase()
            thumbnailUrl = `https://dummyimage.com/640x360/1a1a1a/10b981&text=${encodeURIComponent(firstLetter)}`
          }

          // Persist thumbnail to database
          await supabase
            .from('meetings')
            .update({ thumbnail_url: thumbnailUrl })
            .eq('id', m.id)

          setMeetings(prev => prev.map(x => x.id === m.id ? { ...x, thumbnail_url: thumbnailUrl } : x))

          // Small delay to avoid overwhelming screenshot provider
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      } finally {
        setThumbnailsEnsured(true)
      }
    }

    ensureThumbnails()
  }, [meetings, thumbnailsEnsured])

  // Real-time subscription for meeting status updates
  // This enables live UI updates when thumbnails, transcripts, and summaries are processed
  useEffect(() => {
    if (!activeOrgId) return

    const channel = supabase
      .channel('meeting_status_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'meetings',
          filter: `org_id=eq.${activeOrgId}`,
        },
        (payload) => {
          const updated = payload.new as Meeting
          // Update local state with new status columns
          setMeetings((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? {
                    ...m,
                    thumbnail_url: updated.thumbnail_url ?? m.thumbnail_url,
                    thumbnail_status: updated.thumbnail_status ?? m.thumbnail_status,
                    transcript_status: updated.transcript_status ?? m.transcript_status,
                    summary_status: updated.summary_status ?? m.summary_status,
                    summary: updated.summary ?? m.summary,
                  }
                : m
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeOrgId])

  const fetchMeetings = async () => {
    if (!user) return

    setLoading(true)
    setFetchError(null)
    try {
      // First get total count for pagination
      // Use explicit any to avoid deep type instantiation issues with Supabase query chaining
      const countQueryBase = supabase
        .from('meetings')
        .select('*', { count: 'exact', head: true }) as any
      
      // Apply filters
      let countQuery = countQueryBase
      if (activeOrgId) {
        countQuery = countQuery.eq('org_id', activeOrgId)
      }
      if (scope === 'me' || !activeOrgId) {
        countQuery = countQuery.or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email}`)
      }

      const { count } = await countQuery
      setTotalCount(count || 0)

      // Now fetch paginated data
      const from = (currentPage - 1) * ITEMS_PER_PAGE
      const to = from + ITEMS_PER_PAGE - 1

      // Use explicit any to avoid deep type instantiation issues
      // Note: Use explicit FK name for company since there are multiple FKs between meetings and companies
      // Also query tasks via the tasks_meeting_id_fkey relationship
      const queryBase = supabase
        .from('meetings')
        .select(`
          *,
          company:companies!meetings_company_id_fkey(name, domain),
          action_items:meeting_action_items(completed),
          tasks!tasks_meeting_id_fkey(status)
        `)
        .order(sortField, { ascending: sortDirection === 'asc' })
        .range(from, to) as any

      // Apply org scoping if we have an active org
      let query = queryBase
      if (activeOrgId) {
        query = query.eq('org_id', activeOrgId)
      }

      // RLS already filters by organization, so we get all meetings the user can access
      // Additional client filters:
      // - If no activeOrgId, fall back to user-owned meetings only to avoid empty state
      // - "My" scope filters to meetings where user is the owner
      if (scope === 'me' || !activeOrgId) {
        query = query.or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email}`)
      }

      // Server-side date filtering
      const dateRange = customDateRange || getDateRangeFromPreset(datePreset)
      if (dateRange) {
        query = query
          .gte('meeting_start', dateRange.start.toISOString())
          .lte('meeting_start', dateRange.end.toISOString())
      }

      // Server-side rep filtering (when scope is 'team')
      if (selectedRepId && scope === 'team') {
        query = query.eq('owner_user_id', selectedRepId)
      }

      const { data, error } = await query

      if (error) throw error

      // Map data to ensure next_actions_count has a default value and company is properly shaped
      const meetingsData = (data || []).map((m: any) => ({
        ...m,
        next_actions_count: m.next_actions_count ?? null,
        // company relation returns array, take first or undefined
        company: Array.isArray(m.company) ? m.company[0] : m.company
      })) as Meeting[]
      setMeetings(meetingsData)
      // Reset to allow ensureThumbnails to run for the new list
      setThumbnailsEnsured(false)
    } catch (error: any) {
      console.error('Error fetching meetings:', error)
      // Set user-friendly error message
      const errorMessage = error?.message || error?.code || 'Failed to load meetings'
      const statusCode = error?.status || error?.statusCode
      if (statusCode === 503) {
        setFetchError('Database temporarily unavailable. Please try again in a moment.')
      } else if (statusCode === 406) {
        setFetchError('Unable to load meetings. Please refresh the page.')
      } else {
        setFetchError(errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (meetings: Meeting[]) => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    
    const thisMonthMeetings = meetings.filter(m => 
      new Date(m.meeting_start) >= startOfMonth
    )
    
    // Filter out unreasonable durations (> 8 hours = 480 minutes is likely bad data)
    const validDurations = meetings
      .map(m => m.duration_minutes || 0)
      .filter(d => d > 0 && d <= 480)
    const totalDuration = validDurations.reduce((sum, d) => sum + d, 0)
    const avgDuration = validDurations.length > 0 ? Math.round(totalDuration / validDurations.length) : 0
    
    const openActionItems = meetings.reduce((sum, m) => {
      const open = m.action_items?.filter(a => !a.completed).length || 0
      return sum + open
    }, 0)
    
    const sentimentScores = meetings
      .filter(m => m.sentiment_score !== null)
      .map(m => m.sentiment_score as number)
    const avgSentiment = sentimentScores.length > 0
      ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
      : 0
    
    const coachRatings = meetings
      .filter(m => m.coach_rating !== null)
      .map(m => m.coach_rating as number)
    const avgCoachRating = coachRatings.length > 0
      ? Math.round(coachRatings.reduce((a, b) => a + b, 0) / coachRatings.length)
      : 0
    
    setStats({
      meetingsThisMonth: thisMonthMeetings.length,
      avgDuration,
      actionItemsOpen: openActionItems,
      avgSentiment,
      avgCoachRating
    })
  }

  const openMeeting = (meetingId: string) => {
    navigate(`/meetings/${meetingId}`)
  }

  // Client-side filtering pipeline
  const filteredMeetings = useMemo(() => {
    let filtered = meetings

    // Search filter (title, company name)
    if (debouncedSearchQuery.trim()) {
      filtered = filterItems(filtered, debouncedSearchQuery, ['title', 'company.name'] as (keyof Meeting)[])
    }

    // Duration bucket filter
    if (durationBucket !== 'all') {
      filtered = filtered.filter(m => {
        const duration = m.duration_minutes || 0
        switch (durationBucket) {
          case 'short': return duration < 30
          case 'medium': return duration >= 30 && duration <= 60
          case 'long': return duration > 60
          default: return true
        }
      })
    }

    // Sentiment category filter
    if (sentimentCategory !== 'all') {
      filtered = filtered.filter(m => {
        const label = sentimentLabel(m.sentiment_score).toLowerCase()
        return label === sentimentCategory
      })
    }

    // Coaching category filter
    if (coachingCategory !== 'all') {
      filtered = filtered.filter(m => {
        if (m.coach_rating === null) return false
        switch (coachingCategory) {
          case 'excellent': return m.coach_rating >= 8
          case 'good': return m.coach_rating >= 6 && m.coach_rating < 8
          case 'needs-work': return m.coach_rating < 6
          default: return true
        }
      })
    }

    return filtered
  }, [meetings, debouncedSearchQuery, durationBucket, sentimentCategory, coachingCategory])

  // Update stats based on filtered meetings
  useEffect(() => {
    calculateStats(filteredMeetings)
  }, [filteredMeetings])

  if (loading) {
    return <MeetingsListSkeleton view={view} />
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden min-h-full bg-[#F8FAFC] dark:bg-transparent">
      {/* Recording Source Tabs */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 flex-wrap w-full"
      >
        <Button
          variant={location.pathname === '/meetings' || location.pathname === '/meetings/' ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/meetings')}
          className={cn(
            'gap-2 text-xs sm:text-sm',
            (location.pathname === '/meetings' || location.pathname === '/meetings/') &&
            'bg-emerald-600 hover:bg-emerald-700 text-white'
          )}
        >
          <Radio className="h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">External Recorders</span>
          <span className="sm:hidden">Recorders</span>
        </Button>
        <Button
          variant={location.pathname.startsWith('/meetings/recordings') ? 'default' : 'outline'}
          size="sm"
          onClick={() => navigate('/meetings/recordings')}
          className={cn(
            'gap-2 text-xs sm:text-sm',
            location.pathname.startsWith('/meetings/recordings') &&
            'bg-emerald-600 hover:bg-emerald-700 text-white'
          )}
        >
          <Bot className="h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">60 Notetaker</span>
          <span className="sm:hidden">Notetaker</span>
        </Button>
      </motion.div>

      {/* Meeting Usage Bar - Shows for free tier users */}
      <MeetingUsageBar />

      {/* Sync Progress Banner - Shows during active sync, doesn't block content */}
      {/* Hide when sync is effectively complete (all meetings synced) */}
      {isSyncing && syncState &&
       !(syncState.meetings_synced > 0 && syncState.meetings_synced >= syncState.total_meetings_found) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-emerald-500/10 via-emerald-600/10 to-teal-500/10 dark:from-emerald-500/20 dark:via-emerald-600/20 dark:to-teal-500/20 backdrop-blur-xl rounded-2xl p-3 sm:p-4 border border-emerald-500/30 dark:border-emerald-500/40 w-full"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="relative flex-shrink-0">
                <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400 animate-spin" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-emerald-700 dark:text-emerald-300 truncate">
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
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                {/* Progress bar */}
                <div className="w-24 sm:w-32 h-2 bg-emerald-200/50 dark:bg-emerald-900/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.round((syncState.meetings_synced / syncState.total_meetings_found) * 100)}%`
                    }}
                    transition={{ duration: 0.5 }}
                    className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full"
                  />
                </div>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium min-w-[35px] text-right">
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
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="p-2 bg-emerald-600/10 dark:bg-emerald-500/20 backdrop-blur-sm rounded-xl border border-emerald-600/20 dark:border-emerald-500/20 flex-shrink-0">
            <Video className="h-5 sm:h-6 w-5 sm:w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 truncate">
              Meetings
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">Review your recorded conversations and insights</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Scope Toggle */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-1 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10"
          >
            <Button
              variant={scope === 'me' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setScope('me')}
              className={scope === 'me' ? 'bg-gray-100 dark:bg-gray-800/60' : ''}
            >
              <User className="h-4 w-4 hidden sm:inline mr-1.5" />
              <span className="hidden sm:inline">My</span>
              <span className="sm:hidden">My</span>
            </Button>
            <Button
              variant={scope === 'team' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setScope('team')}
              className={scope === 'team' ? 'bg-gray-100 dark:bg-gray-800/60' : ''}
            >
              <Users className="h-4 w-4 hidden sm:inline mr-1.5" />
              <span className="hidden sm:inline">Team</span>
              <span className="sm:hidden">Team</span>
            </Button>
          </motion.div>

          {/* View Toggle */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-1 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10"
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
          value={stats.avgCoachRating ? `${stats.avgCoachRating}/10` : 'N/A'}
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
        onSortDirectionToggle={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
        datePreset={datePreset}
        customDateRange={customDateRange}
        onDateChange={(preset, range) => {
          setDatePreset(preset)
          setCustomDateRange(range)
        }}
        selectedRepId={selectedRepId}
        onRepChange={setSelectedRepId}
        scope={scope}
        durationBucket={durationBucket}
        onDurationChange={setDurationBucket}
        sentimentCategory={sentimentCategory}
        onSentimentChange={setSentimentCategory}
        coachingCategory={coachingCategory}
        onCoachingChange={setCoachingCategory}
        activeFilterCount={activeFilterCount}
        onClearAll={() => {
          setSearchQuery('')
          setSortField('meeting_start')
          setSortDirection('desc')
          setDatePreset('all')
          setCustomDateRange(null)
          setSelectedRepId(undefined)
          setDurationBucket('all')
          setSentimentCategory('all')
          setCoachingCategory('all')
        }}
      />

      {/* Meetings Display */}
      <AnimatePresence mode="wait">
        {view === 'list' ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 overflow-hidden shadow-sm dark:shadow-lg dark:shadow-black/10 w-full"
          >
            <div className="w-full overflow-x-auto scrollbar-visible">
              <style>{`
                .scrollbar-visible::-webkit-scrollbar {
                  height: 6px;
                }
                .scrollbar-visible::-webkit-scrollbar-track {
                  background: transparent;
                }
                .scrollbar-visible::-webkit-scrollbar-thumb {
                  background: rgb(200, 200, 200);
                  border-radius: 3px;
                }
                .scrollbar-visible::-webkit-scrollbar-thumb:hover {
                  background: rgb(150, 150, 150);
                }
                .dark .scrollbar-visible::-webkit-scrollbar-thumb {
                  background: rgb(100, 100, 100);
                }
                .dark .scrollbar-visible::-webkit-scrollbar-thumb:hover {
                  background: rgb(120, 120, 120);
                }
              `}</style>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-200/50 dark:border-gray-700/30 hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                    <TableHead className="text-gray-500 dark:text-gray-400">Title</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">Company</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden md:table-cell">Rep</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400">Date</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">Duration</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden lg:table-cell">Type</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden lg:table-cell">Sentiment</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden xl:table-cell">Coach</TableHead>
                    <TableHead className="text-gray-500 dark:text-gray-400 hidden sm:table-cell">Tasks</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMeetings.map((meeting, index) => {
                    // Unified task count from tasks table
                    const openTasks = meeting.tasks?.filter(t => t.status !== 'completed').length || 0

                    return (
                      <motion.tr
                        key={meeting.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className="border-gray-200/50 dark:border-gray-700/30 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors group"
                      >
                        <TableCell className="font-medium text-gray-900 dark:text-gray-200 max-w-[200px] sm:max-w-xs">
                          <div className="flex items-start gap-2">
                            {meeting.source_type === 'voice' && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 rounded text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5">
                                <Mic className="h-3 w-3" />
                              </div>
                            )}
                            {meeting.source_type === '60_notetaker' && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-500/20 rounded text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5">
                                <Bot className="h-3 w-3" />
                              </div>
                            )}
                            {meeting.provider === 'fireflies' && meeting.source_type !== 'voice' && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-100 dark:bg-orange-500/20 rounded text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5">
                                <Mic className="h-3 w-3" />
                              </div>
                            )}
                            <span className="break-words line-clamp-2">{meeting.title || 'Untitled'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-400 hidden sm:table-cell max-w-[120px] truncate">
                          {meeting.company?.name || '-'}
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-400 hidden md:table-cell max-w-[100px] truncate">
                          {meeting.owner_email?.split('@')[0]}
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-400 whitespace-nowrap text-sm">
                          {meeting.meeting_start
                            ? format(new Date(meeting.meeting_start), 'dd MMM')
                            : '-'}
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-400 hidden sm:table-cell">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(meeting.duration_minutes)}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {meeting.meeting_type ? (
                            <Badge
                              variant="outline"
                              className="capitalize bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20 backdrop-blur-sm text-xs whitespace-nowrap"
                            >
                              {meeting.meeting_type.replace('_', ' ')}
                            </Badge>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-600 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Badge
                            variant={sentimentTone(meeting.sentiment_score) as any}
                            className="backdrop-blur-sm whitespace-nowrap"
                          >
                            {sentimentLabel(meeting.sentiment_score)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {meeting.coach_rating !== null && (
                            <Badge variant="secondary" className="backdrop-blur-sm whitespace-nowrap">
                              {meeting.coach_rating}/10
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-right">
                          {openTasks > 0 && (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">{openTasks}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openMeeting(meeting.id)}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </motion.tr>
                    )
                  })}
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
            {filteredMeetings.map((meeting, index) => {
              // Unified task count from tasks table
              const openTasks = meeting.tasks?.filter(t => t.status !== 'completed').length || 0

              return (
                <motion.div
                  key={meeting.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={{ y: -2 }}
                  className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-3 sm:p-5 border border-gray-200/50 dark:border-gray-700/30 hover:border-gray-300/50 dark:hover:border-gray-600/40 transition-all duration-300 shadow-sm dark:shadow-lg dark:shadow-black/10 cursor-pointer group w-full"
                  onClick={() => openMeeting(meeting.id)}
                >
                  {/* Media Thumbnail Area - Voice or Video */}
                  <div className="relative aspect-video bg-gray-100/80 dark:bg-gray-800/40 rounded-xl mb-3 sm:mb-4 overflow-hidden border border-gray-200/30 dark:border-gray-700/20">
                    {meeting.source_type === '60_notetaker' ? (
                      /* 60 Notetaker Meeting - Video Thumbnail */
                      <>
                        {meeting.thumbnail_url && !meeting.thumbnail_url.includes('dummyimage.com') ? (
                          <img
                            src={meeting.thumbnail_url}
                            alt={meeting.title}
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-500/10 via-blue-600/5 to-indigo-500/10 dark:from-blue-500/20 dark:via-blue-600/10 dark:to-indigo-500/20">
                            <Video className="h-10 w-10 text-blue-400/60" />
                          </div>
                        )}
                        {/* 60 Notetaker badge - top left */}
                        <div className="absolute top-2 left-2">
                          <div className="px-2 py-1 bg-blue-500/90 backdrop-blur-sm rounded-md text-[10px] text-white flex items-center gap-1">
                            <Bot className="h-3 w-3" />
                            60 Notetaker
                          </div>
                        </div>
                      </>
                    ) : meeting.source_type === 'voice' ? (
                      /* Voice Meeting - Audio Waveform Display */
                      <>
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-emerald-500/10 via-emerald-600/5 to-teal-500/10 dark:from-emerald-500/20 dark:via-emerald-600/10 dark:to-teal-500/20">
                          {/* Animated waveform bars */}
                          <div className="flex items-end gap-1 h-12 mb-2">
                            {[...Array(12)].map((_, i) => (
                              <div
                                key={i}
                                className="w-1.5 bg-emerald-500/60 dark:bg-emerald-400/60 rounded-full"
                                style={{
                                  height: `${20 + Math.sin(i * 0.8) * 15 + Math.random() * 10}px`,
                                  animation: `waveform ${0.5 + i * 0.1}s ease-in-out infinite alternate`,
                                  animationDelay: `${i * 50}ms`,
                                }}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                            <Mic className="h-5 w-5" />
                            <span className="text-sm font-medium">Voice Recording</span>
                          </div>
                        </div>
                        {/* Voice badge - top left */}
                        <div className="absolute top-2 left-2">
                          <div className="px-2 py-1 bg-emerald-500/90 backdrop-blur-sm rounded-md text-[10px] text-white flex items-center gap-1">
                            <Mic className="h-3 w-3" />
                            Voice
                          </div>
                        </div>
                      </>
                    ) : meeting.provider === 'fireflies' ? (
                      /* Fireflies Meeting - Transcript Display */
                      <>
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-orange-500/10 via-orange-600/5 to-amber-500/10 dark:from-orange-500/20 dark:via-orange-600/10 dark:to-amber-500/20">
                          <Mic className="h-10 w-10 text-orange-500/60 dark:text-orange-400/60 mb-2" />
                          <span className="text-sm font-medium text-orange-600 dark:text-orange-400">Fireflies Transcript</span>
                        </div>
                        {/* Fireflies badge - top left */}
                        <div className="absolute top-2 left-2">
                          <div className="px-2 py-1 bg-orange-500/90 backdrop-blur-sm rounded-md text-[10px] text-white flex items-center gap-1">
                            <Mic className="h-3 w-3" />
                            Fireflies
                          </div>
                        </div>
                      </>
                    ) : (
                      /* Fathom/Video Meeting - Standard Thumbnail */
                      <>
                        {meeting.thumbnail_url && !meeting.thumbnail_url.includes('dummyimage.com') ? (
                          <img
                            src={meeting.thumbnail_url}
                            alt={meeting.title}
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              // Fallback to placeholder if image fails to load
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : null}

                        {/* Thumbnail Processing Indicator */}
                        {meeting.thumbnail_status === 'processing' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="h-8 w-8 text-white animate-spin" />
                              <span className="text-xs text-white/80">Generating thumbnail...</span>
                            </div>
                          </div>
                        )}

                        {/* Thumbnail Pending (Queued) Indicator */}
                        {meeting.thumbnail_status === 'pending' && !meeting.thumbnail_url && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
                              <Video className="h-12 w-12" />
                              <span className="text-xs">Queued</span>
                            </div>
                          </div>
                        )}

                        {/* Processing Status Badges (top-left) */}
                        {(meeting.transcript_status === 'processing' || meeting.summary_status === 'processing') && (
                          <div className="absolute top-2 left-2 flex flex-col gap-1">
                            {meeting.transcript_status === 'processing' && (
                              <div className="px-2 py-1 bg-blue-500/90 backdrop-blur-sm rounded-md text-[10px] text-white flex items-center gap-1.5">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <FileText className="h-3 w-3" />
                              </div>
                            )}
                            {meeting.summary_status === 'processing' && (
                              <div className="px-2 py-1 bg-purple-500/90 backdrop-blur-sm rounded-md text-[10px] text-white flex items-center gap-1.5">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <Sparkles className="h-3 w-3" />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Queued Status Badge */}
                        {meeting.transcript_status === 'pending' && meeting.summary_status === 'pending' && (
                          <div className="absolute top-2 left-2">
                            <div className="px-2 py-1 bg-gray-500/80 backdrop-blur-sm rounded-md text-[10px] text-white flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Queued
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    {/* Play Button Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-16 h-16 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <Play className="h-8 w-8 text-emerald-600 dark:text-emerald-400 fill-current ml-1" />
                      </div>
                    </div>
                    {/* Duration badge */}
                    <div className="absolute bottom-2 right-2 px-2.5 py-1 bg-white/90 dark:bg-gray-900/70 backdrop-blur-md rounded-lg text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1 border border-gray-200/30 dark:border-gray-700/30">
                      <Clock className="h-3 w-3" />
                      {formatDuration(meeting.duration_minutes)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                        {meeting.title || 'Untitled Meeting'}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {meeting.company?.name || 'No company'}
                      </p>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-2">
                      {meeting.meeting_type && (
                        <Badge
                          variant="outline"
                          className="capitalize bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20 backdrop-blur-sm text-xs"
                        >
                          {meeting.meeting_type.replace('_', ' ')}
                        </Badge>
                      )}
                      <Badge
                        variant={sentimentTone(meeting.sentiment_score) as any}
                        className="backdrop-blur-sm text-xs"
                      >
                        {sentimentLabel(meeting.sentiment_score)}
                      </Badge>
                      {meeting.coach_rating !== null && (
                        <Badge variant="secondary" className="backdrop-blur-sm text-xs">
                          Coach: {meeting.coach_rating}/10
                        </Badge>
                      )}
                      {openTasks > 0 && (
                        <Badge variant="outline" className="backdrop-blur-sm text-xs border-amber-600/50 dark:border-amber-500/50 text-amber-600 dark:text-amber-400">
                          {openTasks} tasks
                        </Badge>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-200/50 dark:border-gray-700/30">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {meeting.meeting_start
                          ? format(new Date(meeting.meeting_start), 'dd MMM yyyy')
                          : 'No date'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {meeting.owner_email?.split('@')[0]}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pagination Controls */}
      {totalCount > ITEMS_PER_PAGE && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-3 sm:p-4 border border-gray-200/50 dark:border-gray-700/30 shadow-sm w-full overflow-x-auto"
        >
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="gap-1 text-xs sm:text-sm px-2 sm:px-3 flex-shrink-0"
            >
              <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Previous</span>
              <span className="sm:hidden">Prev</span>
            </Button>
            <div className="flex items-center gap-0.5 sm:gap-1">
              {/* Show page numbers */}
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
                      'w-7 h-7 sm:w-9 sm:h-9 text-xs sm:text-sm p-0 flex-shrink-0',
                      currentPage === pageNum && 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    )}
                  >
                    {pageNum}
                  </Button>
                )
              })}
              {totalPages > 5 && currentPage < totalPages - 2 && (
                <>
                  <span className="text-gray-400 px-0.5 sm:px-1 text-xs">...</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    className="w-7 h-7 sm:w-9 sm:h-9 text-xs sm:text-sm p-0 flex-shrink-0"
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
              className="gap-1 text-xs sm:text-sm px-2 sm:px-3 flex-shrink-0"
            >
              <span className="hidden sm:inline">Next</span>
              <span className="sm:hidden">Next</span>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Error State - show when fetch failed but we know meetings exist */}
      {fetchError && meetings.length === 0 && totalCount > 0 && !loading && (
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
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-center max-w-md">
            {fetchError}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-6 text-center">
            You have {totalCount.toLocaleString()} meetings in your account.
          </p>
          <Button
            onClick={() => fetchMeetings()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <RefreshCw className="mr-2 w-4 h-4" />
            Try Again
          </Button>
        </motion.div>
      )}

      {/* No filters results state */}
      {filteredMeetings.length === 0 && meetings.length > 0 && !loading && (
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
          <Button
            onClick={() => {
              setSearchQuery('')
              setDurationBucket('all')
              setSentimentCategory('all')
              setCoachingCategory('all')
              setDatePreset('all')
              setCustomDateRange(null)
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Clear All Filters
          </Button>
        </motion.div>
      )}

      {/* Empty State - only show when no meetings exist at all */}
      {/* IMPORTANT: Don't pass isSyncing when totalCount > 0 - we want to show available meetings */}
      {/* The sync progress banner at top handles sync indication without blocking content */}
      {meetings.length === 0 && totalCount === 0 && !loading && !fetchError && (
        <MeetingsEmptyState
          meetingCount={meetings.length}
          isSyncing={syncState?.sync_status === 'syncing' && totalCount === 0}
        />
      )}

      {/* Waveform animation for voice meeting cards */}
      <style>{`
        @keyframes waveform {
          0% { transform: scaleY(0.5); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  )
}

export default MeetingsList
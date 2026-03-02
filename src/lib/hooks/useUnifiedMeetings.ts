/**
 * useUnifiedMeetings Hook
 *
 * Fetches meetings from both the `meetings` table (Fathom/Fireflies/Voice)
 * and the `recordings` table (60 Notetaker), normalizes them into a unified
 * format, merges them sorted by date, and applies client-side filters.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/clientV2'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useOrg } from '@/lib/contexts/OrgContext'
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration'
import { useRecordings, useBatchVideoUrls, useActiveRecordings, useRecordingsRequiringAttention } from '@/lib/hooks/useRecordings'
import { useDebouncedSearch, filterItems } from '@/lib/hooks/useDebounce'
import { DateRange } from '@/components/ui/DateRangeFilter'
import {
  type UnifiedMeeting,
  type UnifiedSource,
  type MeetingRow,
  meetingToUnified,
  recordingToUnified,
} from '@/lib/types/unifiedMeeting'
import type { RecordingStatus, MeetingPlatform } from '@/lib/types/meetingBaaS'

// ============================================================================
// Types
// ============================================================================

export interface UnifiedMeetingsFilters {
  scope: 'me' | 'team'
  sourceFilter: UnifiedSource | 'all'
  statusFilter: RecordingStatus | 'all'
  platformFilter: MeetingPlatform | 'all'
  sortField: 'title' | 'meeting_start' | 'duration_minutes' | 'sentiment_score' | 'coach_rating'
  sortDirection: 'asc' | 'desc'
  dateRange: DateRange | undefined
  selectedRepId: string | null | undefined
  durationBucket: 'all' | 'short' | 'medium' | 'long'
  sentimentCategory: 'all' | 'positive' | 'neutral' | 'challenging'
  coachingCategory: 'all' | 'excellent' | 'good' | 'needs-work'
}

const ITEMS_PER_PAGE = 30
const MAX_FETCH_PER_SOURCE = 200

// ============================================================================
// Hook
// ============================================================================

export function useUnifiedMeetings(filters: UnifiedMeetingsFilters, currentPage: number) {
  const { user } = useAuth()
  const { activeOrgId } = useOrg()
  const { syncState, isConnected, isSyncing, triggerSync } = useFathomIntegration()

  // Search
  const { searchQuery, debouncedSearchQuery, isSearching, setSearchQuery } = useDebouncedSearch('', 400)

  // Meetings state (from meetings table)
  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  const [meetingsCount, setMeetingsCount] = useState(0)
  const [meetingsLoading, setMeetingsLoading] = useState(true)
  const [meetingsError, setMeetingsError] = useState<string | null>(null)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  // Auto-sync ref
  const autoSyncAttemptedRef = useRef(false)
  // Stable ref for fetchMeetings — used by realtime INSERT handler to avoid dep array churn
  const fetchMeetingsRef = useRef<() => void>(() => {})

  // Skip meetings fetch if source filter is 60_notetaker only
  const shouldFetchMeetings = filters.sourceFilter !== '60_notetaker'
  // Skip recordings fetch if source is fathom/fireflies/voice
  const shouldFetchRecordings = filters.sourceFilter === 'all' || filters.sourceFilter === '60_notetaker'

  // Recordings (from recordings table via useRecordings hook)
  const fetchLimit = Math.min(currentPage * ITEMS_PER_PAGE, MAX_FETCH_PER_SOURCE)
  const { recordings, total: recordingsCount, isLoading: recordingsLoading } = useRecordings(
    shouldFetchRecordings
      ? {
          limit: fetchLimit,
          offset: 0,
          status: filters.statusFilter !== 'all' ? filters.statusFilter : undefined,
        }
      : { limit: 0 }
  )

  // Batch fetch signed video URLs for recordings
  const { data: signedUrls } = useBatchVideoUrls(shouldFetchRecordings ? recordings : [])

  // Active and attention recordings
  const { data: activeRecordings } = useActiveRecordings()
  const { data: attentionRecordings } = useRecordingsRequiringAttention()

  // ========================================================================
  // Fetch meetings from Supabase
  // ========================================================================
  const fetchMeetings = useCallback(async () => {
    if (!user || !shouldFetchMeetings) {
      setMeetings([])
      setMeetingsCount(0)
      setMeetingsLoading(false)
      return
    }

    // Only show skeleton on initial load — background refreshes keep stale data visible
    if (!hasLoadedOnce) {
      setMeetingsLoading(true)
    }
    setMeetingsError(null)
    try {
      // Count query
      const countQueryBase = supabase
        .from('meetings')
        .select('*', { count: 'exact', head: true })
        .neq('source_type', '60_notetaker') as any

      let countQuery = countQueryBase
      if (activeOrgId) {
        countQuery = countQuery.eq('org_id', activeOrgId)
      }
      if (filters.scope === 'me' || !activeOrgId) {
        countQuery = countQuery.or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email}`)
      }

      // Apply source filter to meetings
      if (filters.sourceFilter === 'fathom') {
        countQuery = countQuery.or('provider.is.null,provider.eq.fathom').neq('source_type', 'voice')
      } else if (filters.sourceFilter === 'fireflies') {
        countQuery = countQuery.eq('provider', 'fireflies')
      } else if (filters.sourceFilter === 'voice') {
        countQuery = countQuery.eq('source_type', 'voice')
      }

      const { count } = await countQuery
      setMeetingsCount(count || 0)

      // Data query with overfetch for cross-table pagination
      const limit = Math.min(currentPage * ITEMS_PER_PAGE, MAX_FETCH_PER_SOURCE)

      const queryBase = supabase
        .from('meetings')
        .select(`
          *,
          company:companies!meetings_company_id_fkey(name, domain),
          action_items:meeting_action_items(completed),
          tasks!tasks_meeting_id_fkey(status)
        `)
        .neq('source_type', '60_notetaker')
        .order(filters.sortField === 'title' ? 'title' : filters.sortField, { ascending: filters.sortDirection === 'asc' })
        .range(0, limit - 1) as any

      let query = queryBase
      if (activeOrgId) {
        query = query.eq('org_id', activeOrgId)
      }
      if (filters.scope === 'me' || !activeOrgId) {
        query = query.or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email}`)
      }

      // Source filter
      if (filters.sourceFilter === 'fathom') {
        query = query.or('provider.is.null,provider.eq.fathom').neq('source_type', 'voice')
      } else if (filters.sourceFilter === 'fireflies') {
        query = query.eq('provider', 'fireflies')
      } else if (filters.sourceFilter === 'voice') {
        query = query.eq('source_type', 'voice')
      }

      // Date filter
      if (filters.dateRange) {
        const dateRange = filters.dateRange;
        query = query
          .gte('meeting_start', dateRange.start.toISOString())
          .lte('meeting_start', dateRange.end.toISOString())
      }

      // Rep filter
      if (filters.selectedRepId && filters.scope === 'team') {
        query = query.eq('owner_user_id', filters.selectedRepId)
      }

      const { data, error } = await query

      if (error) throw error

      const meetingsData = (data || []).map((m: any) => ({
        ...m,
        next_actions_count: m.next_actions_count ?? null,
        company: Array.isArray(m.company) ? m.company[0] : m.company,
      })) as MeetingRow[]

      setMeetings(meetingsData)
      if (!hasLoadedOnce) setHasLoadedOnce(true)
    } catch (error: any) {
      console.error('Error fetching meetings:', error)
      setMeetingsError(error?.message || 'Failed to load meetings')
    } finally {
      setMeetingsLoading(false)
    }
  }, [user, activeOrgId, currentPage, filters.scope, filters.sortField, filters.sortDirection, filters.dateRange, filters.selectedRepId, filters.sourceFilter, shouldFetchMeetings, hasLoadedOnce])

  // Keep ref current for realtime handlers (avoids subscription dep churn)
  fetchMeetingsRef.current = fetchMeetings

  // Trigger fetch when deps change
  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

  // ========================================================================
  // Fathom auto-sync (same as MeetingsList)
  // ========================================================================
  useEffect(() => {
    if (autoSyncAttemptedRef.current) return
    if (!isConnected) return

    const shouldAutoSync =
      !meetingsLoading &&
      isConnected &&
      !isSyncing &&
      meetings.length === 0

    if (shouldAutoSync) {
      autoSyncAttemptedRef.current = true
      triggerSync({ sync_type: 'initial', limit: 10 })
        .then(() => fetchMeetings())
        .catch(() => {})
    }
  }, [meetingsLoading, isConnected, isSyncing, meetings.length, triggerSync, fetchMeetings])

  // ========================================================================
  // Real-time subscriptions
  // ========================================================================
  useEffect(() => {
    if (!activeOrgId) return

    // Meetings table realtime
    const meetingsChannel = supabase
      .channel('unified_meeting_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'meetings',
          filter: `org_id=eq.${activeOrgId}`,
        },
        (payload) => {
          const updated = payload.new as any
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
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'meetings',
          filter: `org_id=eq.${activeOrgId}`,
        },
        (payload) => {
          const inserted = payload.new as any
          // 60 Notetaker meetings are shown via the recordings table, skip here
          if (inserted.source_type === '60_notetaker') return
          // Silent refetch — hasLoadedOnce ensures no skeleton flash
          fetchMeetingsRef.current()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(meetingsChannel)
    }
  }, [activeOrgId])

  // ========================================================================
  // Merge, filter, sort, paginate
  // ========================================================================
  const unified = useMemo(() => {
    const meetingItems = shouldFetchMeetings ? meetings.map(meetingToUnified) : []
    const recordingItems = shouldFetchRecordings ? recordings.map(recordingToUnified) : []
    return [...meetingItems, ...recordingItems]
  }, [meetings, recordings, shouldFetchMeetings, shouldFetchRecordings])

  // Client-side filtering
  const filtered = useMemo(() => {
    let items = unified

    // Hide failed 60 Notetaker recordings by default — opt-in via "Failed" status filter
    if (filters.statusFilter === 'all') {
      items = items.filter(
        (item) => item.sourceTable !== 'recordings' || item.status !== 'failed'
      )
    }

    // Search filter
    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase()
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.companyName && item.companyName.toLowerCase().includes(q))
      )
    }

    // Platform filter (recordings only)
    if (filters.platformFilter !== 'all') {
      items = items.filter(
        (item) => item.sourceTable !== 'recordings' || item.platform === filters.platformFilter
      )
    }

    // Duration bucket
    if (filters.durationBucket !== 'all') {
      items = items.filter((item) => {
        const d = item.durationMinutes || 0
        switch (filters.durationBucket) {
          case 'short': return d < 30
          case 'medium': return d >= 30 && d <= 60
          case 'long': return d > 60
          default: return true
        }
      })
    }

    // Sentiment
    if (filters.sentimentCategory !== 'all') {
      items = items.filter((item) => {
        const s = item.sentimentScore
        if (s === null) return false
        switch (filters.sentimentCategory) {
          case 'positive': return s >= 0.25
          case 'neutral': return s > -0.25 && s < 0.25
          case 'challenging': return s <= -0.25
          default: return true
        }
      })
    }

    // Coaching
    if (filters.coachingCategory !== 'all') {
      items = items.filter((item) => {
        const r = item.coachRating
        if (r === null) return false
        switch (filters.coachingCategory) {
          case 'excellent': return r >= 8
          case 'good': return r >= 6 && r < 8
          case 'needs-work': return r < 6
          default: return true
        }
      })
    }

    // Sort
    items.sort((a, b) => {
      let cmp = 0
      switch (filters.sortField) {
        case 'title':
          cmp = (a.title || '').localeCompare(b.title || '')
          break
        case 'meeting_start':
          cmp = new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
          break
        case 'duration_minutes':
          cmp = (a.durationMinutes || 0) - (b.durationMinutes || 0)
          break
        case 'sentiment_score':
          cmp = (a.sentimentScore || 0) - (b.sentimentScore || 0)
          break
        case 'coach_rating':
          cmp = (a.coachRating || 0) - (b.coachRating || 0)
          break
        default:
          cmp = new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
      }
      return filters.sortDirection === 'desc' ? -cmp : cmp
    })

    return items
  }, [unified, debouncedSearchQuery, filters.platformFilter, filters.durationBucket, filters.sentimentCategory, filters.coachingCategory, filters.sortField, filters.sortDirection])

  // Pagination
  const totalCount = useMemo(() => {
    if (filters.sourceFilter === '60_notetaker') return recordingsCount
    if (filters.sourceFilter !== 'all') return meetingsCount
    return meetingsCount + recordingsCount
  }, [meetingsCount, recordingsCount, filters.sourceFilter])

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    const end = start + ITEMS_PER_PAGE
    return filtered.slice(start, end)
  }, [filtered, currentPage])

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)

  // ========================================================================
  // Stats
  // ========================================================================
  const stats = useMemo(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const thisMonth = filtered.filter((m) => new Date(m.date) >= startOfMonth).length

    const validDurations = filtered
      .map((m) => m.durationMinutes || 0)
      .filter((d) => d > 0 && d <= 480)
    const avgDuration =
      validDurations.length > 0
        ? Math.round(validDurations.reduce((a, b) => a + b, 0) / validDurations.length)
        : 0

    const openTasks = filtered.reduce((sum, m) => sum + m.openTaskCount, 0)

    const sentimentScores = filtered
      .filter((m) => m.sentimentScore !== null)
      .map((m) => m.sentimentScore as number)
    const avgSentiment =
      sentimentScores.length > 0
        ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
        : 0

    const coachRatings = filtered
      .filter((m) => m.coachRating !== null)
      .map((m) => m.coachRating as number)
    const avgCoachRating =
      coachRatings.length > 0
        ? Math.round(coachRatings.reduce((a, b) => a + b, 0) / coachRatings.length)
        : 0

    return {
      meetingsThisMonth: thisMonth,
      avgDuration,
      actionItemsOpen: openTasks,
      avgSentiment,
      avgCoachRating,
    }
  }, [filtered])

  return {
    // Data
    items: paginatedItems,
    allFilteredItems: filtered,
    totalCount: filtered.length,
    totalPages,
    stats,
    // Initial load: show skeleton only when we have NO data yet
    isLoading: (meetingsLoading && !hasLoadedOnce) || (recordingsLoading && recordings.length === 0),
    // Background refresh: data is visible, subtle indicator shown
    isRefetching: hasLoadedOnce && meetingsLoading,
    error: meetingsError,

    // Search
    searchQuery,
    setSearchQuery,
    isSearching,
    debouncedSearchQuery,

    // Signed URLs for recording thumbnails
    signedUrls: signedUrls || {},

    // 60 Notetaker features
    activeRecordings: activeRecordings || [],
    attentionRecordings: attentionRecordings || [],

    // Fathom sync
    syncState,
    isSyncing,
    isConnected,
    triggerSync,

    // Refetch
    refetch: fetchMeetings,
  }
}

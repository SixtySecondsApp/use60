import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useOrgStore } from '@/lib/stores/orgStore'
import { toast } from 'sonner'
import {
  adLibraryService,
  AdLibraryAd,
  WatchlistEntry,
  SearchParams,
  SearchResult,
  AdCluster,
  AdTrend,
} from '@/lib/services/adLibraryService'

export function useAdLibrary() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  const orgLoading = useOrgStore((s) => s.isLoading)

  // Ads state
  const [ads, setAds] = useState<AdLibraryAd[]>([])
  const [totalAds, setTotalAds] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchParams, setSearchParams] = useState<SearchParams>({ page: 0, page_size: 20 })

  // Watchlist state
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [watchlistLoading, setWatchlistLoading] = useState(false)

  // Analytics state
  const [clusters, setClusters] = useState<AdCluster[]>([])
  const [clustersLoading, setClustersLoading] = useState(false)
  const [trends, setTrends] = useState<AdTrend[]>([])
  const [trendsLoading, setTrendsLoading] = useState(false)
  const [likelyWinners, setLikelyWinners] = useState<AdLibraryAd[]>([])
  const [winnersLoading, setWinnersLoading] = useState(false)

  // Prevent duplicate initial loads
  const initialLoadDone = useRef(false)

  const ready = isAuthenticated && !!user && !!activeOrgId && !authLoading && !orgLoading

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  const searchAds = useCallback(async (params: SearchParams) => {
    if (!ready) return
    try {
      setLoading(true)
      const merged = { ...params, page: params.page ?? 0, page_size: params.page_size ?? 20 }
      setSearchParams(merged)
      const result: SearchResult = await adLibraryService.searchAds(merged)
      setAds(result.ads)
      setTotalAds(result.total)
    } catch (e: any) {
      console.error('[useAdLibrary] searchAds error:', e)
      toast.error(e.message || 'Failed to search ads')
    } finally {
      setLoading(false)
    }
  }, [ready])

  const loadMore = useCallback(async () => {
    if (!ready || loading) return
    const nextPage = (searchParams.page ?? 0) + 1
    try {
      setLoading(true)
      const merged = { ...searchParams, page: nextPage }
      setSearchParams(merged)
      const result: SearchResult = await adLibraryService.searchAds(merged)
      setAds((prev) => [...prev, ...result.ads])
      setTotalAds(result.total)
    } catch (e: any) {
      console.error('[useAdLibrary] loadMore error:', e)
      toast.error(e.message || 'Failed to load more ads')
    } finally {
      setLoading(false)
    }
  }, [ready, loading, searchParams])

  // ---------------------------------------------------------------------------
  // Watchlist
  // ---------------------------------------------------------------------------

  const fetchWatchlist = useCallback(async () => {
    if (!ready) return
    try {
      setWatchlistLoading(true)
      const entries = await adLibraryService.getWatchlist()
      setWatchlist(entries)
    } catch (e: any) {
      console.error('[useAdLibrary] fetchWatchlist error:', e)
      toast.error(e.message || 'Failed to load watchlist')
    } finally {
      setWatchlistLoading(false)
    }
  }, [ready])

  const addCompetitor = useCallback(async (entry: {
    competitor_name: string
    competitor_linkedin_url?: string
    competitor_website?: string
    capture_frequency?: string
  }) => {
    if (!ready) throw new Error('Not ready')
    try {
      const added = await adLibraryService.addToWatchlist(entry)
      setWatchlist((prev) => [...prev, added])
      toast.success(`Added ${entry.competitor_name} to watchlist`)
      return added
    } catch (e: any) {
      toast.error(e.message || 'Failed to add competitor')
      throw e
    }
  }, [ready])

  const removeCompetitor = useCallback(async (watchlistId: string) => {
    if (!ready) throw new Error('Not ready')
    try {
      await adLibraryService.removeFromWatchlist(watchlistId)
      setWatchlist((prev) => prev.filter((w) => w.id !== watchlistId))
      toast.success('Competitor removed from watchlist')
    } catch (e: any) {
      toast.error(e.message || 'Failed to remove competitor')
      throw e
    }
  }, [ready])

  const captureCompetitor = useCallback(async (competitorName: string, linkedinUrl?: string) => {
    if (!ready) throw new Error('Not ready')
    try {
      const result = await adLibraryService.captureCompetitor(competitorName, linkedinUrl)
      toast.success(`Captured ${result.ads_captured} ads from ${competitorName}`)
      // Refresh ads list after capture
      await searchAds(searchParams)
      return result
    } catch (e: any) {
      toast.error(e.message || 'Failed to capture competitor ads')
      throw e
    }
  }, [ready, searchAds, searchParams])

  // ---------------------------------------------------------------------------
  // Manual ad submission
  // ---------------------------------------------------------------------------

  const submitManualAd = useCallback(async (ad: {
    headline?: string
    body_text?: string
    cta_text?: string
    advertiser: string
    destination_url?: string
    media_type?: string
  }) => {
    if (!ready) throw new Error('Not ready')
    try {
      const created = await adLibraryService.submitManualAd(ad)
      toast.success('Ad submitted successfully')
      // Prepend to current list
      setAds((prev) => [created, ...prev])
      setTotalAds((prev) => prev + 1)
      return created
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit ad')
      throw e
    }
  }, [ready])

  // ---------------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------------

  const fetchClusters = useCallback(async (dimension?: string) => {
    if (!ready) return
    try {
      setClustersLoading(true)
      const result = await adLibraryService.getClusters(dimension)
      setClusters(result)
    } catch (e: any) {
      console.error('[useAdLibrary] fetchClusters error:', e)
      toast.error(e.message || 'Failed to load clusters')
    } finally {
      setClustersLoading(false)
    }
  }, [ready])

  const fetchTrends = useCallback(async (dimension?: string) => {
    if (!ready) return
    try {
      setTrendsLoading(true)
      const result = await adLibraryService.getTrends(dimension)
      setTrends(result)
    } catch (e: any) {
      console.error('[useAdLibrary] fetchTrends error:', e)
      toast.error(e.message || 'Failed to load trends')
    } finally {
      setTrendsLoading(false)
    }
  }, [ready])

  const fetchWinners = useCallback(async () => {
    if (!ready) return
    try {
      setWinnersLoading(true)
      const result = await adLibraryService.getLikelyWinners()
      setLikelyWinners(result)
    } catch (e: any) {
      console.error('[useAdLibrary] fetchWinners error:', e)
      toast.error(e.message || 'Failed to load likely winners')
    } finally {
      setWinnersLoading(false)
    }
  }, [ready])

  // ---------------------------------------------------------------------------
  // Refresh all data
  // ---------------------------------------------------------------------------

  const refreshAll = useCallback(async () => {
    if (!ready) return
    await Promise.all([
      searchAds(searchParams),
      fetchWatchlist(),
      fetchClusters(),
      fetchTrends(),
      fetchWinners(),
    ])
  }, [ready, searchAds, searchParams, fetchWatchlist, fetchClusters, fetchTrends, fetchWinners])

  // ---------------------------------------------------------------------------
  // Initial load when auth + org are ready
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!ready || initialLoadDone.current) return
    initialLoadDone.current = true
    refreshAll()
  }, [ready, refreshAll])

  // Reset when org changes
  useEffect(() => {
    initialLoadDone.current = false
    setAds([])
    setTotalAds(0)
    setWatchlist([])
    setClusters([])
    setTrends([])
    setLikelyWinners([])
    setSearchParams({ page: 0, page_size: 20 })
  }, [activeOrgId])

  return {
    // Ads
    ads,
    loading,
    searchParams,
    totalAds,
    searchAds,
    loadMore,

    // Watchlist
    watchlist,
    watchlistLoading,
    addCompetitor,
    removeCompetitor,
    captureCompetitor,

    // Manual submission
    submitManualAd,

    // Analytics
    clusters,
    clustersLoading,
    fetchClusters,
    trends,
    trendsLoading,
    fetchTrends,
    likelyWinners,
    winnersLoading,

    // Refresh
    refreshAll,
  }
}

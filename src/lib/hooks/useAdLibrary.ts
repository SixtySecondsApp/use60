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
  CompetitorStats,
  AdRemixResult,
  LandingPageData,
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

  // Competitor stats state
  const [competitorStats, setCompetitorStats] = useState<CompetitorStats[]>([])
  const [competitorStatsLoading, setCompetitorStatsLoading] = useState(false)

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

  const searchLinkedIn = useCallback(async (query: string, geography?: string) => {
    if (!ready || !query.trim()) throw new Error('Search query required')
    try {
      const isUrl = query.trim().includes('linkedin.com')
      const isCompanyName = !query.trim().includes(' ') || isUrl

      // For company searches, capture both ads AND organic posts in parallel
      if (isUrl || isCompanyName) {
        const [adsResult, organicResult] = await Promise.allSettled([
          isUrl
            ? adLibraryService.captureCompetitor(query.trim(), query.trim())
            : adLibraryService.captureCompetitor(query.trim()),
          adLibraryService.captureOrganic(query.trim(), isUrl ? query.trim() : undefined),
        ])

        const adsCount = adsResult.status === 'fulfilled' ? adsResult.value.ads_captured : 0
        const organicCount = organicResult.status === 'fulfilled' ? organicResult.value.ads_captured : 0
        const total = adsCount + organicCount

        if (total > 0) {
          toast.success(`Found ${adsCount} ads + ${organicCount} organic posts from LinkedIn`)
        } else {
          toast.info('No new content found on LinkedIn for that search')
        }
      } else {
        // Multi-word = keyword search (ads only)
        const result = await adLibraryService.captureByKeyword(query.trim(), geography)
        if (result.ads_captured > 0) {
          toast.success(`Found ${result.ads_captured} ads from LinkedIn`)
        } else {
          toast.info('No new ads found on LinkedIn for that search')
        }
      }

      // Refresh with the search term as advertiser filter
      await searchAds({
        advertiser_name: isUrl ? undefined : query.trim(),
        geography,
        sort_by: 'longevity',
        sort_order: 'desc',
        page: 0,
        page_size: 20,
      })
      return { ads_captured: 0 } // Return value not used by caller
    } catch (e: any) {
      toast.error(e.message || 'LinkedIn search failed')
      throw e
    }
  }, [ready, searchAds])

  const captureAll = useCallback(async () => {
    if (!ready || watchlist.length === 0) throw new Error('No competitors on watchlist')
    try {
      toast.info(`Capturing ads from ${watchlist.length} competitors... this may take a few minutes`)
      const result = await adLibraryService.captureAll(
        watchlist.map((w) => ({
          competitor_name: w.competitor_name,
          competitor_linkedin_url: w.competitor_linkedin_url,
        }))
      )
      const successes = result.results.filter((r) => !r.error)
      const failures = result.results.filter((r) => r.error)
      if (successes.length > 0) {
        toast.success(`Captured ${result.total_captured} ads from ${successes.length} competitors`)
      }
      if (failures.length > 0) {
        toast.error(`Failed for ${failures.length}: ${failures.map((f) => f.name).join(', ')}`)
      }
      await searchAds(searchParams)
      return result
    } catch (e: any) {
      toast.error(e.message || 'Failed to capture all')
      throw e
    }
  }, [ready, watchlist, searchAds, searchParams])

  // ---------------------------------------------------------------------------
  // Engagement enrichment
  // ---------------------------------------------------------------------------

  const enrichEngagement = useCallback(async (advertiserName?: string) => {
    if (!ready) throw new Error('Not ready')
    try {
      toast.info(advertiserName
        ? `Enriching engagement for ${advertiserName}...`
        : 'Enriching engagement for all advertisers...')
      const result = await adLibraryService.enrichEngagement(advertiserName)
      if (result.matched > 0) {
        toast.success(`Matched engagement data for ${result.matched} ads`)
      } else {
        toast.info('No engagement matches found — posts may differ from ad copy')
      }
      await searchAds(searchParams)
      return result
    } catch (e: any) {
      toast.error(e.message || 'Failed to enrich engagement')
      throw e
    }
  }, [ready, searchAds, searchParams])

  // ---------------------------------------------------------------------------
  // AI Remix
  // ---------------------------------------------------------------------------

  const remixAd = useCallback(async (adId: string): Promise<AdRemixResult> => {
    if (!ready) throw new Error('Not ready')
    try {
      const result = await adLibraryService.remixAd(adId)
      toast.success('Ad remix generated!')
      return result
    } catch (e: any) {
      toast.error(e.message || 'Failed to remix ad')
      throw e
    }
  }, [ready])

  // ---------------------------------------------------------------------------
  // Landing page capture
  // ---------------------------------------------------------------------------

  const captureLandingPage = useCallback(async (adId: string): Promise<LandingPageData> => {
    if (!ready) throw new Error('Not ready')
    try {
      const result = await adLibraryService.captureLandingPage(adId)
      toast.success('Landing page captured!')
      // Update the ad in local state
      setAds((prev) => prev.map((a) => a.id === adId ? { ...a, landing_page: result } : a))
      return result
    } catch (e: any) {
      toast.error(e.message || 'Failed to capture landing page')
      throw e
    }
  }, [ready])

  // ---------------------------------------------------------------------------
  // Save / unsave ads
  // ---------------------------------------------------------------------------

  const saveAd = useCallback(async (adId: string) => {
    if (!ready) throw new Error('Not ready')
    try {
      await adLibraryService.saveAd(adId)
      setAds((prev) => prev.map((a) => a.id === adId ? { ...a, is_saved: true } : a))
      toast.success('Ad saved')
    } catch (e: any) {
      toast.error(e.message || 'Failed to save ad')
      throw e
    }
  }, [ready])

  const unsaveAd = useCallback(async (adId: string) => {
    if (!ready) throw new Error('Not ready')
    try {
      await adLibraryService.unsaveAd(adId)
      setAds((prev) => prev.map((a) => a.id === adId ? { ...a, is_saved: false } : a))
      toast.success('Ad removed from saved')
    } catch (e: any) {
      toast.error(e.message || 'Failed to unsave ad')
      throw e
    }
  }, [ready])

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

  const fetchCompetitorStats = useCallback(async () => {
    if (!ready) return
    try {
      setCompetitorStatsLoading(true)
      const stats = await adLibraryService.getCompetitorStats()
      setCompetitorStats(stats)
    } catch (e: any) {
      console.error('[useAdLibrary] fetchCompetitorStats error:', e)
      toast.error(e.message || 'Failed to load competitor stats')
    } finally {
      setCompetitorStatsLoading(false)
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
      fetchCompetitorStats(),
    ])
  }, [ready, searchAds, searchParams, fetchWatchlist, fetchClusters, fetchTrends, fetchWinners, fetchCompetitorStats])

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
    setCompetitorStats([])
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
    captureAll,
    searchLinkedIn,

    // Save / unsave
    saveAd,
    unsaveAd,

    // Engagement
    enrichEngagement,

    // AI Remix + Landing page
    remixAd,
    captureLandingPage,

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
    fetchWinners,

    // Competitor stats
    competitorStats,
    competitorStatsLoading,
    fetchCompetitorStats,

    // Refresh
    refreshAll,
  }
}

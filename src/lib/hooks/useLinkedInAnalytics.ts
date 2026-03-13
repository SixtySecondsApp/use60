import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useOrgStore } from '@/lib/stores/orgStore'
import {
  linkedinAnalyticsService,
  type CampaignSummary,
  type CampaignMetric,
  type DemographicMetric,
  type AnalyticsOverview,
  type SyncRun,
} from '@/lib/services/linkedinAnalyticsService'

function defaultDateRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export function useLinkedInAnalytics() {
  const { user, isAuthenticated } = useAuth()
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  const ready = isAuthenticated && !!user && !!activeOrgId
  const initialLoadDone = useRef(false)

  // State
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [metrics, setMetrics] = useState<CampaignMetric[]>([])
  const [demographics, setDemographics] = useState<DemographicMetric[]>([])
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [syncHistory, setSyncHistory] = useState<SyncRun[]>([])

  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const [dateRange, setDateRangeState] = useState(defaultDateRange)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [selectedPivotType, setSelectedPivotType] = useState('SENIORITY')

  // ---------------------------------------------------------------
  // Campaigns (summaries with pipeline overlay)
  // ---------------------------------------------------------------

  const fetchCampaigns = useCallback(async () => {
    if (!ready || !activeOrgId) return
    try {
      setLoading(true)
      const data = await linkedinAnalyticsService.getCampaignSummaries(
        activeOrgId,
        dateRange.from,
        dateRange.to
      )
      setCampaigns(data)
    } catch (e: any) {
      console.error('[useLinkedInAnalytics] fetchCampaigns error:', e)
      toast.error(e.message || 'Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [ready, activeOrgId, dateRange])

  // ---------------------------------------------------------------
  // Metrics (time-series for a single campaign)
  // ---------------------------------------------------------------

  const fetchMetrics = useCallback(async (campaignId: string) => {
    if (!ready || !activeOrgId) return
    try {
      setLoading(true)
      setSelectedCampaignId(campaignId)
      // We need an ad account id — derive from campaign summaries or pass empty to get all
      const { data, error } = await (await import('@/lib/supabase/clientV2')).supabase
        .from('linkedin_campaign_metrics')
        .select(
          'id, campaign_id, campaign_name, campaign_group_name, campaign_status, campaign_type, ' +
          'date, impressions, clicks, spend, currency, leads, conversions, video_views, ' +
          'likes, comments, shares, total_engagements, ctr, cpm, cpc, cpl'
        )
        .eq('org_id', activeOrgId)
        .eq('campaign_id', campaignId)
        .gte('date', dateRange.from)
        .lte('date', dateRange.to)
        .order('date', { ascending: true })

      if (error) throw new Error(error.message)
      setMetrics((data ?? []) as CampaignMetric[])
    } catch (e: any) {
      console.error('[useLinkedInAnalytics] fetchMetrics error:', e)
      toast.error(e.message || 'Failed to load campaign metrics')
    } finally {
      setLoading(false)
    }
  }, [ready, activeOrgId, dateRange])

  // ---------------------------------------------------------------
  // Demographics
  // ---------------------------------------------------------------

  const fetchDemographics = useCallback(async (campaignId?: string, pivotType?: string) => {
    if (!ready || !activeOrgId) return
    try {
      setLoading(true)
      const pivot = pivotType ?? selectedPivotType
      if (pivotType) setSelectedPivotType(pivotType)
      const data = await linkedinAnalyticsService.getDemographics(
        activeOrgId,
        campaignId ?? selectedCampaignId ?? undefined,
        dateRange.from,
        dateRange.to,
        pivot
      )
      setDemographics(data)
    } catch (e: any) {
      console.error('[useLinkedInAnalytics] fetchDemographics error:', e)
      toast.error(e.message || 'Failed to load demographics')
    } finally {
      setLoading(false)
    }
  }, [ready, activeOrgId, dateRange, selectedCampaignId, selectedPivotType])

  // ---------------------------------------------------------------
  // Overview
  // ---------------------------------------------------------------

  const fetchOverview = useCallback(async () => {
    if (!ready || !activeOrgId) return
    try {
      const data = await linkedinAnalyticsService.getOverview(
        activeOrgId,
        dateRange.from,
        dateRange.to
      )
      setOverview(data)
    } catch (e: any) {
      console.error('[useLinkedInAnalytics] fetchOverview error:', e)
      toast.error(e.message || 'Failed to load overview')
    }
  }, [ready, activeOrgId, dateRange])

  // ---------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------

  const triggerSync = useCallback(async () => {
    if (!ready || !activeOrgId) return
    try {
      setSyncing(true)
      await linkedinAnalyticsService.triggerSync(activeOrgId)
      toast.success('LinkedIn analytics sync started')
      // Refresh data after sync trigger
      await Promise.all([fetchOverview(), fetchCampaigns()])
      await fetchSyncHistory()
    } catch (e: any) {
      console.error('[useLinkedInAnalytics] triggerSync error:', e)
      toast.error(e.message || 'Failed to trigger sync')
    } finally {
      setSyncing(false)
    }
  }, [ready, activeOrgId])

  // ---------------------------------------------------------------
  // Sync history
  // ---------------------------------------------------------------

  const fetchSyncHistory = useCallback(async () => {
    if (!ready || !activeOrgId) return
    try {
      const data = await linkedinAnalyticsService.getSyncHistory(activeOrgId)
      setSyncHistory(data)
    } catch (e: any) {
      console.error('[useLinkedInAnalytics] fetchSyncHistory error:', e)
      toast.error(e.message || 'Failed to load sync history')
    }
  }, [ready, activeOrgId])

  // ---------------------------------------------------------------
  // Date range
  // ---------------------------------------------------------------

  const setDateRange = useCallback((from: string, to: string) => {
    setDateRangeState({ from, to })
  }, [])

  // Refetch when date range changes (after initial load)
  useEffect(() => {
    if (!ready || !initialLoadDone.current) return
    fetchOverview()
    fetchCampaigns()
  }, [dateRange]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------

  const exportCsv = useCallback(async (type: 'metrics' | 'summaries' | 'demographics') => {
    if (!ready || !activeOrgId) return
    try {
      await linkedinAnalyticsService.exportCsv(activeOrgId, dateRange.from, dateRange.to, type)
      toast.success('CSV exported')
    } catch (e: any) {
      toast.error(e.message || 'Failed to export CSV')
    }
  }, [ready, activeOrgId, dateRange])

  // ---------------------------------------------------------------
  // Initial load
  // ---------------------------------------------------------------

  useEffect(() => {
    if (!ready || initialLoadDone.current) return
    initialLoadDone.current = true
    Promise.all([fetchOverview(), fetchCampaigns()])
  }, [ready, fetchOverview, fetchCampaigns])

  // Reset on org change
  useEffect(() => {
    initialLoadDone.current = false
    setCampaigns([])
    setMetrics([])
    setDemographics([])
    setOverview(null)
    setSyncHistory([])
    setSelectedCampaignId(null)
    setSelectedPivotType('SENIORITY')
    setDateRangeState(defaultDateRange())
  }, [activeOrgId])

  return {
    // Data
    campaigns,
    metrics,
    demographics,
    overview,
    syncHistory,

    // Loading
    loading,
    syncing,

    // Selection
    dateRange,
    selectedCampaignId,
    selectedPivotType,

    // Actions
    fetchCampaigns,
    fetchMetrics,
    fetchDemographics,
    fetchOverview,
    triggerSync,
    fetchSyncHistory,
    setDateRange,
    exportCsv,

    // General
    ready,
  }
}

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { toast } from 'sonner'
import {
  BarChart3, TrendingUp, DollarSign, MousePointerClick, Users, Eye,
  RefreshCw, Download, ArrowUpDown, ChevronDown, Activity, Target,
  Calendar, Building2, Briefcase, Globe, Loader2, AlertTriangle,
  CheckCircle2, Clock, XCircle, Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { supabase } from '@/lib/supabase/clientV2'
import { useOrgStore } from '@/lib/stores/orgStore'
import { useAuth } from '@/lib/contexts/AuthContext'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignSummary {
  campaign_id: string
  campaign_name: string
  campaign_group_name: string | null
  campaign_status: string
  campaign_type: string | null
  currency: string
  total_impressions: number
  total_clicks: number
  total_spend: number
  total_leads: number
  total_conversions: number
  total_engagements: number
  avg_ctr: number
  avg_cpc: number
  avg_cpm: number
  avg_cpl: number
  pipeline_leads: number
  pipeline_meetings: number
  pipeline_deals: number
  pipeline_won_deals: number
  pipeline_revenue: number
  pipeline_proposals: number
  cost_per_meeting: number | null
  cost_per_deal: number | null
  roas: number | null
  first_date: string
  last_date: string
}

interface DemographicMetric {
  pivot_type: string
  pivot_value: string
  impressions: number
  clicks: number
  spend: number
  leads: number
  conversions: number
  total_engagements: number
}

interface SyncRun {
  id: string
  sync_type: string
  date_range_start: string
  date_range_end: string
  campaigns_synced: number
  metrics_upserted: number
  demographics_upserted: number
  status: string
  error_message: string | null
  started_at: string
  completed_at: string | null
}

interface DailyMetric {
  date: string
  impressions: number
  clicks: number
  spend: number
  leads: number
  ctr: number
  cpc: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
] as const

const PIVOT_TYPES = [
  { value: 'SENIORITY', label: 'Seniority', icon: Briefcase },
  { value: 'JOB_FUNCTION', label: 'Job Function', icon: Users },
  { value: 'INDUSTRY', label: 'Industry', icon: Building2 },
  { value: 'COMPANY_SIZE', label: 'Company Size', icon: Building2 },
  { value: 'GEOGRAPHY', label: 'Geography', icon: Globe },
  { value: 'JOB_TITLE', label: 'Job Title', icon: Briefcase },
] as const

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-500/10 text-green-400 border-green-500/20',
  PAUSED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  COMPLETED: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  DRAFT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  ARCHIVED: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
}

const SYNC_STATUS_COLORS: Record<string, string> = {
  complete: 'bg-green-500/10 text-green-400 border-green-500/20',
  running: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
}

type SortField = 'total_spend' | 'total_impressions' | 'total_clicks' | 'total_leads' | 'avg_ctr' | 'avg_cpc' | 'avg_cpl' | 'pipeline_revenue' | 'roas'
type SortDir = 'asc' | 'desc'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(val: number | null, currency = 'USD'): string {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val)
}

function formatNumber(val: number | null): string {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US').format(val)
}

function formatPercent(val: number | null): string {
  if (val == null) return '—'
  return `${val.toFixed(2)}%`
}

function formatDecimal(val: number | null, currency = 'USD'): string {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function LinkedInAnalyticsPage() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  const { isAuthenticated, user, loading: authLoading } = useAuth()
  const orgLoading = useOrgStore((s) => s.loading)

  const [activeTab, setActiveTab] = useState('performance')
  const [datePreset, setDatePreset] = useState(30)
  const [dateFrom, setDateFrom] = useState(daysAgo(30))
  const [dateTo, setDateTo] = useState(today())

  // Campaign performance state
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [sortField, setSortField] = useState<SortField>('total_spend')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Demographics state
  const [demographics, setDemographics] = useState<DemographicMetric[]>([])
  const [loadingDemographics, setLoadingDemographics] = useState(false)
  const [pivotType, setPivotType] = useState('SENIORITY')

  // Sync state
  const [syncHistory, setSyncHistory] = useState<SyncRun[]>([])
  const [loadingSyncHistory, setLoadingSyncHistory] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Detail panel
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignSummary | null>(null)
  const [campaignMetrics, setCampaignMetrics] = useState<DailyMetric[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  const initialLoadDone = useRef(false)

  const ready = isAuthenticated && user && activeOrgId && !authLoading && !orgLoading

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchCampaigns = useCallback(async () => {
    if (!activeOrgId) return
    try {
      setLoadingCampaigns(true)
      const { data, error } = await supabase
        .from('linkedin_analytics_with_pipeline')
        .select('campaign_id, campaign_name, campaign_group_name, campaign_status, campaign_type, currency, total_impressions, total_clicks, total_spend, total_leads, total_conversions, total_engagements, avg_ctr, avg_cpc, avg_cpm, avg_cpl, pipeline_leads, pipeline_meetings, pipeline_deals, pipeline_won_deals, pipeline_revenue, pipeline_proposals, cost_per_meeting, cost_per_deal, roas, first_date, last_date')
        .eq('org_id', activeOrgId)

      if (error) throw error
      setCampaigns((data ?? []) as CampaignSummary[])
    } catch (e: any) {
      toast.error(e.message || 'Failed to load campaigns')
    } finally {
      setLoadingCampaigns(false)
    }
  }, [activeOrgId])

  const fetchDemographics = useCallback(async (pivot?: string) => {
    if (!activeOrgId) return
    const pt = pivot ?? pivotType
    try {
      setLoadingDemographics(true)
      const { data, error } = await supabase
        .from('linkedin_demographic_metrics')
        .select('pivot_type, pivot_value, impressions, clicks, spend, leads, conversions, total_engagements')
        .eq('org_id', activeOrgId)
        .eq('pivot_type', pt)
        .gte('date', dateFrom)
        .lte('date', dateTo)

      if (error) throw error

      // Aggregate by pivot_value across dates
      const agg = new Map<string, DemographicMetric>()
      for (const row of data ?? []) {
        const existing = agg.get(row.pivot_value)
        if (existing) {
          existing.impressions += row.impressions
          existing.clicks += row.clicks
          existing.spend += Number(row.spend)
          existing.leads += row.leads
          existing.conversions += row.conversions
          existing.total_engagements += row.total_engagements
        } else {
          agg.set(row.pivot_value, { ...row, spend: Number(row.spend) })
        }
      }
      setDemographics(Array.from(agg.values()).sort((a, b) => b.impressions - a.impressions))
    } catch (e: any) {
      toast.error(e.message || 'Failed to load demographics')
    } finally {
      setLoadingDemographics(false)
    }
  }, [activeOrgId, pivotType, dateFrom, dateTo])

  const fetchSyncHistory = useCallback(async () => {
    if (!activeOrgId) return
    try {
      setLoadingSyncHistory(true)
      const { data, error } = await supabase
        .from('linkedin_analytics_sync_runs')
        .select('id, sync_type, date_range_start, date_range_end, campaigns_synced, metrics_upserted, demographics_upserted, status, error_message, started_at, completed_at')
        .eq('org_id', activeOrgId)
        .order('started_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setSyncHistory((data ?? []) as SyncRun[])
    } catch (e: any) {
      toast.error(e.message || 'Failed to load sync history')
    } finally {
      setLoadingSyncHistory(false)
    }
  }, [activeOrgId])

  const fetchCampaignDetail = useCallback(async (campaignId: string) => {
    if (!activeOrgId) return
    try {
      setLoadingDetail(true)
      const { data, error } = await supabase
        .from('linkedin_campaign_metrics')
        .select('date, impressions, clicks, spend, leads, ctr, cpc')
        .eq('org_id', activeOrgId)
        .eq('campaign_id', campaignId)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: true })

      if (error) throw error
      setCampaignMetrics((data ?? []).map((d: any) => ({
        ...d,
        spend: Number(d.spend),
        ctr: Number(d.ctr),
        cpc: Number(d.cpc),
      })))
    } catch (e: any) {
      toast.error(e.message || 'Failed to load campaign details')
    } finally {
      setLoadingDetail(false)
    }
  }, [activeOrgId, dateFrom, dateTo])

  const triggerSync = useCallback(async () => {
    if (!activeOrgId) return
    try {
      setSyncing(true)
      const { error } = await supabase.functions.invoke('linkedin-analytics-sync', {
        body: { action: 'sync', org_id: activeOrgId },
      })
      if (error) throw error
      toast.success('Sync started')
      setTimeout(() => {
        fetchSyncHistory()
        fetchCampaigns()
      }, 3000)
    } catch (e: any) {
      toast.error(e.message || 'Failed to start sync')
    } finally {
      setSyncing(false)
    }
  }, [activeOrgId, fetchSyncHistory, fetchCampaigns])

  // -------------------------------------------------------------------------
  // CSV Export
  // -------------------------------------------------------------------------

  const exportCsv = useCallback((type: 'campaigns' | 'demographics') => {
    let csv = ''
    if (type === 'campaigns') {
      csv = 'Campaign,Status,Impressions,Clicks,Spend,CTR,CPC,CPM,CPL,Leads,Meetings,Deals,Won,Revenue,ROAS\n'
      for (const c of filteredCampaigns) {
        csv += `"${c.campaign_name}",${c.campaign_status},${c.total_impressions},${c.total_clicks},${c.total_spend},${c.avg_ctr},${c.avg_cpc},${c.avg_cpm},${c.avg_cpl},${c.pipeline_leads},${c.pipeline_meetings},${c.pipeline_deals},${c.pipeline_won_deals},${c.pipeline_revenue},${c.roas ?? ''}\n`
      }
    } else {
      csv = 'Segment,Impressions,Clicks,Spend,Leads,Conversions,Engagements\n'
      for (const d of demographics) {
        csv += `"${d.pivot_value}",${d.impressions},${d.clicks},${d.spend},${d.leads},${d.conversions},${d.total_engagements}\n`
      }
    }
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `linkedin-${type}-${dateFrom}-to-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }, [demographics, dateFrom, dateTo])

  // -------------------------------------------------------------------------
  // Initial load
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!ready || initialLoadDone.current) return
    initialLoadDone.current = true
    fetchCampaigns()
    fetchSyncHistory()
  }, [ready, fetchCampaigns, fetchSyncHistory])

  useEffect(() => {
    initialLoadDone.current = false
    setCampaigns([])
    setDemographics([])
    setSyncHistory([])
  }, [activeOrgId])

  // -------------------------------------------------------------------------
  // Date preset handler
  // -------------------------------------------------------------------------

  const handleDatePreset = useCallback((days: number) => {
    setDatePreset(days)
    setDateFrom(daysAgo(days))
    setDateTo(today())
  }, [])

  useEffect(() => {
    if (ready && initialLoadDone.current) {
      fetchCampaigns()
    }
  }, [dateFrom, dateTo])

  // -------------------------------------------------------------------------
  // Sorting, filtering, derived data
  // -------------------------------------------------------------------------

  const filteredCampaigns = useMemo(() => {
    let list = [...campaigns]
    if (statusFilter !== 'all') {
      list = list.filter((c) => c.campaign_status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((c) =>
        c.campaign_name?.toLowerCase().includes(q) ||
        c.campaign_group_name?.toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      const aVal = a[sortField] ?? 0
      const bVal = b[sortField] ?? 0
      return sortDir === 'desc' ? Number(bVal) - Number(aVal) : Number(aVal) - Number(bVal)
    })
    return list
  }, [campaigns, statusFilter, searchQuery, sortField, sortDir])

  const overview = useMemo(() => {
    const totals = campaigns.reduce(
      (acc, c) => ({
        spend: acc.spend + Number(c.total_spend),
        impressions: acc.impressions + Number(c.total_impressions),
        clicks: acc.clicks + Number(c.total_clicks),
        leads: acc.leads + Number(c.total_leads),
        meetings: acc.meetings + Number(c.pipeline_meetings),
        deals: acc.deals + Number(c.pipeline_deals),
        wonDeals: acc.wonDeals + Number(c.pipeline_won_deals),
        revenue: acc.revenue + Number(c.pipeline_revenue),
      }),
      { spend: 0, impressions: 0, clicks: 0, leads: 0, meetings: 0, deals: 0, wonDeals: 0, revenue: 0 }
    )
    return {
      ...totals,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
      cpl: totals.leads > 0 ? totals.spend / totals.leads : 0,
      roas: totals.spend > 0 && totals.revenue > 0 ? totals.revenue / totals.spend : null,
      costPerMeeting: totals.meetings > 0 ? totals.spend / totals.meetings : null,
      costPerDeal: totals.wonDeals > 0 ? totals.spend / totals.wonDeals : null,
    }
  }, [campaigns])

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }, [sortField])

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!ready) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <>
      <Helmet><title>LinkedIn Analytics | 60</title></Helmet>
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">LinkedIn Ad Analytics</h1>
            <p className="text-sm text-zinc-400 mt-1">Campaign performance with pipeline revenue overlay</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Date presets */}
            <div className="flex items-center gap-1 bg-zinc-800/60 rounded-lg p-1">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => handleDatePreset(p.days)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    datePreset === p.days
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCsv(activeTab === 'demographics' ? 'demographics' : 'campaigns')}
              className="border-zinc-700"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
            <Button
              size="sm"
              onClick={triggerSync}
              disabled={syncing}
            >
              {syncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Sync Now
            </Button>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatCard icon={DollarSign} label="Total Spend" value={formatCurrency(overview.spend)} />
          <StatCard icon={Eye} label="Impressions" value={formatNumber(overview.impressions)} />
          <StatCard icon={MousePointerClick} label="Clicks" value={formatNumber(overview.clicks)} />
          <StatCard icon={TrendingUp} label="CTR" value={formatPercent(overview.ctr)} />
          <StatCard icon={Target} label="Leads" value={formatNumber(overview.leads)} />
          <StatCard icon={Calendar} label="Meetings" value={formatNumber(overview.meetings)} />
          <StatCard icon={Activity} label="Won Deals" value={formatNumber(overview.wonDeals)} />
          <StatCard icon={DollarSign} label="Revenue" value={formatCurrency(overview.revenue)} accent />
        </div>

        {/* Derived Metrics */}
        {(overview.roas != null || overview.costPerMeeting != null) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Avg CPC" value={formatDecimal(overview.cpc)} />
            <MetricCard label="Avg CPL" value={formatDecimal(overview.cpl)} />
            <MetricCard label="Cost / Meeting" value={overview.costPerMeeting ? formatDecimal(overview.costPerMeeting) : '—'} />
            <MetricCard
              label="ROAS"
              value={overview.roas ? `${overview.roas.toFixed(1)}x` : '—'}
              accent={overview.roas != null && overview.roas > 1}
            />
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-zinc-800/60">
            <TabsTrigger value="performance">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger
              value="demographics"
              onClick={() => { if (demographics.length === 0) fetchDemographics() }}
            >
              <Users className="h-4 w-4 mr-1.5" />
              Demographics
            </TabsTrigger>
            <TabsTrigger value="sync">
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Sync History
            </TabsTrigger>
          </TabsList>

          {/* ---- Performance Tab ---- */}
          <TabsContent value="performance" className="space-y-4 mt-4">
            {/* Filters */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Search campaigns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-zinc-900/60 border-zinc-800"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 bg-zinc-900/60 border-zinc-800">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="PAUSED">Paused</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-zinc-500">{filteredCampaigns.length} campaigns</span>
            </div>

            {/* Campaign Table */}
            {loadingCampaigns ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <Card className="border-zinc-800/60 bg-zinc-900/60">
                <CardContent className="py-16 text-center">
                  <BarChart3 className="h-12 w-12 mx-auto text-zinc-600 mb-3" />
                  <p className="text-zinc-400">No campaign data yet</p>
                  <p className="text-sm text-zinc-500 mt-1">Connect your LinkedIn ad account and sync to see metrics</p>
                  <Button size="sm" className="mt-4" onClick={triggerSync} disabled={syncing}>
                    {syncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                    Sync Now
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="border border-zinc-800/60 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800/60 bg-zinc-900/40">
                        <th className="text-left p-3 text-zinc-400 font-medium">Campaign</th>
                        <th className="text-left p-3 text-zinc-400 font-medium">Status</th>
                        <SortHeader field="total_spend" label="Spend" current={sortField} dir={sortDir} onSort={toggleSort} />
                        <SortHeader field="total_impressions" label="Impr." current={sortField} dir={sortDir} onSort={toggleSort} />
                        <SortHeader field="total_clicks" label="Clicks" current={sortField} dir={sortDir} onSort={toggleSort} />
                        <SortHeader field="avg_ctr" label="CTR" current={sortField} dir={sortDir} onSort={toggleSort} />
                        <SortHeader field="avg_cpc" label="CPC" current={sortField} dir={sortDir} onSort={toggleSort} />
                        <SortHeader field="total_leads" label="Leads" current={sortField} dir={sortDir} onSort={toggleSort} />
                        <SortHeader field="avg_cpl" label="CPL" current={sortField} dir={sortDir} onSort={toggleSort} />
                        <SortHeader field="pipeline_revenue" label="Revenue" current={sortField} dir={sortDir} onSort={toggleSort} />
                        <SortHeader field="roas" label="ROAS" current={sortField} dir={sortDir} onSort={toggleSort} />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCampaigns.map((c) => (
                        <tr
                          key={c.campaign_id}
                          className="border-b border-zinc-800/40 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                          onClick={() => {
                            setSelectedCampaign(c)
                            fetchCampaignDetail(c.campaign_id)
                          }}
                        >
                          <td className="p-3">
                            <div className="font-medium text-zinc-200 max-w-[200px] truncate">{c.campaign_name || 'Unnamed'}</div>
                            {c.campaign_group_name && (
                              <div className="text-xs text-zinc-500 truncate max-w-[200px]">{c.campaign_group_name}</div>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className={STATUS_COLORS[c.campaign_status] ?? 'text-zinc-400'}>
                              {c.campaign_status}
                            </Badge>
                          </td>
                          <td className="p-3 text-zinc-300 font-mono text-right">{formatCurrency(c.total_spend, c.currency)}</td>
                          <td className="p-3 text-zinc-400 text-right">{formatNumber(c.total_impressions)}</td>
                          <td className="p-3 text-zinc-400 text-right">{formatNumber(c.total_clicks)}</td>
                          <td className="p-3 text-zinc-400 text-right">{formatPercent(c.avg_ctr)}</td>
                          <td className="p-3 text-zinc-400 text-right">{formatDecimal(c.avg_cpc, c.currency)}</td>
                          <td className="p-3 text-zinc-300 text-right">{formatNumber(c.total_leads)}</td>
                          <td className="p-3 text-zinc-400 text-right">{formatDecimal(c.avg_cpl, c.currency)}</td>
                          <td className="p-3 text-right">
                            <span className={c.pipeline_revenue > 0 ? 'text-green-400 font-medium' : 'text-zinc-500'}>
                              {c.pipeline_revenue > 0 ? formatCurrency(c.pipeline_revenue, c.currency) : '—'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {c.roas != null ? (
                              <span className={c.roas >= 1 ? 'text-green-400 font-medium' : 'text-amber-400'}>
                                {c.roas.toFixed(1)}x
                              </span>
                            ) : (
                              <span className="text-zinc-500">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pipeline Overlay Summary */}
            {campaigns.length > 0 && (overview.meetings > 0 || overview.wonDeals > 0) && (
              <Card className="border-zinc-800/60 bg-zinc-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400">Pipeline Attribution Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    <PipelineStat label="LinkedIn Leads" value={overview.leads} />
                    <PipelineStat label="Meetings Booked" value={overview.meetings} />
                    <PipelineStat label="Deals Created" value={overview.deals} />
                    <PipelineStat label="Deals Won" value={overview.wonDeals} />
                    <PipelineStat label="Revenue" value={formatCurrency(overview.revenue)} isText />
                    <PipelineStat label="Cost / Deal" value={overview.costPerDeal ? formatDecimal(overview.costPerDeal) : '—'} isText />
                  </div>
                  <p className="text-xs text-zinc-600 mt-3">
                    Attribution based on LinkedIn-sourced contacts matched to downstream pipeline events in 60. Last-touch attribution by source channel.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ---- Demographics Tab ---- */}
          <TabsContent value="demographics" className="space-y-4 mt-4">
            <div className="flex items-center gap-3">
              <Select value={pivotType} onValueChange={(v) => { setPivotType(v); fetchDemographics(v) }}>
                <SelectTrigger className="w-48 bg-zinc-900/60 border-zinc-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIVOT_TYPES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-zinc-500">{demographics.length} segments</span>
            </div>

            {loadingDemographics ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : demographics.length === 0 ? (
              <Card className="border-zinc-800/60 bg-zinc-900/60">
                <CardContent className="py-16 text-center">
                  <Users className="h-12 w-12 mx-auto text-zinc-600 mb-3" />
                  <p className="text-zinc-400">No demographic data available</p>
                  <p className="text-sm text-zinc-500 mt-1">Demographic data requires minimum 3 events and is delayed 12-24 hours from LinkedIn</p>
                </CardContent>
              </Card>
            ) : (
              <div className="border border-zinc-800/60 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 bg-zinc-900/40">
                      <th className="text-left p-3 text-zinc-400 font-medium">Segment</th>
                      <th className="text-right p-3 text-zinc-400 font-medium">Impressions</th>
                      <th className="text-right p-3 text-zinc-400 font-medium">Clicks</th>
                      <th className="text-right p-3 text-zinc-400 font-medium">CTR</th>
                      <th className="text-right p-3 text-zinc-400 font-medium">Spend</th>
                      <th className="text-right p-3 text-zinc-400 font-medium">Leads</th>
                      <th className="text-right p-3 text-zinc-400 font-medium">CPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demographics.map((d, i) => {
                      const ctr = d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0
                      const cpc = d.clicks > 0 ? d.spend / d.clicks : 0
                      return (
                        <tr key={`${d.pivot_value}-${i}`} className="border-b border-zinc-800/40">
                          <td className="p-3">
                            <span className="text-zinc-200">{d.pivot_value}</span>
                            {i < 3 && <Badge variant="outline" className="ml-2 text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">Top</Badge>}
                          </td>
                          <td className="p-3 text-zinc-400 text-right">{formatNumber(d.impressions)}</td>
                          <td className="p-3 text-zinc-400 text-right">{formatNumber(d.clicks)}</td>
                          <td className="p-3 text-zinc-400 text-right">{formatPercent(ctr)}</td>
                          <td className="p-3 text-zinc-300 font-mono text-right">{formatDecimal(d.spend)}</td>
                          <td className="p-3 text-zinc-300 text-right">{formatNumber(d.leads)}</td>
                          <td className="p-3 text-zinc-400 text-right">{formatDecimal(cpc)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-zinc-600">
              LinkedIn demographic data is approximate and privacy-protected. Minimum 3 events required. Top 100 values per creative per day.
            </p>
          </TabsContent>

          {/* ---- Sync History Tab ---- */}
          <TabsContent value="sync" className="space-y-4 mt-4">
            {loadingSyncHistory ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : syncHistory.length === 0 ? (
              <Card className="border-zinc-800/60 bg-zinc-900/60">
                <CardContent className="py-16 text-center">
                  <RefreshCw className="h-12 w-12 mx-auto text-zinc-600 mb-3" />
                  <p className="text-zinc-400">No sync runs yet</p>
                  <p className="text-sm text-zinc-500 mt-1">Click "Sync Now" to pull campaign data from LinkedIn</p>
                </CardContent>
              </Card>
            ) : (
              <div className="border border-zinc-800/60 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 bg-zinc-900/40">
                      <th className="text-left p-3 text-zinc-400 font-medium">Status</th>
                      <th className="text-left p-3 text-zinc-400 font-medium">Type</th>
                      <th className="text-left p-3 text-zinc-400 font-medium">Date Range</th>
                      <th className="text-right p-3 text-zinc-400 font-medium">Campaigns</th>
                      <th className="text-right p-3 text-zinc-400 font-medium">Metrics</th>
                      <th className="text-left p-3 text-zinc-400 font-medium">Started</th>
                      <th className="text-left p-3 text-zinc-400 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncHistory.map((s) => {
                      const duration = s.completed_at && s.started_at
                        ? Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000)
                        : null
                      const StatusIcon = s.status === 'complete' ? CheckCircle2 : s.status === 'running' ? Loader2 : XCircle
                      return (
                        <tr key={s.id} className="border-b border-zinc-800/40">
                          <td className="p-3">
                            <Badge variant="outline" className={SYNC_STATUS_COLORS[s.status] ?? 'text-zinc-400'}>
                              <StatusIcon className={`h-3 w-3 mr-1 ${s.status === 'running' ? 'animate-spin' : ''}`} />
                              {s.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-zinc-400 capitalize">{s.sync_type}</td>
                          <td className="p-3 text-zinc-400">
                            {formatDateShort(s.date_range_start)} — {formatDateShort(s.date_range_end)}
                          </td>
                          <td className="p-3 text-zinc-300 text-right">{s.campaigns_synced}</td>
                          <td className="p-3 text-zinc-300 text-right">{s.metrics_upserted}</td>
                          <td className="p-3 text-zinc-400">{formatDate(s.started_at)}</td>
                          <td className="p-3 text-zinc-400">{duration != null ? `${duration}s` : '...'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {syncHistory.some((s) => s.error_message) && (
              <Card className="border-red-500/20 bg-red-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-red-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Recent Sync Errors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {syncHistory.filter((s) => s.error_message).slice(0, 3).map((s) => (
                    <div key={s.id} className="text-xs text-red-300/80 mb-1">
                      <span className="text-zinc-500">{formatDate(s.started_at)}</span> — {s.error_message}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Campaign Detail Sheet */}
        <Sheet open={!!selectedCampaign} onOpenChange={(open) => { if (!open) setSelectedCampaign(null) }}>
          <SheetContent className="!top-16 !h-[calc(100vh-4rem)] w-[500px] border-zinc-800 bg-zinc-950 overflow-y-auto">
            {selectedCampaign && (
              <>
                <SheetHeader>
                  <SheetTitle className="text-zinc-100">{selectedCampaign.campaign_name}</SheetTitle>
                  <SheetDescription className="text-zinc-400">
                    {selectedCampaign.campaign_group_name && `${selectedCampaign.campaign_group_name} · `}
                    {selectedCampaign.campaign_status} · {selectedCampaign.campaign_type ?? 'Unknown type'}
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                  {/* Ad Metrics Summary */}
                  <div>
                    <h4 className="text-xs font-medium text-zinc-500 uppercase mb-3">Ad Performance</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <DetailStat label="Spend" value={formatCurrency(selectedCampaign.total_spend, selectedCampaign.currency)} />
                      <DetailStat label="Impressions" value={formatNumber(selectedCampaign.total_impressions)} />
                      <DetailStat label="Clicks" value={formatNumber(selectedCampaign.total_clicks)} />
                      <DetailStat label="CTR" value={formatPercent(selectedCampaign.avg_ctr)} />
                      <DetailStat label="CPC" value={formatDecimal(selectedCampaign.avg_cpc, selectedCampaign.currency)} />
                      <DetailStat label="Leads" value={formatNumber(selectedCampaign.total_leads)} />
                      <DetailStat label="CPL" value={formatDecimal(selectedCampaign.avg_cpl, selectedCampaign.currency)} />
                      <DetailStat label="CPM" value={formatDecimal(selectedCampaign.avg_cpm, selectedCampaign.currency)} />
                    </div>
                  </div>

                  {/* Pipeline Overlay */}
                  <div>
                    <h4 className="text-xs font-medium text-zinc-500 uppercase mb-3">Pipeline Impact</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <DetailStat label="Pipeline Leads" value={formatNumber(selectedCampaign.pipeline_leads)} />
                      <DetailStat label="Meetings" value={formatNumber(selectedCampaign.pipeline_meetings)} />
                      <DetailStat label="Proposals" value={formatNumber(selectedCampaign.pipeline_proposals)} />
                      <DetailStat label="Won Deals" value={formatNumber(selectedCampaign.pipeline_won_deals)} />
                      <DetailStat label="Revenue" value={formatCurrency(selectedCampaign.pipeline_revenue, selectedCampaign.currency)} accent />
                      <DetailStat label="ROAS" value={selectedCampaign.roas ? `${selectedCampaign.roas.toFixed(1)}x` : '—'} accent={selectedCampaign.roas != null && selectedCampaign.roas >= 1} />
                      <DetailStat label="Cost / Meeting" value={selectedCampaign.cost_per_meeting ? formatDecimal(selectedCampaign.cost_per_meeting, selectedCampaign.currency) : '—'} />
                      <DetailStat label="Cost / Deal" value={selectedCampaign.cost_per_deal ? formatDecimal(selectedCampaign.cost_per_deal, selectedCampaign.currency) : '—'} />
                    </div>
                  </div>

                  {/* Daily Metrics Chart (simplified table for now) */}
                  <div>
                    <h4 className="text-xs font-medium text-zinc-500 uppercase mb-3">Daily Trend</h4>
                    {loadingDetail ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}
                      </div>
                    ) : campaignMetrics.length === 0 ? (
                      <p className="text-xs text-zinc-500">No daily data for selected period</p>
                    ) : (
                      <div className="max-h-[300px] overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800/60">
                              <th className="text-left p-2 text-zinc-500">Date</th>
                              <th className="text-right p-2 text-zinc-500">Spend</th>
                              <th className="text-right p-2 text-zinc-500">Impr.</th>
                              <th className="text-right p-2 text-zinc-500">Clicks</th>
                              <th className="text-right p-2 text-zinc-500">Leads</th>
                            </tr>
                          </thead>
                          <tbody>
                            {campaignMetrics.map((m) => (
                              <tr key={m.date} className="border-b border-zinc-800/30">
                                <td className="p-2 text-zinc-400">{formatDateShort(m.date)}</td>
                                <td className="p-2 text-zinc-300 text-right font-mono">{formatDecimal(m.spend)}</td>
                                <td className="p-2 text-zinc-400 text-right">{formatNumber(m.impressions)}</td>
                                <td className="p-2 text-zinc-400 text-right">{formatNumber(m.clicks)}</td>
                                <td className="p-2 text-zinc-300 text-right">{formatNumber(m.leads)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Quality Flags */}
                  {selectedCampaign.total_leads > 5 && selectedCampaign.pipeline_meetings === 0 && (
                    <Card className="border-amber-500/20 bg-amber-500/5">
                      <CardContent className="py-3 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm text-amber-300 font-medium">Low Pipeline Conversion</p>
                          <p className="text-xs text-amber-400/70 mt-1">
                            This campaign has {selectedCampaign.total_leads} leads but no meetings booked.
                            Consider reviewing targeting or lead quality.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ icon: Icon, label, value, accent }: {
  icon: typeof DollarSign
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <Card className="border-zinc-800/60 bg-zinc-900/60">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-3.5 w-3.5 ${accent ? 'text-green-400' : 'text-zinc-500'}`} />
          <span className="text-xs text-zinc-500">{label}</span>
        </div>
        <span className={`text-lg font-semibold ${accent ? 'text-green-400' : 'text-zinc-100'}`}>{value}</span>
      </CardContent>
    </Card>
  )
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-zinc-900/40 border border-zinc-800/40 rounded-lg p-3">
      <span className="text-xs text-zinc-500 block">{label}</span>
      <span className={`text-sm font-medium ${accent ? 'text-green-400' : 'text-zinc-200'}`}>{value}</span>
    </div>
  )
}

function PipelineStat({ label, value, isText }: { label: string; value: string | number; isText?: boolean }) {
  return (
    <div>
      <span className="text-xs text-zinc-500 block">{label}</span>
      <span className="text-sm font-medium text-zinc-200">{isText ? value : formatNumber(value as number)}</span>
    </div>
  )
}

function DetailStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-zinc-800/30 rounded-lg p-2.5">
      <span className="text-xs text-zinc-500 block">{label}</span>
      <span className={`text-sm font-medium ${accent ? 'text-green-400' : 'text-zinc-200'}`}>{value}</span>
    </div>
  )
}

function SortHeader({ field, label, current, dir, onSort }: {
  field: SortField
  label: string
  current: SortField
  dir: SortDir
  onSort: (f: SortField) => void
}) {
  const active = current === field
  return (
    <th
      className="text-right p-3 text-zinc-400 font-medium cursor-pointer hover:text-zinc-200 select-none"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <ArrowUpDown className={`h-3 w-3 ${dir === 'asc' ? 'rotate-180' : ''}`} />
        )}
      </span>
    </th>
  )
}

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { toast } from 'sonner'
import {
  BarChart3, Plus, RefreshCw, ArrowUpDown, Search, Loader2,
  Play, Pause, Archive, Eye, ChevronDown, Shield, Megaphone,
  Target, DollarSign, MousePointerClick, Users, Layers, CheckCircle2, XCircle, Trash2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { useLinkedInAdManager } from '@/lib/hooks/useLinkedInAdManager'
import type { ManagedCampaign, ManagedCampaignGroup, CampaignApproval, ManagedCreative, MatchedAudience, AudienceEstimate } from '@/lib/services/linkedinAdManagerService'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-500/10 text-green-400 border-green-500/20',
  PAUSED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  COMPLETED: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  DRAFT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  ARCHIVED: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
  CANCELED: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const APPROVAL_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  approved: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const OBJECTIVE_LABELS: Record<string, string> = {
  LEAD_GENERATION: 'Lead Generation',
  WEBSITE_VISITS: 'Website Visits',
  WEBSITE_CONVERSIONS: 'Website Conversions',
  ENGAGEMENT: 'Engagement',
  BRAND_AWARENESS: 'Brand Awareness',
  VIDEO_VIEWS: 'Video Views',
}

const FORMAT_LABELS: Record<string, string> = {
  SINGLE_IMAGE: 'Single Image',
  CAROUSEL: 'Carousel',
  VIDEO: 'Video',
  TEXT_AD: 'Text Ad',
  DYNAMIC: 'Dynamic',
  MESSAGE: 'Message',
  EVENT: 'Event',
}

type SortField = 'name' | 'status' | 'total_spend' | 'total_impressions' | 'total_clicks' | 'avg_ctr' | 'created_at'
type SortDir = 'asc' | 'desc'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(val: number | null | undefined, currency = 'USD'): string {
  if (val == null) return '--'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val)
}

function formatNumber(val: number | null | undefined): string {
  if (val == null) return '--'
  return new Intl.NumberFormat('en-US').format(val)
}

function formatPercent(val: number | null | undefined): string {
  if (val == null) return '--'
  return `${val.toFixed(2)}%`
}

function formatDecimal(val: number | null | undefined, currency = 'USD'): string {
  if (val == null) return '--'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '--'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getBudgetDisplay(campaign: ManagedCampaign): string {
  if (campaign.daily_budget_amount) return `${formatCurrency(campaign.daily_budget_amount, campaign.currency_code)}/day`
  if (campaign.total_budget_amount) return `${formatCurrency(campaign.total_budget_amount, campaign.currency_code)} total`
  return '--'
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CampaignsPage() {
  const {
    campaigns, campaignsLoading, selectedCampaign, setSelectedCampaign,
    loadCampaigns, getCampaign, createCampaign, updateCampaignStatus,
    groups, groupsLoading, loadGroups, createGroup,
    creatives, creativesLoading, loadCreatives, createCreative,
    approvals, approvalsLoading, loadApprovals, requestApproval, approveAction, rejectAction,
    syncing, syncCampaigns,
    audiences, audiencesLoading, audienceEstimate, estimateLoading,
    loadAudiences, createAudience, deleteAudience, estimateAudienceSize,
    ready,
  } = useLinkedInAdManager()

  const [activeTab, setActiveTab] = useState('campaigns')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ campaignId: string; action: string; campaign: ManagedCampaign } | null>(null)
  const [showCreateAudience, setShowCreateAudience] = useState(false)
  const [newAudienceName, setNewAudienceName] = useState('')
  const [newAudienceType, setNewAudienceType] = useState<'CONTACT_LIST' | 'COMPANY_LIST'>('CONTACT_LIST')
  const [newAudienceDescription, setNewAudienceDescription] = useState('')
  const [creatingAudience, setCreatingAudience] = useState(false)

  // -- Sorting & Filtering --

  const filteredCampaigns = useMemo(() => {
    let result = [...campaigns]

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter)
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.objective_type?.toLowerCase().includes(q) ||
        c.format?.toLowerCase().includes(q)
      )
    }

    // Sort
    result.sort((a, b) => {
      let aVal: any, bVal: any
      switch (sortField) {
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break
        case 'status': aVal = a.status; bVal = b.status; break
        case 'total_spend': aVal = a.total_spend ?? 0; bVal = b.total_spend ?? 0; break
        case 'total_impressions': aVal = a.total_impressions ?? 0; bVal = b.total_impressions ?? 0; break
        case 'total_clicks': aVal = a.total_clicks ?? 0; bVal = b.total_clicks ?? 0; break
        case 'avg_ctr': aVal = a.avg_ctr ?? 0; bVal = b.avg_ctr ?? 0; break
        case 'created_at': aVal = a.created_at; bVal = b.created_at; break
        default: aVal = 0; bVal = 0
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [campaigns, statusFilter, searchQuery, sortField, sortDir])

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }, [sortField])

  const handleStatusAction = useCallback(async (campaign: ManagedCampaign, newStatus: string) => {
    // Actions requiring approval
    const approvalRequired = ['ACTIVE'].includes(newStatus) && campaign.status === 'DRAFT'
    if (approvalRequired) {
      setConfirmAction({ campaignId: campaign.id, action: newStatus, campaign })
      return
    }
    await updateCampaignStatus(campaign.id, newStatus, campaign.version_tag ?? undefined)
  }, [updateCampaignStatus])

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction) return
    await updateCampaignStatus(confirmAction.campaignId, confirmAction.action, confirmAction.campaign.version_tag ?? undefined)
    setConfirmAction(null)
  }, [confirmAction, updateCampaignStatus])

  const handleCampaignClick = useCallback(async (campaign: ManagedCampaign) => {
    setSelectedCampaign(campaign)
    await loadCreatives(campaign.id)
  }, [setSelectedCampaign, loadCreatives])

  const handleCreateAudience = useCallback(async () => {
    if (!newAudienceName.trim()) return
    setCreatingAudience(true)
    try {
      await createAudience({
        ad_account_id: '',
        name: newAudienceName.trim(),
        audience_type: newAudienceType,
        description: newAudienceDescription.trim() || undefined,
      })
      setShowCreateAudience(false)
      setNewAudienceName('')
      setNewAudienceType('CONTACT_LIST')
      setNewAudienceDescription('')
    } finally {
      setCreatingAudience(false)
    }
  }, [newAudienceName, newAudienceType, newAudienceDescription, createAudience])

  // -- Summary stats --
  const stats = useMemo(() => {
    const active = campaigns.filter((c) => c.status === 'ACTIVE').length
    const draft = campaigns.filter((c) => c.status === 'DRAFT').length
    const totalSpend = campaigns.reduce((s, c) => s + (c.total_spend ?? 0), 0)
    const totalLeads = campaigns.reduce((s, c) => s + (c.total_leads ?? 0), 0)
    return { total: campaigns.length, active, draft, totalSpend, totalLeads, pendingApprovals: approvals.length }
  }, [campaigns, approvals])

  // -- Loading state --
  if (!ready) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <>
      <Helmet><title>Campaign Manager | 60</title></Helmet>

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Campaign Manager</h1>
            <p className="text-sm text-zinc-400 mt-1">Create, manage, and monitor LinkedIn ad campaigns</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={syncCampaigns} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Sync
            </Button>
            <Button size="sm" onClick={() => setShowWizard(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Campaign
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                <Megaphone className="h-3.5 w-3.5" /> Total Campaigns
              </div>
              <div className="text-xl font-bold text-zinc-100">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                <Play className="h-3.5 w-3.5" /> Active
              </div>
              <div className="text-xl font-bold text-green-400">{stats.active}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                <Target className="h-3.5 w-3.5" /> Drafts
              </div>
              <div className="text-xl font-bold text-blue-400">{stats.draft}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                <DollarSign className="h-3.5 w-3.5" /> Total Spend
              </div>
              <div className="text-xl font-bold text-zinc-100">{formatCurrency(stats.totalSpend)}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                <Users className="h-3.5 w-3.5" /> Total Leads
              </div>
              <div className="text-xl font-bold text-zinc-100">{formatNumber(stats.totalLeads)}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                <Shield className="h-3.5 w-3.5" /> Pending Approvals
              </div>
              <div className="text-xl font-bold text-yellow-400">{stats.pendingApprovals}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="groups">Campaign Groups</TabsTrigger>
            <TabsTrigger value="audiences">
              <Users className="h-3.5 w-3.5 mr-1" />
              Audiences
            </TabsTrigger>
            <TabsTrigger value="approvals">
              Approvals
              {approvals.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-[20px] px-1.5 text-xs bg-yellow-500/20 text-yellow-400">
                  {approvals.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Search campaigns..."
                  className="pl-9 bg-zinc-900 border-zinc-800"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 bg-zinc-900 border-zinc-800">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PAUSED">Paused</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Campaign Table */}
            {campaignsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-12 text-center">
                  <Megaphone className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-zinc-300 mb-2">No campaigns yet</h3>
                  <p className="text-sm text-zinc-500 mb-4">Create your first LinkedIn ad campaign to get started</p>
                  <Button size="sm" onClick={() => setShowWizard(true)}>
                    <Plus className="h-4 w-4 mr-1" /> New Campaign
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-zinc-900 border-zinc-800">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('name')}>
                        <span className="flex items-center gap-1">Name <ArrowUpDown className="h-3 w-3" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('status')}>
                        <span className="flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></span>
                      </TableHead>
                      <TableHead>Objective</TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('total_spend')}>
                        <span className="flex items-center justify-end gap-1">Spend <ArrowUpDown className="h-3 w-3" /></span>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('total_impressions')}>
                        <span className="flex items-center justify-end gap-1">Impr. <ArrowUpDown className="h-3 w-3" /></span>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('total_clicks')}>
                        <span className="flex items-center justify-end gap-1">Clicks <ArrowUpDown className="h-3 w-3" /></span>
                      </TableHead>
                      <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('avg_ctr')}>
                        <span className="flex items-center justify-end gap-1">CTR <ArrowUpDown className="h-3 w-3" /></span>
                      </TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCampaigns.map((campaign) => (
                      <TableRow
                        key={campaign.id}
                        className="border-zinc-800 cursor-pointer hover:bg-zinc-800/50"
                        onClick={() => handleCampaignClick(campaign)}
                      >
                        <TableCell className="font-medium text-zinc-200">
                          <div>
                            {campaign.name}
                            {campaign.is_externally_modified && (
                              <Badge variant="outline" className="ml-2 text-xs bg-orange-500/10 text-orange-400 border-orange-500/20">
                                Modified externally
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-zinc-500">{FORMAT_LABELS[campaign.format ?? ''] ?? campaign.format}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_COLORS[campaign.status] ?? ''}>
                            {campaign.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-zinc-400 text-sm">
                          {OBJECTIVE_LABELS[campaign.objective_type] ?? campaign.objective_type}
                        </TableCell>
                        <TableCell className="text-zinc-400 text-sm">{getBudgetDisplay(campaign)}</TableCell>
                        <TableCell className="text-right text-zinc-300">{formatCurrency(campaign.total_spend, campaign.currency_code)}</TableCell>
                        <TableCell className="text-right text-zinc-300">{formatNumber(campaign.total_impressions)}</TableCell>
                        <TableCell className="text-right text-zinc-300">{formatNumber(campaign.total_clicks)}</TableCell>
                        <TableCell className="text-right text-zinc-300">{formatPercent(campaign.avg_ctr)}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {campaign.status === 'DRAFT' && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Activate"
                                onClick={() => handleStatusAction(campaign, 'ACTIVE')}>
                                <Play className="h-3.5 w-3.5 text-green-400" />
                              </Button>
                            )}
                            {campaign.status === 'ACTIVE' && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Pause"
                                onClick={() => handleStatusAction(campaign, 'PAUSED')}>
                                <Pause className="h-3.5 w-3.5 text-yellow-400" />
                              </Button>
                            )}
                            {campaign.status === 'PAUSED' && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Resume"
                                onClick={() => handleStatusAction(campaign, 'ACTIVE')}>
                                <Play className="h-3.5 w-3.5 text-green-400" />
                              </Button>
                            )}
                            {['DRAFT', 'PAUSED', 'COMPLETED'].includes(campaign.status) && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Archive"
                                onClick={() => handleStatusAction(campaign, 'ARCHIVED')}>
                                <Archive className="h-3.5 w-3.5 text-zinc-400" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Campaign Groups Tab */}
          <TabsContent value="groups" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => toast.info('Group creation coming soon')}>
                <Plus className="h-4 w-4 mr-1" /> New Group
              </Button>
            </div>
            {groupsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : groups.length === 0 ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-12 text-center">
                  <Layers className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-zinc-300 mb-2">No campaign groups</h3>
                  <p className="text-sm text-zinc-500">Groups help organize campaigns with shared budgets and schedules</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-zinc-900 border-zinc-800">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Last Synced</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((group) => (
                      <TableRow key={group.id} className="border-zinc-800">
                        <TableCell className="font-medium text-zinc-200">{group.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_COLORS[group.status] ?? ''}>
                            {group.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-zinc-400 text-sm">
                          {group.daily_budget_amount
                            ? `${formatCurrency(group.daily_budget_amount, group.currency_code)}/day`
                            : group.total_budget_amount
                            ? `${formatCurrency(group.total_budget_amount, group.currency_code)} total`
                            : '--'}
                        </TableCell>
                        <TableCell className="text-zinc-400 text-sm">
                          {group.run_schedule_start
                            ? `${formatDate(group.run_schedule_start)} - ${formatDate(group.run_schedule_end)}`
                            : 'Continuous'}
                        </TableCell>
                        <TableCell className="text-zinc-500 text-sm">{formatDate(group.last_synced_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Audiences Tab */}
          <TabsContent value="audiences" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-100">Matched Audiences</h2>
              <Button size="sm" onClick={() => setShowCreateAudience(true)}>
                <Plus className="h-4 w-4 mr-1" /> New Audience
              </Button>
            </div>
            {audiencesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : audiences.length === 0 ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-12 text-center">
                  <Users className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-zinc-300 mb-2">No matched audiences</h3>
                  <p className="text-sm text-zinc-500 mb-4">Create an audience to target contacts or companies from your pipeline</p>
                  <Button size="sm" onClick={() => setShowCreateAudience(true)}>
                    <Plus className="h-4 w-4 mr-1" /> New Audience
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-zinc-900 border-zinc-800">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                      <TableHead className="text-right">Match Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audiences.map((audience) => (
                      <TableRow key={audience.id} className="border-zinc-800">
                        <TableCell className="font-medium text-zinc-200">
                          <div>{audience.name}</div>
                          {audience.description && (
                            <div className="text-xs text-zinc-500 mt-0.5 truncate max-w-[200px]">{audience.description}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-zinc-400 text-sm">
                          {audience.audience_type === 'CONTACT_LIST' ? 'Contact List' : 'Company List'}
                        </TableCell>
                        <TableCell className="text-right text-zinc-300">{formatNumber(audience.member_count)}</TableCell>
                        <TableCell className="text-right text-zinc-300">
                          {audience.match_rate != null ? `${(audience.match_rate * 100).toFixed(1)}%` : '--'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            audience.upload_status === 'READY' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                            audience.upload_status === 'PROCESSING' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                            audience.upload_status === 'PENDING' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            audience.upload_status === 'FAILED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                            'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                          }>
                            {audience.upload_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-zinc-400 text-sm">{audience.source_type ?? '--'}</TableCell>
                        <TableCell className="text-zinc-500 text-sm">{formatDate(audience.created_at)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Delete audience"
                            onClick={() => deleteAudience(audience.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* Approvals Tab */}
          <TabsContent value="approvals" className="space-y-4">
            {approvalsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : approvals.length === 0 ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-zinc-300 mb-2">No pending approvals</h3>
                  <p className="text-sm text-zinc-500">Budget-impacting actions will appear here for review</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {approvals.map((approval) => (
                  <Card key={approval.id} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={APPROVAL_STATUS_COLORS[approval.status] ?? ''}>
                              {approval.status}
                            </Badge>
                            <span className="text-sm font-medium text-zinc-200">
                              {approval.action_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-400">
                            {approval.campaign_name ?? `Campaign ${approval.campaign_id?.slice(0, 8)}`}
                          </p>
                          <p className="text-xs text-zinc-500 mt-1">
                            Requested {formatDate(approval.created_at)}
                            {approval.details && Object.keys(approval.details).length > 0 && (
                              <span className="ml-2">
                                {JSON.stringify(approval.details).slice(0, 80)}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => rejectAction(approval.id)}>
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                          <Button size="sm" onClick={() => approveAction(approval.id)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Campaign Detail Sheet (LAM-008) */}
      <Sheet open={!!selectedCampaign} onOpenChange={(open) => !open && setSelectedCampaign(null)}>
        <SheetContent className="!top-16 !h-[calc(100vh-4rem)] w-full sm:max-w-xl overflow-y-auto">
          {selectedCampaign && (
            <>
              <SheetHeader>
                <SheetTitle className="text-zinc-100">{selectedCampaign.name}</SheetTitle>
                <SheetDescription className="flex items-center gap-2">
                  <Badge variant="outline" className={STATUS_COLORS[selectedCampaign.status] ?? ''}>
                    {selectedCampaign.status}
                  </Badge>
                  <span>{OBJECTIVE_LABELS[selectedCampaign.objective_type] ?? selectedCampaign.objective_type}</span>
                  {selectedCampaign.format && (
                    <span className="text-zinc-500">
                      {FORMAT_LABELS[selectedCampaign.format] ?? selectedCampaign.format}
                    </span>
                  )}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                {/* External modification warning */}
                {selectedCampaign.is_externally_modified && (
                  <Card className="bg-orange-500/5 border-orange-500/20">
                    <CardContent className="p-3 text-sm text-orange-400">
                      This campaign was modified outside use60. The local state has been updated to match LinkedIn.
                    </CardContent>
                  </Card>
                )}

                {/* Budget & Schedule */}
                <div>
                  <h3 className="text-sm font-medium text-zinc-300 mb-3">Budget & Schedule</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">Budget</div>
                      <div className="text-sm font-medium text-zinc-200">{getBudgetDisplay(selectedCampaign)}</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">Bid Strategy</div>
                      <div className="text-sm font-medium text-zinc-200">
                        {selectedCampaign.cost_type ?? '--'}
                        {selectedCampaign.unit_cost_amount != null && ` (${formatDecimal(selectedCampaign.unit_cost_amount, selectedCampaign.currency_code)})`}
                      </div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">Schedule</div>
                      <div className="text-sm font-medium text-zinc-200">
                        {selectedCampaign.run_schedule_start
                          ? `${formatDate(selectedCampaign.run_schedule_start)} - ${formatDate(selectedCampaign.run_schedule_end)}`
                          : 'Continuous'}
                      </div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">Pacing</div>
                      <div className="text-sm font-medium text-zinc-200">{selectedCampaign.pacing_strategy ?? '--'}</div>
                    </div>
                  </div>
                </div>

                {/* Performance Inline Metrics */}
                <div>
                  <h3 className="text-sm font-medium text-zinc-300 mb-3">Performance</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">Impressions</div>
                      <div className="text-sm font-medium text-zinc-200">{formatNumber(selectedCampaign.total_impressions)}</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">Clicks</div>
                      <div className="text-sm font-medium text-zinc-200">{formatNumber(selectedCampaign.total_clicks)}</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">Spend</div>
                      <div className="text-sm font-medium text-zinc-200">{formatCurrency(selectedCampaign.total_spend, selectedCampaign.currency_code)}</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">Leads</div>
                      <div className="text-sm font-medium text-zinc-200">{formatNumber(selectedCampaign.total_leads)}</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">CTR</div>
                      <div className="text-sm font-medium text-zinc-200">{formatPercent(selectedCampaign.avg_ctr)}</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-500 mb-1">CPC</div>
                      <div className="text-sm font-medium text-zinc-200">{formatDecimal(selectedCampaign.avg_cpc, selectedCampaign.currency_code)}</div>
                    </div>
                  </div>
                </div>

                {/* Targeting Summary */}
                {selectedCampaign.targeting_criteria && Object.keys(selectedCampaign.targeting_criteria).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-zinc-300 mb-3">Targeting</h3>
                    <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
                      {Object.entries(selectedCampaign.targeting_criteria).map(([key, value]) => (
                        <div key={key} className="flex items-start gap-2 text-sm">
                          <span className="text-zinc-500 min-w-[100px] capitalize">{key.replace(/_/g, ' ')}:</span>
                          <span className="text-zinc-300">
                            {Array.isArray(value) ? value.join(', ') : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Creatives */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-zinc-300">Creatives</h3>
                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => toast.info('Creative creation dialog coming soon')}>
                      <Plus className="h-3 w-3 mr-1" /> Add Creative
                    </Button>
                  </div>
                  {creativesLoading ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
                    </div>
                  ) : creatives.length === 0 ? (
                    <div className="text-sm text-zinc-500 bg-zinc-800/30 rounded-lg p-4 text-center">
                      No creatives yet. Add a creative to start running ads.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {creatives.map((creative) => (
                        <Card key={creative.id} className="bg-zinc-800/50 border-zinc-700/50">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-zinc-200 truncate">{creative.headline ?? 'Untitled'}</div>
                                {creative.body_text && (
                                  <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{creative.body_text}</div>
                                )}
                                <div className="flex items-center gap-2 mt-1.5">
                                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[creative.status] ?? ''}`}>
                                    {creative.status}
                                  </Badge>
                                  <span className="text-xs text-zinc-500">{creative.media_type}</span>
                                  {creative.cta_text && (
                                    <span className="text-xs text-zinc-500">{creative.cta_text}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-4 border-t border-zinc-800">
                  {selectedCampaign.status === 'DRAFT' && (
                    <Button size="sm" onClick={() => handleStatusAction(selectedCampaign, 'ACTIVE')}>
                      <Play className="h-4 w-4 mr-1" /> Activate
                    </Button>
                  )}
                  {selectedCampaign.status === 'ACTIVE' && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusAction(selectedCampaign, 'PAUSED')}>
                      <Pause className="h-4 w-4 mr-1" /> Pause
                    </Button>
                  )}
                  {selectedCampaign.status === 'PAUSED' && (
                    <Button size="sm" onClick={() => handleStatusAction(selectedCampaign, 'ACTIVE')}>
                      <Play className="h-4 w-4 mr-1" /> Resume
                    </Button>
                  )}
                  {['DRAFT', 'PAUSED', 'COMPLETED'].includes(selectedCampaign.status) && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusAction(selectedCampaign, 'ARCHIVED')}>
                      <Archive className="h-4 w-4 mr-1" /> Archive
                    </Button>
                  )}
                  {selectedCampaign.linkedin_campaign_id && (
                    <Button variant="ghost" size="sm" asChild className="ml-auto">
                      <a
                        href={`https://www.linkedin.com/campaignmanager/accounts/${selectedCampaign.ad_account_id}/campaigns/${selectedCampaign.linkedin_campaign_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Eye className="h-4 w-4 mr-1" /> View on LinkedIn
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Campaign Activation</DialogTitle>
            <DialogDescription>
              You are about to activate <strong>{confirmAction?.campaign.name}</strong>.
              This will start serving ads and spending your budget
              ({getBudgetDisplay(confirmAction?.campaign ?? {} as ManagedCampaign)}).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button onClick={handleConfirmAction}>
              <Play className="h-4 w-4 mr-1" /> Activate Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Wizard Dialog - placeholder for LAM-009 */}
      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Campaign</DialogTitle>
            <DialogDescription>Set up a LinkedIn ad campaign in a few steps</DialogDescription>
          </DialogHeader>
          <CampaignWizard
            onComplete={async (params) => {
              const result = await createCampaign(params)
              if (result) {
                setShowWizard(false)
              }
            }}
            onCancel={() => setShowWizard(false)}
            audiences={audiences}
            audienceEstimate={audienceEstimate}
            estimateLoading={estimateLoading}
            onEstimateAudience={estimateAudienceSize}
          />
        </DialogContent>
      </Dialog>

      {/* Create Audience Dialog */}
      <Dialog open={showCreateAudience} onOpenChange={setShowCreateAudience}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Audience</DialogTitle>
            <DialogDescription>Create a matched audience to target with your campaigns</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Name</label>
              <Input placeholder="e.g. Enterprise Decision Makers" className="bg-zinc-800 border-zinc-700"
                value={newAudienceName} onChange={(e) => setNewAudienceName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Type</label>
              <Select value={newAudienceType} onValueChange={(v) => setNewAudienceType(v as 'CONTACT_LIST' | 'COMPANY_LIST')}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONTACT_LIST">Contact List</SelectItem>
                  <SelectItem value="COMPANY_LIST">Company List</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Description (optional)</label>
              <Textarea placeholder="Describe this audience..." className="bg-zinc-800 border-zinc-700 min-h-[80px]"
                value={newAudienceDescription} onChange={(e) => setNewAudienceDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateAudience(false)}>Cancel</Button>
            <Button onClick={handleCreateAudience} disabled={!newAudienceName.trim() || creatingAudience}>
              {creatingAudience ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Campaign Wizard (LAM-009 — inline)
// ---------------------------------------------------------------------------

const OBJECTIVES = [
  { value: 'LEAD_GENERATION', label: 'Lead Generation', description: 'Collect leads via LinkedIn forms' },
  { value: 'WEBSITE_VISITS', label: 'Website Visits', description: 'Drive traffic to your website' },
  { value: 'WEBSITE_CONVERSIONS', label: 'Website Conversions', description: 'Drive specific actions on your website' },
  { value: 'ENGAGEMENT', label: 'Engagement', description: 'Get more likes, comments, and shares' },
  { value: 'BRAND_AWARENESS', label: 'Brand Awareness', description: 'Reach a broad audience' },
  { value: 'VIDEO_VIEWS', label: 'Video Views', description: 'Promote video content' },
]

const FORMATS = [
  { value: 'SINGLE_IMAGE', label: 'Single Image', objectives: ['LEAD_GENERATION', 'WEBSITE_VISITS', 'WEBSITE_CONVERSIONS', 'ENGAGEMENT', 'BRAND_AWARENESS'] },
  { value: 'CAROUSEL', label: 'Carousel', objectives: ['LEAD_GENERATION', 'WEBSITE_VISITS', 'WEBSITE_CONVERSIONS', 'ENGAGEMENT', 'BRAND_AWARENESS'] },
  { value: 'VIDEO', label: 'Video', objectives: ['LEAD_GENERATION', 'WEBSITE_VISITS', 'WEBSITE_CONVERSIONS', 'ENGAGEMENT', 'BRAND_AWARENESS', 'VIDEO_VIEWS'] },
  { value: 'TEXT_AD', label: 'Text Ad', objectives: ['WEBSITE_VISITS', 'WEBSITE_CONVERSIONS'] },
  { value: 'MESSAGE', label: 'Sponsored Message', objectives: ['LEAD_GENERATION', 'WEBSITE_VISITS'] },
  { value: 'EVENT', label: 'Event Ad', objectives: ['ENGAGEMENT'] },
]

const BID_STRATEGIES = [
  { value: 'CPC', label: 'Manual CPC', description: 'Pay per click' },
  { value: 'CPM', label: 'Manual CPM', description: 'Pay per 1,000 impressions' },
  { value: 'TARGET_COST', label: 'Target Cost', description: 'LinkedIn optimizes to your target' },
  { value: 'COST_CAP', label: 'Cost Cap', description: 'LinkedIn optimizes within a spending cap' },
]

// ---------------------------------------------------------------------------
// LinkedIn Targeting Taxonomy
// ---------------------------------------------------------------------------

const SENIORITIES = [
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'TRAINING', label: 'Training' },
  { value: 'ENTRY', label: 'Entry' },
  { value: 'SENIOR', label: 'Senior' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'DIRECTOR', label: 'Director' },
  { value: 'VP', label: 'VP' },
  { value: 'CXO', label: 'CXO' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'OWNER', label: 'Owner' },
]

const JOB_FUNCTIONS = [
  { value: 'ACCOUNTING', label: 'Accounting' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
  { value: 'ARTS_AND_DESIGN', label: 'Arts & Design' },
  { value: 'BUSINESS_DEVELOPMENT', label: 'Business Development' },
  { value: 'COMMUNITY_AND_SOCIAL_SERVICES', label: 'Community & Social Services' },
  { value: 'CONSULTING', label: 'Consulting' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'ENGINEERING', label: 'Engineering' },
  { value: 'ENTREPRENEURSHIP', label: 'Entrepreneurship' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'HEALTHCARE_SERVICES', label: 'Healthcare Services' },
  { value: 'HUMAN_RESOURCES', label: 'Human Resources' },
  { value: 'INFORMATION_TECHNOLOGY', label: 'Information Technology' },
  { value: 'LEGAL', label: 'Legal' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'MEDIA_AND_COMMUNICATION', label: 'Media & Communication' },
  { value: 'MILITARY_AND_PROTECTIVE_SERVICES', label: 'Military & Protective Services' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'PRODUCT_MANAGEMENT', label: 'Product Management' },
  { value: 'PROGRAM_AND_PROJECT_MANAGEMENT', label: 'Program & Project Management' },
  { value: 'PURCHASING', label: 'Purchasing' },
  { value: 'QUALITY_ASSURANCE', label: 'Quality Assurance' },
  { value: 'REAL_ESTATE', label: 'Real Estate' },
  { value: 'RESEARCH', label: 'Research' },
  { value: 'SALES', label: 'Sales' },
  { value: 'SUPPORT', label: 'Support' },
]

const TARGETING_INDUSTRIES = [
  { value: 'COMPUTER_SOFTWARE', label: 'Computer Software' },
  { value: 'INFORMATION_TECHNOLOGY', label: 'Information Technology & Services' },
  { value: 'FINANCIAL_SERVICES', label: 'Financial Services' },
  { value: 'BANKING', label: 'Banking' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'HOSPITAL_AND_HEALTH_CARE', label: 'Hospital & Health Care' },
  { value: 'PHARMACEUTICALS', label: 'Pharmaceuticals' },
  { value: 'BIOTECHNOLOGY', label: 'Biotechnology' },
  { value: 'MARKETING_AND_ADVERTISING', label: 'Marketing & Advertising' },
  { value: 'MANAGEMENT_CONSULTING', label: 'Management Consulting' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'CONSUMER_GOODS', label: 'Consumer Goods' },
  { value: 'REAL_ESTATE', label: 'Real Estate' },
  { value: 'CONSTRUCTION', label: 'Construction' },
  { value: 'EDUCATION_MANAGEMENT', label: 'Education Management' },
  { value: 'HIGHER_EDUCATION', label: 'Higher Education' },
  { value: 'TELECOMMUNICATIONS', label: 'Telecommunications' },
  { value: 'MEDIA_AND_ENTERTAINMENT', label: 'Media & Entertainment' },
  { value: 'AUTOMOTIVE', label: 'Automotive' },
  { value: 'MANUFACTURING', label: 'Manufacturing' },
  { value: 'FOOD_AND_BEVERAGES', label: 'Food & Beverages' },
  { value: 'TRANSPORTATION', label: 'Transportation' },
  { value: 'LOGISTICS_AND_SUPPLY_CHAIN', label: 'Logistics & Supply Chain' },
  { value: 'GOVERNMENT', label: 'Government Administration' },
  { value: 'NONPROFIT', label: 'Nonprofit Organization Management' },
  { value: 'LEGAL_SERVICES', label: 'Legal Services' },
  { value: 'ENERGY', label: 'Oil & Energy' },
  { value: 'STAFFING_AND_RECRUITING', label: 'Staffing & Recruiting' },
  { value: 'DESIGN', label: 'Design' },
]

const COMPANY_SIZES = [
  { value: 'SIZE_1', label: 'Myself only (1)' },
  { value: 'SIZE_2_10', label: '2-10 employees' },
  { value: 'SIZE_11_50', label: '11-50 employees' },
  { value: 'SIZE_51_200', label: '51-200 employees' },
  { value: 'SIZE_201_500', label: '201-500 employees' },
  { value: 'SIZE_501_1000', label: '501-1,000 employees' },
  { value: 'SIZE_1001_5000', label: '1,001-5,000 employees' },
  { value: 'SIZE_5001_10000', label: '5,001-10,000 employees' },
  { value: 'SIZE_10001_PLUS', label: '10,001+ employees' },
]

const TARGETING_GEOGRAPHIES = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'IE', label: 'Ireland' },
  { value: 'SE', label: 'Sweden' },
  { value: 'DK', label: 'Denmark' },
  { value: 'FI', label: 'Finland' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'AT', label: 'Austria' },
  { value: 'BE', label: 'Belgium' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'PT', label: 'Portugal' },
  { value: 'PL', label: 'Poland' },
  { value: 'IN', label: 'India' },
  { value: 'SG', label: 'Singapore' },
  { value: 'JP', label: 'Japan' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'IL', label: 'Israel' },
  { value: 'BR', label: 'Brazil' },
  { value: 'MX', label: 'Mexico' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'HK', label: 'Hong Kong' },
  { value: 'MY', label: 'Malaysia' },
  { value: 'PH', label: 'Philippines' },
  { value: 'ID', label: 'Indonesia' },
  { value: 'TH', label: 'Thailand' },
]

const EU_COUNTRIES = ['DE', 'FR', 'NL', 'IE', 'SE', 'DK', 'FI', 'CH', 'AT', 'BE', 'ES', 'IT', 'PT', 'PL']

// ---------------------------------------------------------------------------
// Multi-Select Component
// ---------------------------------------------------------------------------

function TargetingMultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (values: string[]) => void
  searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = searchable && search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    )
  }

  const selectedLabels = selected
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-left min-h-[36px] hover:border-zinc-600 transition-colors"
      >
        <span className="flex-1 truncate text-sm">
          {selected.length === 0 ? (
            <span className="text-zinc-500">Select {label.toLowerCase()}...</span>
          ) : (
            <span className="text-zinc-200">{selected.length} selected</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-zinc-500 shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 bg-zinc-900 border border-zinc-700 rounded-md shadow-lg">
          {searchable && (
            <div className="p-2 border-b border-zinc-700">
              <Input
                placeholder={`Search ${label.toLowerCase()}...`}
                className="bg-zinc-800 border-zinc-700 h-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="max-h-[200px] overflow-y-auto overscroll-contain p-2 space-y-0.5">
            {filtered.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 cursor-pointer"
              >
                <Checkbox
                  checked={selected.includes(option.value)}
                  onCheckedChange={() => toggle(option.value)}
                  className="border-zinc-600"
                />
                <span className="text-sm text-zinc-300">{option.label}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-zinc-500 text-center py-4">No results</p>
            )}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t border-zinc-700">
              <button
                type="button"
                className="w-full text-xs text-zinc-400 hover:text-zinc-300 py-1"
                onClick={() => onChange([])}
              >
                Clear all ({selected.length})
              </button>
            </div>
          )}
        </div>
      )}
      {selectedLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selectedLabels.slice(0, 5).map((lbl) => (
            <Badge key={lbl} variant="outline" className="text-[10px] bg-zinc-800 border-zinc-700 text-zinc-300">
              {lbl}
            </Badge>
          ))}
          {selectedLabels.length > 5 && (
            <Badge variant="outline" className="text-[10px] bg-zinc-800 border-zinc-700 text-zinc-400">
              +{selectedLabels.length - 5} more
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

interface WizardProps {
  onComplete: (params: { ad_account_id: string; name: string; objective_type: string; format?: string; targeting_criteria?: Record<string, any>; daily_budget_amount?: number; total_budget_amount?: number; currency_code?: string; cost_type?: string; unit_cost_amount?: number; run_schedule_start?: string; run_schedule_end?: string; pacing_strategy?: string }) => void
  onCancel: () => void
  audiences?: MatchedAudience[]
  audienceEstimate?: AudienceEstimate | null
  estimateLoading?: boolean
  onEstimateAudience?: (criteria: Record<string, any>) => void
}

function CampaignWizard({ onComplete, onCancel, audiences = [], audienceEstimate, estimateLoading, onEstimateAudience }: WizardProps) {
  const [step, setStep] = useState(1)
  const TOTAL_STEPS = 5

  // Step 1: Objective
  const [objective, setObjective] = useState('')

  // Step 2: Format
  const [format, setFormat] = useState('')

  // Step 3: Targeting
  const [jobFunctions, setJobFunctions] = useState<string[]>([])
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([])
  const [selectedSeniorities, setSelectedSeniorities] = useState<string[]>([])
  const [companySizes, setCompanySizes] = useState<string[]>([])
  const [selectedGeographies, setSelectedGeographies] = useState<string[]>([])
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([])

  // Step 4: Budget
  const [name, setName] = useState('')
  const [budgetType, setBudgetType] = useState<'daily' | 'lifetime'>('daily')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [costType, setCostType] = useState('CPC')
  const [bidAmount, setBidAmount] = useState('')
  const [scheduleStart, setScheduleStart] = useState('')
  const [scheduleEnd, setScheduleEnd] = useState('')

  const availableFormats = useMemo(() => {
    return FORMATS.filter((f) => f.objectives.includes(objective))
  }, [objective])

  // Build current targeting criteria for estimate
  const buildTargetingCriteria = useCallback(() => {
    const criteria: Record<string, any> = {}
    if (jobFunctions.length) criteria.job_functions = jobFunctions
    if (selectedIndustries.length) criteria.industries = selectedIndustries
    if (selectedSeniorities.length) criteria.seniorities = selectedSeniorities
    if (companySizes.length) criteria.company_sizes = companySizes
    if (selectedGeographies.length) criteria.geographies = selectedGeographies
    if (selectedAudiences.length) criteria.matched_audiences = selectedAudiences
    return criteria
  }, [jobFunctions, selectedIndustries, selectedSeniorities, companySizes, selectedGeographies, selectedAudiences])

  const hasTargeting = jobFunctions.length > 0 || selectedIndustries.length > 0 || selectedSeniorities.length > 0 || companySizes.length > 0 || selectedGeographies.length > 0 || selectedAudiences.length > 0

  const canAdvance = () => {
    switch (step) {
      case 1: return !!objective
      case 2: return !!format
      case 3: return true // targeting is optional
      case 4: return !!name && !!budgetAmount && parseFloat(budgetAmount) > 0
      case 5: return true
      default: return false
    }
  }

  const hasEuTargeting = selectedGeographies.some((g) => EU_COUNTRIES.includes(g))

  const handleCreate = () => {
    const targeting: Record<string, any> = {}
    if (jobFunctions.length) targeting.job_functions = jobFunctions
    if (selectedIndustries.length) targeting.industries = selectedIndustries
    if (selectedSeniorities.length) targeting.seniorities = selectedSeniorities
    if (companySizes.length) targeting.company_sizes = companySizes
    if (selectedGeographies.length) targeting.geographies = selectedGeographies
    if (selectedAudiences.length) targeting.matched_audiences = selectedAudiences

    onComplete({
      ad_account_id: '', // Will be filled from org integration
      name,
      objective_type: objective,
      format,
      targeting_criteria: Object.keys(targeting).length > 0 ? targeting : undefined,
      daily_budget_amount: budgetType === 'daily' ? parseFloat(budgetAmount) : undefined,
      total_budget_amount: budgetType === 'lifetime' ? parseFloat(budgetAmount) : undefined,
      currency_code: 'USD',
      cost_type: costType,
      unit_cost_amount: bidAmount ? parseFloat(bidAmount) : undefined,
      run_schedule_start: scheduleStart || undefined,
      run_schedule_end: scheduleEnd || undefined,
      pacing_strategy: budgetType === 'daily' ? 'DAILY' : 'LIFETIME',
    })
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-blue-500' : 'bg-zinc-700'}`} />
        ))}
      </div>

      {/* Step 1: Objective */}
      {step === 1 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">What's your campaign objective?</h3>
          <div className="grid grid-cols-2 gap-2">
            {OBJECTIVES.map((obj) => (
              <Card
                key={obj.value}
                className={`cursor-pointer transition-colors ${
                  objective === obj.value
                    ? '!bg-blue-500/10 !border-blue-500/40 ring-1 ring-blue-500/30'
                    : '!bg-zinc-800/50 !border-zinc-700/50 hover:!border-zinc-600'
                }`}
                onClick={() => setObjective(obj.value)}
              >
                <CardContent className="p-3">
                  <div className="text-sm font-medium text-zinc-200">{obj.label}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{obj.description}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Format */}
      {step === 2 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">Choose your ad format</h3>
          <p className="text-xs text-yellow-500/80">Format cannot be changed after creation</p>
          <div className="grid grid-cols-2 gap-2">
            {availableFormats.map((fmt) => (
              <Card
                key={fmt.value}
                className={`cursor-pointer transition-colors ${
                  format === fmt.value
                    ? '!bg-blue-500/10 !border-blue-500/40 ring-1 ring-blue-500/30'
                    : '!bg-zinc-800/50 !border-zinc-700/50 hover:!border-zinc-600'
                }`}
                onClick={() => setFormat(fmt.value)}
              >
                <CardContent className="p-3">
                  <div className="text-sm font-medium text-zinc-200">{fmt.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Targeting */}
      {step === 3 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">Define your audience</h3>
          <p className="text-xs text-zinc-500">Select targeting criteria. All fields are optional.</p>
          <div className="grid grid-cols-2 gap-3">
            <TargetingMultiSelect
              label="Job Functions"
              options={JOB_FUNCTIONS}
              selected={jobFunctions}
              onChange={setJobFunctions}
              searchable
            />
            <TargetingMultiSelect
              label="Seniority"
              options={SENIORITIES}
              selected={selectedSeniorities}
              onChange={setSelectedSeniorities}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TargetingMultiSelect
              label="Industries"
              options={TARGETING_INDUSTRIES}
              selected={selectedIndustries}
              onChange={setSelectedIndustries}
              searchable
            />
            <TargetingMultiSelect
              label="Company Size"
              options={COMPANY_SIZES}
              selected={companySizes}
              onChange={setCompanySizes}
            />
          </div>
          <TargetingMultiSelect
            label="Geographies"
            options={TARGETING_GEOGRAPHIES}
            selected={selectedGeographies}
            onChange={setSelectedGeographies}
            searchable
          />
          {hasEuTargeting && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <Shield className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-300">
                EU-targeted campaigns may be subject to political advertising regulations.
              </p>
            </div>
          )}

          {/* Matched Audiences selector */}
          {audiences.length > 0 && (
            <>
              <div className="border-t border-zinc-700 pt-3">
                <label className="text-xs text-zinc-400 mb-1.5 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Matched Audiences
                </label>
                <Select
                  value=""
                  onValueChange={(id) => {
                    if (!selectedAudiences.includes(id)) {
                      setSelectedAudiences((prev) => [...prev, id])
                    }
                  }}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue placeholder="Add a matched audience..." />
                  </SelectTrigger>
                  <SelectContent>
                    {audiences
                      .filter((a) => !selectedAudiences.includes(a.id))
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({a.audience_type === 'CONTACT_LIST' ? 'Contacts' : 'Companies'})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {selectedAudiences.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedAudiences.map((id) => {
                      const aud = audiences.find((a) => a.id === id)
                      return (
                        <Badge key={id} variant="secondary" className="bg-blue-500/10 text-blue-400 border-blue-500/20 pr-1">
                          {aud?.name ?? id.slice(0, 8)}
                          <button
                            type="button"
                            className="ml-1 hover:text-blue-200"
                            onClick={() => setSelectedAudiences((prev) => prev.filter((a) => a !== id))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Audience size estimate */}
          {hasTargeting && (
            <div className="border-t border-zinc-700 pt-3">
              {estimateLoading ? (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Estimating audience size...
                </div>
              ) : audienceEstimate?.estimated_count != null ? (
                <div className="flex items-center gap-2 text-xs text-zinc-300">
                  <Users className="h-3.5 w-3.5 text-blue-400" />
                  ~{formatNumber(audienceEstimate.estimated_count)} members match
                  <button
                    type="button"
                    className="ml-auto text-zinc-500 hover:text-zinc-300"
                    onClick={() => onEstimateAudience?.(buildTargetingCriteria())}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </div>
              ) : audienceEstimate?.error ? (
                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">{audienceEstimate.error}</div>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300"
                    onClick={() => onEstimateAudience?.(buildTargetingCriteria())}
                  >
                    <RefreshCw className="h-3 w-3" /> Retry estimate
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300"
                  onClick={() => onEstimateAudience?.(buildTargetingCriteria())}
                >
                  <Users className="h-3.5 w-3.5" /> Estimate audience size
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 4: Budget & Schedule */}
      {step === 4 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">Budget, bid, and schedule</h3>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Campaign Name</label>
            <Input placeholder="My LinkedIn Campaign" className="bg-zinc-800 border-zinc-700"
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Budget Type</label>
              <Select value={budgetType} onValueChange={(v) => setBudgetType(v as 'daily' | 'lifetime')}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Budget</SelectItem>
                  <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Amount (USD)</label>
              <Input type="number" placeholder="50" className="bg-zinc-800 border-zinc-700"
                value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Bid Strategy</label>
              <Select value={costType} onValueChange={setCostType}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BID_STRATEGIES.map((bs) => (
                    <SelectItem key={bs.value} value={bs.value}>{bs.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Bid Amount (optional)</label>
              <Input type="number" placeholder="5.00" className="bg-zinc-800 border-zinc-700"
                value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Start Date (optional)</label>
              <Input type="date" className="bg-zinc-800 border-zinc-700"
                value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">End Date (optional)</label>
              <Input type="date" className="bg-zinc-800 border-zinc-700"
                value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Review */}
      {step === 5 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">Review your campaign</h3>
          <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-zinc-500">Name</span><span className="text-zinc-200">{name}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Objective</span><span className="text-zinc-200">{OBJECTIVE_LABELS[objective]}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Format</span><span className="text-zinc-200">{FORMAT_LABELS[format]}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Budget</span><span className="text-zinc-200">${budgetAmount} {budgetType}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Bid Strategy</span><span className="text-zinc-200">{costType}{bidAmount ? ` ($${bidAmount})` : ''}</span></div>
            {jobFunctions.length > 0 && <div className="flex justify-between"><span className="text-zinc-500">Job Functions</span><span className="text-zinc-200 text-right max-w-[200px] truncate">{jobFunctions.map((v) => JOB_FUNCTIONS.find((o) => o.value === v)?.label ?? v).join(', ')}</span></div>}
            {selectedSeniorities.length > 0 && <div className="flex justify-between"><span className="text-zinc-500">Seniorities</span><span className="text-zinc-200 text-right max-w-[200px] truncate">{selectedSeniorities.map((v) => SENIORITIES.find((o) => o.value === v)?.label ?? v).join(', ')}</span></div>}
            {selectedIndustries.length > 0 && <div className="flex justify-between"><span className="text-zinc-500">Industries</span><span className="text-zinc-200 text-right max-w-[200px] truncate">{selectedIndustries.map((v) => TARGETING_INDUSTRIES.find((o) => o.value === v)?.label ?? v).join(', ')}</span></div>}
            {companySizes.length > 0 && <div className="flex justify-between"><span className="text-zinc-500">Company Sizes</span><span className="text-zinc-200 text-right max-w-[200px] truncate">{companySizes.map((v) => COMPANY_SIZES.find((o) => o.value === v)?.label ?? v).join(', ')}</span></div>}
            {selectedGeographies.length > 0 && <div className="flex justify-between"><span className="text-zinc-500">Geographies</span><span className="text-zinc-200 text-right max-w-[200px] truncate">{selectedGeographies.map((v) => TARGETING_GEOGRAPHIES.find((o) => o.value === v)?.label ?? v).join(', ')}</span></div>}
            {selectedAudiences.length > 0 && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Audiences</span>
                <span className="text-zinc-200 text-right max-w-[200px]">
                  {selectedAudiences.map((id) => audiences.find((a) => a.id === id)?.name ?? id.slice(0, 8)).join(', ')}
                </span>
              </div>
            )}
            {scheduleStart && <div className="flex justify-between"><span className="text-zinc-500">Schedule</span><span className="text-zinc-200">{scheduleStart} - {scheduleEnd || 'No end'}</span></div>}
            <div className="flex justify-between pt-2 border-t border-zinc-700">
              <span className="text-zinc-500">Status</span>
              <Badge variant="outline" className={STATUS_COLORS['DRAFT']}>DRAFT</Badge>
            </div>
          </div>
          <p className="text-xs text-zinc-500">Campaign will be created as a draft. Activation requires approval.</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={step === 1 ? onCancel : () => setStep(step - 1)}>
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>
        <span className="text-xs text-zinc-500">Step {step} of {TOTAL_STEPS}</span>
        {step < TOTAL_STEPS ? (
          <Button size="sm" disabled={!canAdvance()} onClick={() => setStep(step + 1)}>Next</Button>
        ) : (
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" /> Create Campaign
          </Button>
        )}
      </div>
    </div>
  )
}

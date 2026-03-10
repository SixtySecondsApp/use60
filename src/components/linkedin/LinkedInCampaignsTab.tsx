import { useState, useEffect } from 'react'
import { Plus, RefreshCw, Loader2, Play, Pause, Archive, Eye, DollarSign, MousePointerClick, Users, TrendingUp, Image, Video, LayoutGrid, Type, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CampaignWizard from '@/components/linkedin/CampaignWizard'
import CampaignDriftDetector from '@/components/linkedin/CampaignDriftDetector'
import { useLinkedInAdManager } from '@/lib/hooks/useLinkedInAdManager'
import { useOrgMoney } from '@/lib/hooks/useOrgMoney'
import type { ManagedCampaign, ManagedCreative } from '@/lib/services/linkedinAdManagerService'

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  PAUSED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  ARCHIVED: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
}

function statusBadge(status: string) {
  const cls = STATUS_COLORS[status] || STATUS_COLORS.DRAFT
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${cls}`}>
      {status}
    </span>
  )
}

function formatCurrency(amount: number | null | undefined, orgCurrency = 'GBP') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: orgCurrency, maximumFractionDigits: 0 }).format(amount)
}

function formatNumber(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

// ---------------------------------------------------------------------------
// Campaign Card
// ---------------------------------------------------------------------------

function LinkedInCampaignCard({
  campaign,
  onSelect,
  onStatusChange,
  statusChanging,
  orgCurrency,
}: {
  campaign: ManagedCampaign
  onSelect: (c: ManagedCampaign) => void
  onStatusChange: (id: string, status: string) => void
  statusChanging: boolean
  orgCurrency: string
}) {
  return (
    <button
      onClick={() => onSelect(campaign)}
      className="w-full text-left p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            {statusBadge(campaign.status)}
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {campaign.name}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1.5">
            {campaign.objective_type && (
              <span className="capitalize">{campaign.objective_type.toLowerCase().replace(/_/g, ' ')}</span>
            )}
            {campaign.format && (
              <>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span className="capitalize">{campaign.format.toLowerCase().replace(/_/g, ' ')}</span>
              </>
            )}
            {campaign.daily_budget_amount != null && (
              <>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span>{formatCurrency(campaign.daily_budget_amount, orgCurrency)}/day</span>
              </>
            )}
          </div>
        </div>

        {/* Quick metrics */}
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 shrink-0">
          {campaign.total_impressions != null && (
            <div className="text-center">
              <div className="font-medium text-gray-900 dark:text-white">{formatNumber(campaign.total_impressions)}</div>
              <div>Impr</div>
            </div>
          )}
          {campaign.total_clicks != null && (
            <div className="text-center">
              <div className="font-medium text-gray-900 dark:text-white">{formatNumber(campaign.total_clicks)}</div>
              <div>Clicks</div>
            </div>
          )}
          {campaign.total_spend != null && (
            <div className="text-center">
              <div className="font-medium text-gray-900 dark:text-white">{formatCurrency(campaign.total_spend, orgCurrency)}</div>
              <div>Spend</div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons (visible on hover) */}
      <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        {campaign.status === 'ACTIVE' && (
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" disabled={statusChanging} onClick={() => onStatusChange(campaign.id, 'PAUSED')}>
            <Pause className="h-3 w-3 mr-1" /> Pause
          </Button>
        )}
        {campaign.status === 'PAUSED' && (
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" disabled={statusChanging} onClick={() => onStatusChange(campaign.id, 'ACTIVE')}>
            <Play className="h-3 w-3 mr-1" /> Activate
          </Button>
        )}
        {campaign.status === 'DRAFT' && (
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" disabled={statusChanging} onClick={() => onStatusChange(campaign.id, 'ACTIVE')}>
            <Play className="h-3 w-3 mr-1" /> Launch
          </Button>
        )}
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Campaign Detail Sheet
// ---------------------------------------------------------------------------

const MEDIA_TYPE_ICONS: Record<string, typeof Image> = {
  IMAGE: Image,
  VIDEO: Video,
  CAROUSEL: LayoutGrid,
  TEXT: Type,
}

function CreativeCard({ creative }: { creative: ManagedCreative }) {
  const Icon = MEDIA_TYPE_ICONS[creative.media_type?.toUpperCase()] || Zap
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-500/10">
        <Icon className="h-4 w-4 text-indigo-400" />
      </div>
      <div className="min-w-0 flex-1">
        {creative.headline && (
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{creative.headline}</p>
        )}
        {creative.body_text && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{creative.body_text}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {creative.media_type?.toLowerCase() || 'unknown'}
          </Badge>
          {creative.cta_text && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {creative.cta_text}
            </Badge>
          )}
          <span className={`text-[10px] font-medium ${creative.status === 'ACTIVE' ? 'text-green-500' : 'text-gray-400'}`}>
            {creative.status}
          </span>
        </div>
      </div>
    </div>
  )
}

function CampaignDetailSheet({
  campaign,
  open,
  onOpenChange,
  orgCurrency,
  creatives,
  creativesLoading,
  onLoadCreatives,
}: {
  campaign: ManagedCampaign | null
  open: boolean
  onOpenChange: (open: boolean) => void
  orgCurrency: string
  creatives: ManagedCreative[]
  creativesLoading: boolean
  onLoadCreatives: (campaignId: string) => void
}) {
  // Load creatives when sheet opens with a campaign
  useEffect(() => {
    if (open && campaign) {
      onLoadCreatives(campaign.id)
    }
  }, [open, campaign?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!campaign) return null

  const metrics = [
    { label: 'Impressions', value: formatNumber(campaign.total_impressions), icon: Eye },
    { label: 'Clicks', value: formatNumber(campaign.total_clicks), icon: MousePointerClick },
    { label: 'Spend', value: formatCurrency(campaign.total_spend, orgCurrency), icon: DollarSign },
    { label: 'Leads', value: formatNumber(campaign.total_leads), icon: Users },
    { label: 'CTR', value: campaign.avg_ctr != null ? `${(campaign.avg_ctr * 100).toFixed(2)}%` : '—', icon: TrendingUp },
    { label: 'CPC', value: formatCurrency(campaign.avg_cpc, orgCurrency), icon: DollarSign },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!top-16 !h-[calc(100vh-4rem)] w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            {statusBadge(campaign.status)}
            <SheetTitle className="text-base">{campaign.name}</SheetTitle>
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          {/* Metrics grid */}
          <div className="grid grid-cols-3 gap-3">
            {metrics.map((m) => (
              <div key={m.label} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 text-center">
                <m.icon className="h-3.5 w-3.5 mx-auto mb-1 text-gray-400" />
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{m.value}</div>
                <div className="text-[10px] text-gray-500">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Details */}
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Objective</span>
              <span className="text-gray-900 dark:text-white capitalize">{(campaign.objective_type || '—').toLowerCase().replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Format</span>
              <span className="text-gray-900 dark:text-white capitalize">{(campaign.format || '—').toLowerCase().replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Daily Budget</span>
              <span className="text-gray-900 dark:text-white">{formatCurrency(campaign.daily_budget_amount, orgCurrency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total Budget</span>
              <span className="text-gray-900 dark:text-white">{formatCurrency(campaign.total_budget_amount, orgCurrency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Pacing</span>
              <span className="text-gray-900 dark:text-white capitalize">{(campaign.pacing_strategy || '—').toLowerCase()}</span>
            </div>
            {campaign.run_schedule_start && (
              <div className="flex justify-between">
                <span className="text-gray-500">Start</span>
                <span className="text-gray-900 dark:text-white">{new Date(campaign.run_schedule_start).toLocaleDateString()}</span>
              </div>
            )}
            {campaign.run_schedule_end && (
              <div className="flex justify-between">
                <span className="text-gray-500">End</span>
                <span className="text-gray-900 dark:text-white">{new Date(campaign.run_schedule_end).toLocaleDateString()}</span>
              </div>
            )}
            {campaign.last_synced_at && (
              <div className="flex justify-between">
                <span className="text-gray-500">Last Synced</span>
                <span className="text-gray-900 dark:text-white">{new Date(campaign.last_synced_at).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Creatives section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <Image className="h-4 w-4 text-gray-400" />
                Creatives
              </h3>
              {!creativesLoading && (
                <span className="text-xs text-gray-500">{creatives.length} creative{creatives.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            {creativesLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : creatives.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                No creatives yet for this campaign.
              </div>
            ) : (
              <div className="space-y-2">
                {creatives.map((creative) => (
                  <CreativeCard key={creative.id} creative={creative} />
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Campaigns Tab — LinkedIn campaign management
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | 'ACTIVE' | 'PAUSED' | 'DRAFT' | 'ARCHIVED'

export default function LinkedInCampaignsTab() {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedCampaign, setSelectedCampaign] = useState<ManagedCampaign | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)
  const { currencyCode: orgCurrency } = useOrgMoney()
  const {
    campaigns,
    campaignsLoading,
    loadCampaigns,
    syncCampaigns,
    syncing,
    createCampaign,
    updateCampaignStatus,
    audiences,
    audienceEstimate,
    estimateLoading,
    estimateAudienceSize,
    creatives,
    creativesLoading,
    loadCreatives,
  } = useLinkedInAdManager()

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  const handleComplete = async (params: Parameters<typeof createCampaign>[0]) => {
    setCreating(true)
    try {
      const result = await createCampaign(params)
      if (result) {
        setWizardOpen(false)
      }
    } finally {
      setCreating(false)
    }
  }

  const handleStatusChange = async (campaignId: string, status: string) => {
    setStatusChanging(true)
    try {
      await updateCampaignStatus(campaignId, status)
    } finally {
      setStatusChanging(false)
    }
  }

  const filtered = statusFilter === 'all'
    ? campaigns
    : campaigns.filter((c) => c.status === statusFilter)

  const statusCounts: Record<string, number> = { all: campaigns.length }
  for (const c of campaigns) {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1
  }

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList className="h-auto gap-1 bg-transparent p-0">
            {(['all', 'ACTIVE', 'PAUSED', 'DRAFT', 'ARCHIVED'] as StatusFilter[]).map((s) => (
              <TabsTrigger
                key={s}
                value={s}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-indigo-500/15 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400 data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-500"
              >
                {s === 'all' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                <span className="ml-1 text-xs opacity-60">{statusCounts[s] || 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => syncCampaigns()} disabled={syncing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Campaign
          </Button>
        </div>
      </div>

      {/* Drift detection banner */}
      <CampaignDriftDetector
        campaigns={campaigns.map((c) => ({
          id: c.id,
          campaign_name: c.name,
          status: c.status,
          updated_at: c.updated_at,
          last_synced_at: c.last_synced_at,
          metadata: c.is_externally_modified
            ? { status_changed: true, ...(c.last_external_modification_at ? { last_external_modification_at: c.last_external_modification_at } : {}) }
            : undefined,
        }))}
        onSync={syncCampaigns}
        syncing={syncing}
      />

      {/* Campaign list */}
      {campaignsLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 gap-4 text-gray-400 dark:text-gray-500">
          <Archive className="h-12 w-12 opacity-20" />
          <p className="text-sm">
            {campaigns.length === 0
              ? 'No LinkedIn campaigns yet. Create one or sync from LinkedIn.'
              : `No ${statusFilter.toLowerCase()} campaigns.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((campaign) => (
            <LinkedInCampaignCard
              key={campaign.id}
              campaign={campaign}
              onSelect={(c) => { setSelectedCampaign(c); setDetailOpen(true) }}
              onStatusChange={handleStatusChange}
              statusChanging={statusChanging}
              orgCurrency={orgCurrency}
            />
          ))}
        </div>
      )}

      {/* Detail sheet */}
      <CampaignDetailSheet
        campaign={selectedCampaign}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        orgCurrency={orgCurrency}
        creatives={creatives}
        creativesLoading={creativesLoading}
        onLoadCreatives={loadCreatives}
      />

      {/* Campaign Wizard Dialog */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Campaign</DialogTitle>
            <DialogDescription>Set up a LinkedIn ad campaign step by step</DialogDescription>
          </DialogHeader>
          <CampaignWizard
            onComplete={handleComplete}
            onCancel={() => setWizardOpen(false)}
            creating={creating}
            audiences={audiences}
            audienceEstimate={audienceEstimate}
            estimateLoading={estimateLoading}
            onEstimateAudience={estimateAudienceSize}
            orgCurrency={orgCurrency}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

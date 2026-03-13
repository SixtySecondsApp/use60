import { useState, useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import {
  ArrowUpDown, CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
  Plus, Trash2, Upload, ToggleLeft, ToggleRight, TrendingUp, Activity,
  Target, DollarSign, Users, Calendar, Send, RotateCcw, Eye, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useLinkedInConversions } from '@/lib/hooks/useLinkedInConversions'
import { useLinkedInIntegration } from '@/lib/hooks/useLinkedInIntegration'
import { supabase } from '@/lib/supabase/clientV2'
import { useOrgStore } from '@/lib/stores/orgStore'
import type { ConversionRule } from '@/lib/services/conversionService'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MILESTONES = [
  { value: 'qualified_lead', label: 'Qualified Lead', icon: Target, color: 'text-blue-400' },
  { value: 'meeting_booked', label: 'Meeting Booked', icon: Calendar, color: 'text-purple-400' },
  { value: 'meeting_held', label: 'Meeting Held', icon: Users, color: 'text-indigo-400' },
  { value: 'proposal_sent', label: 'Proposal Sent', icon: Send, color: 'text-amber-400' },
  { value: 'closed_won', label: 'Closed Won', icon: DollarSign, color: 'text-green-400' },
] as const

const STATUS_COLORS: Record<string, string> = {
  delivered: 'bg-green-500/10 text-green-400 border-green-500/20',
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  processing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  dead_letter: 'bg-red-500/10 text-red-300 border-red-500/20',
}

// ---------------------------------------------------------------------------
// Campaign Performance Hook (reads from view)
// ---------------------------------------------------------------------------

function useCampaignPerformance() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!activeOrgId) return
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('linkedin_campaign_performance')
        .select('campaign_name, source_channel, total_leads, leads_with_deals, total_deals, won_deals, won_revenue, total_meetings, proposals_sent, qualified_leads')
        .eq('org_id', activeOrgId)

      if (error) throw error
      setCampaigns(data ?? [])
    } catch (e: any) {
      toast.error(e.message || 'Failed to load campaign performance')
    } finally {
      setLoading(false)
    }
  }, [activeOrgId])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { campaigns, loading, refresh: fetch }
}

// ---------------------------------------------------------------------------
// Create Rule Dialog
// ---------------------------------------------------------------------------

function CreateRuleDialog({
  open,
  onOpenChange,
  onSubmit,
  adAccountId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (params: any) => Promise<any>
  adAccountId: string
}) {
  const [name, setName] = useState('')
  const [milestone, setMilestone] = useState('')
  const [value, setValue] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!name || !milestone) {
      toast.error('Name and milestone event are required')
      return
    }
    try {
      setSubmitting(true)
      await onSubmit({
        name,
        milestone_event: milestone,
        linkedin_ad_account_id: adAccountId,
        conversion_value_amount: value ? parseFloat(value) : undefined,
        conversion_value_currency: currency,
      })
      setName('')
      setMilestone('')
      setValue('')
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Conversion Rule</DialogTitle>
          <DialogDescription>
            Define a conversion rule that maps a pipeline milestone to a LinkedIn conversion event.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">Rule Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Meeting Booked — Enterprise"
              className="bg-zinc-900 border-zinc-800"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">Pipeline Milestone</label>
            <Select value={milestone} onValueChange={setMilestone}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800">
                <SelectValue placeholder="Select milestone" />
              </SelectTrigger>
              <SelectContent>
                {MILESTONES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1 block">Value (optional)</label>
              <Input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
                className="bg-zinc-900 border-zinc-800"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1 block">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="AUD">AUD</SelectItem>
                  <SelectItem value="CAD">CAD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !name || !milestone}>
            {submitting ? 'Creating...' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function LinkedInRevenue() {
  const {
    rules, rulesLoading, fetchRules, createRule, updateRule, deleteRule, syncRule, syncing,
    mappings, mappingsLoading, toggleMapping,
    events, eventsLoading, stats, fetchEvents, retryFailed,
    refreshAll, ready,
  } = useLinkedInConversions()

  const { isConnected, integration } = useLinkedInIntegration()
  const { campaigns, loading: campaignsLoading, refresh: refreshCampaigns } = useCampaignPerformance()

  const [activeTab, setActiveTab] = useState('overview')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)

  const adAccountId = integration?.linkedin_ad_account_id || ''

  // Stats cards
  const overviewStats = useMemo(() => {
    const totalLeads = campaigns.reduce((sum, c) => sum + (c.total_leads || 0), 0)
    const qualifiedLeads = campaigns.reduce((sum, c) => sum + (c.qualified_leads || 0), 0)
    const totalMeetings = campaigns.reduce((sum, c) => sum + (c.total_meetings || 0), 0)
    const wonDeals = campaigns.reduce((sum, c) => sum + (c.won_deals || 0), 0)
    const wonRevenue = campaigns.reduce((sum, c) => sum + (c.won_revenue || 0), 0)
    const proposalsSent = campaigns.reduce((sum, c) => sum + (c.proposals_sent || 0), 0)

    return { totalLeads, qualifiedLeads, totalMeetings, wonDeals, wonRevenue, proposalsSent }
  }, [campaigns])

  if (!ready) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">LinkedIn Revenue Feedback</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Send pipeline outcomes back to LinkedIn to optimize campaigns for revenue quality
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isConnected && (
            <Badge variant="outline" className="text-amber-400 border-amber-500/30">
              <AlertTriangle className="h-3 w-3 mr-1" />
              LinkedIn not connected
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'LinkedIn Leads', value: overviewStats.totalLeads, icon: Users, color: 'text-blue-400' },
          { label: 'Qualified', value: overviewStats.qualifiedLeads, icon: Target, color: 'text-emerald-400' },
          { label: 'Meetings', value: overviewStats.totalMeetings, icon: Calendar, color: 'text-purple-400' },
          { label: 'Proposals', value: overviewStats.proposalsSent, icon: Send, color: 'text-amber-400' },
          { label: 'Won Deals', value: overviewStats.wonDeals, icon: CheckCircle2, color: 'text-green-400' },
          { label: 'Revenue', value: `$${overviewStats.wonRevenue.toLocaleString()}`, icon: DollarSign, color: 'text-green-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-zinc-800/60 bg-zinc-900/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-xs text-zinc-500">{label}</span>
              </div>
              <div className="text-lg font-semibold text-zinc-100">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Campaign Performance</TabsTrigger>
          <TabsTrigger value="rules">Conversion Rules</TabsTrigger>
          <TabsTrigger value="events">Event Stream</TabsTrigger>
        </TabsList>

        {/* ----------------------------------------------------------- */}
        {/* Campaign Performance Tab */}
        {/* ----------------------------------------------------------- */}
        <TabsContent value="overview" className="space-y-4">
          {campaignsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <TrendingUp className="h-8 w-8 text-zinc-600 mb-3" />
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">No LinkedIn campaign data yet</h3>
              <p className="text-xs text-zinc-500 max-w-sm">
                Campaign performance data will appear here once LinkedIn-sourced leads flow through your pipeline.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                    <th className="text-left py-3 px-3 font-medium">Campaign</th>
                    <th className="text-right py-3 px-3 font-medium">Leads</th>
                    <th className="text-right py-3 px-3 font-medium">Qualified</th>
                    <th className="text-right py-3 px-3 font-medium">Meetings</th>
                    <th className="text-right py-3 px-3 font-medium">Proposals</th>
                    <th className="text-right py-3 px-3 font-medium">Won</th>
                    <th className="text-right py-3 px-3 font-medium">Revenue</th>
                    <th className="text-right py-3 px-3 font-medium">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign, i) => {
                    const qualRate = campaign.total_leads > 0
                      ? Math.round((campaign.qualified_leads / campaign.total_leads) * 100)
                      : 0
                    const meetingRate = campaign.total_leads > 0
                      ? Math.round((campaign.total_meetings / campaign.total_leads) * 100)
                      : 0
                    const isLowQuality = campaign.total_leads >= 5 && meetingRate < 10

                    return (
                      <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                        <td className="py-3 px-3">
                          <div className="font-medium text-zinc-200 truncate max-w-[200px]">
                            {campaign.campaign_name || 'Unknown Campaign'}
                          </div>
                          <div className="text-xs text-zinc-500">{campaign.source_channel}</div>
                        </td>
                        <td className="text-right py-3 px-3 text-zinc-300">{campaign.total_leads}</td>
                        <td className="text-right py-3 px-3 text-zinc-300">{campaign.qualified_leads}</td>
                        <td className="text-right py-3 px-3 text-zinc-300">{campaign.total_meetings}</td>
                        <td className="text-right py-3 px-3 text-zinc-300">{campaign.proposals_sent}</td>
                        <td className="text-right py-3 px-3 text-zinc-300">{campaign.won_deals}</td>
                        <td className="text-right py-3 px-3 text-green-400 font-medium">
                          ${(campaign.won_revenue || 0).toLocaleString()}
                        </td>
                        <td className="text-right py-3 px-3">
                          {isLowQuality ? (
                            <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Low
                            </Badge>
                          ) : qualRate > 30 ? (
                            <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                              High
                            </Badge>
                          ) : (
                            <Badge variant="secondary">{qualRate}%</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-zinc-600 mt-3 px-3">
                Attribution: last-touch by LinkedIn source. Quality score based on lead-to-meeting conversion rate.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ----------------------------------------------------------- */}
        {/* Conversion Rules Tab */}
        {/* ----------------------------------------------------------- */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              Map pipeline milestones to LinkedIn conversion rules
            </p>
            <Button size="sm" onClick={() => setCreateDialogOpen(true)} disabled={!adAccountId}>
              <Plus className="h-4 w-4 mr-1" />
              Create Rule
            </Button>
          </div>

          {rulesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Activity className="h-8 w-8 text-zinc-600 mb-3" />
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">No conversion rules yet</h3>
              <p className="text-xs text-zinc-500 max-w-sm">
                Create rules to define which pipeline events get sent back to LinkedIn as conversion signals.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => {
                const milestone = MILESTONES.find(m => m.value === rule.milestone_event)
                const MilestoneIcon = milestone?.icon || Target
                const mapping = mappings.find(m => m.rule_id === rule.id)

                return (
                  <Card key={rule.id} className="border-zinc-800/60 bg-zinc-900/40">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-lg bg-zinc-800/60`}>
                            <MilestoneIcon className={`h-4 w-4 ${milestone?.color || 'text-zinc-400'}`} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-zinc-200 truncate">{rule.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-[10px]">
                                {milestone?.label || rule.milestone_event}
                              </Badge>
                              {rule.is_synced ? (
                                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3 mr-0.5" />
                                  Synced
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
                                  <Clock className="h-3 w-3 mr-0.5" />
                                  Not synced
                                </Badge>
                              )}
                              {rule.conversion_value_amount && (
                                <span className="text-xs text-zinc-500">
                                  {rule.conversion_value_currency} {rule.conversion_value_amount}
                                </span>
                              )}
                            </div>
                            {rule.sync_error && (
                              <p className="text-[11px] text-red-400 mt-1 truncate max-w-md">{rule.sync_error}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {mapping && (
                            <Switch
                              checked={mapping.is_enabled}
                              onCheckedChange={(enabled) => toggleMapping(mapping.id, enabled)}
                            />
                          )}
                          {!rule.is_synced && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => syncRule(rule.id)}
                              disabled={syncing === rule.id}
                            >
                              {syncing === rule.id ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                <Upload className="h-3 w-3 mr-1" />
                              )}
                              Sync
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteRule(rule.id)}
                            className="text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ----------------------------------------------------------- */}
        {/* Event Stream Tab */}
        {/* ----------------------------------------------------------- */}
        <TabsContent value="events" className="space-y-4">
          {/* Delivery stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Total Events', value: stats.total_events, color: 'text-zinc-300' },
                { label: 'Delivered', value: stats.delivered, color: 'text-green-400' },
                { label: 'Pending', value: stats.pending, color: 'text-yellow-400' },
                { label: 'Failed', value: stats.failed, color: 'text-red-400' },
                { label: 'Delivery Rate', value: `${stats.delivery_rate}%`, color: 'text-blue-400' },
              ].map(({ label, value, color }) => (
                <Card key={label} className="border-zinc-800/60 bg-zinc-900/40">
                  <CardContent className="p-3">
                    <div className="text-xs text-zinc-500">{label}</div>
                    <div className={`text-lg font-semibold ${color}`}>{value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">Recent conversion events</p>
            <div className="flex gap-2">
              {(stats?.failed ?? 0) > 0 && (
                <Button variant="outline" size="sm" onClick={retryFailed}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Retry Failed
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => fetchEvents()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {eventsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Send className="h-8 w-8 text-zinc-600 mb-3" />
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">No conversion events yet</h3>
              <p className="text-xs text-zinc-500 max-w-sm">
                Events will appear here as pipeline milestones trigger conversion signals to LinkedIn.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {events.map((event) => {
                const milestone = MILESTONES.find(m => m.value === event.milestone_event)
                const MilestoneIcon = milestone?.icon || Target

                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-800/40 bg-zinc-900/20 px-3 py-2 hover:bg-zinc-800/20 cursor-pointer"
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MilestoneIcon className={`h-4 w-4 flex-shrink-0 ${milestone?.color || 'text-zinc-400'}`} />
                      <div className="min-w-0">
                        <div className="text-sm text-zinc-200">
                          {milestone?.label || event.milestone_event}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          {event.user_email || event.contact_id?.slice(0, 8) || 'Unknown'}
                          {event.value_amount ? ` — $${event.value_amount}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${STATUS_COLORS[event.status] || ''}`}>
                        {event.status}
                      </Badge>
                      <span className="text-[11px] text-zinc-600">
                        {new Date(event.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Rule Dialog */}
      <CreateRuleDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={createRule}
        adAccountId={adAccountId}
      />

      {/* Event Detail Sheet */}
      <Sheet open={!!selectedEvent} onOpenChange={(v) => !v && setSelectedEvent(null)}>
        <SheetContent className="!top-16 !h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Conversion Event</SheetTitle>
            <SheetDescription>Delivery details and audit trail</SheetDescription>
          </SheetHeader>
          {selectedEvent && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-zinc-500 text-xs">Milestone</span>
                  <p className="text-zinc-200">{MILESTONES.find(m => m.value === selectedEvent.milestone_event)?.label}</p>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs">Status</span>
                  <p><Badge className={STATUS_COLORS[selectedEvent.status]}>{selectedEvent.status}</Badge></p>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs">Email</span>
                  <p className="text-zinc-200 truncate">{selectedEvent.user_email || '—'}</p>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs">Value</span>
                  <p className="text-zinc-200">{selectedEvent.value_amount ? `$${selectedEvent.value_amount}` : '—'}</p>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs">Event Time</span>
                  <p className="text-zinc-200">{new Date(selectedEvent.event_time).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs">Retries</span>
                  <p className="text-zinc-200">{selectedEvent.retry_count}</p>
                </div>
                {selectedEvent.delivered_at && (
                  <div className="col-span-2">
                    <span className="text-zinc-500 text-xs">Delivered At</span>
                    <p className="text-green-400">{new Date(selectedEvent.delivered_at).toLocaleString()}</p>
                  </div>
                )}
                {selectedEvent.last_error && (
                  <div className="col-span-2">
                    <span className="text-zinc-500 text-xs">Last Error</span>
                    <p className="text-red-400 text-xs break-all">{selectedEvent.last_error}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

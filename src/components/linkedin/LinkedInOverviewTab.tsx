import { useEffect, useState } from 'react'
import { useLinkedInIntegration } from '@/lib/hooks/useLinkedInIntegration'
import { useLinkedInAdManager } from '@/lib/hooks/useLinkedInAdManager'
import { supabase } from '@/lib/supabase/clientV2'
import { useOrgStore } from '@/lib/stores/orgStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Send,
  BarChart3,
  Eye,
  ArrowRight,
  Loader2,
  Zap,
  Search,
  TrendingUp,
  GitBranch,
  ChevronRight,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Attribution chain steps
// ---------------------------------------------------------------------------

const ATTRIBUTION_STEPS = [
  { type: 'ad_library_insight', label: 'Ad Insights', color: 'text-amber-400' },
  { type: 'campaign_created', label: 'Campaigns', color: 'text-purple-400' },
  { type: 'lead_captured', label: 'Leads', color: 'text-blue-400' },
  { type: 'contact_created', label: 'Contacts', color: 'text-cyan-400' },
  { type: 'deal_created', label: 'Deals', color: 'text-emerald-400' },
  { type: 'deal_won', label: 'Revenue', color: 'text-green-400' },
]

// ---------------------------------------------------------------------------
// Overview Tab — Landing page for the LinkedIn hub
// ---------------------------------------------------------------------------

export default function LinkedInOverviewTab() {
  const { isConnected, loading, integration, connectLinkedIn, leadSources } = useLinkedInIntegration()
  const { campaigns, campaignsLoading } = useLinkedInAdManager()
  const activeOrgId = useOrgStore((s) => s.activeOrgId)

  // Live stats from DB
  const [adCount, setAdCount] = useState<number | null>(null)
  const [leadCount, setLeadCount] = useState<number | null>(null)
  const [attribution, setAttribution] = useState<Record<string, number> | null>(null)

  // Fetch ad library count, recent lead count, and attribution chain
  useEffect(() => {
    if (!isConnected || !activeOrgId) return

    const fetchStats = async () => {
      // Competitor ads tracked
      const { count: ads } = await supabase
        .from('linkedin_ad_library_ads')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', activeOrgId)

      setAdCount(ads ?? 0)

      // Leads captured (last 7 days)
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      const { count: leads } = await supabase
        .from('linkedin_lead_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', activeOrgId)
        .gte('created_at', weekAgo.toISOString())

      setLeadCount(leads ?? 0)

      // Attribution chain counts
      const { data: attrData } = await supabase
        .from('linkedin_attribution_events')
        .select('event_type')
        .eq('org_id', activeOrgId)

      if (attrData && attrData.length > 0) {
        const counts: Record<string, number> = {}
        for (const row of attrData) {
          counts[row.event_type] = (counts[row.event_type] || 0) + 1
        }
        setAttribution(counts)
      } else {
        setAttribution({})
      }
    }

    fetchStats()
  }, [isConnected, activeOrgId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-700/50 bg-gradient-to-br from-blue-500/10 to-blue-600/10 mb-4">
          <XCircle className="w-7 h-7 text-zinc-500" />
        </div>
        <h3 className="text-base font-semibold text-zinc-200 mb-2">
          Connect Your LinkedIn Account
        </h3>
        <p className="text-sm text-zinc-500 max-w-sm mb-6">
          Link your LinkedIn ad account to start managing campaigns, tracking leads,
          and analyzing performance — all from one place.
        </p>
        <Button onClick={connectLinkedIn} className="gap-2">
          Connect LinkedIn
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    )
  }

  const activeCampaigns = campaigns.filter(
    (c) => c.status === 'ACTIVE' || c.status === 'active'
  )

  return (
    <div className="space-y-6">
      {/* Connection status */}
      <Card className="border-zinc-800/60 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            Connected
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm flex-wrap">
            {integration?.linkedin_ad_account_name && (
              <span className="text-zinc-200">
                {integration.linkedin_ad_account_name}
              </span>
            )}
            {integration?.scopes && integration.scopes.length > 0 && (
              <Badge variant="outline" className="text-xs text-zinc-500">
                {integration.scopes.length} scopes
              </Badge>
            )}
            {integration?.last_sync_at && (
              <Badge variant="outline" className="text-xs">
                <Clock className="w-3 h-3 mr-1" />
                Synced {new Date(integration.last_sync_at).toLocaleDateString()}
              </Badge>
            )}
            {leadSources.length > 0 && (
              <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/20">
                {leadSources.filter((s) => s.is_active).length} lead forms active
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickStatCard
          icon={<Users className="w-4 h-4 text-blue-400" />}
          label="Leads"
          sublabel="This week"
          value={leadCount !== null ? leadCount.toLocaleString() : '--'}
          loading={leadCount === null}
        />
        <QuickStatCard
          icon={<Send className="w-4 h-4 text-purple-400" />}
          label="Active Campaigns"
          sublabel="Running now"
          value={campaignsLoading ? '--' : activeCampaigns.length.toLocaleString()}
          loading={campaignsLoading}
        />
        <QuickStatCard
          icon={<BarChart3 className="w-4 h-4 text-emerald-400" />}
          label="Total Campaigns"
          sublabel="All statuses"
          value={campaignsLoading ? '--' : campaigns.length.toLocaleString()}
          loading={campaignsLoading}
        />
        <QuickStatCard
          icon={<Eye className="w-4 h-4 text-amber-400" />}
          label="Competitor Ads"
          sublabel="Tracked"
          value={adCount !== null ? adCount.toLocaleString() : '--'}
          loading={adCount === null}
        />
      </div>

      {/* Attribution chain */}
      {attribution !== null && (
        <Card className="border-zinc-800/60 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Attribution Chain
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(attribution).length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">
                Attribution data will appear as leads flow through the pipeline.
              </p>
            ) : (
              <div className="flex items-center gap-1 overflow-x-auto py-2">
                {ATTRIBUTION_STEPS.map((step, i) => (
                  <div key={step.type} className="flex items-center gap-1">
                    <div className="flex flex-col items-center min-w-[90px]">
                      <div className={`text-xl font-semibold ${step.color}`}>
                        {attribution[step.type] ?? 0}
                      </div>
                      <div className="text-[10px] text-zinc-500 text-center leading-tight mt-1">
                        {step.label}
                      </div>
                    </div>
                    {i < ATTRIBUTION_STEPS.length - 1 && (
                      <ChevronRight className="w-4 h-4 text-zinc-700 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <Card className="border-zinc-800/60 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-zinc-400">
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickAction
              icon={<Zap className="w-4 h-4 text-purple-400" />}
              label="New Campaign"
              description="Create and manage LinkedIn ad campaigns"
              href="/linkedin?tab=campaigns"
            />
            <QuickAction
              icon={<Search className="w-4 h-4 text-amber-400" />}
              label="Search Ad Library"
              description="Discover competitor ad creative and strategy"
              href="/linkedin?tab=ad_library"
            />
            <QuickAction
              icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
              label="View Pipeline"
              description="Track LinkedIn lead to revenue attribution"
              href="/linkedin?tab=revenue"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quick stat card
// ---------------------------------------------------------------------------

function QuickStatCard({
  icon,
  label,
  sublabel,
  value,
  loading,
}: {
  icon: React.ReactNode
  label: string
  sublabel: string
  value: string
  loading?: boolean
}) {
  return (
    <Card className="border-zinc-800/60 bg-zinc-900/60">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-xs text-zinc-500">{sublabel}</span>
        </div>
        <div className="text-2xl font-semibold text-zinc-100">
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-zinc-600" /> : value}
        </div>
        <div className="text-sm text-zinc-400 mt-0.5">{label}</div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Quick action button
// ---------------------------------------------------------------------------

function QuickAction({
  icon,
  label,
  description,
  href,
}: {
  icon: React.ReactNode
  label: string
  description: string
  href: string
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded-lg border border-zinc-700/30 bg-zinc-800/40 px-4 py-3 transition-colors hover:border-zinc-600/50 hover:bg-zinc-800/60"
    >
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
    </a>
  )
}

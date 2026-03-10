import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, TrendingDown, Loader2, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useLinkedInAnalytics } from '@/lib/hooks/useLinkedInAnalytics'
import { useLinkedInConversions } from '@/lib/hooks/useLinkedInConversions'
import { useOrgMoney } from '@/lib/hooks/useOrgMoney'
import type { CampaignSummary } from '@/lib/services/linkedinAnalyticsService'
import type { ConversionRule } from '@/lib/services/conversionService'

// ---------------------------------------------------------------------------
// Quality rating logic
// ---------------------------------------------------------------------------

type QualityRating = 'good' | 'warning' | 'poor'

interface CampaignQualityRow {
  campaign: CampaignSummary
  leads: number
  spend: number
  costPerLead: number | null
  rulesMatched: number
  qualityRating: QualityRating
  qualityScore: number
}

function deriveQuality(
  leads: number,
  costPerLead: number | null,
  rulesMatched: number,
  conversions: number
): QualityRating {
  // High leads but zero conversion rules mapped = warning
  if (leads >= 5 && rulesMatched === 0) return 'warning'
  // Cost per lead over $150 = poor
  if (costPerLead !== null && costPerLead > 150) return 'poor'
  // Some leads but no conversions at all and has rules = warning
  if (leads >= 10 && conversions === 0 && rulesMatched > 0) return 'warning'
  // Cost per lead between $50-150 = warning
  if (costPerLead !== null && costPerLead >= 50) return 'warning'
  // Good: low cost per lead, or has conversions, or just starting
  return 'good'
}

function computeQualityScore(leads: number, conversions: number, rulesMatched: number): number {
  // Primary: leads * conversion_rate
  // Fallback when no conversions yet: ratio of leads to rules as a proxy
  if (leads === 0) return 0
  const conversionRate = conversions / leads
  if (conversions > 0) return Math.round(leads * conversionRate * 100) / 100
  // Placeholder: rules coverage ratio (capped at 1.0)
  if (rulesMatched > 0) return Math.round(Math.min(rulesMatched / 5, 1) * leads * 10) / 100
  return 0
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function QualityBadge({ rating }: { rating: QualityRating }) {
  switch (rating) {
    case 'good':
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Good
        </Badge>
      )
    case 'warning':
      return (
        <Badge variant="warning" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Warning
        </Badge>
      )
    case 'poor':
      return (
        <Badge variant="destructive" className="gap-1">
          <TrendingDown className="h-3 w-3" />
          Poor
        </Badge>
      )
  }
}

function CostPerLeadCell({ value, currency }: { value: number | null; currency: string }) {
  if (value === null) {
    return <span className="text-zinc-500">--</span>
  }
  const formatted = new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
  if (value < 50) {
    return <span className="text-emerald-400 font-medium">{formatted}</span>
  }
  if (value <= 150) {
    return <span className="text-yellow-400 font-medium">{formatted}</span>
  }
  return <span className="text-red-400 font-medium">{formatted}</span>
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CampaignQualityView() {
  const { campaigns, loading: campaignsLoading } = useLinkedInAnalytics()
  const { rules, rulesLoading } = useLinkedInConversions()
  const { currencyCode } = useOrgMoney()

  const loading = campaignsLoading || rulesLoading

  // Build quality rows by cross-referencing campaigns with conversion rules
  const rows = useMemo<CampaignQualityRow[]>(() => {
    if (!campaigns.length) return []

    // Count rules per ad account — rules don't have a per-campaign mapping,
    // so we count total active rules as the "matched" baseline for each campaign.
    const activeRules = rules.filter((r: ConversionRule) => r.is_active)
    const rulesCount = activeRules.length

    return campaigns.map((campaign: CampaignSummary) => {
      const leads = campaign.total_leads ?? 0
      const spend = campaign.total_spend ?? 0
      const conversions = campaign.total_conversions ?? 0
      const costPerLead = leads > 0 ? Math.round((spend / leads) * 100) / 100 : null

      const qualityRating = deriveQuality(leads, costPerLead, rulesCount, conversions)
      const qualityScore = computeQualityScore(leads, conversions, rulesCount)

      return {
        campaign,
        leads,
        spend,
        costPerLead,
        rulesMatched: rulesCount,
        qualityRating,
        qualityScore,
      }
    })
  }, [campaigns, rules])

  // Summary counts
  const summary = useMemo(() => {
    const good = rows.filter((r) => r.qualityRating === 'good').length
    const warning = rows.filter((r) => r.qualityRating === 'warning').length
    const poor = rows.filter((r) => r.qualityRating === 'poor').length
    return { good, warning, poor, total: rows.length }
  }, [rows])

  if (loading) {
    return (
      <Card className="border-zinc-800/60 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            <CardTitle className="text-sm font-medium text-zinc-200">
              Loading campaign quality data...
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card className="border-zinc-800/60 bg-zinc-900/60">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <BarChart3 className="h-8 w-8 text-zinc-600 mb-3" />
          <h3 className="text-sm font-semibold text-zinc-200 mb-1">
            No campaign quality data yet
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm">
            Campaign quality metrics will appear once analytics data is synced and conversion rules
            are configured.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-zinc-800/60 bg-zinc-900/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-zinc-200">
            Campaign Quality Dashboard
          </CardTitle>
          <div className="flex items-center gap-2">
            {summary.poor > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {summary.poor} poor
              </Badge>
            )}
            {summary.warning > 0 && (
              <Badge variant="warning" className="text-[10px]">
                {summary.warning} warning
              </Badge>
            )}
            {summary.good > 0 && (
              <Badge variant="success" className="text-[10px]">
                {summary.good} good
              </Badge>
            )}
          </div>
        </div>
        {rules.length === 0 && campaigns.length > 0 && (
          <div className="flex items-center gap-2 mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-400">
              No conversion rules configured. Set up rules in the Revenue tab to track quality accurately.
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800/60 hover:bg-transparent">
              <TableHead className="pl-6">Campaign</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Cost / Lead</TableHead>
              <TableHead className="text-right">Conversions</TableHead>
              <TableHead className="text-right">Rules Mapped</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right pr-6">Quality</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.campaign.campaign_id} className="border-zinc-800/40">
                <TableCell className="pl-6">
                  <div className="font-medium text-zinc-200 truncate max-w-[220px]">
                    {row.campaign.campaign_name || 'Unnamed Campaign'}
                  </div>
                  {row.campaign.campaign_group_name && (
                    <div className="text-[11px] text-zinc-500 truncate max-w-[220px]">
                      {row.campaign.campaign_group_name}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right text-zinc-300 tabular-nums">
                  {row.leads.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <CostPerLeadCell value={row.costPerLead} currency={currencyCode} />
                </TableCell>
                <TableCell className="text-right text-zinc-300 tabular-nums">
                  {(row.campaign.total_conversions ?? 0).toLocaleString()}
                </TableCell>
                <TableCell className="text-right text-zinc-300 tabular-nums">
                  {row.rulesMatched}
                </TableCell>
                <TableCell className="text-right text-zinc-400 tabular-nums">
                  {row.qualityScore > 0 ? row.qualityScore.toFixed(1) : '--'}
                </TableCell>
                <TableCell className="text-right pr-6">
                  <QualityBadge rating={row.qualityRating} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-[11px] text-zinc-600 px-6 py-3">
          Quality score = leads x conversion rate. Cost/lead thresholds apply in account currency.
          Campaigns with leads but no conversion rules show a warning.
        </p>
      </CardContent>
    </Card>
  )
}

import { useState, useMemo } from 'react'
import { TrendingUp, Trophy, Bell, Calendar, Loader2, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdLibraryInsightsProps {
  trends: Array<{ dimension: string; value: string; count: number; week: string }>
  likelyWinners: Array<{
    id: string
    headline?: string | null
    advertiser_name?: string
    first_seen_at?: string
    variant_count?: number
    winner_signals?: any[]
  }>
  watchlist: Array<{ id: string; competitor_name: string }>
  trendsLoading: boolean
  winnersLoading: boolean
  onFetchTrends: (dimension?: string) => void
  onFetchWinners: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLongevityDays(firstSeenAt?: string): number {
  if (!firstSeenAt) return 0
  const first = new Date(firstSeenAt)
  const now = new Date()
  return Math.max(0, Math.round((now.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)))
}

function getLongevityLabel(days: number): string {
  if (days >= 90) return '90d+'
  if (days >= 60) return '60d+'
  if (days >= 30) return '30d+'
  if (days >= 14) return '14d+'
  return `${days}d`
}

function getLongevityColor(days: number): string {
  if (days >= 90) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
  if (days >= 60) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  if (days >= 30) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
}

// ---------------------------------------------------------------------------
// Trend Chart — Horizontal bar chart (CSS only)
// ---------------------------------------------------------------------------

function TrendChart({
  trends,
  loading,
  onRefresh,
}: {
  trends: AdLibraryInsightsProps['trends']
  loading: boolean
  onRefresh: (dimension?: string) => void
}) {
  const [selectedDimension, setSelectedDimension] = useState<string>('angle')

  // Group trends by week, then show the latest N weeks per value
  const chartData = useMemo(() => {
    if (!trends.length) return { values: [], weeklyData: new Map(), maxCount: 0 }

    const filtered = trends.filter((t) => t.dimension === selectedDimension || selectedDimension === 'all')

    // Aggregate counts per value across all weeks
    const valueTotals = new Map<string, number>()
    for (const t of filtered) {
      valueTotals.set(t.value, (valueTotals.get(t.value) ?? 0) + t.count)
    }

    // Sort by total count desc, take top 10
    const topValues = [...valueTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([v]) => v)

    // Weekly breakdown for each value
    const weeklyData = new Map<string, Map<string, number>>()
    for (const t of filtered) {
      if (!topValues.includes(t.value)) continue
      if (!weeklyData.has(t.value)) weeklyData.set(t.value, new Map())
      const weekMap = weeklyData.get(t.value)!
      weekMap.set(t.week, (weekMap.get(t.week) ?? 0) + t.count)
    }

    const maxCount = Math.max(...topValues.map((v) => valueTotals.get(v) ?? 0), 1)

    return { values: topValues, valueTotals, weeklyData, maxCount }
  }, [trends, selectedDimension])

  return (
    <Card className="bg-zinc-900/60 border-zinc-800/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <CardTitle className="text-base">Messaging Trends</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedDimension} onValueChange={setSelectedDimension}>
              <SelectTrigger className="h-8 w-32 text-xs bg-zinc-800/60 border-zinc-700/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="angle">Angle</SelectItem>
                <SelectItem value="target_persona">Persona</SelectItem>
                <SelectItem value="offer_type">Offer Type</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onRefresh(selectedDimension === 'all' ? undefined : selectedDimension)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          How ad messaging themes change week over week
        </p>
      </CardHeader>
      <CardContent>
        {loading && !chartData.values.length ? (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading trends...
          </div>
        ) : chartData.values.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            No trend data yet. Capture ads and classify them to see messaging trends.
          </div>
        ) : (
          <div className="space-y-3">
            {chartData.values.map((value) => {
              const total = chartData.valueTotals?.get(value) ?? 0
              const widthPct = Math.max(4, (total / chartData.maxCount) * 100)
              return (
                <div key={value} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-zinc-300 truncate max-w-[60%]">{value}</span>
                    <span className="text-xs text-zinc-500 tabular-nums">{total} ads</span>
                  </div>
                  <div className="h-5 bg-zinc-800/60 rounded-md overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600/80 to-blue-400/60 rounded-md transition-all duration-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Likely Winners — Cards
// ---------------------------------------------------------------------------

function LikelyWinnersList({
  winners,
  loading,
  onRefresh,
}: {
  winners: AdLibraryInsightsProps['likelyWinners']
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <Card className="bg-zinc-900/60 border-zinc-800/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            <CardTitle className="text-base">Likely Winners</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Top ads surfaced by longevity and variant density
        </p>
      </CardHeader>
      <CardContent>
        {loading && !winners.length ? (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading winners...
          </div>
        ) : winners.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            No likely winners found yet. Capture more ads to surface winning patterns.
          </div>
        ) : (
          <div className="space-y-3">
            {winners.map((winner) => {
              const days = getLongevityDays(winner.first_seen_at)
              const variantCount = winner.variant_count ?? winner.winner_signals?.length ?? 0
              return (
                <div
                  key={winner.id}
                  className="rounded-lg border border-zinc-800/60 bg-zinc-800/30 p-3 hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-200 truncate">
                        {winner.headline || 'Untitled ad'}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">
                        {winner.advertiser_name || 'Unknown advertiser'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${getLongevityColor(days)}`}
                      >
                        {getLongevityLabel(days)}
                      </Badge>
                      {variantCount > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 bg-purple-500/20 text-purple-400 border-purple-500/30"
                        >
                          {variantCount} variant{variantCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {winner.first_seen_at && (
                    <div className="flex items-center gap-1 mt-2 text-[10px] text-zinc-600">
                      <Calendar className="h-3 w-3" />
                      Running since {new Date(winner.first_seen_at).toLocaleDateString()}
                      <span className="mx-1">--</span>
                      {days} day{days !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Weekly Digest Config
// ---------------------------------------------------------------------------

function WeeklyDigestConfig({
  watchlist,
}: {
  watchlist: AdLibraryInsightsProps['watchlist']
}) {
  const [enabled, setEnabled] = useState(false)
  const [frequency, setFrequency] = useState<string>('weekly')
  const [selectedCompetitors, setSelectedCompetitors] = useState<Set<string>>(
    () => new Set(watchlist.map((w) => w.id))
  )

  const toggleCompetitor = (id: string) => {
    setSelectedCompetitors((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <Card className="bg-zinc-900/60 border-zinc-800/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-indigo-400" />
            <CardTitle className="text-base">Weekly Digest</CardTitle>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Get a Slack digest of competitor ad activity
        </p>
      </CardHeader>
      <CardContent>
        <div className={enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}>
          {/* Frequency selector */}
          <div className="mb-4">
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Frequency</label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="h-8 w-full text-xs bg-zinc-800/60 border-zinc-700/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly (Monday)</SelectItem>
                <SelectItem value="biweekly">Biweekly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Competitor filter */}
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
              Competitors to include
            </label>
            {watchlist.length === 0 ? (
              <p className="text-xs text-zinc-600">
                No competitors on watchlist. Add competitors from the Ad Library tab.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {watchlist.map((entry) => (
                  <label
                    key={entry.id}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <Checkbox
                      checked={selectedCompetitors.has(entry.id)}
                      onCheckedChange={() => toggleCompetitor(entry.id)}
                      className="border-zinc-700 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                    />
                    <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors truncate">
                      {entry.competitor_name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          {enabled && watchlist.length > 0 && (
            <div className="mt-4 rounded-md bg-indigo-500/10 border border-indigo-500/20 px-3 py-2">
              <p className="text-xs text-indigo-300">
                Digest will include {selectedCompetitors.size} of {watchlist.length} competitors,
                delivered {frequency === 'weekly' ? 'every Monday' : 'every other Monday'} via Slack.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AdLibraryInsights({
  trends,
  likelyWinners,
  watchlist,
  trendsLoading,
  winnersLoading,
  onFetchTrends,
  onFetchWinners,
}: AdLibraryInsightsProps) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trends — takes 2 columns on large screens */}
        <div className="lg:col-span-2">
          <TrendChart trends={trends} loading={trendsLoading} onRefresh={onFetchTrends} />
        </div>

        {/* Weekly Digest Config */}
        <div className="lg:col-span-1">
          <WeeklyDigestConfig watchlist={watchlist} />
        </div>
      </div>

      {/* Likely Winners — full width */}
      <LikelyWinnersList
        winners={likelyWinners}
        loading={winnersLoading}
        onRefresh={onFetchWinners}
      />
    </div>
  )
}

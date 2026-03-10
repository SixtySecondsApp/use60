import { useState, useMemo } from 'react'
import { AlertTriangle, RefreshCw, Check, GitCompare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DriftCampaign {
  id: string
  campaign_name: string
  status: string
  updated_at: string
  last_synced_at?: string | null
  metadata?: Record<string, any>
}

export interface CampaignDriftDetectorProps {
  campaigns: DriftCampaign[]
  onSync: () => Promise<any>
  syncing: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DRIFT_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour

function isDrifted(campaign: DriftCampaign): boolean {
  if (!campaign.last_synced_at) return false
  const updatedAt = new Date(campaign.updated_at).getTime()
  const syncedAt = new Date(campaign.last_synced_at).getTime()
  return updatedAt - syncedAt > DRIFT_THRESHOLD_MS
}

function getDriftDuration(campaign: DriftCampaign): string {
  if (!campaign.last_synced_at) return ''
  const updatedAt = new Date(campaign.updated_at).getTime()
  const syncedAt = new Date(campaign.last_synced_at).getTime()
  const diffMs = updatedAt - syncedAt
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h ago`
  return `${hours}h ago`
}

type DriftCategory = 'targeting' | 'budget' | 'status' | 'creative'

function inferDriftCategories(campaign: DriftCampaign): DriftCategory[] {
  const categories: DriftCategory[] = []
  const meta = campaign.metadata

  if (!meta) {
    // Without metadata we cannot determine specifics — flag as general drift
    return ['status']
  }

  // If metadata stores previous snapshot vs current values, compare them.
  // Otherwise we use heuristic field-presence checks.
  if (
    meta.targeting_changed ||
    meta.targeting_criteria_hash_changed ||
    meta.audience_expansion_changed
  ) {
    categories.push('targeting')
  }

  if (
    meta.budget_changed ||
    meta.daily_budget_changed ||
    meta.total_budget_changed ||
    meta.cost_type_changed
  ) {
    categories.push('budget')
  }

  if (meta.status_changed || meta.previous_status) {
    categories.push('status')
  }

  if (meta.creative_changed || meta.creative_count_changed) {
    categories.push('creative')
  }

  // Fallback: if metadata exists but no recognized flags, assume general drift
  if (categories.length === 0) {
    categories.push('status')
  }

  return categories
}

const CATEGORY_LABELS: Record<DriftCategory, string> = {
  targeting: 'Targeting',
  budget: 'Budget',
  status: 'Status',
  creative: 'Creative',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CampaignDriftDetector({
  campaigns,
  onSync,
  syncing,
}: CampaignDriftDetectorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const driftedCampaigns = useMemo(
    () => campaigns.filter(isDrifted),
    [campaigns],
  )

  // Nothing to show when all campaigns are in sync
  if (driftedCampaigns.length === 0) return null

  const allSelected =
    driftedCampaigns.length > 0 &&
    driftedCampaigns.every((c) => selected.has(c.id))

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(driftedCampaigns.map((c) => c.id)))
    }
  }

  async function handleSync() {
    await onSync()
    setSelected(new Set())
  }

  return (
    <Card className="bg-zinc-900/60 border-zinc-800/60 mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-amber-400" />
            <CardTitle className="text-sm font-medium text-zinc-100">
              Campaign Drift Detected
            </CardTitle>
            <Badge variant="warning" className="text-xs">
              {driftedCampaigns.length} out of sync
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-amber-600/40 text-amber-400 hover:bg-amber-500/10"
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing ? (
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Check className="h-3 w-3 mr-1" />
                )}
                Bulk Accept ({selected.size})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Accept All Remote Changes
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Select all row */}
        {driftedCampaigns.length > 1 && (
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-800/60">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              className="border-zinc-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
            />
            <span className="text-xs text-zinc-500">Select all</span>
          </div>
        )}

        <div className="space-y-2">
          {driftedCampaigns.map((campaign) => {
            const categories = inferDriftCategories(campaign)
            const driftAge = getDriftDuration(campaign)

            return (
              <div
                key={campaign.id}
                className="flex items-center justify-between rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3 py-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Checkbox
                    checked={selected.has(campaign.id)}
                    onCheckedChange={() => toggleOne(campaign.id)}
                    className="border-zinc-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500 shrink-0"
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200 truncate">
                        {campaign.campaign_name}
                      </span>
                      <Badge variant="warning" className="text-[10px] px-1.5 py-0 shrink-0">
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                        Out of sync
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-500">
                        Modified externally {driftAge}
                      </span>
                      <span className="text-zinc-700">|</span>
                      <span className="text-xs text-zinc-500">
                        Likely changed:{' '}
                        {categories
                          .map((c) => CATEGORY_LABELS[c])
                          .join(', ')}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 shrink-0 ml-2"
                  onClick={handleSync}
                  disabled={syncing}
                >
                  {syncing ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  Accept
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

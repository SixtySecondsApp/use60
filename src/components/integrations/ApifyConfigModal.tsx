import React, { useState, useEffect } from 'react'
import { ConfigureModal, ConfigSection, DangerZone } from './ConfigureModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { KeyRound, Bot, AlertTriangle, DollarSign, Activity, Database } from 'lucide-react'
import { toast } from 'sonner'
import { useApifyIntegration } from '@/lib/hooks/useApifyIntegration'
import { apifyService, ApifyCostSummary } from '@/lib/services/apifyService'

interface ApifyConfigModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ApifyConfigModal({ open, onOpenChange }: ApifyConfigModalProps) {
  const { isConnected, loading, apifyUser, connect, disconnect } = useApifyIntegration()
  const [apiToken, setApiToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [costSummary, setCostSummary] = useState<ApifyCostSummary | null>(null)
  const [costLoading, setCostLoading] = useState(false)

  useEffect(() => {
    if (!isConnected || !open) return
    let cancelled = false
    setCostLoading(true)
    apifyService
      .getCostSummary()
      .then((summary) => {
        if (!cancelled) setCostSummary(summary)
      })
      .catch((err) => {
        console.error('[ApifyConfigModal] cost summary error:', err)
      })
      .finally(() => {
        if (!cancelled) setCostLoading(false)
      })
    return () => { cancelled = true }
  }, [isConnected, open])

  const handleConnect = async () => {
    if (!apiToken.trim()) return
    setSaving(true)
    try {
      await connect(apiToken.trim())
      setApiToken('')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to connect')
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await disconnect()
    } catch (e: any) {
      toast.error(e?.message || 'Disconnect failed')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <ConfigureModal
      open={open}
      onOpenChange={onOpenChange}
      integrationId="apify"
      integrationName="Apify"
      fallbackIcon={<Bot className="w-6 h-6 text-emerald-500" />}
      showFooter={false}
    >
      <ConfigSection title="Connection">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Status:{' '}
              <span className="font-semibold">
                {loading ? 'Loading\u2026' : isConnected ? 'Connected' : 'Not connected'}
              </span>
            </div>
            {isConnected ? (
              <Badge className="bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-500/30">
                Active
              </Badge>
            ) : (
              <Badge className="bg-gray-100/80 dark:bg-gray-800/50 text-gray-700 dark:text-gray-200 border-gray-200/50 dark:border-gray-700/30">
                Inactive
              </Badge>
            )}
          </div>
          {isConnected && apifyUser && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Signed in as <span className="font-medium text-gray-700 dark:text-gray-200">{apifyUser.username}</span>
              {apifyUser.plan && (
                <> &middot; Plan: <span className="font-medium">{apifyUser.plan}</span></>
              )}
            </div>
          )}
        </div>
      </ConfigSection>

      <ConfigSection title="API Token">
        <div className="space-y-3">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Enter your Apify API token to run actors from the Apify marketplace.
            Find it at{' '}
            <a
              href="https://console.apify.com/account/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 dark:text-emerald-400 underline"
            >
              console.apify.com
            </a>.
          </div>
          <div className="space-y-2">
            <Label htmlFor="apify_api_token">API Token</Label>
            <Input
              id="apify_api_token"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="apify_api_..."
              type="password"
            />
          </div>
          <Button
            type="button"
            onClick={handleConnect}
            disabled={saving || !apiToken.trim()}
            className="gap-2"
          >
            <KeyRound className="w-4 h-4" />
            {saving ? 'Connecting\u2026' : isConnected ? 'Update Token' : 'Connect'}
          </Button>
        </div>
      </ConfigSection>

      {isConnected && (
        <ConfigSection title="Monthly Usage">
          {costLoading ? (
            <div className="text-sm text-gray-400 dark:text-gray-500">Loading usage data...</div>
          ) : costSummary ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30 p-3 text-center">
                <DollarSign className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  ${costSummary.total_cost_usd.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Cost this month</div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30 p-3 text-center">
                <Activity className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {costSummary.total_runs}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Runs this month</div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30 p-3 text-center">
                <Database className="w-4 h-4 text-violet-500 mx-auto mb-1" />
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {costSummary.total_records.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Records processed</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400 dark:text-gray-500">No usage data available</div>
          )}
          <div className="mt-3 rounded-lg border border-amber-200/60 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-900/10 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                Apify charges per actor run based on compute and proxy usage. Costs vary by actor.
              </div>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1 ml-6">
              <div>Rate limits: max 5 concurrent runs, 20/hour warning, 100/day warning.</div>
              <div>Results are stored for 30 days before automatic cleanup.</div>
            </div>
          </div>
        </ConfigSection>
      )}

      {isConnected && (
        <DangerZone
          title="Disconnect Apify"
          description="Removes stored API token. All running actor workflows will continue but new runs cannot be started."
          buttonText="Disconnect"
          onAction={handleDisconnect}
          isLoading={disconnecting}
        />
      )}
    </ConfigureModal>
  )
}

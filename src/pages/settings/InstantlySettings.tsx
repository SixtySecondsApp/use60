import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Zap, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/clientV2'
import { useOrg } from '@/lib/contexts/OrgContext'
import { Button } from '@/components/ui/button'

export default function InstantlySettings() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeOrg } = useOrg()
  const orgId = activeOrg?.id
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const { data: status, isLoading } = useQuery({
    queryKey: ['instantly-status', orgId],
    queryFn: async () => {
      if (!orgId) return null
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'status', org_id: orgId },
      })
      if (error) throw error
      return data as {
        connected: boolean
        is_active: boolean
        connected_at: string | null
        last_sync_at: string | null
        linked_campaigns_count: number
      }
    },
    enabled: !!orgId,
  })

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !apiKey.trim()) throw new Error('API key required')
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'connect', org_id: orgId, api_key: apiKey.trim() },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instantly-status', orgId] })
      setApiKey('')
      toast.success('Instantly connected successfully')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to connect'),
  })

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No org')
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'disconnect', org_id: orgId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instantly-status', orgId] })
      toast.success('Instantly disconnected')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to disconnect'),
  })

  const isConnected = status?.connected ?? false

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/settings')}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Zap className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Instantly.ai</h1>
            <p className="text-sm text-gray-400">Cold email outreach integration for Ops tables</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Connection Status */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isConnected ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-gray-500" />
                )}
                <div>
                  <h3 className="text-sm font-medium text-white">
                    {isConnected ? 'Connected' : 'Not Connected'}
                  </h3>
                  {isConnected && status?.connected_at && (
                    <p className="text-xs text-gray-500">
                      Since {new Date(status.connected_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              {isConnected && (
                <div className="text-right text-xs text-gray-500">
                  <p>{status?.linked_campaigns_count ?? 0} linked campaigns</p>
                  {status?.last_sync_at && (
                    <p>Last sync: {new Date(status.last_sync_at).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* API Key Input */}
          {!isConnected && (
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
              <h3 className="mb-1 text-sm font-medium text-white">API Key</h3>
              <p className="mb-4 text-xs text-gray-500">
                Generate an API key from your Instantly dashboard under Settings &gt; Integrations &gt; API.
                Requires Growth plan or above.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your Instantly API key"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 pr-10 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                    data-form-type="other"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  onClick={() => connectMutation.mutate()}
                  disabled={!apiKey.trim() || connectMutation.isPending}
                >
                  {connectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Connect
                </Button>
              </div>
            </div>
          )}

          {/* How It Works */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
            <h3 className="mb-3 text-sm font-medium text-white">How it works</h3>
            <ol className="space-y-2 text-sm text-gray-400">
              <li className="flex gap-2">
                <span className="shrink-0 text-blue-400">1.</span>
                Connect your Instantly API key above
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-blue-400">2.</span>
                Open any Ops table and click the Instantly button in the toolbar
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-blue-400">3.</span>
                Link the table to an Instantly campaign and map your columns
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-blue-400">4.</span>
                Push leads to Instantly and sync engagement data back
              </li>
            </ol>
          </div>

          {/* Danger Zone */}
          {isConnected && (
            <div className="rounded-lg border border-red-900/30 bg-red-950/10 p-6">
              <h3 className="mb-1 text-sm font-medium text-red-400">Danger Zone</h3>
              <p className="mb-4 text-xs text-gray-500">
                Disconnecting will remove your API key. Existing campaign links will remain but syncing will stop.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm('Are you sure you want to disconnect Instantly?')) {
                    disconnectMutation.mutate()
                  }
                }}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Disconnect Instantly
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

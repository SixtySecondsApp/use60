import React, { useState } from 'react'
import { ArrowLeft, Loader2, Globe, CheckCircle2, XCircle, Copy, Check, Plus, X, Eye, EyeOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useVisitorIntelligence } from '@/lib/hooks/useVisitorIntelligence'

export default function VisitorIntelligenceSettings() {
  const navigate = useNavigate()
  const {
    config,
    loading,
    isEnabled,
    snippetCode,
    rb2bWebhookUrl,
    visitorCount24h,
    enableVisitorTracking,
    updateConfig,
    disable,
  } = useVisitorIntelligence()

  const [copied, setCopied] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [newExcludePath, setNewExcludePath] = useState('')
  const [rb2bKey, setRb2bKey] = useState('')
  const [showRb2bKey, setShowRb2bKey] = useState(false)
  const [saving, setSaving] = useState(false)

  const copySnippet = () => {
    if (snippetCode) {
      navigator.clipboard.writeText(snippetCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Snippet copied to clipboard')
    }
  }

  const copyWebhookUrl = () => {
    if (rb2bWebhookUrl) {
      navigator.clipboard.writeText(rb2bWebhookUrl)
      setCopiedWebhook(true)
      setTimeout(() => setCopiedWebhook(false), 2000)
      toast.success('Webhook URL copied')
    }
  }

  const addDomain = async () => {
    if (!newDomain.trim() || !config) return
    const updated = [...(config.allowed_domains || []), newDomain.trim()]
    await updateConfig({ allowed_domains: updated })
    setNewDomain('')
  }

  const removeDomain = async (domain: string) => {
    if (!config) return
    const updated = (config.allowed_domains || []).filter((d: string) => d !== domain)
    await updateConfig({ allowed_domains: updated })
  }

  const addExcludePath = async () => {
    if (!newExcludePath.trim() || !config) return
    const updated = [...(config.exclude_paths || []), newExcludePath.trim()]
    await updateConfig({ exclude_paths: updated })
    setNewExcludePath('')
  }

  const removeExcludePath = async (path: string) => {
    if (!config) return
    const updated = (config.exclude_paths || []).filter((p: string) => p !== path)
    await updateConfig({ exclude_paths: updated })
  }

  const saveRb2bKey = async () => {
    if (!config) return
    setSaving(true)
    try {
      await updateConfig({
        rb2b_api_key: rb2bKey.trim() || null,
        rb2b_enabled: !!rb2bKey.trim(),
      })
      setRb2bKey('')
    } finally {
      setSaving(false)
    }
  }

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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 border border-violet-500/20">
            <Globe className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Website Visitor Intelligence</h1>
            <p className="text-sm text-gray-400">Identify anonymous website visitors and turn them into leads</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isEnabled ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-gray-500" />
                )}
                <div>
                  <h3 className="text-sm font-medium text-white">
                    {isEnabled ? 'Active' : 'Not Enabled'}
                  </h3>
                  {isEnabled && (
                    <p className="text-xs text-gray-500">
                      {visitorCount24h} visitors identified in last 24h
                    </p>
                  )}
                </div>
              </div>
              {!isEnabled && (
                <Button onClick={enableVisitorTracking} size="sm">
                  Enable Tracking
                </Button>
              )}
            </div>
          </div>

          {isEnabled && snippetCode && (
            <>
              {/* Snippet Install */}
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
                <h3 className="mb-1 text-sm font-medium text-white">Install Snippet</h3>
                <p className="mb-4 text-xs text-gray-500">
                  Add this script tag to your website, just before the closing &lt;/body&gt; tag.
                  It auto-injects into 60-built landing pages.
                </p>
                <div className="relative">
                  <pre className="overflow-x-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-300 border border-gray-800">
                    {snippetCode}
                  </pre>
                  <button
                    onClick={copySnippet}
                    className="absolute right-2 top-2 rounded bg-gray-800 p-1.5 text-gray-400 hover:text-white"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Allowed Domains */}
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
                <h3 className="mb-1 text-sm font-medium text-white">Allowed Domains</h3>
                <p className="mb-4 text-xs text-gray-500">
                  Only track visitors from these domains. Leave empty to allow all.
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(config?.allowed_domains || []).map((domain: string) => (
                    <span key={domain} className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300">
                      {domain}
                      <button onClick={() => removeDomain(domain)} className="text-gray-500 hover:text-red-400">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="example.com"
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-violet-500"
                    onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                  />
                  <Button size="sm" variant="outline" onClick={addDomain} disabled={!newDomain.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Exclude Paths */}
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
                <h3 className="mb-1 text-sm font-medium text-white">Exclude Paths</h3>
                <p className="mb-4 text-xs text-gray-500">
                  Skip tracking on these URL paths (e.g. /admin, /login).
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(config?.exclude_paths || []).map((path: string) => (
                    <span key={path} className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300">
                      {path}
                      <button onClick={() => removeExcludePath(path)} className="text-gray-500 hover:text-red-400">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newExcludePath}
                    onChange={(e) => setNewExcludePath(e.target.value)}
                    placeholder="/admin"
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-violet-500"
                    onKeyDown={(e) => e.key === 'Enter' && addExcludePath()}
                  />
                  <Button size="sm" variant="outline" onClick={addExcludePath} disabled={!newExcludePath.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Toggles */}
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6 space-y-4">
                <h3 className="text-sm font-medium text-white">Automation</h3>
                <label className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">Auto-create leads</p>
                    <p className="text-xs text-gray-500">Automatically add identified visitors as leads</p>
                  </div>
                  <button
                    onClick={() => updateConfig({ auto_create_lead: !config?.auto_create_lead })}
                    className={`relative h-6 w-11 rounded-full transition-colors ${config?.auto_create_lead ? 'bg-violet-500' : 'bg-gray-700'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${config?.auto_create_lead ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </label>
                <label className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">Auto-enrich contacts</p>
                    <p className="text-xs text-gray-500">Find the best-fit contact at identified companies via Apollo</p>
                  </div>
                  <button
                    onClick={() => updateConfig({ auto_enrich: !config?.auto_enrich })}
                    className={`relative h-6 w-11 rounded-full transition-colors ${config?.auto_enrich ? 'bg-violet-500' : 'bg-gray-700'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${config?.auto_enrich ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </label>
              </div>

              {/* RB2B Integration */}
              <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
                <h3 className="mb-1 text-sm font-medium text-white">RB2B Person-Level Identification</h3>
                <p className="mb-4 text-xs text-gray-500">
                  Connect RB2B for person-level visitor identification (US traffic only). Get an API key at rb2b.com.
                </p>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {config?.rb2b_enabled ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-500" />
                    )}
                    <span className="text-sm text-gray-300">
                      {config?.rb2b_enabled ? 'RB2B Connected' : 'RB2B Not Connected'}
                    </span>
                  </div>

                  {!config?.rb2b_enabled && (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showRb2bKey ? 'text' : 'password'}
                          value={rb2bKey}
                          onChange={(e) => setRb2bKey(e.target.value)}
                          placeholder="Enter your RB2B API key"
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 pr-10 text-sm text-white placeholder-gray-500 outline-none focus:border-violet-500"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRb2bKey(!showRb2bKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                        >
                          {showRb2bKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button onClick={saveRb2bKey} disabled={!rb2bKey.trim() || saving} size="sm">
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Connect
                      </Button>
                    </div>
                  )}

                  {config?.rb2b_enabled && rb2bWebhookUrl && (
                    <div>
                      <p className="mb-2 text-xs text-gray-500">
                        Paste this webhook URL in your RB2B settings:
                      </p>
                      <div className="relative">
                        <pre className="overflow-x-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-300 border border-gray-800">
                          {rb2bWebhookUrl}
                        </pre>
                        <button
                          onClick={copyWebhookUrl}
                          className="absolute right-2 top-2 rounded bg-gray-800 p-1.5 text-gray-400 hover:text-white"
                        >
                          {copiedWebhook ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {config?.rb2b_enabled && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateConfig({ rb2b_api_key: null, rb2b_enabled: false })}
                    >
                      Disconnect RB2B
                    </Button>
                  )}
                </div>
              </div>

              {/* Danger Zone */}
              <div className="rounded-lg border border-red-900/30 bg-red-950/10 p-6">
                <h3 className="mb-1 text-sm font-medium text-red-400">Danger Zone</h3>
                <p className="mb-4 text-xs text-gray-500">
                  Disabling visitor tracking will stop all identification. Existing visitor data is preserved.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm('Disable website visitor tracking?')) {
                      disable()
                    }
                  }}
                >
                  Disable Tracking
                </Button>
              </div>
            </>
          )}

          {/* How It Works */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
            <h3 className="mb-3 text-sm font-medium text-white">How it works</h3>
            <ol className="space-y-2 text-sm text-gray-400">
              <li className="flex gap-2">
                <span className="shrink-0 text-violet-400">1.</span>
                Enable tracking and install the snippet on your website
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-violet-400">2.</span>
                When a visitor lands on your site, their IP is resolved to a company
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-violet-400">3.</span>
                Apollo finds the best-fit contact at that company matching your ICP
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-violet-400">4.</span>
                You get a Slack notification with the contact details and suggested outreach
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-violet-400">5.</span>
                (Optional) RB2B adds person-level identification for US visitors
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}

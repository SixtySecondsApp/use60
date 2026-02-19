import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Zap, Copy, RefreshCw, Eye, EyeOff, X, Activity,
  Check, ChevronDown, ChevronRight, AlertTriangle,
  Loader2, Send, ArrowDownLeft, ArrowUpRight, Info,
} from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const DEMO_TABLE_ID = 'demo-leads-table'
const DEMO_TABLE_NAME = 'Inbound Leads'
const FAKE_API_KEY = 'sk_a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1'
const FAKE_MASKED_KEY = 'sk_...f0a1'
const WEBHOOK_URL = 'https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/ops-table-inbound-webhook'

const DEMO_COLUMNS = [
  { key: 'company', label: 'Company', column_type: 'text' },
  { key: 'contact_name', label: 'Contact Name', column_type: 'text' },
  { key: 'email', label: 'Email', column_type: 'email' },
  { key: 'phone', label: 'Phone', column_type: 'text' },
  { key: 'deal_value', label: 'Deal Value', column_type: 'number' },
  { key: 'status', label: 'Status', column_type: 'text' },
]

const DEMO_ROWS = [
  { id: '1', company: 'Acme Corp', contact_name: 'Jane Smith', email: 'jane@acme.com', phone: '+1 555 0100', deal_value: '45,000', status: 'Qualified' },
  { id: '2', company: 'Globex Inc', contact_name: 'John Doe', email: 'j.doe@globex.com', phone: '+1 555 0201', deal_value: '12,500', status: 'New' },
  { id: '3', company: 'Initech', contact_name: 'Bill Lumbergh', email: 'bill@initech.com', phone: '+1 555 0302', deal_value: '78,000', status: 'Negotiating' },
  { id: '4', company: 'Umbrella Corp', contact_name: 'Alice Chen', email: 'alice@umbrella.com', phone: '+1 555 0403', deal_value: '34,500', status: 'Qualified' },
  { id: '5', company: 'Initrode', contact_name: 'Peter Gibbons', email: 'peter@initrode.com', phone: '+1 555 0504', deal_value: '9,800', status: 'Cold' },
]

const NOW = Date.now()
const MOCK_LOGS = [
  { id: 'l1', direction: 'inbound', status: 200, rows_affected: 3, error: null, payload: { company: 'Dunder Mifflin', email: 'michael@dundermifflin.com', deal_value: 22000 }, created_at: new Date(NOW - 2 * 60_000).toISOString() },
  { id: 'l2', direction: 'inbound', status: 200, rows_affected: 1, error: null, payload: { company: 'Pied Piper', email: 'richard@piedpiper.com', deal_value: 55000 }, created_at: new Date(NOW - 8 * 60_000).toISOString() },
  { id: 'l3', direction: 'inbound', status: 400, rows_affected: 0, error: 'Missing required field: company', payload: { email: 'anon@example.com' }, created_at: new Date(NOW - 45 * 60_000).toISOString() },
  { id: 'l4', direction: 'outbound', status: 200, rows_affected: null, error: null, payload: { event: 'row_created', row_id: 'r_123', company: 'Acme Corp' }, created_at: new Date(NOW - 2 * 60 * 60_000).toISOString() },
  { id: 'l5', direction: 'inbound', status: 200, rows_affected: 5, error: null, payload: { company: 'Bluth Company', email: 'george@bluth.com', deal_value: 99000 }, created_at: new Date(NOW - 26 * 60 * 60_000).toISOString() },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`))
}

function formatRelTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function statusPill(status: number | null) {
  if (!status) return 'bg-gray-700 text-gray-300'
  if (status >= 200 && status < 300) return 'bg-green-900/60 text-green-300'
  if (status >= 400 && status < 500) return 'bg-amber-900/60 text-amber-300'
  return 'bg-red-900/60 text-red-300'
}

function buildDefaultPayload() {
  return JSON.stringify({
    company: 'Hooli Inc',
    contact_name: 'Gavin Belson',
    email: 'gavin@hooli.com',
    phone: '+1 415 555 0199',
    deal_value: 250000,
    status: 'Qualified',
  }, null, 2)
}

// ---------------------------------------------------------------------------
// Mock mapping logic (simulates AI mapping without real API calls)
// ---------------------------------------------------------------------------

function simulateMapping(payloadJson: string): Array<{ payloadKey: string; mapsTo: string | null; action: 'mapped' | 'new' | 'unmapped' }> {
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(payloadJson) } catch { return [] }

  const colByKey = Object.fromEntries(DEMO_COLUMNS.map((c) => [c.key, c]))
  const aiHints: Record<string, string> = {
    company_name: 'Company', organisation: 'Company', org: 'Company',
    name: 'Contact Name', full_name: 'Contact Name', rep: 'Contact Name',
    email_address: 'Email', mail: 'Email',
    mobile: 'Phone', tel: 'Phone', telephone: 'Phone',
    amount: 'Deal Value', value: 'Deal Value', arr: 'Deal Value',
    stage: 'Status', lead_status: 'Status',
  }

  return Object.keys(parsed).map((key) => {
    if (colByKey[key]) return { payloadKey: key, mapsTo: colByKey[key].label, action: 'mapped' }
    if (aiHints[key]) return { payloadKey: key, mapsTo: aiHints[key], action: 'mapped' }
    return { payloadKey: key, mapsTo: null, action: 'unmapped' }
  })
}

// ---------------------------------------------------------------------------
// CopyButton
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  return (
    <div className="relative mt-2 rounded-lg bg-gray-900 border border-gray-700">
      <div className="flex items-center justify-between px-3 pt-2 pb-0">
        <span className="text-xs text-gray-500 font-mono">{lang}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-3 pt-1 text-xs font-mono text-gray-200 whitespace-pre-wrap break-all">{code}</pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mock Setup Instructions (simplified inline version)
// ---------------------------------------------------------------------------

function DemoSetupInstructions({ apiKey }: { apiKey: string }) {
  const [open, setOpen] = useState(false)

  const curlCode = `curl -X POST '${WEBHOOK_URL}' \\
  -H 'Content-Type: application/json' \\
  -H 'x-api-key: ${apiKey}' \\
  -d '{"company":"Hooli Inc","email":"gavin@hooli.com","deal_value":250000}'`

  const pythonCode = `import requests

response = requests.post(
    '${WEBHOOK_URL}',
    headers={'Content-Type': 'application/json', 'x-api-key': '${apiKey}'},
    json={"company": "Hooli Inc", "email": "gavin@hooli.com", "deal_value": 250000}
)
print(response.json())`

  const zapierSteps = [
    'Create a new Zap in Zapier.',
    'Choose your trigger (Google Sheets, Typeform, HubSpot, etc.).',
    'Add Action: Webhooks by Zapier → POST.',
    `URL: ${WEBHOOK_URL}`,
    `Header: x-api-key = ${apiKey}`,
    'Send as JSON. Map your fields to the column keys.',
    'Test to confirm 200 OK, then turn on your Zap.',
  ]

  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 hover:bg-gray-800 transition-colors text-left"
      >
        <span className="text-sm font-medium text-gray-200">Setup Instructions</span>
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-gray-900">
          <Tabs defaultValue="zapier">
            <TabsList className="bg-gray-800">
              <TabsTrigger value="zapier">Zapier</TabsTrigger>
              <TabsTrigger value="make">Make</TabsTrigger>
              <TabsTrigger value="n8n">n8n</TabsTrigger>
              <TabsTrigger value="curl">cURL / Python</TabsTrigger>
            </TabsList>

            <TabsContent value="zapier" className="pt-3">
              <ol className="space-y-2">
                {zapierSteps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm text-gray-300">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-900/60 text-violet-300 text-xs font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </TabsContent>

            <TabsContent value="make" className="pt-3">
              <p className="text-sm text-gray-400">Add an HTTP → "Make a request" module. Method: POST. URL above. Header: <code className="text-violet-300">x-api-key</code>. Body type: Raw JSON.</p>
            </TabsContent>

            <TabsContent value="n8n" className="pt-3">
              <p className="text-sm text-gray-400">Add HTTP Request node. Method: POST. Authentication: Header Auth — Name: <code className="text-violet-300">x-api-key</code>. Body: JSON payload.</p>
            </TabsContent>

            <TabsContent value="curl" className="pt-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">cURL</p>
                <CodeBlock code={curlCode} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">Python</p>
                <CodeBlock code={pythonCode} lang="python" />
              </div>
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">Column Schema</p>
            <div className="rounded border border-gray-700 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-800 border-b border-gray-700">
                    <th className="text-left px-3 py-2 text-gray-400">Field Key</th>
                    <th className="text-left px-3 py-2 text-gray-400">Label</th>
                    <th className="text-left px-3 py-2 text-gray-400">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {DEMO_COLUMNS.map((col, i) => (
                    <tr key={col.key} className={i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/40'}>
                      <td className="px-3 py-2 font-mono text-violet-400">{col.key}</td>
                      <td className="px-3 py-2 text-gray-300">{col.label}</td>
                      <td className="px-3 py-2 text-gray-500">{col.column_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mock Test Console Dialog
// ---------------------------------------------------------------------------

function DemoTestConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [payload, setPayload] = useState(buildDefaultPayload)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [mapping, setMapping] = useState<ReturnType<typeof simulateMapping> | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buildCurl = () =>
    `curl -X POST '${WEBHOOK_URL}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'x-api-key: ${FAKE_API_KEY}' \\\n  -d '${payload.replace(/\n/g, '').replace(/  +/g, ' ')}'`

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    try {
      JSON.parse(payload)
      setJsonError(null)
    } catch (e: unknown) {
      setJsonError(e instanceof SyntaxError ? e.message : 'Invalid JSON')
      setMapping(null)
      return
    }
    setIsPreviewLoading(true)
    debounceRef.current = setTimeout(() => {
      setMapping(simulateMapping(payload))
      setIsPreviewLoading(false)
    }, 700)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [payload])

  const handleSend = async () => {
    setIsSending(true)
    await new Promise((r) => setTimeout(r, 1200))
    setIsSending(false)
    toast.success('Test payload sent — 3 rows written to Inbound Leads')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Test Inbound Webhook</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-violet-800/50 bg-violet-900/20 p-3">
            <Info className="h-4 w-4 text-violet-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-violet-300">Demo mode — payload will be simulated, no real rows written.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">JSON Payload</label>
            <textarea
              className={`w-full h-40 rounded-lg border px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-y focus:outline-none focus:ring-2 focus:ring-violet-500 ${jsonError ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'}`}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              spellCheck={false}
            />
            {jsonError && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />{jsonError}
              </p>
            )}
          </div>

          {(isPreviewLoading || mapping) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Mapping Preview</p>
                {isPreviewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
              </div>
              {mapping && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Payload Key</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Maps To</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapping.map((row, i) => (
                        <tr key={row.payloadKey} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'}>
                          <td className="px-3 py-2 font-mono text-violet-600 dark:text-violet-400">{row.payloadKey}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                            {row.mapsTo ?? (
                              <span className="flex items-center gap-1 text-amber-500">
                                <AlertTriangle className="h-3 w-3" />Unmapped
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {row.action === 'mapped'
                              ? <span className="text-green-600 dark:text-green-400">Write</span>
                              : <span className="text-amber-500">Skip</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleSend} disabled={!!jsonError || isSending} className="flex items-center gap-2">
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Test
            </Button>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Generated cURL</p>
            <CodeBlock code={buildCurl()} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Mock Activity Log
// ---------------------------------------------------------------------------

function DemoActivityLog() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState(MOCK_LOGS)

  const toggle = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleRetry = (id: string) => {
    toast.success('Retrying payload…')
    setLogs((prev) => prev.map((l) => l.id === id ? { ...l, status: 200, error: null, rows_affected: 1 } : l))
  }

  if (logs.length === 0) {
    return <p className="text-xs text-gray-500 py-4 text-center">No webhook activity yet</p>
  }

  return (
    <div className="space-y-1">
      {logs.map((log) => {
        const isExpanded = expanded.has(log.id)
        return (
          <div key={log.id} className="rounded-lg border border-gray-800 bg-gray-900/50 overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800/50 transition-colors"
              onClick={() => toggle(log.id)}
            >
              {log.direction === 'inbound'
                ? <ArrowDownLeft className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                : <ArrowUpRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              }
              <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium ${statusPill(log.status)}`}>
                {log.status ?? '—'}
              </span>
              <span className="text-xs text-gray-400 capitalize">{log.direction}</span>
              {log.rows_affected != null && (
                <span className="text-xs text-gray-500">{log.rows_affected} row{log.rows_affected !== 1 ? 's' : ''}</span>
              )}
              {log.error && (
                <span className="text-xs text-red-400 truncate flex-1">{log.error}</span>
              )}
              <span className="text-xs text-gray-600 ml-auto shrink-0">{formatRelTime(log.created_at)}</span>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-800 px-3 py-2 space-y-2 bg-gray-950/60">
                <p className="text-xs text-gray-400 font-medium">Payload</p>
                <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all">
                  {JSON.stringify(log.payload, null, 2)}
                </pre>
                {log.error && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs border-gray-700 text-amber-400 hover:text-amber-300"
                    onClick={() => handleRetry(log.id)}
                  >
                    Retry
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mock Webhook Settings Panel
// ---------------------------------------------------------------------------

function DemoWebhookPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [enabled, setEnabled] = useState(true)
  const [autoCreate, setAutoCreate] = useState(true)
  const [hasKey, setHasKey] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [testOpen, setTestOpen] = useState(false)

  const maskedKey = hasKey ? FAKE_MASKED_KEY : null

  const handleGenerate = async () => {
    setGenerating(true)
    await new Promise((r) => setTimeout(r, 900))
    setHasKey(true)
    setRevealedKey(FAKE_API_KEY)
    setShowKey(true)
    setGenerating(false)
    toast.success('New API key generated')
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="!top-16 !h-[calc(100vh-4rem)] overflow-y-auto w-[480px] max-w-full bg-gray-950 border-l border-gray-800 p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-gray-100">API &amp; Webhooks</span>
            <span className="text-xs text-gray-500 ml-1 truncate max-w-[140px]">{DEMO_TABLE_NAME}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-200">Webhook enabled</p>
              <p className="text-xs text-gray-500 mt-0.5">Accept inbound data from external sources</p>
            </div>
            <button
              role="switch"
              aria-checked={enabled}
              onClick={() => { setEnabled((v) => !v); toast.success(enabled ? 'Webhook disabled' : 'Webhook enabled') }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enabled ? 'bg-violet-500' : 'bg-gray-700'}`}
            >
              <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition duration-200 ease-in-out ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Inbound section */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Inbound</p>

            {/* Webhook URL */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">Webhook URL</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={WEBHOOK_URL}
                  className="flex-1 min-w-0 rounded-md bg-gray-800 border border-gray-700 px-3 py-1.5 text-xs text-gray-300 font-mono focus:outline-none"
                />
                <Button
                  size="sm" variant="outline"
                  className="shrink-0 h-7 px-2 border-gray-700 text-gray-400 hover:text-gray-200"
                  onClick={() => copyText(WEBHOOK_URL, 'Webhook URL')}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">API Key</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={maskedKey ?? '(not generated)'}
                  className="flex-1 min-w-0 rounded-md bg-gray-800 border border-gray-700 px-3 py-1.5 text-xs text-gray-300 font-mono focus:outline-none"
                />
                {maskedKey && (
                  <Button
                    size="sm" variant="outline"
                    className="shrink-0 h-7 px-2 border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={!revealedKey}
                    title={revealedKey ? 'Copy full key' : 'Regenerate key to copy'}
                    onClick={() => revealedKey && copyText(revealedKey, 'API Key')}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm" variant="outline"
                      className="shrink-0 h-7 px-2 border-gray-700 text-gray-400 hover:text-amber-400"
                      disabled={generating}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-gray-900 border-gray-700">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-gray-100">
                        {hasKey ? 'Regenerate API key?' : 'Generate API key?'}
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-gray-400">
                        {hasKey
                          ? 'A new key will be generated. Your existing key will continue working for 24 hours, giving you time to update any integrations.'
                          : "This will create a new API key for this table's webhook endpoint."
                        }
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-gray-700 text-gray-300 hover:bg-gray-800">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleGenerate} className="bg-amber-600 hover:bg-amber-500 text-white">
                        {hasKey ? 'Regenerate' : 'Generate'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {/* Revealed key banner */}
              {revealedKey && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-xs font-medium text-amber-300">Save this key — it won't be shown again</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs text-amber-200 font-mono break-all select-all">
                      {showKey ? revealedKey : '•'.repeat(Math.min(revealedKey.length, 40))}
                    </code>
                    <button onClick={() => setShowKey((v) => !v)} className="text-amber-400 hover:text-amber-200 shrink-0">
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => copyText(revealedKey, 'Full API key')} className="text-amber-400 hover:text-amber-200 shrink-0">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button onClick={() => setRevealedKey(null)} className="text-[10px] text-amber-500/70 hover:text-amber-400 underline">
                    Dismiss
                  </button>
                </div>
              )}
            </div>

            {/* Auto-create toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-300">Auto-create columns</p>
                <p className="text-xs text-gray-500 mt-0.5">Automatically add new columns from incoming payload keys</p>
              </div>
              <button
                role="switch"
                aria-checked={autoCreate}
                onClick={() => { setAutoCreate((v) => !v); toast.success(autoCreate ? 'Auto-create columns disabled' : 'Auto-create columns enabled') }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${autoCreate ? 'bg-violet-500' : 'bg-gray-700'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition duration-200 ease-in-out ${autoCreate ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Setup Instructions */}
            <DemoSetupInstructions apiKey={maskedKey ?? '(not generated)'} />

            {/* Test button */}
            <Button
              size="sm" variant="outline"
              className="w-full border-gray-700 text-gray-400 hover:text-gray-200"
              onClick={() => setTestOpen(true)}
            >
              Test Webhook
            </Button>
            <DemoTestConsole open={testOpen} onClose={() => setTestOpen(false)} />
          </div>

          {/* Outbound section */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Outbound</p>
            <p className="text-xs text-gray-500">No outbound webhook rules configured for this table.</p>
            <Button size="sm" variant="outline" className="w-full border-gray-700 text-gray-500 cursor-not-allowed" disabled title="Coming soon">
              Add Webhook Rule
            </Button>
          </div>

          {/* Activity log */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <Activity className="w-3.5 h-3.5" />
              Recent Activity
            </div>
            <DemoActivityLog />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Mock Ops Table
// ---------------------------------------------------------------------------

function DemoOpsTable({ onOpenWebhook }: { onOpenWebhook: () => void }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/80">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-100">{DEMO_TABLE_NAME}</span>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{DEMO_ROWS.length} rows</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500 hover:text-gray-300 text-xs">
            Filter
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500 hover:text-gray-300 text-xs">
            Sort
          </Button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <Button
            size="sm" variant="ghost"
            className="h-7 px-2 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 text-xs flex items-center gap-1.5"
            onClick={onOpenWebhook}
            title="API & Webhooks"
          >
            <Zap className="h-3.5 w-3.5" />
            Webhook
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/50">
              {DEMO_COLUMNS.map((col) => (
                <th key={col.key} className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO_ROWS.map((row, i) => (
              <tr key={row.id} className={`border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-900/20'}`}>
                <td className="px-4 py-2.5 text-gray-200 font-medium">{row.company}</td>
                <td className="px-4 py-2.5 text-gray-300">{row.contact_name}</td>
                <td className="px-4 py-2.5 text-blue-400 font-mono text-xs">{row.email}</td>
                <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{row.phone}</td>
                <td className="px-4 py-2.5 text-gray-200 font-mono text-xs">${row.deal_value}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    row.status === 'Qualified' ? 'bg-green-900/40 text-green-300' :
                    row.status === 'Negotiating' ? 'bg-violet-900/40 text-violet-300' :
                    row.status === 'New' ? 'bg-blue-900/40 text-blue-300' :
                    'bg-gray-800 text-gray-400'
                  }`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OpsWebhookDemo() {
  const [panelOpen, setPanelOpen] = useState(false)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-violet-400" />
          <h1 className="text-xl font-semibold text-gray-100">Ops Table Webhooks — Demo</h1>
          <span className="text-xs bg-violet-900/40 text-violet-300 border border-violet-700/50 px-2 py-0.5 rounded-full">Interactive</span>
        </div>
        <p className="text-sm text-gray-400">
          Click <span className="text-violet-300 font-medium">Webhook</span> in the table toolbar to open the settings panel. No backend required — this demo simulates all interactions.
        </p>
      </div>

      {/* What to try */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { n: '1', title: 'Generate API key', desc: 'Click Webhook → RefreshCw button → confirm. Key appears once in the amber banner.' },
          { n: '2', title: 'Explore setup instructions', desc: 'Expand "Setup Instructions" — Zapier, Make, n8n, and cURL/Python tabs with ready-to-use snippets.' },
          { n: '3', title: 'Test the webhook', desc: 'Click "Test Webhook" → edit the JSON payload → watch the AI mapping preview update in real-time.' },
        ].map(({ n, title, desc }) => (
          <div key={n} className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-violet-900/60 text-violet-300 text-xs font-semibold flex items-center justify-center">{n}</span>
              <p className="text-sm font-medium text-gray-200">{title}</p>
            </div>
            <p className="text-xs text-gray-500">{desc}</p>
          </div>
        ))}
      </div>

      {/* The ops table */}
      <DemoOpsTable onOpenWebhook={() => setPanelOpen(true)} />

      {/* The panel */}
      <DemoWebhookPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  )
}

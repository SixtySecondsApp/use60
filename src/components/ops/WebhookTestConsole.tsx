import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Copy, Check, AlertTriangle, Info, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface WebhookTestConsoleProps {
  tableId: string
  webhookUrl: string
  apiKey: string
  apiKeyFull?: string
  columns: Array<{ key: string; label: string; column_type: string }>
  open: boolean
  onClose: () => void
}

interface MappingRow {
  payloadKey: string
  mapsTo: string | null
  action: 'mapped' | 'unmapped' | 'new'
}

function exampleValue(column_type: string): unknown {
  switch (column_type) {
    case 'number':
      return 42
    case 'boolean':
      return true
    case 'date':
      return '2026-02-19'
    case 'url':
      return 'https://example.com'
    case 'email':
      return 'user@example.com'
    default:
      return 'example value'
  }
}

function buildDefaultPayload(
  columns: Array<{ key: string; label: string; column_type: string }>
): string {
  const payload: Record<string, unknown> = {}
  for (const col of columns) {
    payload[col.key] = exampleValue(col.column_type)
  }
  return JSON.stringify(payload, null, 2)
}

interface CopyButtonProps {
  text: string
}

function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

export function WebhookTestConsole({
  tableId,
  webhookUrl,
  apiKey,
  apiKeyFull,
  columns,
  open,
  onClose,
}: WebhookTestConsoleProps) {
  const defaultPayload = buildDefaultPayload(columns)
  const [payload, setPayload] = useState(defaultPayload)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [mappingPreview, setMappingPreview] = useState<MappingRow[] | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const canTest = !!apiKeyFull

  const columnKeys = useMemo(() => new Set(columns.map((c) => c.key)), [columns])
  const columnByKey = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c])), [columns])

  const parsedPayload = useCallback((): Record<string, unknown> | null => {
    try {
      return JSON.parse(payload)
    } catch {
      return null
    }
  }, [payload])

  const buildCurl = (): string => {
    const parsed = parsedPayload()
    const body = parsed ? JSON.stringify(parsed) : payload
    return `curl -X POST '${webhookUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'x-api-key: ${apiKeyFull ?? apiKey}' \\
  -d '${body}'`
  }

  const fetchPreview = useCallback(
    async (parsed: Record<string, unknown>) => {
      if (!canTest) return
      setIsPreviewLoading(true)
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKeyFull!,
          },
          body: JSON.stringify({ table_id: tableId, payload: parsed, dry_run: true }),
        })
        if (!res.ok) {
          setMappingPreview(null)
          return
        }
        const data = await res.json()
        const mapping: MappingRow[] = Object.keys(parsed).map((key) => {
          if (columnKeys.has(key)) {
            return { payloadKey: key, mapsTo: columnByKey[key].label, action: 'mapped' }
          }
          if (data?.mapping?.[key]) {
            return { payloadKey: key, mapsTo: data.mapping[key], action: 'mapped' }
          }
          return { payloadKey: key, mapsTo: null, action: 'unmapped' }
        })
        setMappingPreview(mapping)
      } catch {
        setMappingPreview(null)
      } finally {
        setIsPreviewLoading(false)
      }
    },
    [canTest, webhookUrl, apiKeyFull, tableId, columnKeys, columnByKey]
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(payload)
      setJsonError(null)
    } catch (e: unknown) {
      const msg = e instanceof SyntaxError ? e.message : 'Invalid JSON'
      setJsonError(msg)
      setMappingPreview(null)
      return
    }

    debounceRef.current = setTimeout(() => {
      if (parsed) fetchPreview(parsed)
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [payload, fetchPreview])

  const handleSendTest = async () => {
    const parsed = parsedPayload()
    if (!parsed || !apiKeyFull) return
    setIsSending(true)
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKeyFull,
        },
        body: JSON.stringify({ table_id: tableId, payload: parsed, dry_run: false }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body?.message ?? `Webhook returned ${res.status}`)
      } else {
        toast.success('Test payload sent successfully')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Network error'
      toast.error(msg)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-2xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Test Inbound Webhook</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!canTest && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
              <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Generate or reveal the API key to enable live testing.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              JSON Payload
            </label>
            <textarea
              className={`w-full h-40 rounded-lg border px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                jsonError
                  ? 'border-red-400 dark:border-red-600'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              spellCheck={false}
            />
            {jsonError && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {jsonError}
              </p>
            )}
          </div>

          {(isPreviewLoading || mappingPreview) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Mapping Preview
                </p>
                {isPreviewLoading && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                )}
              </div>
              {mappingPreview && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">
                          Payload Key
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">
                          Maps To
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappingPreview.map((row, i) => (
                        <tr
                          key={row.payloadKey}
                          className={
                            i % 2 === 0
                              ? 'bg-white dark:bg-gray-900'
                              : 'bg-gray-50 dark:bg-gray-800/50'
                          }
                        >
                          <td className="px-3 py-2 font-mono text-blue-600 dark:text-blue-400">
                            {row.payloadKey}
                          </td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                            {row.mapsTo ? (
                              row.mapsTo
                            ) : (
                              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" />
                                Unmapped
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {row.action === 'mapped' ? (
                              <span className="text-green-600 dark:text-green-400">Write</span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400">Skip</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button
              onClick={handleSendTest}
              disabled={!canTest || !!jsonError || isSending}
              className="flex items-center gap-2"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Test
            </Button>
            {!canTest && (
              <p className="text-xs text-gray-400">Regenerate key to enable testing</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Generated cURL
              </p>
            </div>
            <div className="relative rounded-lg bg-gray-900 border border-gray-700">
              <div className="flex items-center justify-between px-3 pt-2 pb-0">
                <span className="text-xs text-gray-500 font-mono select-none">bash</span>
                <CopyButton text={buildCurl()} />
              </div>
              <pre className="overflow-x-auto p-3 pt-1 text-xs font-mono text-gray-200 whitespace-pre-wrap break-all">
                {buildCurl()}
              </pre>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

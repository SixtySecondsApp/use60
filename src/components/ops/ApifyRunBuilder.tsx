import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertTriangle,
  Bot,
  Loader2,
  Play,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { ApifySchemaForm } from './ApifySchemaForm'
import {
  apifyService,
  ApifyActorSchema,
  ApifyRateLimitWarning,
} from '@/lib/services/apifyService'

interface ApifyRunBuilderProps {
  onRunStarted?: (runId: string) => void
}

export function ApifyRunBuilder({ onRunStarted }: ApifyRunBuilderProps) {
  const [actorIdInput, setActorIdInput] = useState('')
  const [actorSchema, setActorSchema] = useState<ApifyActorSchema | null>(null)
  const [loadingSchema, setLoadingSchema] = useState(false)
  const [inputValues, setInputValues] = useState<Record<string, unknown>>({})
  const [starting, setStarting] = useState(false)
  const [rateLimitWarning, setRateLimitWarning] = useState<ApifyRateLimitWarning | null>(null)

  const handleFetchSchema = useCallback(async () => {
    const actorId = actorIdInput.trim()
    if (!actorId) return

    setLoadingSchema(true)
    setActorSchema(null)
    setInputValues({})
    setRateLimitWarning(null)

    try {
      const schema = await apifyService.introspectActor(actorId)
      setActorSchema(schema)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to fetch actor schema')
    } finally {
      setLoadingSchema(false)
    }
  }, [actorIdInput])

  const handleStartRun = useCallback(async (confirmed = false) => {
    if (!actorSchema) return

    setStarting(true)
    setRateLimitWarning(null)

    try {
      const result = await apifyService.startRun({
        actor_id: actorSchema.actor_id,
        input: Object.keys(inputValues).length > 0 ? inputValues : undefined,
        confirmed,
      })

      // Check for rate limit warning
      if ('require_confirmation' in result && result.require_confirmation) {
        setRateLimitWarning(result as ApifyRateLimitWarning)
        setStarting(false)
        return
      }

      if ('run_id' in result) {
        toast.success(`Actor run started (${result.apify_run_id})`)
        onRunStarted?.(result.run_id)
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to start run')
    } finally {
      setStarting(false)
    }
  }, [actorSchema, inputValues, onRunStarted])

  return (
    <div className="space-y-6">
      {/* Actor Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4" />
            Select Actor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="actor_id">Actor ID</Label>
            <div className="flex gap-2">
              <Input
                id="actor_id"
                value={actorIdInput}
                onChange={(e) => setActorIdInput(e.target.value)}
                placeholder="e.g. apify/web-scraper or LpVuK3Zozwuipa5bp"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleFetchSchema() }
                }}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleFetchSchema}
                disabled={!actorIdInput.trim() || loadingSchema}
              >
                {loadingSchema ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Load'
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Enter an actor ID from the Apify store (e.g. "apify/web-scraper")
            </p>
          </div>

          {/* Actor info */}
          {actorSchema && (
            <div className="rounded-lg border border-emerald-200/60 dark:border-emerald-700/30 bg-emerald-50/50 dark:bg-emerald-900/10 p-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  {actorSchema.name}
                </span>
                {actorSchema.cached && (
                  <span className="text-xs text-gray-400">(cached)</span>
                )}
              </div>
              {actorSchema.description && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {actorSchema.description}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dynamic Input Form */}
      {actorSchema && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Actor Input</CardTitle>
          </CardHeader>
          <CardContent>
            <ApifySchemaForm
              schema={actorSchema.input_schema as any}
              defaultValues={actorSchema.default_input as Record<string, unknown> | undefined}
              values={inputValues}
              onChange={setInputValues}
            />
          </CardContent>
        </Card>
      )}

      {/* Rate Limit Warning */}
      {rateLimitWarning && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-600/40 bg-amber-50 dark:bg-amber-900/10 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              {rateLimitWarning.warning}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRateLimitWarning(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => handleStartRun(true)}
              disabled={starting}
            >
              {starting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Continue Anyway
            </Button>
          </div>
        </div>
      )}

      {/* Start Run Button */}
      {actorSchema && !rateLimitWarning && (
        <Button
          onClick={() => handleStartRun(false)}
          disabled={starting || loadingSchema}
          className="w-full gap-2"
          size="lg"
        >
          {starting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {starting ? 'Starting Run...' : 'Start Run'}
        </Button>
      )}
    </div>
  )
}

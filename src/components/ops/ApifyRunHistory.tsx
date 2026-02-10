import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { apifyService, ApifyRun } from '@/lib/services/apifyService'

interface ApifyRunHistoryProps {
  onRerun?: (run: ApifyRun) => void
  onViewResults?: (run: ApifyRun) => void
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  running: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  complete: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  partial: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '-'
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const seconds = Math.floor((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function RunDetailPanel({ run }: { run: ApifyRun }) {
  return (
    <div className="p-4 bg-gray-50/50 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-700 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <span className="text-gray-500 dark:text-gray-400">Records</span>
          <div className="font-medium">{run.total_records}</div>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Mapped</span>
          <div className="font-medium">{run.mapped_records_count}</div>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Errors</span>
          <div className="font-medium text-red-600 dark:text-red-400">{run.error_records_count}</div>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">GDPR Flagged</span>
          <div className="font-medium text-amber-600 dark:text-amber-400">{run.gdpr_flagged_count}</div>
        </div>
      </div>

      {run.error_message && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-700/30 p-3">
          <div className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Error</div>
          <div className="text-sm text-red-600 dark:text-red-300 font-mono whitespace-pre-wrap">
            {run.error_message}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        {run.apify_run_id && (
          <button
            className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300"
            onClick={() => {
              navigator.clipboard.writeText(run.apify_run_id || '')
              toast.success('Run ID copied')
            }}
          >
            <Copy className="w-3 h-3" />
            {run.apify_run_id}
          </button>
        )}
        {run.dataset_id && (
          <span className="ml-2">Dataset: {run.dataset_id}</span>
        )}
      </div>
    </div>
  )
}

export function ApifyRunHistory({ onRerun, onViewResults }: ApifyRunHistoryProps) {
  const [runs, setRuns] = useState<ApifyRun[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  const fetchRuns = useCallback(async () => {
    try {
      setLoading(true)
      const data = await apifyService.listRuns({ limit: 50 })
      setRuns(data)
    } catch (e: any) {
      console.error('[ApifyRunHistory] fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  // Auto-refresh if any runs are pending/running
  useEffect(() => {
    const hasActiveRuns = runs.some((r) => r.status === 'pending' || r.status === 'running')
    if (!hasActiveRuns) return

    const interval = setInterval(fetchRuns, 10000)
    return () => clearInterval(interval)
  }, [runs, fetchRuns])

  if (loading && runs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
        No runs yet. Start your first actor run above.
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Run History
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchRuns}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Records</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <React.Fragment key={run.id}>
                <TableRow
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                >
                  <TableCell className="px-2">
                    {expandedRunId === run.id ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-gray-300">
                    {formatDate(run.created_at)}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {run.actor_name || run.actor_id}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_STYLES[run.status] || STATUS_STYLES.pending}>
                      {run.status === 'running' && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {run.total_records}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {run.cost_usd != null ? `$${run.cost_usd.toFixed(4)}` : '-'}
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-500 dark:text-gray-400">
                    {formatDuration(run.started_at, run.completed_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {onViewResults && run.status === 'complete' && run.mapped_records_count > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-blue-600 dark:text-blue-400"
                          onClick={(e) => {
                            e.stopPropagation()
                            onViewResults(run)
                          }}
                        >
                          Results
                        </Button>
                      )}
                      {onRerun && (run.status === 'complete' || run.status === 'failed') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRerun(run)
                          }}
                        >
                          Re-run
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {expandedRunId === run.id && (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <RunDetailPanel run={run} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

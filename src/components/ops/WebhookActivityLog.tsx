import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, RefreshCw, Webhook } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookLog {
  id: string;
  webhook_id: string;
  direction: 'inbound' | 'outbound';
  status: number | null;
  payload: Record<string, unknown> | null;
  mapped_result: Record<string, unknown> | null;
  rows_affected: number | null;
  error: string | null;
  created_at: string;
}

interface WebhookActivityLogProps {
  webhookId: string | null;
  onRetry?: (log: WebhookLog) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function statusColor(status: number | null): string {
  if (!status) return 'bg-gray-700 text-gray-300';
  if (status >= 200 && status < 300) return 'bg-green-900/60 text-green-300';
  if (status >= 400 && status < 500) return 'bg-amber-900/60 text-amber-300';
  if (status >= 500) return 'bg-red-900/60 text-red-300';
  return 'bg-gray-700 text-gray-300';
}

const PAGE_SIZE = 10;
const TOTAL_LIMIT = 50;

// ---------------------------------------------------------------------------
// WebhookActivityLog
// ---------------------------------------------------------------------------

export function WebhookActivityLog({ webhookId, onRetry }: WebhookActivityLogProps) {
  const [page, setPage] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['webhook-activity-log', webhookId],
    queryFn: async () => {
      if (!webhookId) return [];
      const { data, error } = await (supabase
        .from('ops_webhook_logs') as any)
        .select('id, webhook_id, direction, status, payload, mapped_result, rows_affected, error, created_at')
        .eq('webhook_id', webhookId)
        .order('created_at', { ascending: false })
        .limit(TOTAL_LIMIT);
      if (error) throw error;
      return (data ?? []) as WebhookLog[];
    },
    enabled: !!webhookId,
    refetchInterval: 30_000,
  });

  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const pageLogs = logs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (!webhookId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <Webhook className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">No webhook configured</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-500">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Loading activity...</span>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <Webhook className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm font-medium text-gray-400">No activity yet</p>
        <p className="text-xs mt-1">Webhook calls will appear here once received.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {pageLogs.map((log) => {
        const expanded = expandedIds.has(log.id);
        const isFailedInbound = log.direction === 'inbound' && log.error;

        return (
          <div key={log.id} className="rounded-lg border border-gray-700 bg-gray-900/50 overflow-hidden">
            {/* Row summary */}
            <button
              type="button"
              onClick={() => toggleExpand(log.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-800/50 transition-colors"
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              )}

              {/* Direction badge */}
              <span
                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium flex-shrink-0 ${
                  log.direction === 'inbound'
                    ? 'bg-green-900/60 text-green-300'
                    : 'bg-blue-900/60 text-blue-300'
                }`}
              >
                {log.direction === 'inbound' ? 'Inbound' : 'Outbound'}
              </span>

              {/* Status badge */}
              <span
                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-mono font-medium flex-shrink-0 ${statusColor(log.status)}`}
              >
                {log.status ?? '—'}
              </span>

              {/* Rows affected */}
              <span className="text-xs text-gray-400 flex-shrink-0">
                {log.rows_affected ?? 0} row{(log.rows_affected ?? 0) !== 1 ? 's' : ''}
              </span>

              {/* Spacer */}
              <span className="flex-1" />

              {/* Time */}
              <span className="text-xs text-gray-500 flex-shrink-0">
                {formatRelativeTime(log.created_at)}
              </span>
            </button>

            {/* Expanded detail */}
            {expanded && (
              <div className="border-t border-gray-700 px-3 py-3 space-y-3">
                {log.payload && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-1">Payload</p>
                    <pre className="rounded-md bg-gray-950 border border-gray-800 px-3 py-2 text-xs text-gray-300 overflow-auto max-h-48">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                )}

                {log.mapped_result && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-1">Mapped result</p>
                    <pre className="rounded-md bg-gray-950 border border-gray-800 px-3 py-2 text-xs text-gray-300 overflow-auto max-h-48">
                      {JSON.stringify(log.mapped_result, null, 2)}
                    </pre>
                  </div>
                )}

                {log.error && (
                  <div>
                    <p className="text-xs font-medium text-red-400 mb-1">Error</p>
                    <p className="text-xs text-red-300 rounded-md bg-red-950/40 border border-red-900/50 px-3 py-2">
                      {log.error}
                    </p>
                  </div>
                )}

                {isFailedInbound && onRetry && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-600 text-gray-300 hover:bg-gray-700"
                    onClick={() => onRetry(log)}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Retry
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="text-gray-400 disabled:opacity-30"
          >
            Previous
          </Button>
          <span className="text-xs text-gray-500">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="text-gray-400 disabled:opacity-30"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

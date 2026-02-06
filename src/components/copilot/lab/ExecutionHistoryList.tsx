/**
 * ExecutionHistoryList Component
 *
 * Filterable list of past skill/sequence executions with expandable replay.
 * Used in Copilot Lab History tab and per-skill History tabs.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExecutionHistory } from '@/lib/hooks/useExecutionHistory';
import { ExecutionReplayPanel } from './ExecutionReplayPanel';
import type { ExecutionHistoryItem, ExecutionHistoryFilters } from '@/lib/types/executionHistory';

// =============================================================================
// Types
// =============================================================================

interface ExecutionHistoryListProps {
  orgId: string | undefined;
  /** Pre-filter to a specific skill */
  skillKey?: string;
  /** Pre-filter to a specific sequence */
  sequenceKey?: string;
  /** Callback when re-run is clicked */
  onReRun?: (userMessage: string) => void;
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// =============================================================================
// Component
// =============================================================================

export function ExecutionHistoryList({
  orgId,
  skillKey,
  sequenceKey,
  onReRun,
  className,
}: ExecutionHistoryListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const filters: ExecutionHistoryFilters = useMemo(() => ({
    skillKey: skillKey || undefined,
    sequenceKey: sequenceKey || undefined,
    success: statusFilter === 'all' ? undefined : statusFilter === 'success',
    limit: pageSize,
    offset: page * pageSize,
  }), [skillKey, sequenceKey, statusFilter, page]);

  const { data: executions, isLoading, error } = useExecutionHistory(orgId, filters);

  // Client-side search filter on user_message
  const filtered = useMemo(() => {
    if (!executions) return [];
    if (!searchQuery.trim()) return executions;
    const q = searchQuery.toLowerCase();
    return executions.filter(
      (e) =>
        e.user_message.toLowerCase().includes(q) ||
        (e.skill_key?.toLowerCase().includes(q)) ||
        (e.sequence_key?.toLowerCase().includes(q))
    );
  }, [executions, searchQuery]);

  if (error) {
    return (
      <div className="text-center py-12 text-red-400">
        <p className="text-sm">Failed to load execution history</p>
        <p className="text-xs text-zinc-500 mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filters */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by message, skill, or sequence..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-0.5">
          {(['all', 'success', 'error'] as const).map((status) => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); setPage(0); }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                statusFilter === status
                  ? 'bg-zinc-700 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {status === 'all' ? 'All' : status === 'success' ? 'Success' : 'Errors'}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
          <span className="ml-2 text-sm text-zinc-500">Loading executions...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
          <Inbox className="w-10 h-10 mb-3 text-zinc-600" />
          <p className="text-sm font-medium">No executions yet</p>
          <p className="text-xs mt-1">
            {skillKey || sequenceKey
              ? 'No runs recorded for this skill'
              : 'Skill and sequence runs will appear here'}
          </p>
        </div>
      )}

      {/* Execution list */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-1.5">
          {filtered.map((execution) => {
            const isExpanded = expandedId === execution.execution_id;

            return (
              <div
                key={execution.execution_id}
                className="border border-zinc-700/50 rounded-lg overflow-hidden"
              >
                {/* Row header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : execution.execution_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                  )}

                  {/* Status icon */}
                  {execution.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}

                  {/* User message */}
                  <span className="text-sm text-zinc-200 truncate flex-1 min-w-0">
                    {execution.user_message}
                  </span>

                  {/* Skill/sequence badge */}
                  {(execution.sequence_key || execution.skill_key) && (
                    <span className="text-xs bg-zinc-700/50 text-zinc-400 px-2 py-0.5 rounded-full font-mono shrink-0 max-w-[140px] truncate">
                      {execution.sequence_key || execution.skill_key}
                    </span>
                  )}

                  {/* Has preview badge */}
                  {execution.has_structured_response && (
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded shrink-0">
                      Preview
                    </span>
                  )}

                  {/* Duration */}
                  <span className="text-xs text-zinc-500 shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(execution.duration_ms)}
                  </span>

                  {/* Time */}
                  <span className="text-xs text-zinc-600 shrink-0 w-16 text-right">
                    {formatRelativeTime(execution.started_at)}
                  </span>
                </button>

                {/* Expanded replay */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-2 border-t border-zinc-700/50">
                        <ExecutionReplayPanel
                          execution={execution}
                          onReRun={onReRun}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && executions && executions.length >= pageSize && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-600">Page {page + 1}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={executions.length < pageSize}
            className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

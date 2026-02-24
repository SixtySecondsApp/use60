/**
 * ExecutionReplayPanel Component
 *
 * Renders a full execution replay: metadata header, tool call chain,
 * and the rendered structured response exactly as the user saw it.
 * Used in Copilot Lab History tab and per-skill History tab.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  Wrench,
  Play,
  User,
  MessageSquare,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import CopilotResponse from '@/components/copilot/CopilotResponse';
import type { ExecutionHistoryItem, ExecutionToolCall } from '@/lib/types/executionHistory';

// =============================================================================
// Types
// =============================================================================

interface ExecutionReplayPanelProps {
  execution: ExecutionHistoryItem;
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

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTokens(tokens: number | null): string {
  if (!tokens) return '-';
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return String(tokens);
}

// =============================================================================
// Sub-components
// =============================================================================

function ToolCallReplay({ toolCall }: { toolCall: ExecutionToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = {
    running: 'text-blue-400',
    completed: 'text-emerald-400',
    error: 'text-red-400',
  }[toolCall.status] || 'text-zinc-400';

  const StatusIcon = toolCall.status === 'error' ? XCircle : CheckCircle2;

  return (
    <div className="border border-zinc-700/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-800/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        )}
        <Wrench className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <span className="text-sm font-mono text-zinc-200 truncate">
          {toolCall.tool_name}
        </span>
        {toolCall.skill_key && (
          <span className="text-xs text-zinc-500 truncate">
            ({toolCall.skill_key})
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {toolCall.duration_ms !== null && (
            <span className="text-xs text-zinc-500">
              {formatDuration(toolCall.duration_ms)}
            </span>
          )}
          <StatusIcon className={cn('w-3.5 h-3.5', statusColor)} />
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-zinc-700/50">
              {/* Input */}
              {toolCall.input && Object.keys(toolCall.input).length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-zinc-500 mb-1">Input</p>
                  <pre className="text-xs text-zinc-300 bg-zinc-900/50 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                    {JSON.stringify(toolCall.input, null, 2)}
                  </pre>
                </div>
              )}

              {/* Output */}
              {toolCall.output && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Output</p>
                  <pre className="text-xs text-zinc-300 bg-zinc-900/50 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                    {typeof toolCall.output === 'string'
                      ? toolCall.output
                      : JSON.stringify(toolCall.output, null, 2)}
                  </pre>
                </div>
              )}

              {/* Error */}
              {toolCall.error_message && (
                <div>
                  <p className="text-xs font-medium text-red-400 mb-1">Error</p>
                  <pre className="text-xs text-red-300 bg-red-950/30 rounded p-2 overflow-x-auto">
                    {toolCall.error_message}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ExecutionReplayPanel({
  execution,
  onReRun,
  className,
}: ExecutionReplayPanelProps) {
  const [showToolCalls, setShowToolCalls] = useState(true);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Metadata Header */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {execution.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span className={cn(
              'text-sm font-medium',
              execution.success ? 'text-emerald-400' : 'text-red-400'
            )}>
              {execution.success ? 'Success' : 'Failed'}
            </span>
            {(execution.skill_key || execution.sequence_key) && (
              <span className="text-xs bg-zinc-700/50 text-zinc-300 px-2 py-0.5 rounded-full font-mono truncate">
                {execution.sequence_key || execution.skill_key}
              </span>
            )}
          </div>

          {onReRun && (
            <button
              onClick={() => onReRun(execution.user_message)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md hover:bg-blue-500/20 transition-colors shrink-0"
            >
              <Play className="w-3 h-3" />
              Re-run
            </button>
          )}
        </div>

        {/* User message */}
        <div className="flex items-start gap-2">
          <User className="w-3.5 h-3.5 text-zinc-500 mt-0.5 shrink-0" />
          <p className="text-sm text-zinc-300 line-clamp-2">{execution.user_message}</p>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimestamp(execution.started_at)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(execution.duration_ms)}
          </span>
          <span className="flex items-center gap-1">
            <Coins className="w-3 h-3" />
            {formatTokens(execution.total_tokens)} tokens
          </span>
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3" />
            {execution.tool_call_count} tool{execution.tool_call_count !== 1 ? 's' : ''}
          </span>
        </div>

        {execution.error_message && (
          <div className="flex items-start gap-2 mt-2 p-2 bg-red-950/30 border border-red-500/20 rounded-md">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{execution.error_message}</p>
          </div>
        )}
      </div>

      {/* Tool Call Chain */}
      {execution.tool_calls.length > 0 && (
        <div>
          <button
            onClick={() => setShowToolCalls(!showToolCalls)}
            className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-colors mb-2"
          >
            {showToolCalls ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <Wrench className="w-3.5 h-3.5" />
            Tool Calls ({execution.tool_calls.length})
          </button>

          <AnimatePresence>
            {showToolCalls && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-1.5 overflow-hidden"
              >
                {execution.tool_calls.map((tc) => (
                  <ToolCallReplay key={tc.id} toolCall={tc} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Structured Response Preview */}
      {execution.structured_response ? (
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-400 mb-2">
            <MessageSquare className="w-3.5 h-3.5" />
            Response Preview
            <span className="text-xs bg-zinc-700/50 text-zinc-400 px-2 py-0.5 rounded-full font-mono">
              {execution.structured_response.type}
            </span>
          </div>
          <div className="border border-zinc-700/50 rounded-lg p-4 bg-zinc-900/30">
            <CopilotResponse
              response={execution.structured_response as any}
              onActionClick={() => {
                // Actions are view-only in replay mode — no navigation
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-zinc-500 italic">
          <MessageSquare className="w-3.5 h-3.5" />
          No structured response stored for this execution
        </div>
      )}
    </div>
  );
}

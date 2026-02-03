/**
 * ToolCallCard Component
 *
 * Displays a tool call with expandable input/output details.
 * Used within ChatMessage to show when Claude calls skills.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Wrench,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolCall } from '@/lib/hooks/useCopilotChat';

// =============================================================================
// Types
// =============================================================================

export interface ToolCallCardProps {
  toolCall: ToolCall;
  /** Whether this is a sequence tool */
  isSequence?: boolean;
  /** Compact mode for inline display */
  compact?: boolean;
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function ToolCallCard({
  toolCall,
  isSequence = false,
  compact = false,
  className,
}: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusColors = {
    running: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    completed: 'text-green-500 bg-green-500/10 border-green-500/20',
    error: 'text-red-500 bg-red-500/10 border-red-500/20',
  };

  const StatusIcon = {
    running: Loader2,
    completed: CheckCircle2,
    error: XCircle,
  }[toolCall.status];

  const TypeIcon = isSequence ? Zap : Wrench;

  // Format tool name for display
  const displayName = toolCall.name.replace(/_/g, ' ').replace(/-/g, ' ');

  // Summarize input for collapsed view
  const inputSummary = Object.entries(toolCall.input || {})
    .slice(0, 2)
    .map(([key, value]) => {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      return `${key}: ${strValue.slice(0, 20)}${strValue.length > 20 ? '...' : ''}`;
    })
    .join(', ');

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium',
          statusColors[toolCall.status],
          className
        )}
      >
        <StatusIcon
          className={cn('w-3 h-3', toolCall.status === 'running' && 'animate-spin')}
        />
        <span className="capitalize">{displayName}</span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border transition-all duration-200',
        statusColors[toolCall.status],
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors rounded-t-lg"
      >
        {/* Expand icon */}
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0" />
        )}

        {/* Type icon */}
        <TypeIcon className="w-4 h-4 shrink-0" />

        {/* Tool name */}
        <span className="font-medium capitalize flex-1 truncate">{displayName}</span>

        {/* Status */}
        <StatusIcon
          className={cn('w-4 h-4 shrink-0', toolCall.status === 'running' && 'animate-spin')}
        />
      </button>

      {/* Summary (when collapsed) */}
      {!isExpanded && inputSummary && (
        <div className="px-3 pb-2 text-xs text-muted-foreground truncate">
          {inputSummary}
        </div>
      )}

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3 border-t border-current/10 pt-3">
              {/* Input */}
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wide mb-1 opacity-70">
                  Input
                </h4>
                <pre className="text-xs bg-black/20 rounded p-2 overflow-x-auto max-h-32 overflow-y-auto">
                  {JSON.stringify(toolCall.input, null, 2)}
                </pre>
              </div>

              {/* Output/Error */}
              {toolCall.status === 'completed' && toolCall.result !== undefined && (
                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wide mb-1 opacity-70">
                    Output
                  </h4>
                  <pre className="text-xs bg-black/20 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                    {typeof toolCall.result === 'string'
                      ? toolCall.result
                      : JSON.stringify(toolCall.result, null, 2)}
                  </pre>
                </div>
              )}

              {toolCall.status === 'error' && toolCall.error && (
                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wide mb-1 opacity-70">
                    Error
                  </h4>
                  <pre className="text-xs bg-red-500/10 text-red-400 rounded p-2">
                    {toolCall.error}
                  </pre>
                </div>
              )}

              {/* Timing */}
              <div className="flex items-center gap-4 text-xs opacity-60">
                <span>
                  Started: {toolCall.startedAt.toLocaleTimeString()}
                </span>
                {toolCall.completedAt && (
                  <>
                    <span>
                      Duration:{' '}
                      {Math.round(
                        (toolCall.completedAt.getTime() - toolCall.startedAt.getTime()) / 1000
                      )}
                      s
                    </span>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ToolCallCard;

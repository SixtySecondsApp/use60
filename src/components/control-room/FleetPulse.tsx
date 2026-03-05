/**
 * FleetPulse — Control Room widget (CTRL-002)
 *
 * Shows one row per fleet agent with:
 * - Agent name and status badge (running/idle/throttled/errored)
 * - Last execution timestamp (relative)
 * - Items generated today count
 * - 7-day error rate percentage
 * - Click-to-expand showing last error message for errored agents
 * - Empty state when no sequence_jobs exist yet
 */

import { useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Activity,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFleetPulse, type FleetAgentRow, type AgentStatus } from '@/lib/hooks/useFleetPulse';

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// ============================================================================
// Status badge
// ============================================================================

interface StatusBadgeProps {
  status: AgentStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<AgentStatus, { label: string; classes: string; Icon: typeof Activity }> = {
    running: {
      label: 'Running',
      classes: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
      Icon: Activity,
    },
    idle: {
      label: 'Idle',
      classes: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
      Icon: CheckCircle2,
    },
    throttled: {
      label: 'Throttled',
      classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400',
      Icon: MinusCircle,
    },
    errored: {
      label: 'Errored',
      classes: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
      Icon: XCircle,
    },
  };

  const { label, classes, Icon } = config[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        classes
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ============================================================================
// Error rate bar
// ============================================================================

interface ErrorRateBarProps {
  rate: number; // 0-100
  total: number;
}

function ErrorRateBar({ rate, total }: ErrorRateBarProps) {
  if (total === 0) {
    return <span className="text-xs text-muted-foreground">No data</span>;
  }

  const colorClass =
    rate === 0
      ? 'bg-green-500'
      : rate < 20
      ? 'bg-yellow-500'
      : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colorClass)}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <span
        className={cn(
          'text-xs font-medium tabular-nums',
          rate === 0
            ? 'text-green-600 dark:text-green-400'
            : rate < 20
            ? 'text-yellow-600 dark:text-yellow-400'
            : 'text-red-600 dark:text-red-400'
        )}
      >
        {rate}%
      </span>
    </div>
  );
}

// ============================================================================
// Agent row
// ============================================================================

interface AgentRowProps {
  agent: FleetAgentRow;
  isExpanded: boolean;
  onToggle: () => void;
}

function AgentRow({ agent, isExpanded, onToggle }: AgentRowProps) {
  const isErrored = agent.status === 'errored';
  const hasError = !!agent.lastErrorMessage;
  const isClickable = isErrored && hasError;

  return (
    <div
      className={cn(
        'border-b border-gray-100 dark:border-gray-800 last:border-0',
        isErrored && 'bg-red-50/50 dark:bg-red-500/5'
      )}
    >
      {/* Main row */}
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 text-sm',
          isClickable && 'cursor-pointer hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors'
        )}
        onClick={isClickable ? onToggle : undefined}
        role={isClickable ? 'button' : undefined}
        aria-expanded={isClickable ? isExpanded : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle();
                }
              }
            : undefined
        }
      >
        {/* Expand chevron (only visible for errored agents with error message) */}
        <div className="w-4 shrink-0">
          {isClickable ? (
            isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-red-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-red-400" />
            )
          ) : null}
        </div>

        {/* Agent name */}
        <div className="w-36 shrink-0">
          <span
            className={cn(
              'font-medium text-gray-900 dark:text-gray-100 truncate block',
              isErrored && 'text-red-700 dark:text-red-400'
            )}
          >
            {agent.label}
          </span>
        </div>

        {/* Status badge */}
        <div className="w-24 shrink-0">
          <StatusBadge status={agent.status} />
        </div>

        {/* Last run */}
        <div className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatRelativeTime(agent.lastRunAt)}
        </div>

        {/* Items today */}
        <div className="w-20 shrink-0 text-center">
          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
            {agent.itemsToday}
          </span>
          <span className="text-xs text-muted-foreground ml-1">today</span>
        </div>

        {/* 7-day error rate */}
        <div className="flex-1">
          <ErrorRateBar rate={agent.errorRate7d} total={agent.totalJobs7d} />
        </div>

        {/* Alert icon for errored agents */}
        <div className="w-5 shrink-0">
          {isErrored && (
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          )}
        </div>
      </div>

      {/* Expanded error panel */}
      {isExpanded && hasError && (
        <div className="mx-3 mb-2.5 px-3 py-2 rounded-md bg-red-100 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30">
          <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-0.5">
            Last error
          </p>
          <p className="text-xs text-red-600 dark:text-red-300 font-mono break-all">
            {agent.lastErrorMessage}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Empty state
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <Bot className="w-8 h-8 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">No agent activity yet</p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        Fleet agents will appear here once they start running
      </p>
    </div>
  );
}

// ============================================================================
// Column header
// ============================================================================

function TableHeader() {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <div className="w-4 shrink-0" /> {/* chevron placeholder */}
      <div className="w-36 shrink-0 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Agent
      </div>
      <div className="w-24 shrink-0 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Status
      </div>
      <div className="w-20 shrink-0 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Last run
      </div>
      <div className="w-20 shrink-0 text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
        Items
      </div>
      <div className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        7d errors
      </div>
      <div className="w-5 shrink-0" />
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function FleetPulse() {
  const { data, isLoading, error } = useFleetPulse();
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const toggleAgent = (agentId: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-6 px-4 text-center gap-2">
        <AlertTriangle className="w-5 h-5 text-red-400" />
        <p className="text-xs text-muted-foreground">Failed to load fleet status</p>
      </div>
    );
  }

  if (!data?.hasAnyData) {
    return <EmptyState />;
  }

  return (
    <div className="overflow-x-auto -mx-3">
      <div className="min-w-[560px]">
        <TableHeader />
        <div>
          {data.agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              isExpanded={expandedAgents.has(agent.id)}
              onToggle={() => toggleAgent(agent.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

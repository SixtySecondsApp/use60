/**
 * ActionFeed — Control Room widget (CTRL-005)
 *
 * Cross-team activity stream showing agent actions newest-first.
 *
 * Features:
 * - Scrollable feed (max-h capped, overflow-y-auto)
 * - Filter bar: rep (multi-select), agent type, action type, outcome
 * - Each entry: relative timestamp, agent icon, rep name, action summary
 * - Click to expand: action_detail JSONB + decision_reasoning
 * - chain_id link: clicking it filters the feed to show all steps in that chain
 * - Fallback notice when rendering command_centre_items instead of agent_daily_logs
 *
 * @see src/lib/hooks/useActionFeed.ts
 * @see supabase/migrations/20260226900001_agent_daily_logs.sql
 */

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FilterX,
  Inbox,
  Link2,
  Loader2,
  MailCheck,
  RefreshCw,
  XCircle,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActionFeed, type ActionFeedFilters, type ActionFeedEntry, type ActionFeedOutcome } from '@/lib/hooks/useActionFeed';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ============================================================================
// Constants
// ============================================================================

const AGENT_TYPE_OPTIONS = [
  { value: 'meeting_ended', label: 'Meeting Ended' },
  { value: 'deal_risk', label: 'Deal Risk' },
  { value: 'reengagement', label: 'Re-engagement' },
  { value: 'pre_meeting', label: 'Pre-Meeting' },
  { value: 'health_recalculate', label: 'Health Recalculate' },
  { value: 'eod_synthesis', label: 'EOD Synthesis' },
  { value: 'pipeline_monitor', label: 'Pipeline Monitor' },
  { value: 'morning_brief', label: 'Morning Brief' },
] as const;

const ACTION_TYPE_OPTIONS = [
  { value: 'classify', label: 'Classify' },
  { value: 'draft_email', label: 'Draft Email' },
  { value: 'send_email', label: 'Send Email' },
  { value: 'update_crm', label: 'Update CRM' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'slack_notify', label: 'Slack Notify' },
  { value: 'research', label: 'Research' },
] as const;

const OUTCOME_OPTIONS: { value: ActionFeedOutcome; label: string }[] = [
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'skipped', label: 'Skipped' },
];

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hrs = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function humaniseAgentType(raw: string): string {
  const MAP: Record<string, string> = {
    meeting_ended: 'Meeting Ended',
    deal_risk: 'Deal Risk',
    reengagement: 'Re-engagement',
    pre_meeting: 'Pre-Meeting',
    health_recalculate: 'Health Recalculate',
    eod_synthesis: 'EOD Synthesis',
    pipeline_monitor: 'Pipeline Monitor',
    morning_brief: 'Morning Brief',
  };
  return MAP[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncateChainId(id: string): string {
  return id.slice(0, 8) + '…';
}

// ============================================================================
// Outcome badge
// ============================================================================

interface OutcomeBadgeProps {
  outcome: ActionFeedOutcome;
}

function OutcomeBadge({ outcome }: OutcomeBadgeProps) {
  const config: Record<
    ActionFeedOutcome,
    { label: string; classes: string; Icon: typeof Activity }
  > = {
    success: {
      label: 'Success',
      classes: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
      Icon: CheckCircle2,
    },
    failed: {
      label: 'Failed',
      classes: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
      Icon: XCircle,
    },
    pending: {
      label: 'Pending',
      classes: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
      Icon: Clock,
    },
    cancelled: {
      label: 'Cancelled',
      classes: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
      Icon: XCircle,
    },
    skipped: {
      label: 'Skipped',
      classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400',
      Icon: Activity,
    },
  };

  const { label, classes, Icon } = config[outcome];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0',
        classes,
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

// ============================================================================
// Agent icon
// ============================================================================

function AgentIcon({ agentType }: { agentType: string }) {
  // Different icons for different agent categories
  const iconClass = 'w-4 h-4 shrink-0';

  if (agentType.includes('email') || agentType === 'send_email' || agentType === 'draft_email') {
    return <MailCheck className={cn(iconClass, 'text-blue-500')} />;
  }
  if (agentType.includes('deal') || agentType.includes('pipeline')) {
    return <Activity className={cn(iconClass, 'text-purple-500')} />;
  }
  if (agentType.includes('meeting')) {
    return <Zap className={cn(iconClass, 'text-amber-500')} />;
  }
  if (agentType.includes('morning') || agentType.includes('eod')) {
    return <Clock className={cn(iconClass, 'text-teal-500')} />;
  }
  return <Bot className={cn(iconClass, 'text-[#37bd7e]')} />;
}

// ============================================================================
// Expanded detail panel
// ============================================================================

interface DetailPanelProps {
  entry: ActionFeedEntry;
}

function DetailPanel({ entry }: DetailPanelProps) {
  const hasDetail = Object.keys(entry.actionDetail).length > 0;
  const hasReasoning = !!entry.decisionReasoning;

  return (
    <div className="mx-3 mb-2.5 space-y-2">
      {/* Action detail JSONB */}
      {hasDetail && (
        <div className="rounded-md bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 p-2.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Action Detail
          </p>
          <pre className="text-[11px] text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
            {JSON.stringify(entry.actionDetail, null, 2)}
          </pre>
        </div>
      )}

      {/* AI reasoning */}
      {hasReasoning && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 p-2.5">
          <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">
            AI Reasoning
          </p>
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            {entry.decisionReasoning}
          </p>
        </div>
      )}

      {/* Meta: credit cost + execution time */}
      {(entry.creditCost != null || entry.executionMs != null) && (
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          {entry.creditCost != null && (
            <span>
              <span className="font-medium">Credits:</span> {entry.creditCost.toFixed(2)}
            </span>
          )}
          {entry.executionMs != null && (
            <span>
              <span className="font-medium">Duration:</span> {entry.executionMs}ms
            </span>
          )}
        </div>
      )}

      {/* Error message */}
      {entry.errorMessage && (
        <div className="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-2.5">
          <p className="text-[10px] font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide mb-1">
            Error
          </p>
          <p className="text-xs text-red-600 dark:text-red-300 font-mono break-all">
            {entry.errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Feed entry row
// ============================================================================

interface FeedEntryRowProps {
  entry: ActionFeedEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onChainClick: (chainId: string) => void;
  isChainFiltered: boolean;
}

function FeedEntryRow({
  entry,
  isExpanded,
  onToggle,
  onChainClick,
  isChainFiltered,
}: FeedEntryRowProps) {
  return (
    <div
      className={cn(
        'border-b border-gray-100 dark:border-gray-800 last:border-0',
        entry.outcome === 'failed' && 'bg-red-50/40 dark:bg-red-500/5',
      )}
    >
      {/* Main row */}
      <div
        className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors select-none"
        onClick={onToggle}
        role="button"
        aria-expanded={isExpanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {/* Expand chevron */}
        <div className="mt-0.5 shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>

        {/* Agent icon */}
        <div className="mt-0.5 shrink-0">
          <AgentIcon agentType={entry.agentType} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Top line: rep name + agent type */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {entry.repName ? (
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[120px]">
                {entry.repName}
              </span>
            ) : null}
            <span className="text-[10px] text-muted-foreground bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full shrink-0">
              {humaniseAgentType(entry.agentType)}
            </span>
          </div>

          {/* Summary line */}
          <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 leading-snug">
            {entry.summary}
          </p>

          {/* Bottom line: timestamp + chain link */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <time
              dateTime={entry.createdAt}
              title={formatAbsoluteTime(entry.createdAt)}
              className="text-[10px] text-muted-foreground tabular-nums shrink-0"
            >
              {formatRelativeTime(entry.createdAt)}
            </time>

            {entry.chainId && (
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-0.5 text-[10px] font-mono rounded px-1 py-0.5 transition-colors shrink-0',
                  isChainFiltered
                    ? 'bg-[#37bd7e]/20 text-[#37bd7e] dark:bg-[#37bd7e]/15'
                    : 'bg-gray-100 dark:bg-gray-800 text-muted-foreground hover:bg-[#37bd7e]/15 hover:text-[#37bd7e]',
                )}
                title={isChainFiltered ? 'Clear chain filter' : `Filter to chain ${entry.chainId}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChainClick(entry.chainId!);
                }}
              >
                <Link2 className="w-2.5 h-2.5" />
                {truncateChainId(entry.chainId)}
                {entry.waveNumber != null && (
                  <span className="ml-0.5 opacity-70">w{entry.waveNumber}</span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Outcome badge — right-aligned */}
        <div className="shrink-0 mt-0.5">
          <OutcomeBadge outcome={entry.outcome} />
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && <DetailPanel entry={entry} />}
    </div>
  );
}

// ============================================================================
// Filter bar
// ============================================================================

interface FilterBarProps {
  agentType: string;
  actionType: string;
  outcome: string;
  onAgentTypeChange: (v: string) => void;
  onActionTypeChange: (v: string) => void;
  onOutcomeChange: (v: string) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
  chainId: string | null;
  onClearChain: () => void;
}

function FilterBar({
  agentType,
  actionType,
  outcome,
  onAgentTypeChange,
  onActionTypeChange,
  onOutcomeChange,
  onClearAll,
  hasActiveFilters,
  chainId,
  onClearChain,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 pb-2 border-b border-gray-100 dark:border-gray-800">
      {/* Agent type filter */}
      <Select value={agentType} onValueChange={onAgentTypeChange}>
        <SelectTrigger className="h-7 text-xs w-[136px]">
          <SelectValue placeholder="Agent type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All agents</SelectItem>
          {AGENT_TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Action type filter */}
      <Select value={actionType} onValueChange={onActionTypeChange}>
        <SelectTrigger className="h-7 text-xs w-[128px]">
          <SelectValue placeholder="Action type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All actions</SelectItem>
          {ACTION_TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Outcome filter */}
      <Select value={outcome} onValueChange={onOutcomeChange}>
        <SelectTrigger className="h-7 text-xs w-[112px]">
          <SelectValue placeholder="Outcome" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All outcomes</SelectItem>
          {OUTCOME_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Active chain filter chip */}
      {chainId && (
        <button
          type="button"
          onClick={onClearChain}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-[#37bd7e]/15 text-[#37bd7e] hover:bg-[#37bd7e]/25 transition-colors"
        >
          <Link2 className="w-2.5 h-2.5" />
          Chain: {truncateChainId(chainId)}
          <XCircle className="w-2.5 h-2.5 ml-0.5 opacity-70" />
        </button>
      )}

      {/* Clear all filters */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-gray-700 dark:hover:text-gray-200 transition-colors ml-auto"
        >
          <FilterX className="w-3 h-3" />
          Clear filters
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Empty state
// ============================================================================

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <Inbox className="w-8 h-8 text-muted-foreground/30 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">
        {hasFilters ? 'No actions match these filters' : 'No agent actions yet'}
      </p>
      <p className="text-xs text-muted-foreground/60 mt-1">
        {hasFilters
          ? 'Try adjusting or clearing your filters'
          : 'Agent actions will appear here as the fleet runs'}
      </p>
    </div>
  );
}

// ============================================================================
// Fallback notice
// ============================================================================

function FallbackNotice() {
  return (
    <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-center gap-1.5">
      <RefreshCw className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
      <p className="text-[10px] text-amber-700 dark:text-amber-400">
        Showing Command Centre items — agent action logs will appear here once the fleet starts running
      </p>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function ActionFeed() {
  // ---- Filter state (single-select per dimension for simplicity) ----
  const [agentTypeFilter, setAgentTypeFilter] = useState('__all__');
  const [actionTypeFilter, setActionTypeFilter] = useState('__all__');
  const [outcomeFilter, setOutcomeFilter] = useState('__all__');
  const [chainId, setChainId] = useState<string | null>(null);

  // ---- Expanded rows ----
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ---- Build filters for the hook ----
  const filters: ActionFeedFilters = {
    agentTypes: agentTypeFilter !== '__all__' ? [agentTypeFilter] : undefined,
    actionTypes: actionTypeFilter !== '__all__' ? [actionTypeFilter] : undefined,
    outcomes: outcomeFilter !== '__all__' ? [outcomeFilter as ActionFeedOutcome] : undefined,
    chainId: chainId ?? undefined,
  };

  const hasActiveFilters =
    agentTypeFilter !== '__all__' ||
    actionTypeFilter !== '__all__' ||
    outcomeFilter !== '__all__' ||
    chainId !== null;

  const { data, isLoading, error } = useActionFeed(filters);

  const handleChainClick = useCallback((id: string) => {
    setChainId((prev) => (prev === id ? null : id));
    // Collapse all expanded rows when switching chain filter
    setExpandedIds(new Set());
  }, []);

  const handleClearAll = useCallback(() => {
    setAgentTypeFilter('__all__');
    setActionTypeFilter('__all__');
    setOutcomeFilter('__all__');
    setChainId(null);
    setExpandedIds(new Set());
  }, []);

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
        <AlertTriangle className="w-5 h-5 text-red-400" />
        <p className="text-xs text-muted-foreground">Failed to load action feed</p>
      </div>
    );
  }

  const entries = data?.entries ?? [];
  const isPrimarySource = data?.isPrimarySource ?? true;

  return (
    <div className="flex flex-col gap-0">
      {/* Filter bar */}
      <FilterBar
        agentType={agentTypeFilter}
        actionType={actionTypeFilter}
        outcome={outcomeFilter}
        onAgentTypeChange={setAgentTypeFilter}
        onActionTypeChange={setActionTypeFilter}
        onOutcomeChange={setOutcomeFilter}
        onClearAll={handleClearAll}
        hasActiveFilters={hasActiveFilters}
        chainId={chainId}
        onClearChain={() => setChainId(null)}
      />

      {/* Fallback source notice */}
      {!isPrimarySource && data?.hasAnyData && (
        <div className="pt-2">
          <FallbackNotice />
        </div>
      )}

      {/* Feed list */}
      {entries.length === 0 ? (
        <EmptyState hasFilters={hasActiveFilters} />
      ) : (
        <div className="overflow-y-auto max-h-[400px] -mx-3">
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <FeedEntryRow
                  entry={entry}
                  isExpanded={expandedIds.has(entry.id)}
                  onToggle={() => toggleExpanded(entry.id)}
                  onChainClick={handleChainClick}
                  isChainFiltered={chainId === entry.chainId}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Entry count footer */}
      {entries.length > 0 && (
        <div className="pt-2 text-[10px] text-muted-foreground text-right pr-1">
          {entries.length} action{entries.length !== 1 ? 's' : ''}
          {hasActiveFilters ? ' (filtered)' : ' (latest 50)'}
          {!isPrimarySource ? ' · from Command Centre' : ''}
        </div>
      )}
    </div>
  );
}

export default ActionFeed;

/**
 * BrainAgentLog — Agent Log tab content for the Brain page
 *
 * Shows a filterable list of agent daily log entries with chain grouping.
 * Each entry is expandable to reveal full decision reasoning, action detail,
 * input context, and error messages.
 *
 * TRINITY-014
 */

import { useState, useMemo } from 'react';
import {
  Bot,
  ChevronRight,
  Clock,
  Zap,
  Coins,
  AlertCircle,
  Link2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  useAgentDailyLogs,
  type AgentDailyLog,
  type AgentDailyLogsFilters,
} from '@/lib/hooks/useAgentDailyLogs';

// ============================================================================
// Constants
// ============================================================================

const AGENT_TYPES = [
  { value: '__all__', label: 'All Agents' },
  { value: 'morning-brief', label: 'Morning Brief' },
  { value: 'post-meeting', label: 'Post Meeting' },
  { value: 'deal-risk', label: 'Deal Risk' },
  { value: 'reengagement', label: 'Re-engagement' },
  { value: 'competitive-intel', label: 'Competitive Intel' },
  { value: 'email-signals', label: 'Email Signals' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'prep', label: 'Prep' },
] as const;

const OUTCOMES = [
  { value: '__all__', label: 'All Outcomes' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'skipped', label: 'Skipped' },
] as const;

// ============================================================================
// Styling helpers
// ============================================================================

const AGENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'morning-brief': { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400' },
  'post-meeting': { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400' },
  'deal-risk': { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-400' },
  reengagement: { bg: 'bg-purple-50 dark:bg-purple-500/10', text: 'text-purple-700 dark:text-purple-400' },
  'competitive-intel': { bg: 'bg-indigo-50 dark:bg-indigo-500/10', text: 'text-indigo-700 dark:text-indigo-400' },
  'email-signals': { bg: 'bg-cyan-50 dark:bg-cyan-500/10', text: 'text-cyan-700 dark:text-cyan-400' },
  'follow-up': { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
  prep: { bg: 'bg-teal-50 dark:bg-teal-500/10', text: 'text-teal-700 dark:text-teal-400' },
};

const DEFAULT_AGENT_COLOR = { bg: 'bg-slate-50 dark:bg-gray-500/10', text: 'text-slate-600 dark:text-gray-400' };

type OutcomeVariant = 'success' | 'destructive' | 'warning' | 'secondary' | 'outline';

const OUTCOME_BADGE_VARIANT: Record<string, OutcomeVariant> = {
  success: 'success',
  failed: 'destructive',
  pending: 'warning',
  cancelled: 'secondary',
  skipped: 'outline',
};

function getAgentColor(agentType: string) {
  return AGENT_TYPE_COLORS[agentType] ?? DEFAULT_AGENT_COLOR;
}

// ============================================================================
// Chain grouping
// ============================================================================

interface ChainGroup {
  chainId: string;
  entries: AgentDailyLog[];
}

interface LogItem {
  type: 'single';
  entry: AgentDailyLog;
}

interface LogChain {
  type: 'chain';
  group: ChainGroup;
}

type LogRow = LogItem | LogChain;

function groupByChain(logs: AgentDailyLog[]): LogRow[] {
  const chainMap = new Map<string, AgentDailyLog[]>();
  const singles: AgentDailyLog[] = [];
  const orderTracker: { key: string; isChain: boolean }[] = [];
  const seenChains = new Set<string>();

  for (const log of logs) {
    if (log.chain_id) {
      if (!chainMap.has(log.chain_id)) {
        chainMap.set(log.chain_id, []);
      }
      chainMap.get(log.chain_id)!.push(log);
      if (!seenChains.has(log.chain_id)) {
        seenChains.add(log.chain_id);
        orderTracker.push({ key: log.chain_id, isChain: true });
      }
    } else {
      singles.push(log);
      orderTracker.push({ key: log.id, isChain: false });
    }
  }

  // Sort chain entries by wave_number ascending
  for (const entries of chainMap.values()) {
    entries.sort((a, b) => (a.wave_number ?? 0) - (b.wave_number ?? 0));
  }

  const rows: LogRow[] = [];
  let singleIdx = 0;

  for (const item of orderTracker) {
    if (item.isChain) {
      const entries = chainMap.get(item.key);
      if (entries && entries.length > 1) {
        rows.push({ type: 'chain', group: { chainId: item.key, entries } });
      } else if (entries && entries.length === 1) {
        rows.push({ type: 'single', entry: entries[0] });
      }
    } else {
      rows.push({ type: 'single', entry: singles[singleIdx++] });
    }
  }

  return rows;
}

// ============================================================================
// Sub-components
// ============================================================================

function AgentTypeBadge({ agentType }: { agentType: string }) {
  const color = getAgentColor(agentType);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}
    >
      <Bot className="h-3 w-3" />
      {agentType}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const variant = OUTCOME_BADGE_VARIANT[outcome] ?? 'secondary';
  return <Badge variant={variant}>{outcome}</Badge>;
}

function LogEntryRow({
  entry,
  showConnector = false,
  isLast = false,
}: {
  entry: AgentDailyLog;
  showConnector?: boolean;
  isLast?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {/* Chain connector line */}
      {showConnector && (
        <div className="absolute left-5 top-0 bottom-0 flex flex-col items-center pointer-events-none z-0">
          <div
            className={`w-0.5 bg-slate-200 dark:bg-gray-700 ${isLast ? 'h-1/2' : 'h-full'}`}
          />
        </div>
      )}

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-gray-800/40 transition-colors rounded-lg group relative z-10"
          >
            <div className="flex items-center gap-3">
              {/* Expand chevron */}
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-slate-400 dark:text-gray-500 transition-transform duration-200 ${
                  open ? 'rotate-90' : ''
                }`}
              />

              {/* Chain dot for grouped entries */}
              {showConnector && (
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-gray-600 shrink-0 ring-2 ring-white dark:ring-gray-900" />
              )}

              {/* Agent type */}
              <AgentTypeBadge agentType={entry.agent_type} />

              {/* Action type */}
              <span className="text-sm font-medium text-slate-700 dark:text-gray-200 shrink-0">
                {entry.action_type}
              </span>

              {/* Decision reasoning preview */}
              <span className="text-sm text-slate-500 dark:text-gray-400 truncate min-w-0 flex-1">
                {entry.decision_reasoning || ''}
              </span>

              {/* Right side: outcome, cost, time */}
              <div className="flex items-center gap-3 shrink-0">
                <OutcomeBadge outcome={entry.outcome} />

                {entry.credit_cost != null && entry.credit_cost > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-gray-500 tabular-nums">
                    <Coins className="h-3 w-3" />
                    {entry.credit_cost}
                  </span>
                )}

                {entry.execution_ms != null && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-gray-500 tabular-nums">
                    <Zap className="h-3 w-3" />
                    {entry.execution_ms}ms
                  </span>
                )}

                <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-gray-500 whitespace-nowrap">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="ml-11 mr-4 mb-3 space-y-3 border-l-2 border-slate-200 dark:border-gray-700 pl-4">
            {/* Decision reasoning */}
            {entry.decision_reasoning && (
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">
                  Decision Reasoning
                </p>
                <p className="text-sm text-slate-700 dark:text-gray-200 whitespace-pre-wrap">
                  {entry.decision_reasoning}
                </p>
              </div>
            )}

            {/* Input context summary */}
            {entry.input_context_summary && (
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">
                  Input Context
                </p>
                <p className="text-sm text-slate-600 dark:text-gray-300 whitespace-pre-wrap">
                  {entry.input_context_summary}
                </p>
              </div>
            )}

            {/* Action detail (JSONB) */}
            {entry.action_detail && Object.keys(entry.action_detail).length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">
                  Action Detail
                </p>
                <pre className="text-xs bg-slate-50 dark:bg-gray-800/60 rounded-lg p-3 overflow-x-auto text-slate-600 dark:text-gray-300 border border-slate-200 dark:border-gray-700">
                  {JSON.stringify(entry.action_detail, null, 2)}
                </pre>
              </div>
            )}

            {/* Error message */}
            {entry.error_message && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/5 rounded-lg p-3 border border-red-200 dark:border-red-500/20">
                <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-0.5">
                    Error
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">
                    {entry.error_message}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function ChainGroupBlock({ group }: { group: ChainGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Chain header */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-gray-800/40 transition-colors"
          >
            <ChevronRight
              className={`h-4 w-4 shrink-0 text-slate-400 dark:text-gray-500 transition-transform duration-200 ${
                open ? 'rotate-90' : ''
              }`}
            />
            <Link2 className="h-3.5 w-3.5 text-slate-400 dark:text-gray-500" />
            <span className="text-xs font-medium text-slate-500 dark:text-gray-400">
              Chain
            </span>
            <span className="text-xs text-slate-400 dark:text-gray-500 font-mono">
              {group.chainId.slice(0, 8)}
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {group.entries.length} steps
            </Badge>

            {/* Show first entry summary in collapsed state */}
            <span className="text-sm text-slate-500 dark:text-gray-400 truncate min-w-0 flex-1">
              {group.entries[0]?.agent_type} / {group.entries[0]?.action_type}
            </span>

            <span className="text-xs text-slate-400 dark:text-gray-500 whitespace-nowrap">
              <Clock className="h-3 w-3 inline mr-1" />
              {formatDistanceToNow(new Date(group.entries[0]?.created_at), { addSuffix: true })}
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-slate-100 dark:border-gray-800">
            {group.entries.map((entry, idx) => (
              <LogEntryRow
                key={entry.id}
                entry={entry}
                showConnector
                isLast={idx === group.entries.length - 1}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-48 flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800/50 flex items-center justify-center mb-4">
        <Bot className="h-7 w-7 text-slate-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
        No agent activity yet
      </p>
      <p className="text-xs text-slate-400 dark:text-gray-500 max-w-xs text-center">
        Agent actions will appear here as they run. Each entry shows what the
        agent did, why, and the outcome.
      </p>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function BrainAgentLog() {
  const [agentType, setAgentType] = useState<string>('__all__');
  const [outcome, setOutcome] = useState<string>('__all__');

  const filters: AgentDailyLogsFilters = {
    agentType: agentType === '__all__' ? undefined : agentType,
    outcome: outcome === '__all__' ? undefined : outcome,
  };

  const { data: logs, isLoading } = useAgentDailyLogs(filters);

  const rows = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    return groupByChain(logs);
  }, [logs]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={agentType} onValueChange={setAgentType}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Agent type" />
          </SelectTrigger>
          <SelectContent>
            {AGENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={outcome} onValueChange={setOutcome}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            {OUTCOMES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(agentType !== '__all__' || outcome !== '__all__') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAgentType('__all__');
              setOutcome('__all__');
            }}
            className="text-xs text-slate-500 dark:text-gray-400"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Log content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            if (row.type === 'chain') {
              return (
                <ChainGroupBlock key={row.group.chainId} group={row.group} />
              );
            }
            return (
              <Card key={row.entry.id} className="overflow-hidden">
                <LogEntryRow entry={row.entry} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

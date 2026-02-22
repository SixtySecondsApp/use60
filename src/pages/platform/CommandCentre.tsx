/**
 * Command Centre — AI Proactive Inbox
 *
 * 4-tab inbox for reviewing, approving, and actioning AI-generated items
 * from the command_centre_items table. Items are surfaced by proactive agents
 * (morning briefing, re-engagement, pipeline analysis, etc.).
 *
 * Tabs: Active | Auto-completed | Resolved | Pipeline
 */

import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  Clock,
  Filter,
  Inbox,
  Loader2,
  RefreshCw,
  RotateCcw,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  useCommandCentreItemsQuery,
  useCommandCentreStatsQuery,
  useCommandCentreItemMutations,
} from '@/lib/hooks/useCommandCentreItemsQuery';
import type { CCItem } from '@/lib/services/commandCentreItemsService';
import { CCItemDetailPanel } from '@/components/commandCentre/CCItemDetailPanel';

// ============================================================================
// Urgency helpers
// ============================================================================

const URGENCY_CONFIG = {
  critical: {
    label: 'Critical',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
    icon: AlertTriangle,
  },
  high: {
    label: 'High',
    badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
    icon: ArrowUp,
  },
  normal: {
    label: 'Normal',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    icon: Bell,
  },
  low: {
    label: 'Low',
    badgeClass: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    icon: ChevronDown,
  },
} as const;

function UrgencyBadge({ urgency }: { urgency: CCItem['urgency'] }) {
  const config = URGENCY_CONFIG[urgency] ?? URGENCY_CONFIG.normal;
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium', config.badgeClass)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// ============================================================================
// Confidence pill
// ============================================================================

function ConfidencePill({ score }: { score: number | null }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const colorClass =
    pct >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : pct >= 50
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-500';
  return <span className={cn('text-[11px] font-medium tabular-nums', colorClass)}>{pct}%</span>;
}

// ============================================================================
// Source agent tag
// ============================================================================

function AgentTag({ agent }: { agent: string }) {
  const label = agent.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400 text-[11px] font-medium">
      <Zap className="h-2.5 w-2.5 mr-1" />
      {label}
    </span>
  );
}

// ============================================================================
// CC Item Card
// ============================================================================

interface CCItemCardProps {
  item: CCItem;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  onUndo?: (id: string) => void;
  onViewDetail: (item: CCItem) => void;
  isPending: boolean;
  showUndo?: boolean;
}

function CCItemCard({ item, onApprove, onDismiss, onSnooze, onUndo, onViewDetail, isPending, showUndo }: CCItemCardProps) {
  const draftedAction = item.drafted_action as Record<string, unknown> | null;
  const displayText = draftedAction?.display_text as string | undefined;

  return (
    <Card
      className="border border-slate-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/60 hover:border-slate-300 dark:hover:border-gray-600 transition-colors cursor-pointer"
      onClick={() => onViewDetail(item)}
    >
      <CardContent className="p-4">
        {/* Top row: urgency + title + source agent */}
        <div className="flex items-start gap-2 mb-2">
          <UrgencyBadge urgency={item.urgency} />
          <p className="flex-1 font-semibold text-sm text-slate-800 dark:text-gray-100 leading-snug">
            {item.title}
          </p>
          <AgentTag agent={item.source_agent} />
        </div>

        {/* Enriched summary */}
        {item.summary && (
          <p className="text-sm text-slate-500 dark:text-gray-400 line-clamp-3 mb-3">
            {item.summary}
          </p>
        )}

        {/* Drafted action */}
        {displayText && (
          <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-slate-50 dark:bg-gray-800/60 border border-slate-100 dark:border-gray-700/40">
            <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
            <p className="text-xs text-slate-600 dark:text-gray-300 flex-1 line-clamp-2">{displayText}</p>
            {item.confidence_score != null && (
              <ConfidencePill score={item.confidence_score} />
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
          {!showUndo ? (
            <>
              {(item.status === 'open' || item.status === 'ready') && (
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => onApprove(item.id)}
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                  Approve
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs"
                onClick={() => onSnooze(item.id)}
                disabled={isPending}
              >
                <Clock className="h-3 w-3 mr-1" />
                Snooze
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-3 text-xs text-slate-500 dark:text-gray-400 hover:text-red-600"
                onClick={() => onDismiss(item.id)}
                disabled={isPending}
              >
                <X className="h-3 w-3 mr-1" />
                Dismiss
              </Button>
            </>
          ) : (
            onUndo && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs"
                onClick={() => onUndo(item.id)}
                disabled={isPending}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Undo
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Empty state
// ============================================================================

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Inbox className="h-7 w-7 text-slate-300 dark:text-gray-600" />
      </div>
      <p className="text-sm font-medium text-slate-600 dark:text-gray-300">{label}</p>
      <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">Check back soon — agents are working in the background.</p>
    </div>
  );
}

// ============================================================================
// Skeleton loader
// ============================================================================

function ItemSkeleton() {
  return (
    <Card className="border border-slate-200 dark:border-gray-700/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded" />
          <Skeleton className="h-5 flex-1 rounded" />
          <Skeleton className="h-5 w-24 rounded" />
        </div>
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-3/4 rounded" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-7 w-20 rounded" />
          <Skeleton className="h-7 w-16 rounded" />
          <Skeleton className="h-7 w-16 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Item list (with optional deal grouping)
// ============================================================================

interface ItemListProps {
  items: CCItem[];
  isLoading: boolean;
  emptyLabel: string;
  showUndo?: boolean;
  groupByDeal?: boolean;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  onUndo: (id: string) => void;
  onViewDetail: (item: CCItem) => void;
  pendingIds: Set<string>;
}

function ItemList({
  items,
  isLoading,
  emptyLabel,
  showUndo,
  groupByDeal,
  onApprove,
  onDismiss,
  onSnooze,
  onUndo,
  onViewDetail,
  pendingIds,
}: ItemListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <ItemSkeleton key={i} />)}
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  if (groupByDeal) {
    // Group by deal_id — items with no deal_id go under "No Deal"
    const groups = new Map<string | null, CCItem[]>();
    for (const item of items) {
      const key = item.deal_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    return (
      <div className="space-y-6">
        {[...groups.entries()].map(([dealId, groupItems]) => (
          <div key={dealId ?? 'no-deal'}>
            <h3 className="text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">
              {dealId ? `Deal ${dealId.slice(0, 8)}…` : 'No Deal'}
            </h3>
            <div className="space-y-3">
              {groupItems.map((item) => (
                <CCItemCard
                  key={item.id}
                  item={item}
                  onApprove={onApprove}
                  onDismiss={onDismiss}
                  onSnooze={onSnooze}
                  onUndo={onUndo}
                  onViewDetail={onViewDetail}
                  isPending={pendingIds.has(item.id)}
                  showUndo={showUndo}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <CCItemCard
          key={item.id}
          item={item}
          onApprove={onApprove}
          onDismiss={onDismiss}
          onSnooze={onSnooze}
          onUndo={onUndo}
          onViewDetail={onViewDetail}
          isPending={pendingIds.has(item.id)}
          showUndo={showUndo}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Filter pills
// ============================================================================

const URGENCY_OPTIONS = ['critical', 'high', 'normal', 'low'] as const;

interface FilterBarProps {
  urgencyFilter: string | null;
  agentFilter: string | null;
  availableAgents: string[];
  onUrgencyChange: (v: string | null) => void;
  onAgentChange: (v: string | null) => void;
}

function FilterBar({ urgencyFilter, agentFilter, availableAgents, onUrgencyChange, onAgentChange }: FilterBarProps) {
  const hasFilter = urgencyFilter || agentFilter;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />

      {/* Urgency filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant={urgencyFilter ? 'default' : 'outline'}
            className="h-7 px-3 text-xs gap-1"
          >
            {urgencyFilter
              ? URGENCY_CONFIG[urgencyFilter as CCItem['urgency']]?.label ?? urgencyFilter
              : 'Urgency'}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-32">
          <DropdownMenuItem onClick={() => onUrgencyChange(null)}>All</DropdownMenuItem>
          {URGENCY_OPTIONS.map((u) => (
            <DropdownMenuItem key={u} onClick={() => onUrgencyChange(u)}>
              {URGENCY_CONFIG[u].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Agent filter */}
      {availableAgents.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant={agentFilter ? 'default' : 'outline'}
              className="h-7 px-3 text-xs gap-1"
            >
              {agentFilter
                ? agentFilter.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                : 'Agent'}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => onAgentChange(null)}>All agents</DropdownMenuItem>
            {availableAgents.map((a) => (
              <DropdownMenuItem key={a} onClick={() => onAgentChange(a)}>
                {a.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Clear */}
      {hasFilter && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-slate-400 hover:text-slate-600"
          onClick={() => { onUrgencyChange(null); onAgentChange(null); }}
        >
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Stats bar
// ============================================================================

function StatsBar({
  totalActive,
  autoCompletedToday,
  needsInput,
  isLoading,
}: {
  totalActive: number;
  autoCompletedToday: number;
  needsInput: number;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-24 rounded" />)}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-sm flex-wrap">
      <span className="text-slate-600 dark:text-gray-300">
        <span className="font-semibold text-slate-800 dark:text-gray-100">{totalActive}</span>{' '}
        <span className="text-slate-400 dark:text-gray-500">active</span>
      </span>
      {autoCompletedToday > 0 && (
        <span className="text-slate-600 dark:text-gray-300">
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{autoCompletedToday}</span>{' '}
          <span className="text-slate-400 dark:text-gray-500">auto-completed today</span>
        </span>
      )}
      {needsInput > 0 && (
        <span className="text-slate-600 dark:text-gray-300">
          <span className="font-semibold text-amber-600 dark:text-amber-400">{needsInput}</span>{' '}
          <span className="text-slate-400 dark:text-gray-500">need your input</span>
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function CommandCentre() {
  const [tab, setTab] = useState<'active' | 'auto-completed' | 'resolved' | 'pipeline'>('active');
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<CCItem | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  // Stats
  const statsQuery = useCommandCentreStatsQuery();

  // Data per tab
  const activeQuery = useCommandCentreItemsQuery({
    status: ['open', 'ready'],
    urgency: urgencyFilter ?? undefined,
    source_agent: agentFilter ?? undefined,
  });

  const autoCompletedQuery = useCommandCentreItemsQuery({
    status: 'auto_resolved',
  });

  const resolvedQuery = useCommandCentreItemsQuery({
    status: ['completed', 'dismissed'],
  });

  const pipelineQuery = useCommandCentreItemsQuery({
    urgency: urgencyFilter ?? undefined,
    source_agent: agentFilter ?? undefined,
  });

  // Filter auto-completed and resolved to today client-side
  // (service doesn't expose date range filter yet)
  const autoCompletedItems = useMemo(
    () => (autoCompletedQuery.data ?? []).filter((i) => i.resolved_at && i.resolved_at >= today),
    [autoCompletedQuery.data, today]
  );

  const resolvedItems = useMemo(
    () =>
      (resolvedQuery.data ?? []).filter((i) => {
        if (!i.resolved_at || i.resolved_at < today) return false;
        const rc = i.resolution_channel ?? '';
        return rc.startsWith('external_') || rc === 'stale_auto_resolve';
      }),
    [resolvedQuery.data, today]
  );

  // Pipeline tab: items that have a deal_id
  const pipelineItems = useMemo(
    () => (pipelineQuery.data ?? []).filter((i) => i.deal_id != null && (i.status === 'open' || i.status === 'ready')),
    [pipelineQuery.data]
  );

  const activeItems = activeQuery.data ?? [];

  // Collect available agents from the active dataset for filter dropdown
  const availableAgents = useMemo(() => {
    const set = new Set<string>();
    for (const i of activeItems) set.add(i.source_agent);
    return [...set].sort();
  }, [activeItems]);

  // Mutations
  const { approveItem, dismissItem, snoozeItem, undoItem } = useCommandCentreItemMutations();

  const withPending = (id: string, fn: () => void) => {
    setPendingIds((prev) => new Set(prev).add(id));
    fn();
    // Clear pending state after mutation resolves (hooks handle toast + invalidation)
    setTimeout(() => {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2000);
  };

  const handleApprove = (id: string) => withPending(id, () => approveItem.mutate(id));
  const handleDismiss = (id: string) => withPending(id, () => dismissItem.mutate(id));
  const handleSnooze = (id: string) => {
    // Snooze for 24 hours
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    withPending(id, () => snoozeItem.mutate({ id, until }));
  };
  const handleUndo = (id: string) => withPending(id, () => undoItem.mutate(id));
  const handleViewDetail = (item: CCItem) => setDetailItem(item);

  const isActiveLoading = activeQuery.isLoading;
  const isActiveError = activeQuery.isError;

  const tabCounts = {
    active: activeItems.length,
    autoCompleted: autoCompletedItems.length,
    resolved: resolvedItems.length,
    pipeline: pipelineItems.length,
  };

  if (isActiveError) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-7 w-7 text-red-400" />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Failed to load Command Centre</p>
          <p className="text-xs text-slate-400 dark:text-gray-500 mb-4">Something went wrong. Please try again.</p>
          <Button variant="outline" size="sm" onClick={() => activeQuery.refetch()} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50 dark:bg-gray-950">
      {/* ====== PAGE HEADER ====== */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-gray-800/60 bg-white dark:bg-gray-900/80">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-800 dark:text-gray-100">Command Centre</h1>
            <div className="mt-1">
              <StatsBar
                totalActive={statsQuery.data ? statsQuery.data.total_open + statsQuery.data.total_ready : tabCounts.active}
                autoCompletedToday={statsQuery.data?.auto_completed_today ?? tabCounts.autoCompleted}
                needsInput={statsQuery.data?.needs_input ?? 0}
                isLoading={statsQuery.isLoading}
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs gap-1.5 flex-shrink-0"
            onClick={() => { activeQuery.refetch(); statsQuery.refetch(); }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* Filter bar */}
        <div className="mt-3">
          <FilterBar
            urgencyFilter={urgencyFilter}
            agentFilter={agentFilter}
            availableAgents={availableAgents}
            onUrgencyChange={setUrgencyFilter}
            onAgentChange={setAgentFilter}
          />
        </div>
      </div>

      {/* ====== TABS ====== */}
      <div className="flex-1 overflow-hidden">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="flex flex-col h-full"
        >
          <div className="flex-shrink-0 px-6 pt-3 bg-white dark:bg-gray-900/80 border-b border-slate-200 dark:border-gray-800/60">
            <TabsList className="h-8 bg-transparent p-0 gap-1">
              <TabsTrigger
                value="active"
                className="h-8 px-3 text-xs data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-gray-800 rounded-md"
              >
                Active
                {tabCounts.active > 0 && (
                  <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px] bg-slate-700 dark:bg-gray-200 text-white dark:text-gray-900">
                    {tabCounts.active}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="auto-completed"
                className="h-8 px-3 text-xs data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-gray-800 rounded-md"
              >
                Auto-completed
                {tabCounts.autoCompleted > 0 && (
                  <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px] bg-emerald-600 text-white">
                    {tabCounts.autoCompleted}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="resolved"
                className="h-8 px-3 text-xs data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-gray-800 rounded-md"
              >
                Resolved
                {tabCounts.resolved > 0 && (
                  <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px] bg-slate-400 text-white">
                    {tabCounts.resolved}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="pipeline"
                className="h-8 px-3 text-xs data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-gray-800 rounded-md"
              >
                Pipeline
                {tabCounts.pipeline > 0 && (
                  <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px] bg-violet-600 text-white">
                    {tabCounts.pipeline}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ---- Active ---- */}
          <TabsContent value="active" className="flex-1 overflow-y-auto p-6 mt-0">
            <ItemList
              items={activeItems}
              isLoading={isActiveLoading}
              emptyLabel="No active items"
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              onSnooze={handleSnooze}
              onUndo={handleUndo}
              onViewDetail={handleViewDetail}
              pendingIds={pendingIds}
            />
          </TabsContent>

          {/* ---- Auto-completed ---- */}
          <TabsContent value="auto-completed" className="flex-1 overflow-y-auto p-6 mt-0">
            <ItemList
              items={autoCompletedItems}
              isLoading={autoCompletedQuery.isLoading}
              emptyLabel="No auto-completed items today"
              showUndo
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              onSnooze={handleSnooze}
              onUndo={handleUndo}
              onViewDetail={handleViewDetail}
              pendingIds={pendingIds}
            />
          </TabsContent>

          {/* ---- Resolved ---- */}
          <TabsContent value="resolved" className="flex-1 overflow-y-auto p-6 mt-0">
            <ItemList
              items={resolvedItems}
              isLoading={resolvedQuery.isLoading}
              emptyLabel="No resolved items today"
              showUndo
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              onSnooze={handleSnooze}
              onUndo={handleUndo}
              onViewDetail={handleViewDetail}
              pendingIds={pendingIds}
            />
          </TabsContent>

          {/* ---- Pipeline ---- */}
          <TabsContent value="pipeline" className="flex-1 overflow-y-auto p-6 mt-0">
            <ItemList
              items={pipelineItems}
              isLoading={pipelineQuery.isLoading}
              emptyLabel="No pipeline items"
              groupByDeal
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              onSnooze={handleSnooze}
              onUndo={handleUndo}
              onViewDetail={handleViewDetail}
              pendingIds={pendingIds}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail panel — rendered at page level so it overlays tabs correctly */}
      {detailItem && (
        <CCItemDetailPanel
          item={detailItem}
          open={detailItem != null}
          onClose={() => setDetailItem(null)}
        />
      )}
    </div>
  );
}

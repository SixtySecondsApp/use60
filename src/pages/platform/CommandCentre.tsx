/**
 * Command Centre — AI Proactive Inbox
 *
 * Unified feed for reviewing, approving, and actioning AI-generated items
 * from the command_centre_items table. Items are surfaced by proactive agents
 * (morning briefing, re-engagement, pipeline analysis, etc.).
 *
 * Filters: All (default) | Needs You | Deals | Signals
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Bell,
  ChevronDown,
  Filter,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCommandCentreItemsQuery,
  useCommandCentreStatsQuery,
  useCommandCentreItemMutations,
} from '@/lib/hooks/useCommandCentreItemsQuery';
import type { CCItem } from '@/lib/services/commandCentreItemsService';
import { CCDetailPanel } from '@/components/commandCentre/CCDetailPanel';
import { CCEmptyState } from '@/components/commandCentre/CCEmptyState';
import { CCFilterBar, type CCFilter } from '@/components/commandCentre/CCFilterBar';
import { CCItemCard } from '@/components/commandCentre/CCItemCard';

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
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-24 rounded" />
        ))}
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
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {autoCompletedToday}
          </span>{' '}
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
// Urgency/Agent filter pills (sub-filters within the main filter)
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

const URGENCY_OPTIONS = ['critical', 'high', 'normal', 'low'] as const;

interface SubFilterBarProps {
  urgencyFilter: string | null;
  agentFilter: string | null;
  availableAgents: string[];
  onUrgencyChange: (v: string | null) => void;
  onAgentChange: (v: string | null) => void;
}

function SubFilterBar({
  urgencyFilter,
  agentFilter,
  availableAgents,
  onUrgencyChange,
  onAgentChange,
}: SubFilterBarProps) {
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
          onClick={() => {
            onUrgencyChange(null);
            onAgentChange(null);
          }}
        >
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function CommandCentre() {
  const [activeFilter, setActiveFilter] = useState<CCFilter>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<CCItem | null>(null);

  // Track IDs that are "new" (just arrived via realtime) so we can play an entrance animation.
  // We use a ref for the previous known ID set to avoid stale closure issues in the effect.
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
  const prevItemIdsRef = useRef<Set<string>>(new Set());

  // Stats
  const statsQuery = useCommandCentreStatsQuery();

  // Single unified data query — all items, client-side filtering
  const allItemsQuery = useCommandCentreItemsQuery({
    urgency: urgencyFilter ?? undefined,
    source_agent: agentFilter ?? undefined,
  });

  const allItems = useMemo(() => allItemsQuery.data ?? [], [allItemsQuery.data]);

  // Detect newly arrived items and play entrance animation for 500ms
  useEffect(() => {
    if (allItemsQuery.isLoading) return;
    const currentIds = new Set(allItems.map((i) => i.id));
    const arrivedIds = [...currentIds].filter((id) => !prevItemIdsRef.current.has(id));

    // Always keep the ref up-to-date so the next diff is correct
    prevItemIdsRef.current = currentIds;

    // Don't animate on the very first load (prev was empty = initial data fetch)
    if (arrivedIds.length === 0) return;
    // First load: prevIds was empty, all items look "new" — skip animation
    const isFirstLoad = arrivedIds.length === currentIds.size;
    if (isFirstLoad) return;

    setNewItemIds((prev) => {
      const next = new Set(prev);
      arrivedIds.forEach((id) => next.add(id));
      return next;
    });

    // Clear entrance flag after animation completes (500ms covers 200ms animation + buffer)
    const timer = setTimeout(() => {
      setNewItemIds((prev) => {
        const next = new Set(prev);
        arrivedIds.forEach((id) => next.delete(id));
        return next;
      });
    }, 500);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, allItemsQuery.isLoading]);

  // Compute needs-you count (always, for badge — persists across all filters)
  const needsYouCount = useMemo(
    () =>
      allItems.filter(
        (i) => (i.status === 'open' || i.status === 'ready') && i.drafted_action,
      ).length,
    [allItems],
  );

  // Apply active filter
  const filteredItems = useMemo(() => {
    let items = allItems;

    switch (activeFilter) {
      case 'needs-you':
        items = items.filter(
          (i) => (i.status === 'open' || i.status === 'ready') && i.drafted_action,
        );
        break;
      case 'deals':
        items = items.filter((i) => i.deal_id != null);
        break;
      case 'signals':
        items = items.filter(
          (i) =>
            i.urgency === 'critical' ||
            i.urgency === 'high' ||
            i.item_type?.includes('signal') ||
            i.item_type?.includes('alert'),
        );
        break;
      // 'all' — no filter
    }

    // Pin pending items to top in All view
    if (activeFilter === 'all') {
      const pending = items.filter((i) => i.status === 'open' || i.status === 'ready');
      const rest = items.filter((i) => i.status !== 'open' && i.status !== 'ready');
      items = [...pending, ...rest];
    }

    return items;
  }, [allItems, activeFilter]);

  // Collect available agents from all items for sub-filter dropdown
  const availableAgents = useMemo(() => {
    const set = new Set<string>();
    for (const i of allItems) set.add(i.source_agent);
    return [...set].sort();
  }, [allItems]);

  // Mutations
  const { approveItem, dismissItem, snoozeItem, undoItem } = useCommandCentreItemMutations();

  const withPending = (id: string, fn: () => void) => {
    setPendingIds((prev) => new Set(prev).add(id));
    fn();
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
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    withPending(id, () => snoozeItem.mutate({ id, until }));
  };
  const handleUndo = (id: string) => withPending(id, () => undoItem.mutate(id));
  const handleViewDetail = (item: CCItem) => setDetailItem(item);

  if (allItemsQuery.isError) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-7 w-7 text-red-400" />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
            Failed to load Command Centre
          </p>
          <p className="text-xs text-slate-400 dark:text-gray-500 mb-4">
            Something went wrong. Please try again.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => allItemsQuery.refetch()}
            className="gap-2"
          >
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
            <h1 className="text-xl font-semibold text-slate-800 dark:text-gray-100">
              Command Centre
            </h1>
            <div className="mt-1">
              <StatsBar
                totalActive={statsQuery.data?.total_active ?? allItems.filter((i) => i.status === 'open' || i.status === 'ready').length}
                autoCompletedToday={statsQuery.data?.auto_completed_today ?? 0}
                needsInput={statsQuery.data?.needs_input ?? 0}
                isLoading={statsQuery.isLoading}
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs gap-1.5 flex-shrink-0"
            onClick={() => {
              allItemsQuery.refetch();
              statsQuery.refetch();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* Sub-filter bar (urgency/agent) */}
        <div className="mt-3 mb-1">
          <SubFilterBar
            urgencyFilter={urgencyFilter}
            agentFilter={agentFilter}
            availableAgents={availableAgents}
            onUrgencyChange={setUrgencyFilter}
            onAgentChange={setAgentFilter}
          />
        </div>
      </div>

      {/* ====== FILTER BAR + DETAIL PANEL (compression layout) ====== */}
      <div className="flex flex-1 overflow-hidden">
        {/* Feed area — compresses when panel opens */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col transition-all duration-200 ease-out">
          {/* Main filter bar */}
          <div className="flex-shrink-0 px-6 pt-3 pb-2 bg-white dark:bg-gray-900/80 border-b border-slate-200 dark:border-gray-800/60">
            <CCFilterBar
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              needsYouCount={needsYouCount}
            />
          </div>

          {/* Unified feed */}
          <div className="flex-1 overflow-y-auto p-6">
            {allItemsQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <ItemSkeleton key={i} />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <CCEmptyState
                variant={
                  allItems.length === 0
                    ? 'first-load'
                    : needsYouCount === 0
                    ? 'all-caught-up'
                    : 'no-matches'
                }
                filterLabel={
                  activeFilter !== 'all' ? activeFilter.replace('-', ' ') : undefined
                }
                actionsToday={statsQuery.data?.auto_completed_today ?? 0}
              />
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item) => (
                  <CCItemCard
                    key={item.id}
                    item={item}
                    onApprove={handleApprove}
                    onDismiss={handleDismiss}
                    onSnooze={handleSnooze}
                    onUndo={handleUndo}
                    onViewDetail={handleViewDetail}
                    isPending={pendingIds.has(item.id)}
                    animationClass={newItemIds.has(item.id) ? 'animate-slide-in-top' : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel — inline, compresses the feed (no overlay) */}
        <CCDetailPanel item={detailItem} onClose={() => setDetailItem(null)} />
      </div>
    </div>
  );
}

/**
 * Command Centre — AI Proactive Inbox
 *
 * Unified feed for reviewing, approving, and actioning AI-generated items
 * from the command_centre_items table. Items are surfaced by proactive agents
 * (morning briefing, re-engagement, pipeline analysis, etc.).
 *
 * Filters: All (default) | Needs You | Deals | Signals
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Filter,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
  useCommandCentreRealtime,
} from '@/lib/hooks/useCommandCentreItemsQuery';
import { useCommandCentreDeepLinks } from '@/lib/hooks/useCommandCentreDeepLinks';
import { useCommandCentreKeyboard } from '@/lib/hooks/useCommandCentreKeyboard';
import type { CCItem } from '@/lib/services/commandCentreItemsService';
import { CCAgentLearning } from '@/components/commandCentre/CCAgentLearning';
import { CCBulkActionBar } from '@/components/commandCentre/CCBulkActionBar';
import { CCDetailPanel } from '@/components/commandCentre/CCDetailPanel';
import { CCEmptyState } from '@/components/commandCentre/CCEmptyState';
import { CCFilterBar, type CCFilter } from '@/components/commandCentre/CCFilterBar';
import { CCItemCard } from '@/components/commandCentre/CCItemCard';
import { URGENCY_CONFIG, URGENCY_OPTIONS } from '@/components/commandCentre/constants';

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
  const [activeFilter, setActiveFilter] = useState<CCFilter>('needs-you');
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<CCItem | null>(null);
  // Mobile: when true, show detail panel full-screen instead of item list
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  // TRINITY-019: Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIdRef = useRef<string | null>(null);
  const leftRailRef = useRef<HTMLDivElement>(null);

  // CC-008: Realtime subscriptions — items appear without manual refresh
  useCommandCentreRealtime();

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

  // Apply active filter + sort by urgency then priority_score
  const filteredItems = useMemo(() => {
    const URGENCY_RANK: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };

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

    // Sort: pending first (in All view), then by urgency rank, then priority_score DESC
    items = [...items].sort((a, b) => {
      // Pin pending items to top in All view
      if (activeFilter === 'all') {
        const aPending = a.status === 'open' || a.status === 'ready' ? 0 : 1;
        const bPending = b.status === 'open' || b.status === 'ready' ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
      }

      // Urgency rank: critical > high > normal > low
      const aUrg = URGENCY_RANK[a.urgency] ?? 2;
      const bUrg = URGENCY_RANK[b.urgency] ?? 2;
      if (aUrg !== bUrg) return aUrg - bUrg;

      // Priority score DESC (nulls last)
      const aScore = a.priority_score ?? -1;
      const bScore = b.priority_score ?? -1;
      return bScore - aScore;
    });

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

  // ========================================================================
  // TRINITY-019: Bulk selection handlers
  // ========================================================================

  const handleItemSelect = useCallback(
    (id: string, event: React.MouseEvent) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);

        // Shift+click: range select from last selected to current
        if (event.shiftKey && lastSelectedIdRef.current) {
          const lastIdx = filteredItems.findIndex((i) => i.id === lastSelectedIdRef.current);
          const currentIdx = filteredItems.findIndex((i) => i.id === id);
          if (lastIdx !== -1 && currentIdx !== -1) {
            const start = Math.min(lastIdx, currentIdx);
            const end = Math.max(lastIdx, currentIdx);
            for (let idx = start; idx <= end; idx++) {
              next.add(filteredItems[idx].id);
            }
            return next;
          }
        }

        // Toggle individual item
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        lastSelectedIdRef.current = id;
        return next;
      });
    },
    [filteredItems],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastSelectedIdRef.current = null;
  }, []);

  // Clear selection when filter changes
  useEffect(() => {
    clearSelection();
  }, [activeFilter, urgencyFilter, agentFilter, clearSelection]);

  // Cmd/Ctrl+A to select all visible items
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        // Only intercept if focus is not in an input/textarea
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        setSelectedIds(new Set(filteredItems.map((i) => i.id)));
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [filteredItems]);

  // Max 25 items per bulk action
  const MAX_BULK = 25;

  const handleBulkApprove = useCallback(async () => {
    const ids = [...selectedIds].slice(0, MAX_BULK);
    try {
      await Promise.all(ids.map((id) => approveItem.mutateAsync(id)));
      toast.success(`Approved ${ids.length} item${ids.length !== 1 ? 's' : ''}`);
    } catch {
      toast.error('Some items failed to approve');
    }
    clearSelection();
  }, [selectedIds, approveItem, clearSelection]);

  const handleBulkDismiss = useCallback(async () => {
    const ids = [...selectedIds].slice(0, MAX_BULK);
    try {
      await Promise.all(ids.map((id) => dismissItem.mutateAsync(id)));
      toast.success(`Dismissed ${ids.length} item${ids.length !== 1 ? 's' : ''}`);
    } catch {
      toast.error('Some items failed to dismiss');
    }
    clearSelection();
  }, [selectedIds, dismissItem, clearSelection]);

  const handleBulkSnooze = useCallback(async () => {
    const ids = [...selectedIds].slice(0, MAX_BULK);
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    try {
      await Promise.all(ids.map((id) => snoozeItem.mutateAsync({ id, until })));
      toast.success(`Snoozed ${ids.length} item${ids.length !== 1 ? 's' : ''} for 24h`);
    } catch {
      toast.error('Some items failed to snooze');
    }
    clearSelection();
  }, [selectedIds, snoozeItem, clearSelection]);

  // CC-009: Deep links — bookmarkable URLs for items and filters
  const { updateItemParam, updateFilterParam } = useCommandCentreDeepLinks({
    items: allItems,
    onSelectItem: setDetailItem,
    onSelectFilter: (f) => setActiveFilter(f as CCFilter),
  });

  // Update URL when detail panel opens/closes
  const handleViewDetailWithDeepLink = useCallback((item: CCItem) => {
    setDetailItem(item);
    updateItemParam(item.id);
    setMobileShowDetail(true);
  }, [updateItemParam]);

  const handleCloseDetail = useCallback(() => {
    setDetailItem(null);
    updateItemParam(null);
    setMobileShowDetail(false);
  }, [updateItemParam]);

  // Auto-select the first item when filtered items load (desktop shows detail immediately)
  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current) return;
    if (filteredItems.length > 0 && !detailItem) {
      setDetailItem(filteredItems[0]);
      updateItemParam(filteredItems[0].id);
      hasAutoSelected.current = true;
    }
  }, [filteredItems, detailItem, updateItemParam]);

  // Scroll highlighted item into view in the left rail
  useEffect(() => {
    if (!leftRailRef.current || !detailItem) return;
    const card = leftRailRef.current.querySelector(`[data-item-id="${detailItem.id}"]`);
    if (card) {
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [detailItem]);

  const handleFilterChange = (filter: CCFilter) => {
    setActiveFilter(filter);
    updateFilterParam(filter);
  };

  // CC-010: Keyboard navigation — j/k/Enter/a/d/Esc
  const { isHighlighted } = useCommandCentreKeyboard({
    items: filteredItems,
    selectedItem: detailItem,
    onSelectItem: (item) => {
      setDetailItem(item);
      updateItemParam(item?.id ?? null);
    },
    onApprove: handleApprove,
    onDismiss: handleDismiss,
    isPanelOpen: detailItem !== null,
  });

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

        {/* Filter bar + sub-filters */}
        <div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
          <CCFilterBar
            activeFilter={activeFilter}
            onFilterChange={handleFilterChange}
            needsYouCount={needsYouCount}
          />
          <SubFilterBar
            urgencyFilter={urgencyFilter}
            agentFilter={agentFilter}
            availableAgents={availableAgents}
            onUrgencyChange={setUrgencyFilter}
            onAgentChange={setAgentFilter}
          />
        </div>
      </div>

      {/* ====== LEFT RAIL + RIGHT PANEL ====== */}
      <div className="flex flex-1 overflow-hidden">

        {/* ---- Left rail: scrollable item list ---- */}
        <div
          className={cn(
            'w-full md:w-[380px] md:shrink-0 flex flex-col border-r border-slate-200 dark:border-gray-800/60 bg-white dark:bg-gray-900/80 overflow-hidden',
            // Mobile: hide left rail when detail is showing
            mobileShowDetail ? 'hidden md:flex' : 'flex',
          )}
        >
          {/* Agent Learning section — PST-015 */}
          <div className="flex-shrink-0 px-3 pt-3 pb-2">
            <CCAgentLearning />
          </div>

          {/* TRINITY-019: Bulk action bar */}
          {selectedIds.size >= 2 && (
            <div className="flex-shrink-0 px-3">
              <CCBulkActionBar
                selectedCount={Math.min(selectedIds.size, MAX_BULK)}
                onApproveAll={handleBulkApprove}
                onDismissAll={handleBulkDismiss}
                onSnoozeAll={handleBulkSnooze}
                onClearSelection={clearSelection}
              />
            </div>
          )}

          {/* Scrollable item list */}
          <div ref={leftRailRef} className="flex-1 overflow-y-auto px-3 pb-3">
            {allItemsQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
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
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <div key={item.id} data-item-id={item.id}>
                    <CCItemCard
                      item={item}
                      onApprove={handleApprove}
                      onDismiss={handleDismiss}
                      onSnooze={handleSnooze}
                      onUndo={handleUndo}
                      onViewDetail={handleViewDetailWithDeepLink}
                      isPending={pendingIds.has(item.id)}
                      animationClass={newItemIds.has(item.id) ? 'animate-slide-in-top' : undefined}
                      isHighlighted={isHighlighted(item.id)}
                      isSelected={detailItem?.id === item.id}
                      compact
                      isChecked={selectedIds.has(item.id)}
                      onSelect={handleItemSelect}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ---- Right panel: detail view ---- */}
        <div
          className={cn(
            'flex-1 min-w-0 flex flex-col overflow-hidden',
            // Mobile: show full-screen when detail is selected, otherwise hidden
            mobileShowDetail ? 'flex' : 'hidden md:flex',
          )}
        >
          {/* Mobile back button */}
          {mobileShowDetail && detailItem && (
            <div className="md:hidden flex-shrink-0 px-4 py-2 border-b border-slate-200 dark:border-gray-800/60 bg-white dark:bg-gray-900/80">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs gap-1.5 text-slate-600 dark:text-gray-300"
                onClick={() => setMobileShowDetail(false)}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to list
              </Button>
            </div>
          )}

          {detailItem ? (
            <CCDetailPanel item={detailItem} onClose={handleCloseDetail} />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-gray-950">
              <div className="text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                  <ArrowLeft className="h-6 w-6 text-slate-300 dark:text-gray-600" />
                </div>
                <p className="text-sm font-medium text-slate-500 dark:text-gray-400">
                  Select an item to view details
                </p>
                <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
                  Use j/k to navigate, Enter to toggle
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

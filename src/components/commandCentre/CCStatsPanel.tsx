/**
 * CCStatsPanel — CC12-006
 *
 * Collapsible stats dashboard and auto-execution audit trail for Command Centre.
 * Shows summary stat cards and a list of items completed via auto_exec today.
 */

import { useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clock,
  RotateCcw,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import type { CCItem, CCStats } from '@/lib/services/commandCentreItemsService';

// ============================================================================
// Types
// ============================================================================

interface CCStatsPanelProps {
  items: CCItem[];
  stats: CCStats | undefined;
  statsLoading: boolean;
  onUndo: (id: string) => void;
  pendingIds: Set<string>;
}

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ============================================================================
// Stat card
// ============================================================================

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  iconClass?: string;
}

function StatCard({ icon: Icon, label, value, sub, iconClass }: StatCardProps) {
  return (
    <Card className="border border-slate-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/60">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-1.5 rounded-lg bg-slate-100 dark:bg-gray-800 ${iconClass ?? ''}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-gray-400 truncate">{label}</p>
            <p className="text-xl font-semibold text-slate-800 dark:text-gray-100 leading-tight tabular-nums">
              {value}
            </p>
            {sub && (
              <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5">{sub}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Audit trail row
// ============================================================================

interface AuditRowProps {
  item: CCItem;
  onUndo: (id: string) => void;
  isPending: boolean;
}

function AuditRow({ item, onUndo, isPending }: AuditRowProps) {
  const confidencePct = item.confidence_score != null ? Math.round(item.confidence_score * 100) : null;
  const colorClass =
    confidencePct == null
      ? ''
      : confidencePct >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : confidencePct >= 50
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-500';

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-gray-800/60 last:border-0">
      {/* Item type badge */}
      <Badge
        variant="outline"
        className="text-[10px] font-medium px-1.5 py-0 h-5 flex-shrink-0 capitalize"
      >
        {item.item_type.replace(/_/g, ' ')}
      </Badge>

      {/* Title */}
      <p className="flex-1 text-sm text-slate-700 dark:text-gray-200 truncate min-w-0">
        {item.title}
      </p>

      {/* Confidence */}
      {confidencePct != null && (
        <span className={`text-[11px] font-medium tabular-nums flex-shrink-0 ${colorClass}`}>
          {confidencePct}%
        </span>
      )}

      {/* Resolved time */}
      {item.resolved_at && (
        <span className="text-[11px] text-slate-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
          {formatTime(item.resolved_at)}
        </span>
      )}

      {/* Undo */}
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[11px] flex-shrink-0"
        disabled={isPending}
        onClick={() => {
          onUndo(item.id);
          toast.info('Undoing auto-executed action…');
        }}
      >
        <RotateCcw className="h-3 w-3 mr-1" />
        Undo
      </Button>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function CCStatsPanel({ items, stats, statsLoading, onUndo, pendingIds }: CCStatsPanelProps) {
  const [open, setOpen] = useState(true);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  // Derived stats from items prop
  const derivedStats = useMemo(() => {
    const totalActive = items.filter(
      (i) => i.status === 'open' || i.status === 'ready'
    ).length;

    // Items auto-completed today
    const autoExecToday = items.filter(
      (i) => i.status === 'auto_resolved' && i.resolved_at && i.resolved_at >= today
    );

    // Auto-completion percentage of all items resolved today
    const resolvedToday = items.filter(
      (i) =>
        (i.status === 'completed' || i.status === 'dismissed' || i.status === 'auto_resolved') &&
        i.resolved_at &&
        i.resolved_at >= today
    ).length;

    const autoExecPct =
      resolvedToday > 0 ? Math.round((autoExecToday.length / resolvedToday) * 100) : 0;

    // Average time to action for completed items (created_at -> resolved_at)
    const completedWithTimes = items.filter(
      (i) => i.status === 'completed' && i.resolved_at
    );
    let avgTimeToAction: string | null = null;
    if (completedWithTimes.length > 0) {
      const avgMs =
        completedWithTimes.reduce((acc, i) => {
          return acc + (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime());
        }, 0) / completedWithTimes.length;
      avgTimeToAction = formatDuration(avgMs);
    }

    // Top action types for ready items
    const typeCounts = new Map<string, number>();
    for (const i of items.filter((i) => i.status === 'ready')) {
      typeCounts.set(i.item_type, (typeCounts.get(i.item_type) ?? 0) + 1);
    }
    const topTypes = [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type.replace(/_/g, ' '));

    return { totalActive, autoExecToday, autoExecPct, avgTimeToAction, topTypes, resolvedToday };
  }, [items, today]);

  // Use server stats when available, fall back to derived
  const totalActive =
    stats != null ? stats.total_open + stats.total_ready : derivedStats.totalActive;
  const autoCompletedToday =
    stats?.auto_completed_today ?? derivedStats.autoExecToday.length;

  // Audit trail: auto_resolved items today, sorted by resolved_at DESC
  const auditItems = useMemo(
    () =>
      derivedStats.autoExecToday.slice().sort((a, b) => {
        if (!a.resolved_at || !b.resolved_at) return 0;
        return b.resolved_at.localeCompare(a.resolved_at);
      }),
    [derivedStats.autoExecToday]
  );

  return (
    <div className="border border-slate-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-900/60 overflow-hidden">
      {/* Panel header / toggle */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-gray-800/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-slate-500 dark:text-gray-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-gray-200">
            Today&apos;s Activity
          </span>
          {!statsLoading && autoCompletedToday > 0 && (
            <Badge className="h-4 px-1.5 text-[10px] bg-emerald-600 text-white">
              {autoCompletedToday} auto
            </Badge>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-400 dark:text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400 dark:text-gray-500" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-slate-100 dark:border-gray-800/60">
          {/* Stat cards grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <StatCard
              icon={BarChart3}
              label="Total active"
              value={statsLoading ? '—' : totalActive}
              iconClass="text-slate-500 dark:text-gray-400"
            />
            <StatCard
              icon={Zap}
              label="Auto-completed today"
              value={statsLoading ? '—' : autoCompletedToday}
              sub={
                derivedStats.resolvedToday > 0
                  ? `${derivedStats.autoExecPct}% of resolved`
                  : undefined
              }
              iconClass="text-emerald-600 dark:text-emerald-400"
            />
            <StatCard
              icon={Clock}
              label="Avg. time to action"
              value={derivedStats.avgTimeToAction ?? '—'}
              sub="completed items"
              iconClass="text-blue-500 dark:text-blue-400"
            />
            <StatCard
              icon={TrendingUp}
              label="Top action types"
              value={
                derivedStats.topTypes.length > 0
                  ? derivedStats.topTypes[0]
                  : '—'
              }
              sub={
                derivedStats.topTypes.length > 1
                  ? derivedStats.topTypes.slice(1).join(', ')
                  : undefined
              }
              iconClass="text-violet-500 dark:text-violet-400"
            />
          </div>

          {/* Audit trail */}
          {auditItems.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                Auto-execution audit trail
              </p>
              <div>
                {auditItems.map((item) => (
                  <AuditRow
                    key={item.id}
                    item={item}
                    onUndo={onUndo}
                    isPending={pendingIds.has(item.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {auditItems.length === 0 && !statsLoading && (
            <p className="mt-4 text-xs text-slate-400 dark:text-gray-500 text-center py-3">
              No auto-executed actions yet today.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

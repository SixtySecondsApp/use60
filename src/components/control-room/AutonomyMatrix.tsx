/**
 * AutonomyMatrix — CTRL-003
 *
 * Grid widget for the Control Room showing team-wide autonomy tiers.
 * Rows = team members, columns = action types (email.send, task.create,
 * slack.post, crm.update, proposal.send).
 *
 * Each cell is color-coded by tier:
 *   red    = disabled
 *   orange = approve
 *   yellow = suggest
 *   green  = auto
 *
 * Cells with a recent promotion show a small "promoted N days ago" badge.
 * Clicking a cell opens a Radix Popover listing the last 5 autopilot_events
 * for that rep × action type.
 *
 * Data: useTeamAutonomy() hook, refreshes every 5 minutes.
 */

import { useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  useTeamAutonomy,
  MATRIX_ACTION_TYPES,
  ACTION_TYPE_LABELS,
  type AutonomyTier,
  type MatrixCell,
  type MatrixEvent,
  type MatrixRow,
} from '@/lib/hooks/useTeamAutonomy';

// ============================================================================
// Props
// ============================================================================

interface AutonomyMatrixProps {
  orgId: string;
}

// ============================================================================
// Tier config — color coding
// ============================================================================

interface TierConfig {
  label: string;
  /** Tailwind background + text classes for the cell */
  cellCls: string;
  /** Tailwind ring / border for the cell on hover */
  hoverCls: string;
  /** Badge variant for the popover header */
  dotCls: string;
  icon: React.ElementType;
}

const TIER_CONFIG: Record<AutonomyTier, TierConfig> = {
  auto: {
    label: 'Auto',
    cellCls: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    hoverCls: 'ring-emerald-400 dark:ring-emerald-500',
    dotCls: 'bg-emerald-500',
    icon: Zap,
  },
  suggest: {
    label: 'Suggest',
    cellCls: 'bg-yellow-50 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
    hoverCls: 'ring-yellow-400 dark:ring-yellow-500',
    dotCls: 'bg-yellow-400',
    icon: TrendingUp,
  },
  approve: {
    label: 'Approve',
    cellCls: 'bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300',
    hoverCls: 'ring-orange-400 dark:ring-orange-500',
    dotCls: 'bg-orange-500',
    icon: CheckCircle2,
  },
  disabled: {
    label: 'Disabled',
    cellCls: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
    hoverCls: 'ring-red-400 dark:ring-red-500',
    dotCls: 'bg-red-500',
    icon: Ban,
  },
};

// ============================================================================
// Event type labels
// ============================================================================

const EVENT_TYPE_LABEL: Record<string, string> = {
  promotion_proposed: 'Promotion proposed',
  promotion_accepted: 'Promotion accepted',
  promotion_declined: 'Promotion declined',
  promotion_never: 'Promotion blocked',
  demotion_warning: 'Demotion warning',
  demotion_auto: 'Auto-demoted',
  demotion_emergency: 'Emergency demotion',
  manual_override: 'Manual override',
};

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function formatEventDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isPromotionEvent(eventType: string): boolean {
  return eventType === 'promotion_accepted' || eventType === 'promotion_proposed';
}

function isDemotionEvent(eventType: string): boolean {
  return (
    eventType === 'demotion_auto' ||
    eventType === 'demotion_emergency' ||
    eventType === 'demotion_warning'
  );
}

// ============================================================================
// EventRow — single item in the popover event list
// ============================================================================

function EventRow({ event }: { event: MatrixEvent }) {
  const label = EVENT_TYPE_LABEL[event.event_type] ?? event.event_type;
  const isPromo = isPromotionEvent(event.event_type);
  const isDemotion = isDemotionEvent(event.event_type);

  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      {/* Direction icon */}
      <div className="flex-shrink-0 mt-0.5">
        {isPromo ? (
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
        ) : isDemotion ? (
          <TrendingDown className="h-3.5 w-3.5 text-red-500" />
        ) : (
          <ArrowUpRight className="h-3.5 w-3.5 text-gray-400" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-snug">
          {label}
        </p>
        {event.from_tier !== event.to_tier && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {event.from_tier} <span className="mx-0.5">→</span> {event.to_tier}
          </p>
        )}
        {event.trigger_reason && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-2">
            {event.trigger_reason}
          </p>
        )}
      </div>

      {/* Date */}
      <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 tabular-nums">
        {formatEventDate(event.created_at)}
      </span>
    </div>
  );
}

// ============================================================================
// CellPopover — popover content for a single matrix cell
// ============================================================================

interface CellPopoverProps {
  cell: MatrixCell;
  repName: string;
  actionLabel: string;
}

function CellPopover({ cell, repName, actionLabel }: CellPopoverProps) {
  const tierCfg = TIER_CONFIG[cell.tier];
  const TierIcon = tierCfg.icon;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {repName}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
          <span className="text-xs text-gray-600 dark:text-gray-400">{actionLabel}</span>
        </div>

        {/* Current tier pill */}
        <div className="mt-1.5 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border',
              cell.tier === 'auto'
                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                : cell.tier === 'suggest'
                  ? 'bg-yellow-50 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-500/30'
                  : cell.tier === 'approve'
                    ? 'bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30'
                    : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20',
            )}
          >
            <TierIcon className="h-3 w-3" />
            {tierCfg.label}
          </span>

          {cell.score !== null && (
            <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
              {Math.round(cell.score * 100)}% confidence
            </span>
          )}
        </div>
      </div>

      {/* Recent events */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
          Recent events
        </p>

        {cell.recent_events.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-gray-400 dark:text-gray-500">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-xs">No events in the last 30 days</span>
          </div>
        ) : (
          <div>
            {cell.recent_events.map((ev) => (
              <EventRow key={ev.id} event={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MatrixCell — a single clickable cell in the grid
// ============================================================================

interface MatrixCellViewProps {
  cell: MatrixCell;
  repName: string;
  actionLabel: string;
}

function MatrixCellView({ cell, repName, actionLabel }: MatrixCellViewProps) {
  const [open, setOpen] = useState(false);
  const tierCfg = TIER_CONFIG[cell.tier];
  const TierIcon = tierCfg.icon;
  const showPromotion =
    cell.days_since_promotion !== null && cell.days_since_promotion <= 7;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full h-full min-h-[52px] flex flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5',
            'border border-transparent ring-0 transition-all duration-150',
            'hover:ring-2 focus-visible:ring-2 focus-visible:outline-none',
            'cursor-pointer',
            tierCfg.cellCls,
            open && `ring-2 ${tierCfg.hoverCls}`,
            !open && `hover:${tierCfg.hoverCls}`,
          )}
          aria-label={`${repName} — ${actionLabel}: ${tierCfg.label}`}
        >
          <TierIcon className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="text-[10px] font-semibold leading-none tracking-tight">
            {tierCfg.label}
          </span>

          {/* Promotion badge */}
          {showPromotion && (
            <span className="text-[9px] leading-none font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 mt-0.5">
              <TrendingUp className="h-2.5 w-2.5" />
              {cell.days_since_promotion === 0
                ? 'today'
                : `${cell.days_since_promotion}d`}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-80 p-4"
        align="center"
        side="bottom"
        sideOffset={6}
      >
        <CellPopover cell={cell} repName={repName} actionLabel={actionLabel} />
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// MatrixRow — one team member row
// ============================================================================

function MatrixRepRow({ row }: { row: MatrixRow }) {
  return (
    <tr className="group">
      {/* Rep name */}
      <td className="py-1.5 pr-3 pl-1 w-[140px] min-w-[100px]">
        <span
          className="block text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-[130px]"
          title={row.display_name}
        >
          {row.display_name}
        </span>
      </td>

      {/* Action-type cells */}
      {MATRIX_ACTION_TYPES.map((actionType) => {
        const cell = row.cells[actionType];
        return (
          <td key={actionType} className="py-1.5 px-1">
            <MatrixCellView
              cell={cell}
              repName={row.display_name}
              actionLabel={ACTION_TYPE_LABELS[actionType]}
            />
          </td>
        );
      })}
    </tr>
  );
}

// ============================================================================
// Legend
// ============================================================================

function TierLegend() {
  const tiers: AutonomyTier[] = ['disabled', 'approve', 'suggest', 'auto'];
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {tiers.map((tier) => {
        const cfg = TIER_CONFIG[tier];
        const Icon = cfg.icon;
        return (
          <span key={tier} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <span className={cn('inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium', cfg.cellCls)}>
              <Icon className="h-3 w-3" />
              {cfg.label}
            </span>
          </span>
        );
      })}
      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 ml-1">
        <TrendingUp className="h-3 w-3 text-emerald-500" />
        promoted &le;7d
      </span>
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function MatrixSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {/* Header row */}
      <div className="flex gap-2">
        <div className="h-5 w-28 rounded bg-gray-200 dark:bg-gray-800" />
        {MATRIX_ACTION_TYPES.map((at) => (
          <div key={at} className="h-5 flex-1 rounded bg-gray-200 dark:bg-gray-800" />
        ))}
      </div>
      {/* Data rows */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-2">
          <div className="h-12 w-28 rounded bg-gray-100 dark:bg-gray-800/60" />
          {MATRIX_ACTION_TYPES.map((at) => (
            <div key={at} className="h-12 flex-1 rounded bg-gray-100 dark:bg-gray-800/60" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main export
// ============================================================================

export default function AutonomyMatrix({ orgId }: AutonomyMatrixProps) {
  const { data, isLoading, error, refetch, isFetching } = useTeamAutonomy(orgId);

  if (isLoading) {
    return <MatrixSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <p className="text-sm flex-1">
          Could not load autonomy data:{' '}
          {(error as Error)?.message ?? 'Unknown error'}
        </p>
        <button
          onClick={() => refetch()}
          className="text-xs underline underline-offset-2 flex-shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Users className="h-8 w-8 text-gray-300 dark:text-gray-700 mb-2" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          No autonomy data yet
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-600 mt-1 max-w-[240px]">
          Data appears once team members start interacting with agent proposals
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Subheader: last refreshed + manual refresh */}
      <div className="flex items-center justify-between gap-2">
        <TierLegend />
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          title="Refresh matrix"
        >
          <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
          <span className="sr-only">Refresh</span>
        </button>
      </div>

      {/* Scrollable matrix table */}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed min-w-[480px]">
          <colgroup>
            {/* Rep name column */}
            <col className="w-[140px]" />
            {/* Action type columns — equal width */}
            {MATRIX_ACTION_TYPES.map((at) => (
              <col key={at} />
            ))}
          </colgroup>

          <thead>
            <tr>
              <th className="pb-2 pr-3 pl-1 text-left">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  Rep
                </span>
              </th>
              {MATRIX_ACTION_TYPES.map((at) => (
                <th key={at} className="pb-2 px-1 text-center">
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                    {ACTION_TYPE_LABELS[at]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {data.rows.map((row) => (
              <MatrixRepRow key={row.user_id} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: last refreshed timestamp */}
      <p className="text-[10px] text-gray-400 dark:text-gray-600 text-right tabular-nums">
        Updated {new Date(data.fetched_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        {' · '}refreshes every 5 min
      </p>
    </div>
  );
}

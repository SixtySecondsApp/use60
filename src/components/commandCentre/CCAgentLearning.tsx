/**
 * CCAgentLearning — PST-015
 *
 * Agent Learning section for Command Centre.
 * Shows acceptance rate by category, Trust Capital score, and recent calibration events.
 * Collapsible panel following the same pattern as CCStatsPanel.
 */

import { useState } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Pencil,
  Shield,
  TrendingUp,
  Activity,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAcceptanceRates,
  useTrustCapital,
  useCalibrationEvents,
  type AcceptanceRateEntry,
  type CalibrationEvent,
} from '@/lib/hooks/useAgentLearning';

// ============================================================================
// Helpers
// ============================================================================

/** Pretty-print action_type as a human-readable label */
function formatActionType(actionType: string): string {
  return actionType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Relative time from ISO string */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Colour class for approval rate percentage */
function rateColor(rate: number): string {
  if (rate >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (rate >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
}

/** Icon + colour for calibration event status */
function statusConfig(status: string) {
  switch (status) {
    case 'approved':
      return {
        icon: CheckCircle2,
        label: 'Approved',
        className: 'text-emerald-600 dark:text-emerald-400',
      };
    case 'rejected':
      return {
        icon: XCircle,
        label: 'Rejected',
        className: 'text-red-500 dark:text-red-400',
      };
    case 'edited':
      return {
        icon: Pencil,
        label: 'Edited',
        className: 'text-amber-600 dark:text-amber-400',
      };
    default:
      return {
        icon: Activity,
        label: status,
        className: 'text-slate-500 dark:text-gray-400',
      };
  }
}

// ============================================================================
// Sub-sections
// ============================================================================

/**
 * Acceptance Rate Row — shows one action type with 7d and 30d rates side by side.
 */
function AcceptanceRateRow({
  actionType,
  rate7d,
  rate30d,
}: {
  actionType: string;
  rate7d: AcceptanceRateEntry | undefined;
  rate30d: AcceptanceRateEntry | undefined;
}) {
  const pct7 = rate7d?.approval_rate ?? 0;
  const pct30 = rate30d?.approval_rate ?? 0;
  const total7 = rate7d?.total_count ?? 0;
  const total30 = rate30d?.total_count ?? 0;

  // Skip if no data in either window
  if (total7 === 0 && total30 === 0) return null;

  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-gray-800/60 last:border-0">
      <span className="flex-1 text-sm text-slate-700 dark:text-gray-200 truncate min-w-0">
        {formatActionType(actionType)}
      </span>
      <div className="flex items-center gap-4 flex-shrink-0">
        {/* 7d */}
        <div className="text-right w-16">
          <span className={`text-sm font-semibold tabular-nums ${rateColor(pct7)}`}>
            {total7 > 0 ? `${Math.round(pct7)}%` : '--'}
          </span>
          <p className="text-[10px] text-slate-400 dark:text-gray-500">7d</p>
        </div>
        {/* 30d */}
        <div className="text-right w-16">
          <span className={`text-sm font-semibold tabular-nums ${rateColor(pct30)}`}>
            {total30 > 0 ? `${Math.round(pct30)}%` : '--'}
          </span>
          <p className="text-[10px] text-slate-400 dark:text-gray-500">30d</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Trust Capital gauge — simple score / 1000 with progress bar.
 */
function TrustCapitalGauge({
  score,
  isLoading,
}: {
  score: number | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="h-2 w-full rounded" />
      </div>
    );
  }

  const s = score ?? 0;
  const pct = Math.round((s / 1000) * 100);

  const color =
    pct >= 70
      ? 'text-emerald-600 dark:text-emerald-400'
      : pct >= 40
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-500 dark:text-red-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-violet-500 dark:text-violet-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-gray-200">
            Trust Capital
          </span>
        </div>
        <span className={`text-lg font-bold tabular-nums ${color}`}>
          {s}
          <span className="text-xs font-normal text-slate-400 dark:text-gray-500">
            /1000
          </span>
        </span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}

/**
 * Calibration Event Row — recent approval/rejection/edit.
 */
function CalibrationEventRow({ event }: { event: CalibrationEvent }) {
  const config = statusConfig(event.status);
  const Icon = config.icon;
  const timeStr = event.approved_at ? timeAgo(event.approved_at) : timeAgo(event.created_at);

  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-slate-100 dark:border-gray-800/60 last:border-0">
      <Icon className={`h-4 w-4 flex-shrink-0 ${config.className}`} />
      <span className="flex-1 text-sm text-slate-700 dark:text-gray-200 truncate min-w-0">
        {formatActionType(event.field_name)}
      </span>
      <Badge
        variant="outline"
        className={`text-[10px] font-medium px-1.5 py-0 h-5 flex-shrink-0 ${config.className} border-current/20`}
      >
        {config.label}
      </Badge>
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 h-5 flex-shrink-0 capitalize"
      >
        {event.confidence}
      </Badge>
      <span className="text-[11px] text-slate-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
        {timeStr}
      </span>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function CCAgentLearning() {
  const [open, setOpen] = useState(true);

  const { rates7d, rates30d } = useAcceptanceRates();
  const trustCapitalQuery = useTrustCapital();
  const calibrationQuery = useCalibrationEvents();

  const isLoading = rates7d.isLoading || rates30d.isLoading || trustCapitalQuery.isLoading;

  // Merge 7d and 30d into a unified action type list
  const allActionTypes = new Set<string>();
  for (const entry of rates7d.data ?? []) allActionTypes.add(entry.action_type);
  for (const entry of rates30d.data ?? []) allActionTypes.add(entry.action_type);

  const rates7dMap = new Map<string, AcceptanceRateEntry>(
    (rates7d.data ?? []).map((e) => [e.action_type, e])
  );
  const rates30dMap = new Map<string, AcceptanceRateEntry>(
    (rates30d.data ?? []).map((e) => [e.action_type, e])
  );

  // Sort by 30d total descending
  const sortedActionTypes = Array.from(allActionTypes).sort((a, b) => {
    const totalA = (rates30dMap.get(a)?.total_count ?? 0) + (rates7dMap.get(a)?.total_count ?? 0);
    const totalB = (rates30dMap.get(b)?.total_count ?? 0) + (rates7dMap.get(b)?.total_count ?? 0);
    return totalB - totalA;
  });

  const trustScore = trustCapitalQuery.data?.score ?? null;

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
          <Brain className="h-4 w-4 text-violet-500 dark:text-violet-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-gray-200">
            Agent Learning
          </span>
          {trustScore !== null && trustScore > 0 && (
            <Badge className="h-4 px-1.5 text-[10px] bg-violet-600 text-white">
              {trustScore} TC
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
          {/* ---- Trust Capital ---- */}
          <div className="mt-4">
            <TrustCapitalGauge
              score={trustScore}
              isLoading={trustCapitalQuery.isLoading}
            />
          </div>

          {/* ---- Acceptance Rates ---- */}
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-3.5 w-3.5 text-slate-400 dark:text-gray-500" />
              <p className="text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider">
                Acceptance rate by category
              </p>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full rounded" />
                ))}
              </div>
            ) : sortedActionTypes.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-gray-500 text-center py-3">
                No approval data yet. The agent will learn from your feedback.
              </p>
            ) : (
              <div>
                {sortedActionTypes.map((actionType) => (
                  <AcceptanceRateRow
                    key={actionType}
                    actionType={actionType}
                    rate7d={rates7dMap.get(actionType)}
                    rate30d={rates30dMap.get(actionType)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ---- Recent Calibration Events ---- */}
          <div className="mt-5">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-3.5 w-3.5 text-slate-400 dark:text-gray-500" />
              <p className="text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider">
                Recent calibration events
              </p>
            </div>

            {calibrationQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-7 w-full rounded" />
                ))}
              </div>
            ) : (calibrationQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-gray-500 text-center py-3">
                No calibration events yet. Approve or reject agent suggestions to train it.
              </p>
            ) : (
              <div>
                {(calibrationQuery.data ?? []).map((event) => (
                  <CalibrationEventRow key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

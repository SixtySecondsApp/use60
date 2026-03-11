/**
 * CCAgentLearning — PST-015 (redesigned)
 *
 * Compact insight strip for the Command Centre header area.
 * Shows Trust Capital, acceptance rate, and trend inline.
 * Expands on click to show category breakdown and recent events.
 */

import { useState } from 'react';
import {
  Brain,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Pencil,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  X,
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

function formatActionType(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function rateColor(rate: number): string {
  if (rate >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (rate >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
}

function rateBg(rate: number): string {
  if (rate >= 80) return 'bg-emerald-500';
  if (rate >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function statusIcon(status: string) {
  switch (status) {
    case 'approved':
      return { Icon: CheckCircle2, cls: 'text-emerald-500' };
    case 'rejected':
      return { Icon: XCircle, cls: 'text-red-500' };
    case 'edited':
      return { Icon: Pencil, cls: 'text-amber-500' };
    default:
      return { Icon: Activity, cls: 'text-slate-400' };
  }
}

// ============================================================================
// Collapsed strip — lives in the header area
// ============================================================================

function CollapsedStrip({
  trustScore,
  avgRate,
  trend,
  totalDecisions,
  isLoading,
  onExpand,
}: {
  trustScore: number;
  avgRate: number;
  trend: 'up' | 'down' | 'flat';
  totalDecisions: number;
  isLoading: boolean;
  onExpand: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-violet-50/50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/30">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-3 w-48 rounded" />
      </div>
    );
  }

  const hasData = totalDecisions > 0 || trustScore > 0;

  // Empty state — still show the strip so users know the feature exists
  if (!hasData) {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-violet-50/40 dark:bg-violet-950/10 border border-dashed border-violet-200/60 dark:border-violet-800/30 hover:bg-violet-50/70 dark:hover:bg-violet-950/20 transition-colors text-left"
      >
        <Brain className="h-4 w-4 text-violet-400/70" />
        <span className="text-xs text-slate-400 dark:text-gray-500">
          <span className="font-medium text-violet-500/80">Agent Learning</span> — approve or edit suggestions to start training your AI teammate
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-gray-600 ml-auto flex-shrink-0" />
      </button>
    );
  }

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-emerald-500'
      : trend === 'down'
        ? 'text-red-400'
        : 'text-slate-400';

  return (
    <button
      type="button"
      onClick={onExpand}
      className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-violet-50/60 dark:bg-violet-950/20 border border-violet-100/80 dark:border-violet-900/30 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors text-left"
    >
      <Brain className="h-4 w-4 text-violet-500 flex-shrink-0" />

      <div className="flex items-center gap-4 flex-1 min-w-0 text-xs">
        {/* Trust Capital */}
        <div className="flex items-center gap-1.5">
          <Shield className="h-3 w-3 text-violet-400" />
          <span className="font-semibold text-slate-700 dark:text-gray-200 tabular-nums">
            {trustScore}
          </span>
          <span className="text-slate-400 dark:text-gray-500">TC</span>
        </div>

        <span className="text-slate-200 dark:text-gray-700">|</span>

        {/* Acceptance rate */}
        <div className="flex items-center gap-1.5">
          <span className={`font-semibold tabular-nums ${rateColor(avgRate)}`}>
            {Math.round(avgRate)}%
          </span>
          <span className="text-slate-400 dark:text-gray-500">accepted</span>
          <TrendIcon className={`h-3 w-3 ${trendColor}`} />
        </div>

        <span className="text-slate-200 dark:text-gray-700">|</span>

        {/* Decisions count */}
        <span className="text-slate-400 dark:text-gray-500">
          <span className="font-medium text-slate-600 dark:text-gray-300 tabular-nums">{totalDecisions}</span> decisions (30d)
        </span>
      </div>

      <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-gray-600 group-hover:text-violet-400 transition-colors flex-shrink-0" />
    </button>
  );
}

// ============================================================================
// Expanded detail panel — slides in as an overlay-ish card
// ============================================================================

function ExpandedPanel({
  trustScore,
  rates7dMap,
  rates30dMap,
  sortedActionTypes,
  events,
  isLoading,
  onClose,
}: {
  trustScore: number;
  rates7dMap: Map<string, AcceptanceRateEntry>;
  rates30dMap: Map<string, AcceptanceRateEntry>;
  sortedActionTypes: string[];
  events: CalibrationEvent[];
  isLoading: boolean;
  onClose: () => void;
}) {
  const pct = Math.round((trustScore / 1000) * 100);

  return (
    <div className="rounded-lg border border-violet-200/80 dark:border-violet-800/40 bg-white dark:bg-gray-900/80 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50/60 dark:bg-violet-950/20 border-b border-violet-100 dark:border-violet-900/30">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-gray-200">
            Agent Learning
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
        >
          <X className="h-3.5 w-3.5 text-slate-400" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Trust Capital gauge */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400">Trust Capital</span>
              </div>
              <span className={`text-sm font-bold tabular-nums ${rateColor(pct)}`}>
                {trustScore}<span className="text-xs font-normal text-slate-400">/1000</span>
              </span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        </div>

        {/* Acceptance rates — compact table */}
        {sortedActionTypes.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider">
                Acceptance by category
              </span>
              <div className="flex gap-3 text-[10px] text-slate-400 dark:text-gray-500">
                <span>7d</span>
                <span>30d</span>
              </div>
            </div>
            <div className="space-y-0">
              {sortedActionTypes.slice(0, 6).map((type) => {
                const r7 = rates7dMap.get(type);
                const r30 = rates30dMap.get(type);
                const pct7 = r7?.approval_rate ?? 0;
                const pct30 = r30?.approval_rate ?? 0;
                const has7 = (r7?.total_count ?? 0) > 0;
                const has30 = (r30?.total_count ?? 0) > 0;

                return (
                  <div
                    key={type}
                    className="flex items-center gap-2 py-1.5 border-b border-slate-50 dark:border-gray-800/40 last:border-0"
                  >
                    {/* Mini bar */}
                    <div className="w-12 flex-shrink-0">
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${rateBg(has30 ? pct30 : pct7)} transition-all`}
                          style={{ width: `${has30 ? pct30 : pct7}%` }}
                        />
                      </div>
                    </div>
                    <span className="flex-1 text-xs text-slate-600 dark:text-gray-300 truncate">
                      {formatActionType(type)}
                    </span>
                    <span className={`text-xs font-medium tabular-nums w-8 text-right ${has7 ? rateColor(pct7) : 'text-slate-300 dark:text-gray-600'}`}>
                      {has7 ? `${Math.round(pct7)}%` : '--'}
                    </span>
                    <span className={`text-xs font-medium tabular-nums w-8 text-right ${has30 ? rateColor(pct30) : 'text-slate-300 dark:text-gray-600'}`}>
                      {has30 ? `${Math.round(pct30)}%` : '--'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent calibration — compact timeline */}
        {events.length > 0 && (
          <div>
            <span className="text-[11px] font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider">
              Recent decisions
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {events.slice(0, 8).map((ev) => {
                const { Icon, cls } = statusIcon(ev.status);
                return (
                  <div
                    key={ev.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 dark:bg-gray-800/50 border border-slate-100 dark:border-gray-700/40"
                    title={`${formatActionType(ev.field_name)} — ${ev.status} (${ev.confidence})`}
                  >
                    <Icon className={`h-3 w-3 ${cls}`} />
                    <span className="text-[11px] text-slate-600 dark:text-gray-300 truncate max-w-[100px]">
                      {formatActionType(ev.field_name)}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-gray-500 tabular-nums">
                      {timeAgo(ev.approved_at || ev.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && sortedActionTypes.length === 0 && events.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-gray-500 text-center py-2">
            No learning data yet. Approve or edit agent suggestions to start training.
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main export
// ============================================================================

export function CCAgentLearning() {
  const [expanded, setExpanded] = useState(false);

  const { rates7d, rates30d } = useAcceptanceRates();
  const trustCapitalQuery = useTrustCapital();
  const calibrationQuery = useCalibrationEvents();

  const isLoading = rates7d.isLoading || rates30d.isLoading || trustCapitalQuery.isLoading;

  // Merge and sort action types
  const allActionTypes = new Set<string>();
  for (const e of rates7d.data ?? []) allActionTypes.add(e.action_type);
  for (const e of rates30d.data ?? []) allActionTypes.add(e.action_type);

  const rates7dMap = new Map((rates7d.data ?? []).map((e) => [e.action_type, e]));
  const rates30dMap = new Map((rates30d.data ?? []).map((e) => [e.action_type, e]));

  const sortedActionTypes = Array.from(allActionTypes).sort((a, b) => {
    const tA = (rates30dMap.get(a)?.total_count ?? 0) + (rates7dMap.get(a)?.total_count ?? 0);
    const tB = (rates30dMap.get(b)?.total_count ?? 0) + (rates7dMap.get(b)?.total_count ?? 0);
    return tB - tA;
  });

  // Compute aggregate stats for collapsed strip
  const trustScore = trustCapitalQuery.data?.score ?? 0;
  const total30d = (rates30d.data ?? []).reduce((sum, e) => sum + e.total_count, 0);
  const approved30d = (rates30d.data ?? []).reduce((sum, e) => sum + e.approval_count, 0);
  const avgRate30d = total30d > 0 ? (approved30d / total30d) * 100 : 0;

  const total7d = (rates7d.data ?? []).reduce((sum, e) => sum + e.total_count, 0);
  const approved7d = (rates7d.data ?? []).reduce((sum, e) => sum + e.approval_count, 0);
  const avgRate7d = total7d > 0 ? (approved7d / total7d) * 100 : 0;

  const trend: 'up' | 'down' | 'flat' =
    total7d < 3 || total30d < 3
      ? 'flat'
      : avgRate7d > avgRate30d + 3
        ? 'up'
        : avgRate7d < avgRate30d - 3
          ? 'down'
          : 'flat';

  if (expanded) {
    return (
      <ExpandedPanel
        trustScore={trustScore}
        rates7dMap={rates7dMap}
        rates30dMap={rates30dMap}
        sortedActionTypes={sortedActionTypes}
        events={calibrationQuery.data ?? []}
        isLoading={isLoading}
        onClose={() => setExpanded(false)}
      />
    );
  }

  return (
    <CollapsedStrip
      trustScore={trustScore}
      avgRate={avgRate30d}
      trend={trend}
      totalDecisions={total30d}
      isLoading={isLoading}
      onExpand={() => setExpanded(true)}
    />
  );
}

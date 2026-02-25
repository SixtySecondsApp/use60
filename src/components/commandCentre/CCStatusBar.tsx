/**
 * CCStatusBar — CC-006
 *
 * Compact fixed bar displayed above the Command Centre feed. Shows:
 *   - Copilot active indicator (pulsing green dot)
 *   - Actions completed today
 *   - Pending review count (clickable, filters to Needs You)
 *   - Latest agent action (right-aligned)
 *
 * Purely presentational — all data passed via props.
 */

import { Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// ============================================================================
// AnimatedCount — re-mounts on value change to trigger entrance animation
// ============================================================================

function AnimatedCount({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <span
      key={value}
      className={cn('inline-block animate-count-flash tabular-nums', className)}
    >
      {value}
    </span>
  );
}

// ============================================================================
// Types
// ============================================================================

interface CCStatusBarProps {
  /** Stats from the server-side RPC */
  stats: {
    total_active: number;
    needs_review: number;
    needs_input: number;
    auto_completed_today: number;
    resolved_today: number;
    pending_approval: number;
  } | null;
  /** Whether stats are still loading */
  isLoading: boolean;
  /** Most recent item for the "latest action" display */
  latestItem: {
    source_agent: string;
    title: string;
  } | null;
  /** Callback when user clicks the pending count */
  onClickPending: () => void;
}

// ============================================================================
// Sub-components
// ============================================================================

/** Vertical divider between sections */
function Divider() {
  return (
    <div className="self-stretch border-r border-slate-200 dark:border-gray-800" aria-hidden />
  );
}

// ============================================================================
// Main component
// ============================================================================

export function CCStatusBar({
  stats,
  isLoading,
  latestItem,
  onClickPending,
}: CCStatusBarProps) {
  const pendingCount = stats != null
    ? (stats.needs_review ?? 0) + (stats.pending_approval ?? 0)
    : 0;

  const actionsToday = stats?.auto_completed_today ?? 0;

  // Normalise agent name: "follow-up-agent" -> "Follow Up Agent"
  const agentLabel = latestItem
    ? latestItem.source_agent
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <div
      className={cn(
        'h-10 flex items-center',
        'bg-white dark:bg-gray-900/80',
        'border-b border-slate-200 dark:border-gray-800/60',
        'text-xs',
      )}
    >
      {/* ── 1. Copilot active indicator ── */}
      <div className="flex items-center gap-2 px-4 h-full flex-shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-slate-600 dark:text-gray-300 font-medium">Active</span>
      </div>

      <Divider />

      {/* ── 2. Actions today ── */}
      <div className="flex items-center gap-1 px-4 h-full flex-shrink-0">
        {isLoading ? (
          <Skeleton className="h-3 w-24" />
        ) : (
          <>
            <AnimatedCount
              value={actionsToday}
              className="font-semibold text-slate-800 dark:text-gray-100"
            />
            <span className="text-slate-500 dark:text-gray-400">actions today</span>
          </>
        )}
      </div>

      <Divider />

      {/* ── 3. Pending review (clickable) ── */}
      <div className="flex items-center gap-1 px-4 h-full flex-shrink-0">
        {isLoading ? (
          <Skeleton className="h-3 w-24" />
        ) : pendingCount > 0 ? (
          <button
            type="button"
            onClick={onClickPending}
            className="flex items-center gap-1 group"
            aria-label={`${pendingCount} items need review — click to filter`}
          >
            <AnimatedCount
              value={pendingCount}
              className="font-semibold text-amber-600 dark:text-amber-400 group-hover:underline"
            />
            <span className="text-slate-500 dark:text-gray-400 group-hover:text-slate-700 dark:group-hover:text-gray-200 transition-colors">
              need review
            </span>
          </button>
        ) : (
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            All caught up
          </span>
        )}
      </div>

      <Divider />

      {/* ── 4. Latest agent action (right-aligned, fills remaining space) ── */}
      <div className="flex items-center gap-2 px-4 h-full flex-1 min-w-0 justify-end">
        {isLoading ? (
          <Skeleton className="h-3 w-48" />
        ) : latestItem ? (
          <>
            <Radio className="h-3 w-3 text-slate-400 dark:text-gray-500 flex-shrink-0" />
            {/* Agent badge */}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400 font-medium flex-shrink-0">
              {agentLabel}
            </span>
            {/* Action title */}
            <span className="text-slate-500 dark:text-gray-400 truncate min-w-0">
              {latestItem.title}
            </span>
          </>
        ) : (
          <span className="text-slate-400 dark:text-gray-500 italic">No recent actions</span>
        )}
      </div>
    </div>
  );
}

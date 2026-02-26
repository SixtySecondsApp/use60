/**
 * CCItemCard — CC-005
 *
 * Extracted from CommandCentre.tsx. Adds left-border severity system:
 *  - Blue:  needs human approval (open/ready with drafted_action)
 *  - Amber: critical or high urgency signal/alert
 *  - Green: auto_resolved or completed
 *  - Grey:  informational / everything else
 *
 * The existing auto-exec emerald full-border takes precedence when
 * resolution_channel === 'auto_exec' (CC-012 behaviour preserved).
 */

import {
  AlertTriangle,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  RotateCcw,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CCItem } from '@/lib/services/commandCentreItemsService';

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
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium',
        config.badgeClass,
      )}
    >
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
  return (
    <span className={cn('text-[11px] font-medium tabular-nums', colorClass)}>{pct}%</span>
  );
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
// Left-border severity logic
// ============================================================================

function getLeftBorderColor(item: CCItem): string {
  // Blue: needs human approval (has drafted action and is in open/ready status)
  if ((item.status === 'open' || item.status === 'ready') && item.drafted_action) {
    return 'border-l-4 border-l-blue-500';
  }
  // Amber: signal/alert or critical/high urgency
  if (item.urgency === 'critical' || item.urgency === 'high') {
    return 'border-l-4 border-l-amber-500';
  }
  // Green: auto-completed or completed
  if (item.status === 'auto_resolved' || item.status === 'completed') {
    return 'border-l-4 border-l-emerald-500';
  }
  // Grey: everything else (informational)
  return 'border-l-4 border-l-gray-300 dark:border-l-gray-600';
}

// ============================================================================
// Props
// ============================================================================

export interface CCItemCardProps {
  item: CCItem;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  onUndo?: (id: string) => void;
  onViewDetail: (item: CCItem) => void;
  isPending: boolean;
  showUndo?: boolean;
  /** Extra classes injected by the parent (e.g. entrance animation) */
  animationClass?: string;
}

// ============================================================================
// Status-based opacity helper
// ============================================================================

function getStatusOpacityClass(status: CCItem['status']): string {
  if (status === 'dismissed' || status === 'snoozed') {
    return 'opacity-0 scale-[0.98]';
  }
  if (status === 'approved' || status === 'completed' || status === 'auto_resolved') {
    return 'opacity-50';
  }
  return 'opacity-100';
}

export function CCItemCard({
  item,
  onApprove,
  onDismiss,
  onSnooze,
  onUndo,
  onViewDetail,
  isPending,
  showUndo,
  animationClass,
}: CCItemCardProps) {
  const draftedAction = item.drafted_action as Record<string, unknown> | null;
  const displayText = draftedAction?.display_text as string | undefined;
  const isAutoExec = item.resolution_channel === 'auto_exec';
  const leftBorder = getLeftBorderColor(item);
  const statusOpacity = getStatusOpacityClass(item.status);

  // dismissed/snoozed get a faster 200ms fade+scale; approved gets a slower 300ms opacity-only fade
  const isDismissing = item.status === 'dismissed' || item.status === 'snoozed';
  const transitionClass = isDismissing
    ? 'transition-all duration-200'
    : 'transition-opacity duration-300';

  return (
    <Card
      className={cn(
        'bg-white dark:bg-gray-900/60 transition-colors cursor-pointer overflow-hidden',
        transitionClass,
        statusOpacity,
        animationClass,
        // Auto-exec: full emerald border takes precedence (CC-012)
        isAutoExec
          ? 'border-2 border-emerald-500/70 dark:border-emerald-500/50 hover:border-emerald-500 dark:hover:border-emerald-400'
          : cn(
              'border border-slate-200 dark:border-gray-700/60 hover:border-slate-300 dark:hover:border-gray-600',
              leftBorder,
            ),
      )}
      onClick={() => onViewDetail(item)}
    >
      <CardContent className="p-4">
        {/* Auto-sent banner */}
        {isAutoExec && (
          <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
            <Zap className="h-3 w-3 text-emerald-400 flex-shrink-0" />
            <span className="text-xs font-medium text-emerald-400">
              Auto-sent — undo within 24h
            </span>
          </div>
        )}

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
            <p className="text-xs text-slate-600 dark:text-gray-300 flex-1 line-clamp-2">
              {displayText}
            </p>
            {item.confidence_score != null && (
              <ConfidencePill score={item.confidence_score} />
            )}
          </div>
        )}

        {/* Action buttons */}
        <div
          className="flex items-center gap-2 flex-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          {!showUndo ? (
            <>
              {(item.status === 'open' || item.status === 'ready') && (
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => onApprove(item.id)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3 mr-1" />
                  )}
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

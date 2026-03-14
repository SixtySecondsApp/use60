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
  Check,
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
import { URGENCY_CONFIG } from './constants';

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
  /** Whether this item is highlighted via keyboard navigation */
  isHighlighted?: boolean;
  /** Whether this item is currently selected (shown in detail panel) */
  isSelected?: boolean;
  /** Compact mode for left-rail display — less padding, truncated text, no action buttons */
  compact?: boolean;
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
  isHighlighted,
  isSelected,
  compact,
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
        isHighlighted && 'ring-2 ring-blue-500 dark:ring-blue-400',
        isSelected && 'bg-accent dark:bg-accent/40 border-primary/50 dark:border-primary/40',
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
      <CardContent className={cn(compact ? 'p-3' : 'p-4')}>
        {/* Auto-sent banner */}
        {isAutoExec && (
          <div className={cn(
            'flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20',
            compact && 'mb-1.5',
          )}>
            <Zap className="h-3 w-3 text-emerald-400 flex-shrink-0" />
            <span className="text-xs font-medium text-emerald-400">
              {compact ? 'Auto-sent' : 'Auto-sent — undo within 24h'}
            </span>
          </div>
        )}

        {/* Top row: urgency + title + source agent */}
        <div className={cn('flex items-start gap-2', compact ? 'mb-1' : 'mb-2')}>
          <UrgencyBadge urgency={item.urgency} />
          <p className={cn(
            'flex-1 font-semibold text-sm text-slate-800 dark:text-gray-100 leading-snug',
            compact && 'line-clamp-1',
          )}>
            {item.title}
          </p>
          {!compact && <AgentTag agent={item.source_agent} />}
        </div>

        {/* Enriched summary — truncated more aggressively in compact mode */}
        {item.summary && (
          <p className={cn(
            'text-slate-500 dark:text-gray-400',
            compact
              ? 'text-xs line-clamp-2 mb-1.5'
              : 'text-sm line-clamp-3 mb-3',
          )}>
            {item.summary}
          </p>
        )}

        {/* Drafted action — show slim version in compact, full in normal */}
        {displayText && (
          <div className={cn(
            'flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-gray-800/60 border border-slate-100 dark:border-gray-700/40',
            compact ? 'p-1.5 mb-1.5' : 'p-2 mb-3',
          )}>
            <Check className={cn('text-emerald-500 flex-shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            <p className={cn('text-slate-600 dark:text-gray-300 flex-1', compact ? 'text-[11px] line-clamp-1' : 'text-xs line-clamp-2')}>
              {displayText}
            </p>
            {item.confidence_score != null && (
              <ConfidencePill score={item.confidence_score} />
            )}
          </div>
        )}

        {/* Compact mode: show agent tag + confidence inline at bottom */}
        {compact && (
          <div className="flex items-center gap-2 mt-1">
            <AgentTag agent={item.source_agent} />
            {item.confidence_score != null && !displayText && (
              <ConfidencePill score={item.confidence_score} />
            )}
          </div>
        )}

        {/* Action buttons — hidden in compact mode (actions live in detail panel) */}
        {!compact && (
          <div
            className="flex items-center gap-2 flex-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            {!showUndo ? (
              <>
                {(item.status === 'open' || item.status === 'ready') && (
                  <Button
                    size="sm"
                    variant="success"
                    className="h-7 px-3 text-xs"
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
        )}
      </CardContent>
    </Card>
  );
}

/**
 * AccountSignalTimeline — Signal history for a watched account.
 *
 * Used in:
 * - Signal column popover (compact mode, last 5)
 * - Settings panel (full mode, paginated)
 */

import { useState } from 'react';
import {
  Briefcase, Building2, TrendingUp, Newspaper, Users, Cpu, Shield, Search,
  Eye, X, ArrowRight, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { AccountSignal } from '@/lib/hooks/useAccountWatchlist';

// ---------------------------------------------------------------------------
// Signal type → icon + label
// ---------------------------------------------------------------------------

const SIGNAL_CONFIG: Record<string, { icon: typeof Briefcase; label: string; color: string }> = {
  job_change: { icon: Briefcase, label: 'Job Change', color: 'text-purple-500' },
  title_change: { icon: Briefcase, label: 'Title Change', color: 'text-blue-500' },
  company_change: { icon: Building2, label: 'Company Change', color: 'text-red-500' },
  funding_event: { icon: TrendingUp, label: 'Funding', color: 'text-green-500' },
  company_news: { icon: Newspaper, label: 'News', color: 'text-amber-500' },
  hiring_surge: { icon: Users, label: 'Hiring', color: 'text-cyan-500' },
  tech_stack_change: { icon: Cpu, label: 'Tech Stack', color: 'text-gray-500' },
  competitor_mention: { icon: Shield, label: 'Competitor', color: 'text-orange-500' },
  custom_research_result: { icon: Search, label: 'Research', color: 'text-indigo-500' },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};

const SOURCE_LABELS: Record<string, string> = {
  apollo_diff: 'Apollo',
  web_intel: 'Web Intel',
  custom_prompt: 'Custom',
};

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AccountSignalTimelineProps {
  signals: AccountSignal[];
  isLoading?: boolean;
  compact?: boolean;
  maxItems?: number;
  nextCheckAt?: string | null;
  onMarkRead?: (signalId: string) => void;
  onDismiss?: (signalId: string) => void;
  onViewAll?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccountSignalTimeline({
  signals,
  isLoading,
  compact = false,
  maxItems,
  nextCheckAt,
  onMarkRead,
  onDismiss,
  onViewAll,
}: AccountSignalTimelineProps) {
  const displaySignals = maxItems ? signals.slice(0, maxItems) : signals;
  const hasMore = maxItems ? signals.length > maxItems : false;

  if (isLoading) {
    return (
      <div className="space-y-3 p-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!signals.length) {
    return (
      <div className="text-center py-6 px-4">
        <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No signals detected yet.</p>
        {nextCheckAt && (
          <p className="text-xs text-muted-foreground mt-1">
            <Clock className="h-3 w-3 inline mr-1" />
            Next check: {new Date(nextCheckAt).toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            })}
          </p>
        )}
      </div>
    );
  }

  const Wrapper = compact ? ScrollArea : 'div';
  const wrapperProps = compact ? { className: 'max-h-[300px]' } : { className: 'space-y-1' };

  return (
    <Wrapper {...wrapperProps}>
      <div className="space-y-1 p-1">
        {displaySignals.map(signal => {
          const config = SIGNAL_CONFIG[signal.signal_type] ?? {
            icon: Search, label: signal.signal_type, color: 'text-gray-500',
          };
          const Icon = config.icon;
          const severityStyle = SEVERITY_STYLES[signal.severity] ?? SEVERITY_STYLES.low;

          return (
            <div
              key={signal.id}
              className={`flex gap-3 p-2 rounded-md border transition-colors ${
                signal.is_read ? 'bg-background border-transparent' : 'bg-muted/30 border-muted'
              }`}
            >
              <div className={`flex-shrink-0 mt-0.5 ${config.color}`}>
                <Icon className="h-4 w-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Badge variant="outline" className={`text-[10px] px-1 py-0 ${severityStyle}`}>
                    {signal.severity}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{config.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
                    {relativeTime(signal.detected_at)}
                  </span>
                </div>

                <p className="text-xs font-medium leading-tight truncate">{signal.title}</p>

                {!compact && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{signal.summary}</p>
                )}

                {!compact && signal.recommended_action && (
                  <p className="text-xs text-primary/70 mt-1 italic">{signal.recommended_action}</p>
                )}

                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-[9px] px-1 py-0">
                    {SOURCE_LABELS[signal.source] ?? signal.source}
                  </Badge>

                  {!compact && onMarkRead && !signal.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-[10px]"
                      onClick={() => onMarkRead(signal.id)}
                    >
                      <Eye className="h-3 w-3 mr-0.5" /> Read
                    </Button>
                  )}

                  {!compact && onDismiss && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-[10px] text-muted-foreground"
                      onClick={() => onDismiss(signal.id)}
                    >
                      <X className="h-3 w-3 mr-0.5" /> Dismiss
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {hasMore && onViewAll && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs mt-1"
            onClick={onViewAll}
          >
            View all {signals.length} signals <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>
    </Wrapper>
  );
}

// ---------------------------------------------------------------------------
// Compact signal badge for table cell
// ---------------------------------------------------------------------------

export function SignalBadge({ signal }: { signal: AccountSignal }) {
  const config = SIGNAL_CONFIG[signal.signal_type] ?? {
    icon: Search, label: signal.signal_type, color: 'text-gray-500',
  };
  const Icon = config.icon;

  const borderColor = {
    critical: 'border-red-400',
    high: 'border-orange-400',
    medium: 'border-yellow-400',
    low: 'border-gray-300',
  }[signal.severity] ?? 'border-gray-300';

  return (
    <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs ${borderColor} bg-background`}>
      <Icon className={`h-3 w-3 ${config.color}`} />
      <span className="truncate max-w-[120px]">{config.label}</span>
    </div>
  );
}

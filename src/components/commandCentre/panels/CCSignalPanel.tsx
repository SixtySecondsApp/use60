/**
 * CCSignalPanel — CC-013
 *
 * Typed detail panel for signal/alert items.
 * Renders a severity badge, signal type, evidence text,
 * a recommended action callout with contextual button,
 * and a signal history timeline.
 */

import { AlertTriangle, Clock, Shield, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { CCItem } from '@/lib/services/commandCentreItemsService';

// ============================================================================
// Types
// ============================================================================

type Severity = 'high' | 'medium' | 'low';

interface HistoryEntry {
  date: string;
  event: string;
}

interface SignalData {
  signal_type: string | null;
  severity: Severity;
  evidence: string | null;
  recommended_action: string | null;
  history: HistoryEntry[];
}

// ============================================================================
// Props
// ============================================================================

export interface CCSignalPanelProps {
  item: CCItem;
}

// ============================================================================
// Helpers
// ============================================================================

function extractSignalData(item: CCItem): SignalData {
  const enrichmentContext = (item.enrichment_context as Record<string, unknown>) ?? {};
  const context = (item.context as Record<string, unknown>) ?? {};

  // Prefer enrichment_context if it has severity/signal_type, else context
  const source: Record<string, unknown> =
    enrichmentContext.severity != null || enrichmentContext.signal_type != null
      ? enrichmentContext
      : context;

  const signal_type =
    typeof source.signal_type === 'string' ? source.signal_type : null;

  const rawSeverity = source.severity;
  const severity: Severity =
    rawSeverity === 'high' || rawSeverity === 'medium' || rawSeverity === 'low'
      ? rawSeverity
      : 'medium';

  const evidence =
    typeof source.evidence === 'string' ? source.evidence : null;

  const recommended_action =
    typeof source.recommended_action === 'string' ? source.recommended_action : null;

  const rawHistory = Array.isArray(source.history) ? source.history : [];
  const history: HistoryEntry[] = rawHistory
    .filter(
      (h): h is Record<string, unknown> =>
        h !== null && typeof h === 'object' && !Array.isArray(h),
    )
    .map((h) => ({
      date: String(h.date ?? ''),
      event: String(h.event ?? ''),
    }));

  return { signal_type, severity, evidence, recommended_action, history };
}

// ============================================================================
// Severity badge
// ============================================================================

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; badgeClass: string; icon: React.ElementType }
> = {
  high: {
    label: 'High',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
    icon: AlertTriangle,
  },
  medium: {
    label: 'Medium',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    icon: Shield,
  },
  low: {
    label: 'Low',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
    icon: Shield,
  },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
        config.badgeClass,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label} severity
    </span>
  );
}

// ============================================================================
// Component
// ============================================================================

export function CCSignalPanel({ item }: CCSignalPanelProps) {
  const { signal_type, severity, evidence, recommended_action, history } =
    extractSignalData(item);

  // Derive a contextual button label from recommended_action or signal_type
  const actionButtonLabel = (() => {
    if (!recommended_action) return null;
    const lower = recommended_action.toLowerCase();
    if (lower.includes('email') || lower.includes('re-engagement') || lower.includes('draft')) {
      return 'Draft re-engagement';
    }
    if (lower.includes('call') || lower.includes('meeting')) {
      return 'Schedule call';
    }
    if (lower.includes('slack') || lower.includes('message')) {
      return 'Send message';
    }
    return 'Take action';
  })();

  const signalTypeLabel = signal_type
    ? signal_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <div className="space-y-4">
      {/* ---- Severity badge + signal type ---- */}
      <div className="flex items-center gap-2 flex-wrap">
        <SeverityBadge severity={severity} />
        {signalTypeLabel && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400 text-xs font-medium">
            <Zap className="h-3 w-3" />
            {signalTypeLabel}
          </span>
        )}
      </div>

      {/* ---- Evidence ---- */}
      {evidence && (
        <div className="rounded-lg bg-slate-50 dark:bg-gray-800/40 border border-slate-200 dark:border-gray-700/60 px-3 py-3">
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
            Evidence
          </p>
          <p className="text-sm text-slate-600 dark:text-gray-300 leading-relaxed">{evidence}</p>
        </div>
      )}

      {/* ---- Recommended action callout ---- */}
      {recommended_action && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-3">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1 uppercase tracking-wide">
            Recommended action
          </p>
          <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed mb-3">
            {recommended_action}
          </p>
          {actionButtonLabel && (
            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              <Zap className="h-3 w-3" />
              {actionButtonLabel}
            </Button>
          )}
        </div>
      )}

      {/* ---- Signal history timeline ---- */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Signal history
          </p>
          <div className="space-y-0">
            {history.map((entry, i) => {
              let timeAgo: string | null = null;
              try {
                timeAgo = formatDistanceToNow(new Date(entry.date), { addSuffix: true });
              } catch {
                timeAgo = entry.date;
              }
              const isLast = i === history.length - 1;
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100 dark:bg-gray-800">
                      <Clock className="h-3 w-3 text-slate-400 dark:text-gray-500" />
                    </div>
                    {!isLast && (
                      <div className="w-px flex-1 min-h-[20px] mt-1 mb-1 bg-slate-200 dark:bg-gray-700" />
                    )}
                  </div>
                  <div className="flex-1 pb-3">
                    <p className="text-sm text-slate-600 dark:text-gray-300">{entry.event}</p>
                    {timeAgo && (
                      <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{timeAgo}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

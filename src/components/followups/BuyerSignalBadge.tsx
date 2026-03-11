/**
 * BuyerSignalBadge — Compact confidence badge for follow-up drafts
 *
 * Shows a colour-coded score badge (green/amber/red).
 * On click: Popover with warnings and suggestions.
 */

import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Lightbulb,
  Loader2,
} from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useBuyerSignals, type BuyerSignalResult, type SignalLevel } from '@/lib/hooks/useBuyerSignals';
import type { FollowUpDraft } from '@/lib/hooks/useFollowUpDrafts';

// ============================================================================
// Style maps
// ============================================================================

const LEVEL_STYLES: Record<SignalLevel, { bg: string; text: string; border: string }> = {
  high: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/20',
  },
  medium: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/20',
  },
  low: {
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/20',
  },
};

const LEVEL_ICON: Record<SignalLevel, React.ElementType> = {
  high: TrendingUp,
  medium: Minus,
  low: TrendingDown,
};

const LEVEL_LABEL: Record<SignalLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

// ============================================================================
// Subcomponents
// ============================================================================

function SignalDetails({ signal }: { signal: BuyerSignalResult }) {
  return (
    <div className="space-y-3">
      {/* Score header */}
      <div className="flex items-center gap-2">
        {(() => {
          const Icon = LEVEL_ICON[signal.level];
          const styles = LEVEL_STYLES[signal.level];
          return (
            <>
              <Icon className={cn('w-4 h-4', styles.text)} />
              <span className={cn('text-sm font-semibold', styles.text)}>
                {signal.score}/100
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {LEVEL_LABEL[signal.level]}
              </span>
            </>
          );
        })()}
      </div>

      {/* Warnings */}
      {signal.warnings.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Warnings
          </p>
          <ul className="space-y-1">
            {signal.warnings.map((w, i) => (
              <li
                key={i}
                className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-1.5"
              >
                <span className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {signal.suggestions.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            Suggestions
          </p>
          <ul className="space-y-1">
            {signal.suggestions.map((s, i) => (
              <li
                key={i}
                className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-1.5"
              >
                <span className="w-1 h-1 rounded-full bg-[#37bd7e] mt-1.5 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No data state */}
      {signal.warnings.length === 0 && signal.suggestions.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Good to send - no issues detected
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface BuyerSignalBadgeProps {
  draft: FollowUpDraft;
  className?: string;
}

export function BuyerSignalBadge({ draft, className }: BuyerSignalBadgeProps) {
  const { signal, isLoading } = useBuyerSignals(draft);

  if (isLoading) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border bg-gray-500/10 text-gray-400 border-gray-500/20',
          className
        )}
      >
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
      </span>
    );
  }

  if (!signal) {
    return null;
  }

  const styles = LEVEL_STYLES[signal.level];
  const Icon = LEVEL_ICON[signal.level];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer transition-colors hover:opacity-80',
            styles.bg,
            styles.text,
            styles.border,
            className
          )}
          title={`Buyer Signal: ${signal.score}/100`}
        >
          <Icon className="w-2.5 h-2.5" />
          {signal.score}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <SignalDetails signal={signal} />
      </PopoverContent>
    </Popover>
  );
}

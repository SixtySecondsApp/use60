/**
 * Command Centre Empty States
 *
 * Contextual empty states for the CC feed. Shows different content based
 * on whether this is first load, a filtered view with no matches, or
 * the user has processed all pending items.
 */

import { Calendar, CheckCircle2, Inbox, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type EmptyVariant = 'first-load' | 'no-matches' | 'all-caught-up';

interface CCEmptyStateProps {
  variant: EmptyVariant;
  /** The current filter label (e.g. 'deals', 'signals') — used in no-matches */
  filterLabel?: string;
  /** Number of actions the copilot handled today — used in all-caught-up */
  actionsToday?: number;
  /** Navigation callbacks for setup CTAs */
  onConnectCalendar?: () => void;
  onSetupHubspot?: () => void;
}

export function CCEmptyState({
  variant,
  filterLabel,
  actionsToday = 0,
  onConnectCalendar,
  onSetupHubspot,
}: CCEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      {variant === 'first-load' && (
        <>
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <Inbox className="h-7 w-7 text-slate-300 dark:text-gray-600" />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">
            Your copilot is warming up
          </p>
          <p className="text-xs text-slate-400 dark:text-gray-500 max-w-xs mb-6">
            Once your agents start processing meetings, updating your CRM, and monitoring your pipeline, activity will appear here.
          </p>
          <div className="flex items-center gap-3">
            {onConnectCalendar && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onConnectCalendar}>
                <Calendar className="h-3.5 w-3.5" />
                Connect your calendar
              </Button>
            )}
            {onSetupHubspot && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onSetupHubspot}>
                <Link2 className="h-3.5 w-3.5" />
                Set up HubSpot
              </Button>
            )}
          </div>
        </>
      )}

      {variant === 'no-matches' && (
        <>
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-7 w-7 text-emerald-300 dark:text-emerald-700" />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">
            All clear
          </p>
          <p className="text-xs text-slate-400 dark:text-gray-500 max-w-xs">
            No {filterLabel ?? 'items'} need your attention right now. Your copilot is handling things.
          </p>
        </>
      )}

      {variant === 'all-caught-up' && (
        <>
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-7 w-7 text-emerald-400 dark:text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-gray-200 mb-1">
            All caught up
          </p>
          <p className="text-xs text-slate-400 dark:text-gray-500 max-w-xs">
            No items need your review.{actionsToday > 0 && ` Your copilot handled ${actionsToday} action${actionsToday === 1 ? '' : 's'} today.`}
          </p>
        </>
      )}
    </div>
  );
}

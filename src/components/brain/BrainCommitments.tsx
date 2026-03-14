/**
 * BrainCommitments — Commitments tracker tab (TRINITY-013)
 *
 * Groups commitment events into 4 sections:
 *   1. Overdue (red) — pending commitments past their deadline
 *   2. Due This Week (amber) — pending commitments due within the current week
 *   3. Upcoming (default) — pending commitments with a future deadline or no deadline
 *   4. Fulfilled (green, collapsed by default) — commitment_fulfilled and commitment_broken events
 *
 * Since deal_memory_events doesn't have an explicit due_date field, deadline info
 * is extracted from the `detail` JSONB where available (detail.deadline).
 */

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  XCircle,
  Briefcase,
  User,
} from 'lucide-react';
import { isThisWeek, isPast, formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useCommitmentsQuery, type CommitmentWithDeal } from '@/lib/hooks/useCommitments';
import { cn } from '@/lib/utils';

// ============================================================================
// Types for grouping
// ============================================================================

type CommitmentStatus = 'pending' | 'fulfilled' | 'broken';

interface GroupedCommitments {
  overdue: CommitmentWithDeal[];
  dueThisWeek: CommitmentWithDeal[];
  upcoming: CommitmentWithDeal[];
  resolved: CommitmentWithDeal[]; // fulfilled + broken
}

// ============================================================================
// Helpers
// ============================================================================

function getDeadline(event: CommitmentWithDeal): Date | null {
  const deadline = event.detail?.deadline;
  if (!deadline || typeof deadline !== 'string') return null;
  const d = new Date(deadline);
  return isNaN(d.getTime()) ? null : d;
}

function getStatus(event: CommitmentWithDeal): CommitmentStatus {
  // commitment_fulfilled or commitment_broken events
  if (event.event_type === 'commitment_fulfilled') return 'fulfilled';
  if (event.event_type === 'commitment_broken') return 'broken';

  // For commitment_made events, check detail.status
  const detailStatus = event.detail?.status;
  if (detailStatus === 'fulfilled') return 'fulfilled';
  if (detailStatus === 'broken') return 'broken';

  return 'pending';
}

function getOwnerLabel(event: CommitmentWithDeal): string | null {
  const owner = event.detail?.owner;
  if (owner === 'rep') return 'You';
  if (owner === 'prospect') return 'Prospect';
  return null;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function groupCommitments(events: CommitmentWithDeal[]): GroupedCommitments {
  const result: GroupedCommitments = {
    overdue: [],
    dueThisWeek: [],
    upcoming: [],
    resolved: [],
  };

  const now = new Date();

  for (const event of events) {
    const status = getStatus(event);

    // Resolved events go to the resolved section
    if (status === 'fulfilled' || status === 'broken') {
      result.resolved.push(event);
      continue;
    }

    // Only commitment_made with pending status from here
    if (event.event_type !== 'commitment_made') continue;

    const deadline = getDeadline(event);

    if (deadline) {
      if (isPast(deadline)) {
        result.overdue.push(event);
      } else if (isThisWeek(deadline, { weekStartsOn: 1 })) {
        result.dueThisWeek.push(event);
      } else {
        result.upcoming.push(event);
      }
    } else {
      // No deadline — put in upcoming
      result.upcoming.push(event);
    }
  }

  return result;
}

// ============================================================================
// Status badge
// ============================================================================

function StatusBadge({ status }: { status: CommitmentStatus }) {
  switch (status) {
    case 'fulfilled':
      return (
        <Badge className="gap-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20">
          <CheckCircle2 className="h-3 w-3" />
          Fulfilled
        </Badge>
      );
    case 'broken':
      return (
        <Badge className="gap-1 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20">
          <XCircle className="h-3 w-3" />
          Broken
        </Badge>
      );
    default:
      return (
        <Badge className="gap-1 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
  }
}

// ============================================================================
// Commitment card
// ============================================================================

function CommitmentCard({ event }: { event: CommitmentWithDeal }) {
  const status = getStatus(event);
  const deadline = getDeadline(event);
  const owner = getOwnerLabel(event);

  const isOverdue = status === 'pending' && deadline && isPast(deadline);

  return (
    <Card
      className={cn(
        'p-4 space-y-2',
        isOverdue
          ? 'border-red-300 dark:border-red-500/40 ring-1 ring-red-200 dark:ring-red-500/20'
          : status === 'fulfilled'
            ? 'border-emerald-200 dark:border-emerald-500/30'
            : status === 'broken'
              ? 'border-red-200 dark:border-red-500/30'
              : 'border-slate-200 dark:border-gray-700/50'
      )}
    >
      {/* Top row: status + deal + confidence */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />

        <Badge variant="secondary" className="gap-1">
          <Briefcase className="h-3 w-3" />
          <span className="truncate max-w-[200px]">{event.deal_name}</span>
        </Badge>

        {owner && (
          <Badge variant="outline" className="gap-1">
            <User className="h-3 w-3" />
            {owner}
          </Badge>
        )}

        <span className="text-xs text-slate-400 dark:text-gray-500 ml-auto flex items-center gap-1.5">
          <span
            className={cn(
              'inline-block w-1.5 h-1.5 rounded-full',
              event.confidence >= 0.8
                ? 'bg-emerald-400'
                : event.confidence >= 0.5
                  ? 'bg-yellow-400'
                  : 'bg-red-400'
            )}
          />
          {Math.round(event.confidence * 100)}%
        </span>
      </div>

      {/* Summary */}
      <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed">
        {event.summary}
      </p>

      {/* Deal company */}
      {event.deal_company && (
        <p className="text-xs text-slate-400 dark:text-gray-500">
          {event.deal_company}
        </p>
      )}

      {/* Contact IDs */}
      {event.contact_ids && event.contact_ids.length > 0 && (
        <p className="text-xs text-slate-400 dark:text-gray-500">
          Contacts: {event.contact_ids.length}
        </p>
      )}

      {/* Bottom row: deadline + source timestamp */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 dark:text-gray-500">
        {deadline ? (
          <span
            className={cn(
              'inline-flex items-center gap-1',
              isOverdue ? 'text-red-500 dark:text-red-400 font-medium' : ''
            )}
          >
            <AlertTriangle className={cn('h-3 w-3', isOverdue ? '' : 'hidden')} />
            <Calendar className={cn('h-3 w-3', isOverdue ? 'hidden' : '')} />
            {isOverdue
              ? `Overdue by ${formatDistanceToNow(deadline)}`
              : `Due ${formatDistanceToNow(deadline, { addSuffix: true })}`}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-slate-300 dark:text-gray-600">
            <Calendar className="h-3 w-3" />
            No deadline
          </span>
        )}

        <span className="inline-flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {formatTimestamp(event.source_timestamp)}
        </span>
      </div>

      {/* Verbatim quote */}
      {event.verbatim_quote && (
        <div className="mt-1 pl-3 border-l-2 border-slate-200 dark:border-gray-700">
          <p className="text-xs italic text-slate-500 dark:text-gray-400 leading-relaxed">
            &ldquo;{event.verbatim_quote}&rdquo;
          </p>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// Section component
// ============================================================================

interface SectionProps {
  title: string;
  icon: React.ElementType;
  events: CommitmentWithDeal[];
  iconClassName?: string;
  titleClassName?: string;
  countClassName?: string;
  defaultOpen?: boolean;
}

function CommitmentSection({
  title,
  icon: Icon,
  events,
  iconClassName,
  titleClassName,
  countClassName,
  defaultOpen = true,
}: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (events.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 group">
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-slate-400 dark:text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 dark:text-gray-500" />
        )}
        <Icon className={cn('h-4 w-4', iconClassName ?? 'text-slate-500 dark:text-gray-400')} />
        <h3 className={cn('text-sm font-medium', titleClassName ?? 'text-slate-700 dark:text-gray-200')}>
          {title}
        </h3>
        <span className={cn('text-xs', countClassName ?? 'text-slate-400 dark:text-gray-500')}>
          ({events.length})
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 pt-2 pb-4">
          {events.map((event) => (
            <CommitmentCard key={event.id} event={event} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Loading + Empty states
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-6 pt-4">
      {[1, 2, 3].map((g) => (
        <div key={g}>
          <Skeleton className="h-5 w-32 mb-3" />
          <div className="space-y-3">
            {[1, 2].map((c) => (
              <Skeleton key={c} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800/50 flex items-center justify-center mb-4">
        <Brain className="h-7 w-7 text-slate-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
        No commitments tracked yet
      </p>
      <p className="text-xs text-slate-400 dark:text-gray-500 max-w-xs text-center">
        Commitments are extracted automatically from meeting transcripts and emails.
        They will appear here once your deals have active commitments.
      </p>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function BrainCommitments() {
  const { data: events = [], isLoading, isFetching } = useCommitmentsQuery();

  const grouped = useMemo(() => groupCommitments(events), [events]);

  const hasAny =
    grouped.overdue.length +
    grouped.dueThisWeek.length +
    grouped.upcoming.length +
    grouped.resolved.length > 0;

  if (isLoading) return <LoadingSkeleton />;

  if (!hasAny) return <EmptyState />;

  return (
    <div className="space-y-2 pt-2">
      {/* Fetching indicator */}
      {isFetching && !isLoading && (
        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-gray-500 pb-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Refreshing commitments...
        </div>
      )}

      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-gray-400 pb-2 border-b border-slate-100 dark:border-gray-800/60">
        {grouped.overdue.length > 0 && (
          <span className="text-red-600 dark:text-red-400 font-medium">
            {grouped.overdue.length} overdue
          </span>
        )}
        {grouped.dueThisWeek.length > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {grouped.dueThisWeek.length} due this week
          </span>
        )}
        {grouped.upcoming.length > 0 && (
          <span>{grouped.upcoming.length} upcoming</span>
        )}
        {grouped.resolved.length > 0 && (
          <span className="text-emerald-600 dark:text-emerald-400">
            {grouped.resolved.length} resolved
          </span>
        )}
      </div>

      {/* Sections */}
      <CommitmentSection
        title="Overdue"
        icon={AlertTriangle}
        events={grouped.overdue}
        iconClassName="text-red-500 dark:text-red-400"
        titleClassName="text-red-700 dark:text-red-400"
        countClassName="text-red-500 dark:text-red-400"
      />

      <CommitmentSection
        title="Due This Week"
        icon={Clock}
        events={grouped.dueThisWeek}
        iconClassName="text-amber-500 dark:text-amber-400"
        titleClassName="text-amber-700 dark:text-amber-400"
        countClassName="text-amber-500 dark:text-amber-400"
      />

      <CommitmentSection
        title="Upcoming"
        icon={Calendar}
        events={grouped.upcoming}
      />

      <CommitmentSection
        title="Resolved"
        icon={CheckCircle2}
        events={grouped.resolved}
        iconClassName="text-emerald-500 dark:text-emerald-400"
        titleClassName="text-emerald-700 dark:text-emerald-400"
        countClassName="text-emerald-500 dark:text-emerald-400"
        defaultOpen={false}
      />
    </div>
  );
}

/**
 * BrainDealMemory — Deal Memory viewer (TRINITY-006)
 *
 * Displays a timeline of deal_memory_events grouped by event_category.
 * Includes a deal selector dropdown and commitment timeline highlighting.
 */

import { useState, useMemo } from 'react';
import {
  Brain,
  Calendar,
  FileText,
  Mail,
  Database,
  Cpu,
  PenLine,
  Quote,
  Briefcase,
  Shield,
  TrendingUp,
  Users,
  HeartPulse,
  Swords,
  Clock,
  DollarSign,
  Loader2,
} from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDealMemoryEventsQuery,
  useDealMemoryDealsQuery,
  type DealMemoryEvent,
} from '@/lib/hooks/useDealMemoryEvents';
import { cn } from '@/lib/utils';

// ============================================================================
// Category config — colors + icons
// ============================================================================

const CATEGORY_CONFIG: Record<
  string,
  { label: string; className: string; icon: React.ElementType }
> = {
  commitment: {
    label: 'Commitment',
    className:
      'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
    icon: Briefcase,
  },
  objection: {
    label: 'Objection',
    className:
      'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20',
    icon: Shield,
  },
  signal: {
    label: 'Signal',
    className:
      'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
    icon: TrendingUp,
  },
  stakeholder: {
    label: 'Stakeholder',
    className:
      'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20',
    icon: Users,
  },
  sentiment: {
    label: 'Sentiment',
    className:
      'bg-pink-50 dark:bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-500/20',
    icon: HeartPulse,
  },
  competitive: {
    label: 'Competitive',
    className:
      'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20',
    icon: Swords,
  },
  timeline: {
    label: 'Timeline',
    className:
      'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-500/20',
    icon: Clock,
  },
  commercial: {
    label: 'Commercial',
    className:
      'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
    icon: DollarSign,
  },
};

const DEFAULT_CATEGORY_CONFIG = {
  label: 'Other',
  className:
    'bg-slate-50 dark:bg-gray-500/10 text-slate-700 dark:text-gray-400 border-slate-200 dark:border-gray-500/20',
  icon: FileText,
};

// ============================================================================
// Source type badge config
// ============================================================================

const SOURCE_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  transcript: { label: 'Transcript', icon: FileText },
  email: { label: 'Email', icon: Mail },
  crm_update: { label: 'CRM Update', icon: Database },
  agent_inference: { label: 'AI Inference', icon: Cpu },
  manual: { label: 'Manual', icon: PenLine },
};

// ============================================================================
// Helpers
// ============================================================================

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isCommitmentEvent(event: DealMemoryEvent): boolean {
  return event.event_type.includes('commitment') || event.event_category === 'commitment';
}

function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] ?? DEFAULT_CATEGORY_CONFIG;
}

function getSourceConfig(sourceType: string) {
  return SOURCE_TYPE_CONFIG[sourceType] ?? { label: sourceType, icon: FileText };
}

// ============================================================================
// Sub-components
// ============================================================================

function EventCard({ event }: { event: DealMemoryEvent }) {
  const cat = getCategoryConfig(event.event_category);
  const src = getSourceConfig(event.source_type);
  const CatIcon = cat.icon;
  const SrcIcon = src.icon;
  const commitment = isCommitmentEvent(event);

  return (
    <div
      className={cn(
        'rounded-lg border p-4 bg-white dark:bg-gray-900/60',
        commitment
          ? 'border-amber-300 dark:border-amber-500/40 ring-1 ring-amber-200 dark:ring-amber-500/20'
          : 'border-slate-200 dark:border-gray-700/50'
      )}
    >
      {/* Top row: category badge + source badge + confidence + date */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Badge className={cn('gap-1', cat.className)}>
          <CatIcon className="h-3 w-3" />
          {cat.label}
        </Badge>

        <Badge variant="secondary" className="gap-1">
          <SrcIcon className="h-3 w-3" />
          {src.label}
        </Badge>

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

        <span className="text-xs text-slate-400 dark:text-gray-500 flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatTimestamp(event.source_timestamp)}
        </span>
      </div>

      {/* Summary */}
      <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed">
        {event.summary}
      </p>

      {/* Verbatim quote */}
      {event.verbatim_quote && (
        <div className="mt-2 flex items-start gap-2 pl-3 border-l-2 border-slate-200 dark:border-gray-700">
          <Quote className="h-3.5 w-3.5 text-slate-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs italic text-slate-500 dark:text-gray-400 leading-relaxed">
            {event.verbatim_quote}
          </p>
        </div>
      )}

      {/* Speaker */}
      {event.speaker && (
        <p className="mt-2 text-xs text-slate-400 dark:text-gray-500">
          Speaker: {event.speaker}
        </p>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 pt-4">
      {[1, 2, 3].map((g) => (
        <div key={g}>
          <Skeleton className="h-5 w-28 mb-3" />
          <div className="space-y-3">
            {[1, 2].map((c) => (
              <Skeleton key={c} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message, subtitle }: { message: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800/50 flex items-center justify-center mb-4">
        <Brain className="h-7 w-7 text-slate-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">{message}</p>
      <p className="text-xs text-slate-400 dark:text-gray-500">{subtitle}</p>
    </div>
  );
}

// ============================================================================
// Category group section
// ============================================================================

function CategoryGroup({
  category,
  events,
}: {
  category: string;
  events: DealMemoryEvent[];
}) {
  const config = getCategoryConfig(category);
  const Icon = config.icon;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-slate-500 dark:text-gray-400" />
        <h3 className="text-sm font-medium text-slate-700 dark:text-gray-200">
          {config.label}
        </h3>
        <span className="text-xs text-slate-400 dark:text-gray-500">
          ({events.length})
        </span>
      </div>
      <div className="space-y-3">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function BrainDealMemory() {
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  // Queries
  const { data: deals = [], isLoading: dealsLoading } = useDealMemoryDealsQuery();
  const {
    data: events = [],
    isLoading: eventsLoading,
    isFetching: eventsFetching,
  } = useDealMemoryEventsQuery(selectedDealId);

  // Group events by category, preserving chronological order within each group
  const groupedEvents = useMemo(() => {
    if (!events.length) return [];

    const groups: Record<string, DealMemoryEvent[]> = {};
    for (const event of events) {
      const cat = event.event_category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(event);
    }

    // Order categories: commitment first, then by count descending
    const categoryOrder = Object.keys(CATEGORY_CONFIG);
    return Object.entries(groups).sort(([a], [b]) => {
      const ai = categoryOrder.indexOf(a);
      const bi = categoryOrder.indexOf(b);
      // Known categories sorted by defined order; unknown categories at the end
      const aIdx = ai === -1 ? 999 : ai;
      const bIdx = bi === -1 ? 999 : bi;
      return aIdx - bIdx;
    });
  }, [events]);

  // ---- No deal selected ----
  if (!selectedDealId && !dealsLoading) {
    return (
      <div>
        <DealSelector
          deals={deals}
          selectedDealId={selectedDealId}
          onSelect={setSelectedDealId}
          loading={dealsLoading}
        />
        <EmptyState
          message="Select a deal"
          subtitle="Choose a deal above to view its memory timeline"
        />
      </div>
    );
  }

  return (
    <div>
      <DealSelector
        deals={deals}
        selectedDealId={selectedDealId}
        onSelect={setSelectedDealId}
        loading={dealsLoading}
      />

      {/* Loading state */}
      {(eventsLoading || dealsLoading) && <LoadingSkeleton />}

      {/* Fetching indicator (re-fetch after deal switch) */}
      {eventsFetching && !eventsLoading && (
        <div className="flex items-center gap-2 pt-4 text-xs text-slate-400 dark:text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Refreshing events...
        </div>
      )}

      {/* No events for this deal */}
      {!eventsLoading && !eventsFetching && selectedDealId && events.length === 0 && (
        <EmptyState
          message="No memory events"
          subtitle="No events have been extracted for this deal yet"
        />
      )}

      {/* Grouped events timeline */}
      {!eventsLoading && events.length > 0 && (
        <div className="space-y-6 pt-4">
          {groupedEvents.map(([category, catEvents]) => (
            <CategoryGroup
              key={category}
              category={category}
              events={catEvents}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Deal selector
// ============================================================================

function DealSelector({
  deals,
  selectedDealId,
  onSelect,
  loading,
}: {
  deals: { id: string; name: string; company: string; stage_name: string | null; stage_color: string | null }[];
  selectedDealId: string | null;
  onSelect: (id: string | null) => void;
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-10 w-full max-w-sm" />;
  }

  return (
    <div className="max-w-sm">
      <Select
        value={selectedDealId ?? ''}
        onValueChange={(value) => onSelect(value || null)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a deal..." />
        </SelectTrigger>
        <SelectContent>
          {deals.map((deal) => (
            <SelectItem key={deal.id} value={deal.id}>
              <span className="flex items-center gap-2">
                {deal.stage_color && (
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: deal.stage_color }}
                  />
                )}
                <span className="truncate">
                  {deal.name}
                  {deal.company ? ` - ${deal.company}` : ''}
                </span>
                {deal.stage_name && (
                  <span className="text-xs text-slate-400 dark:text-gray-500 ml-1">
                    {deal.stage_name}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
          {deals.length === 0 && (
            <div className="py-3 px-4 text-sm text-slate-400 dark:text-gray-500 text-center">
              No deals found
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * AutonomyTimeline — AE2-009 (Audit Trail Viewer)
 *
 * Vertical timeline of all autonomy tier changes with explanations.
 * Sources events from both autonomy_audit_log (System A) and
 * autopilot_events (System B) via useAutonomyAuditTrail hook.
 *
 * Features:
 *   - Filters: action type, event type, date range
 *   - Color-coded event cards: green=promotion, red=demotion, blue=manual, amber=escalation
 *   - Old tier -> new tier badge display with trigger reason
 *   - Evidence / metadata expandable
 *   - "Load more" pagination (50 at a time)
 */

import { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wrench,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Loader2,
  ChevronDown,
  Filter,
  Calendar,
  ArrowRight,
  History,
  Info,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  useAutonomyAuditTrail,
  type AuditTrailEvent,
  type AuditEventType,
  type AuditTrailFilters,
} from '@/lib/hooks/useAutonomyAuditTrail';

// ============================================================================
// Constants
// ============================================================================

const PAGE_SIZE = 50;

const EVENT_TYPE_OPTIONS: { value: AuditEventType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Events' },
  { value: 'promotion', label: 'Promotions' },
  { value: 'demotion', label: 'Demotions' },
  { value: 'manual_change', label: 'Manual Changes' },
  { value: 'context_escalation', label: 'Context Escalations' },
  { value: 'cooldown_start', label: 'Cooldown Start' },
  { value: 'cooldown_end', label: 'Cooldown End' },
];

const ACTION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Actions' },
  { value: 'crm_stage_change', label: 'CRM Stage Change' },
  { value: 'crm_field_update', label: 'CRM Field Update' },
  { value: 'crm_contact_create', label: 'Create CRM Contact' },
  { value: 'send_email', label: 'Send Email' },
  { value: 'send_slack', label: 'Send Slack Message' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'enrich_contact', label: 'Enrich Contact' },
  { value: 'draft_proposal', label: 'Draft Proposal' },
];

const TIER_LABELS: Record<string, string> = {
  auto: 'Auto',
  approve: 'Approval',
  suggest: 'Suggest',
  disabled: 'Disabled',
};

// ============================================================================
// Event type styling
// ============================================================================

interface EventStyleConfig {
  icon: React.ElementType;
  dotColor: string;
  lineColor: string;
  badgeVariant: 'success' | 'destructive' | 'default' | 'warning' | 'secondary';
  label: string;
}

function getEventStyle(eventType: AuditEventType): EventStyleConfig {
  switch (eventType) {
    case 'promotion':
      return {
        icon: TrendingUp,
        dotColor: 'bg-emerald-500 dark:bg-emerald-400',
        lineColor: 'border-emerald-200 dark:border-emerald-800/40',
        badgeVariant: 'success',
        label: 'Promotion',
      };
    case 'demotion':
      return {
        icon: TrendingDown,
        dotColor: 'bg-red-500 dark:bg-red-400',
        lineColor: 'border-red-200 dark:border-red-800/40',
        badgeVariant: 'destructive',
        label: 'Demotion',
      };
    case 'manual_change':
      return {
        icon: Wrench,
        dotColor: 'bg-blue-500 dark:bg-blue-400',
        lineColor: 'border-blue-200 dark:border-blue-800/40',
        badgeVariant: 'default',
        label: 'Manual Change',
      };
    case 'context_escalation':
      return {
        icon: AlertTriangle,
        dotColor: 'bg-amber-500 dark:bg-amber-400',
        lineColor: 'border-amber-200 dark:border-amber-800/40',
        badgeVariant: 'warning',
        label: 'Context Escalation',
      };
    case 'cooldown_start':
      return {
        icon: Clock,
        dotColor: 'bg-orange-500 dark:bg-orange-400',
        lineColor: 'border-orange-200 dark:border-orange-800/40',
        badgeVariant: 'warning',
        label: 'Cooldown Start',
      };
    case 'cooldown_end':
      return {
        icon: CheckCircle2,
        dotColor: 'bg-teal-500 dark:bg-teal-400',
        lineColor: 'border-teal-200 dark:border-teal-800/40',
        badgeVariant: 'success',
        label: 'Cooldown End',
      };
    default:
      return {
        icon: Info,
        dotColor: 'bg-gray-400 dark:bg-gray-500',
        lineColor: 'border-gray-200 dark:border-gray-700',
        badgeVariant: 'secondary',
        label: 'Event',
      };
  }
}

// ============================================================================
// Formatting helpers
// ============================================================================

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatTimestamp(isoString);
}

function formatActionType(key: string): string {
  const found = ACTION_TYPE_OPTIONS.find((o) => o.value === key);
  if (found) return found.label;
  return key.replace(/_/g, ' ').replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTier(tier: string | null): string {
  if (!tier) return '---';
  return TIER_LABELS[tier] ?? tier;
}

// ============================================================================
// Sub-components
// ============================================================================

function TierTransitionBadge({ oldTier, newTier }: { oldTier: string | null; newTier: string | null }) {
  if (!oldTier && !newTier) return null;

  return (
    <div className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          'px-1.5 py-0.5 rounded font-medium',
          tierBgClass(oldTier),
        )}
      >
        {formatTier(oldTier)}
      </span>
      <ArrowRight className="h-3 w-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
      <span
        className={cn(
          'px-1.5 py-0.5 rounded font-medium',
          tierBgClass(newTier),
        )}
      >
        {formatTier(newTier)}
      </span>
    </div>
  );
}

function tierBgClass(tier: string | null): string {
  switch (tier) {
    case 'auto':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'approve':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'suggest':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'disabled':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

function EvidenceSection({ evidence }: { evidence: Record<string, unknown> }) {
  const [isOpen, setIsOpen] = useState(false);

  // Filter out internal keys that are already shown elsewhere
  const displayEntries = Object.entries(evidence).filter(
    ([key]) => !['from_tier', 'to_tier', 'reason'].includes(key),
  );

  if (displayEntries.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mt-1"
        >
          <Info className="h-3 w-3" />
          <span>{isOpen ? 'Hide' : 'Show'} details</span>
          <ChevronDown
            className={cn(
              'h-3 w-3 transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-md bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 p-2 text-[11px] font-mono text-gray-600 dark:text-gray-400 space-y-0.5 overflow-x-auto">
          {displayEntries.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">{key}:</span>
              <span className="text-gray-700 dark:text-gray-300 break-all">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TimelineEvent({
  event,
  isLast,
}: {
  event: AuditTrailEvent;
  isLast: boolean;
}) {
  const style = getEventStyle(event.event_type);
  const Icon = style.icon;

  return (
    <div className="relative flex gap-3">
      {/* Vertical line + dot */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0',
            style.dotColor,
            'ring-4 ring-white dark:ring-gray-900',
          )}
        >
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 min-h-[24px]" />
        )}
      </div>

      {/* Event card */}
      <div className={cn('flex-1 pb-6', isLast && 'pb-0')}>
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-3">
          {/* Header row: badge + timestamp */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <Badge variant={style.badgeVariant} className="text-xs">
                {style.label}
              </Badge>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatActionType(event.action_type)}
              </span>
            </div>
            <span
              className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0"
              title={formatTimestamp(event.created_at)}
            >
              {formatRelativeTime(event.created_at)}
            </span>
          </div>

          {/* Tier transition */}
          {(event.old_tier || event.new_tier) && (
            <div className="mb-1.5">
              <TierTransitionBadge oldTier={event.old_tier} newTier={event.new_tier} />
            </div>
          )}

          {/* Trigger reason */}
          {event.trigger_reason && (
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              {event.trigger_reason}
            </p>
          )}

          {/* Source indicator */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-gray-400 dark:text-gray-600 font-medium uppercase tracking-wide">
              {event.source === 'system_a' ? 'Org Policy' : 'User Signal'}
            </span>
            {event.initiated_by && (
              <span className="text-[10px] text-gray-400 dark:text-gray-600">
                by {event.initiated_by.slice(0, 8)}...
              </span>
            )}
          </div>

          {/* Expandable evidence */}
          {event.evidence && Object.keys(event.evidence).length > 0 && (
            <EvidenceSection evidence={event.evidence} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function AutonomyTimeline() {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [filters, setFilters] = useState<AuditTrailFilters>({});

  const { data: events, isLoading, isError } = useAutonomyAuditTrail(limit, filters);

  // Derive if there might be more events
  const hasMore = useMemo(() => {
    if (!events) return false;
    return events.length >= limit;
  }, [events, limit]);

  const handleLoadMore = () => {
    setLimit((prev) => prev + PAGE_SIZE);
  };

  const handleEventTypeChange = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      eventType: value as AuditEventType | 'all',
    }));
    setLimit(PAGE_SIZE); // Reset pagination on filter change
  };

  const handleActionTypeChange = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      actionType: value,
    }));
    setLimit(PAGE_SIZE);
  };

  return (
    <Card className="border-gray-200 dark:border-gray-800">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-gray-500" />
          <CardTitle className="text-sm font-semibold">Audit Trail</CardTitle>
          {events && events.length > 0 && (
            <Badge variant="secondary" className="text-xs ml-auto">
              {events.length} event{events.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          Complete history of autonomy tier changes, promotions, demotions, and escalations
          across your organization.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Filter className="h-3.5 w-3.5" />
            <span>Filter:</span>
          </div>

          <Select
            value={filters.eventType ?? 'all'}
            onValueChange={handleEventTypeChange}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Event Type" />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.actionType ?? 'all'}
            onValueChange={handleActionTypeChange}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Action Type" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range inputs */}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            <input
              type="date"
              className="h-8 px-2 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-700 dark:text-gray-300"
              value={filters.dateFrom?.slice(0, 10) ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                setFilters((prev) => ({
                  ...prev,
                  dateFrom: value ? `${value}T00:00:00.000Z` : undefined,
                }));
                setLimit(PAGE_SIZE);
              }}
              aria-label="From date"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              className="h-8 px-2 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-700 dark:text-gray-300"
              value={filters.dateTo?.slice(0, 10) ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                setFilters((prev) => ({
                  ...prev,
                  dateTo: value ? `${value}T23:59:59.999Z` : undefined,
                }));
                setLimit(PAGE_SIZE);
              }}
              aria-label="To date"
            />
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              Loading audit trail...
            </span>
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-red-500 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            Failed to load audit trail. Please try again.
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && events && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <History className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              No audit events found
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Autonomy tier changes will appear here as they occur.
            </p>
          </div>
        )}

        {/* Timeline */}
        {!isLoading && events && events.length > 0 && (
          <div className="pl-1">
            {events.map((event, index) => (
              <TimelineEvent
                key={event.id}
                event={event}
                isLast={index === events.length - 1}
              />
            ))}
          </div>
        )}

        {/* Load More */}
        {!isLoading && hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              className="text-xs"
            >
              <ChevronDown className="h-3.5 w-3.5 mr-1.5" />
              Load More Events
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

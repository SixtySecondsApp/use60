/**
 * MeetingContextSidebar — FU-001 (sub-component)
 *
 * Right sidebar in FollowUpDraftsPage. Shows meeting context when a draft
 * has an associated meeting_id, helping reps review before approving a follow-up.
 *
 * Sections:
 *  - Meeting title + date
 *  - Attendees (names/emails)
 *  - Summary / key topics
 *  - Action items
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useMeetingActionItems, type MeetingActionItem } from '@/lib/hooks/useMeetingActionItems';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  ListChecks,
  Users,
  Video,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface MeetingContextSidebarProps {
  meetingId: string;
  orgId?: string;
}

interface MeetingData {
  id: string;
  title: string | null;
  meeting_start: string | null;
  meeting_end: string | null;
  duration_minutes: number | null;
  summary: string | null;
  summary_oneliner: string | null;
  next_steps_oneliner: string | null;
  sentiment_score: number | null;
  coach_rating: number | null;
  source_type: string | null;
  provider: string | null;
}

interface AttendeeData {
  id: string;
  name: string | null;
  email: string | null;
  is_external: boolean;
  role: string | null;
}

// ============================================================================
// Data hooks
// ============================================================================

function useMeetingContext(meetingId: string) {
  return useQuery({
    queryKey: ['meeting-context', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select(
          'id, title, meeting_start, meeting_end, duration_minutes, summary, summary_oneliner, next_steps_oneliner, sentiment_score, coach_rating, source_type, provider'
        )
        .eq('id', meetingId)
        .maybeSingle();

      if (error) throw error;
      return data as MeetingData | null;
    },
    enabled: !!meetingId,
    staleTime: 120_000,
  });
}

function useMeetingAttendees(meetingId: string) {
  return useQuery({
    queryKey: ['meeting-attendees', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meeting_attendees')
        .select('id, name, email, is_external, role')
        .eq('meeting_id', meetingId)
        .order('is_external', { ascending: true })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as AttendeeData[];
    },
    enabled: !!meetingId,
    staleTime: 120_000,
  });
}

// ============================================================================
// CollapsibleSection (local — compact sidebar variant)
// ============================================================================

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = true,
  count,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#37bd7e]/50"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
          {title}
          {count != null && count > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full font-bold normal-case">
              {count}
            </span>
          )}
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
        )}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// ============================================================================
// Loading skeleton
// ============================================================================

function SidebarSkeleton() {
  return (
    <div className="p-3 space-y-4">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      {/* Section skeletons */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Attendee row
// ============================================================================

function AttendeeRow({ attendee }: { attendee: AttendeeData }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div
        className={cn(
          'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0',
          attendee.is_external
            ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
        )}
      >
        {(attendee.name || attendee.email || '?').charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        {attendee.name && (
          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
            {attendee.name}
          </p>
        )}
        {attendee.email && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
            {attendee.email}
          </p>
        )}
      </div>
      {attendee.is_external && (
        <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium flex-shrink-0">
          External
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Action item row
// ============================================================================

function ActionItemRow({ item }: { item: MeetingActionItem }) {
  const isComplete = item.status === 'completed' || item.status === 'done';

  return (
    <div className="flex items-start gap-2 py-1.5">
      {isComplete ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
      ) : (
        <Circle className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-xs leading-relaxed',
            isComplete
              ? 'text-gray-400 dark:text-gray-500 line-through'
              : 'text-gray-700 dark:text-gray-300'
          )}
        >
          {item.title}
        </p>
        {item.assignee_name && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {item.assignee_name}
          </p>
        )}
      </div>
      {item.priority === 'high' && (
        <span className="text-[10px] px-1 py-0.5 bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 rounded font-medium flex-shrink-0">
          High
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Sentiment indicator
// ============================================================================

function SentimentIndicator({ score }: { score: number }) {
  let label: string;
  let colorClass: string;

  if (score >= 0.25) {
    label = 'Positive';
    colorClass = 'text-emerald-600 dark:text-emerald-400';
  } else if (score <= -0.25) {
    label = 'Challenging';
    colorClass = 'text-red-500 dark:text-red-400';
  } else {
    label = 'Neutral';
    colorClass = 'text-gray-500 dark:text-gray-400';
  }

  return (
    <span className={cn('text-xs font-medium', colorClass)}>
      {label} ({(score * 100).toFixed(0)}%)
    </span>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function MeetingContextSidebar({ meetingId }: MeetingContextSidebarProps) {
  const { data: meeting, isLoading: meetingLoading, error: meetingError } = useMeetingContext(meetingId);
  const { data: attendees, isLoading: attendeesLoading } = useMeetingAttendees(meetingId);
  const { data: actionItems, isLoading: actionItemsLoading } = useMeetingActionItems(meetingId);

  // Loading state
  if (meetingLoading) {
    return <SidebarSkeleton />;
  }

  // Error state
  if (meetingError) {
    return (
      <div className="p-4 flex flex-col items-center gap-2 text-center">
        <AlertCircle className="h-5 w-5 text-red-400" />
        <p className="text-xs text-red-400">Failed to load meeting context</p>
      </div>
    );
  }

  // No meeting found
  if (!meeting) {
    return (
      <div className="p-4 flex flex-col items-center gap-2 text-center">
        <Video className="h-5 w-5 text-gray-400" />
        <p className="text-xs text-gray-500">Meeting not found</p>
      </div>
    );
  }

  const openItems = (actionItems ?? []).filter(
    (i) => i.status !== 'completed' && i.status !== 'done'
  );
  const completedItems = (actionItems ?? []).filter(
    (i) => i.status === 'completed' || i.status === 'done'
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Video className="h-3.5 w-3.5 text-[#37bd7e] flex-shrink-0" />
          <span className="text-xs font-semibold text-[#37bd7e] uppercase tracking-wide">
            Meeting Context
          </span>
        </div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white leading-snug">
          {meeting.title || 'Untitled Meeting'}
        </h3>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          {meeting.meeting_start && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(meeting.meeting_start), 'MMM d, yyyy')}
            </span>
          )}
          {meeting.duration_minutes != null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {Math.round(meeting.duration_minutes)}m
            </span>
          )}
        </div>
        {meeting.sentiment_score != null && (
          <div className="mt-1.5">
            <SentimentIndicator score={meeting.sentiment_score} />
          </div>
        )}
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Summary / Key Topics */}
        {(meeting.summary || meeting.summary_oneliner || meeting.next_steps_oneliner) && (
          <CollapsibleSection title="Summary" icon={FileText} defaultOpen>
            <div className="space-y-2">
              {meeting.summary_oneliner && (
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                  {meeting.summary_oneliner}
                </p>
              )}
              {meeting.summary && !meeting.summary_oneliner && (
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-6">
                  {meeting.summary}
                </p>
              )}
              {meeting.summary && meeting.summary_oneliner && (
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-4">
                  {meeting.summary}
                </p>
              )}
              {meeting.next_steps_oneliner && (
                <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">
                    Next steps
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    {meeting.next_steps_oneliner}
                  </p>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Attendees */}
        <CollapsibleSection
          title="Attendees"
          icon={Users}
          defaultOpen
          count={attendees?.length}
        >
          {attendeesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          ) : !attendees || attendees.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">
              No attendees recorded
            </p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {attendees.map((a) => (
                <AttendeeRow key={a.id} attendee={a} />
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Action Items */}
        <CollapsibleSection
          title="Action Items"
          icon={ListChecks}
          defaultOpen={openItems.length > 0}
          count={actionItems?.length}
        >
          {actionItemsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-3.5 w-3.5 rounded-full" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : !actionItems || actionItems.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">
              No action items
            </p>
          ) : (
            <div className="space-y-0.5">
              {openItems.map((item) => (
                <ActionItemRow key={item.id} item={item} />
              ))}
              {completedItems.length > 0 && openItems.length > 0 && (
                <div className="pt-1.5 mt-1.5 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wide font-medium">
                    Completed
                  </p>
                </div>
              )}
              {completedItems.map((item) => (
                <ActionItemRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}

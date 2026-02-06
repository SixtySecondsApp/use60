/**
 * TestMeetingList
 *
 * Displays a list of meetings with transcript quality indicators for skill testing.
 */

import { Loader2, Video, Building2, Clock, FileText, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type TestMeeting } from '@/lib/hooks/useTestMeetings';
import { getTierColorClasses, type QualityTier } from '@/lib/utils/entityTestTypes';
import { format } from 'date-fns';

interface TestMeetingListProps {
  meetings: TestMeeting[];
  isLoading: boolean;
  selectedMeetingId: string | null;
  onSelect: (meeting: TestMeeting) => void;
  tier: QualityTier;
}

export function TestMeetingList({
  meetings,
  isLoading,
  selectedMeetingId,
  onSelect,
  tier,
}: TestMeetingListProps) {
  const tierColors = getTierColorClasses(tier);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
          Loading {tier} meetings...
        </span>
      </div>
    );
  }

  if (meetings.length === 0) {
    const emptyMessages: Record<QualityTier, string> = {
      good: 'No meetings with transcripts found. Try connecting Fathom or 60 Notetaker, or try the "Bad" tier to see meetings without transcripts.',
      average: 'No meetings with partial data found. Try the "Bad" tier to see all meetings.',
      bad: 'No meetings found in your account. Meetings are synced from calendar integrations or created when recording calls.',
    };

    return (
      <div className="text-center py-8">
        <Video className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
          {emptyMessages[tier]}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[280px] overflow-y-auto">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Select a meeting to test with ({meetings.length} found)
      </p>
      {meetings.map((meeting) => {
        const isSelected = selectedMeetingId === meeting.id;
        const displayTitle = meeting.title || 'Untitled Meeting';
        const hasTranscript = !!meeting.transcript_text;
        const hasSummary = !!meeting.summary;

        return (
          <button
            key={meeting.id}
            type="button"
            onClick={() => onSelect(meeting)}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
              'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500',
              isSelected
                ? `${tierColors.border} ${tierColors.bg}`
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800/50'
            )}
          >
            {/* Video icon with tier color */}
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                tierColors.bg, tierColors.text
              )}
            >
              <Video className="w-5 h-5" />
            </div>

            {/* Meeting info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {displayTitle}
                </span>
                {isSelected && (
                  <Check className={cn('w-4 h-4 shrink-0', tierColors.text)} />
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {meeting.meeting_start && (
                  <span>{format(new Date(meeting.meeting_start), 'MMM d, yyyy')}</span>
                )}
                {meeting.duration_minutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {Math.round(meeting.duration_minutes)}m
                  </span>
                )}
                {meeting.company_name && (
                  <span className="flex items-center gap-1 truncate max-w-[100px]">
                    <Building2 className="w-3 h-3" />
                    {meeting.company_name}
                  </span>
                )}
              </div>
            </div>

            {/* Quality indicators */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className={cn('text-xs font-semibold', tierColors.text)}>
                {meeting.qualityScore.score}/100
              </div>
              <div className="flex items-center gap-2">
                {hasTranscript && (
                  <span className="flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <FileText className="w-3 h-3" />
                  </span>
                )}
                {hasSummary && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">AI</span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

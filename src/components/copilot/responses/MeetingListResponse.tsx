import React from 'react';
import { Calendar, Clock, Users, MapPin, ExternalLink, Video, Building } from 'lucide-react';
import type { MeetingListResponseData, UnifiedMeetingInfo } from '../types';

interface MeetingListResponseProps {
  data: MeetingListResponseData;
  onActionClick?: (action: string, data?: unknown) => void;
}

export const MeetingListResponse: React.FC<MeetingListResponseProps> = ({ data, onActionClick }) => {
  const { meetings, periodLabel, totalCount, totalDurationMinutes, breakdown } = data;

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const getMeetingTypeColor = (type?: string) => {
    switch (type) {
      case 'sales':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'client':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'internal':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-500';
      case 'tentative':
        return 'bg-yellow-500';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const renderMeetingCard = (meeting: UnifiedMeetingInfo, index: number) => {
    const externalAttendees = meeting.attendees.filter(a => a.isExternal);
    const hasExternalAttendees = externalAttendees.length > 0;

    return (
      <div
        key={meeting.id}
        className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:bg-gray-800/70 transition-colors cursor-pointer"
        onClick={() => onActionClick?.('open_meeting', { meetingId: meeting.id })}
      >
        <div className="flex items-start gap-3">
          {/* Time indicator */}
          <div className="flex flex-col items-center min-w-[60px]">
            <span className="text-lg font-semibold text-white">
              {formatTime(meeting.startTime)}
            </span>
            <span className="text-xs text-gray-500">
              {formatDuration(meeting.durationMinutes)}
            </span>
          </div>

          {/* Meeting details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(meeting.status)}`} />
                <h4 className="font-semibold text-white truncate">{meeting.title}</h4>
              </div>
              {meeting.meetingType && (
                <span className={`text-xs px-2 py-0.5 rounded border ${getMeetingTypeColor(meeting.meetingType)}`}>
                  {meeting.meetingType}
                </span>
              )}
            </div>

            {/* Attendees */}
            {meeting.attendees.length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
                <Users className="w-4 h-4" />
                <span className="truncate">
                  {meeting.attendees.slice(0, 3).map(a => a.name || a.email.split('@')[0]).join(', ')}
                  {meeting.attendees.length > 3 && ` +${meeting.attendees.length - 3} more`}
                </span>
                {hasExternalAttendees && (
                  <span className="text-xs text-purple-400 flex items-center gap-1">
                    <Building className="w-3 h-3" />
                    external
                  </span>
                )}
              </div>
            )}

            {/* Location/Link */}
            <div className="mt-2 flex items-center gap-3 text-sm">
              {meeting.meetingUrl && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onActionClick?.('open_external_url', { url: meeting.meetingUrl });
                  }}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <Video className="w-4 h-4" />
                  <span>Join</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
              {meeting.location && !meeting.meetingUrl && (
                <div className="flex items-center gap-1 text-gray-400">
                  <MapPin className="w-4 h-4" />
                  <span className="truncate">{meeting.location}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header Summary */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-full">
              <Calendar className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white capitalize">
                {periodLabel}
              </h3>
              <p className="text-sm text-gray-400">
                {totalCount} meeting{totalCount !== 1 ? 's' : ''} scheduled
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-gray-400">
              <Clock className="w-4 h-4" />
              <span className="text-white font-semibold">{formatDuration(totalDurationMinutes)}</span>
            </div>
            <p className="text-xs text-gray-500">total time</p>
          </div>
        </div>

        {/* Breakdown pills */}
        {breakdown && (
          <div className="mt-3 pt-3 border-t border-gray-700 flex flex-wrap gap-2">
            {breakdown.external > 0 && (
              <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full">
                {breakdown.external} external
              </span>
            )}
            {breakdown.internal > 0 && (
              <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full">
                {breakdown.internal} internal
              </span>
            )}
            {breakdown.withDeals > 0 && (
              <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full">
                {breakdown.withDeals} with active deals
              </span>
            )}
          </div>
        )}
      </div>

      {/* Meeting List */}
      {meetings.length > 0 ? (
        <div className="space-y-3">
          {meetings.map((meeting, index) => renderMeetingCard(meeting, index))}
        </div>
      ) : (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-8 text-center">
          <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No meetings scheduled for {periodLabel}</p>
          <p className="text-sm text-gray-500 mt-1">Your calendar is clear!</p>
        </div>
      )}
    </div>
  );
};

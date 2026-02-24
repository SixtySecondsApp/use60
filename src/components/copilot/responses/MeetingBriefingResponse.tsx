import React from 'react';
import {
  Calendar,
  Clock,
  Users,
  Building,
  Briefcase,
  History,
  CheckSquare,
  AlertCircle,
  Lightbulb,
  Video,
  MapPin,
  ExternalLink,
  ChevronRight,
  Target,
} from 'lucide-react';
import type { MeetingBriefingResponseData, QuickActionResponse } from '../types';
import { formatCurrency, formatDate, formatRelativeDate, formatTime, formatDuration } from '@/lib/utils/formatters';
import { getStatusColors } from './shared';

interface MeetingBriefingResponseProps {
  data: MeetingBriefingResponseData;
  onActionClick?: (action: QuickActionResponse) => void;
}

export const MeetingBriefingResponse: React.FC<MeetingBriefingResponseProps> = ({ data, onActionClick }) => {
  const { meeting, context, actionItems, suggestions } = data;

  /** Format meeting date with Today/Tomorrow shorthand */
  const formatMeetingDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  /** Emit a canonical action */
  const emitAction = (callback: string, params?: Record<string, any>) => {
    onActionClick?.({
      id: `action-${Date.now()}`,
      label: callback,
      type: 'primary',
      callback,
      params,
    });
  };

  const getMeetingTypeColor = (type?: string) => {
    switch (type) {
      case 'sales': {
        const c = getStatusColors('on track');
        return `${c.bg} ${c.text} ${c.border}`;
      }
      case 'client': {
        const c = getStatusColors('info');
        return `${c.bg} ${c.text} ${c.border}`;
      }
      case 'internal':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: {
        const c = getStatusColors('neutral');
        return `${c.bg} ${c.text} ${c.border}`;
      }
    }
  };

  const externalAttendees = meeting.attendees.filter(a => a.isExternal);
  const internalAttendees = meeting.attendees.filter(a => !a.isExternal);

  return (
    <div className="space-y-4">
      {/* Meeting Header - Hero Section */}
      <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {meeting.meetingType && (
                <span className={`text-xs px-2 py-0.5 rounded border ${getMeetingTypeColor(meeting.meetingType)}`}>
                  {meeting.meetingType}
                </span>
              )}
              <span className="text-sm text-gray-400">{formatMeetingDate(meeting.startTime)}</span>
            </div>
            <h2 className="text-xl font-bold text-white">{meeting.title}</h2>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-gray-300">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>{formatTime(meeting.startTime)} - {formatTime(meeting.endTime)}</span>
                <span className="text-gray-500">({formatDuration(meeting.durationMinutes)})</span>
              </div>
            </div>
          </div>
          {meeting.meetingUrl && (
            <button
              onClick={() => emitAction('open_external_url', { url: meeting.meetingUrl })}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Video className="w-4 h-4" />
              Join Meeting
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Location */}
        {meeting.location && !meeting.meetingUrl && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
            <MapPin className="w-4 h-4" />
            <span>{meeting.location}</span>
          </div>
        )}

        {/* Attendees */}
        {meeting.attendees.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center gap-2 text-sm text-gray-300 mb-2">
              <Users className="w-4 h-4" />
              <span>{meeting.attendees.length} attendees</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {externalAttendees.length > 0 && (
                <div className="flex items-center gap-1 text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full">
                  <Building className="w-3 h-3" />
                  {externalAttendees.map(a => a.name || a.email.split('@')[0]).join(', ')}
                </div>
              )}
              {internalAttendees.length > 1 && (
                <div className="flex items-center gap-1 text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full">
                  +{internalAttendees.length - 1} team members
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CRM Context Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Company Context */}
        {context.company && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold text-white">Company</h3>
            </div>
            <div className="space-y-2">
              <div className="text-lg font-medium text-white">{context.company.name}</div>
              {context.company.industry && (
                <div className="text-sm text-gray-400">{context.company.industry}</div>
              )}
              {context.company.size && (
                <div className="text-sm text-gray-400">{context.company.size}</div>
              )}
              {context.company.relationshipDuration && (
                <div className="text-xs text-gray-500">
                  Customer for {context.company.relationshipDuration}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Deal Context */}
        {context.deal && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-5 h-5 text-green-400" />
              <h3 className="font-semibold text-white">Active Deal</h3>
            </div>
            <div className="space-y-2">
              <div className="text-lg font-medium text-white">{context.deal.name}</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-400">Value:</span>
                  <span className="text-green-400 ml-2 font-semibold">
                    {formatCurrency(context.deal.value)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Stage:</span>
                  <span className="text-white ml-2">{context.deal.stage}</span>
                </div>
                <div>
                  <span className="text-gray-400">Probability:</span>
                  <span className="text-white ml-2">{context.deal.probability}%</span>
                </div>
                {context.deal.daysInStage !== undefined && (
                  <div>
                    <span className="text-gray-400">Days in stage:</span>
                    <span className="text-white ml-2">{context.deal.daysInStage}</span>
                  </div>
                )}
              </div>
              {context.deal.closeDate && (
                <div className="text-xs text-gray-500 mt-2">
                  Expected close: {formatDate(context.deal.closeDate)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Last Activity */}
      {context.lastActivity && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-5 h-5 text-gray-400" />
            <h3 className="font-semibold text-white">Last Activity</h3>
            <span className="text-xs text-gray-500 ml-auto">
              {formatDate(context.lastActivity.date)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded capitalize">
              {context.lastActivity.type}
            </span>
            <span className="text-sm text-gray-300">{context.lastActivity.summary}</span>
          </div>
        </div>
      )}

      {/* Previous Meetings */}
      {context.previousMeetings.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            Previous Meetings ({context.previousMeetings.length})
          </h3>
          <div className="space-y-3">
            {context.previousMeetings.map((prev) => (
              <div
                key={prev.id}
                className="bg-gray-700/50 rounded-lg p-3 hover:bg-gray-700 transition-colors cursor-pointer"
                onClick={() => emitAction('open_meeting', { meetingId: prev.id })}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-white text-sm">{prev.title}</div>
                  <span className="text-xs text-gray-500">
                    {formatDate(prev.date)}
                  </span>
                </div>
                {prev.summary && (
                  <p className="text-sm text-gray-400 mt-1 line-clamp-2">{prev.summary}</p>
                )}
                {prev.keyTopics && prev.keyTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {prev.keyTopics.slice(0, 3).map((topic, idx) => (
                      <span
                        key={idx}
                        className="text-xs bg-gray-600 text-gray-300 px-2 py-0.5 rounded"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Items */}
      {(actionItems.completed.length > 0 || actionItems.outstanding.length > 0) && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-yellow-400" />
            Action Items
          </h3>

          {/* Outstanding */}
          {actionItems.outstanding.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm text-yellow-400 mb-2 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                Outstanding ({actionItems.outstanding.length})
              </h4>
              <div className="space-y-2">
                {actionItems.outstanding.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3"
                  >
                    <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2" />
                    <div className="flex-1">
                      <div className="text-sm text-white">{item.description}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {item.owner}
                        {item.dueDate && ` - Due ${formatDate(item.dueDate)}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {actionItems.completed.length > 0 && (
            <div>
              <h4 className="text-sm text-green-400 mb-2 flex items-center gap-1">
                <CheckSquare className="w-4 h-4" />
                Completed ({actionItems.completed.length})
              </h4>
              <div className="space-y-2">
                {actionItems.completed.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 bg-green-500/10 border border-green-500/20 rounded-lg p-3"
                  >
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-2" />
                    <div className="flex-1">
                      <div className="text-sm text-gray-300 line-through">{item.description}</div>
                      <div className="text-xs text-gray-500 mt-1">{item.owner}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Open Tasks */}
      {context.openTasks.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-400" />
            Your Open Tasks ({context.openTasks.length})
          </h3>
          <div className="space-y-2">
            {context.openTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3 hover:bg-gray-700 transition-colors cursor-pointer"
                onClick={() => emitAction('open_task', { taskId: task.id })}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      task.priority === 'high'
                        ? getStatusColors('critical').dot
                        : task.priority === 'medium'
                        ? getStatusColors('warning').dot
                        : getStatusColors('neutral').dot
                    }`}
                  />
                  <span className="text-sm text-white">{task.title}</span>
                </div>
                {task.dueDate && (
                  <span className="text-xs text-gray-500">
                    Due {formatDate(task.dueDate)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-400" />
            Suggestions for This Meeting
          </h3>
          <ul className="space-y-2">
            {suggestions.map((suggestion, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                <ChevronRight className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

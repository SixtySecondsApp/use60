import React, { useState } from 'react';
import { 
  CalendarDays, 
  CheckSquare, 
  ExternalLink, 
  Sparkles, 
  Users, 
  Briefcase, 
  Building, 
  ChevronDown, 
  ChevronUp,
  Clock,
  X,
  Pencil
} from 'lucide-react';
import type { NextMeetingCommandCenterResponse as NextMeetingCommandCenterResponseType } from '../types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCopilot } from '@/lib/contexts/CopilotContext';

interface Props {
  data: NextMeetingCommandCenterResponseType;
  onActionClick?: (action: any) => void;
}

export function NextMeetingCommandCenterResponse({ data, onActionClick }: Props) {
  const { sendMessage, isLoading } = useCopilot();
  const { meeting, brief, prepTaskPreview, isSimulation } = data.data;
  const [showAllAttendees, setShowAllAttendees] = useState(false);

  // Meeting details
  const title = meeting?.title ? String(meeting.title) : 'Next meeting';
  const start = meeting?.startTime || meeting?.start_time || meeting?.meeting_start;
  const startStr = start ? formatMeetingTime(String(start)) : null;
  const url = meeting?.meetingUrl || meeting?.meeting_url || meeting?.conference_link;
  const meetingId = meeting?.id ? String(meeting.id) : null;
  
  // Attendees
  const attendees = meeting?.attendees || brief?.attendees || [];
  const displayedAttendees = showAllAttendees ? attendees : attendees.slice(0, 3);
  
  // Company/Deal context from brief
  const company = brief?.company_name || brief?.company || meeting?.company || null;
  const dealName = brief?.deal_name || brief?.deal?.name || null;
  const dealId = brief?.deal_id || brief?.deal?.id || null;
  const dealStage = brief?.deal_stage || brief?.deal?.stage_name || null;
  const dealValue = brief?.deal_value || brief?.deal?.value || null;
  
  // Context/prep notes from brief
  const prepNotes = brief?.prep_notes || brief?.context || brief?.summary || null;
  const talkingPoints = brief?.talking_points || [];
  const objectives = brief?.objectives || brief?.goals || [];

  // Prep task
  const taskTitle = prepTaskPreview?.title ? String(prepTaskPreview.title) : 'Prep task';
  const taskDesc = prepTaskPreview?.description ? String(prepTaskPreview.description) : '';
  const due = prepTaskPreview?.due_date ? String(prepTaskPreview.due_date) : null;
  const priority = prepTaskPreview?.priority ? String(prepTaskPreview.priority) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white truncate">Next Meeting Command Center</h3>
          </div>
          <p className="text-sm text-gray-300 mt-1">{data.summary}</p>
        </div>
        <div className={cn(
          'text-xs px-2 py-1 rounded-md border',
          isSimulation ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' : 'border-green-500/30 bg-green-500/10 text-green-300'
        )}>
          {isSimulation ? 'Preview' : 'Created'}
        </div>
      </div>

      {/* Meeting Details Section */}
      <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <CalendarDays className="w-4 h-4 text-emerald-400" />
          <div className="text-sm font-semibold text-white">Next meeting</div>
        </div>
        <div className="text-sm text-gray-100 font-medium">{title}</div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
          {startStr && (
            <>
              <Clock className="w-3 h-3" />
              <span>{startStr}</span>
            </>
          )}
          {company && (
            <>
              <span>•</span>
              <Building className="w-3 h-3" />
              <span>{company}</span>
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {meetingId && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (onActionClick) return onActionClick({ action: 'open_meeting', data: { meetingId } });
                window.location.href = `/meetings?meeting=${encodeURIComponent(meetingId)}`;
              }}
              className="gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View meeting
            </Button>
          )}
          {url && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (onActionClick) return onActionClick({ action: 'open_external_url', data: { url } });
                window.open(url, '_blank');
              }}
              className="gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Join link
            </Button>
          )}
        </div>
      </div>

      {/* Attendees Section */}
      {attendees.length > 0 && (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-cyan-400" />
            <div className="text-sm font-semibold text-white">Attendees</div>
            <span className="text-xs text-gray-400 bg-gray-800/50 px-2 py-0.5 rounded-full">
              {attendees.length}
            </span>
          </div>
          <div className="space-y-2">
            {displayedAttendees.map((attendee: any, idx: number) => {
              const name = attendee?.name || attendee?.full_name || attendee?.email || `Attendee ${idx + 1}`;
              const email = attendee?.email || null;
              const role = attendee?.role || attendee?.title || null;
              const contactId = attendee?.contact_id || attendee?.id || null;
              
              return (
                <div 
                  key={idx} 
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg bg-gray-800/40",
                    contactId && "hover:bg-gray-800/60 cursor-pointer"
                  )}
                  onClick={() => contactId && onActionClick?.({ action: 'open_contact', data: { contactId } })}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white truncate">{name}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {role && <span>{role}</span>}
                      {role && email && <span> • </span>}
                      {email && <span>{email}</span>}
                    </div>
                  </div>
                  {contactId && <ExternalLink className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                </div>
              );
            })}
          </div>
          {attendees.length > 3 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllAttendees(!showAllAttendees)}
              className="w-full mt-2 text-gray-400 hover:text-white"
            >
              {showAllAttendees ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-1" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-1" />
                  Show {attendees.length - 3} more
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Deal Context Section */}
      {(dealName || dealId) && (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-4 h-4 text-purple-400" />
            <div className="text-sm font-semibold text-white">Deal Context</div>
          </div>
          <div 
            className="p-3 rounded-lg bg-gray-800/40 hover:bg-gray-800/60 cursor-pointer"
            onClick={() => dealId && onActionClick?.({ action: 'open_deal', data: { dealId } })}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm text-white font-medium">{dealName || 'Associated Deal'}</div>
              {dealId && <ExternalLink className="w-3.5 h-3.5 text-gray-500" />}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
              {dealStage && <span>{dealStage}</span>}
              {dealValue && (
                <>
                  {dealStage && <span>•</span>}
                  <span className="text-emerald-400">{formatCurrency(Number(dealValue))}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prep Notes / Talking Points Section */}
      {(prepNotes || talkingPoints.length > 0 || objectives.length > 0) && (
        <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <div className="text-sm font-semibold text-white">Meeting Brief</div>
          </div>
          
          {prepNotes && (
            <p className="text-sm text-gray-300 mb-3">{prepNotes}</p>
          )}
          
          {objectives.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Objectives</div>
              <ul className="space-y-1">
                {objectives.slice(0, 3).map((obj: string, idx: number) => (
                  <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-emerald-400 mt-1">•</span>
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {talkingPoints.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Talking Points</div>
              <ul className="space-y-1">
                {talkingPoints.slice(0, 5).map((point: string, idx: number) => (
                  <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Prep Task Section */}
      <div className="rounded-xl border border-gray-800/60 bg-gray-900/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckSquare className="w-4 h-4 text-purple-400" />
          <div className="text-sm font-semibold text-white">Prep task</div>
        </div>
        <div className="text-sm text-gray-100 font-medium">{taskTitle}</div>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          {due ? <span>Due: {due}</span> : null}
          {priority ? <span>Priority: {priority}</span> : null}
        </div>
        {taskDesc ? (
          <pre className="mt-3 text-xs text-gray-300 whitespace-pre-wrap bg-black/20 border border-gray-800/50 rounded-lg p-3 max-h-64 overflow-auto">
            {taskDesc}
          </pre>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {isSimulation ? (
            <>
              <Button size="sm" onClick={() => sendMessage('Confirm')} disabled={isLoading} className="gap-2">
                <CheckSquare className="w-4 h-4" />
                Create prep task
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => sendMessage('Edit the prep task')} 
                disabled={isLoading} 
                className="gap-2"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => sendMessage("Cancel, I don't need this")} 
                disabled={isLoading} 
                className="gap-2 text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (onActionClick) return onActionClick({ action: 'open_task', data: {} });
                window.location.href = '/tasks';
              }}
              className="gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View tasks
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper functions
function formatMeetingTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });
  } catch {
    return isoString;
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}


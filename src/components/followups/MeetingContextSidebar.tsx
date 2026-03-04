/**
 * MeetingContextSidebar — FU-005
 * Shows source meeting details for a follow-up draft.
 * Meeting name, date, attendees, key outcomes, buying signals, link to full detail.
 */

import React, { useEffect, useState } from 'react';
import { Calendar, Users, Lightbulb, ExternalLink, Loader2, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

interface MeetingDetail {
  id: string;
  title: string | null;
  started_at: string | null;
  owner_user_id: string;
  summary: string | null;
  key_outcomes: string | null;
  buying_signals: unknown[] | null;
  attendees: string[] | null;
}

interface MeetingContextSidebarProps {
  meetingId: string;
}

export function MeetingContextSidebar({ meetingId }: MeetingContextSidebarProps) {
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    supabase
      .from('meetings')
      .select('id, title, started_at, owner_user_id, summary, key_outcomes, buying_signals, attendees')
      .eq('id', meetingId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setMeeting(data as MeetingDetail | null);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [meetingId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 text-[#37bd7e] animate-spin" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="p-4">
        <p className="text-xs text-gray-500">Meeting details not found</p>
      </div>
    );
  }

  const attendees = meeting.attendees ?? [];
  const buyingSignals = (meeting.buying_signals ?? []) as string[];

  return (
    <div className="p-4 space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Source Meeting
        </p>
        <p className="text-sm font-medium text-white leading-snug">
          {meeting.title ?? 'Untitled meeting'}
        </p>
        {meeting.started_at && (
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {format(new Date(meeting.started_at), 'MMM d, yyyy')}
          </p>
        )}
      </div>

      {attendees.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            Attendees
          </p>
          <div className="space-y-1">
            {attendees.slice(0, 5).map((name, i) => (
              <p key={i} className="text-xs text-gray-300 truncate">
                {name}
              </p>
            ))}
            {attendees.length > 5 && (
              <p className="text-xs text-gray-600">+{attendees.length - 5} more</p>
            )}
          </div>
        </div>
      )}

      {meeting.key_outcomes && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
            <Lightbulb className="w-3.5 h-3.5" />
            Key outcomes
          </p>
          <p className="text-xs text-gray-300 leading-relaxed">{meeting.key_outcomes}</p>
        </div>
      )}

      {buyingSignals.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-[#37bd7e]" />
            Buying signals
          </p>
          <div className="space-y-1.5">
            {buyingSignals.map((signal, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 text-xs text-gray-300 bg-[#37bd7e]/5 border border-[#37bd7e]/15 rounded-md px-2 py-1.5"
              >
                <span className="text-[#37bd7e] mt-px flex-shrink-0">•</span>
                <span className="leading-relaxed">{typeof signal === 'string' ? signal : JSON.stringify(signal)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {meeting.summary && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Summary</p>
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-4">{meeting.summary}</p>
        </div>
      )}

      <Link
        to={`/meetings/${meetingId}`}
        className="flex items-center gap-1.5 text-xs text-[#37bd7e] hover:text-[#2da56b] transition-colors mt-2"
      >
        <ExternalLink className="w-3 h-3" />
        View full meeting
      </Link>
    </div>
  );
}

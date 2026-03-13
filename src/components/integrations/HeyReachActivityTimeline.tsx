import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import {
  UserPlus,
  Send,
  MessageSquare,
  Eye,
  Heart,
  Mail,
  Tag,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineEvent {
  id: string;
  event_type: string;
  timestamp: string;
  campaign_id: string | null;
  message_preview: string | null;
  matched: boolean;
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  connection_request_sent: <UserPlus className="w-3.5 h-3.5" />,
  connection_request_accepted: <UserPlus className="w-3.5 h-3.5" />,
  message_sent: <Send className="w-3.5 h-3.5" />,
  message_reply_received: <MessageSquare className="w-3.5 h-3.5" />,
  inmail_sent: <Mail className="w-3.5 h-3.5" />,
  inmail_reply_received: <MessageSquare className="w-3.5 h-3.5" />,
  follow_sent: <UserPlus className="w-3.5 h-3.5" />,
  liked_post: <Heart className="w-3.5 h-3.5" />,
  viewed_profile: <Eye className="w-3.5 h-3.5" />,
  lead_tag_updated: <Tag className="w-3.5 h-3.5" />,
};

const EVENT_LABELS: Record<string, string> = {
  connection_request_sent: 'Connection request sent',
  connection_request_accepted: 'Connection accepted',
  message_sent: 'Message sent',
  message_reply_received: 'Reply received',
  inmail_sent: 'InMail sent',
  inmail_reply_received: 'InMail reply received',
  follow_sent: 'Followed',
  liked_post: 'Liked a post',
  viewed_profile: 'Viewed profile',
  lead_tag_updated: 'Tag updated',
};

const REPLY_EVENTS = new Set(['message_reply_received', 'inmail_reply_received']);

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface HeyReachActivityTimelineProps {
  linkedinUrl?: string | null;
  email?: string | null;
  heyreachLeadId?: string | null;
}

export function HeyReachActivityTimeline({ linkedinUrl, email, heyreachLeadId }: HeyReachActivityTimelineProps) {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrgId) return;

    const fetchEvents = async () => {
      setLoading(true);
      try {
        // Query sync history for events matching this lead
        let query = supabase
          .from('heyreach_sync_history')
          .select('id, synced_at, metadata, campaign_id')
          .eq('org_id', activeOrgId)
          .eq('sync_type', 'webhook_event')
          .order('synced_at', { ascending: false })
          .limit(50);

        const { data, error } = await query;
        if (error) throw error;

        // Filter events that match this lead
        const matchedEvents: TimelineEvent[] = [];
        for (const row of (data || [])) {
          const meta = row.metadata as any;
          if (!meta) continue;

          const matchesLinkedin = linkedinUrl && meta.linkedin_url === linkedinUrl;
          const matchesEmail = email && meta.email === email;

          if (matchesLinkedin || matchesEmail) {
            matchedEvents.push({
              id: row.id,
              event_type: meta.event_type || 'unknown',
              timestamp: row.synced_at,
              campaign_id: row.campaign_id,
              message_preview: meta.message_preview || null,
              matched: meta.matched ?? true,
            });
          }
        }

        setEvents(matchedEvents);
      } catch (e) {
        console.error('[HeyReachActivityTimeline] Error:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [activeOrgId, linkedinUrl, email, heyreachLeadId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400 text-xs">
        <Clock className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
        Loading activity...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-xs">
        No LinkedIn activity yet. Push this lead to a HeyReach campaign to start tracking.
      </div>
    );
  }

  return (
    <div className="space-y-0 max-h-80 overflow-y-auto">
      {events.map((event, idx) => {
        const isReply = REPLY_EVENTS.has(event.event_type);
        return (
          <div
            key={event.id}
            className={cn(
              'flex items-start gap-3 px-3 py-2.5 relative',
              isReply && 'bg-blue-50/50 dark:bg-blue-900/10',
            )}
          >
            {/* Timeline line */}
            {idx < events.length - 1 && (
              <div className="absolute left-[22px] top-8 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
            )}

            {/* Icon */}
            <div
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center shrink-0 relative z-10',
                isReply
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
              )}
            >
              {EVENT_ICONS[event.event_type] || <Send className="w-3.5 h-3.5" />}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-xs font-medium',
                  isReply ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300',
                )}>
                  {EVENT_LABELS[event.event_type] || event.event_type}
                </span>
                <span className="text-[10px] text-gray-400" title={new Date(event.timestamp).toLocaleString()}>
                  {timeAgo(event.timestamp)}
                </span>
              </div>
              {event.message_preview && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  {event.message_preview}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

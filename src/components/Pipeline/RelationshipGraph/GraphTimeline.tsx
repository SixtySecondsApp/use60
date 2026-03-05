import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  Eye,
  FileCheck,
  FileText,
  Linkedin,
  LucideIcon,
  Mail,
  Phone,
  Play,
  TrendingUp,
  Video,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';

interface GraphTimelineProps {
  contactId: string;
  orgId: string;
}

interface WarmthSignal {
  id: string;
  signal_type: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
  signal_weight: number;
}

const SIGNAL_ICON_MAP: Record<string, LucideIcon> = {
  email_sent: Mail,
  email_received: Mail,
  email_opened: Mail,
  meeting_held: Video,
  meeting_booked: Video,
  call_completed: Phone,
  linkedin_message: Linkedin,
  linkedin_engaged: Linkedin,
  page_view: Eye,
  proposal_opened: FileText,
  form_filled: FileCheck,
  event_attended: CalendarCheck,
  deal_stage_change: TrendingUp,
  video_viewed: Play,
};

const SIGNAL_LABEL_MAP: Record<string, string> = {
  email_sent: 'Email sent',
  email_received: 'Email received',
  email_opened: 'Email opened',
  meeting_held: 'Meeting held',
  meeting_booked: 'Meeting booked',
  call_completed: 'Call completed',
  linkedin_message: 'LinkedIn message',
  linkedin_engaged: 'LinkedIn engaged',
  page_view: 'Page viewed',
  proposal_opened: 'Proposal opened',
  form_filled: 'Form filled',
  event_attended: 'Event attended',
  deal_stage_change: 'Deal stage changed',
  video_viewed: 'Video viewed',
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export function GraphTimeline({ contactId }: GraphTimelineProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['contact_warmth_signals', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_warmth_signals')
        .select('id, signal_type, metadata, occurred_at, signal_weight')
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as WarmthSignal[];
    },
    enabled: !!contactId,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-white/[0.06] animate-pulse shrink-0" />
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="h-2.5 w-24 rounded bg-white/[0.06] animate-pulse" />
              <div className="h-2 w-14 rounded bg-white/[0.04] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 px-3">
        <span className="text-[10px] text-gray-500">No interactions yet</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-3 py-2">
      {data.map((signal, index) => {
        const Icon = SIGNAL_ICON_MAP[signal.signal_type] ?? FileText;
        const label = SIGNAL_LABEL_MAP[signal.signal_type] ?? signal.signal_type;
        const isLast = index === data.length - 1;

        return (
          <div key={signal.id} className="flex items-start gap-3 relative">
            <div className="flex flex-col items-center shrink-0">
              <div className="w-6 h-6 rounded-full bg-[#1e1e2e]/60 border border-white/[0.04] flex items-center justify-center z-10">
                <Icon className="w-3 h-3 text-gray-400" />
              </div>
              {!isLast && (
                <div className="w-px flex-1 min-h-[1.5rem] bg-white/[0.06]" />
              )}
            </div>
            <div className="flex flex-col gap-0.5 pb-4 min-w-0">
              <span className="text-xs text-gray-100 leading-tight">{label}</span>
              <span className="text-[10px] text-gray-500 leading-tight">
                {formatRelativeTime(signal.occurred_at)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

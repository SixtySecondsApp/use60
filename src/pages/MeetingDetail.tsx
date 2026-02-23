import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase/clientV2';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ExternalLink, Loader2, AlertCircle, Play, FileText, MessageSquare, Sparkles, RefreshCw, BarChart3, Clock, Mic } from 'lucide-react';
import FathomPlayerV2, { FathomPlayerV2Handle } from '@/components/FathomPlayerV2';
import { VoiceMeetingPlayer } from '@/components/meetings/VoiceMeetingPlayer';
import { AskAIChat } from '@/components/meetings/AskAIChat';
import { MeetingContent } from '@/components/meetings/MeetingContent';
import { useActivitiesActions } from '@/lib/hooks/useActivitiesActions';
import { useEventEmitter } from '@/lib/communication/EventBus';
import { toast } from 'sonner';
import { ProposalWizard } from '@/components/proposals/ProposalWizard';
import { TalkTimeChart } from '@/components/meetings/analytics/TalkTimeChart';
import { CoachingInsights } from '@/components/meetings/analytics/CoachingInsights';
import { QuickActionsCard } from '@/components/meetings/QuickActionsCard';
import { ShareMeetingModal } from '@/components/meetings/ShareMeetingModal';
import { StructuredMeetingSummary } from '@/components/meetings/StructuredMeetingSummary';
import { useActivationTracking } from '@/lib/hooks/useActivationTracking';
import { useOnboardingProgress } from '@/lib/hooks/useOnboardingProgress';

// Processing status type for real-time UI updates
type ProcessingStatus = 'pending' | 'processing' | 'complete' | 'failed';

interface Meeting {
  id: string;
  fathom_recording_id: string;
  title: string;
  meeting_start: string;
  meeting_end: string;
  duration_minutes: number;
  share_url: string;
  calls_url: string;
  transcript_doc_url: string | null;
  transcript_text: string | null;
  summary: string | null;
  sentiment_score: number | null;
  sentiment_reasoning: string | null;
  talk_time_rep_pct: number | null;
  talk_time_customer_pct: number | null;
  talk_time_judgement: string | null;
  owner_email: string | null;
  fathom_embed_url?: string | null;
  thumbnail_url?: string | null;
  company_id?: string | null;
  primary_contact_id?: string | null;
  meeting_type?: 'discovery' | 'demo' | 'negotiation' | 'closing' | 'follow_up' | 'general' | null;
  classification_confidence?: number | null;
  contact?: any;
  company?: any;
  // Processing status columns for real-time UI updates
  thumbnail_status?: ProcessingStatus;
  transcript_status?: ProcessingStatus;
  summary_status?: ProcessingStatus;
  // Voice meeting fields
  source_type?: 'fathom' | 'voice' | '60_notetaker';
  voice_recording_id?: string | null;
  // 60 Notetaker fields
  bot_id?: string | null;
  video_url?: string | null;
  audio_url?: string | null;
  recording_id?: string | null;
  // Meeting provider (fathom, fireflies, etc.)
  provider?: string;
}

// Voice recording data for voice meetings
interface VoiceRecordingData {
  speakers: { id: number; name: string; initials?: string }[];
  transcript_segments: {
    speaker: string;
    speaker_id: number;
    text: string;
    start_time: number;
    end_time: number;
    confidence?: number;
  }[];
  duration_seconds: number;
}

interface MeetingAttendee {
  id: string;
  name: string;
  email: string | null;
  is_external: boolean;
  role: string | null;
}

interface ActionItem {
  id: string;
  title: string;
  priority: string;
  category: string | null;
  completed: boolean;
  timestamp_seconds: number | null;
  playback_url: string | null;
  ai_generated: boolean | null;
  ai_confidence: number | null;
  task_id: string | null;
  synced_to_task: boolean | null;
  sync_status: string | null;
  deadline_at: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
}

// Helper functions
function labelSentiment(score: number | null): string {
  if (score == null) return '—';
  if (score <= -0.25) return 'Challenging';
  if (score < 0.25) return 'Neutral';
  return 'Positive';
}

function getSentimentColor(score: number | null): string {
  if (score == null) return 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-200';
  if (score > 0.25) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300';
  if (score < -0.25) return 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300';
  return 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-200';
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Compute reliable duration in minutes from meeting data */
function getDisplayDuration(m: { duration_minutes: number; meeting_start: string; meeting_end: string }): number {
  let mins = m.duration_minutes;
  // Sanity check: if > 300 (5 hours), likely stored in seconds
  if (mins > 300) mins = Math.round(mins / 60);
  // Fallback: compute from start/end times if duration is missing or zero
  if (!mins || mins <= 0) {
    const diff = new Date(m.meeting_end).getTime() - new Date(m.meeting_start).getTime();
    if (diff > 0) mins = Math.round(diff / 60000);
  }
  return mins || 0;
}

/** Parse "HH:MM:SS" or "MM:SS" timestamp to seconds */
function parseTimestampToSeconds(ts: string): number | null {
  const parts = ts.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

// Enhanced markdown parser for Fathom summaries with beautiful styling
function parseMarkdownSummary(markdown: string): string {
  return markdown
    // Main headers (# Header) - Large, prominent
    .replace(/^# (.*?)$/gm, '<h1 class="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4 pb-2 border-b border-gray-200 dark:border-white/10">$1</h1>')
    // Section headers (## Header) - Medium, spaced
    .replace(/^## (.*?)$/gm, '<h2 class="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3">$1</h2>')
    // Sub-headers (### Header) - Smaller, colored accent
    .replace(/^### (.*?)$/gm, '<h3 class="text-base font-semibold text-blue-600 dark:text-blue-400 mt-4 mb-2">$1</h3>')
    // Bold text - White and prominent
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-white">$1</strong>')
    // Timestamp links - Styled as clickable badges with play icon and consistent spacing
    .replace(/\[(.*?)\]\((https:\/\/fathom\.video\/share\/[^)]+timestamp=([0-9.]+)[^)]*)\)/g,
      '<span class="timestamp-link inline-block align-top px-2 py-1 mb-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer transition-all text-xs font-medium max-w-[90%]" data-timestamp="$3" data-href="$2">' +
      '<svg class="w-3 h-3 inline-block mr-1.5 -mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/></svg>' +
      '$1' +
      '</span>')
    // Regular links - Subtle blue
    .replace(/\[(.*?)\]\((https:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">$1</a>')
    // Bullet points - Hidden bullet, consistent spacing with line-height fix
    .replace(/^ - (.*?)$/gm, '<div class="mb-1 text-gray-700 dark:text-gray-300 leading-relaxed min-h-[28px] flex items-start">$1</div>')
    // Numbered lists - Hidden numbers, consistent spacing with line-height fix
    .replace(/^ (\d+)\. (.*?)$/gm, '<div class="mb-1 text-gray-700 dark:text-gray-300 leading-relaxed min-h-[28px] flex items-start">$2</div>')
    // Paragraph breaks - Better spacing
    .replace(/\n\n/g, '<div class="mb-4"></div>')
    // Single line breaks - Smaller spacing
    .replace(/\n/g, '<br/>');
}

// Speaker color system matching the reference transcript design
const SPEAKER_CONFIGS = [
  {
    gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
    color: '#60a5fa',
    rowHoverClass: 'group-hover:bg-blue-500/10 group-hover:border-blue-400/20',
    tsHoverClass: 'group-hover:text-blue-400',
  },
  {
    gradient: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
    color: '#a78bfa',
    rowHoverClass: 'group-hover:bg-violet-500/10 group-hover:border-violet-400/20',
    tsHoverClass: 'group-hover:text-violet-400',
  },
  {
    gradient: 'linear-gradient(135deg, #059669, #34d399)',
    color: '#34d399',
    rowHoverClass: 'group-hover:bg-emerald-500/10 group-hover:border-emerald-400/20',
    tsHoverClass: 'group-hover:text-emerald-400',
  },
  {
    gradient: 'linear-gradient(135deg, #ea580c, #fb923c)',
    color: '#fb923c',
    rowHoverClass: 'group-hover:bg-orange-500/10 group-hover:border-orange-400/20',
    tsHoverClass: 'group-hover:text-orange-400',
  },
];

export function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const playerRef = useRef<FathomPlayerV2Handle>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const { addActivity } = useActivitiesActions();
  const emit = useEventEmitter();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<MeetingAttendee[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [thumbnailEnsured, setThumbnailEnsured] = useState(false);
  const [summaryViewTracked, setSummaryViewTracked] = useState(false);
  const [hasStructuredSummary, setHasStructuredSummary] = useState(false);
  const [voiceRecordingData, setVoiceRecordingData] = useState<VoiceRecordingData | null>(null);
  const [voiceCurrentTime, setVoiceCurrentTime] = useState(0);
  const [speakerAvatarMap, setSpeakerAvatarMap] = useState<Map<string, string>>(new Map());

  // Activation tracking for North Star metric
  const { trackFirstSummaryViewed } = useActivationTracking();
  const { progress } = useOnboardingProgress();

  const primaryExternal = attendees.find(a => a.is_external);

  const [showProposalWizard, setShowProposalWizard] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const handleQuickAdd = async (type: 'meeting' | 'outbound' | 'proposal' | 'sale') => {
    if (!meeting) return;
    const clientName = primaryExternal?.name || attendees[0]?.name || meeting.title || 'Prospect';
    // Derive website from primary external attendee email domain when available
    let websiteFromEmail: string | undefined;
    const email = primaryExternal?.email || undefined;
    if (email && email.includes('@')) {
      const domain = email.split('@')[1]?.toLowerCase();
      const freeDomains = ['gmail.com','outlook.com','hotmail.com','yahoo.com','icloud.com','proton.me','aol.com'];
      if (domain && !freeDomains.includes(domain)) {
        websiteFromEmail = domain.startsWith('www.') ? domain : `www.${domain}`;
      }
    }

    // Open Quick Add modal with prefilled data
    await emit('modal:opened', {
      type: 'quick-add',
      context: {
        preselectAction: type,
        formId: 'quick-add',
        initialData: {
          client_name: clientName,
          details: `From Fathom: ${meeting.title || 'Meeting'}`,
          date: meeting.meeting_start,
          meeting_id: meeting.id,
          company_id: (meeting as any).company_id || null,
          contact_id: (meeting as any).primary_contact_id || null,
          company_website: websiteFromEmail
        }
      }
    });
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    if (!id) {
      navigate('/meetings', { replace: true });
      return;
    }

    // Redirect immediately if the id doesn't look like a valid UUID
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      navigate('/meetings', { replace: true });
      return;
    }

    const fetchMeetingDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch meeting
        const { data: meetingData, error: meetingError } = await supabase
          .from('meetings')
          .select('*')
          .eq('id', id)
          .single();

        if (meetingError) {
          // PGRST116 = row not found — redirect instead of showing error
          if ((meetingError as any).code === 'PGRST116') {
            navigate('/meetings', { replace: true });
            return;
          }
          throw meetingError;
        }
        setMeeting(meetingData);

        // Fetch company name if company_id exists
        if (meetingData.company_id) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('id, name')
            .eq('id', meetingData.company_id)
            .maybeSingle();
          if (companyData) setCompanyName(companyData.name);
        }

        // Fetch attendees - combine internal (meeting_attendees) and external (meeting_contacts via contacts)
        // Note: Type assertion used here until database types are regenerated
        const { data: internalAttendeesData, error: internalError } = await (supabase
          .from('meeting_attendees') as any)
          .select('*')
          .eq('meeting_id', id);

        if (internalError) throw internalError;

        // Fetch external contacts via meeting_contacts junction
        // Note: Type assertion used here until database types are regenerated
        const { data: externalContactsData, error: externalError } = await (supabase
          .from('meeting_contacts') as any)
          .select(`
            contact_id,
            is_primary,
            role,
            contacts (
              id,
              first_name,
              last_name,
              full_name,
              email
            )
          `)
          .eq('meeting_id', id);

        if (externalError) throw externalError;

        // Combine both internal and external attendees
        const combinedAttendees: MeetingAttendee[] = [
          ...((internalAttendeesData || []) as any[]).map((a: any) => ({
            id: a.id,
            name: a.name,
            email: a.email,
            is_external: a.is_external ?? false,
            role: a.role
          })),
          ...((externalContactsData || []) as any[])
            .filter((mc: any) => mc.contacts) // Filter out null contacts
            .map((mc: any) => {
              const c = mc.contacts;
              return {
                id: c.id,
                name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email,
                email: c.email,
                is_external: true,
                role: mc.is_primary ? 'Primary Contact' : (mc.role || 'attendee')
              };
            })
        ];

        setAttendees(combinedAttendees);

        // Fetch action items
        const { data: actionItemsData, error: actionItemsError } = await supabase
          .from('meeting_action_items')
          .select('*')
          .eq('meeting_id', id)
          .order('timestamp_seconds', { ascending: true });

        if (actionItemsError) throw actionItemsError;
        setActionItems(actionItemsData || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load meeting');
      } finally {
        setLoading(false);
      }
    };

    fetchMeetingDetails();
  }, [id]);

  // Fetch voice recording data for voice meetings
  useEffect(() => {
    const fetchVoiceRecordingData = async () => {
      if (!meeting?.voice_recording_id || meeting.source_type !== 'voice') {
        setVoiceRecordingData(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('voice_recordings')
          .select('speakers, transcript_segments, duration_seconds')
          .eq('id', meeting.voice_recording_id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching voice recording data:', error);
          return;
        }

        if (data) {
          setVoiceRecordingData({
            speakers: (data.speakers as VoiceRecordingData['speakers']) || [],
            transcript_segments: (data.transcript_segments as VoiceRecordingData['transcript_segments']) || [],
            duration_seconds: data.duration_seconds || 0,
          });
        }
      } catch (err) {
        console.error('Error fetching voice recording data:', err);
      }
    };

    fetchVoiceRecordingData();
  }, [meeting?.voice_recording_id, meeting?.source_type]);

  // Fetch profile avatars for attendees so transcript can show org member photos
  useEffect(() => {
    const emails = attendees.map(a => a.email).filter(Boolean) as string[];
    if (emails.length === 0) return;

    const fetchProfiles = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('email, avatar_url, remove_avatar, first_name, last_name')
        .in('email', emails);

      if (!data?.length) return;

      const map = new Map<string, string>();
      for (const profile of data) {
        if (profile.avatar_url && !profile.remove_avatar) {
          // Map by full name (from attendees) → avatarUrl
          const attendee = attendees.find(a => a.email === profile.email);
          if (attendee?.name) map.set(attendee.name, profile.avatar_url);
          // Also map by first name for partial matches
          const firstName = (profile.first_name || attendee?.name || '').trim().split(/\s+/)[0];
          if (firstName) map.set(firstName, profile.avatar_url);
        }
      }
      setSpeakerAvatarMap(map);
    };

    fetchProfiles();
  }, [attendees]);

  // Real-time subscription for processing status updates
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`meeting_detail_${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'meetings',
        filter: `id=eq.${id}`,
      }, (payload) => {
        const updated = payload.new as Meeting;
        setMeeting((prev) => prev ? { ...prev, ...updated } : null);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // NORTH STAR METRIC: Track first summary viewed
  useEffect(() => {
    // Only track if:
    // 1. Meeting is loaded with a summary
    // 2. User hasn't already viewed their first summary (per onboarding progress)
    // 3. We haven't already tracked this view in this session
    if (
      meeting?.summary && 
      progress?.first_summary_viewed === false && 
      !summaryViewTracked
    ) {
      console.log('[MeetingDetail] Tracking NORTH STAR: First Summary Viewed');
      trackFirstSummaryViewed(meeting.id);
      setSummaryViewTracked(true);
    }
  }, [meeting, progress?.first_summary_viewed, summaryViewTracked, trackFirstSummaryViewed]);

  // Ensure thumbnail exists for this meeting (Fathom only — other providers have no embeddable video)
  useEffect(() => {
    const ensureThumbnail = async () => {
      if (!meeting || thumbnailEnsured) return;
      if (meeting.thumbnail_url) {
        setThumbnailEnsured(true);
        return;
      }
      // Skip non-Fathom meetings (no embeddable video for thumbnail generation)
      if (meeting.provider && meeting.provider !== 'fathom') {
        setThumbnailEnsured(true);
        return;
      }

      try {
        // Build embed URL from share_url or recording id
        let embedUrl: string | null = null;
        if (meeting.share_url) {
          try {
            const u = new URL(meeting.share_url);
            const token = u.pathname.split('/').filter(Boolean).pop();
            if (token) embedUrl = `https://fathom.video/embed/${token}`;
          } catch {
            // ignore
          }
        }
        if (!embedUrl && meeting.fathom_recording_id) {
          embedUrl = `https://app.fathom.video/recording/${meeting.fathom_recording_id}`;
        }

        let thumbnailUrl: string | null = null;

        if (embedUrl) {
          // Try generation service first
          const { data, error } = await supabase.functions.invoke('generate-video-thumbnail-v2', {
            body: {
              recording_id: meeting.fathom_recording_id,
              share_url: meeting.share_url,
              fathom_embed_url: embedUrl,
            },
          });

          if (!error && data?.success && data.thumbnail_url) {
            thumbnailUrl = data.thumbnail_url as string;
          }
        }

        // Fallback: placeholder
        if (!thumbnailUrl) {
          const firstLetter = (meeting.title || 'M')[0].toUpperCase();
          thumbnailUrl = `https://dummyimage.com/640x360/1a1a1a/10b981&text=${encodeURIComponent(firstLetter)}`;
        }

        // Update meeting record (best effort; RLS must allow owner updates)
        // Note: Type assertion used here until database types are regenerated
        await (supabase
          .from('meetings') as any)
          .update({ thumbnail_url: thumbnailUrl })
          .eq('id', meeting.id);

        // Update local state
        setMeeting({ ...meeting, thumbnail_url: thumbnailUrl });
      } catch (e) {
        // ignore errors; UI will continue without a thumbnail
      } finally {
        setThumbnailEnsured(true);
      }
    };

    ensureThumbnail();
  }, [meeting, thumbnailEnsured]);

  // Handle timestamp jumps in video player.
  // Updates currentTimestamp (passed as startSeconds to FathomPlayerV2).
  // Also calls seekToTimestamp directly via ref for postMessage-based seeking,
  // and scrolls the video player into view.
  const handleTimestampJump = useCallback((seconds: number) => {
    // Call seek directly via ref (postMessage to Fathom embed)
    playerRef.current?.seekToTimestamp(seconds);
    // Also update state so FathomPlayerV2's useEffect fires (handles edge cases)
    setCurrentTimestamp(prev => prev === seconds ? seconds + 0.001 : seconds);
    // Scroll the video player into view
    const playerEl = document.querySelector('[data-player-container]');
    playerEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);


  // Reprocess meeting with AI analysis
  const handleReprocessMeeting = useCallback(async () => {
    if (!meeting?.id) return;

    try {
      setIsReprocessing(true);

      const { data, error } = await supabase.functions.invoke('reprocess-meetings-ai', {
        body: {
          meeting_ids: [meeting.id],
          force: true
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Meeting reprocessed successfully! Refreshing...');

        // Refresh meeting data
        const { data: updatedMeeting, error: fetchError } = await supabase
          .from('meetings')
          .select('*')
          .eq('id', meeting.id)
          .single();

        if (!fetchError && updatedMeeting) {
          setMeeting(updatedMeeting);
        }

        // Refresh action items if any were created
        if (data.action_items_created > 0) {
          const { data: items } = await supabase
            .from('meeting_action_items')
            .select('*')
            .eq('meeting_id', meeting.id)
            .order('timestamp_seconds', { ascending: true });
          setActionItems(items || []);
        }
      } else {
        throw new Error(data?.error || 'Reprocessing failed');
      }
    } catch (e) {
      console.error('Reprocess error:', e);
      toast.error(e instanceof Error ? e.message : 'Failed to reprocess meeting');
    } finally {
      setIsReprocessing(false);
    }
  }, [meeting?.id]);

  // Attach click handlers to Fathom timestamp links in summary
  useEffect(() => {
    if (!summaryRef.current || !meeting?.summary) {
      return;
    }

    const handleSummaryLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if clicked element or its parent has data-timestamp attribute
      const timestampEl = target.closest('[data-timestamp]') as HTMLElement;
      if (timestampEl) {
        const timestamp = timestampEl.getAttribute('data-timestamp');
        if (timestamp) {
          e.preventDefault();
          e.stopPropagation();
          const seconds = parseFloat(timestamp);
          handleTimestampJump(seconds);
        }
      }
      // Fallback for old anchor tag format (if any remain)
      else if (target.tagName === 'A' && (target as HTMLAnchorElement).href?.includes('fathom.video')) {
        const url = new URL((target as HTMLAnchorElement).href);
        const timestamp = url.searchParams.get('timestamp');
        if (timestamp) {
          e.preventDefault();
          e.stopPropagation();
          const seconds = parseFloat(timestamp);
          handleTimestampJump(seconds);
        }
      }
    };

    const summaryEl = summaryRef.current;
    summaryEl.addEventListener('click', handleSummaryLinkClick);

    return () => {
      summaryEl.removeEventListener('click', handleSummaryLinkClick);
    };
  }, [meeting?.summary, handleTimestampJump]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Meeting not found'}
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate('/meetings')} className="mt-4" variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Meetings
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 max-w-7xl min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 min-w-0">
        <div className="space-y-1 sm:space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate('/meetings')} variant="ghost" size="sm" className="min-h-[40px]">
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold break-words">
            {meeting.title}{companyName ? ` — ${companyName}` : ''}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground break-words">
            {new Date(meeting.meeting_start).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })} • {getDisplayDuration(meeting)} min
          </p>
        </div>

        <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:flex-shrink-0">
          {meeting.meeting_type && (
            <Badge 
              variant="outline" 
              className="capitalize bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20"
            >
              {meeting.meeting_type.replace('_', ' ')}
              {meeting.classification_confidence && (
                <span className="ml-1 text-xs opacity-70">
                  ({Math.round(meeting.classification_confidence * 100)}%)
                </span>
              )}
            </Badge>
          )}
          {meeting.sentiment_score !== null && (
            <Badge className={getSentimentColor(meeting.sentiment_score)}>
              {labelSentiment(meeting.sentiment_score)}
            </Badge>
          )}
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 min-w-0">
        {/* Left Column - Video & Content */}
        <div className="lg:col-span-8 space-y-3 sm:space-y-4 min-w-0">
          {/* Media Player - Voice, 60 Notetaker, or Fathom */}
          {meeting.source_type === 'voice' && meeting.voice_recording_id ? (
            /* Voice Meeting Player with Stacked Waveforms */
            <div className="glassmorphism-card overflow-hidden" style={{ maxHeight: '320px' }}>
              <VoiceMeetingPlayer
                voiceRecordingId={meeting.voice_recording_id}
                speakers={voiceRecordingData?.speakers || []}
                transcriptSegments={voiceRecordingData?.transcript_segments || []}
                durationSeconds={voiceRecordingData?.duration_seconds || meeting.duration_minutes * 60}
                onTimeUpdate={setVoiceCurrentTime}
                className="p-4"
              />
            </div>
          ) : meeting.source_type === '60_notetaker' && meeting.video_url ? (
            /* 60 Notetaker Video Player */
            <div className="glassmorphism-card overflow-hidden" style={{ height: '320px' }}>
              <video
                controls
                preload="metadata"
                className="w-full h-full bg-black"
                style={{ objectFit: 'contain' }}
                poster={meeting.thumbnail_url || undefined}
              >
                <source src={meeting.video_url} type="video/mp4" />
                Your browser does not support the video element.
              </video>
            </div>
          ) : meeting.provider === 'fireflies' ? (
            /* Fireflies Meeting - Link to transcript */
            <div className="glassmorphism-card p-6">
              <div className="flex items-center gap-2 mb-3">
                <Mic className="h-5 w-5 text-orange-500" />
                <span className="font-semibold text-orange-600 dark:text-orange-400">Fireflies Recording</span>
              </div>
              {meeting.share_url && (
                <Button asChild variant="outline" size="sm">
                  <a href={meeting.share_url} target="_blank" rel="noopener noreferrer">
                    Open in Fireflies
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </a>
                </Button>
              )}
            </div>
          ) : (meeting.fathom_recording_id || meeting.share_url) ? (
            /* Fathom Video Player */
            <div className="glassmorphism-card overflow-hidden" style={{ height: '320px' }} data-player-container>
              <FathomPlayerV2
                ref={playerRef}
                shareUrl={meeting.share_url}
                title={meeting.title}
                startSeconds={currentTimestamp}
                timeoutMs={10000}
                className="h-full"
                onLoad={() => undefined}
                onError={() => undefined}
              />
            </div>
          ) : null}

          {/* AI Insights Section */}
          <div className="space-y-4">
            {/* Sentiment Analysis Card */}
            {meeting.sentiment_score !== null && meeting.sentiment_reasoning && (
              <div className="section-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">Sentiment Analysis</div>
                  <Badge className={getSentimentColor(meeting.sentiment_score)}>
                    {labelSentiment(meeting.sentiment_score)} ({(meeting.sentiment_score * 100).toFixed(0)}%)
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {meeting.sentiment_reasoning}
                </p>
              </div>
            )}

            {/* Missing AI Analysis Alert */}
            {meeting.transcript_text && (
              meeting.sentiment_score === null ||
              meeting.talk_time_rep_pct === null ||
              meeting.talk_time_customer_pct === null
            ) && (
              <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <BarChart3 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-amber-900 dark:text-amber-100">
                      AI Analysis Incomplete
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      This meeting has a transcript but is missing {
                        [
                          meeting.sentiment_score === null && 'sentiment analysis',
                          meeting.talk_time_rep_pct === null && 'talk time data',
                          meeting.talk_time_customer_pct === null && meeting.talk_time_rep_pct !== null && 'coaching insights'
                        ].filter(Boolean).join(' and ')
                      }. Click to reprocess with AI.
                    </p>
                  </div>
                  <Button
                    onClick={handleReprocessMeeting}
                    disabled={isReprocessing}
                    size="sm"
                    className="ml-4 bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                  >
                    {isReprocessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Reprocess
                      </>
                    )}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Enhanced Talk Time Analytics */}
            {meeting.talk_time_rep_pct !== null && meeting.talk_time_customer_pct !== null && (
              <div className="space-y-4">
                <TalkTimeChart 
                  repPct={meeting.talk_time_rep_pct}
                  customerPct={meeting.talk_time_customer_pct}
                  meetingDate={meeting.meeting_start}
                />
                <CoachingInsights 
                  metrics={{
                    repPct: meeting.talk_time_rep_pct,
                    customerPct: meeting.talk_time_customer_pct,
                    sentimentScore: meeting.sentiment_score || undefined,
                    meetingId: meeting.id,
                    meetingDate: meeting.meeting_start,
                  }}
                />
              </div>
            )}

            {/* Tabbed Interface: Summary, Transcript, Ask AI, Content */}
            <div className="section-card">
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-4">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="transcript">Transcript</TabsTrigger>
                  <TabsTrigger value="ask-ai">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Ask AI
                  </TabsTrigger>
                  <TabsTrigger value="content">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Content
                  </TabsTrigger>
                </TabsList>

                {/* Summary Tab */}
                <TabsContent value="summary" className="mt-0">
                  {/* Quick Actions */}
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => handleQuickAdd('meeting')}>Add Meeting</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleQuickAdd('outbound')}>Add Outbound</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleQuickAdd('proposal')}>Add Proposal</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleQuickAdd('sale')}>Add Sale</Button>
                  </div>

                  {/* AI Structured Summary (classification, outcomes, objections, etc.) */}
                  <div className="mb-4">
                    <StructuredMeetingSummary meetingId={meeting.id} onSummaryReady={setHasStructuredSummary} />
                  </div>

                  {/* Only show basic summary when no structured summary is available */}
                  {!hasStructuredSummary && meeting.summary ? (
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      {(() => {
                        try {
                          // Try to parse as JSON first (Fathom format)
                          const parsed = JSON.parse(meeting.summary);
                          if (parsed.markdown_formatted) {
                            // Parse and render markdown content
                            const html = parseMarkdownSummary(parsed.markdown_formatted);
                            return <div ref={summaryRef} dangerouslySetInnerHTML={{ __html: html }} />;
                          }
                          return <div ref={summaryRef} className="whitespace-pre-line">{meeting.summary}</div>;
                        } catch {
                          // If not JSON, just display as plain text
                          return <div ref={summaryRef} className="whitespace-pre-line">{meeting.summary}</div>;
                        }
                      })()}
                    </div>
                  ) : meeting.summary_status === 'processing' ? (
                    <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                      <div>
                        <p className="text-sm font-medium text-blue-400">Generating summary...</p>
                        <p className="text-xs text-muted-foreground mt-1">This usually takes 1-2 minutes after the transcript is ready.</p>
                      </div>
                    </div>
                  ) : meeting.summary_status === 'pending' ? (
                    <div className="flex items-center gap-3 p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                      <Clock className="h-5 w-5 text-zinc-400" />
                      <div>
                        <p className="text-sm font-medium text-zinc-300">Queued for processing</p>
                        <p className="text-xs text-muted-foreground mt-1">Summary will be generated once the transcript is ready.</p>
                      </div>
                    </div>
                  ) : meeting.summary_status === 'failed' ? (
                    <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                      <div>
                        <p className="text-sm font-medium text-red-400">Summary generation failed</p>
                        <p className="text-xs text-muted-foreground mt-1">Please try syncing again from Fathom.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Summary will be available after Fathom processes the recording (5-10 minutes after meeting ends).
                    </p>
                  )}

                  <div className="mt-3 flex gap-2 flex-wrap">
                    {meeting.transcript_doc_url && (
                      <Button asChild variant="outline" size="sm">
                        <a href={meeting.transcript_doc_url} target="_blank" rel="noopener noreferrer">
                          <FileText className="h-3 w-3 mr-2" />
                          Open transcript
                          <ExternalLink className="h-3 w-3 ml-2" />
                        </a>
                      </Button>
                    )}
                    {meeting.share_url && (
                      <Button asChild variant="outline" size="sm">
                        <a href={meeting.share_url} target="_blank" rel="noopener noreferrer">
                          Open in {meeting.provider === 'fireflies' ? 'Fireflies' : 'Fathom'}
                          <ExternalLink className="h-3 w-3 ml-2" />
                        </a>
                      </Button>
                    )}
                  </div>
                </TabsContent>

                {/* Transcript Tab */}
                <TabsContent value="transcript" className="mt-0">
                  {meeting.transcript_text ? (
                    <div className="max-h-[600px] overflow-y-auto pr-1 scrollbar-custom">
                      <div className="text-sm space-y-0">
                      {(() => {
                        const speakerSlotMap = new Map<string, number>();
                        let slotIdx = 0;
                        const getSlot = (speaker: string) => {
                          if (!speakerSlotMap.has(speaker)) speakerSlotMap.set(speaker, slotIdx++ % SPEAKER_CONFIGS.length);
                          return speakerSlotMap.get(speaker)!;
                        };
                        const getFirstName = (name: string) => name.trim().split(/\s+/)[0];

                        const lines = meeting.transcript_text!.split('\n');
                        const result: React.ReactNode[] = [];
                        let prevSpeaker: string | null = null;

                        lines.forEach((line, idx) => {
                          // Timestamped format: [HH:MM:SS] Speaker: text
                          const tsMatch = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s+([^:]+):\s*(.*)$/);
                          if (tsMatch) {
                            const [, ts, speaker, text] = tsMatch;
                            const seconds = parseTimestampToSeconds(ts);
                            const sp = speaker.trim();
                            const slot = getSlot(sp);
                            const { gradient, color, rowHoverClass, tsHoverClass } = SPEAKER_CONFIGS[slot];
                            const firstName = getFirstName(sp);
                            const initial = firstName[0]?.toUpperCase() ?? '?';
                            const isCont = sp === prevSpeaker;
                            const avatarUrl = speakerAvatarMap.get(sp) || speakerAvatarMap.get(firstName);

                            if (!isCont && prevSpeaker !== null) {
                              result.push(
                                <div key={`br-${idx}`} className="my-2 h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-700/40 to-transparent" />
                              );
                            }

                            const inner = (
                              <div className={`group w-full text-left flex items-start gap-3 px-2 py-2 rounded-lg border border-transparent transition-all duration-150 ${rowHoverClass}`}>
                                {/* Speaker avatar + name column */}
                                <div className="w-9 shrink-0 flex flex-col items-center gap-1 pt-0.5">
                                  {!isCont ? (
                                    <>
                                      {avatarUrl ? (
                                        <img src={avatarUrl} alt={firstName} className="w-6 h-6 rounded-md object-cover shrink-0" />
                                      ) : (
                                        <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                             style={{ background: gradient }}>
                                          {initial}
                                        </div>
                                      )}
                                      <span className="text-[10px] font-medium leading-none" style={{ color }}>{firstName}</span>
                                    </>
                                  ) : (
                                    <div className="w-6 h-6" />
                                  )}
                                </div>
                                {/* Content + timestamp */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm">{text}</p>
                                    {seconds !== null && (
                                      <span className={`font-mono text-[11px] text-gray-400 dark:text-gray-500 shrink-0 mt-0.5 transition-colors ${tsHoverClass}`}>{ts}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );

                            result.push(
                              seconds !== null ? (
                                <button key={idx} className="w-full text-left" onClick={() => handleTimestampJump(seconds)}>
                                  {inner}
                                </button>
                              ) : (
                                <div key={idx}>{inner}</div>
                              )
                            );
                            prevSpeaker = sp;
                            return;
                          }

                          // Legacy format: Speaker: text (no timestamp)
                          const spMatch = line.match(/^([^:]+):\s*(.*)$/);
                          if (spMatch) {
                            const [, speaker, text] = spMatch;
                            const sp = speaker.trim();
                            const slot = getSlot(sp);
                            const { gradient, color, rowHoverClass } = SPEAKER_CONFIGS[slot];
                            const firstName = getFirstName(sp);
                            const initial = firstName[0]?.toUpperCase() ?? '?';
                            const isCont = sp === prevSpeaker;
                            const avatarUrl = speakerAvatarMap.get(sp) || speakerAvatarMap.get(firstName);

                            if (!isCont && prevSpeaker !== null) {
                              result.push(
                                <div key={`br-${idx}`} className="my-2 h-px bg-gradient-to-r from-transparent via-gray-200/60 dark:via-gray-700/40 to-transparent" />
                              );
                            }
                            result.push(
                              <div key={idx} className={`flex items-start gap-3 px-2 py-2 rounded-lg border border-transparent ${rowHoverClass}`}>
                                <div className="w-9 shrink-0 flex flex-col items-center gap-1 pt-0.5">
                                  {!isCont ? (
                                    <>
                                      {avatarUrl ? (
                                        <img src={avatarUrl} alt={firstName} className="w-6 h-6 rounded-md object-cover shrink-0" />
                                      ) : (
                                        <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                             style={{ background: gradient }}>
                                          {initial}
                                        </div>
                                      )}
                                      <span className="text-[10px] font-medium leading-none" style={{ color }}>{firstName}</span>
                                    </>
                                  ) : (
                                    <div className="w-6 h-6" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm">{text}</p>
                                </div>
                              </div>
                            );
                            prevSpeaker = sp;
                            return;
                          }

                          // Plain text line
                          if (line.trim()) {
                            result.push(<div key={idx} className="text-sm text-muted-foreground pl-12 py-1">{line}</div>);
                          }
                        });

                        return result;
                      })()}
                      </div>
                    </div>
                  ) : meeting.transcript_status === 'processing' ? (
                    <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                      <div>
                        <p className="text-sm font-medium text-blue-400">Fetching transcript...</p>
                        <p className="text-xs text-muted-foreground mt-1">Downloading from Fathom. This usually takes 1-3 minutes.</p>
                      </div>
                    </div>
                  ) : meeting.transcript_status === 'pending' ? (
                    <div className="flex items-center gap-3 p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                      <Clock className="h-5 w-5 text-zinc-400" />
                      <div>
                        <p className="text-sm font-medium text-zinc-300">Queued for processing</p>
                        <p className="text-xs text-muted-foreground mt-1">Transcript will be fetched from Fathom shortly.</p>
                      </div>
                    </div>
                  ) : meeting.transcript_status === 'failed' ? (
                    <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                      <div>
                        <p className="text-sm font-medium text-red-400">Transcript fetch failed</p>
                        <p className="text-xs text-muted-foreground mt-1">Please try syncing again from Fathom.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Transcript will be available after Fathom processes the recording.
                    </p>
                  )}
                </TabsContent>

                {/* Ask AI Tab */}
                <TabsContent value="ask-ai" className="mt-0">
                  <AskAIChat meetingId={meeting.id} />
                </TabsContent>

                {/* Content Tab */}
                <TabsContent value="content" className="mt-0">
                  <MeetingContent meeting={meeting} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
        {/* End of Left Column */}

        {/* Right Column - Sidebar */}
        <div className="lg:col-span-4 space-y-3 sm:space-y-4 min-w-0">
          {/* Quick Actions */}
          {meeting && (
            <QuickActionsCard
              meeting={meeting}
              onEmailClick={() => toast.info('Email follow-up requires OAuth setup — coming soon')}
              onBookCallClick={() => toast.info('Book call feature coming soon')}
              onShareClick={() => setShowShareModal(true)}
            />
          )}

          {/* Attendees */}
          <div className="section-card">
            <div className="font-semibold mb-3">Attendees ({attendees.length})</div>
            <div className="space-y-1">
              {attendees.length > 0 ? (
                (() => {
                  // Build speaker→slot map matching transcript color assignment
                  const attendeeSlotMap = new Map<string, number>();
                  let slotCounter = 0;
                  for (const a of attendees) {
                    const name = a.name?.trim();
                    if (name && !attendeeSlotMap.has(name)) {
                      attendeeSlotMap.set(name, slotCounter++ % SPEAKER_CONFIGS.length);
                    }
                  }
                  return attendees.map((attendee, idx) => {
                  const isExternal = attendee.is_external;
                  const contactId = isExternal ? attendee.id : null;
                  const firstName = attendee.name?.trim().split(/\s+/)[0] ?? '';
                  const initial = firstName[0]?.toUpperCase() ?? '?';
                  const avatarUrl = speakerAvatarMap.get(attendee.name ?? '') || speakerAvatarMap.get(firstName);
                  const speakerName = attendee.name?.trim() ?? '';
                  const colorSlot = attendeeSlotMap.get(speakerName) ?? (idx % SPEAKER_CONFIGS.length);

                  const content = (
                    <div className="flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-900/40 transition-colors">
                      {/* Avatar */}
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={firstName}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                          style={{ background: SPEAKER_CONFIGS[colorSlot].gradient }}
                        >
                          {initial}
                        </div>
                      )}
                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{attendee.name}</div>
                        {attendee.email && (
                          <div className="text-xs text-muted-foreground truncate">{attendee.email}</div>
                        )}
                      </div>
                      {/* Badge */}
                      {isExternal ? (
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300 shrink-0">
                          External
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0">
                          Internal
                        </Badge>
                      )}
                    </div>
                  );

                  return contactId ? (
                    <Link key={attendee.id} to={`/crm/contacts/${contactId}`} className="block">
                      {content}
                    </Link>
                  ) : (
                    <div key={attendee.id}>
                      {content}
                    </div>
                  );
                });
                })()
              ) : (
                <p className="text-sm text-muted-foreground">No attendees recorded</p>
              )}
            </div>
          </div>

          {/* Meeting Info */}
          <div className="section-card">
            <div className="font-semibold mb-2">Meeting Info</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration:</span>
                <span>{getDisplayDuration(meeting)} minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Host:</span>
                <span className="truncate ml-2">{meeting.owner_email || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start:</span>
                <span>{new Date(meeting.meeting_start).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">End:</span>
                <span>{new Date(meeting.meeting_end).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          {/* Debug Info - development only */}
          {import.meta.env.DEV && (
            <div className="section-card">
              <div className="font-semibold mb-2">Debug Info</div>
              <div className="text-xs font-mono text-muted-foreground space-y-1 break-all">
                <div>
                  <span className="text-muted-foreground/70">Recording ID:</span>
                  <br />
                  {meeting.fathom_recording_id}
                </div>
                <div>
                  <span className="text-muted-foreground/70">Share URL:</span>
                  <br />
                  {meeting.share_url}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {meeting && (
        <ProposalWizard
          open={showProposalWizard}
          onOpenChange={setShowProposalWizard}
          meetingIds={[meeting.id]}
          contactName={meeting.contact?.email || undefined}
          companyName={companyName || meeting.company?.name}
        />
      )}
      {/* Share Meeting Modal */}
      {meeting && (
        <ShareMeetingModal
          open={showShareModal}
          onOpenChange={setShowShareModal}
          meetingId={meeting.id}
          meetingTitle={meeting.title}
          sourceType={meeting.source_type || null}
          fathomShareUrl={meeting.share_url}
          voiceRecordingId={meeting.voice_recording_id}
          hasSummary={!!meeting.summary}
          hasActionItems={actionItems.length > 0}
          hasTranscript={!!meeting.transcript_text}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/clientV2';
import {
  Loader2,
  AlertCircle,
  Clock,
  Calendar,
  Lightbulb,
  ScrollText,
  Video,
  Sparkles,
  Copy,
  Check,
  Download,
  Lock,
  Mail,
  ArrowRight,
  Eye,
  Mic,
  FileText,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatVoiceTranscript,
  downloadTranscriptTxt,
  copyToClipboard,
} from '@/lib/utils/transcriptExport';
import { VoiceRecorderAudioPlayer, type AudioPlayerRef } from '@/components/voice-recorder/VoiceRecorderAudioPlayer';
import { VideoPlayer, type VideoPlayerHandle } from '@/components/ui/VideoPlayer';
import FathomPlayerV2, { type FathomPlayerV2Handle } from '@/components/FathomPlayerV2';
import { TranscriptModal } from '@/components/voice-recorder/TranscriptModal';
import type { TranscriptSegment, Speaker } from '@/components/voice-recorder/types';


const SIXTY_ICON_URL =
  'https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png';

// Speaker color system matching MeetingDetail
const SPEAKER_CONFIGS = [
  {
    gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
    color: '#60a5fa',
    bg: 'bg-blue-500/10',
    border: 'border-blue-400/20',
    hoverBg: 'hover:bg-blue-500/10',
    rowHoverClass: 'group-hover:bg-blue-500/10 group-hover:border-blue-400/20',
    tsHoverClass: 'group-hover:text-blue-400',
  },
  {
    gradient: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
    color: '#a78bfa',
    bg: 'bg-violet-500/10',
    border: 'border-violet-400/20',
    hoverBg: 'hover:bg-violet-500/10',
    rowHoverClass: 'group-hover:bg-violet-500/10 group-hover:border-violet-400/20',
    tsHoverClass: 'group-hover:text-violet-400',
  },
  {
    gradient: 'linear-gradient(135deg, #059669, #34d399)',
    color: '#34d399',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-400/20',
    hoverBg: 'hover:bg-emerald-500/10',
    rowHoverClass: 'group-hover:bg-emerald-500/10 group-hover:border-emerald-400/20',
    tsHoverClass: 'group-hover:text-emerald-400',
  },
  {
    gradient: 'linear-gradient(135deg, #ea580c, #fb923c)',
    color: '#fb923c',
    bg: 'bg-orange-500/10',
    border: 'border-orange-400/20',
    hoverBg: 'hover:bg-orange-500/10',
    rowHoverClass: 'group-hover:bg-orange-500/10 group-hover:border-orange-400/20',
    tsHoverClass: 'group-hover:text-orange-400',
  },
  {
    gradient: 'linear-gradient(135deg, #db2777, #f472b6)',
    color: '#f472b6',
    bg: 'bg-pink-500/10',
    border: 'border-pink-400/20',
    hoverBg: 'hover:bg-pink-500/10',
    rowHoverClass: 'group-hover:bg-pink-500/10 group-hover:border-pink-400/20',
    tsHoverClass: 'group-hover:text-pink-400',
  },
  {
    gradient: 'linear-gradient(135deg, #0891b2, #22d3ee)',
    color: '#22d3ee',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-400/20',
    hoverBg: 'hover:bg-cyan-500/10',
    rowHoverClass: 'group-hover:bg-cyan-500/10 group-hover:border-cyan-400/20',
    tsHoverClass: 'group-hover:text-cyan-400',
  },
];

// Parse "[HH:MM:SS]" or "H:MM" timestamp to seconds
function parseTimestampToSeconds(ts: string): number | null {
  const parts = ts.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

// Parsed transcript segment from raw text
interface ParsedTranscriptLine {
  speaker: string;
  text: string;
  timestamp: string | null;
  seconds: number | null;
}

// Known bot/system speaker names that should be remapped to a real person
const BOT_SPEAKER_NAMES = new Set([
  '60 notetaker',
  '60_notetaker',
  'notetaker',
  'ai notetaker',
  'meeting bot',
  'bot',
]);

function isBotSpeaker(name: string): boolean {
  return BOT_SPEAKER_NAMES.has(name.toLowerCase().trim());
}

/**
 * Extract real speaker names from a meeting title like "MALCOLM PORTER and Andrew Bryce"
 */
function extractNamesFromTitle(title: string): string[] {
  // Split on " and " (case-insensitive)
  const parts = title.split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean);
  // Also try comma separation: "Name1, Name2"
  if (parts.length === 1) {
    return title.split(/[,&]/).map(s => s.trim()).filter(Boolean);
  }
  return parts;
}

/**
 * Parse raw transcript_text into structured segments.
 * Handles: "[HH:MM:SS] Speaker Name: text" and "Speaker: text"
 * Resolves bot speaker names (e.g. "60 Notetaker") to the real person using the meeting title.
 */
function parseRawTranscript(raw: string, meetingTitle?: string): ParsedTranscriptLine[] {
  const lines = raw.split('\n');
  const result: ParsedTranscriptLine[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Timestamped format: [HH:MM:SS] Speaker: text
    const tsMatch = line.match(/^\[(\d{1,2}:\d{2}:\d{2})\]\s+([^:]+):\s*(.*)$/);
    if (tsMatch) {
      const [, ts, speaker, text] = tsMatch;
      result.push({
        speaker: speaker.trim(),
        text: text.trim(),
        timestamp: ts,
        seconds: parseTimestampToSeconds(ts),
      });
      continue;
    }

    // Legacy format: Speaker: text (no timestamp)
    const spMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (spMatch) {
      const [, speaker, text] = spMatch;
      result.push({
        speaker: speaker.trim(),
        text: text.trim(),
        timestamp: null,
        seconds: null,
      });
      continue;
    }

    // Plain text — append to previous segment or create anonymous
    if (result.length > 0) {
      result[result.length - 1].text += ' ' + line.trim();
    }
  }

  // Resolve bot speaker names to real people
  const realSpeakers = new Set(result.map(r => r.speaker).filter(s => !isBotSpeaker(s)));
  const hasBotSpeaker = result.some(r => isBotSpeaker(r.speaker));

  if (hasBotSpeaker) {
    // Try to find the missing real name from the meeting title
    let resolvedName: string | null = null;

    if (meetingTitle) {
      const titleNames = extractNamesFromTitle(meetingTitle);
      // Find a title name that doesn't match any existing real speaker
      for (const titleName of titleNames) {
        const titleLower = titleName.toLowerCase();
        const alreadyInTranscript = Array.from(realSpeakers).some(s =>
          s.toLowerCase().includes(titleLower) || titleLower.includes(s.toLowerCase())
        );
        if (!alreadyInTranscript) {
          resolvedName = titleName;
          break;
        }
      }
    }

    if (resolvedName) {
      // Replace all bot speaker entries with the resolved name
      for (const entry of result) {
        if (isBotSpeaker(entry.speaker)) {
          entry.speaker = resolvedName;
        }
      }
    }
  }

  return result;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ShareOptions {
  include_summary: boolean;
  include_action_items: boolean;
  include_transcript: boolean;
  include_recording: boolean;
}

interface ActionItem {
  id: string;
  text: string;
  completed?: boolean;
  owner?: string;
  due_date?: string;
}

interface HighlightItem {
  type: string;
  text: string;
}

interface MeetingData {
  id: string;
  title: string;
  start_time: string | null;
  duration_minutes: number | null;
  summary: string | null;
  action_items: ActionItem[] | null;
  highlights: HighlightItem[] | null;
  transcript_text: string | null;
  source_type: string | null;
  share_url: string | null;
  share_token: string;
  share_views: number;
  share_options: ShareOptions;
  share_mode: string | null;
  voice_recording_id: string | null;
  recording_id: string | null;
  video_url: string | null;
  attendees?: Array<{ name?: string; email?: string }>;
}

// A meeting has a video if it has a recording_id (video lives on recordings table)
function meetingHasVideo(m: MeetingData | null): boolean {
  if (!m) return false;
  return !!m.recording_id || !!m.video_url;
}

interface VoiceRecordingData {
  id: string;
  duration_seconds: number | null;
  transcript_segments: TranscriptSegment[] | null;
  speakers: Speaker[] | null;
  share_token: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Date not set';
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Parse meeting summary — handles both plain text and Fathom JSON format.
 * Fathom stores `{"markdown_formatted":"## Meeting Purpose\n\n..."}` with
 * Key Takeaways as markdown bullets containing `[**Type:** text](url)`.
 * Returns a clean summary string and extracted highlights.
 */
function parseMeetingSummary(raw: string): { summary: string; extractedHighlights: HighlightItem[] } {
  let markdown = raw;

  // Try parsing as JSON (Fathom format)
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.markdown_formatted) {
      markdown = parsed.markdown_formatted;
    } else if (typeof parsed === 'string') {
      markdown = parsed;
    }
  } catch {
    // Not JSON — use as-is (60_notetaker plain text)
    return { summary: raw, extractedHighlights: [] };
  }

  // Extract Key Takeaways bullets as highlights
  const highlights: HighlightItem[] = [];
  const takeawaysMatch = markdown.match(/## Key Takeaways\s*\n([\s\S]*?)(?=\n## |\n\n## |$)/);
  if (takeawaysMatch) {
    const bullets = takeawaysMatch[1].match(/- \[.*?\]\(.*?\)/g) || [];
    for (const bullet of bullets) {
      // Format: - [**Type:** text](url)
      const inner = bullet.match(/- \[(.*?)\]\(/)?.[1] || '';
      const typeMatch = inner.match(/\*\*(.+?):\*\*\s*/);
      const type = typeMatch?.[1]?.toLowerCase().replace(/\s+/g, '_') || 'key_point';
      const text = inner.replace(/\*\*.*?\*\*\s*/, '').trim();
      if (text) {
        highlights.push({ type, text });
      }
    }
  }

  // Build clean summary: take "Meeting Purpose" and "Topics" sections, skip Key Takeaways
  const sections = markdown.split(/\n## /);
  const cleanParts: string[] = [];
  for (const section of sections) {
    const heading = section.split('\n')[0].trim();
    // Skip Key Takeaways (extracted as highlights) and empty sections
    if (heading.toLowerCase().includes('key takeaway')) continue;
    // Get content after heading
    const content = section.substring(heading.length).trim();
    if (!content) continue;
    // Clean markdown: strip links [text](url) → text, bold, headers
    const cleaned = content
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (cleaned) cleanParts.push(cleaned);
  }

  const summary = cleanParts.join('\n\n').trim() || markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { summary, extractedHighlights: highlights };
}

function getHighlightBadgeStyle(type: string): { bg: string; text: string; border: string } {
  switch (type) {
    case 'key_point':
      return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
    case 'question':
      return { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' };
    case 'decision':
    case 'solution':
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' };
    case 'action_item':
    case 'next_step':
      return { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' };
    case 'problem':
      return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' };
    case 'pivot':
      return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' };
    default:
      return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
  }
}

function getSpeakerConfig(speakerName: string, speakerMap: Map<string, number>) {
  if (!speakerMap.has(speakerName)) {
    speakerMap.set(speakerName, speakerMap.size);
  }
  const idx = speakerMap.get(speakerName)!;
  return SPEAKER_CONFIGS[idx % SPEAKER_CONFIGS.length];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PublicMeetingShare() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const accessTokenParam = searchParams.get('access');

  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [voiceRecording, setVoiceRecording] = useState<VoiceRecordingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [shareMode, setShareMode] = useState<string>('public');
  const [emailInput, setEmailInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);

  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [transcriptCopied, setTranscriptCopied] = useState(false);
  const [showAllHighlights, setShowAllHighlights] = useState(false);
  const [showFullSummary, setShowFullSummary] = useState(false);
  const [signedVideoUrl, setSignedVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const audioPlayerRef = useRef<AudioPlayerRef>(null);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
  const fathomPlayerRef = useRef<FathomPlayerV2Handle>(null);

  // Speaker color mapping
  const speakerColorMap = useRef(new Map<string, number>());

  // ─── Access Verification ────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;

    const storedAccess = sessionStorage.getItem(`meeting_access_${token}`);
    if (storedAccess) {
      try {
        const parsed = JSON.parse(storedAccess);
        if (parsed.authorized) {
          setIsAuthorized(true);
          setVerifiedEmail(parsed.email || null);
          fetchMeetingViaRpc();
          return;
        }
      } catch { /* ignore */ }
    }

    verifyAccess();
  }, [token]);

  const verifyAccess = useCallback(async () => {
    if (!token) return;
    setLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc('verify_meeting_share_access', {
        p_share_token: token,
        p_access_token: accessTokenParam || null,
        p_email: null,
      });

      if (rpcError) {
        console.error('Verify access error:', rpcError);
        setError('Failed to verify access.');
        setLoading(false);
        return;
      }

      if (data?.authorized) {
        setIsAuthorized(true);
        setShareMode(data.mode || 'public');
        setVerifiedEmail(data.email || null);
        sessionStorage.setItem(`meeting_access_${token}`, JSON.stringify(data));
        await fetchMeetingViaRpc();
      } else if (data?.reason === 'meeting_not_found') {
        setError('Meeting not found or link has expired.');
        setLoading(false);
      } else if (data?.reason === 'not_authorized') {
        setShareMode('private');
        setLoading(false);
      } else {
        setError('Unable to access this meeting.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Verify error:', err);
      setError('An unexpected error occurred.');
      setLoading(false);
    }
  }, [token, accessTokenParam]);

  const handleEmailVerify = useCallback(async () => {
    if (!token || !emailInput.trim()) return;

    setIsVerifying(true);
    setVerifyError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('verify_meeting_share_access', {
        p_share_token: token,
        p_access_token: null,
        p_email: emailInput.trim(),
      });

      if (rpcError) throw rpcError;

      if (data?.authorized) {
        setIsAuthorized(true);
        setVerifiedEmail(data.email || emailInput.trim());
        sessionStorage.setItem(`meeting_access_${token}`, JSON.stringify(data));
        await fetchMeetingViaRpc();
      } else {
        setVerifyError('This email does not have access to this meeting.');
      }
    } catch (err) {
      console.error('Email verify error:', err);
      setVerifyError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  }, [token, emailInput]);

  // ─── Data Fetching (via RPC to bypass RLS) ─────────────────────────────

  const fetchMeetingViaRpc = useCallback(async () => {
    if (!token) return;
    setLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc('get_shared_meeting', {
        p_share_token: token,
      });

      if (rpcError) {
        console.error('Fetch meeting RPC error:', rpcError);
        setError('Failed to load meeting.');
        setLoading(false);
        return;
      }

      if (!data?.found) {
        setError('Meeting not found or link has expired.');
        setLoading(false);
        return;
      }

      const meetingData = {
        ...data.meeting,
        attendees: data.attendees?.filter((a: { name?: string; email?: string }) => a.name || a.email) || [],
      } as MeetingData;

      setMeeting(meetingData);

      // Set voice recording from RPC response
      if (data.voice_recording) {
        setVoiceRecording(data.voice_recording);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // ─── Video URL Signing (for S3 videos) ─────────────────────────────────

  const fetchSignedVideoUrl = useCallback(async (shareToken: string) => {
    setVideoLoading(true);
    setVideoError(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('meeting-router', {
        body: { action: 'share_video_url', share_token: shareToken },
      });

      if (fnError || !data?.url) {
        console.error('Failed to get signed video URL:', fnError || data?.error);
        setVideoError(true);
        return;
      }

      setSignedVideoUrl(data.url);
    } catch (err) {
      console.error('Error fetching signed video URL:', err);
      setVideoError(true);
    } finally {
      setVideoLoading(false);
    }
  }, []);

  // Fetch signed video URL for any meeting with a recording
  useEffect(() => {
    if (meetingHasVideo(meeting) && token) {
      fetchSignedVideoUrl(token);
    }
  }, [meeting?.recording_id, meeting?.video_url, token, fetchSignedVideoUrl]);

  // ─── Transcript Handlers ────────────────────────────────────────────────

  const handleTranscriptSeek = useCallback((time: number) => {
    videoPlayerRef.current?.seek(time);
    audioPlayerRef.current?.seek(time);
    audioPlayerRef.current?.play();
    fathomPlayerRef.current?.seekToTimestamp(time);
    // Scroll video/audio into view
    const playerEl = document.querySelector('[data-player-container]');
    playerEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const getTranscriptText = useCallback((): string | null => {
    if (voiceRecording?.transcript_segments?.length) {
      return formatVoiceTranscript(voiceRecording.transcript_segments);
    }
    return meeting?.transcript_text || null;
  }, [voiceRecording, meeting]);

  const handleCopyTranscript = useCallback(async () => {
    const text = getTranscriptText();
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setTranscriptCopied(true);
      setTimeout(() => setTranscriptCopied(false), 2000);
    }
  }, [getTranscriptText]);

  const handleDownloadTranscript = useCallback(() => {
    const text = getTranscriptText();
    if (!text || !meeting) return;
    const attendeeNames = meeting.attendees?.map(a => a.name || a.email || '').filter(Boolean) || [];
    downloadTranscriptTxt({
      title: meeting.title || 'Meeting',
      date: meeting.start_time,
      attendees: attendeeNames,
      transcriptText: text,
    });
  }, [getTranscriptText, meeting]);

  // ─── Derived State ──────────────────────────────────────────────────────

  const hasVoiceRecording = meeting?.source_type === 'voice' && voiceRecording;
  const hasFathomRecording = meeting?.source_type === 'fathom' && meeting?.share_url;
  const hasVideo = meetingHasVideo(meeting);
  const hasAnyMedia = hasVoiceRecording || hasFathomRecording || hasVideo;
  const transcript = voiceRecording?.transcript_segments || [];
  const speakers = voiceRecording?.speakers || [];

  // Parse summary (handles Fathom JSON + markdown) and merge highlights
  const { cleanSummary, allHighlights } = useMemo(() => {
    if (!meeting?.summary) return { cleanSummary: '', allHighlights: meeting?.highlights || [] };
    const { summary, extractedHighlights } = parseMeetingSummary(meeting.summary);
    // Use DB highlights if available, otherwise use extracted from summary
    const highlights = (meeting.highlights && meeting.highlights.length > 0)
      ? meeting.highlights
      : extractedHighlights;
    return { cleanSummary: summary, allHighlights: highlights };
  }, [meeting?.summary, meeting?.highlights]);

  // Parse raw transcript_text into structured segments (for 60_notetaker / non-voice meetings)
  // Passes meeting title so bot speaker names (e.g. "60 Notetaker") can be resolved to real people
  const parsedTranscript = useMemo(() => {
    if (transcript.length > 0) return []; // Voice recordings already have structured segments
    if (!meeting?.transcript_text) return [];
    return parseRawTranscript(meeting.transcript_text, meeting.title);
  }, [transcript.length, meeting?.transcript_text, meeting?.title]);

  // Transcript always visible when data exists
  const hasTranscriptContent = transcript.length > 0 || parsedTranscript.length > 0;

  // Derive participants from transcript speakers (most reliable) or attendees fallback
  // Filters out bot names that weren't resolved during parsing
  const meetingParticipants = useMemo(() => {
    const names: string[] = [];
    if (parsedTranscript.length > 0) {
      const seen = new Set<string>();
      for (const line of parsedTranscript) {
        if (line.speaker && !seen.has(line.speaker) && !isBotSpeaker(line.speaker)) {
          seen.add(line.speaker);
          names.push(line.speaker);
        }
      }
    } else if (transcript.length > 0) {
      const seen = new Set<string>();
      for (const seg of transcript) {
        if (seg.speaker && !seen.has(seg.speaker) && !isBotSpeaker(seg.speaker)) {
          seen.add(seg.speaker);
          names.push(seg.speaker);
        }
      }
    }
    // Fallback to attendees from RPC
    if (names.length === 0 && meeting?.attendees?.length) {
      for (const a of meeting.attendees) {
        const name = a.name || a.email;
        if (name && !isBotSpeaker(name)) names.push(name);
      }
    }
    return names;
  }, [parsedTranscript, transcript, meeting?.attendees]);

  // ─── Auto-scroll transcript to current segment ─────────────────────────

  const transcriptPanelRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLButtonElement>(null);
  const userScrolledRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Detect user manual scroll via pointer interaction (wheel / touch / drag)
  // This avoids false positives from programmatic scrollTo
  useEffect(() => {
    const panel = transcriptPanelRef.current;
    if (!panel) return;

    const pauseAutoScroll = () => {
      userScrolledRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        userScrolledRef.current = false;
      }, 6000);
    };

    // These events only fire from real user interaction, never from scrollTo
    panel.addEventListener('wheel', pauseAutoScroll, { passive: true });
    panel.addEventListener('touchmove', pauseAutoScroll, { passive: true });
    panel.addEventListener('pointerdown', pauseAutoScroll, { passive: true });
    return () => {
      panel.removeEventListener('wheel', pauseAutoScroll);
      panel.removeEventListener('touchmove', pauseAutoScroll);
      panel.removeEventListener('pointerdown', pauseAutoScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [hasTranscriptContent]);

  // Works for both voice transcript segments and parsed raw transcript
  const activeSegmentIdx = useMemo(() => {
    if (currentTime === 0) return -1;
    // Voice recording segments
    if (transcript.length > 0) {
      let best = -1;
      for (let i = 0; i < transcript.length; i++) {
        const st = transcript[i].start_time ?? 0;
        if (st <= currentTime) best = i;
        else break;
      }
      return best;
    }
    // Parsed raw transcript
    if (parsedTranscript.length > 0) {
      let best = -1;
      for (let i = 0; i < parsedTranscript.length; i++) {
        const st = parsedTranscript[i].seconds ?? 0;
        if (st <= currentTime) best = i;
        else break;
      }
      return best;
    }
    return -1;
  }, [transcript, parsedTranscript, currentTime]);

  // Auto-scroll to active segment — always pins it to the top of the panel
  useEffect(() => {
    if (userScrolledRef.current) return; // User is manually browsing — paused
    if (activeSegmentIdx < 0 || !activeSegmentRef.current || !transcriptPanelRef.current) return;
    const panel = transcriptPanelRef.current;
    const el = activeSegmentRef.current;
    // Calculate where the element is inside the scroll container
    // Subtract 12px so the segment isn't flush against the top edge
    const panelTop = panel.getBoundingClientRect().top;
    const elTop = el.getBoundingClientRect().top;
    const scrollTarget = elTop - panelTop + panel.scrollTop - 12;
    panel.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
  }, [activeSegmentIdx]);


  // ─── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src={SIXTY_ICON_URL} alt="60" className="w-10 h-10 rounded-lg" />
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            <span className="text-sm text-gray-500">Loading meeting...</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <img src={SIXTY_ICON_URL} alt="60" className="w-12 h-12 rounded-lg mx-auto mb-6" />
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-100 mb-2">Unable to Load Meeting</h1>
          <p className="text-sm text-gray-400 leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  // ─── Email Gate (Private Mode) ──────────────────────────────────────────

  if (!isAuthorized && shareMode === 'private') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-gray-700/30 bg-gray-900/60 backdrop-blur-xl shadow-lg p-6">
            <img src={SIXTY_ICON_URL} alt="60" className="w-16 h-16 rounded-xl mx-auto mb-5" />

            <h1 className="text-base font-semibold text-gray-100 text-center mb-1">
              Private Meeting
            </h1>
            <p className="text-sm text-gray-400 text-center mb-6">
              Enter the email address that was invited to verify your access.
            </p>

            <div className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    setVerifyError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleEmailVerify();
                    }
                  }}
                  className={cn(
                    'w-full pl-10 pr-3 py-2.5 bg-gray-800/80 border rounded-lg text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 transition-all duration-200',
                    verifyError
                      ? 'border-red-500/50 focus:ring-red-500/20'
                      : 'border-gray-700/50 focus:ring-emerald-500/20 focus:border-emerald-500/40'
                  )}
                  autoFocus
                />
              </div>

              {verifyError && (
                <p className="text-xs text-red-400">{verifyError}</p>
              )}

              <button
                onClick={handleEmailVerify}
                disabled={isVerifying || !emailInput.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isVerifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Verify Access
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="text-center text-gray-600 text-xs mt-5">
            Powered by <span className="font-medium text-gray-500">60</span>
          </p>
        </div>
      </div>
    );
  }

  if (!meeting) return null;

  const sourceLabel = meeting.source_type === '60_notetaker' ? '60 Notetaker'
    : meeting.source_type === 'fathom' ? 'Fathom'
    : meeting.source_type === 'voice' ? 'Voice Recording'
    : meeting.source_type?.replace('_', ' ') || 'Meeting';

  // ─── Main Content ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Sticky top bar */}
      <div className="border-b border-white/[0.06] bg-gray-950/80 backdrop-blur-2xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={SIXTY_ICON_URL} alt="60" className="w-8 h-8 rounded-lg shadow-lg shadow-black/20" />
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="w-px h-4 bg-white/10" />
              <span className="text-[13px] text-gray-500 font-medium tracking-tight">Shared Meeting</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {verifiedEmail && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.04] border border-white/[0.06] rounded-full text-xs text-gray-400">
                <Lock className="w-3 h-3" />
                <span className="hidden sm:inline">{verifiedEmail}</span>
              </span>
            )}
            {meeting.share_views > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <Eye className="w-3.5 h-3.5" />
                {meeting.share_views}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Meeting Header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
              <Video className="w-3 h-3" />
              {sourceLabel}
            </span>
            {meeting.duration_minutes && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] text-gray-400 bg-white/[0.03] border border-white/[0.06]">
                <Clock className="w-3 h-3 text-gray-500" />
                {formatDuration(meeting.duration_minutes)}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight leading-[1.15]">
            {meeting.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-400">
            {meeting.start_time && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                {formatDate(meeting.start_time)} at {formatTime(meeting.start_time)}
              </span>
            )}
          </div>
        </header>

        {/* Main Grid — Video left, Summary right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 min-w-0">
          {/* ═══ Left Column — Media Player + Transcript ═══ */}
          <div className="lg:col-span-7 space-y-4 min-w-0">
            {/* Video Player (all meeting types with recordings) */}
            {hasAnyMedia && (
              <>
                {hasVideo && (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden aspect-video" data-player-container>
                    {videoLoading && !signedVideoUrl ? (
                      <div className="w-full h-full flex items-center justify-center bg-gray-900/80">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                          <span className="text-xs text-gray-500">Loading video...</span>
                        </div>
                      </div>
                    ) : signedVideoUrl ? (
                      <VideoPlayer
                        ref={videoPlayerRef}
                        src={signedVideoUrl}
                        className="w-full h-full"
                        onTimeUpdate={setCurrentTime}
                      />
                    ) : videoError ? (
                      <div className="w-full h-full flex items-center justify-center bg-gray-900/80">
                        <div className="flex flex-col items-center gap-3 text-center px-6">
                          <div className="w-12 h-12 rounded-xl bg-gray-800 border border-gray-700/50 flex items-center justify-center">
                            <Video className="w-6 h-6 text-gray-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-300">Video unavailable</p>
                            <p className="text-xs text-gray-500 mt-1">The recording may have expired or is still processing</p>
                          </div>
                          <button
                            onClick={() => token && fetchSignedVideoUrl(token)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            Try again
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-900/80">
                        <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center">
                          <Video className="w-6 h-6 text-gray-600" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Voice Recording Player */}
                {hasVoiceRecording && voiceRecording && (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden" data-player-container style={{ maxHeight: '320px' }}>
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <Mic className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <span className="text-sm font-medium text-gray-200">Voice Recording</span>
                        {voiceRecording.duration_seconds && (
                          <span className="text-xs text-gray-500 ml-auto">
                            {formatDuration(Math.round(voiceRecording.duration_seconds / 60))}
                          </span>
                        )}
                      </div>
                      <VoiceRecorderAudioPlayer
                        ref={audioPlayerRef}
                        recordingId={voiceRecording.id}
                        durationSeconds={voiceRecording.duration_seconds || 0}
                        shareToken={voiceRecording.share_token || undefined}
                        onTimeUpdate={setCurrentTime}
                      />
                    </div>
                  </div>
                )}

                {/* Fathom Recording — embedded inline */}
                {hasFathomRecording && meeting.share_url && (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden" data-player-container>
                    <FathomPlayerV2
                      ref={fathomPlayerRef}
                      shareUrl={meeting.share_url}
                      title={meeting.title || 'Meeting Recording'}
                      className="w-full"
                    />
                  </div>
                )}
              </>
            )}

            {/* Empty state — no media at all */}
            {!hasAnyMedia && !hasTranscriptContent && !meeting.summary && !meeting.highlights?.length && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 flex flex-col items-center justify-center py-12 text-center">
                <FileText className="w-10 h-10 text-gray-700 mb-3" />
                <p className="text-sm font-medium text-gray-400">No shared content</p>
                <p className="text-xs text-gray-600 mt-1">The meeting owner has not shared any content sections.</p>
              </div>
            )}

            {/* ═══ Transcript ═══ */}
            {hasTranscriptContent && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/15 flex items-center justify-center">
                      <ScrollText className="w-3.5 h-3.5 text-violet-400" />
                    </div>
                    <h2 className="text-sm font-semibold text-gray-100 tracking-tight">Transcript</h2>
                    {(transcript.length > 0 || parsedTranscript.length > 0) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-gray-400 border border-white/[0.06] tabular-nums">
                        {transcript.length || parsedTranscript.length} segments
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleCopyTranscript}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-all duration-200',
                        transcriptCopied
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                          : 'border-white/[0.06] bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'
                      )}
                    >
                      {transcriptCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {transcriptCopied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={handleDownloadTranscript}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-white/[0.06] bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all duration-200"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Transcript body — styled with speaker avatars, click-to-seek */}
                <div ref={transcriptPanelRef} className="overflow-y-auto pr-1 scrollbar-custom max-h-[600px]">
                  <div className="text-sm space-y-0">
                    {/* Voice recording segments (structured) */}
                    {hasVoiceRecording && transcript.length > 0 ? (
                      transcript.map((segment, idx) => {
                        const config = getSpeakerConfig(segment.speaker, speakerColorMap.current);
                        const initial = segment.speaker.slice(0, 1).toUpperCase();
                        const prevSpeaker = idx > 0 ? transcript[idx - 1]?.speaker : null;
                        const isContinuation = segment.speaker === prevSpeaker;
                        const isActive = idx === activeSegmentIdx;

                        return (
                          <div key={idx}>
                            {!isContinuation && prevSpeaker !== null && (
                              <div className="my-2 h-px bg-gradient-to-r from-transparent via-gray-700/40 to-transparent" />
                            )}
                            <button
                              ref={isActive ? activeSegmentRef : undefined}
                              onClick={() => handleTranscriptSeek(segment.start_time ?? 0)}
                              className={cn(
                                'group w-full text-left flex items-start gap-3 px-2 py-2 rounded-lg border transition-all duration-150',
                                isActive
                                  ? 'bg-white/[0.06] border-white/[0.08]'
                                  : `border-transparent ${config.rowHoverClass}`
                              )}
                            >
                              <div className="w-9 shrink-0 flex flex-col items-center gap-1 pt-0.5">
                                {!isContinuation ? (
                                  <>
                                    <div
                                      className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                      style={{ background: config.gradient }}
                                    >
                                      {initial}
                                    </div>
                                    <span className="text-[10px] font-medium leading-none" style={{ color: config.color }}>
                                      {segment.speaker.split(' ')[0]}
                                    </span>
                                  </>
                                ) : (
                                  <div className="w-6 h-6" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className={cn(
                                    'text-gray-300 leading-relaxed text-sm',
                                    isActive && 'text-gray-100'
                                  )}>{segment.text}</p>
                                  {segment.time && (
                                    <span className={cn(
                                      'font-mono text-[11px] shrink-0 mt-0.5 transition-colors',
                                      isActive ? 'text-emerald-400' : `text-gray-500 ${config.tsHoverClass}`
                                    )}>
                                      {segment.time}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          </div>
                        );
                      })
                    ) : parsedTranscript.length > 0 ? (
                      /* Parsed raw transcript (60_notetaker / other meeting types) */
                      parsedTranscript.map((line, idx) => {
                        const config = getSpeakerConfig(line.speaker, speakerColorMap.current);
                        const firstName = line.speaker.trim().split(/\s+/)[0];
                        const initial = firstName[0]?.toUpperCase() ?? '?';
                        const prevSpeaker = idx > 0 ? parsedTranscript[idx - 1]?.speaker : null;
                        const isContinuation = line.speaker === prevSpeaker;
                        const isActive = idx === activeSegmentIdx;

                        const inner = (
                          <div className={cn(
                            'group w-full text-left flex items-start gap-3 px-2 py-2 rounded-lg border transition-all duration-150',
                            isActive
                              ? 'bg-white/[0.06] border-white/[0.08]'
                              : `border-transparent ${config.rowHoverClass}`
                          )}>
                            <div className="w-9 shrink-0 flex flex-col items-center gap-1 pt-0.5">
                              {!isContinuation ? (
                                <>
                                  <div
                                    className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                    style={{ background: config.gradient }}
                                  >
                                    {initial}
                                  </div>
                                  <span className="text-[10px] font-medium leading-none" style={{ color: config.color }}>
                                    {firstName}
                                  </span>
                                </>
                              ) : (
                                <div className="w-6 h-6" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={cn(
                                  'text-gray-300 leading-relaxed text-sm',
                                  isActive && 'text-gray-100'
                                )}>{line.text}</p>
                                {line.timestamp && (
                                  <span className={cn(
                                    'font-mono text-[11px] shrink-0 mt-0.5 transition-colors',
                                    isActive ? 'text-emerald-400' : `text-gray-500 ${config.tsHoverClass}`
                                  )}>
                                    {line.timestamp}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );

                        return (
                          <div key={idx}>
                            {!isContinuation && prevSpeaker !== null && (
                              <div className="my-2 h-px bg-gradient-to-r from-transparent via-gray-700/40 to-transparent" />
                            )}
                            {line.seconds !== null ? (
                              <button
                                ref={isActive ? activeSegmentRef : undefined}
                                className="w-full text-left"
                                onClick={() => handleTranscriptSeek(line.seconds!)}
                              >
                                {inner}
                              </button>
                            ) : (
                              <div ref={isActive ? activeSegmentRef as React.Ref<HTMLDivElement> : undefined}>{inner}</div>
                            )}
                          </div>
                        );
                      })
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══ Right Column — Details + Summary + Highlights ═══ */}
          <div className="lg:col-span-5 space-y-4 min-w-0">
            {/* Meeting Details */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="font-semibold text-gray-100 mb-4 text-sm tracking-tight">Meeting Details</div>
              <div className="space-y-3 text-sm">
                {meeting.start_time && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <span className="text-gray-300 text-xs">{formatDate(meeting.start_time)} at {formatTime(meeting.start_time)}</span>
                  </div>
                )}
                {meeting.duration_minutes && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <span className="text-gray-300 text-xs">{formatDuration(meeting.duration_minutes)}</span>
                  </div>
                )}
                {meeting.source_type && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                      <Video className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <span className="text-gray-300 text-xs">{sourceLabel}</span>
                  </div>
                )}
              </div>

              {/* Participants */}
              {meetingParticipants.length > 0 && (
                <>
                  <div className="my-4 h-px bg-white/[0.06]" />
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    <span className="text-xs text-gray-400 font-medium tracking-tight">Participants ({meetingParticipants.length})</span>
                  </div>
                  <div className="space-y-0.5">
                    {meetingParticipants.map((name, idx) => {
                      const firstName = name.trim().split(/\s+/)[0];
                      const initial = firstName[0]?.toUpperCase() ?? '?';
                      return (
                        <div key={idx} className="flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition-colors duration-150">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0 shadow-sm"
                            style={{ background: SPEAKER_CONFIGS[idx % SPEAKER_CONFIGS.length].gradient }}
                          >
                            {initial}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-medium text-gray-200 truncate">{name}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* AI Summary */}
            {cleanSummary && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <h2 className="text-sm font-semibold text-gray-100 tracking-tight">AI Summary</h2>
                </div>
                <div className={cn(
                  'text-[13px] text-gray-300 leading-[1.7] whitespace-pre-wrap',
                  !showFullSummary && 'line-clamp-4'
                )}>
                  {cleanSummary}
                </div>
                {cleanSummary.length > 300 && (
                  <button
                    onClick={() => setShowFullSummary(!showFullSummary)}
                    className="mt-3 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors duration-150"
                  >
                    {showFullSummary ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}

            {/* Key Highlights */}
            {allHighlights.length > 0 && (() => {
              const MAX_VISIBLE = 4;
              const visibleHighlights = showAllHighlights ? allHighlights : allHighlights.slice(0, MAX_VISIBLE);
              const hasMore = allHighlights.length > MAX_VISIBLE;
              return (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/15 flex items-center justify-center">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <h2 className="text-sm font-semibold text-gray-100 tracking-tight">Key Highlights</h2>
                    <span className="text-[10px] ml-auto px-2 py-0.5 rounded-full bg-white/[0.04] text-gray-400 border border-white/[0.06] tabular-nums">
                      {allHighlights.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {visibleHighlights.map((highlight, idx) => {
                      const badge = getHighlightBadgeStyle(highlight.type);
                      return (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] transition-all duration-150 hover:bg-white/[0.04] hover:border-white/[0.08]"
                        >
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border shrink-0 mt-0.5',
                            badge.bg, badge.text, badge.border
                          )}>
                            {highlight.type.replace(/_/g, ' ')}
                          </span>
                          <p className="text-[13px] text-gray-300 leading-relaxed">
                            {highlight.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {hasMore && (
                    <button
                      onClick={() => setShowAllHighlights(!showAllHighlights)}
                      className="w-full mt-3 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-gray-400 hover:text-gray-200 rounded-lg border border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.03] transition-all duration-150"
                    >
                      {showAllHighlights ? (
                        <>Show less <ChevronUp className="w-3.5 h-3.5" /></>
                      ) : (
                        <>Show all {allHighlights.length} highlights <ChevronDown className="w-3.5 h-3.5" /></>
                      )}
                    </button>
                  )}
                </div>
              );
            })()}

          </div>
        </div>

        {/* Footer CTA + Branding */}
        <footer className="border-t border-white/[0.04] mt-8 sm:mt-10">
          {/* CTA Banner */}
          <div className="py-8 sm:py-10">
            <div className="relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-8">
              {/* Subtle gradient glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.03] via-transparent to-emerald-500/[0.03] pointer-events-none" />
              <div className="relative flex items-center gap-4 text-center sm:text-left">
                <img src={SIXTY_ICON_URL} alt="60" className="w-10 h-10 rounded-xl shrink-0 hidden sm:block shadow-lg shadow-black/20" />
                <div>
                  <p className="text-sm sm:text-base font-semibold text-white tracking-tight">Never miss a follow-up</p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-1 leading-relaxed max-w-md">
                    60 captures every meeting, writes your follow-ups, and keeps deals moving — automatically.
                  </p>
                </div>
              </div>
              <a
                href="https://www.use60.com"
                target="_blank"
                rel="noopener noreferrer"
                className="relative inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/30 transition-all duration-200 shrink-0"
              >
                Try 60 free
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/[0.04] py-5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <img src={SIXTY_ICON_URL} alt="60" className="w-5 h-5 rounded opacity-60" />
                <p className="text-xs text-gray-600">
                  Powered by <span className="font-medium text-gray-500">60</span> — The AI Command Center for Sales
                </p>
              </div>
              <a
                href="https://www.use60.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors duration-200"
              >
                use60.com
              </a>
            </div>
          </div>
        </footer>
      </div>

      {/* Transcript Modal */}
      {hasVoiceRecording && (
        <TranscriptModal
          open={showTranscriptModal}
          onOpenChange={setShowTranscriptModal}
          transcript={transcript}
          speakers={speakers}
          currentTime={currentTime}
          onSeek={handleTranscriptSeek}
          title={`${meeting.title} - Transcript`}
        />
      )}
    </div>
  );
}

export default PublicMeetingShare;

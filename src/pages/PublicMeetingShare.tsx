import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/clientV2';
import {
  Loader2,
  AlertCircle,
  Clock,
  Calendar,
  Users,
  FileText,
  CheckSquare,
  ScrollText,
  Video,
  ExternalLink,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { VoiceRecorderAudioPlayer, type AudioPlayerRef } from '@/components/voice-recorder/VoiceRecorderAudioPlayer';
import { TranscriptModal } from '@/components/voice-recorder/TranscriptModal';
import type { TranscriptSegment, Speaker } from '@/components/voice-recorder/types';

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

interface MeetingData {
  id: string;
  title: string;
  start_time: string | null;
  duration_minutes: number | null;
  summary: string | null;
  action_items: ActionItem[] | null;
  transcript_text: string | null;
  source_type: 'fathom' | 'voice' | null;
  share_url: string | null;
  share_token: string;
  share_views: number;
  share_options: ShareOptions;
  voice_recording_id: string | null;
  attendees?: Array<{
    name?: string;
    email?: string;
  }>;
}

interface VoiceRecordingData {
  id: string;
  duration_seconds: number | null;
  transcript_segments: TranscriptSegment[] | null;
  speakers: Speaker[] | null;
  share_token: string | null;
}

export function PublicMeetingShare() {
  const { token } = useParams<{ token: string }>();
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [voiceRecording, setVoiceRecording] = useState<VoiceRecordingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioPlayerRef = useRef<AudioPlayerRef>(null);

  useEffect(() => {
    if (token) {
      fetchMeeting();
    }
  }, [token]);

  const fetchMeeting = async () => {
    setLoading(true);
    setError(null);

    try {
      // Use SECURITY DEFINER RPC to bypass RLS for anon users
      const { data: rpcResult, error: fetchError } = await supabase
        .rpc('get_shared_meeting', { p_share_token: token });

      if (fetchError) {
        console.error('Fetch error:', fetchError);
        setError('Failed to load meeting.');
        setLoading(false);
        return;
      }

      if (!rpcResult || !rpcResult.found) {
        setError('Meeting not found or link has expired.');
        setLoading(false);
        return;
      }

      const meetingData = rpcResult.meeting;
      const attendees = rpcResult.attendees || [];

      setMeeting({
        ...meetingData,
        attendees,
      } as MeetingData);

      // Voice recording data returned by RPC
      if (rpcResult.voice_recording) {
        setVoiceRecording(rpcResult.voice_recording);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const incrementViews = async () => {
    if (!token) return;
    try {
      await supabase.rpc('increment_meeting_views', { p_share_token: token });
    } catch (err) {
      console.error('Failed to increment views:', err);
    }
  };

  // Handle seeking from transcript modal
  const handleTranscriptSeek = useCallback((time: number) => {
    audioPlayerRef.current?.seek(time);
    audioPlayerRef.current?.play();
  }, []);

  // Format date
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Date not set';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Format time
  const formatTime = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Format duration
  const formatDuration = (minutes: number | null): string => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading meeting...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">Unable to Load Meeting</h1>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!meeting) return null;

  const shareOptions = meeting.share_options || {
    include_summary: true,
    include_action_items: true,
    include_transcript: false,
    include_recording: true,
  };

  const hasVoiceRecording = meeting.source_type === 'voice' && voiceRecording;
  const hasFathomRecording = meeting.source_type === 'fathom' && meeting.share_url;
  const transcript = voiceRecording?.transcript_segments || [];
  const speakers = voiceRecording?.speakers || [];

  return (
    <div className="min-h-screen bg-gray-950 py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Video className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">{meeting.title}</h1>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-gray-400">
            <span className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {formatDate(meeting.start_time)}
              {meeting.start_time && ` at ${formatTime(meeting.start_time)}`}
            </span>
            {meeting.duration_minutes && (
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {formatDuration(meeting.duration_minutes)}
              </span>
            )}
          </div>
        </div>

        {/* Attendees */}
        {meeting.attendees && meeting.attendees.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              <Users className="w-4 h-4" />
              Attendees
            </div>
            <div className="flex flex-wrap gap-2">
              {meeting.attendees.map((attendee, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2 bg-gray-900/80 rounded-lg border border-gray-800 text-sm text-gray-300"
                >
                  {attendee.name || attendee.email}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Voice Recording Player */}
        {shareOptions.include_recording && hasVoiceRecording && voiceRecording && (
          <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-6 border border-gray-800 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Video className="w-5 h-5 text-emerald-400" />
              <span className="font-medium text-white">Recording</span>
            </div>
            <VoiceRecorderAudioPlayer
              ref={audioPlayerRef}
              recordingId={voiceRecording.id}
              durationSeconds={voiceRecording.duration_seconds || 0}
              shareToken={voiceRecording.share_token || undefined}
              onTimeUpdate={setCurrentTime}
            />
          </div>
        )}

        {/* Fathom Recording Link */}
        {shareOptions.include_recording && hasFathomRecording && meeting.share_url && (
          <a
            href={meeting.share_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-5 rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-800 hover:bg-gray-800/80 transition-colors mb-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <Video className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="font-medium text-white">Watch on Fathom</p>
                <p className="text-sm text-gray-400">View the full recording</p>
              </div>
            </div>
            <ExternalLink className="w-5 h-5 text-gray-500" />
          </a>
        )}

        {/* AI Summary */}
        {shareOptions.include_summary && meeting.summary && (
          <div className="bg-emerald-500/10 rounded-xl p-6 border border-emerald-500/20 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 className="w-5 h-5 text-emerald-400" />
              <span className="font-medium text-emerald-400">AI Summary</span>
            </div>
            <div className="text-gray-300 leading-relaxed whitespace-pre-wrap">
              {meeting.summary}
            </div>
          </div>
        )}

        {/* Action Items */}
        {shareOptions.include_action_items && meeting.action_items && meeting.action_items.length > 0 && (
          <div className="bg-blue-500/10 rounded-xl p-6 border border-blue-500/20 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckSquare className="w-5 h-5 text-blue-400" />
              <span className="font-medium text-blue-400">Action Items</span>
              <span className="text-xs text-blue-400/60 bg-blue-400/10 px-2 py-0.5 rounded-full">
                {meeting.action_items.length}
              </span>
            </div>
            <ul className="space-y-3">
              {meeting.action_items.map((item, idx) => (
                <li
                  key={item.id || idx}
                  className="flex items-start gap-3 text-gray-300"
                >
                  <div className={cn(
                    "w-5 h-5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center",
                    item.completed
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-gray-600"
                  )}>
                    {item.completed && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={cn(item.completed && "line-through text-gray-500")}>
                      {item.text}
                    </span>
                    {item.owner && (
                      <span className="ml-2 text-xs text-gray-500">• {item.owner}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Transcript */}
        {shareOptions.include_transcript && hasVoiceRecording && transcript.length > 0 && (
          <button
            onClick={() => setShowTranscriptModal(true)}
            className="w-full p-5 rounded-xl bg-gray-900/80 backdrop-blur-sm border border-gray-800 hover:bg-gray-800/80 transition-colors text-left mb-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ScrollText className="w-6 h-6 text-violet-400" />
                <div>
                  <p className="font-medium text-white">Full Transcript</p>
                  <p className="text-sm text-gray-400">{transcript.length} segments</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </button>
        )}

        {/* Plain text transcript fallback for meetings without segments */}
        {shareOptions.include_transcript && !hasVoiceRecording && meeting.transcript_text && (
          <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-6 border border-gray-800 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <ScrollText className="w-5 h-5 text-violet-400" />
              <span className="font-medium text-white">Transcript</span>
            </div>
            <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
              {meeting.transcript_text}
            </div>
          </div>
        )}

        {/* Speakers */}
        {hasVoiceRecording && speakers.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Speakers
            </h2>
            <div className="flex flex-wrap gap-2">
              {speakers.map((speaker) => (
                <div
                  key={speaker.id}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-900/80 rounded-lg border border-gray-800"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white"
                    style={{ backgroundColor: speaker.color || '#6B7280' }}
                  >
                    {speaker.initials || speaker.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-300">{speaker.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs mt-12">
          Powered by Sixty Seconds
        </p>
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

/**
 * RecordingPlayer
 *
 * LIB-004: Audio/video player with synced transcript viewer.
 * - Standard audio/video controls
 * - Transcript scrolls to current playback position
 * - Click a transcript segment to jump the player
 * - Speaker labels with colour coding
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start_time: number;  // seconds
  end_time: number;
}

interface RecordingPlayerProps {
  /** URL for the audio/video media */
  mediaUrl: string;
  /** Whether the media has a video track */
  isVideo?: boolean;
  /** Transcript segments for synced viewer */
  segments?: TranscriptSegment[];
  /** Optional thumbnail for audio */
  thumbnailUrl?: string | null;
  className?: string;
}

// ============================================================================
// Speaker colour palette (cycled by speaker name hash)
// ============================================================================

const SPEAKER_COLORS = [
  { bg: 'bg-blue-500/10 dark:bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-700', dot: 'bg-blue-500' },
  { bg: 'bg-violet-500/10 dark:bg-violet-500/15', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-300 dark:border-violet-700', dot: 'bg-violet-500' },
  { bg: 'bg-emerald-500/10 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-700', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-500/10 dark:bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-700', dot: 'bg-amber-500' },
  { bg: 'bg-rose-500/10 dark:bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-300 dark:border-rose-700', dot: 'bg-rose-500' },
];

function speakerColor(speaker: string) {
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) hash = (hash * 31 + speaker.charCodeAt(i)) >>> 0;
  return SPEAKER_COLORS[hash % SPEAKER_COLORS.length];
}

// ============================================================================
// Time formatter
// ============================================================================

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ============================================================================
// TranscriptViewer (synced)
// ============================================================================

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (time: number) => void;
}

function TranscriptViewer({ segments, currentTime, onSeek }: TranscriptViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  const activeIndex = segments.findIndex(
    (s) => currentTime >= s.start_time && currentTime < s.end_time,
  );

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const el = activeRef.current;
      const elTop = el.offsetTop;
      const elH = el.offsetHeight;
      const cTop = container.scrollTop;
      const cH = container.clientHeight;
      if (elTop < cTop || elTop + elH > cTop + cH) {
        container.scrollTo({ top: elTop - cH / 3, behavior: 'smooth' });
      }
    }
  }, [activeIndex]);

  if (segments.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400 dark:text-gray-600">
        No transcript available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto h-full space-y-2 pr-1"
    >
      {segments.map((seg, i) => {
        const isActive = i === activeIndex;
        const col = speakerColor(seg.speaker);
        return (
          <div
            key={i}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSeek(seg.start_time)}
            className={cn(
              'group flex items-start gap-2.5 rounded-lg p-2.5 cursor-pointer transition-all border',
              isActive
                ? `${col.bg} ${col.border} shadow-sm`
                : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/40',
            )}
          >
            {/* Speaker dot */}
            <div className={cn('h-2 w-2 rounded-full flex-shrink-0 mt-1.5', col.dot)} />

            <div className="flex-1 min-w-0 space-y-0.5">
              {/* Speaker + timestamp */}
              <div className="flex items-center gap-2">
                <span className={cn('text-[10px] font-semibold uppercase tracking-wide', col.text)}>
                  {seg.speaker}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onSeek(seg.start_time); }}
                  className="text-[10px] text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors tabular-nums"
                >
                  {fmt(seg.start_time)}
                </button>
              </div>
              {/* Text */}
              <p className={cn(
                'text-xs leading-relaxed',
                isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400',
              )}>
                {seg.text}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main RecordingPlayer
// ============================================================================

export function RecordingPlayer({
  mediaUrl,
  isVideo = false,
  segments = [],
  thumbnailUrl,
  className,
}: RecordingPlayerProps) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const handleSeek = useCallback((time: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onDurationChange = () => setDuration(el.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, []);

  function togglePlay() {
    const el = mediaRef.current;
    if (!el) return;
    if (playing) el.pause();
    else el.play().catch(() => {});
  }

  function toggleMute() {
    if (mediaRef.current) {
      mediaRef.current.muted = !muted;
      setMuted(!muted);
    }
  }

  function handleVolumeChange(val: number[]) {
    const v = val[0];
    setVolume(v);
    if (mediaRef.current) {
      mediaRef.current.volume = v;
      if (v === 0) setMuted(true);
      else setMuted(false);
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Media element */}
      <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-900">
        {isVideo ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={mediaUrl}
            className="w-full max-h-64 object-contain"
            poster={thumbnailUrl ?? undefined}
          />
        ) : (
          <div className="relative flex items-center justify-center aspect-video bg-gradient-to-br from-gray-800 to-gray-900">
            {thumbnailUrl && (
              <img src={thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
            )}
            <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={mediaUrl} />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-2 px-1">
        {/* Progress bar */}
        <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
          <span className="w-8 text-right">{fmt(currentTime)}</span>
          <div className="flex-1">
            <Slider
              value={[progress]}
              min={0}
              max={100}
              step={0.1}
              onValueChange={([val]) => handleSeek((val / 100) * duration)}
              className="cursor-pointer"
            />
          </div>
          <span className="w-8">{fmt(duration)}</span>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={togglePlay} className="h-8 w-8 p-0">
            {playing
              ? <Pause className="h-4 w-4" />
              : <Play className="h-4 w-4 fill-current" />
            }
          </Button>

          <Button variant="ghost" size="sm" onClick={toggleMute} className="h-8 w-8 p-0">
            {muted || volume === 0
              ? <VolumeX className="h-4 w-4" />
              : <Volume2 className="h-4 w-4" />
            }
          </Button>

          <div className="w-20">
            <Slider
              value={[muted ? 0 : volume]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={handleVolumeChange}
            />
          </div>

          {isVideo && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 ml-auto"
              onClick={() => (mediaRef.current as HTMLVideoElement)?.requestFullscreen?.()}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Synced transcript */}
      {segments.length > 0 && (
        <div className="flex-1 min-h-0 border border-gray-200 dark:border-gray-800 rounded-xl p-3 max-h-72">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
            Transcript
          </p>
          <TranscriptViewer
            segments={segments}
            currentTime={currentTime}
            onSeek={handleSeek}
          />
        </div>
      )}
    </div>
  );
}

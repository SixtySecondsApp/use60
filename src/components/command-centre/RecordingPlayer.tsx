import { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecordingPlayerProps {
  url: string;
  onTimeUpdate?: (currentTime: number) => void;
  seekTo?: number;
}

export function RecordingPlayer({ url, onTimeUpdate, seekTo }: RecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (seekTo !== undefined && audioRef.current) {
      audioRef.current.currentTime = seekTo;
      if (!isPlaying) {
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  }, [seekTo]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
    onTimeUpdate?.(audioRef.current.currentTime);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-gray-700/50 bg-slate-50 dark:bg-gray-800/30 p-3">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setIsPlaying(false)}
        preload="metadata"
      />

      <button
        onClick={togglePlay}
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors',
          isPlaying
            ? 'bg-blue-500 text-white'
            : 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
        )}
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-gray-700 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-slate-400 dark:text-gray-500">{formatTime(currentTime)}</span>
          <span className="text-[10px] text-slate-400 dark:text-gray-500">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}

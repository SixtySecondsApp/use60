/**
 * ElevenLabsAudioCell — Renders an elevenlabs_audio column cell in the Ops table.
 * Shows audio player with play/pause, status badges, and generate/retry buttons.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Mic, Loader2, AlertCircle, Play, Pause, RefreshCw } from 'lucide-react';

interface ElevenLabsAudioCellProps {
  status: 'pending' | 'processing' | 'completed' | 'failed' | null;
  audioUrl: string | null;
  errorMessage: string | null;
  onGenerateAudio?: () => void;
  /** Variable names missing from this row's data */
  missingVariables?: string[];
  rowId?: string;
  onCellUpdate?: (value: string) => void;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  pending: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30', label: 'Pending' },
  processing: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30', label: 'Generating' },
  completed: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Ready' },
  failed: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', label: 'Failed' },
};

export const ElevenLabsAudioCell: React.FC<ElevenLabsAudioCellProps> = ({
  status,
  audioUrl,
  errorMessage,
  onGenerateAudio,
  missingVariables,
  rowId,
  onCellUpdate,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const columnIdRef = useRef<string | null>(null);

  // Poll DB for status updates when processing/pending
  useEffect(() => {
    if ((status !== 'processing' && status !== 'pending') || !rowId || !onCellUpdate) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }

    const poll = async () => {
      try {
        const { supabase } = await import('@/lib/supabase/clientV2');

        if (!columnIdRef.current) {
          const { data: row } = await supabase
            .from('dynamic_table_rows')
            .select('table_id')
            .eq('id', rowId)
            .maybeSingle();
          if (!row?.table_id) return;

          const { data: audioCol } = await supabase
            .from('dynamic_table_columns')
            .select('id')
            .eq('table_id', row.table_id)
            .eq('column_type', 'elevenlabs_audio')
            .maybeSingle();
          if (!audioCol?.id) return;
          columnIdRef.current = audioCol.id;
        }

        const { data: cell } = await supabase
          .from('dynamic_table_cells')
          .select('value')
          .eq('row_id', rowId)
          .eq('column_id', columnIdRef.current)
          .maybeSingle();

        if (cell?.value) {
          try {
            const parsed = JSON.parse(cell.value);
            if (parsed.status === 'completed' || parsed.status === 'failed') {
              onCellUpdate(cell.value);
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    };

    pollRef.current = setInterval(poll, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [status, rowId, onCellUpdate]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (!audioUrl) return;

    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    if (!audioRef.current || audioRef.current.src !== audioUrl) {
      const audio = new Audio(audioUrl);
      audio.onended = () => { setIsPlaying(false); setCurrentTime(0); };
      audio.onloadedmetadata = () => setDuration(audio.duration);
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
      audioRef.current = audio;
    }
    audioRef.current.play();
    setIsPlaying(true);
  };

  // Preload duration for completed audio
  useEffect(() => {
    if (status === 'completed' && audioUrl && !duration) {
      const audio = new Audio(audioUrl);
      audio.onloadedmetadata = () => setDuration(audio.duration);
    }
  }, [status, audioUrl]);

  // Empty state — show generate button
  if (!status) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        {onGenerateAudio ? (
          missingVariables?.length ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border border-gray-700 bg-gray-800/50 text-gray-500 cursor-not-allowed"
              title={`Missing: ${missingVariables.join(', ')}`}
            >
              <AlertCircle className="w-3 h-3" />
              Missing data
            </span>
          ) : (
            <button
              type="button"
              onClick={onGenerateAudio}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20"
            >
              <Mic className="w-3 h-3" />
              Generate
            </button>
          )
        ) : (
          <span className="text-gray-600 text-xs italic">--</span>
        )}
      </div>
    );
  }

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  // Processing state
  if (status === 'processing' || status === 'pending') {
    return (
      <div className="w-full h-full flex items-center">
        <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
          <Loader2 className="w-3 h-3 animate-spin" />
          {cfg.label}
        </span>
      </div>
    );
  }

  // Failed state
  if (status === 'failed') {
    return (
      <div className="w-full h-full flex items-center">
        <span
          className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border} cursor-pointer`}
          title={errorMessage || 'Audio generation failed'}
          onClick={onGenerateAudio}
        >
          <AlertCircle className="w-3 h-3" />
          Retry
        </span>
      </div>
    );
  }

  // Completed — play button + duration + progress
  const progress = duration && duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full h-full flex items-center gap-2 group/audio">
      <button
        type="button"
        onClick={togglePlay}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors shrink-0"
      >
        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
      </button>
      {isPlaying && duration ? (
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <div className="flex-1 h-1 rounded-full bg-gray-700 overflow-hidden">
            <div
              className="h-full bg-indigo-400 rounded-full transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-500 font-mono tabular-nums shrink-0">
            {formatTime(currentTime)}
          </span>
        </div>
      ) : (
        <span className="text-[11px] text-gray-400 font-mono tabular-nums">
          {duration ? formatTime(duration) : ''}
        </span>
      )}
      {onGenerateAudio && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onGenerateAudio(); }}
          className="opacity-0 group-hover/audio:opacity-100 p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-indigo-400 transition-all"
          title="Regenerate audio"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

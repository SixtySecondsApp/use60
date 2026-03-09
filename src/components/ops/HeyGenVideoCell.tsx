/**
 * HeyGenVideoCell — Renders a heygen_video column cell in the Ops table.
 * Shows thumbnail + status badge, click to expand video preview.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Video, Loader2, Check, AlertCircle, ExternalLink, Copy, X, Play, RefreshCw } from 'lucide-react';

interface HeyGenVideoCellProps {
  status: 'pending' | 'processing' | 'completed' | 'failed' | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  onGenerateVideo?: () => void;
  /** Row ID — for polling video status from the DB */
  rowId?: string;
  /** Callback to update cell value when polling finds a completed video */
  onCellUpdate?: (value: string) => void;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  pending: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30', label: 'Pending' },
  processing: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Generating' },
  completed: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Ready' },
  failed: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', label: 'Failed' },
};

export const HeyGenVideoCell: React.FC<HeyGenVideoCellProps> = ({
  status,
  videoUrl,
  thumbnailUrl,
  durationSeconds,
  errorMessage,
  onGenerateVideo,
  rowId,
  onCellUpdate,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
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

        // Resolve column ID once, then cache
        if (!columnIdRef.current) {
          const { data: row } = await supabase
            .from('dynamic_table_rows')
            .select('table_id')
            .eq('id', rowId)
            .maybeSingle();
          if (!row?.table_id) return;

          const { data: videoCol } = await supabase
            .from('dynamic_table_columns')
            .select('id')
            .eq('table_id', row.table_id)
            .eq('column_type', 'heygen_video')
            .maybeSingle();
          if (!videoCol?.id) return;
          columnIdRef.current = videoCol.id;
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
          } catch { /* ignore parse errors */ }
        }
      } catch { /* ignore poll errors */ }
    };

    pollRef.current = setInterval(poll, 5000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [status, rowId, onCellUpdate]);

  // No video data — show generate button
  if (!status) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        {onGenerateVideo ? (
          <button
            type="button"
            onClick={onGenerateVideo}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
          >
            <Video className="w-3 h-3" />
            Generate
          </button>
        ) : (
          <span className="text-gray-600 text-xs italic">--</span>
        )}
      </div>
    );
  }

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  // Processing state — spinner
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
          title={errorMessage || 'Video generation failed'}
          onClick={onGenerateVideo}
        >
          <AlertCircle className="w-3 h-3" />
          Retry
        </span>
      </div>
    );
  }

  // Completed — show thumbnail + expandable preview
  return (
    <>
      <div
        className="w-full h-full flex items-center gap-2 cursor-pointer group/video"
        onClick={() => setExpanded(true)}
      >
        {thumbnailUrl ? (
          <div className="relative w-8 h-8 rounded overflow-hidden shrink-0 bg-gray-800">
            <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/video:opacity-100 transition-opacity">
              <Play className="w-3 h-3 text-white" />
            </div>
          </div>
        ) : (
          <Video className="w-4 h-4 text-emerald-400 shrink-0" />
        )}
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
          <Check className="w-3 h-3" />
          {durationSeconds ? `${Math.round(durationSeconds)}s` : 'Ready'}
        </span>
        {onGenerateVideo && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onGenerateVideo(); }}
            className="opacity-0 group-hover/video:opacity-100 p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-purple-400 transition-all"
            title="Regenerate video"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Expanded video preview modal */}
      {expanded && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          onClick={() => { setExpanded(false); setCopied(false); }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-lg mx-4 rounded-xl border border-gray-700/80 bg-gray-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="text-sm font-medium text-gray-200 flex items-center gap-2">
                <Video className="w-4 h-4 text-purple-400" />
                Video Preview
              </span>
              <button
                type="button"
                onClick={() => { setExpanded(false); setCopied(false); }}
                className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {videoUrl && (
              <div className="aspect-video bg-black">
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  className="w-full h-full"
                />
              </div>
            )}

            {videoUrl && (
              <div className="px-4 py-3 border-t border-gray-800 flex items-center gap-2">
                <code className="flex-1 text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded truncate">
                  {videoUrl}
                </code>
                {onGenerateVideo && (
                  <button
                    type="button"
                    onClick={() => { setExpanded(false); setCopied(false); onGenerateVideo(); }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                    title="Regenerate video"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(videoUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200"
                  title="Copy URL"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

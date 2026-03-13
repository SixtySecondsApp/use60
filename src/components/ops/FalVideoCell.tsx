/**
 * FalVideoCell — Renders a fal_video column cell in the Ops table.
 * Shows thumbnail + status badge, click to expand video preview.
 * Follows the HeyGenVideoCell pattern exactly.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Video,
  Play,
  Loader2,
  RefreshCw,
  AlertCircle,
  Copy,
  ExternalLink,
  Download,
  Check,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FalVideoCellValue {
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string;        // fal.ai CDN URL (temporary)
  storage_url?: string;      // permanent Supabase Storage URL
  thumbnail_url?: string;
  model_id?: string;
  duration_seconds?: number;
  fal_job_id?: string;
  error_message?: string;
  credit_cost?: number;
}

export interface FalVideoCellProps {
  /** JSON string of FalVideoCellValue, or null when no generation has occurred */
  cellValue: string | null;
  rowId: string;
  columnId: string;
  tableId: string;
  /** { model_id, prompt_template, image_column_key?, duration?, aspect_ratio? } */
  integrationConfig?: Record<string, unknown>;
  /** Row data for checking required columns */
  rowData?: Record<string, string>;
  onGenerate?: (rowId: string) => void;
  /** Callback to update cell value when polling finds a completed/failed job */
  onCellUpdate?: (value: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  idle:       { bg: 'bg-gray-500/10',    text: 'text-gray-400',    border: 'border-gray-600/30',    label: 'Idle' },
  pending:    { bg: 'bg-yellow-500/15',  text: 'text-yellow-400',  border: 'border-yellow-500/30',  label: 'Queued' },
  processing: { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30',    label: 'Generating' },
  completed:  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Ready' },
  failed:     { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30',     label: 'Failed' },
};

/** Map raw model IDs to short human-readable badge labels */
const MODEL_LABELS: Record<string, string> = {
  'fal-ai/kling-video/v3/pro/text-to-video':  'Kling 3.0',
  'fal-ai/kling-video/v3/pro/image-to-video': 'Kling 3.0',
  'fal-ai/kling-video/v2/master/text-to-video': 'Kling 2.5',
  'fal-ai/veo3':                               'Veo 3',
  'fal-ai/wan-ai/wan2.1-i2v-720p':            'Wan 2.5',
};

function getModelLabel(modelId?: string): string {
  if (!modelId) return 'Video';
  return MODEL_LABELS[modelId] ?? modelId.split('/').pop() ?? 'Video';
}

function parseCell(raw: string | null): FalVideoCellValue | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FalVideoCellValue;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FalVideoCell: React.FC<FalVideoCellProps> = ({
  cellValue,
  rowId,
  columnId,
  integrationConfig,
  rowData,
  onGenerate,
  onCellUpdate,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const parsed = parseCell(cellValue);
  const status = parsed?.status ?? 'idle';
  const modelId = parsed?.model_id ?? (integrationConfig?.model_id as string | undefined);
  const modelLabel = getModelLabel(modelId);
  const activeVideoUrl = parsed?.storage_url ?? parsed?.video_url ?? null;

  // Check if the required image column has data (for image-to-video models)
  const imageColumnKey = integrationConfig?.image_column_key as string | undefined;
  const missingImage =
    !!imageColumnKey && !!rowData && !rowData[imageColumnKey];

  // Determine whether generate is available
  const canGenerate = !!integrationConfig?.model_id;

  // ------------------------------------------------------------------
  // Polling — active when pending or processing
  // ------------------------------------------------------------------

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    const isActive = status === 'pending' || status === 'processing';

    if (!isActive || !onCellUpdate) {
      stopPolling();
      return;
    }

    const poll = async () => {
      try {
        const { supabase } = await import('@/lib/supabase/clientV2');

        // Trigger backend poll to check fal.ai and update cells
        await supabase.functions.invoke('fal-video-poll', {
          body: { action: 'poll_all' },
        }).catch(() => {}); // fire-and-forget

        const { data: cell } = await supabase
          .from('dynamic_table_cells')
          .select('value')
          .eq('row_id', rowId)
          .eq('column_id', columnId)
          .maybeSingle();

        if (cell?.value) {
          const latest = parseCell(cell.value);
          if (latest?.status === 'completed' || latest?.status === 'failed') {
            onCellUpdate(cell.value);
            stopPolling();
          }
        }
      } catch {
        // ignore transient poll errors
      }
    };

    pollRef.current = setInterval(poll, 5000);
    return stopPolling;
  }, [status, rowId, columnId, onCellUpdate, stopPolling]);

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

  const handleGenerate = useCallback(() => {
    if (onGenerate) onGenerate(rowId);
  }, [onGenerate, rowId]);

  const handleCopyUrl = useCallback(() => {
    if (!activeVideoUrl) return;
    navigator.clipboard.writeText(activeVideoUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeVideoUrl]);

  const handleDownload = useCallback(() => {
    if (!activeVideoUrl) return;
    const a = document.createElement('a');
    a.href = activeVideoUrl;
    a.download = `fal-video-${rowId}.mp4`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }, [activeVideoUrl, rowId]);

  const closeModal = useCallback(() => {
    setExpanded(false);
    setCopied(false);
  }, []);

  // Close modal on Escape
  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [expanded, closeModal]);

  // ------------------------------------------------------------------
  // Render: idle / null — Generate button
  // ------------------------------------------------------------------

  if (status === 'idle' || !parsed) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        {canGenerate ? (
          missingImage ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border border-gray-700 bg-gray-800/50 text-gray-500 cursor-not-allowed"
              title={`Missing image data in column: ${imageColumnKey}`}
            >
              <AlertCircle className="w-3 h-3" />
              Missing image
            </span>
          ) : (
            <button
              type="button"
              onClick={handleGenerate}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
            >
              <Video className="w-3 h-3" />
              Generate
            </button>
          )
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border border-gray-700 bg-gray-800/50 text-gray-500 cursor-not-allowed"
            title="No model configured — re-add the column"
          >
            <Video className="w-3 h-3" />
            Configure
          </span>
        )}
      </div>
    );
  }

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  // ------------------------------------------------------------------
  // Render: pending / processing — spinner
  // ------------------------------------------------------------------

  if (status === 'pending' || status === 'processing') {
    return (
      <div className="w-full h-full flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          {status === 'pending' ? 'Queued...' : 'Generating...'}
        </span>
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-800 text-gray-500 border border-gray-700/50">
          {modelLabel}
        </span>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Render: failed — retry button with error tooltip
  // ------------------------------------------------------------------

  if (status === 'failed') {
    return (
      <div className="w-full h-full flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border} ${canGenerate ? 'cursor-pointer' : ''}`}
          title={parsed?.error_message ?? 'Video generation failed'}
          onClick={canGenerate ? handleGenerate : undefined}
        >
          <AlertCircle className="w-3 h-3" />
          Failed
        </span>
        {canGenerate && (
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
            title="Retry generation"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Render: completed — thumbnail + preview modal
  // ------------------------------------------------------------------

  return (
    <>
      <div
        className="w-full h-full flex items-center gap-2 cursor-pointer group/video"
        onClick={() => setExpanded(true)}
      >
        {parsed.thumbnail_url ? (
          <div className="relative w-8 h-8 rounded overflow-hidden shrink-0 bg-gray-800">
            <img src={parsed.thumbnail_url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/video:opacity-100 transition-opacity">
              <Play className="w-3 h-3 text-white" />
            </div>
          </div>
        ) : (
          <Video className="w-4 h-4 text-emerald-400 shrink-0" />
        )}

        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}
        >
          <Check className="w-3 h-3" />
          {parsed.duration_seconds ? `${Math.round(parsed.duration_seconds)}s` : 'Ready'}
        </span>

        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-800 text-gray-500 border border-gray-700/50">
          {modelLabel}
        </span>

        {canGenerate && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
            className="opacity-0 group-hover/video:opacity-100 p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-purple-400 transition-all ml-auto"
            title="Regenerate video"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Expanded video preview modal                                     */}
      {/* ---------------------------------------------------------------- */}
      {expanded && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          onClick={closeModal}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-lg mx-4 rounded-xl border border-gray-700/80 bg-gray-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="text-sm font-medium text-gray-200 flex items-center gap-2">
                <Video className="w-4 h-4 text-purple-400" />
                Video Preview
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  {modelLabel}
                </span>
              </span>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video player */}
            {activeVideoUrl ? (
              <div className="aspect-video bg-black">
                <video
                  src={activeVideoUrl}
                  controls
                  autoPlay
                  className="w-full h-full"
                />
              </div>
            ) : (
              <div className="aspect-video bg-gray-950 flex items-center justify-center">
                <span className="text-gray-600 text-sm">No video URL available</span>
              </div>
            )}

            {/* Metadata row */}
            <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-3 text-[11px] text-gray-500">
              {parsed.duration_seconds && (
                <span>{Math.round(parsed.duration_seconds)}s</span>
              )}
              {parsed.credit_cost !== undefined && (
                <span>{parsed.credit_cost} credits</span>
              )}
              {parsed.storage_url && (
                <span className="text-emerald-500/70">Stored</span>
              )}
            </div>

            {/* Actions row */}
            {activeVideoUrl && (
              <div className="px-4 py-3 border-t border-gray-800 flex items-center gap-2">
                <code className="flex-1 text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded truncate">
                  {activeVideoUrl}
                </code>

                {canGenerate && (
                  <button
                    type="button"
                    onClick={() => { closeModal(); handleGenerate(); }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors shrink-0"
                    title="Regenerate video"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors shrink-0"
                  title="Copy URL"
                >
                  {copied
                    ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                    : <Copy className="w-3.5 h-3.5" />
                  }
                </button>

                <a
                  href={activeVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors shrink-0"
                  title="Open in new tab"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={handleDownload}
                  className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors shrink-0"
                  title="Download video"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

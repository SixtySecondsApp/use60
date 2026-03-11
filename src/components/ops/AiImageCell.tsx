/**
 * AiImageCell — Renders an ai_image column cell in the Ops table.
 * Shows thumbnail + status badge, click to expand image preview.
 * Follows the FalVideoCell pattern exactly.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Image,
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

interface AiImageCellValue {
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  image_url?: string;       // fal.ai CDN URL (temporary)
  storage_url?: string;     // permanent Supabase Storage URL
  model_id?: string;
  seed?: number;            // for "regenerate with same seed" feature
  ai_image_job_id?: string;
  error_message?: string;
  credit_cost?: number;
}

export interface AiImageCellProps {
  /** JSON string of AiImageCellValue, or null when no generation has occurred */
  cellValue: string | null;
  rowId: string;
  columnId: string;
  tableId: string;
  /** { model_id, prompt_template, resolution?, aspect_ratio? } */
  integrationConfig?: Record<string, unknown>;
  /** Row data for variable checking */
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
  'fal-ai/flux/dev':                'FLUX Dev',
  'fal-ai/flux/schnell':            'FLUX Schnell',
  'fal-ai/flux-pro/v1.1':          'FLUX Pro 1.1',
  'fal-ai/flux-pro/v1.1-ultra':    'FLUX Pro Ultra',
  'fal-ai/stable-diffusion-v35-large': 'SD 3.5',
  'fal-ai/recraft-v3':             'Recraft v3',
  'fal-ai/ideogram/v2':            'Ideogram v2',
};

function getModelLabel(modelId?: string): string {
  if (!modelId) return 'Image';
  return MODEL_LABELS[modelId] ?? modelId.split('/').pop() ?? 'Image';
}

function parseCell(raw: string | null): AiImageCellValue | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AiImageCellValue;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AiImageCell: React.FC<AiImageCellProps> = ({
  cellValue,
  rowId,
  columnId,
  integrationConfig,
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
  const activeImageUrl = parsed?.storage_url ?? parsed?.image_url ?? null;

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
    if (!activeImageUrl) return;
    navigator.clipboard.writeText(activeImageUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeImageUrl]);

  const handleDownload = useCallback(() => {
    if (!activeImageUrl) return;
    const a = document.createElement('a');
    a.href = activeImageUrl;
    a.download = `ai-image-${rowId}.png`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }, [activeImageUrl, rowId]);

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
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
          >
            <Image className="w-3 h-3" />
            Generate
          </button>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border border-gray-700 bg-gray-800/50 text-gray-500 cursor-not-allowed"
            title="No model configured — re-add the column"
          >
            <Image className="w-3 h-3" />
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
          title={parsed?.error_message ?? 'Image generation failed'}
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
        className="w-full h-full flex items-center gap-2 cursor-pointer group/image"
        onClick={() => setExpanded(true)}
      >
        {activeImageUrl ? (
          <div className="relative w-8 h-8 rounded overflow-hidden shrink-0 bg-gray-800">
            <img src={activeImageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <Image className="w-4 h-4 text-emerald-400 shrink-0" />
        )}

        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}
        >
          <Check className="w-3 h-3" />
          Ready
        </span>

        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-800 text-gray-500 border border-gray-700/50">
          {modelLabel}
        </span>

        {canGenerate && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
            className="opacity-0 group-hover/image:opacity-100 p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-purple-400 transition-all ml-auto"
            title="Regenerate image"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Expanded image preview modal                                     */}
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
                <Image className="w-4 h-4 text-purple-400" />
                Image Preview
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

            {/* Image preview */}
            {activeImageUrl ? (
              <div className="bg-black flex items-center justify-center">
                <img
                  src={activeImageUrl}
                  alt="AI generated image"
                  className="max-w-full max-h-[60vh] object-contain"
                />
              </div>
            ) : (
              <div className="aspect-square bg-gray-950 flex items-center justify-center">
                <span className="text-gray-600 text-sm">No image URL available</span>
              </div>
            )}

            {/* Metadata row */}
            <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-3 text-[11px] text-gray-500">
              {parsed.seed !== undefined && (
                <span title="Use same seed to reproduce this result">
                  Seed: {parsed.seed}
                </span>
              )}
              {parsed.credit_cost !== undefined && (
                <span>{parsed.credit_cost} credits</span>
              )}
              {parsed.storage_url && (
                <span className="text-emerald-500/70">Stored</span>
              )}
            </div>

            {/* Actions row */}
            {activeImageUrl && (
              <div className="px-4 py-3 border-t border-gray-800 flex items-center gap-2">
                <code className="flex-1 text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded truncate">
                  {activeImageUrl}
                </code>

                {canGenerate && (
                  <button
                    type="button"
                    onClick={() => { closeModal(); handleGenerate(); }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors shrink-0"
                    title="Regenerate image"
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
                  href={activeImageUrl}
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
                  title="Download image"
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

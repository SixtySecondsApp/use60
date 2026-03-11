/**
 * SvgAnimationCell — Renders an SVG animation column cell in the Ops table.
 * Shows a live inline SVG preview when completed, click to expand full-size.
 * Follows the FalVideoCell pattern for polling and layout.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  Loader2,
  RefreshCw,
  AlertCircle,
  Copy,
  ExternalLink,
  Download,
  Check,
  X,
  Code,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SvgAnimationCellValue {
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  svg_content?: string;       // raw SVG markup
  storage_url?: string;       // Supabase Storage URL for .svg file
  model_id?: string;          // 'gemini-3.1-pro'
  complexity?: string;        // 'simple' | 'medium' | 'complex'
  error_message?: string;
  credit_cost?: number;
}

export interface SvgAnimationCellProps {
  /** JSON string of SvgAnimationCellValue, or null when no generation has occurred */
  cellValue: string | null;
  rowId: string;
  columnId: string;
  tableId: string;
  /** { prompt_template, complexity } */
  integrationConfig?: Record<string, unknown>;
  /** Row data for template interpolation */
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

const COMPLEXITY_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  simple:  { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  medium:  { bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  border: 'border-yellow-500/20' },
  complex: { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20' },
};

function parseCell(raw: string | null): SvgAnimationCellValue | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SvgAnimationCellValue;
  } catch {
    return null;
  }
}

/** Strip <script> tags from SVG content to prevent XSS */
function sanitizeSvg(svg: string): string {
  return svg.replace(/<script[\s\S]*?<\/script>/gi, '');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SvgAnimationCell: React.FC<SvgAnimationCellProps> = ({
  cellValue,
  rowId,
  columnId,
  integrationConfig,
  onGenerate,
  onCellUpdate,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const parsed = parseCell(cellValue);
  const status = parsed?.status ?? 'idle';
  const complexity = parsed?.complexity ?? (integrationConfig?.complexity as string | undefined);
  const canGenerate = !!integrationConfig?.prompt_template;

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
          if (latest?.status === 'completed' || latest?.status === 'failed' || latest?.status === 'error') {
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

  const handleCopySvgCode = useCallback(() => {
    if (!parsed?.svg_content) return;
    navigator.clipboard.writeText(parsed.svg_content).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }, [parsed?.svg_content]);

  const handleDownload = useCallback(() => {
    if (!parsed?.svg_content) return;
    const blob = new Blob([parsed.svg_content], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `svg-animation-${rowId}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [parsed?.svg_content, rowId]);

  const closeModal = useCallback(() => {
    setExpanded(false);
    setCopiedCode(false);
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
            <Sparkles className="w-3 h-3" />
            Generate
          </button>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border border-gray-700 bg-gray-800/50 text-gray-500 cursor-not-allowed"
            title="No prompt configured — re-add the column"
          >
            <Sparkles className="w-3 h-3" />
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
        {complexity && (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-800 text-gray-500 border border-gray-700/50">
            {complexity}
          </span>
        )}
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
          title={parsed?.error_message ?? 'SVG generation failed'}
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
  // Render: completed — live inline SVG preview + expanded modal
  // ------------------------------------------------------------------

  const sanitizedSvg = parsed.svg_content ? sanitizeSvg(parsed.svg_content) : null;
  const complexityBadge = complexity ? COMPLEXITY_BADGES[complexity] ?? COMPLEXITY_BADGES.simple : null;

  return (
    <>
      <div
        className="w-full h-full flex items-center gap-2 cursor-pointer group/svg"
        onClick={() => setExpanded(true)}
      >
        {/* Live inline SVG preview */}
        {sanitizedSvg ? (
          <div
            className="w-8 h-8 rounded overflow-hidden shrink-0 bg-gray-800 flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
          />
        ) : (
          <Code className="w-4 h-4 text-emerald-400 shrink-0" />
        )}

        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}
        >
          <Check className="w-3 h-3" />
          Ready
        </span>

        {complexity && complexityBadge && (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${complexityBadge.bg} ${complexityBadge.text} ${complexityBadge.border}`}
          >
            {complexity}
          </span>
        )}

        {canGenerate && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
            className="opacity-0 group-hover/svg:opacity-100 p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-purple-400 transition-all ml-auto"
            title="Regenerate SVG"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Expanded SVG preview modal                                       */}
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
                <Sparkles className="w-4 h-4 text-purple-400" />
                SVG Animation Preview
                {complexity && complexityBadge && (
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${complexityBadge.bg} ${complexityBadge.text} ${complexityBadge.border}`}
                  >
                    {complexity}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SVG preview */}
            {sanitizedSvg ? (
              <div
                className="aspect-square bg-gray-950 flex items-center justify-center p-6"
                dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
              />
            ) : (
              <div className="aspect-square bg-gray-950 flex items-center justify-center">
                <span className="text-gray-600 text-sm">No SVG content available</span>
              </div>
            )}

            {/* Metadata row */}
            <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-3 text-[11px] text-gray-500">
              {complexity && (
                <span>Complexity: {complexity}</span>
              )}
              {parsed.credit_cost !== undefined && (
                <span>{parsed.credit_cost} credits</span>
              )}
              {parsed.model_id && (
                <span>{parsed.model_id}</span>
              )}
              {parsed.storage_url && (
                <span className="text-emerald-500/70">Stored</span>
              )}
            </div>

            {/* Actions row */}
            <div className="px-4 py-3 border-t border-gray-800 flex items-center gap-2">
              {/* Copy SVG Code */}
              <button
                type="button"
                onClick={handleCopySvgCode}
                disabled={!parsed.svg_content}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-gray-600/50 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Copy SVG code to clipboard"
              >
                {copiedCode
                  ? <Check className="w-3 h-3 text-emerald-400" />
                  : <Copy className="w-3 h-3" />
                }
                {copiedCode ? 'Copied' : 'Copy SVG Code'}
              </button>

              {/* Download .svg */}
              <button
                type="button"
                onClick={handleDownload}
                disabled={!parsed.svg_content}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-gray-600/50 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-gray-100 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Download .svg file"
              >
                <Download className="w-3 h-3" />
                Download .svg
              </button>

              {/* Open storage URL */}
              {parsed.storage_url && (
                <a
                  href={parsed.storage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors shrink-0"
                  title="Open stored SVG in new tab"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              {/* Regenerate */}
              {canGenerate && (
                <button
                  type="button"
                  onClick={() => { closeModal(); handleGenerate(); }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors shrink-0 ml-auto"
                  title="Regenerate SVG animation"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerate
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

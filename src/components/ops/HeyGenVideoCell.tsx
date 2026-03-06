/**
 * HeyGenVideoCell — Renders a heygen_video column cell in the Ops table.
 * Shows thumbnail + status badge, click to expand video preview.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Video, Loader2, Check, AlertCircle, ExternalLink, Copy, X, Play } from 'lucide-react';

interface HeyGenVideoCellProps {
  status: 'pending' | 'processing' | 'completed' | 'failed' | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  onGenerateVideo?: () => void;
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
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

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
          {durationSeconds ? `${durationSeconds}s` : 'Ready'}
        </span>
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

/**
 * VideoPreviewCard — Shows video script preview and generation status
 * Used in OutreachComposer when "Include personalized video" is enabled.
 */

import { Video, Loader2, Play, AlertCircle } from 'lucide-react';

type VideoStatus = 'idle' | 'scripting' | 'generating' | 'ready' | 'failed';

interface VideoPreviewCardProps {
  status: VideoStatus;
  script: string | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  onPreview?: () => void;
}

export function VideoPreviewCard({ status, script, thumbnailUrl, videoUrl, onPreview }: VideoPreviewCardProps) {
  return (
    <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-purple-500/10">
        <Video className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-xs font-medium text-purple-300">Personalized Video</span>
        <StatusBadge status={status} />
      </div>

      {/* Content */}
      <div className="p-3">
        {status === 'scripting' && (
          <div className="flex items-center gap-2 text-zinc-500 text-xs py-4 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Writing video script...
          </div>
        )}

        {status === 'generating' && (
          <div className="flex items-center gap-2 text-zinc-500 text-xs py-4 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Generating video (this may take a minute)...
          </div>
        )}

        {status === 'failed' && (
          <div className="flex items-center gap-2 text-red-400 text-xs py-2">
            <AlertCircle className="w-3.5 h-3.5" />
            Video generation failed. The email draft is still ready to use.
          </div>
        )}

        {/* Script preview */}
        {script && status !== 'generating' && (
          <div>
            <p className="text-xs text-zinc-500 mb-1">Video script (~15-20s)</p>
            <p className="text-xs text-zinc-400 leading-relaxed italic">"{script}"</p>
          </div>
        )}

        {/* Video thumbnail preview */}
        {status === 'ready' && thumbnailUrl && (
          <button
            onClick={onPreview}
            className="mt-2 relative group rounded-md overflow-hidden w-full aspect-video bg-zinc-900"
          >
            <img
              src={thumbnailUrl}
              alt="Video preview"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Play className="w-8 h-8 text-white" />
            </div>
          </button>
        )}

        {/* Video URL for copy */}
        {status === 'ready' && videoUrl && (
          <p className="mt-2 text-xs text-zinc-600">
            Video URL will be included as <code className="text-purple-400">[VIDEO_LINK]</code> in your message.
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: VideoStatus }) {
  const config: Record<VideoStatus, { label: string; className: string }> = {
    idle: { label: 'Ready', className: 'bg-zinc-700/50 text-zinc-400' },
    scripting: { label: 'Scripting', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    generating: { label: 'Generating', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    ready: { label: 'Ready', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  };

  const c = config[status];
  return (
    <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border ${c.className}`}>
      {c.label}
    </span>
  );
}

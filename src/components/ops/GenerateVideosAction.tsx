/**
 * GenerateVideosAction — Bulk action button for generating HeyGen videos
 * for selected rows in an Ops table.
 */

import React, { useState } from 'react';
import { Video, Loader2, Check, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface GenerateVideosActionProps {
  selectedRowIds: string[];
  tableId: string;
  avatarId: string;
  voiceId?: string;
  scriptTemplate: string;
  onComplete?: () => void;
}

export const GenerateVideosAction: React.FC<GenerateVideosActionProps> = ({
  selectedRowIds,
  tableId,
  avatarId,
  voiceId,
  scriptTemplate,
  onComplete,
}) => {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ total: 0, succeeded: 0, failed: 0 });
  const [done, setDone] = useState(false);

  const handleGenerate = async () => {
    if (selectedRowIds.length === 0) {
      toast.error('Select rows to generate videos for');
      return;
    }

    setGenerating(true);
    setProgress({ total: selectedRowIds.length, succeeded: 0, failed: 0 });

    try {
      const { data, error } = await supabase.functions.invoke('heygen-router', {
        body: {
          action: 'video_generate',
          avatar_id: avatarId,
          voice_id: voiceId,
          script: scriptTemplate,
          row_ids: selectedRowIds,
          table_id: tableId,
        },
      });

      if (error) throw new Error(error.message || 'Video generation failed');

      const result = data;
      setProgress({
        total: result.total ?? selectedRowIds.length,
        succeeded: result.succeeded ?? 0,
        failed: result.failed ?? 0,
      });
      setDone(true);

      if (result.failed > 0) {
        toast.error(`${result.failed} of ${result.total} videos failed to generate`);
      } else {
        toast.success(`${result.succeeded} videos generating`);
      }

      onComplete?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Video generation failed');
    } finally {
      setGenerating(false);
    }
  };

  if (done) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
        <Check className="w-3.5 h-3.5" />
        {progress.succeeded}/{progress.total} generating
        {progress.failed > 0 && (
          <span className="text-red-400 ml-1">({progress.failed} failed)</span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={generating || selectedRowIds.length === 0}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {generating ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Generating {progress.succeeded}/{progress.total}...
        </>
      ) : (
        <>
          <Video className="w-3.5 h-3.5" />
          Generate Videos ({selectedRowIds.length})
        </>
      )}
    </button>
  );
};

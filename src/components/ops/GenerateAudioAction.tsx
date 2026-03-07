/**
 * GenerateAudioAction — Bulk action button for generating ElevenLabs TTS audio
 * for selected rows in an Ops table.
 */

import React, { useState } from 'react';
import { Mic, Loader2, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface GenerateAudioActionProps {
  selectedRowIds: string[];
  tableId: string;
  voiceCloneId: string;
  scriptTemplate: string;
  audioColumnKey: string;
  onComplete?: () => void;
}

export const GenerateAudioAction: React.FC<GenerateAudioActionProps> = ({
  selectedRowIds,
  tableId,
  voiceCloneId,
  scriptTemplate,
  audioColumnKey,
  onComplete,
}) => {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ total: 0, succeeded: 0, failed: 0 });
  const [done, setDone] = useState(false);

  const handleGenerate = async () => {
    if (selectedRowIds.length === 0) {
      toast.error('Select rows to generate audio for');
      return;
    }

    setGenerating(true);
    setProgress({ total: selectedRowIds.length, succeeded: 0, failed: 0 });

    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-tts-generate', {
        body: {
          voice_clone_id: voiceCloneId,
          script_template: scriptTemplate,
          table_id: tableId,
          row_ids: selectedRowIds,
          audio_column_key: audioColumnKey,
        },
      });

      if (error) throw new Error(error.message || 'Audio generation failed');

      setProgress({
        total: data.total ?? selectedRowIds.length,
        succeeded: data.succeeded ?? 0,
        failed: data.failed ?? 0,
      });
      setDone(true);

      if (data.failed > 0) {
        toast.error(`${data.failed} of ${data.total} audio files failed`);
      } else {
        toast.success(`${data.succeeded} audio files generating`);
      }

      onComplete?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Audio generation failed');
    } finally {
      setGenerating(false);
    }
  };

  if (done) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
        <Check className="w-3.5 h-3.5" />
        {progress.succeeded}/{progress.total} generated
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
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {generating ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Generating {progress.succeeded}/{progress.total}...
        </>
      ) : (
        <>
          <Mic className="w-3.5 h-3.5" />
          Generate Audio ({selectedRowIds.length})
        </>
      )}
    </button>
  );
};

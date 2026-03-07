import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mic, Upload, Loader2, Play, Pause, Check, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

interface VoiceCloneWizardProps {
  onComplete: (voice: { id: string; name: string; elevenlabs_voice_id: string }) => void;
  onCancel: () => void;
}

type Step = 'record' | 'cloning' | 'preview' | 'save';

export function VoiceCloneWizard({ onComplete, onCancel }: VoiceCloneWizardProps) {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const [step, setStep] = useState<Step>('record');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clone result
  const [cloneResult, setCloneResult] = useState<{ id: string; elevenlabs_voice_id: string } | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);

  // Preview playback
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Recording ─────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      toast.error('Microphone access denied');
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      toast.error('Please upload an audio file (MP3, WAV, M4A)');
      return;
    }
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
  }, []);

  // ─── Clone ─────────────────────────────────────────────────
  const handleClone = useCallback(async () => {
    if (!audioBlob || !name.trim()) return;
    setStep('cloning');
    setCloneError(null);

    try {
      // Upload audio to Supabase Storage first
      const fileName = `source/${activeOrgId}/${crypto.randomUUID()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('voice-clones')
        .upload(fileName, audioBlob, {
          contentType: audioBlob.type || 'audio/webm',
          upsert: false,
        });

      if (uploadError) throw new Error('Failed to upload audio: ' + uploadError.message);

      const { data: urlData } = supabase.storage
        .from('voice-clones')
        .getPublicUrl(fileName);

      // Call clone API
      const { data, error } = await supabase.functions.invoke('elevenlabs-voice-manage', {
        body: {
          action: 'create_clone',
          name: name.trim(),
          description: description.trim() || undefined,
          audio_url: urlData.publicUrl,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setCloneResult({ id: data.id, elevenlabs_voice_id: data.elevenlabs_voice_id });
      setStep('preview');

      // Auto-generate preview
      const { data: previewData } = await supabase.functions.invoke('elevenlabs-voice-manage', {
        body: {
          action: 'preview',
          voice_clone_id: data.id,
        },
      });

      if (previewData?.preview_url) {
        setPreviewUrl(previewData.preview_url);
      }
    } catch (err: any) {
      console.error('[VoiceCloneWizard] clone error:', err);
      setCloneError(err.message || 'Clone failed');
      setStep('record');
    }
  }, [audioBlob, name, description, activeOrgId]);

  // ─── Preview playback ─────────────────────────────────────
  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // ─── Save ──────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!cloneResult) return;
    onComplete({
      id: cloneResult.id,
      name: name.trim(),
      elevenlabs_voice_id: cloneResult.elevenlabs_voice_id,
    });
  }, [cloneResult, name, onComplete]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        {['Record/Upload', 'Cloning', 'Preview', 'Save'].map((label, i) => {
          const steps: Step[] = ['record', 'cloning', 'preview', 'save'];
          const isCurrent = step === steps[i];
          const isComplete = steps.indexOf(step) > i;
          return (
            <React.Fragment key={label}>
              {i > 0 && <div className="w-4 h-px bg-gray-600" />}
              <span className={
                isCurrent ? 'text-white font-medium' :
                isComplete ? 'text-emerald-400' : 'text-gray-500'
              }>
                {isComplete ? <Check className="w-3 h-3 inline mr-0.5" /> : null}
                {label}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* ─── STEP: Record/Upload ─────────────────────────────── */}
      {step === 'record' && (
        <div className="space-y-4">
          {cloneError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {cloneError}
            </div>
          )}

          <div className="space-y-2">
            <Label>Voice Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Andrew's Voice"
            />
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Professional, warm tone"
            />
          </div>

          <div className="space-y-3">
            <Label>Audio Sample (1-2 minutes of clear speech)</Label>

            {/* Record */}
            <div className="flex items-center gap-3">
              {!isRecording ? (
                <Button variant="outline" size="sm" onClick={startRecording} disabled={!!audioUrl}>
                  <Mic className="w-4 h-4 mr-1.5" />
                  Record
                </Button>
              ) : (
                <Button variant="destructive" size="sm" onClick={stopRecording}>
                  <div className="w-2 h-2 rounded-full bg-white mr-1.5 animate-pulse" />
                  Stop ({formatTime(recordingTime)})
                </Button>
              )}

              <span className="text-gray-500 text-sm">or</span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRecording}
              >
                <Upload className="w-4 h-4 mr-1.5" />
                Upload File
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {/* Playback */}
            {audioUrl && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const a = new Audio(audioUrl);
                    a.play();
                  }}
                  className="h-8 w-8 p-0"
                >
                  <Play className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-300">Audio ready</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-xs text-gray-400"
                  onClick={() => {
                    setAudioBlob(null);
                    setAudioUrl(null);
                  }}
                >
                  Remove
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!audioBlob || !name.trim()}
              onClick={handleClone}
            >
              Clone Voice
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP: Cloning ───────────────────────────────────── */}
      {step === 'cloning' && (
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <div className="text-sm text-gray-300">Cloning your voice...</div>
          <div className="text-xs text-gray-500">This usually takes 10-30 seconds</div>
        </div>
      )}

      {/* ─── STEP: Preview ───────────────────────────────────── */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
            <Check className="w-4 h-4 shrink-0" />
            Voice cloned successfully!
          </div>

          {previewUrl ? (
            <div className="space-y-2">
              <Label>Preview your cloned voice</Label>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                <audio
                  ref={audioRef}
                  src={previewUrl}
                  onEnded={() => setIsPlaying(false)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={togglePlayback}
                  className="h-8 w-8 p-0"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <span className="text-sm text-gray-300">Cloned voice preview</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating preview...
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Discard
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save to Voice Library
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

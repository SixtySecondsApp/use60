/**
 * VideoAvatarColumnWizard — Inline wizard for creating a Video Avatar column in Ops.
 *
 * Steps:
 *   1. Upload/generate a photo for the avatar
 *   2. Train the avatar (poll for completion)
 *   3. Pick a voice
 *   4. Write a script template
 *
 * The avatar is stored in heygen_avatars and shared table-wide via integrationConfig.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Upload, Sparkles, ChevronRight, ChevronLeft, Check, Play, Pause, Video, Mic, FileText, AlertCircle, Image } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';

interface ColumnConfig {
  key: string;
  label: string;
  columnType: string;
  isEnrichment: boolean;
  integrationConfig?: Record<string, unknown>;
}

interface VideoAvatarColumnWizardProps {
  tableId: string;
  orgId: string;
  onComplete: (columns: ColumnConfig[]) => void;
  onCancel: () => void;
}

type WizardStep = 'photo' | 'training' | 'voice' | 'script';

const STEP_LABELS: Record<WizardStep, string> = {
  photo: 'Avatar Photo',
  training: 'Training',
  voice: 'Voice',
  script: 'Script Template',
};

const STEPS: WizardStep[] = ['photo', 'training', 'voice', 'script'];

interface Voice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio?: string;
}

export function VideoAvatarColumnWizard({
  tableId,
  orgId,
  onComplete,
  onCancel,
}: VideoAvatarColumnWizardProps) {
  const [step, setStep] = useState<WizardStep>('photo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Photo step
  const [photoMode, setPhotoMode] = useState<'upload' | 'generate'>('generate');
  const [avatarName, setAvatarName] = useState('');
  const [gender, setGender] = useState('female');
  const [age, setAge] = useState('young_adult');
  const [ethnicity, setEthnicity] = useState('white');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Training step
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [trainingStatus, setTrainingStatus] = useState<string>('idle');
  const [trainingProgress, setTrainingProgress] = useState<string>('');

  // Voice step
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Script step
  const [scriptTemplate, setScriptTemplate] = useState(
    'Hey {{first_name}}, I saw that {{company_name}} is doing great things. I put together a quick personalized demo showing how 60 could help your team close more deals. Take a look — it\'s only 60 seconds.'
  );

  const stepIndex = STEPS.indexOf(step);

  // ─── Photo: Generate AI photo ───────────────────────────────────────
  const handleGeneratePhoto = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('heygen-avatar-create', {
        body: {
          action: 'generate_photo',
          avatar_name: avatarName || 'Sales Avatar',
          name: avatarName || 'Sales Avatar',
          age,
          gender,
          ethnicity,
          orientation: 'front',
          pose: 'half_body',
          style: 'Photorealistic',
          appearance: 'Professional business attire, friendly smile, clean background',
        },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      setGenerationId(data.generation_id);
      setAvatarId(data.avatar_id);
      toast.success('Photo generating...');

      // Poll for photo completion
      pollPhotoGeneration(data.avatar_id, data.generation_id);
    } catch (e: any) {
      setError(e.message || 'Photo generation failed');
    } finally {
      setLoading(false);
    }
  }, [avatarName, age, gender, ethnicity]);

  const pollPhotoGeneration = useCallback(async (avId: string, genId: string) => {
    setTrainingStatus('generating_photo');
    const poll = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke('heygen-avatar-status', {
          body: { avatar_id: avId, generation_id: genId },
        });
        if (data?.status === 'completed' || data?.image_url) {
          clearInterval(poll);
          setPhotoUrl(data.image_url || data.thumbnail_url);
          setTrainingStatus('photo_ready');
        } else if (data?.status === 'failed') {
          clearInterval(poll);
          setError('Photo generation failed');
          setTrainingStatus('idle');
        }
      } catch {
        // keep polling
      }
    }, 3000);

    // Timeout after 2 minutes
    setTimeout(() => clearInterval(poll), 120000);
  }, []);

  // ─── Photo: Upload ──────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      // Convert to base64 for the edge function
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const { data, error: fnError } = await supabase.functions.invoke('heygen-avatar-create', {
          body: {
            action: 'upload_photo',
            avatar_name: avatarName || 'My Avatar',
            image_base64: base64,
            file_name: file.name,
          },
        });
        if (fnError) throw new Error(fnError.message);
        if (data?.error) throw new Error(data.error);

        setAvatarId(data.avatar_id);
        setPhotoUrl(URL.createObjectURL(file));
        setTrainingStatus('photo_ready');
        setLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (e: any) {
      setError(e.message || 'Upload failed');
      setLoading(false);
    }
  }, [avatarName]);

  // ─── Training: Kick off and poll ────────────────────────────────────
  const handleStartTraining = useCallback(async () => {
    if (!avatarId) return;
    setLoading(true);
    setError(null);
    setTrainingStatus('training');
    setTrainingProgress('Starting avatar training...');

    try {
      // Create group + train
      const { data, error: fnError } = await supabase.functions.invoke('heygen-avatar-create', {
        body: { action: 'train', avatar_id: avatarId },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      toast.success('Training started — this takes 2-5 minutes');
      pollTraining(avatarId);
    } catch (e: any) {
      setError(e.message || 'Training failed to start');
      setTrainingStatus('photo_ready');
    } finally {
      setLoading(false);
    }
  }, [avatarId]);

  const pollTraining = useCallback((avId: string) => {
    const poll = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke('heygen-avatar-status', {
          body: { avatar_id: avId },
        });
        if (data?.status === 'ready' || data?.status === 'generating_looks') {
          clearInterval(poll);
          setTrainingStatus('ready');
          setTrainingProgress('Avatar trained successfully!');
          setStep('voice');
          toast.success('Avatar training complete!');
        } else if (data?.status === 'failed') {
          clearInterval(poll);
          setTrainingStatus('failed');
          setTrainingProgress('Training failed');
          setError(data.error_message || 'Training failed');
        } else {
          setTrainingProgress('Training in progress... this takes 2-5 minutes');
        }
      } catch {
        // keep polling
      }
    }, 5000);

    setTimeout(() => {
      clearInterval(poll);
      if (trainingStatus === 'training') {
        setTrainingProgress('Training is taking longer than expected. Check back shortly.');
      }
    }, 600000);
  }, [trainingStatus]);

  // ─── Voices: Load list ──────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'voice' || voices.length > 0) return;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('heygen-voices', {
          body: { action: 'list' },
        });
        if (data?.voices) {
          setVoices(data.voices);
        }
      } catch {
        // silent
      }
    })();
  }, [step, voices.length]);

  const filteredVoices = voices.filter((v) => {
    const q = voiceSearch.toLowerCase();
    return !q || v.name.toLowerCase().includes(q) || v.language.toLowerCase().includes(q);
  });

  const handlePlayVoice = (voice: Voice) => {
    if (playingVoice === voice.voice_id) {
      audioRef.current?.pause();
      setPlayingVoice(null);
      return;
    }
    if (!voice.preview_audio) return;
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(voice.preview_audio);
    audio.onended = () => setPlayingVoice(null);
    audio.play();
    audioRef.current = audio;
    setPlayingVoice(voice.voice_id);
  };

  // ─── Save voice to avatar ──────────────────────────────────────────
  const handleSaveVoice = useCallback(async () => {
    if (!avatarId || !selectedVoice) return;
    try {
      await supabase.functions.invoke('heygen-avatar-create', {
        body: {
          action: 'finalize',
          avatar_id: avatarId,
          voice_id: selectedVoice.voice_id,
          voice_name: selectedVoice.name,
        },
      });
    } catch {
      // non-blocking
    }
  }, [avatarId, selectedVoice]);

  // ─── Complete: create column ────────────────────────────────────────
  const handleComplete = useCallback(() => {
    if (selectedVoice) handleSaveVoice();

    onComplete([{
      key: 'video_avatar',
      label: 'Video Avatar',
      columnType: 'heygen_video',
      isEnrichment: false,
      integrationConfig: {
        avatar_id: avatarId,
        avatar_name: avatarName || 'Sales Avatar',
        voice_id: selectedVoice?.voice_id,
        voice_name: selectedVoice?.name,
        script_template: scriptTemplate,
        table_id: tableId,
      },
    }]);
  }, [avatarId, avatarName, selectedVoice, scriptTemplate, tableId, onComplete, handleSaveVoice]);

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                i === stepIndex
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : i < stepIndex
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-gray-600'
              }`}
            >
              {i < stepIndex ? <Check className="w-3 h-3" /> : <span className="text-[10px]">{i + 1}</span>}
              {STEP_LABELS[s]}
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-gray-700" />}
          </React.Fragment>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* ── Step 1: Photo ─────────────────────────────────────── */}
      {step === 'photo' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3.5 py-3">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
            <p className="text-xs text-gray-300">
              Create an AI avatar for personalized video outreach. Upload your photo or generate one with AI.
            </p>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Avatar Name</label>
            <input
              type="text"
              value={avatarName}
              onChange={(e) => setAvatarName(e.target.value)}
              placeholder="e.g. Sarah from Sales"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-purple-500"
            />
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPhotoMode('generate')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors border ${
                photoMode === 'generate'
                  ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                  : 'border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Generate
            </button>
            <button
              type="button"
              onClick={() => setPhotoMode('upload')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors border ${
                photoMode === 'upload'
                  ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                  : 'border-gray-700 text-gray-500 hover:text-gray-300'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Photo
            </button>
          </div>

          {photoMode === 'generate' && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Gender</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200">
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Age</label>
                <select value={age} onChange={(e) => setAge(e.target.value)} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200">
                  <option value="young_adult">Young Adult</option>
                  <option value="middle_aged">Middle Aged</option>
                  <option value="senior">Senior</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ethnicity</label>
                <select value={ethnicity} onChange={(e) => setEthnicity(e.target.value)} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200">
                  <option value="white">White</option>
                  <option value="black">Black</option>
                  <option value="asian">Asian</option>
                  <option value="hispanic">Hispanic</option>
                  <option value="middle_eastern">Middle Eastern</option>
                  <option value="south_asian">South Asian</option>
                </select>
              </div>
            </div>
          )}

          {photoMode === 'upload' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-6 rounded-lg border-2 border-dashed border-gray-700 hover:border-purple-500/50 text-gray-500 hover:text-purple-300 transition-colors"
              >
                <Image className="w-5 h-5" />
                <span className="text-sm">Click to upload a photo</span>
              </button>
            </div>
          )}

          {/* Photo preview */}
          {photoUrl && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
              <img src={photoUrl} alt="Avatar" className="w-16 h-16 rounded-lg object-cover" />
              <div>
                <p className="text-sm text-gray-200 font-medium">{avatarName || 'Sales Avatar'}</p>
                <p className="text-xs text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" />Photo ready</p>
              </div>
            </div>
          )}

          {trainingStatus === 'generating_photo' && (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Generating AI photo...
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-2">
            <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-300">
              Cancel
            </button>
            {!photoUrl && photoMode === 'generate' && (
              <button
                type="button"
                onClick={handleGeneratePhoto}
                disabled={loading || trainingStatus === 'generating_photo'}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Generate Photo
              </button>
            )}
            {photoUrl && (
              <button
                type="button"
                onClick={() => { setStep('training'); handleStartTraining(); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium"
              >
                Train Avatar <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Training ──────────────────────────────────── */}
      {step === 'training' && (
        <div className="space-y-4">
          <div className="flex flex-col items-center py-8">
            {trainingStatus === 'training' ? (
              <>
                <Loader2 className="w-10 h-10 text-purple-400 animate-spin mb-4" />
                <p className="text-sm text-gray-200 font-medium">Training your avatar...</p>
                <p className="text-xs text-gray-500 mt-1">{trainingProgress}</p>
                <p className="text-xs text-gray-600 mt-3">This typically takes 2-5 minutes. Don't close this.</p>
              </>
            ) : trainingStatus === 'ready' ? (
              <>
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                  <Check className="w-6 h-6 text-emerald-400" />
                </div>
                <p className="text-sm text-gray-200 font-medium">Avatar trained!</p>
                <p className="text-xs text-gray-500 mt-1">Moving to voice selection...</p>
              </>
            ) : trainingStatus === 'failed' ? (
              <>
                <AlertCircle className="w-10 h-10 text-red-400 mb-4" />
                <p className="text-sm text-red-300">Training failed</p>
                <button
                  type="button"
                  onClick={handleStartTraining}
                  className="mt-3 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs"
                >
                  Retry
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Step 3: Voice ─────────────────────────────────────── */}
      {step === 'voice' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3.5 py-2">
            <Mic className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
            <p className="text-xs text-gray-300">Choose a voice for your avatar. Click the play button to preview.</p>
          </div>

          <input
            type="text"
            value={voiceSearch}
            onChange={(e) => setVoiceSearch(e.target.value)}
            placeholder="Search voices..."
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-purple-500"
          />

          <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-gray-700/50 bg-gray-800/30 p-1">
            {voices.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-4 justify-center text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading voices...
              </div>
            ) : filteredVoices.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-3">No voices match</p>
            ) : filteredVoices.slice(0, 30).map((voice) => (
              <button
                key={voice.voice_id}
                type="button"
                onClick={() => setSelectedVoice(voice)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
                  selectedVoice?.voice_id === voice.voice_id
                    ? 'bg-purple-500/15 border border-purple-500/30'
                    : 'hover:bg-gray-700/50'
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handlePlayVoice(voice); }}
                  className="p-1 rounded hover:bg-gray-700"
                >
                  {playingVoice === voice.voice_id
                    ? <Pause className="w-3 h-3 text-purple-400" />
                    : <Play className="w-3 h-3 text-gray-400" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-200 truncate">{voice.name}</p>
                  <p className="text-[10px] text-gray-500">{voice.language} · {voice.gender}</p>
                </div>
                {selectedVoice?.voice_id === voice.voice_id && (
                  <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                )}
              </button>
            ))}
          </div>

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep('photo')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300">
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button
              type="button"
              onClick={() => setStep('script')}
              disabled={!selectedVoice}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium disabled:opacity-50"
            >
              Script Template <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Script Template ───────────────────────────── */}
      {step === 'script' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3.5 py-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
            <p className="text-xs text-gray-300">
              Write a script template. Use <code className="text-purple-300">{'{{column_name}}'}</code> to personalize per row.
            </p>
          </div>

          <textarea
            value={scriptTemplate}
            onChange={(e) => setScriptTemplate(e.target.value)}
            rows={5}
            placeholder="Hey {{first_name}}, I put together a quick demo for {{company_name}}..."
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-purple-500 resize-none font-mono leading-relaxed"
          />

          <div className="flex flex-wrap gap-1.5">
            {['first_name', 'last_name', 'company_name', 'title'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setScriptTemplate((s) => s + `{{${v}}}`)}
                className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-800 border border-gray-700 text-gray-400 hover:text-purple-300 hover:border-purple-500/30"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-600">
            ~15-20 second video. Keep it conversational and under 50 words.
          </p>

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep('voice')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300">
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={!scriptTemplate.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              Create Column
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

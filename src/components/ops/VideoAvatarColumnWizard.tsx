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
import { createPortal } from 'react-dom';
import { Loader2, Upload, Sparkles, ChevronRight, ChevronLeft, Check, Play, Pause, Video, Mic, FileText, AlertCircle, Image, Camera, RefreshCw, Trash2, Plus, User, Link2, Volume2, X, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { VoiceLibrary } from '@/components/settings/VoiceLibrary';
import { ScriptEditor } from './ScriptEditor';

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
  /** Existing columns in the table — used for script variable suggestions */
  existingColumns?: { key: string; label: string }[];
}

type WizardStep = 'pick' | 'photo' | 'training' | 'look' | 'voice' | 'script';

const STEP_LABELS: Record<WizardStep, string> = {
  pick: 'Choose Avatar',
  photo: 'Avatar Photo',
  training: 'Training',
  look: 'Choose Look',
  voice: 'Voice',
  script: 'Script Template',
};

// Steps are built dynamically — these are just the full sets for new avatar creation
const NEW_AVATAR_STEPS: WizardStep[] = ['pick', 'photo', 'training', 'voice', 'script'];
const NEW_AVATAR_SKIP_TRAINING: WizardStep[] = ['pick', 'photo', 'voice', 'script'];
// Picking an existing avatar skips photo/training entirely
const EXISTING_AVATAR_STEPS: WizardStep[] = ['pick', 'look', 'voice', 'script'];

interface AvatarLook {
  look_id: string;
  name: string;
  thumbnail_url: string;
  preview_video_url?: string | null;
  heygen_avatar_id?: string | null;
}

interface ExistingAvatar {
  id: string;
  avatar_name: string;
  avatar_type: string;
  status: string;
  thumbnail_url: string | null;
  voice_id: string | null;
  voice_name: string | null;
  looks?: AvatarLook[] | null;
  created_at: string;
}

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
  existingColumns = [],
}: VideoAvatarColumnWizardProps) {
  const [step, setStep] = useState<WizardStep>('pick');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing avatars for this org
  const [existingAvatars, setExistingAvatars] = useState<ExistingAvatar[]>([]);
  const [loadingAvatars, setLoadingAvatars] = useState(true);

  // Whether this avatar skips training (uploaded/captured photos = talking_photo)
  const [skipTraining, setSkipTraining] = useState(false);
  const [pickedExisting, setPickedExisting] = useState(false);

  // Photo step
  const [photoMode, setPhotoMode] = useState<'upload' | 'generate' | 'capture'>('generate');
  const [avatarName, setAvatarName] = useState('');
  const [gender, setGender] = useState('Woman');
  const [age, setAge] = useState('Young Adult');
  const [ethnicity, setEthnicity] = useState('White');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Webcam capture
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  // Training step
  const [avatarType, setAvatarType] = useState<'photo' | 'talking_photo' | 'digital_twin'>('photo');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [trainingStatus, setTrainingStatus] = useState<string>('idle');
  const [trainingProgress, setTrainingProgress] = useState<string>('');

  // Voice step
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [voiceSource, setVoiceSource] = useState<'heygen_voice' | 'cloned_voice' | 'audio_column'>('heygen_voice');
  const [audioColumnKey, setAudioColumnKey] = useState('');
  const [selectedClonedVoice, setSelectedClonedVoice] = useState<{ id: string; name: string } | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<ExistingAvatar | null>(null);
  const [selectedLook, setSelectedLook] = useState<AvatarLook | null>(null);
  const [avatarLooks, setAvatarLooks] = useState<AvatarLook[]>([]);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const showLookStep = avatarLooks.length > 1;
  const STEPS = pickedExisting
    ? EXISTING_AVATAR_STEPS.filter(s => s !== 'look' || showLookStep)
    : (skipTraining ? NEW_AVATAR_SKIP_TRAINING : NEW_AVATAR_STEPS);

  // Script step
  const [scriptTemplate, setScriptTemplate] = useState(
    'Hey {{first_name}}, I saw that {{company_name}} is doing great things. I put together a quick personalized demo showing how 60 could help your team close more deals. Take a look — it\'s only 60 seconds.'
  );
  // scriptRef removed — ScriptEditor manages its own ref

  const stepIndex = STEPS.indexOf(step);

  // ─── Pick: Load existing avatars for this org ─────────────────────
  const fetchAvatars = useCallback(async () => {
    setLoadingAvatars(true);
    try {
      const { data } = await supabase.functions.invoke('heygen-avatar-create', {
        body: { action: 'list' },
      });
      setExistingAvatars(data?.avatars || []);
    } catch {
      // silent
    } finally {
      setLoadingAvatars(false);
    }
  }, []);

  useEffect(() => { fetchAvatars(); }, [fetchAvatars]);

  const handleDeleteAvatar = useCallback(async (id: string) => {
    try {
      const { data } = await supabase.functions.invoke('heygen-avatar-create', {
        body: { action: 'delete', avatar_id: id },
      });
      if (data?.deleted) {
        setExistingAvatars((prev) => prev.filter((a) => a.id !== id));
        toast.success('Avatar deleted');
      }
    } catch {
      toast.error('Failed to delete avatar');
    }
  }, []);

  // Track whether we need to start polling after picking a training avatar
  const [needsPollTraining, setNeedsPollTraining] = useState(false);

  const handlePickAvatar = useCallback((avatar: ExistingAvatar) => {
    setPickedExisting(true);
    setAvatarId(avatar.id);
    setAvatarName(avatar.avatar_name);
    setPhotoUrl(avatar.thumbnail_url);
    setAvatarType(avatar.avatar_type as 'photo' | 'talking_photo' | 'digital_twin');
    const looks = avatar.looks || [];
    setAvatarLooks(looks);

    if (avatar.avatar_type === 'talking_photo') {
      setSkipTraining(true);
    }

    // Auto-select look if only one
    if (looks.length === 1) {
      setSelectedLook(looks[0]);
    } else {
      setSelectedLook(null);
    }

    // Jump to the right step based on status
    if (avatar.status === 'ready') {
      // If multiple looks, show look picker first
      if (looks.length > 1) {
        setStep('look');
      } else if (avatar.voice_id) {
        setSelectedVoice({ voice_id: avatar.voice_id, name: avatar.voice_name || '', language: '', gender: '' });
        setStep('script');
      } else {
        setStep('voice');
      }
    } else if (avatar.status === 'training') {
      setStep('training');
      setTrainingStatus('training');
      setNeedsPollTraining(true);
    } else {
      // creating / generating_looks — go to photo step with photo loaded
      setTrainingStatus('photo_ready');
      setStep('photo');
    }
  }, []);

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
          orientation: 'square',
          pose: 'half_body',
          style: 'Realistic',
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
        // Status endpoint returns generation_status + looks array
        if (data?.generation_status === 'completed' || data?.generation_status === 'success' || data?.looks?.length > 0) {
          clearInterval(poll);
          const thumbUrl = data.looks?.[0]?.thumbnail_url || data.thumbnail_url || data.image_url;
          setPhotoUrl(thumbUrl);
          setTrainingStatus('photo_ready');
        } else if (data?.generation_status === 'failed' || data?.status === 'failed') {
          clearInterval(poll);
          setError(data?.error || 'Photo generation failed');
          setTrainingStatus('idle');
        }
      } catch {
        // keep polling
      }
    }, 3000);

    // Timeout after 2 minutes
    setTimeout(() => clearInterval(poll), 120000);
  }, []);

  // ─── Webcam: Start/Stop/Capture ─────────────────────────────────────
  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1024 }, height: { ideal: 1024 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => setCameraReady(true);
      }
    } catch {
      setError('Camera access denied. Please allow camera access and try again.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCameraReady(false);
  }, [stream]);

  // Stop camera on unmount or mode change
  useEffect(() => {
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [stream]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Square crop from center
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

    canvas.toBlob((blob) => {
      if (!blob) return;
      setCapturedBlob(blob);
      setPhotoUrl(URL.createObjectURL(blob));
      stopCamera();
    }, 'image/jpeg', 0.92);
  }, [stopCamera]);

  const handleRetake = useCallback(() => {
    setCapturedBlob(null);
    setPhotoUrl(null);
    setTrainingStatus('idle');
    startCamera();
  }, [startCamera]);

  // ─── Upload to Supabase Storage → HeyGen talking photo ────────────
  const uploadPhotoToStorage = useCallback(async (blob: Blob): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const fileName = `${user.id}-heygen-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
    if (!data?.publicUrl) throw new Error('Failed to get public URL');
    return data.publicUrl;
  }, [orgId]);

  const handleUploadAndRegister = useCallback(async (blob: Blob) => {
    setLoading(true);
    setError(null);
    try {
      const publicUrl = await uploadPhotoToStorage(blob);

      const { data, error: fnError } = await supabase.functions.invoke('heygen-avatar-create', {
        body: {
          action: 'upload_photo',
          avatar_name: avatarName || 'My Avatar',
          image_url: publicUrl,
        },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      setAvatarId(data.avatar_id);
      setTrainingStatus('training');
      setStep('training');
      setNeedsPollTraining(true);
      toast.success('Photo uploaded — training started!');
    } catch (e: any) {
      setError(e.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }, [avatarName, uploadPhotoToStorage]);

  // ─── Photo: File Upload ────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB');
      return;
    }

    setPhotoUrl(URL.createObjectURL(file));
    setCapturedBlob(file);
  }, []);

  // ─── Training: Kick off and poll ────────────────────────────────────
  const handleStartTraining = useCallback(async () => {
    if (!avatarId) return;
    setLoading(true);
    setError(null);
    setTrainingStatus('training');
    setTrainingProgress('Starting avatar training...');

    try {
      // Create group + train in one call
      const { data, error: fnError } = await supabase.functions.invoke('heygen-avatar-create', {
        body: {
          action: 'create_group_and_train',
          avatar_id: avatarId,
          avatar_name: avatarName || 'Sales Avatar',
        },
      });
      if (fnError) throw new Error(data?.error || fnError.message);
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

  // Start polling if picked a training avatar
  useEffect(() => {
    if (needsPollTraining && avatarId) {
      setNeedsPollTraining(false);
      pollTraining(avatarId);
    }
  }, [needsPollTraining, avatarId, pollTraining]);

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

    // If a specific look was selected, update the avatar record's heygen_avatar_id
    if (selectedLook?.look_id && avatarId) {
      supabase.functions.invoke('heygen-avatar-create', {
        body: {
          action: 'finalize',
          avatar_id: avatarId,
          look_id: selectedLook.look_id,
          voice_id: selectedVoice?.voice_id,
          voice_name: selectedVoice?.name,
        },
      }).catch(() => { /* non-blocking */ });
    }

    // Generate unique key to allow multiple video avatar columns
    const existingVideoKeys = (existingColumns || [])
      .filter(c => c.key.startsWith('video_avatar'))
      .map(c => c.key);
    let colKey = 'video_avatar';
    if (existingVideoKeys.includes(colKey)) {
      let suffix = 2;
      while (existingVideoKeys.includes(`video_avatar_${suffix}`)) suffix++;
      colKey = `video_avatar_${suffix}`;
    }
    const lookLabel = selectedLook?.name || avatarName;
    const colLabel = lookLabel ? `Video — ${lookLabel}` : 'Video Avatar';
    onComplete([{
      key: colKey,
      label: colLabel,
      columnType: 'heygen_video',
      isEnrichment: false,
      integrationConfig: {
        avatar_id: avatarId,
        avatar_name: avatarName || 'Sales Avatar',
        avatar_type: avatarType,
        look_id: selectedLook?.look_id,
        look_name: selectedLook?.name,
        voice_source: voiceSource,
        voice_id: voiceSource === 'heygen_voice' ? selectedVoice?.voice_id : undefined,
        voice_name: voiceSource === 'heygen_voice' ? selectedVoice?.name : voiceSource === 'cloned_voice' ? selectedClonedVoice?.name : undefined,
        voice_clone_id: voiceSource === 'cloned_voice' ? selectedClonedVoice?.id : undefined,
        audio_column_key: voiceSource === 'audio_column' ? audioColumnKey : undefined,
        script_template: scriptTemplate,
        table_id: tableId,
      },
    }]);
  }, [avatarId, avatarName, avatarType, selectedLook, voiceSource, selectedVoice, audioColumnKey, scriptTemplate, tableId, onComplete, handleSaveVoice]);

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

      {/* ── Step 0: Pick existing or create new ───────────────── */}
      {step === 'pick' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3.5 py-3">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
            <p className="text-xs text-gray-300">
              Choose an existing avatar or create a new one for personalized video outreach.
            </p>
          </div>

          {loadingAvatars ? (
            <div className="flex items-center justify-center py-8 text-xs text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading avatars...
            </div>
          ) : existingAvatars.length === 0 ? (
            <div className="text-center py-6">
              <User className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No avatars yet</p>
              <p className="text-xs text-gray-600 mt-1">Create your first avatar to start sending personalized videos.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {existingAvatars.map((avatar) => (
                <div
                  key={avatar.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-700/50 bg-gray-800/30 hover:border-purple-500/30 transition-colors group"
                >
                  {avatar.thumbnail_url ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPreviewAvatar(avatar); }}
                      className="relative w-11 h-11 rounded-lg overflow-hidden group/thumb shrink-0"
                      title="Preview avatar"
                    >
                      <img src={avatar.thumbnail_url} alt={avatar.avatar_name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye className="w-4 h-4 text-white" />
                      </div>
                    </button>
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-gray-700 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 font-medium truncate">{avatar.avatar_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        avatar.status === 'ready'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : avatar.status === 'training'
                            ? 'bg-yellow-500/10 text-yellow-400'
                            : avatar.status === 'failed'
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-gray-500/10 text-gray-400'
                      }`}>
                        {avatar.status === 'ready' ? 'Ready' : avatar.status === 'training' ? 'Training...' : avatar.status === 'failed' ? 'Failed' : 'In Progress'}
                      </span>
                      <span className="text-[10px] text-gray-600">
                        {avatar.avatar_type === 'digital_twin'
                          ? 'Digital Twin'
                          : avatar.avatar_type === 'talking_photo'
                            ? 'Photo Avatar'
                            : 'Photo Avatar'}
                      </span>
                      {avatar.voice_name && <span className="text-[10px] text-gray-600">{avatar.voice_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePickAvatar(avatar)}
                      className="px-3 py-1.5 rounded-md bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium"
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAvatar(avatar.id)}
                      className="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-300">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { setPickedExisting(false); setStep('photo'); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> New Avatar
            </button>
          </div>
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
            {([
              { mode: 'capture' as const, icon: Camera, label: 'Take Photo' },
              { mode: 'upload' as const, icon: Upload, label: 'Upload' },
              { mode: 'generate' as const, icon: Sparkles, label: 'AI Generate' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (photoMode === 'capture' && mode !== 'capture') stopCamera();
                  setPhotoMode(mode);
                  if (mode === 'capture' && !stream) startCamera();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors border ${
                  photoMode === mode
                    ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                    : 'border-gray-700 text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {photoMode === 'generate' && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Gender</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200">
                  <option value="Woman">Female</option>
                  <option value="Man">Male</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Age</label>
                <select value={age} onChange={(e) => setAge(e.target.value)} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200">
                  <option value="Young Adult">Young Adult</option>
                  <option value="Early Middle Age">Middle Aged</option>
                  <option value="Senior">Senior</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ethnicity</label>
                <select value={ethnicity} onChange={(e) => setEthnicity(e.target.value)} className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200">
                  <option value="White">White</option>
                  <option value="Black">Black</option>
                  <option value="Asian">Asian</option>
                  <option value="Hispanic">Hispanic</option>
                  <option value="Middle Eastern">Middle Eastern</option>
                  <option value="South Asian">South Asian</option>
                </select>
              </div>
            </div>
          )}

          {photoMode === 'capture' && (
            <div className="space-y-3">
              {!capturedBlob ? (
                <div className="relative rounded-lg overflow-hidden bg-black aspect-square max-w-[280px] mx-auto">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover mirror"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  {!cameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                      <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                    </div>
                  )}
                  {cameraReady && (
                    <button
                      type="button"
                      onClick={handleCapture}
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-white/90 hover:bg-white border-4 border-purple-500 transition-colors flex items-center justify-center"
                    >
                      <Camera className="w-5 h-5 text-purple-600" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative max-w-[280px] mx-auto">
                  <img src={photoUrl!} alt="Captured" className="w-full rounded-lg aspect-square object-cover" />
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="absolute bottom-2 right-2 flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-black/70 hover:bg-black/90 text-white text-xs"
                  >
                    <RefreshCw className="w-3 h-3" /> Retake
                  </button>
                </div>
              )}
              <p className="text-[10px] text-gray-600 text-center">
                Face the camera directly with good lighting. A clear, front-facing photo works best.
              </p>
            </div>
          )}

          {photoMode === 'upload' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
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
            <button type="button" onClick={() => { stopCamera(); onCancel(); }} className="text-xs text-gray-500 hover:text-gray-300">
              Cancel
            </button>
            {/* AI Generate button */}
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
            {/* AI-generated photo → needs training */}
            {photoUrl && photoMode === 'generate' && (
              <button
                type="button"
                onClick={() => { setStep('training'); handleStartTraining(); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium"
              >
                Train Avatar <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Captured/uploaded photo → upload to storage + HeyGen, skip training */}
            {photoUrl && capturedBlob && (photoMode === 'capture' || photoMode === 'upload') && (
              <button
                type="button"
                onClick={() => handleUploadAndRegister(capturedBlob)}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {loading ? 'Uploading...' : 'Use This Photo'}
              </button>
            )}
            {/* Already uploaded talking photo → go to voice */}
            {skipTraining && trainingStatus === 'photo_ready' && (
              <button
                type="button"
                onClick={() => setStep('voice')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
              >
                Choose Voice <ChevronRight className="w-3.5 h-3.5" />
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
                <p className="text-xs text-gray-600 mt-3">This typically takes 2-5 minutes. Do not close this.</p>
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

      {/* ── Step: Choose Look ──────────────────────────────────── */}
      {step === 'look' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3.5 py-2">
            <Image className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
            <p className="text-xs text-gray-300">Choose which look to use for all videos in this column.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {avatarLooks.map((look) => (
              <button
                key={look.look_id}
                type="button"
                onClick={() => setSelectedLook(look)}
                className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                  selectedLook?.look_id === look.look_id
                    ? 'border-purple-500'
                    : 'border-gray-700/50 hover:border-gray-600'
                }`}
              >
                {look.preview_video_url ? (
                  <video
                    src={look.preview_video_url}
                    poster={look.thumbnail_url}
                    muted
                    loop
                    playsInline
                    autoPlay={selectedLook?.look_id === look.look_id}
                    onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                    onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                    className="w-full aspect-square object-cover bg-black"
                  />
                ) : (
                  <img
                    src={look.thumbnail_url}
                    alt={look.name}
                    className="w-full aspect-square object-cover"
                  />
                )}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                  <p className="text-[10px] text-white font-medium truncate">{look.name}</p>
                </div>
                {selectedLook?.look_id === look.look_id && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep('pick')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300">
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button
              type="button"
              onClick={() => setStep('voice')}
              disabled={!selectedLook}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium disabled:opacity-50"
            >
              Voice <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Voice ─────────────────────────────────────── */}
      {step === 'voice' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3.5 py-2">
            <Mic className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
            <p className="text-xs text-gray-300">Choose a voice source for your avatar.</p>
          </div>

          {/* Voice source toggle */}
          <div className="flex rounded-lg border border-gray-700 bg-gray-800/50 p-0.5">
            <button
              type="button"
              onClick={() => setVoiceSource('heygen_voice')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                voiceSource === 'heygen_voice'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Volume2 className="w-3 h-3" />
              HeyGen Voice
            </button>
            <button
              type="button"
              onClick={() => setVoiceSource('cloned_voice')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                voiceSource === 'cloned_voice'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Mic className="w-3 h-3" />
              Cloned Voice
            </button>
            <button
              type="button"
              onClick={() => setVoiceSource('audio_column')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                voiceSource === 'audio_column'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Link2 className="w-3 h-3" />
              Audio Column
            </button>
          </div>

          {voiceSource === 'cloned_voice' ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Select a cloned voice from your library. Audio will be generated per row and the avatar will lip-sync to it.
              </p>
              <VoiceLibrary
                selectable
                selectedVoiceId={selectedClonedVoice?.id}
                onSelectVoice={(voice) => setSelectedClonedVoice({ id: voice.id, name: voice.name })}
              />
            </div>
          ) : voiceSource === 'heygen_voice' ? (
            <>
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
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Use an audio URL from another column (e.g. ElevenLabs) as the voice for each video.
              </p>
              <select
                value={audioColumnKey}
                onChange={e => setAudioColumnKey(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 outline-none focus:border-purple-500"
              >
                <option value="">Select audio column...</option>
                {(existingColumns || [])
                  .filter(c => !c.key.startsWith('video_avatar') && c.key !== 'heygen_video')
                  .map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))
                }
              </select>
              {audioColumnKey && (
                <p className="text-[10px] text-gray-500">
                  Each row&apos;s video will use the audio URL from the <span className="font-mono text-purple-400">{audioColumnKey}</span> column.
                  The avatar will lip-sync to the audio file.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep(avatarLooks.length > 1 ? 'look' : skipTraining ? 'photo' : 'training')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300">
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button
              type="button"
              onClick={() => setStep('script')}
              disabled={voiceSource === 'heygen_voice' ? !selectedVoice : voiceSource === 'cloned_voice' ? !selectedClonedVoice : !audioColumnKey}
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
              Write a script template. Type <span className="font-mono text-purple-400">@</span> to insert a column variable.
            </p>
          </div>

          <ScriptEditor
            value={scriptTemplate}
            onChange={setScriptTemplate}
            columns={existingColumns.length > 0
              ? existingColumns
              : [{ key: 'first_name', label: 'First Name' }, { key: 'last_name', label: 'Last Name' }, { key: 'company_name', label: 'Company' }, { key: 'title', label: 'Title' }]
            }
            excludeKeys={['video_avatar']}
            placeholder="Hey @first_name, I put together a quick demo..."
            rows={5}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-purple-500 resize-none font-mono leading-relaxed"
          />

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
      {/* Avatar Preview Lightbox */}
      {previewAvatar && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          onClick={() => setPreviewAvatar(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-2xl mx-4 rounded-xl border border-gray-700/80 bg-gray-900 shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200">{previewAvatar.avatar_name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  previewAvatar.avatar_type === 'digital_twin'
                    ? 'bg-purple-500/10 text-purple-400'
                    : 'bg-blue-500/10 text-blue-400'
                }`}>
                  {previewAvatar.avatar_type === 'digital_twin' ? 'Digital Twin' : 'Photo Avatar'}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  previewAvatar.status === 'ready'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-yellow-500/10 text-yellow-400'
                }`}>
                  {previewAvatar.status === 'ready' ? 'Ready' : previewAvatar.status}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAvatar(null)}
                className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5">
              {previewAvatar.looks && previewAvatar.looks.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">{previewAvatar.looks.length} look{previewAvatar.looks.length !== 1 ? 's' : ''}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {previewAvatar.looks.map((look, i) => (
                      <div key={look.look_id || i} className="space-y-1.5">
                        {look.preview_video_url ? (
                          <video
                            src={look.preview_video_url}
                            poster={look.thumbnail_url}
                            controls
                            loop
                            muted
                            playsInline
                            className="w-full aspect-square rounded-lg object-cover border border-gray-700/50 bg-black"
                          />
                        ) : (
                          <img
                            src={look.thumbnail_url}
                            alt={look.name}
                            className="w-full aspect-square rounded-lg object-cover border border-gray-700/50"
                          />
                        )}
                        <p className="text-[10px] text-gray-500 text-center">{look.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : previewAvatar.thumbnail_url ? (
                <img
                  src={previewAvatar.thumbnail_url}
                  alt={previewAvatar.avatar_name}
                  className="w-full max-h-[60vh] rounded-lg object-contain"
                />
              ) : (
                <div className="flex items-center justify-center py-16 text-gray-600">
                  <User className="w-12 h-12" />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800">
              <div className="text-[10px] text-gray-600">
                {previewAvatar.voice_name && <span>Voice: {previewAvatar.voice_name}</span>}
              </div>
              <button
                type="button"
                onClick={() => { handlePickAvatar(previewAvatar); setPreviewAvatar(null); }}
                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium"
              >
                Use This Avatar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Video,
  Upload,
  Wand2,
  Loader2,
  Check,
  ChevronRight,
  Play,
  RefreshCw,
  Mic,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import type { HeyGenAvatar, AvatarLook, HeyGenVoice } from '@/lib/types/heygen';

type WizardStep = 'photo' | 'training' | 'looks' | 'voice' | 'done';

interface AvatarCreatorWizardProps {
  onComplete?: (avatar: HeyGenAvatar) => void;
  onClose?: () => void;
}

export function AvatarCreatorWizard({ onComplete, onClose }: AvatarCreatorWizardProps) {
  const [step, setStep] = useState<WizardStep>('photo');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  // Photo step
  const [avatarName, setAvatarName] = useState('My Sales Avatar');
  const [gender, setGender] = useState('male');
  const [age, setAge] = useState('30');
  const [ethnicity, setEthnicity] = useState('caucasian');
  const [appearance, setAppearance] = useState('professional business attire, clean background');

  // Looks step
  const [looks, setLooks] = useState<AvatarLook[]>([]);
  const [selectedLook, setSelectedLook] = useState<string | null>(null);

  // Voice step
  const [voices, setVoices] = useState<HeyGenVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string | null>(null);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [voiceGender, setVoiceGender] = useState<string>('');

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [pollingInterval]);

  // -- Step 1: Generate Photo --
  const handleGeneratePhoto = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('heygen-router', {
        body: {
          action: 'avatar_create',
          sub_action: 'generate_photo',
          avatar_name: avatarName,
          gender,
          age,
          ethnicity,
          orientation: 'front',
          pose: 'half_body',
          style: 'photorealistic',
          appearance,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setAvatarId(data.avatar_id);
      setGenerationId(data.generation_id);
      toast.success('Photo generation started');

      // Start polling for generation completion
      pollGenerationStatus(data.avatar_id, data.generation_id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate photo');
    } finally {
      setLoading(false);
    }
  };

  // -- Poll generation/training status --
  const pollGenerationStatus = useCallback((avId: string, genId: string) => {
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke('heygen-router', {
          body: { action: 'avatar_status', avatar_id: avId, generation_id: genId },
        });

        if (data?.generation_status === 'completed' && data?.looks?.length > 0) {
          clearInterval(interval);
          setPollingInterval(null);
          setLooks(data.looks);

          // Auto-create group and start training
          const imageKey = data.looks[0]?.look_id;
          if (imageKey) {
            await startTraining(avId, imageKey, genId);
          }
        } else if (data?.generation_status === 'failed') {
          clearInterval(interval);
          setPollingInterval(null);
          toast.error('Photo generation failed');
        }
      } catch {
        // Silently continue polling
      }
    }, 5000);

    setPollingInterval(interval);
  }, []);

  const startTraining = async (avId: string, imageKey: string, genId: string) => {
    setStep('training');
    try {
      // Create group
      await supabase.functions.invoke('heygen-router', {
        body: {
          action: 'avatar_create',
          sub_action: 'create_group',
          avatar_id: avId,
          image_key: imageKey,
          generation_id: genId,
          avatar_name: avatarName,
        },
      });

      // Start training
      await supabase.functions.invoke('heygen-router', {
        body: { action: 'avatar_create', sub_action: 'train', avatar_id: avId },
      });

      toast.success('LORA training started — this takes a few minutes');
      pollTrainingStatus(avId);
    } catch (err: any) {
      toast.error(err.message || 'Training setup failed');
    }
  };

  const pollTrainingStatus = useCallback((avId: string) => {
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke('heygen-router', {
          body: { action: 'avatar_status', avatar_id: avId, check_type: 'training' },
        });

        if (data?.training_status === 'completed') {
          clearInterval(interval);
          setPollingInterval(null);
          toast.success('Training complete');
          setStep('looks');
          generateLooks(avId);
        } else if (data?.status === 'failed') {
          clearInterval(interval);
          setPollingInterval(null);
          toast.error(data.error || 'Training failed');
        }
      } catch {
        // Continue polling
      }
    }, 10000);

    setPollingInterval(interval);
  }, []);

  // -- Step 3: Generate Looks --
  const generateLooks = async (avId: string) => {
    setLoading(true);
    const lookPrompts = [
      'avatar in professional business attire, modern office background',
      'avatar in smart casual wear, neutral studio background',
      'avatar in business formal, branded corporate setting',
    ];

    const newLooks: AvatarLook[] = [];

    for (const prompt of lookPrompts) {
      try {
        const { data } = await supabase.functions.invoke('heygen-router', {
          body: { action: 'avatar_create', sub_action: 'generate_look', avatar_id: avId, prompt },
        });

        if (data?.generation_id) {
          // Poll for this look
          await new Promise<void>((resolve) => {
            const lookPoll = setInterval(async () => {
              const { data: status } = await supabase.functions.invoke('heygen-router', {
                body: { action: 'avatar_status', avatar_id: avId, generation_id: data.generation_id, check_type: 'generation' },
              });

              if (status?.generation_status === 'completed' && status?.looks) {
                clearInterval(lookPoll);
                newLooks.push(...(status.looks as AvatarLook[]));
                setLooks([...newLooks]);
                resolve();
              } else if (status?.generation_status === 'failed') {
                clearInterval(lookPoll);
                resolve();
              }
            }, 5000);
          });
        }
      } catch {
        // Continue with other looks
      }
    }

    setLoading(false);
  };

  // -- Step 4: Load Voices --
  const loadVoices = async () => {
    try {
      const { data } = await supabase.functions.invoke('heygen-router', {
        body: { action: 'voices', sub_action: 'list', gender: voiceGender || undefined },
      });
      if (data?.voices) {
        setVoices(data.voices);
      }
    } catch {
      toast.error('Failed to load voices');
    }
  };

  useEffect(() => {
    if (step === 'voice') {
      loadVoices();
    }
  }, [step]);

  // -- Step 5: Finalize --
  const handleFinalize = async () => {
    if (!avatarId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('heygen-router', {
        body: {
          action: 'avatar_create',
          sub_action: 'finalize',
          avatar_id: avatarId,
          look_id: selectedLook,
          voice_id: selectedVoice,
          voice_name: selectedVoiceName,
        },
      });

      if (error) throw new Error(error.message);

      toast.success('Avatar is ready!');
      setStep('done');
      if (onComplete && data) onComplete(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to finalize avatar');
    } finally {
      setLoading(false);
    }
  };

  const filteredVoices = voices.filter((v) => {
    if (voiceSearch && !v.name.toLowerCase().includes(voiceSearch.toLowerCase())) return false;
    if (voiceGender && v.gender?.toLowerCase() !== voiceGender.toLowerCase()) return false;
    return true;
  });

  // -- Render Steps --

  const steps: { key: WizardStep; label: string }[] = [
    { key: 'photo', label: 'Photo' },
    { key: 'training', label: 'Training' },
    { key: 'looks', label: 'Looks' },
    { key: 'voice', label: 'Voice' },
    { key: 'done', label: 'Done' },
  ];

  const currentStepIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <React.Fragment key={s.key}>
            <div
              className={`flex items-center gap-2 text-sm font-medium ${
                i <= currentStepIdx
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-400 dark:text-gray-600'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < currentStepIdx
                    ? 'bg-blue-600 text-white'
                    : i === currentStepIdx
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-2 border-blue-600'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                }`}
              >
                {i < currentStepIdx ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-700" />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step: Photo */}
      {step === 'photo' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Create Your AI Avatar</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Generate a photorealistic avatar that will represent you in outreach videos.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Avatar Name</Label>
              <Input value={avatarName} onChange={(e) => setAvatarName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Age</Label>
              <Select value={age} onValueChange={setAge}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="35">35</SelectItem>
                  <SelectItem value="40">40</SelectItem>
                  <SelectItem value="45">45</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ethnicity</Label>
              <Select value={ethnicity} onValueChange={setEthnicity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="caucasian">Caucasian</SelectItem>
                  <SelectItem value="african">African</SelectItem>
                  <SelectItem value="asian">Asian</SelectItem>
                  <SelectItem value="latino">Latino</SelectItem>
                  <SelectItem value="middle_eastern">Middle Eastern</SelectItem>
                  <SelectItem value="south_asian">South Asian</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Appearance Description</Label>
            <Input
              value={appearance}
              onChange={(e) => setAppearance(e.target.value)}
              placeholder="e.g., professional business attire, clean background"
            />
            <p className="text-xs text-gray-400">Describe clothing, pose, and background.</p>
          </div>

          <Button onClick={handleGeneratePhoto} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Generate Avatar Photo
              </>
            )}
          </Button>
        </div>
      )}

      {/* Step: Training */}
      {step === 'training' && (
        <div className="space-y-6 text-center py-12">
          <Loader2 className="w-12 h-12 mx-auto text-blue-500 animate-spin" />
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Training Your Avatar</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              LORA training is in progress. This typically takes 2-5 minutes.
              The page will automatically advance when training completes.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Checking status every 10 seconds...
          </div>
        </div>
      )}

      {/* Step: Looks */}
      {step === 'looks' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Choose Your Look</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Select the look you want to use in your outreach videos.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 mx-auto text-blue-500 animate-spin mb-4" />
              <p className="text-sm text-gray-500">Generating looks...</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {looks.map((look) => (
                <button
                  key={look.look_id}
                  onClick={() => setSelectedLook(look.look_id)}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                    selectedLook === look.look_id
                      ? 'border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  {look.thumbnail_url ? (
                    <img
                      src={look.thumbnail_url}
                      alt={look.name}
                      className="w-full aspect-square object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <Video className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <span className="text-xs text-white font-medium">{look.name}</span>
                  </div>
                  {selectedLook === look.look_id && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          <Button
            onClick={() => setStep('voice')}
            disabled={!selectedLook}
            className="w-full"
          >
            Continue to Voice Selection
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Step: Voice */}
      {step === 'voice' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Select a Voice</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Choose the voice your avatar will use when speaking in videos.
            </p>
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={voiceSearch}
                onChange={(e) => setVoiceSearch(e.target.value)}
                placeholder="Search voices..."
                className="pl-9"
              />
            </div>
            <Select value={voiceGender} onValueChange={(v) => { setVoiceGender(v); }}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-2 dark:border-gray-700">
            {filteredVoices.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                {voices.length === 0 ? 'Loading voices...' : 'No voices match your filters'}
              </p>
            ) : (
              filteredVoices.slice(0, 50).map((voice) => (
                <button
                  key={voice.voice_id}
                  onClick={() => {
                    setSelectedVoice(voice.voice_id);
                    setSelectedVoiceName(voice.name);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    selectedVoice === voice.voice_id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <Mic className={`w-4 h-4 flex-shrink-0 ${
                    selectedVoice === voice.voice_id ? 'text-blue-500' : 'text-gray-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{voice.name}</div>
                    <div className="text-xs text-gray-500">{voice.language} · {voice.gender}</div>
                  </div>
                  {voice.preview_audio && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const audio = new Audio(voice.preview_audio);
                        audio.play().catch(() => {});
                      }}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      <Play className="w-3 h-3 text-gray-500" />
                    </button>
                  )}
                </button>
              ))
            )}
          </div>

          <Button onClick={handleFinalize} disabled={!selectedVoice || loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Finalizing...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Complete Avatar Setup
              </>
            )}
          </Button>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="space-y-6 text-center py-12">
          <div className="w-16 h-16 mx-auto bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
            <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Your Avatar is Ready!</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              You can now use it to generate personalized outreach videos from Ops campaigns.
            </p>
          </div>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

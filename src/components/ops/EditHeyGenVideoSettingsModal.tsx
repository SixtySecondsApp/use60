/**
 * EditHeyGenVideoSettingsModal — Edit script template and voice
 * for an existing heygen_video column.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Video, Mic, FileText, Save, Loader2, Play, Pause, Check, User, Image, Clapperboard, Link2, Volume2 } from 'lucide-react';
import { ScriptEditor } from './ScriptEditor';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { VoiceLibrary } from '@/components/settings/VoiceLibrary';

interface HeyGenVideoConfig {
  avatar_id?: string;
  avatar_name?: string;
  avatar_type?: 'photo' | 'talking_photo' | 'digital_twin';
  voice_source?: 'heygen_voice' | 'audio_column' | 'cloned_voice';
  voice_id?: string;
  voice_name?: string;
  voice_clone_id?: string;
  audio_column_key?: string; // column key containing audio URLs
  script_template?: string;
  table_id?: string;
}

interface Voice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio?: string;
}

interface EditHeyGenVideoSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: HeyGenVideoConfig) => void;
  columnLabel: string;
  currentConfig?: HeyGenVideoConfig;
  existingColumns?: { key: string; label: string }[];
}

export function EditHeyGenVideoSettingsModal({
  isOpen,
  onClose,
  onSave,
  columnLabel,
  currentConfig,
  existingColumns,
}: EditHeyGenVideoSettingsModalProps) {
  const [scriptTemplate, setScriptTemplate] = useState(currentConfig?.script_template || '');
  const [saving, setSaving] = useState(false);

  // Voice state
  const [voiceSource, setVoiceSource] = useState<'heygen_voice' | 'audio_column' | 'cloned_voice'>(currentConfig?.voice_source || 'heygen_voice');
  const [audioColumnKey, setAudioColumnKey] = useState(currentConfig?.audio_column_key || '');
  const [selectedClonedVoice, setSelectedClonedVoice] = useState<{ id: string; name: string } | null>(
    currentConfig?.voice_clone_id ? { id: currentConfig.voice_clone_id, name: currentConfig.voice_name || 'Cloned Voice' } : null
  );
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [selectedVoiceId, setSelectedVoiceId] = useState(currentConfig?.voice_id || '');
  const [selectedVoiceName, setSelectedVoiceName] = useState(currentConfig?.voice_name || '');
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (isOpen) {
      setScriptTemplate(currentConfig?.script_template || '');
      setSelectedVoiceId(currentConfig?.voice_id || '');
      setSelectedVoiceName(currentConfig?.voice_name || '');
      setVoiceSource(currentConfig?.voice_source || 'heygen_voice');
      setAudioColumnKey(currentConfig?.audio_column_key || '');
      setSelectedClonedVoice(
        currentConfig?.voice_clone_id ? { id: currentConfig.voice_clone_id, name: currentConfig.voice_name || 'Cloned Voice' } : null
      );
      setShowVoicePicker(false);
      setVoiceSearch('');
    }
  }, [isOpen, currentConfig]);

  // Load voices when picker is opened or when modal opens (for current voice preview)
  const loadVoices = async () => {
    if (voices.length > 0) return;
    setLoadingVoices(true);
    try {
      const { data } = await supabase.functions.invoke('heygen-voices', {
        body: { action: 'list' },
      });
      if (data?.voices) setVoices(data.voices);
    } catch {
      toast.error('Failed to load voices');
    } finally {
      setLoadingVoices(false);
    }
  };

  useEffect(() => {
    if (!showVoicePicker) return;
    loadVoices();
  }, [showVoicePicker]);

  // Preload voices on open so current voice preview works
  useEffect(() => {
    if (isOpen && selectedVoiceId) loadVoices();
  }, [isOpen]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const filteredVoices = voices.filter(v => {
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

  const handleSelectVoice = (voice: Voice) => {
    setSelectedVoiceId(voice.voice_id);
    setSelectedVoiceName(voice.name);
    setShowVoicePicker(false);
  };

  const handleSave = async () => {
    if (!scriptTemplate.trim()) {
      toast.error('Script template cannot be empty');
      return;
    }
    setSaving(true);

    // If voice changed, update the avatar record too
    if (selectedVoiceId && selectedVoiceId !== currentConfig?.voice_id && currentConfig?.avatar_id) {
      try {
        await supabase.functions.invoke('heygen-avatar-create', {
          body: {
            action: 'finalize',
            avatar_id: currentConfig.avatar_id,
            voice_id: selectedVoiceId,
            voice_name: selectedVoiceName,
          },
        });
      } catch {
        // non-blocking — column config is the source of truth for video generation
      }
    }

    onSave({
      ...currentConfig,
      script_template: scriptTemplate,
      voice_source: voiceSource,
      voice_id: voiceSource === 'heygen_voice' ? selectedVoiceId : currentConfig?.voice_id,
      voice_name: voiceSource === 'heygen_voice'
        ? selectedVoiceName
        : voiceSource === 'cloned_voice'
          ? selectedClonedVoice?.name
          : currentConfig?.voice_name,
      voice_clone_id: voiceSource === 'cloned_voice' ? selectedClonedVoice?.id : undefined,
      audio_column_key: voiceSource === 'audio_column' ? audioColumnKey : undefined,
    });
    setSaving(false);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg mx-4 rounded-xl border border-gray-700/80 bg-gray-900 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-200">
              Edit Video Settings — {columnLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Avatar (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Avatar</label>
            <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2">
              {currentConfig?.avatar_type === 'digital_twin' ? (
                <Clapperboard className="w-4 h-4 text-purple-400 shrink-0" />
              ) : (
                <Image className="w-4 h-4 text-purple-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 truncate">
                  {currentConfig?.avatar_name || 'Unknown avatar'}
                </p>
                <p className="text-[10px] text-gray-500">
                  {currentConfig?.avatar_type === 'digital_twin'
                    ? 'Digital Twin — video-trained clone'
                    : 'Photo Avatar — AI-generated from image'}
                </p>
              </div>
            </div>
          </div>

          {/* Voice Source */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5" />
              Voice Source
            </label>

            {/* Source toggle */}
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
                <User className="w-3 h-3" />
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
                  Use an ElevenLabs cloned voice — TTS audio will be generated per row and lip-synced to the avatar.
                </p>
                {selectedClonedVoice ? (
                  <div className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-3 py-2">
                    <User className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 truncate">{selectedClonedVoice.name}</p>
                      <p className="text-[10px] text-indigo-400">Cloned Voice</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedClonedVoice(null)}
                      className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-700/50 transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <VoiceLibrary
                    selectable
                    onSelectVoice={(voice) => setSelectedClonedVoice({ id: voice.id, name: voice.name })}
                  />
                )}
              </div>
            ) : voiceSource === 'heygen_voice' ? (
              <>
                {/* Current voice with preview */}
                <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedVoiceId) return;
                      const current = voices.find(v => v.voice_id === selectedVoiceId);
                      if (current) {
                        handlePlayVoice(current);
                      } else {
                        setShowVoicePicker(true);
                      }
                    }}
                    className={`p-1.5 rounded-full transition-colors shrink-0 ${
                      playingVoice === selectedVoiceId
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-gray-700 text-gray-400 hover:text-purple-400 hover:bg-purple-500/10'
                    }`}
                    title={playingVoice === selectedVoiceId ? 'Stop preview' : 'Preview voice'}
                  >
                    {playingVoice === selectedVoiceId
                      ? <Pause className="w-3.5 h-3.5" />
                      : <Play className="w-3.5 h-3.5" />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">
                      {selectedVoiceName || 'No voice selected'}
                    </p>
                    {selectedVoiceId && (
                      <p className="text-[10px] text-gray-500 font-mono truncate">{selectedVoiceId}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowVoicePicker(!showVoicePicker)}
                    className="text-[10px] text-purple-400 font-medium hover:text-purple-300 px-2 py-1 rounded hover:bg-purple-500/10 transition-colors"
                  >
                    {showVoicePicker ? 'Close' : 'Change'}
                  </button>
                </div>

                {/* Voice picker */}
                {showVoicePicker && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={voiceSearch}
                      onChange={e => setVoiceSearch(e.target.value)}
                      placeholder="Search voices by name or language..."
                      autoFocus
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-purple-500"
                    />
                    <div className="max-h-48 overflow-y-auto space-y-0.5 rounded-lg border border-gray-700/50 bg-gray-800/30 p-1">
                      {loadingVoices ? (
                        <div className="flex items-center gap-2 px-3 py-4 justify-center text-xs text-gray-500">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Loading voices...
                        </div>
                      ) : filteredVoices.length === 0 ? (
                        <p className="text-xs text-gray-600 text-center py-3">No voices match</p>
                      ) : filteredVoices.slice(0, 50).map(voice => (
                        <div
                          key={voice.voice_id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                            selectedVoiceId === voice.voice_id
                              ? 'bg-purple-500/15 border border-purple-500/30'
                              : 'hover:bg-gray-700/50 border border-transparent'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handlePlayVoice(voice)}
                            className={`p-1.5 rounded-full shrink-0 transition-colors ${
                              playingVoice === voice.voice_id
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-gray-700/50 text-gray-500 hover:text-purple-400 hover:bg-purple-500/10'
                            }`}
                            title={voice.preview_audio ? 'Preview voice' : 'No preview available'}
                          >
                            {playingVoice === voice.voice_id
                              ? <Pause className="w-3 h-3" />
                              : <Play className="w-3 h-3" />
                            }
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectVoice(voice)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <p className="text-xs text-gray-200 truncate">{voice.name}</p>
                            <p className="text-[10px] text-gray-500">{voice.language} · {voice.gender}</p>
                          </button>
                          {selectedVoiceId === voice.voice_id && (
                            <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                    {!loadingVoices && filteredVoices.length > 50 && (
                      <p className="text-[10px] text-gray-600 text-center">
                        Showing 50 of {filteredVoices.length} — refine your search
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Audio Column mode */
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
                    .filter(c => !['video_avatar', 'heygen_video'].includes(c.key) && !c.key.startsWith('video_avatar'))
                    .map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))
                  }
                </select>
                {audioColumnKey && (
                  <p className="text-[10px] text-gray-500">
                    Each row&apos;s video will use the audio URL from the <span className="font-mono text-purple-400">{audioColumnKey}</span> column.
                    The script template will be ignored for voice — the avatar will lip-sync to the audio file.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Script template */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Script Template
            </label>
            <ScriptEditor
              value={scriptTemplate}
              onChange={setScriptTemplate}
              columns={existingColumns || []}
              excludeKeys={['video_avatar', 'heygen_video']}
              placeholder="Hi @contact_name, I noticed @contact_company is..."
              rows={5}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-purple-500 resize-y font-mono leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

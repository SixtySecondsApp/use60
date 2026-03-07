import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, Plus, Play, Pause, Trash2, Download, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';
import { VoiceCloneWizard } from './VoiceCloneWizard';
import { useElevenLabsIntegration } from '@/lib/hooks/useElevenLabsIntegration';

interface VoiceClone {
  id: string;
  name: string;
  description: string | null;
  source: string;
  status: string;
  preview_audio_url: string | null;
  language: string;
  api_key_source: string;
  created_at: string;
  elevenlabs_voice_id: string | null;
}

interface VoiceLibraryProps {
  onSelectVoice?: (voice: VoiceClone) => void;
  selectable?: boolean;
  selectedVoiceId?: string;
}

export function VoiceLibrary({ onSelectVoice, selectable, selectedVoiceId }: VoiceLibraryProps) {
  const { isAuthenticated } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const { isConnected: hasByokKey } = useElevenLabsIntegration();

  const [voices, setVoices] = useState<VoiceClone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Fetch voices ──────────────────────────────────────────
  const fetchVoices = useCallback(async () => {
    if (!isAuthenticated || !activeOrgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-voice-manage', {
        body: { action: 'list' },
      });
      if (error) throw error;
      setVoices(data?.voices || []);
    } catch (err) {
      console.error('[VoiceLibrary] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, activeOrgId]);

  useEffect(() => {
    fetchVoices();
  }, [fetchVoices]);

  // ─── Playback ──────────────────────────────────────────────
  const handlePlay = useCallback((voiceId: string, url: string) => {
    if (playingId === voiceId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(voiceId);
  }, [playingId]);

  // ─── Delete ────────────────────────────────────────────────
  const handleDelete = useCallback(async (voiceId: string) => {
    if (!confirm('Delete this voice? This cannot be undone.')) return;
    setDeletingId(voiceId);
    try {
      const { error } = await supabase.functions.invoke('elevenlabs-voice-manage', {
        body: { action: 'delete', id: voiceId },
      });
      if (error) throw error;
      toast.success('Voice deleted');
      setVoices((prev) => prev.filter((v) => v.id !== voiceId));
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }, []);

  // ─── Import remote ────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [remoteVoices, setRemoteVoices] = useState<any[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);

  const handleListRemote = useCallback(async () => {
    setShowImport(true);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-voice-manage', {
        body: { action: 'list_remote' },
      });
      if (error) throw error;
      setRemoteVoices(data?.voices || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load remote voices');
      setShowImport(false);
    }
  }, []);

  const handleImport = useCallback(async (voice: any) => {
    setImportingId(voice.voice_id);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-voice-manage', {
        body: {
          action: 'import_voice',
          elevenlabs_voice_id: voice.voice_id,
          name: voice.name,
        },
      });
      if (error) throw error;
      toast.success(`Imported "${voice.name}"`);
      setShowImport(false);
      fetchVoices();
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImportingId(null);
    }
  }, [fetchVoices]);

  const sourceLabel = (source: string) => {
    switch (source) {
      case 'instant_clone': return 'Cloned';
      case 'professional_clone': return 'Pro Clone';
      case 'imported': return 'Imported';
      case 'heygen_stock': return 'HeyGen';
      default: return source;
    }
  };

  if (showWizard) {
    return (
      <VoiceCloneWizard
        onComplete={(voice) => {
          setShowWizard(false);
          fetchVoices();
          toast.success(`"${voice.name}" cloned successfully`);
        }}
        onCancel={() => setShowWizard(false)}
      />
    );
  }

  if (showImport) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-200">Import from ElevenLabs</h3>
          <Button variant="ghost" size="sm" onClick={() => setShowImport(false)}>
            Back
          </Button>
        </div>
        {remoteVoices.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading voices...
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {remoteVoices.map((v: any) => (
              <div
                key={v.voice_id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 border border-gray-700/50"
              >
                <div>
                  <div className="text-sm text-gray-200">{v.name}</div>
                  <div className="text-xs text-gray-500">{v.category}</div>
                </div>
                <div className="flex items-center gap-2">
                  {v.preview_url && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                      const a = new Audio(v.preview_url);
                      a.play();
                    }}>
                      <Play className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={importingId === v.voice_id}
                    onClick={() => handleImport(v)}
                  >
                    {importingId === v.voice_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Import'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-200">Voice Library</h3>
        <div className="flex items-center gap-2">
          {hasByokKey && (
            <Button variant="outline" size="sm" onClick={handleListRemote}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Import
            </Button>
          )}
          <Button size="sm" onClick={() => setShowWizard(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Clone Voice
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-500" />
        </div>
      ) : voices.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">
          <Mic className="w-8 h-8 mx-auto mb-2 text-gray-600" />
          <p>No voices yet</p>
          <p className="text-xs mt-1">Clone your voice or import from ElevenLabs</p>
        </div>
      ) : (
        <div className="space-y-2">
          {voices.map((voice) => {
            const isSelected = selectable && selectedVoiceId === voice.id;
            return (
              <div
                key={voice.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-indigo-500/10 border-indigo-500/30'
                    : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600/50'
                } ${selectable ? 'cursor-pointer' : ''}`}
                onClick={selectable ? () => onSelectVoice?.(voice) : undefined}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {voice.preview_audio_url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlay(voice.id, voice.preview_audio_url!);
                      }}
                    >
                      {playingId === voice.id ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm text-gray-200 truncate">{voice.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {sourceLabel(voice.source)}
                      </Badge>
                      {voice.api_key_source === 'platform' && (
                        <span className="text-[10px] text-gray-500">Platform key</span>
                      )}
                      {voice.status === 'cloning' && (
                        <Badge className="bg-yellow-500/15 text-yellow-400 text-[10px] px-1.5 py-0">
                          Cloning...
                        </Badge>
                      )}
                      {voice.status === 'failed' && (
                        <Badge className="bg-red-500/15 text-red-400 text-[10px] px-1.5 py-0">
                          Failed
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {!selectable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-gray-500 hover:text-red-400"
                    disabled={deletingId === voice.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(voice.id);
                    }}
                  >
                    {deletingId === voice.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

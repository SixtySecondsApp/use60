import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Mic, Plus, Play, Pause, Trash2, Download, Loader2, Search, Check, ArrowLeft } from 'lucide-react';
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

type VoiceFilter = 'all' | 'cloned' | 'pro' | 'stock' | 'platform';

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

  // ─── Search & Filter ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<VoiceFilter>('all');

  // ─── Fetch local/imported voices ─────────────────────────────
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

  // ─── Browse & Import remote ──────────────────────────────────
  const [showBrowse, setShowBrowse] = useState(false);
  const [remoteVoices, setRemoteVoices] = useState<any[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [browseSearch, setBrowseSearch] = useState('');

  const fetchRemoteVoices = useCallback(async () => {
    setLoadingRemote(true);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-voice-manage', {
        body: { action: 'list_remote' },
      });
      if (error) throw error;
      setRemoteVoices(data?.voices || []);
    } catch (err: any) {
      console.error('[VoiceLibrary] remote voices error:', err);
    } finally {
      setLoadingRemote(false);
    }
  }, []);

  const handleOpenBrowse = useCallback(async () => {
    setShowBrowse(true);
    setBrowseSearch('');
    if (remoteVoices.length === 0) {
      await fetchRemoteVoices();
    }
  }, [remoteVoices.length, fetchRemoteVoices]);

  const handleImport = useCallback(async (voice: any) => {
    setImportingId(voice.voice_id);
    try {
      const { error } = await supabase.functions.invoke('elevenlabs-voice-manage', {
        body: {
          action: 'import_voice',
          elevenlabs_voice_id: voice.voice_id,
          name: voice.name,
        },
      });
      if (error) throw error;
      toast.success(`Imported "${voice.name}"`);
      fetchVoices();
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImportingId(null);
    }
  }, [fetchVoices]);

  // ─── Helpers ─────────────────────────────────────────────────
  const sourceLabel = (source: string) => {
    switch (source) {
      case 'instant_clone': return 'Cloned';
      case 'professional_clone': return 'Pro Clone';
      case 'imported': return 'Imported';
      case 'heygen_stock': return 'HeyGen';
      default: return source;
    }
  };

  const sourceBadgeClass = (source: string, apiKeySource: string) => {
    if (apiKeySource === 'platform') return 'border-purple-500/30 text-purple-400 bg-purple-500/10';
    switch (source) {
      case 'instant_clone': return 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10';
      case 'professional_clone': return 'border-amber-500/30 text-amber-400 bg-amber-500/10';
      case 'imported': return 'border-gray-500/30 text-gray-400';
      default: return '';
    }
  };

  const remoteCategoryLabel = (category: string) => {
    switch (category) {
      case 'premade': return 'Stock Voice';
      case 'cloned': return 'Cloned';
      case 'professional': return 'Pro Clone';
      case 'generated': return 'Generated';
      default: return category || 'Voice';
    }
  };

  const remoteCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'premade': return 'border-gray-500/30 text-gray-400';
      case 'cloned': return 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10';
      case 'professional': return 'border-amber-500/30 text-amber-400 bg-amber-500/10';
      case 'generated': return 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10';
      default: return '';
    }
  };

  // ─── Filtering (main view — local voices only) ───────────────
  const query = searchQuery.toLowerCase().trim();

  const matchesLocalFilter = (voice: VoiceClone) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'platform') return voice.api_key_source === 'platform';
    if (activeFilter === 'cloned') return voice.source === 'instant_clone';
    if (activeFilter === 'pro') return voice.source === 'professional_clone';
    if (activeFilter === 'stock') return voice.source === 'imported' || voice.source === 'heygen_stock';
    return true;
  };

  const filteredVoices = voices.filter((v) => {
    if (query && !v.name.toLowerCase().includes(query)) return false;
    return matchesLocalFilter(v);
  });

  const filters: { key: VoiceFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'cloned', label: 'Cloned' },
    { key: 'pro', label: 'Pro' },
    { key: 'stock', label: 'Stock' },
    { key: 'platform', label: 'Platform' },
  ];

  // ─── Browse view filtering ──────────────────────────────────
  const importedElevenLabsIds = new Set(voices.map((v) => v.elevenlabs_voice_id).filter(Boolean));

  const browseQuery = browseSearch.toLowerCase().trim();
  const filteredRemote = remoteVoices.filter((v) => {
    if (!browseQuery) return true;
    if (v.name.toLowerCase().includes(browseQuery)) return true;
    if (v.labels) {
      const labelStr = [v.labels.gender, v.labels.accent, v.labels.descriptive, v.labels.language]
        .filter(Boolean).join(' ').toLowerCase();
      if (labelStr.includes(browseQuery)) return true;
    }
    return false;
  });

  // ─── Wizard view ─────────────────────────────────────────────
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

  // ─── Browse ElevenLabs view ──────────────────────────────────
  if (showBrowse) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowBrowse(false)}>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <h3 className="text-sm font-medium text-gray-200">Browse ElevenLabs Voices</h3>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <Input
            placeholder="Search by name, accent, gender..."
            value={browseSearch}
            onChange={(e) => setBrowseSearch(e.target.value)}
            className="pl-8 h-8 text-sm bg-gray-800/50 border-gray-700/50"
            autoFocus
          />
        </div>

        {loadingRemote ? (
          <div className="py-8 text-center text-sm text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading voices...
          </div>
        ) : filteredRemote.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">
            {browseQuery ? 'No voices match your search' : 'No voices found in your ElevenLabs account'}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {filteredRemote.map((v: any) => {
              const isImported = importedElevenLabsIds.has(v.voice_id);
              return (
                <div
                  key={v.voice_id}
                  className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${
                    isImported
                      ? 'bg-gray-800/20 border-gray-700/30 opacity-60'
                      : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {v.preview_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => {
                          if (playingId === v.voice_id) {
                            audioRef.current?.pause();
                            setPlayingId(null);
                          } else {
                            if (audioRef.current) audioRef.current.pause();
                            const a = new Audio(v.preview_url);
                            audioRef.current = a;
                            a.onended = () => setPlayingId(null);
                            a.play();
                            setPlayingId(v.voice_id);
                          }
                        }}
                      >
                        {playingId === v.voice_id ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm text-gray-200 truncate">{v.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${remoteCategoryBadgeClass(v.category)}`}>
                          {remoteCategoryLabel(v.category)}
                        </Badge>
                        {v.labels && (
                          <span className="text-[10px] text-gray-500 truncate">
                            {[v.labels.gender, v.labels.accent, v.labels.descriptive].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isImported ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 shrink-0 px-2">
                      <Check className="w-3 h-3" />
                      Imported
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={importingId === v.voice_id}
                      onClick={() => handleImport(v)}
                    >
                      {importingId === v.voice_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Import'}
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

  // ─── Main view — imported voices ─────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-200">Voice Library</h3>
        <div className="flex items-center gap-2">
          {hasByokKey && (
            <Button variant="outline" size="sm" onClick={handleOpenBrowse}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Browse
            </Button>
          )}
          <Button size="sm" onClick={() => setShowWizard(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Clone Voice
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      {!loading && voices.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <Input
              placeholder="Search voices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm bg-gray-800/50 border-gray-700/50"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeFilter === f.key
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-gray-400 hover:text-gray-300 border border-transparent hover:bg-gray-800/50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-500" />
        </div>
      ) : voices.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">
          <Mic className="w-8 h-8 mx-auto mb-2 text-gray-600" />
          <p>No voices yet</p>
          <p className="text-xs mt-1">
            Clone your voice{hasByokKey ? ' or browse your ElevenLabs account' : ''}
          </p>
        </div>
      ) : filteredVoices.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-500">
          No voices match your search
        </div>
      ) : (
        <div className="space-y-2">
          {filteredVoices.map((voice) => {
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
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sourceBadgeClass(voice.source, voice.api_key_source)}`}>
                        {voice.api_key_source === 'platform' ? `${sourceLabel(voice.source)} · Platform` : sourceLabel(voice.source)}
                      </Badge>
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

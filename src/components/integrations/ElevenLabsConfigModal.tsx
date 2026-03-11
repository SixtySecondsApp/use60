import React, { useState } from 'react';
import { ConfigureModal, ConfigSection, DangerZone } from './ConfigureModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { KeyRound, Mic, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useElevenLabsIntegration } from '@/lib/hooks/useElevenLabsIntegration';
import { VoiceLibrary } from '@/components/settings/VoiceLibrary';

interface ElevenLabsConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ElevenLabsConfigModal({ open, onOpenChange }: ElevenLabsConfigModalProps) {
  const { isConnected, loading, planInfo, connectApiKey, disconnect } = useElevenLabsIntegration();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await connectApiKey(apiKey.trim());
      setApiKey('');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnect();
    } catch (e: any) {
      toast.error(e?.message || 'Disconnect failed');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <ConfigureModal
      open={open}
      onOpenChange={onOpenChange}
      integrationId="elevenlabs"
      integrationName="ElevenLabs"
      fallbackIcon={<Mic className="w-6 h-6 text-indigo-500" />}
      showFooter={false}
    >
      <ConfigSection title="Connection">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Status:{' '}
              <span className="font-semibold">
                {loading ? 'Loading\u2026' : isConnected ? 'Connected' : 'Not connected'}
              </span>
            </div>
            {isConnected ? (
              <Badge className="bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-500/30">
                Active
              </Badge>
            ) : (
              <Badge className="bg-gray-100/80 dark:bg-gray-800/50 text-gray-700 dark:text-gray-200 border-gray-200/50 dark:border-gray-700/30">
                Inactive
              </Badge>
            )}
          </div>
          {isConnected && planInfo && (
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              {planInfo.plan_tier && (
                <div>Plan: <span className="font-medium text-gray-300">{planInfo.plan_tier}</span></div>
              )}
              {planInfo.character_limit != null && (
                <div>
                  Characters: {(planInfo.character_count ?? 0).toLocaleString()} / {planInfo.character_limit.toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      </ConfigSection>

      <ConfigSection title="API Key">
        <div className="space-y-3">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Connect your ElevenLabs account for unlimited voice clones and full TTS access.
          </div>
          <div className="space-y-2">
            <Label htmlFor="elevenlabs_api_key">ElevenLabs API Key</Label>
            <Input
              id="elevenlabs_api_key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk_..."
              type="password"
            />
          </div>
          <Button onClick={handleSaveApiKey} disabled={!apiKey.trim() || saving} size="sm">
            <KeyRound className="w-4 h-4 mr-1.5" />
            {saving ? 'Verifying...' : isConnected ? 'Update Key' : 'Connect'}
          </Button>
        </div>
      </ConfigSection>

      {isConnected && (
        <ConfigSection title="Features">
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              Unlimited instant voice clones
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              Up to 3 professional voice clones
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              Full TTS with your ElevenLabs credits
            </div>
          </div>
        </ConfigSection>
      )}

      <ConfigSection title="Voice Library">
        <VoiceLibrary />
      </ConfigSection>

      {!isConnected && (
        <ConfigSection title="Don't have an ElevenLabs account?">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No worries — you get <strong className="text-gray-300">1 free instant voice clone</strong> using the platform key. Connect your own key for unlimited clones and higher volume TTS.
          </p>
        </ConfigSection>
      )}

      {isConnected && (
        <DangerZone>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? 'Disconnecting...' : 'Disconnect ElevenLabs'}
          </Button>
        </DangerZone>
      )}
    </ConfigureModal>
  );
}

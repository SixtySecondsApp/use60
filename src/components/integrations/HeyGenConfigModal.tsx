import React, { useState } from 'react';
import { ConfigureModal, ConfigSection, DangerZone } from './ConfigureModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { KeyRound, Video, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useHeyGenIntegration } from '@/lib/hooks/useHeyGenIntegration';

interface HeyGenConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HeyGenConfigModal({ open, onOpenChange }: HeyGenConfigModalProps) {
  const { isConnected, loading, connectApiKey, disconnect } = useHeyGenIntegration();
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
      integrationId="heygen"
      integrationName="Video Avatar"
      fallbackIcon={<Video className="w-6 h-6 text-purple-500" />}
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
        </div>
      </ConfigSection>

      <ConfigSection title="API Key">
        <div className="space-y-3">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Enter your API key to enable AI avatar creation and personalized video outreach.
          </div>
          <div className="space-y-2">
            <Label htmlFor="heygen_api_key">API Key</Label>
            <Input
              id="heygen_api_key"
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
              AI Avatar Creation (Photo + AI Training)
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              Personalized Video Generation
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              Video Outreach in Ops Campaigns
            </div>
          </div>
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
            {disconnecting ? 'Disconnecting...' : 'Disconnect Video Avatar'}
          </Button>
        </DangerZone>
      )}
    </ConfigureModal>
  );
}

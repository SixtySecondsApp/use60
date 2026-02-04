import React, { useState } from 'react';
import { ConfigureModal, ConfigSection, DangerZone } from './ConfigureModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { KeyRound, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useInstantlyIntegration } from '@/lib/hooks/useInstantlyIntegration';

interface InstantlyConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstantlyConfigModal({ open, onOpenChange }: InstantlyConfigModalProps) {
  const { isConnected, loading, connectApiKey, disconnect } = useInstantlyIntegration();
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
      integrationId="instantly"
      integrationName="Instantly"
      fallbackIcon={<Send className="w-6 h-6 text-gray-500" />}
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
            Enter your Instantly API key to enable lead push to email campaigns.
          </div>
          <div className="space-y-2">
            <Label htmlFor="instantly_api_key">API Key</Label>
            <Input
              id="instantly_api_key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste Instantly API key"
              type="password"
            />
          </div>
          <Button
            type="button"
            onClick={handleSaveApiKey}
            disabled={saving || !apiKey.trim()}
            className="gap-2"
          >
            <KeyRound className="w-4 h-4" />
            {saving ? 'Saving\u2026' : 'Save API Key'}
          </Button>
        </div>
      </ConfigSection>

      {isConnected && (
        <DangerZone
          title="Disconnect Instantly"
          description="Removes stored API key. Lead push to campaigns will stop working."
          buttonText="Disconnect"
          onAction={handleDisconnect}
          isLoading={disconnecting}
        />
      )}
    </ConfigureModal>
  );
}

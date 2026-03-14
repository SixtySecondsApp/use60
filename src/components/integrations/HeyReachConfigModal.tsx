import React, { useState } from 'react';
import { ConfigureModal, ConfigSection, DangerZone } from './ConfigureModal';
import { useHeyReachIntegration } from '@/lib/hooks/useHeyReachIntegration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Linkedin, Copy, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface HeyReachConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HeyReachConfigModal({ open, onOpenChange }: HeyReachConfigModalProps) {
  const {
    isConnected,
    loading,
    connecting,
    disconnecting,
    webhookUrl,
    lastWebhookAt,
    connectedAt,
    linkedCampaignsCount,
    connect,
    disconnect,
  } = useHeyReachIntegration();

  const [apiKey, setApiKey] = useState('');

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter your HeyReach API key');
      return;
    }
    try {
      await connect(apiKey.trim());
      setApiKey('');
    } catch (_) {
      // Error already toasted in hook
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (_) {
      // Error already toasted
    }
  };

  const copyWebhookUrl = () => {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl);
      toast.success('Webhook URL copied');
    }
  };

  // Webhook health indicator
  const getHealthIndicator = () => {
    if (!lastWebhookAt) return null;
    const hoursSince = (Date.now() - new Date(lastWebhookAt).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 12) return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    if (hoursSince < 24) return <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />;
    return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
  };

  return (
    <ConfigureModal
      open={open}
      onOpenChange={onOpenChange}
      integrationId="heyreach"
      integrationName="HeyReach"
      connectedAt={connectedAt || undefined}
      hasChanges={false}
      isSaving={connecting}
      isDisconnecting={disconnecting}
      fallbackIcon={<Linkedin className="w-6 h-6 text-blue-600" />}
      showFooter={false}
    >
      {!isConnected ? (
        <ConfigSection title="Connect HeyReach">
          <p className="text-xs text-gray-500 mb-3">
            Enter your HeyReach <span className="font-medium text-gray-700 dark:text-gray-300">workspace</span> API key. In HeyReach, go to Integrations &gt; HeyReach API &gt; Get API Key. The master API key will not work — you need the key generated from within the workspace.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Paste your HeyReach API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              disabled={connecting}
            />
            <Button onClick={handleConnect} disabled={connecting || !apiKey.trim()} size="sm">
              {connecting ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </ConfigSection>
      ) : (
        <>
          <ConfigSection title="Connection Status">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                Connected
              </Badge>
              {connectedAt && (
                <span className="text-xs text-gray-400">
                  since {new Date(connectedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 space-y-1">
              <div>Linked campaigns: {linkedCampaignsCount}</div>
              {lastWebhookAt && (
                <div className="flex items-center gap-1.5">
                  {getHealthIndicator()}
                  <span>Last webhook: {new Date(lastWebhookAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </ConfigSection>

          {webhookUrl && (
            <ConfigSection title="Webhook URL">
              <p className="text-xs text-gray-500 mb-2">
                Copy this URL and paste it into your HeyReach webhook settings. Create one webhook per event type you want to track.
              </p>
              <div className="flex gap-2 items-center">
                <code className="text-xs bg-gray-50 dark:bg-gray-900 px-2 py-1.5 rounded border flex-1 truncate">
                  {webhookUrl}
                </code>
                <Button variant="ghost" size="sm" onClick={copyWebhookUrl}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </ConfigSection>
          )}

          <DangerZone
            onAction={handleDisconnect}
            isLoading={disconnecting}
            title="Disconnect HeyReach"
            description="This will remove your API key and unlink all campaign connections."
          />
        </>
      )}
    </ConfigureModal>
  );
}

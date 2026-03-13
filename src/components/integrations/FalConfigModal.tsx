import React, { useState } from 'react';
import { ConfigureModal, ConfigSection, DangerZone } from './ConfigureModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { KeyRound, Video, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFalIntegration } from '@/lib/hooks/useFalIntegration';

interface FalConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FalConfigModal({ open, onOpenChange }: FalConfigModalProps) {
  const {
    isConfigured,
    mode,
    isLoading,
    connectApiKey,
    disconnectApiKey,
    testConnection,
    models,
    modelsLoading,
  } = useFalIntegration();

  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const isByok = mode === 'byok';
  const isPlatform = mode === 'platform';

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await connectApiKey(apiKey.trim());
      setApiKey('');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) return;
    setTesting(true);
    try {
      const ok = await testConnection(apiKey.trim());
      if (ok) {
        toast.success('API key is valid');
      } else {
        toast.error('API key test failed — check the key and try again');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectApiKey();
    } catch (e: any) {
      toast.error(e?.message || 'Disconnect failed');
    } finally {
      setDisconnecting(false);
    }
  };

  const statusLabel = () => {
    if (isLoading) return 'Loading\u2026';
    if (isByok) return 'Connected (BYOK)';
    if (isPlatform) return 'Connected (Platform)';
    return 'Not connected';
  };

  const statusBadge = () => {
    if (isByok || isPlatform) {
      return (
        <Badge className="bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-500/30">
          {isByok ? 'BYOK' : 'Platform'}
        </Badge>
      );
    }
    return (
      <Badge className="bg-gray-100/80 dark:bg-gray-800/50 text-gray-700 dark:text-gray-200 border-gray-200/50 dark:border-gray-700/30">
        Inactive
      </Badge>
    );
  };

  return (
    <ConfigureModal
      open={open}
      onOpenChange={onOpenChange}
      integrationId="fal-ai"
      integrationName="fal.ai"
      fallbackIcon={<Video className="w-6 h-6 text-violet-500" />}
      showFooter={false}
    >
      <ConfigSection title="Connection">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Status:{' '}
            <span className="font-semibold">{statusLabel()}</span>
          </div>
          {statusBadge()}
        </div>
      </ConfigSection>

      <ConfigSection title="API Key">
        <div className="space-y-3">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            {isByok
              ? 'You are using your own fal.ai API key. Update or remove it below.'
              : 'Connect your own fal.ai API key to use your account credits for video generation.'}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fal_api_key">fal.ai API Key</Label>
            <Input
              id="fal_api_key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="fal_key_..."
              type="password"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSaveApiKey}
              disabled={!apiKey.trim() || saving || testing}
              size="sm"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4 mr-1.5" />
                  {isByok ? 'Update Key' : 'Connect'}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={!apiKey.trim() || saving || testing}
              size="sm"
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>
          </div>
        </div>
      </ConfigSection>

      {isConfigured && (
        <ConfigSection title="Features">
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              Kling video generation
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              Veo video generation
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500" />
              Wan video generation
            </div>
            {isByok && (
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                Use your own fal.ai credits
              </div>
            )}
          </div>
        </ConfigSection>
      )}

      {!isConfigured && (
        <ConfigSection title="Don't have a fal.ai account?">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No worries — you can generate videos using{' '}
            <strong className="text-gray-300">platform credits</strong> without
            connecting your own key. Add your key to use your own fal.ai account
            and credits.
          </p>
        </ConfigSection>
      )}

      {models.length > 0 && (
        <ConfigSection title="Available Models">
          <div className="space-y-2">
            {modelsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading models...
              </div>
            ) : (
              models.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {model.display_name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {model.mode.replace('-', ' to ')} &middot; up to {model.max_duration_seconds}s
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                    <div>{model.credit_cost_per_second} cr/s</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ConfigSection>
      )}

      {isByok && (
        <DangerZone
          title="Remove API Key"
          description="Switches back to the platform key for video generation."
          buttonText={disconnecting ? 'Removing...' : 'Remove Key'}
          onAction={handleDisconnect}
          isLoading={disconnecting}
        />
      )}
    </ConfigureModal>
  );
}

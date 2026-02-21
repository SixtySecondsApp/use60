import React, { useState } from 'react';
import { ConfigureModal, ConfigSection, DangerZone } from './ConfigureModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { KeyRound, Database, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAiArkIntegration } from '@/lib/hooks/useAiArkIntegration';

interface AiArkConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AiArkConfigModal({ open, onOpenChange }: AiArkConfigModalProps) {
  const { isConnected, loading, connectApiKey, disconnect } = useAiArkIntegration();
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
      integrationId="ai-ark"
      integrationName="AI Ark"
      fallbackIcon={<Database className="w-6 h-6 text-violet-500" />}
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
            Enter your AI Ark API key to enable company search, people search, enrichment, and AI-powered similarity matching.
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai_ark_api_key">API Key</Label>
            <Input
              id="ai_ark_api_key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste AI Ark API key"
              type="password"
            />
            {isConnected ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Credits free — using your own API key
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No key configured — platform key used, credits apply
              </p>
            )}
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
        <ConfigSection title="Credit Costs">
          <div className="rounded-lg border border-amber-200/60 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-900/10 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                AI Ark charges credits per request. There is no free preview mode.
              </div>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1 ml-6">
              <div className="flex justify-between">
                <span>Company search</span>
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">~2.5 credits</span>
              </div>
              <div className="flex justify-between">
                <span>People search</span>
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">~12.5 credits</span>
              </div>
              <div className="flex justify-between">
                <span>Enrichment (per contact)</span>
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">varies</span>
              </div>
            </div>
          </div>
        </ConfigSection>
      )}

      {isConnected && (
        <DangerZone
          title="Disconnect AI Ark"
          description="Removes stored API key. Company search, people search, and enrichment via AI Ark will stop working."
          buttonText="Disconnect"
          onAction={handleDisconnect}
          isLoading={disconnecting}
        />
      )}
    </ConfigureModal>
  );
}

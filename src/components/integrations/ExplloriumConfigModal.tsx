import React, { useState } from 'react';
import { ConfigureModal, ConfigSection, DangerZone } from './ConfigureModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { KeyRound, Database, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useExploriumIntegration } from '@/lib/hooks/useExploriumIntegration';

interface ExplloriumConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExplloriumConfigModal({ open, onOpenChange }: ExplloriumConfigModalProps) {
  const { isConnected, loading, connectApiKey, disconnect } = useExploriumIntegration();
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
      integrationId="explorium"
      integrationName="Explorium"
      fallbackIcon={<Database className="w-6 h-6 text-indigo-500" />}
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
            Enter your Explorium API key to enable company and prospect searches, enrichments, intent signals, and lookalike matching.
          </div>
          <div className="space-y-2">
            <Label htmlFor="explorium_api_key">API Key</Label>
            <Input
              id="explorium_api_key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Explorium API key"
              type="password"
            />
            {isConnected ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Using your Explorium API key — searches and enrichments are billed to your Explorium account (no platform credits consumed)
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Using platform key — platform credits apply per search and enrichment
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

      {!isConnected && (
        <ConfigSection title="Platform Credit Costs">
          <div className="rounded-lg border border-gray-200/60 dark:border-gray-700/40 bg-gray-50/50 dark:bg-gray-800/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-gray-700/40">
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Action</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Platform Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/60 dark:divide-gray-700/40">
                <tr>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">Business or Prospect search</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-500 dark:text-gray-400">2 credits</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">Firmographics / Profile / Funding / Technographics</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-500 dark:text-gray-400">2 credits</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">Intent signals (Bombora) / Website traffic / Workforce</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-500 dark:text-gray-400">4 credits</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">Contact details reveal</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-500 dark:text-gray-400">10 credits</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">Lookalike companies</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-500 dark:text-gray-400">10 credits</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ConfigSection>
      )}

      {isConnected && (
        <DangerZone
          title="Disconnect Explorium"
          description="Removes stored API key. Company and prospect searches, enrichments, intent signals, and lookalike matching via Explorium will stop working."
          buttonText="Disconnect"
          onAction={handleDisconnect}
          isLoading={disconnecting}
        />
      )}
    </ConfigureModal>
  );
}

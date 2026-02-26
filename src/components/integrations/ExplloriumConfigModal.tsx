import React, { useState } from 'react';
import { ConfigureModal, ConfigSection, DangerZone } from './ConfigureModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Database, Check, Zap, Globe, Users, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useExploriumIntegration } from '@/lib/hooks/useExploriumIntegration';

interface ExplloriumConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CREDIT_ROWS = [
  { action: 'Business or Prospect search', cost: '2', tier: 'base' },
  { action: 'Firmographics / Funding / Technographics', cost: '2', tier: 'base' },
  { action: 'Intent signals (Bombora) / Website traffic / Workforce', cost: '4', tier: 'mid' },
  { action: 'Contact details reveal', cost: '10', tier: 'high' },
  { action: 'Lookalike companies', cost: '10', tier: 'high' },
] as const;

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
      fallbackIcon={<Database className="w-6 h-6 text-teal-500" />}
      showFooter={false}
    >
      {/* Capability highlights */}
      <div className="grid grid-cols-2 gap-2 px-6 pt-1 pb-4 border-b border-gray-100 dark:border-zinc-800/60">
        {[
          { icon: Globe, label: '80M+ companies' },
          { icon: Users, label: '200M+ prospects' },
          { icon: Zap, label: 'Intent signals' },
          { icon: TrendingUp, label: 'Verified emails' },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-zinc-900/60 border border-gray-100 dark:border-zinc-800/60 px-3 py-2">
            <Icon className="w-3.5 h-3.5 text-teal-500/70 shrink-0" />
            <span className="text-xs text-gray-600 dark:text-zinc-400">{label}</span>
          </div>
        ))}
      </div>

      <ConfigSection title="Connection">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {loading ? 'Checking status…' : isConnected ? 'Using your Explorium API key' : 'Using platform key'}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
              isConnected
                ? 'bg-teal-500/10 border-teal-500/20 text-teal-600 dark:text-teal-400'
                : 'bg-gray-100 dark:bg-zinc-800/50 border-gray-200 dark:border-zinc-700/50 text-gray-500 dark:text-zinc-500'
            }`}>
              {isConnected && <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />}
              {loading ? 'Loading' : isConnected ? 'BYOK active' : 'Platform key'}
            </span>
          </div>

          {isConnected && (
            <div className="rounded-lg border border-teal-500/15 bg-teal-500/[0.04] px-3.5 py-2.5 flex items-start gap-2">
              <Check className="w-3.5 h-3.5 text-teal-500 shrink-0 mt-0.5" />
              <p className="text-xs text-gray-600 dark:text-zinc-400">
                Searches and enrichments are billed directly to your Explorium account. Platform credits are not consumed.
              </p>
            </div>
          )}
        </div>
      </ConfigSection>

      <ConfigSection title="API Key">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Add your Explorium API key to use your own credits with no platform markup.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="explorium_api_key" className="text-xs font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider">
              API Key
            </Label>
            <Input
              id="explorium_api_key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveApiKey(); }}
              placeholder="Enter your Explorium API key"
              type="password"
              className="font-mono text-sm"
            />
          </div>
          <Button
            type="button"
            onClick={handleSaveApiKey}
            disabled={saving || !apiKey.trim()}
            size="sm"
            className="gap-2 bg-teal-600 hover:bg-teal-500 text-white border-0"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save API Key'}
          </Button>
        </div>
      </ConfigSection>

      {!isConnected && (
        <ConfigSection title="Platform Credit Costs">
          <div className="rounded-xl border border-gray-200/60 dark:border-zinc-800/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-zinc-800/60 bg-gray-50/50 dark:bg-zinc-900/40">
                  <th className="text-left px-3.5 py-2 text-[10px] font-semibold text-gray-400 dark:text-zinc-600 uppercase tracking-widest">Action</th>
                  <th className="text-right px-3.5 py-2 text-[10px] font-semibold text-gray-400 dark:text-zinc-600 uppercase tracking-widest">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80 dark:divide-zinc-800/60">
                {CREDIT_ROWS.map(({ action, cost, tier }) => (
                  <tr key={action} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                    <td className="px-3.5 py-2.5 text-xs text-gray-600 dark:text-zinc-400">{action}</td>
                    <td className="px-3.5 py-2.5 text-right">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        tier === 'high'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : tier === 'mid'
                          ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                          : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400'
                      }`}>
                        {cost} cr
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-zinc-600 mt-2">
            Matching is always free. Cached enrichments consume no credits.
          </p>
        </ConfigSection>
      )}

      {isConnected && (
        <DangerZone
          title="Disconnect Explorium"
          description="Removes your stored API key. Searches and enrichments will fall back to the platform key with standard credit costs."
          buttonText="Disconnect"
          onAction={handleDisconnect}
          isLoading={disconnecting}
        />
      )}
    </ConfigureModal>
  );
}

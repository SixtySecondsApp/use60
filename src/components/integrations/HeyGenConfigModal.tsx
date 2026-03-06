import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfigureModal, ConfigSection, DangerZone } from './ConfigureModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { KeyRound, Video, Check, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { useHeyGenIntegration } from '@/lib/hooks/useHeyGenIntegration';

interface HeyGenConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HeyGenConfigModal({ open, onOpenChange }: HeyGenConfigModalProps) {
  const navigate = useNavigate();
  const { isConnected, loading, connectApiKey, disconnect } = useHeyGenIntegration();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showByok, setShowByok] = useState(false);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await connectApiKey(apiKey.trim());
      setApiKey('');
      setShowByok(false);
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
          {isConnected && (
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Using 60 platform credits. Video generation is included in your plan.
            </p>
          )}
        </div>
      </ConfigSection>

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

      {isConnected && (
        <ConfigSection title="Get Started">
          <Button
            size="sm"
            onClick={() => {
              onOpenChange(false);
              navigate('/settings/integrations/video-avatar');
            }}
            className="bg-purple-600 hover:bg-purple-500 text-white"
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            Create Your Avatar
          </Button>
        </ConfigSection>
      )}

      {/* Bring Your Own Key — collapsible advanced section */}
      <ConfigSection title="Advanced">
        <button
          type="button"
          onClick={() => setShowByok(!showByok)}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {showByok ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Use your own HeyGen API key
        </button>

        {showByok && (
          <div className="mt-3 space-y-3">
            <div className="text-xs text-gray-500 dark:text-gray-500">
              Optionally connect your own HeyGen account to use your own credits instead of 60 platform credits.
            </div>
            <div className="space-y-2">
              <Label htmlFor="heygen_api_key">HeyGen API Key</Label>
              <Input
                id="heygen_api_key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_..."
                type="password"
              />
            </div>
            <Button onClick={handleSaveApiKey} disabled={!apiKey.trim() || saving} size="sm" variant="outline">
              <KeyRound className="w-4 h-4 mr-1.5" />
              {saving ? 'Verifying...' : 'Connect Own Key'}
            </Button>
          </div>
        )}
      </ConfigSection>

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

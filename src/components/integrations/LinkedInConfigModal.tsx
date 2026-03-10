import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfigureModal, ConfigSection, DangerZone } from '@/components/integrations/ConfigureModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Users,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Clock,
  Activity,
  FileText,
  Calendar,
  Loader2,
} from 'lucide-react';
import { useLinkedInIntegration, LinkedInLeadSourceRow } from '@/lib/hooks/useLinkedInIntegration';
import { supabase } from '@/lib/supabase/clientV2';

export function LinkedInConfigModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const {
    isConnected,
    integration,
    leadSources,
    loading,
    connecting,
    canManage,
    connectLinkedIn,
    disconnectLinkedIn,
    refreshStatus,
  } = useLinkedInIntegration();

  const [disconnecting, setDisconnecting] = useState(false);
  const [syncHistory, setSyncHistory] = useState<Array<{
    id: string;
    run_type: string;
    leads_received: number;
    leads_created: number;
    leads_matched: number;
    duration_ms: number | null;
    error: string | null;
    started_at: string;
  }>>([]);
  const [syncHistoryLoading, setSyncHistoryLoading] = useState(false);
  const [showSyncHistory, setShowSyncHistory] = useState(false);

  const connectedAt = integration?.connected_at || null;
  const accountName = integration?.linkedin_ad_account_name;
  const scopeCount = integration?.scopes?.length || 0;
  const lastSync = integration?.last_sync_at;
  const activeSourceCount = leadSources.filter((s) => s.is_active).length;

  const webhookUrl = useMemo(() => {
    const publicUrl = import.meta.env.VITE_PUBLIC_URL || window.location.origin;
    return `${publicUrl}/api/webhooks/linkedin`;
  }, []);

  // Load sync history when section is expanded
  const loadSyncHistory = useCallback(async () => {
    if (!integration?.org_id) return;
    setSyncHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('linkedin_sync_runs')
        .select('id, run_type, leads_received, leads_created, leads_matched, duration_ms, error, started_at')
        .eq('org_id', integration.org_id)
        .order('started_at', { ascending: false })
        .limit(20);
      setSyncHistory(data || []);
    } catch {
      // Silently fail
    } finally {
      setSyncHistoryLoading(false);
    }
  }, [integration?.org_id]);

  useEffect(() => {
    if (showSyncHistory && isConnected) {
      loadSyncHistory();
    }
  }, [showSyncHistory, isConnected, loadSyncHistory]);

  const handleToggleSource = async (source: LinkedInLeadSourceRow) => {
    try {
      await supabase
        .from('linkedin_lead_sources')
        .update({ is_active: !source.is_active, updated_at: new Date().toISOString() })
        .eq('id', source.id);
      await refreshStatus();
      toast.success(`Lead source ${source.is_active ? 'disabled' : 'enabled'}`);
    } catch {
      toast.error('Failed to update lead source');
    }
  };

  return (
    <ConfigureModal
      open={open}
      onOpenChange={onOpenChange}
      integrationId="linkedin"
      integrationName="LinkedIn"
      connectedAt={connectedAt || undefined}
      hasChanges={false}
      isSaving={false}
      fallbackIcon={<Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />}
    >
      {/* Connection Status */}
      <ConfigSection title="Connection Status">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {isConnected ? 'Connected' : 'Not Connected'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {accountName ? `Ad Account: ${accountName}` : isConnected ? 'Connected' : 'No account linked'}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refreshStatus()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {isConnected ? (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Scopes</div>
                <div className="text-sm font-medium mt-1">{scopeCount} granted</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Lead Sources</div>
                <div className="text-sm font-medium mt-1">{activeSourceCount} active</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Last Sync</div>
                <div className="text-sm font-medium mt-1">
                  {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Connected</div>
                <div className="text-sm font-medium mt-1">
                  {connectedAt ? new Date(connectedAt).toLocaleDateString() : '-'}
                </div>
              </div>
            </div>
          ) : (
            <div className="pt-2">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Connect your LinkedIn account to receive leads from Lead Gen Forms and Events automatically.
              </p>
              <Button
                onClick={async () => {
                  try {
                    await connectLinkedIn();
                  } catch (e: any) {
                    toast.error(e?.message || 'Failed to start LinkedIn connection');
                  }
                }}
                disabled={!canManage || connecting}
                className="w-full"
              >
                {connecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Connect with LinkedIn
              </Button>
            </div>
          )}
        </div>
      </ConfigSection>

      {/* Lead Sources */}
      {isConnected && (
        <ConfigSection title="Lead Sources">
          <div className="space-y-3">
            {leadSources.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No lead sources configured yet. Lead sources are automatically registered when LinkedIn sends webhook events.
              </p>
            ) : (
              leadSources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {source.source_type === 'event_form' ? (
                      <Calendar className="h-4 w-4 text-purple-500 flex-shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {source.form_name || source.form_id}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {source.source_type === 'event_form' ? 'Event' : 'Ad Form'}
                        </Badge>
                        {source.campaign_name && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {source.campaign_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={source.is_active}
                    onCheckedChange={() => handleToggleSource(source)}
                    disabled={!canManage}
                  />
                </div>
              ))
            )}
          </div>
        </ConfigSection>
      )}

      {/* Webhook URL */}
      {isConnected && webhookUrl && (
        <ConfigSection title="Webhook URL">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1.5 rounded truncate">
                {webhookUrl}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast.success('Webhook URL copied');
                }}
              >
                Copy
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Register this URL in your LinkedIn Campaign Manager webhook settings.
            </p>
          </div>
        </ConfigSection>
      )}

      {/* Sync History */}
      {isConnected && (
        <ConfigSection title="Sync History">
          <div className="space-y-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSyncHistory(!showSyncHistory)}
            >
              <Activity className="h-4 w-4 mr-1.5" />
              {showSyncHistory ? 'Hide History' : 'View Sync History'}
            </Button>

            {showSyncHistory && (
              <div className="space-y-2">
                {syncHistoryLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                ) : syncHistory.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-2">No sync runs yet.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {syncHistory.map((run) => (
                      <div
                        key={run.id}
                        className="rounded-lg border p-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3 text-gray-400" />
                            <span className="text-gray-600 dark:text-gray-300">
                              {new Date(run.started_at).toLocaleString()}
                            </span>
                          </div>
                          <Badge
                            variant={run.error ? 'destructive' : 'secondary'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {run.run_type}
                          </Badge>
                        </div>
                        <div className="flex gap-3 text-gray-500 dark:text-gray-400">
                          <span>Received: {run.leads_received}</span>
                          <span>Created: {run.leads_created}</span>
                          <span>Matched: {run.leads_matched}</span>
                          {run.duration_ms != null && <span>{run.duration_ms}ms</span>}
                        </div>
                        {run.error && (
                          <div className="text-destructive truncate">{run.error}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </ConfigSection>
      )}

      {/* Danger Zone */}
      {isConnected && (
        <DangerZone
          title="Disconnect LinkedIn"
          description="This will stop receiving lead notifications and deactivate all lead sources. You'll need to reconnect and reconfigure to resume."
          buttonText="Disconnect"
          onAction={async () => {
            setDisconnecting(true);
            try {
              await disconnectLinkedIn();
            } catch (e: any) {
              toast.error(e?.message || 'Failed to disconnect');
            } finally {
              setDisconnecting(false);
            }
          }}
          isLoading={disconnecting}
          disabled={!canManage}
        />
      )}
    </ConfigureModal>
  );
}

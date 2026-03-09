/**
 * Bullhorn ATS Configuration Modal
 *
 * Provides connection status, sync controls, and quick actions
 * for the Bullhorn ATS integration.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfigureModal, ConfigSection, DangerZone } from '@/components/integrations/ConfigureModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Settings2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertTriangle,
  Briefcase,
  Building2,
  FileText,
  Loader2,
} from 'lucide-react';
import { ProcessMapButton } from '@/components/process-maps';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// =============================================================================
// Types
// =============================================================================

interface BullhornIntegration {
  id: string;
  org_id: string;
  bullhorn_corp_id: string | null;
  bullhorn_username: string | null;
  is_active: boolean;
  connected_at: string | null;
  last_token_refresh: string | null;
  settings: BullhornSettings | null;
  metadata: Record<string, unknown> | null;
}

interface BullhornSettings {
  candidate_sync?: { enabled: boolean };
  contact_sync?: { enabled: boolean };
  job_order_sync?: { enabled: boolean };
  placement_sync?: { enabled: boolean };
  task_sync?: { enabled: boolean };
  note_writeback?: { enabled: boolean };
}

interface BullhornSyncState {
  sync_status: 'idle' | 'syncing' | 'error';
  last_sync_at: string | null;
  error_message: string | null;
  entities_synced: number;
}

// =============================================================================
// Hook: useBullhornIntegration
// =============================================================================

function useBullhornIntegration() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  // Fetch integration data
  const { data: integration, isLoading: integrationLoading, refetch: refetchIntegration } = useQuery({
    queryKey: ['bullhorn-integration', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('bullhorn_integrations')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();

      if (error) throw error;
      return data as BullhornIntegration | null;
    },
    enabled: !!orgId,
  });

  // Fetch sync state
  const { data: syncState, isLoading: syncStateLoading } = useQuery({
    queryKey: ['bullhorn-sync-state', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('bullhorn_sync_state')
        .select('*')
        .eq('org_id', orgId)
        .order('last_sync_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data as BullhornSyncState | null;
    },
    enabled: !!orgId,
  });

  // Get sync metrics
  const { data: syncMetrics } = useQuery({
    queryKey: ['bullhorn-sync-metrics', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('bullhorn_object_mappings')
        .select('bullhorn_entity_type')
        .eq('org_id', orgId);

      if (error) throw error;

      // Count by entity type
      const counts: Record<string, number> = {};
      for (const mapping of data || []) {
        const type = mapping.bullhorn_entity_type;
        counts[type] = (counts[type] || 0) + 1;
      }

      return {
        candidates: counts['Candidate'] || 0,
        contacts: counts['ClientContact'] || 0,
        companies: counts['ClientCorporation'] || 0,
        jobs: counts['JobOrder'] || 0,
        placements: counts['Placement'] || 0,
        total: data?.length || 0,
      };
    },
    enabled: !!orgId && !!integration?.is_active,
  });

  // Trigger sync mutation
  const triggerSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await supabase.functions.invoke('bullhorn-sync', {
        body: { action: 'full_sync' },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Sync started');
      queryClient.invalidateQueries({ queryKey: ['bullhorn-sync-state', orgId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start sync');
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!integration?.id) throw new Error('No integration found');

      const { error } = await supabase
        .from('bullhorn_integrations')
        .update({
          is_active: false,
          access_token: null,
          refresh_token: null,
          bh_rest_token: null,
        })
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Bullhorn disconnected');
      queryClient.invalidateQueries({ queryKey: ['bullhorn-integration', orgId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disconnect');
    },
  });

  return {
    integration,
    syncState,
    syncMetrics,
    isConnected: !!integration?.is_active,
    loading: integrationLoading || syncStateLoading,
    triggerSync: triggerSyncMutation.mutate,
    isSyncing: triggerSyncMutation.isPending,
    disconnect: disconnectMutation.mutateAsync,
    disconnecting: disconnectMutation.isPending,
    refreshStatus: refetchIntegration,
  };
}

// =============================================================================
// Component
// =============================================================================

export function BullhornConfigModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const orgId = useOrgId();
  const {
    integration,
    syncState,
    syncMetrics,
    isConnected,
    loading,
    triggerSync,
    isSyncing,
    disconnect,
    disconnecting,
    refreshStatus,
  } = useBullhornIntegration();

  const connectedAt = integration?.connected_at || null;
  const corpId = integration?.bullhorn_corp_id || null;
  const username = integration?.bullhorn_username || null;
  const settings = integration?.settings;

  const connectionLabel = useMemo(() => {
    if (!isConnected) return 'Not connected';
    return corpId ? `Corp ID: ${corpId}` : 'Connected';
  }, [corpId, isConnected]);

  // Count enabled features from settings
  const enabledFeatures = useMemo(() => {
    const features: string[] = [];
    if (settings?.candidate_sync?.enabled) features.push('Candidate Sync');
    if (settings?.contact_sync?.enabled) features.push('Contact Sync');
    if (settings?.job_order_sync?.enabled) features.push('Job Order Sync');
    if (settings?.placement_sync?.enabled) features.push('Placement Sync');
    if (settings?.task_sync?.enabled) features.push('Task Sync');
    if (settings?.note_writeback?.enabled) features.push('Note Writeback');
    return features;
  }, [settings]);

  const handleGoToSettings = () => {
    onOpenChange(false);
    navigate('/settings/integrations/bullhorn');
  };

  const handleConnect = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error('No active session. Please log in again.');
        return;
      }

      const resp = await supabase.functions.invoke('oauth-initiate/bullhorn', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ org_id: orgId, redirect_path: '/settings/integrations/bullhorn' }),
      });

      if (resp.error) {
        throw new Error(resp.error.message || 'Failed to initiate Bullhorn OAuth');
      }
      if (!resp.data?.success) {
        const errorMsg = resp.data?.message || resp.data?.error || 'Failed to initiate Bullhorn OAuth';
        throw new Error(errorMsg);
      }

      const url = resp.data?.authorization_url;
      if (!url) throw new Error('Missing authorization_url from response');
      window.location.href = url;
    } catch (e: any) {
      toast.error(e.message || 'Failed to connect Bullhorn');
    }
  }, [orgId]);

  return (
    <ConfigureModal
      open={open}
      onOpenChange={onOpenChange}
      integrationId="bullhorn"
      integrationName="Bullhorn ATS"
      connectedAt={connectedAt || undefined}
      hasChanges={false}
      isSaving={false}
      fallbackIcon={<Briefcase className="w-6 h-6 text-sky-500" />}
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
                  {connectionLabel}
                  {username && ` • ${username}`}
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

          {!isConnected && (
            <Button onClick={handleConnect} className="w-full">
              <Briefcase className="h-4 w-4 mr-2" />
              Connect Bullhorn
            </Button>
          )}

          {isConnected && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Sync Status</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      syncState?.sync_status === 'syncing'
                        ? 'bg-amber-500 animate-pulse'
                        : syncState?.sync_status === 'error'
                        ? 'bg-destructive'
                        : 'bg-green-500'
                    }`}
                  />
                  <span className="text-sm font-medium capitalize">
                    {syncState?.sync_status || 'idle'}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Last Sync</div>
                <div className="text-sm font-medium mt-1">
                  {syncState?.last_sync_at
                    ? new Date(syncState.last_sync_at).toLocaleString()
                    : 'Never'}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Entities Synced</div>
                <div className="text-sm font-medium mt-1">
                  {syncMetrics?.total || 0} total
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Features</div>
                <div className="text-sm font-medium mt-1">
                  {enabledFeatures.length > 0
                    ? `${enabledFeatures.length} enabled`
                    : 'None configured'}
                </div>
              </div>
            </div>
          )}

          {syncState?.error_message && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-xs text-destructive">{syncState.error_message}</div>
            </div>
          )}
        </div>
      </ConfigSection>

      {/* Sync Metrics */}
      {isConnected && syncMetrics && syncMetrics.total > 0 && (
        <ConfigSection title="Synced Entities">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-2 rounded-lg border p-2">
              <Users className="h-4 w-4 text-blue-500" />
              <div>
                <div className="text-sm font-medium">{syncMetrics.candidates}</div>
                <div className="text-xs text-muted-foreground">Candidates</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border p-2">
              <Users className="h-4 w-4 text-green-500" />
              <div>
                <div className="text-sm font-medium">{syncMetrics.contacts}</div>
                <div className="text-xs text-muted-foreground">Contacts</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border p-2">
              <Building2 className="h-4 w-4 text-purple-500" />
              <div>
                <div className="text-sm font-medium">{syncMetrics.companies}</div>
                <div className="text-xs text-muted-foreground">Companies</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border p-2">
              <Briefcase className="h-4 w-4 text-orange-500" />
              <div>
                <div className="text-sm font-medium">{syncMetrics.jobs}</div>
                <div className="text-xs text-muted-foreground">Jobs</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border p-2">
              <FileText className="h-4 w-4 text-emerald-500" />
              <div>
                <div className="text-sm font-medium">{syncMetrics.placements}</div>
                <div className="text-xs text-muted-foreground">Placements</div>
              </div>
            </div>
          </div>
        </ConfigSection>
      )}

      {/* Quick Actions */}
      {isConnected && (
        <ConfigSection title="Quick Actions">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => triggerSync()}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                )}
                Trigger Sync
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <a
                  href="https://www.bullhornstaffing.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Open Bullhorn
                </a>
              </Button>
              <ProcessMapButton
                processType="integration"
                processName="bullhorn"
                variant="outline"
                size="sm"
                label="Process Map"
              />
            </div>
          </div>
        </ConfigSection>
      )}

      {/* Enabled Features Summary */}
      {isConnected && enabledFeatures.length > 0 && (
        <ConfigSection title="Enabled Features">
          <div className="flex flex-wrap gap-1.5">
            {enabledFeatures.map((feature) => (
              <Badge key={feature} variant="secondary" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {feature}
              </Badge>
            ))}
          </div>
        </ConfigSection>
      )}

      {/* Settings Link */}
      <ConfigSection title="Configuration">
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configure candidate sync, contact sync, job order sync, placement sync, and
            note writeback on the dedicated settings page.
          </p>
          <Button onClick={handleGoToSettings} className="w-full" disabled={!isConnected}>
            <Settings2 className="h-4 w-4 mr-2" />
            Configure Bullhorn Settings
          </Button>
        </div>
      </ConfigSection>

      {/* Danger Zone */}
      {isConnected && (
        <DangerZone
          title="Disconnect Bullhorn"
          description="This will stop all sync operations and revoke access tokens. You'll need to reconnect to resume syncing."
          buttonText="Disconnect"
          onAction={async () => {
            try {
              await disconnect();
            } catch (e: any) {
              toast.error(e?.message || 'Failed to disconnect');
            }
          }}
          isLoading={disconnecting}
          disabled={false}
        />
      )}
    </ConfigureModal>
  );
}

export default BullhornConfigModal;

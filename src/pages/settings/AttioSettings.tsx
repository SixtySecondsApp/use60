/**
 * AttioSettings Page
 *
 * Team admin page for configuring Attio CRM integration settings.
 * Allows configuration of connection, sync features, and object mapping.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Users,
  Briefcase,
  Building2,
  RefreshCw,
  Settings2,
  Zap,
  AlertTriangle,
  Clock,
} from 'lucide-react';

import { PageContainer } from '@/components/layout/PageContainer';
import { useAttioIntegration } from '@/lib/hooks/useAttioIntegration';
import { useIsOrgAdmin } from '@/contexts/UserPermissionsContext';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function ConnectionStatusCard({
  integration,
  syncState,
  onDisconnect,
  onRefresh,
  isDisconnecting,
  isRefreshing,
}: {
  integration: any;
  syncState: any;
  onDisconnect: () => void;
  onRefresh: () => void;
  isDisconnecting: boolean;
  isRefreshing: boolean;
}) {
  const isConnected = Boolean(integration?.is_connected);
  const workspaceName = integration?.workspace_name;
  const connectedBy = integration?.connected_by;
  const connectedAt = integration?.connected_at;
  const lastSync = syncState?.last_sync_completed_at;
  const syncStatus = syncState?.sync_status || 'idle';

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isConnected ? 'bg-green-500/10' : 'bg-destructive/10'}`}>
              {isConnected ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
            </div>
            <div>
              <CardTitle className="text-base">
                {isConnected ? 'Attio Connected' : 'Attio Not Connected'}
              </CardTitle>
              <CardDescription>
                {isConnected
                  ? `Workspace: ${workspaceName || 'Unknown'}${connectedBy ? ` - Connected by ${connectedBy}` : ''}`
                  : 'Connect your Attio workspace to enable CRM sync features'}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onDisconnect}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disconnect'}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      {isConnected && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground text-xs">Status</Label>
              <div className="flex items-center gap-1.5 mt-1">
                <div
                  className={`h-2 w-2 rounded-full ${
                    syncStatus === 'syncing'
                      ? 'bg-amber-500 animate-pulse'
                      : syncStatus === 'error'
                      ? 'bg-destructive'
                      : 'bg-green-500'
                  }`}
                />
                <span className="capitalize">{syncStatus}</span>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Connected</Label>
              <p className="mt-1">
                {connectedAt ? new Date(connectedAt).toLocaleDateString() : 'Unknown'}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Last Sync</Label>
              <p className="mt-1">
                {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}
              </p>
            </div>
          </div>

          {syncState?.error_message && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{syncState.error_message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function SyncStatusCard({
  syncState,
  onTriggerSync,
  isSyncing,
}: {
  syncState: any;
  onTriggerSync: () => void;
  isSyncing: boolean;
}) {
  const lastSync = syncState?.last_sync_completed_at;
  const syncStatus = syncState?.sync_status || 'idle';

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <RefreshCw className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Sync Settings</CardTitle>
              <CardDescription>Manage data synchronization with Attio</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Last Sync</p>
              <p className="text-xs text-muted-foreground">
                {lastSync ? new Date(lastSync).toLocaleString() : 'Never synced'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                syncStatus === 'syncing'
                  ? 'default'
                  : syncStatus === 'error'
                  ? 'destructive'
                  : 'secondary'
              }
              className="gap-1"
            >
              {syncStatus === 'syncing' && <Loader2 className="h-3 w-3 animate-spin" />}
              <span className="capitalize">{syncStatus}</span>
            </Badge>
          </div>
        </div>

        <Button
          onClick={onTriggerSync}
          disabled={isSyncing}
          className="w-full"
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {isSyncing ? 'Syncing...' : 'Trigger Manual Sync'}
        </Button>

        {syncState?.error_message && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{syncState.error_message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function ObjectConfigCard({
  settings,
  onSaveSettings,
  isSaving,
}: {
  settings: any;
  onSaveSettings: (settings: any) => void;
  isSaving: boolean;
}) {
  const objects = [
    {
      key: 'people',
      label: 'People',
      description: 'Sync contacts and people records from Attio',
      icon: Users,
    },
    {
      key: 'companies',
      label: 'Companies',
      description: 'Sync company and organization records from Attio',
      icon: Building2,
    },
    {
      key: 'deals',
      label: 'Deals',
      description: 'Sync deal and opportunity records from Attio',
      icon: Briefcase,
    },
  ];

  const enabledObjects = settings?.enabled_objects || {
    people: true,
    companies: true,
    deals: true,
  };

  const handleToggle = (objectKey: string, checked: boolean) => {
    const updated = {
      ...settings,
      enabled_objects: {
        ...enabledObjects,
        [objectKey]: checked,
      },
    };
    onSaveSettings(updated);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Object Configuration</CardTitle>
            <CardDescription>Choose which Attio objects to sync with Sixty</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {objects.map((obj) => (
          <div
            key={obj.key}
            className="flex items-center justify-between p-3 rounded-lg border"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <obj.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{obj.label}</p>
                <p className="text-xs text-muted-foreground">{obj.description}</p>
              </div>
            </div>
            <Switch
              checked={enabledObjects[obj.key] ?? true}
              onCheckedChange={(checked) => handleToggle(obj.key, checked)}
              disabled={isSaving}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AttioSettings() {
  const navigate = useNavigate();
  const isAdmin = useIsOrgAdmin();
  const {
    integration,
    syncState,
    settings,
    isConnected,
    canManage,
    loading,
    saving,
    disconnecting,
    refreshStatus,
    connectAttio,
    disconnect,
    saveSettings,
    triggerSync,
  } = useAttioIntegration();

  const [isSyncing, setIsSyncing] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const handleConnect = useCallback(async () => {
    try {
      await connectAttio();
    } catch (e: any) {
      toast.error(e.message || 'Failed to connect Attio');
    }
  }, [connectAttio]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      setShowDisconnectDialog(false);
      toast.success('Attio disconnected');
    } catch (e: any) {
      toast.error(e.message || 'Failed to disconnect Attio');
    }
  }, [disconnect]);

  const handleTriggerSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await triggerSync();
      toast.success('Sync started');
    } catch (e: any) {
      toast.error(e.message || 'Failed to trigger sync');
    } finally {
      setIsSyncing(false);
    }
  }, [triggerSync]);

  const handleSaveSettings = useCallback(
    async (updatedSettings: any) => {
      try {
        await saveSettings(updatedSettings);
        toast.success('Settings saved');
      } catch (e: any) {
        toast.error(e.message || 'Failed to save settings');
      }
    },
    [saveSettings]
  );

  if (!canManage) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You need to be an organization admin to configure Attio settings.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Attio Integration</h1>
            <p className="text-muted-foreground">
              Configure sync settings and data flow between Sixty and Attio CRM
            </p>
          </div>
        </div>

        {/* Connection Status */}
        <ConnectionStatusCard
          integration={integration}
          syncState={syncState}
          onDisconnect={() => setShowDisconnectDialog(true)}
          onRefresh={refreshStatus}
          isDisconnecting={disconnecting}
          isRefreshing={loading}
        />

        {!isConnected ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Settings2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Connect Attio to Get Started</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Connect your Attio workspace to enable people sync, company sync, deal sync,
                and AI-powered CRM automation.
              </p>
              <Button onClick={handleConnect}>
                <Zap className="h-4 w-4 mr-2" />
                Connect Attio
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Sync Settings */}
            <SyncStatusCard
              syncState={syncState}
              onTriggerSync={handleTriggerSync}
              isSyncing={isSyncing}
            />

            {/* Object Configuration */}
            <ObjectConfigCard
              settings={settings}
              onSaveSettings={handleSaveSettings}
              isSaving={saving}
            />
          </div>
        )}
      </div>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect Attio?</DialogTitle>
            <DialogDescription>
              This will stop all syncing between Sixty and Attio. Your existing data in Sixty
              will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDisconnectDialog(false)}
              disabled={disconnecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Disconnect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

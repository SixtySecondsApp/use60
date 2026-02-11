import { useState } from 'react';
import {
  ConfigureModal,
  ConfigSection,
  DangerZone,
} from './ConfigureModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAttioIntegration } from '@/lib/hooks/useAttioIntegration';
import {
  RefreshCw,
  Loader2,
  Settings,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface AttioConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AttioConfigModal({ open, onOpenChange }: AttioConfigModalProps) {
  const navigate = useNavigate();
  const {
    integration,
    syncState,
    isConnected,
    canManage,
    disconnecting,
    disconnect,
    triggerSync,
  } = useAttioIntegration();

  const [syncing, setSyncing] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [disconnectingLocal, setDisconnectingLocal] = useState(false);
  const [showAccountDetails, setShowAccountDetails] = useState(false);

  const handleQuickSync = async () => {
    setSyncing(true);
    try {
      await triggerSync();
      toast.success('Syncing...');
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnectingLocal(true);
    try {
      await disconnect();
      toast.success('Attio disconnected');
      setShowDisconnectDialog(false);
      onOpenChange(false);
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setDisconnectingLocal(false);
    }
  };

  const handleOpenFullSettings = () => {
    onOpenChange(false);
    navigate('/settings/attio');
  };

  return (
    <>
      <ConfigureModal
        open={open}
        onOpenChange={onOpenChange}
        integrationId="attio"
        integrationName="Attio"
        connectedAt={integration?.connected_at}
        showFooter={false}
      >
        {/* Connection Status Card */}
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {integration?.workspace_name || 'Connected'}
              </span>
              {syncState && (
                <Badge variant="secondary" className="text-xs">
                  {syncState.sync_status || 'idle'}
                </Badge>
              )}
            </div>
            <button
              onClick={() => setShowAccountDetails(!showAccountDetails)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {showAccountDetails ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>

          {showAccountDetails && (
            <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-700 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Workspace:</span>{' '}
                <span className="text-gray-900 dark:text-white">
                  {integration?.workspace_name || 'Unknown'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Connected:</span>{' '}
                <span className="text-gray-900 dark:text-white">
                  {integration?.connected_at
                    ? new Date(integration.connected_at).toLocaleDateString()
                    : 'Unknown'}
                </span>
              </div>
              {integration?.connected_by && (
                <div className="col-span-2">
                  <span className="text-gray-500">Connected by:</span>{' '}
                  <span className="text-gray-900 dark:text-white">
                    {integration.connected_by}
                  </span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Last Sync:</span>{' '}
                <span className="text-gray-900 dark:text-white">
                  {syncState?.last_sync_completed_at
                    ? new Date(syncState.last_sync_completed_at).toLocaleDateString()
                    : 'Never'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <ConfigSection title="Quick Actions">
          <div className="space-y-3">
            <Button
              onClick={handleQuickSync}
              disabled={syncing}
              className="w-full gap-2"
              variant="outline"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {syncing ? 'Syncing...' : 'Trigger Sync'}
            </Button>

            <Button
              onClick={handleOpenFullSettings}
              className="w-full gap-2"
              variant="outline"
            >
              <Settings className="h-4 w-4" />
              Open Full Settings
            </Button>
          </div>
        </ConfigSection>

        {/* Danger Zone */}
        <DangerZone
          title="Disconnect Attio"
          description="Stops all CRM syncing."
          buttonText="Disconnect"
          onAction={() => setShowDisconnectDialog(true)}
          isLoading={disconnecting || disconnectingLocal}
          disabled={!canManage}
        />
      </ConfigureModal>

      {/* Disconnect Confirmation */}
      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect Attio?</DialogTitle>
            <DialogDescription>
              This will stop all syncing between Sixty and Attio. Your existing data will not
              be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDisconnectDialog(false)}
              disabled={disconnectingLocal}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={disconnectingLocal || !canManage}
            >
              {disconnectingLocal ? (
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
    </>
  );
}

import React, { useState, useEffect } from 'react';
import {
  ConfigureModal,
  ConfigSection,
  ConfigToggle,
  DangerZone,
} from './ConfigureModal';
import { Button } from '@/components/ui/button';
import { useMicrosoftIntegrationStore } from '@/lib/stores/integrationStore';
import { MicrosoftServiceStatus, microsoftApi as microsoftApiClient, MicrosoftTestConnectionResult } from '@/lib/api/microsoftIntegration';
import { Mail, Calendar, RefreshCw, Loader2, CheckCircle, XCircle, TestTube2 } from 'lucide-react';
import { toast } from 'sonner';

interface MicrosoftConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Microsoft four-square logo SVG
const MicrosoftLogo = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24">
    <rect x="1" y="1" width="10" height="10" fill="#F25022" />
    <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
    <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
    <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
  </svg>
);

export function MicrosoftConfigModal({ open, onOpenChange }: MicrosoftConfigModalProps) {
  const {
    integration,
    email,
    services,
    isLoading,
    disconnect,
    toggleService,
    checkConnection,
  } = useMicrosoftIntegrationStore();

  const [localServices, setLocalServices] = useState<MicrosoftServiceStatus>(services);
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<MicrosoftTestConnectionResult | null>(null);

  useEffect(() => {
    setLocalServices(services);
  }, [services]);

  const hasChanges =
    localServices.outlook !== services.outlook ||
    localServices.calendar !== services.calendar;

  const handleToggle = (service: keyof MicrosoftServiceStatus) => {
    setLocalServices((prev) => ({
      ...prev,
      [service]: !prev[service],
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const serviceKeys: (keyof MicrosoftServiceStatus)[] = ['outlook', 'calendar'];
      for (const key of serviceKeys) {
        if (localServices[key] !== services[key]) {
          await toggleService(key);
        }
      }
      await checkConnection();
      toast.success('Settings saved successfully');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnect();
      toast.success('Microsoft account disconnected');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to disconnect');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await microsoftApiClient.testConnection();
      setTestResult(result);
      if (result.allServicesOk) {
        toast.success('All Microsoft services are working correctly!');
      } else if (result.connected) {
        toast.warning('Some services may have issues. Check details below.');
      } else {
        toast.error('Connection test failed. Please reconnect your Microsoft account.');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to test connection');
      setTestResult({
        success: false,
        connected: false,
        message: error.message,
        services: {
          userinfo: { ok: false, message: 'Test failed' },
          outlook: { ok: false, message: 'Test failed' },
          calendar: { ok: false, message: 'Test failed' },
        },
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <ConfigureModal
      open={open}
      onOpenChange={onOpenChange}
      integrationId="microsoft-365"
      integrationName="Microsoft 365"
      connectedEmail={email || undefined}
      fallbackIcon={<MicrosoftLogo />}
      onSave={handleSave}
      isSaving={isSaving}
      hasChanges={hasChanges}
    >
      {/* Services Section */}
      <ConfigSection title="Enabled Services">
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50">
            <div className="flex items-center space-x-3">
              <Mail className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Outlook Mail</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Send emails from contact pages
                </p>
              </div>
            </div>
            <ConfigToggle
              label=""
              checked={localServices.outlook}
              onChange={() => handleToggle('outlook')}
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50">
            <div className="flex items-center space-x-3">
              <Calendar className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Outlook Calendar
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Schedule meetings and sync events
                </p>
              </div>
            </div>
            <ConfigToggle
              label=""
              checked={localServices.calendar}
              onChange={() => handleToggle('calendar')}
              disabled={isLoading}
            />
          </div>
        </div>
      </ConfigSection>

      {/* Connection Info */}
      <ConfigSection title="Connection Info">
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Connected:</span>
            <span>
              {integration && new Date(integration.created_at).toLocaleDateString()}
            </span>
          </div>
          {integration?.expires_at && (
            <div className="flex justify-between">
              <span className="flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                Token expires:
              </span>
              <span>{new Date(integration.expires_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </ConfigSection>

      {/* Test Connection */}
      <ConfigSection title="Test Connection">
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Verify your Microsoft integration is working correctly.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={isTesting || !integration}
            className="w-full"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <TestTube2 className="w-4 h-4 mr-2" />
                Test Connection
              </>
            )}
          </Button>

          {testResult && (
            <div className="space-y-2 mt-3">
              <div className="flex items-center gap-2 text-sm">
                {testResult.allServicesOk ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-amber-500" />
                )}
                <span className={testResult.allServicesOk ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
                  {testResult.allServicesOk ? 'All services working' : 'Some services have issues'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(testResult.services).map(([service, result]) => (
                  <div
                    key={service}
                    className={`flex items-center gap-1.5 p-2 rounded ${
                      result.ok
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                        : 'bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {result.ok ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                    <span className="capitalize">{service}</span>
                  </div>
                ))}
              </div>

              {testResult.testedAt && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Tested at {new Date(testResult.testedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          )}
        </div>
      </ConfigSection>

      {/* Danger Zone */}
      <DangerZone
        title="Disconnect Microsoft"
        description="Stops Outlook email and Calendar sync."
        buttonText="Disconnect"
        onAction={handleDisconnect}
        isLoading={isDisconnecting}
      />
    </ConfigureModal>
  );
}

/**
 * GoogleWorkspaceSettings
 *
 * Standalone settings component for Google Workspace integration.
 * Extracted from GoogleConfigModal for use in dedicated settings page.
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useGoogleIntegration } from '@/lib/stores/integrationStore';
import { GoogleServiceStatus, googleApi, GoogleTestConnectionResult } from '@/lib/api/googleIntegration';
import {
  Mail, Calendar, FolderOpen, ListTodo, RefreshCw, Loader2,
  CheckCircle, XCircle, TestTube2, Sparkles, Tag, ChevronDown, ChevronUp,
  AlertTriangle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function GoogleWorkspaceSettings() {
  const navigate = useNavigate();
  const {
    integration,
    email,
    services,
    isLoading,
    disconnect,
    toggleService,
    isConnected,
    connect,
  } = useGoogleIntegration();

  const [localServices, setLocalServices] = useState<GoogleServiceStatus>(services);
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<GoogleTestConnectionResult | null>(null);
  const [showCategorizationSettings, setShowCategorizationSettings] = useState(false);

  // Sync local state with store
  useEffect(() => {
    setLocalServices(services);
  }, [services]);

  const hasChanges =
    localServices.gmail !== services.gmail ||
    localServices.calendar !== services.calendar ||
    localServices.drive !== services.drive;

  const handleToggle = (service: keyof GoogleServiceStatus) => {
    setLocalServices((prev) => ({
      ...prev,
      [service]: !prev[service],
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const serviceKeys: (keyof GoogleServiceStatus)[] = ['gmail', 'calendar', 'drive'];
      for (const key of serviceKeys) {
        if (localServices[key] !== services[key]) {
          await toggleService(key);
        }
      }
      toast.success('Settings saved successfully');
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
      toast.success('Google account disconnected');
      navigate('/integrations');
    } catch (error: any) {
      toast.error(error.message || 'Failed to disconnect');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleConnect = async () => {
    try {
      const authUrl = await connect();
      if (authUrl) {
        window.location.href = authUrl;
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to start connection');
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await googleApi.testConnection();
      setTestResult(result);
      if (result.allServicesOk) {
        toast.success('All Google services are working correctly!');
      } else if (result.connected) {
        toast.warning('Some services may have issues. Check details below.');
      } else {
        toast.error('Connection test failed. Please reconnect your Google account.');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to test connection');
      setTestResult({
        success: false,
        connected: false,
        message: error.message,
        services: {
          userinfo: { ok: false, message: 'Test failed' },
          gmail: { ok: false, message: 'Test failed' },
          calendar: { ok: false, message: 'Test failed' },
          tasks: { ok: false, message: 'Test failed' },
        },
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-800 dark:text-amber-200">
                Google Workspace Not Connected
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Connect your Google account to enable Gmail, Calendar, Drive, and Tasks sync.
              </p>
              <Button
                onClick={handleConnect}
                className="mt-3"
                size="sm"
              >
                Connect Google Workspace
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connected Account */}
      {email && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">Connected</p>
              <p className="text-sm text-green-700 dark:text-green-300">{email}</p>
            </div>
          </div>
        </div>
      )}

      {/* Enabled Services */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Enabled Services</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50">
            <div className="flex items-center space-x-3">
              <Mail className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Gmail</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Send emails directly from contact pages
                </p>
              </div>
            </div>
            <Switch
              checked={localServices.gmail}
              onCheckedChange={() => handleToggle('gmail')}
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50">
            <div className="flex items-center space-x-3">
              <Calendar className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Google Calendar</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Schedule meetings and sync events
                </p>
              </div>
            </div>
            <Switch
              checked={localServices.calendar}
              onCheckedChange={() => handleToggle('calendar')}
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50">
            <div className="flex items-center space-x-3">
              <FolderOpen className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Google Drive</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Access and share files
                </p>
              </div>
            </div>
            <Switch
              checked={localServices.drive}
              onCheckedChange={() => handleToggle('drive')}
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50">
            <div className="flex items-center space-x-3">
              <ListTodo className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Google Tasks</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Sync tasks bidirectionally
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/settings/task-sync')}
              className="text-xs"
            >
              Manage
            </Button>
          </div>
        </div>

        {hasChanges && (
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        )}
      </div>

      {/* Email Categorization */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Email Categorization</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Smart Categorization
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Auto-categorize emails: To Respond, FYI, Marketing
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowCategorizationSettings(!showCategorizationSettings)}
              className="text-xs"
            >
              {showCategorizationSettings ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>

          {showCategorizationSettings && (
            <div className="pt-3 border-t border-gray-100 dark:border-gray-700/50 space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Emails are categorized every 15 minutes. Categories feed into the Slack Sales Assistant for follow-up reminders.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2 rounded bg-green-50 dark:bg-green-900/20">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs text-green-700 dark:text-green-300">To Respond</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs text-blue-700 dark:text-blue-300">FYI</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-orange-50 dark:bg-orange-900/20">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-xs text-orange-700 dark:text-orange-300">Marketing</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-purple-50 dark:bg-purple-900/20">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="text-xs text-purple-700 dark:text-purple-300">Automated</span>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/admin/email-categorization')}
                className="w-full text-xs"
              >
                <Tag className="w-4 h-4 mr-2" />
                Configure Categories
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Connection Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Connection Info</h3>
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
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
      </div>

      {/* Test Connection */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Test Connection</h3>
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Verify your Google integration is working correctly by testing all connected services.
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
      </div>

      {/* Danger Zone */}
      <div className="space-y-4 pt-4 border-t border-red-200 dark:border-red-800/50">
        <h3 className="text-sm font-medium text-red-600 dark:text-red-400">Danger Zone</h3>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Disconnect Google
              </p>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                Stops Gmail, Calendar, and Drive sync.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Disconnect'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

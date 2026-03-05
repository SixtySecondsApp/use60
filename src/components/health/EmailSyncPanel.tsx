/**
 * Email Sync Panel Component
 *
 * User interface for email sync in Settings or Admin.
 * Allows users to sync emails from Gmail for CRM contacts only.
 */

import { useState, useEffect } from 'react';
import { useEmailSync, SyncProgress } from '@/lib/hooks/useEmailSync';
import { SyncPeriod } from '@/lib/services/emailSyncService';
import { useGoogleIntegration } from '@/lib/stores/integrationStore';
import { toast } from 'sonner';
import { Mail, RefreshCw, CheckCircle2, AlertCircle, Loader2, Link2, ExternalLink } from 'lucide-react';

export function EmailSyncPanel() {
  const [selectedPeriod, setSelectedPeriod] = useState<SyncPeriod>('30days');
  const [isConnecting, setIsConnecting] = useState(false);
  const { performSync, syncStatus, loading, progress, error } = useEmailSync();

  // Google connection status - use the integration store
  const {
    isConnected: isGoogleConnected,
    isLoading: googleLoading,
    checkConnection,
    connect
  } = useGoogleIntegration();

  useEffect(() => {
    checkConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount

  const handleSync = () => {
    performSync(selectedPeriod);
  };

  const handleConnectGoogle = async () => {
    setIsConnecting(true);
    try {
      const authUrl = await connect();
      if (authUrl) {
        window.location.href = authUrl;
      } else {
        toast.error('Failed to get authentication URL');
        setIsConnecting(false);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to initiate Google authentication');
      setIsConnecting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3 mb-6">
        <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Email Sync for Health Monitoring
        </h2>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Sync emails from Gmail for CRM contacts only. Emails are analyzed with AI to extract
        sentiment, topics, and action items for health score calculations.
      </p>

      {/* Google Connection Status */}
      <div className="mb-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isGoogleConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Google Workspace
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {googleLoading ? 'Checking connection...' : isGoogleConnected ? 'Connected' : 'Not connected'}
              </p>
            </div>
          </div>
          {!googleLoading && !isGoogleConnected && (
            <button
              onClick={handleConnectGoogle}
              disabled={isConnecting}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors disabled:opacity-50"
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          )}
          {!googleLoading && isGoogleConnected && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              Ready
            </span>
          )}
        </div>
      </div>

      {/* Show warning if not connected */}
      {!googleLoading && !isGoogleConnected && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-md flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
              Google account required
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              Connect your Google Workspace account to sync emails from Gmail.
            </p>
          </div>
        </div>
      )}

      {/* Period Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Sync Period
        </label>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value as SyncPeriod)}
          disabled={loading}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="30days">Last 30 Days</option>
          <option value="60days">Last 60 Days</option>
          <option value="90days">Last 90 Days</option>
          <option value="all_time">All Time</option>
        </select>
      </div>

      {/* Sync Button */}
      <button
        onClick={handleSync}
        disabled={loading || !isGoogleConnected}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Syncing...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4" />
            Sync Emails
          </>
        )}
      </button>

      {/* Progress Indicator */}
      {loading && progress.total === 0 && (
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
          <span className="text-sm text-blue-700 dark:text-blue-300">
            Fetching emails from Gmail and matching against CRM contacts...
          </span>
        </div>
      )}
      {loading && progress.total > 0 && (
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Analyzing emails
            </span>
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {progress.analyzed} / {progress.total}
            </span>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
            <div
              className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${progress.total > 0 ? (progress.analyzed / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        error.includes('No CRM contacts found') ? (
          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-md flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">No contacts to sync</p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Add contacts to your CRM first to sync emails. Email sync only matches emails from your existing CRM contacts.
              </p>
              <a
                href="/contacts"
                className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-amber-800 dark:text-amber-200 underline hover:no-underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Go to Contacts
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-md flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900 dark:text-red-100">Sync failed</p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
            </div>
          </div>
        )
      )}

      {/* Sync Status */}
      {syncStatus && !loading && !error && (
        <>
          {syncStatus.emailsStored === 0 && syncStatus.crmContactCount > 0 ? (
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-md flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  No matching emails found
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Searched {syncStatus.totalEmails} emails but none matched your {syncStatus.crmContactCount} CRM contacts.
                  This can happen if your contacts use different email addresses than what's in Gmail.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-md">
              <div className="flex items-start gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                    Sync Completed
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    Last sync: {new Date(syncStatus.lastSyncTime).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600 dark:text-gray-400">CRM Contacts</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {syncStatus.crmContactCount}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Emails Synced</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {syncStatus.emailsStored}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">CRM Matches</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {syncStatus.crmEmailsMatched}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">AI Analyses</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {syncStatus.emailsAnalyzed}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}








































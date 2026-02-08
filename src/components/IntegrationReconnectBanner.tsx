// src/components/IntegrationReconnectBanner.tsx
// Banner for alerting users when their integrations need reconnection
// Supports both:
// 1. Alert-based detection (integration_alerts table) - for any integration
// 2. Fathom-specific reconnection detection (useIntegrationReconnectNeeded hook)

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, AlertCircle, RefreshCw, ArrowRight, Video, Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useSmartPollingInterval } from '@/lib/hooks/useSmartPolling';
import { supabase } from '@/lib/supabase/clientV2';
import { useIntegrationReconnectNeeded } from '@/lib/hooks/useIntegrationReconnectNeeded';
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration';
import { cn } from '@/lib/utils';

interface IntegrationReconnectBannerProps {
  dismissible?: boolean;
  storageKey?: string;
  /** Additional top offset when other banners are visible (e.g., TrialBanner) */
  additionalTopOffset?: number;
  className?: string;
  /** Whether trial banner is visible above this banner */
  hasTrialBannerAbove?: boolean;
  /** Whether impersonation banner is visible at the very top */
  hasImpersonationBannerAbove?: boolean;
  /** Whether sidebar is collapsed (for proper left offset) */
  isSidebarCollapsed?: boolean;
}

export function IntegrationReconnectBanner({
  dismissible = true,
  storageKey = 'integration-reconnect-banner-dismissed',
  additionalTopOffset = 0,
  className,
  hasTrialBannerAbove = false,
  hasImpersonationBannerAbove = false,
  isSidebarCollapsed = false,
}: IntegrationReconnectBannerProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isReconnecting, setIsReconnecting] = React.useState(false);

  // Feature branch: Fathom-specific reconnection detection
  const { needsReconnect, loading: fathomLoading, dismiss: dismissFathom } = useIntegrationReconnectNeeded();
  const { connectFathom } = useFathomIntegration();
  const integrationPolling = useSmartPollingInterval(120000, 'background');

  // Check if banner was dismissed
  const [isDismissed, setIsDismissed] = useState(() => {
    if (!dismissible) return false;
    try {
      const dismissed = localStorage.getItem(storageKey);
      if (!dismissed) return false;
      // Allow showing again after 4 hours (persistent until reconnected)
      const dismissedAt = parseInt(dismissed, 10);
      return Date.now() - dismissedAt < 4 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  });

  // Staging: Query for unresolved integration alerts (org-level alerts)
  const { data: alerts, isLoading } = useQuery({
    queryKey: ['integration-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_alerts')
        .select('id, integration_name, title, message, severity, created_at')
        .is('resolved_at', null)
        .in('alert_type', ['token_revoked', 'token_expired', 'connection_failed'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[IntegrationReconnectBanner] Error fetching alerts:', error);
        return [];
      }

      return data || [];
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: integrationPolling,
  });

  const handleDismiss = () => {
    setIsDismissed(true);
    // Also dismiss the Fathom-specific banner
    if (needsReconnect) {
      dismissFathom();
    }
    try {
      localStorage.setItem(storageKey, Date.now().toString());
    } catch {
      // Ignore storage errors
    }
  };

  const handleReconnect = async () => {
    // If it's a Fathom reconnection, use direct OAuth reconnect
    if (needsReconnect?.type === 'fathom') {
      setIsReconnecting(true);
      try {
        await connectFathom();
      } catch (error) {
        console.error('[IntegrationReconnectBanner] Reconnect error:', error);
      } finally {
        setIsReconnecting(false);
      }
      return;
    }
    // For other integrations, navigate to reconnect URL
    if (alerts && alerts.length > 0) {
      navigate(getReconnectUrl(alerts[0].integration_name));
    }
  };

  const handleGoToSettings = () => {
    navigate('/settings/meeting-sync');
  };

  // Get the reconnect URL based on integration type
  const getReconnectUrl = (integrationType: string): string => {
    switch (integrationType) {
      case 'google_workspace':
        return '/settings/integrations/google-workspace';
      case 'slack':
        return '/settings/integrations/slack';
      case 'hubspot':
        return '/settings/integrations/hubspot';
      case 'fathom':
        return '/settings/integrations/fathom';
      default:
        return '/settings/integrations';
    }
  };

  // Get human-readable integration name
  const getIntegrationName = (integrationType: string): string => {
    switch (integrationType) {
      case 'google_workspace':
        return 'Google Calendar';
      case 'slack':
        return 'Slack';
      case 'hubspot':
        return 'HubSpot';
      case 'fathom':
        return 'Fathom';
      default:
        return integrationType;
    }
  };

  // Determine which source detected the issue
  const hasAlerts = !isDismissed && alerts && alerts.length > 0;
  const hasFathomReconnect = !fathomLoading && !!needsReconnect;

  // Don't show if loading, dismissed, or no alerts and no reconnection needed
  if ((isLoading && fathomLoading) || (!hasAlerts && !hasFathomReconnect)) {
    return null;
  }

  // Determine display data
  const primaryAlert = hasAlerts ? alerts![0] : null;
  const integrationName = hasFathomReconnect
    ? (needsReconnect!.type === 'fathom' ? 'Fathom' : 'Integration')
    : (primaryAlert ? getIntegrationName(primaryAlert.integration_name) : 'Integration');
  const reconnectUrl = primaryAlert ? getReconnectUrl(primaryAlert.integration_name) : '/settings/integrations';
  const hasMultipleAlerts = hasAlerts && alerts!.length > 1;
  const email = hasFathomReconnect ? needsReconnect!.fathom_user_email : undefined;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        style={{ top: `${65 + additionalTopOffset}px` }}
        className={cn(
          'fixed left-0 right-0 z-[85]',
          'bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/20',
          'backdrop-blur-sm',
          isSidebarCollapsed ? 'lg:left-[80px]' : 'lg:left-[256px]',
          className
        )}
      >
        <div className="px-3 py-2 sm:px-4 sm:py-2.5 lg:px-6">
          <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
            {/* Left: Warning info */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
              {hasFathomReconnect && (
                <Video className="w-4 h-4 flex-shrink-0 text-amber-400 hidden sm:block" />
              )}
              <span className="text-amber-200 truncate">
                <span className="font-medium">{integrationName}</span>
                {email && <span className="hidden md:inline text-amber-300/70"> ({email})</span>}
                {hasFathomReconnect ? (
                  <>
                    <span className="text-amber-300/80"> disconnected — </span>
                    <span className="text-amber-300">your meeting recordings are not syncing</span>
                  </>
                ) : (
                  <span className="hidden sm:inline"> needs reconnection</span>
                )}
                {hasMultipleAlerts && (
                  <span className="ml-1 text-amber-400/70">
                    (+{alerts!.length - 1} more)
                  </span>
                )}
              </span>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {hasFathomReconnect ? (
                <>
                  <button
                    onClick={handleReconnect}
                    disabled={isReconnecting}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium',
                      'bg-amber-500 hover:bg-amber-600 text-white',
                      'transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    <RefreshCw className={cn('w-3 h-3', isReconnecting && 'animate-spin')} />
                    <span>{isReconnecting ? 'Connecting...' : 'Reconnect'}</span>
                  </button>

                  <button
                    onClick={handleGoToSettings}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium',
                      'text-amber-300 hover:text-amber-200 hover:bg-amber-500/20',
                      'transition-colors'
                    )}
                  >
                    <Settings className="w-3 h-3" />
                    <span className="hidden sm:inline">Settings</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to={reconnectUrl}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span className="hidden sm:inline">Reconnect</span>
                  </Link>

                  <Link
                    to="/settings/integrations"
                    className="inline-flex items-center gap-0.5 px-2 py-1 rounded text-xs font-medium text-amber-300 hover:text-amber-200 hover:bg-amber-500/20 transition-colors"
                  >
                    <span className="hidden sm:inline">All</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </>
              )}

              {dismissible && (
                <button
                  onClick={handleDismiss}
                  className={cn(
                    'p-1 rounded transition-colors',
                    'text-amber-400 hover:text-amber-300 hover:bg-amber-500/20'
                  )}
                  aria-label="Dismiss"
                  title="Dismiss for a while"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Hook to check if there are any unresolved integration alerts (org-level)
 * Used by AppLayout to adjust padding when banner is visible
 */
export function useHasIntegrationAlerts(): boolean {
  const { data: alerts } = useQuery({
    queryKey: ['integration-alerts-check'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_alerts')
        .select('id')
        .is('resolved_at', null)
        .in('alert_type', ['token_revoked', 'token_expired', 'connection_failed'])
        .limit(1);

      if (error) return [];
      return data || [];
    },
    staleTime: 30 * 1000,
  });

  return (alerts?.length ?? 0) > 0;
}

export default IntegrationReconnectBanner;

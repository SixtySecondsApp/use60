// src/components/subscription/TrialBanner.tsx
// Full-width banner for trial notifications — shows at 75%+ usage, urgent at 90%+, and for expired trials.

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, AlertTriangle, ArrowRight, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useOrgSubscription, useTrialProgress } from '@/lib/hooks/useSubscription';

interface TrialBannerProps {
  dismissible?: boolean;
  storageKey?: string;
}

export function TrialBanner({
  dismissible = true,
  storageKey = 'trial-banner-dismissed',
}: TrialBannerProps) {
  const { activeOrgId: organizationId } = useOrg();
  const navigate = useNavigate();

  const { data: subscription, isLoading: subLoading } = useOrgSubscription(organizationId);
  const { data: trialProgress, isLoading: progressLoading } = useTrialProgress(organizationId);

  const isLoading = subLoading || progressLoading;

  // Check for simulation data (used by TrialTimelineSimulator preview)
  const simulationData = React.useMemo(() => {
    try {
      const data = sessionStorage.getItem('trial_simulation');
      if (data) {
        const parsed = JSON.parse(data);
        if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
          return parsed;
        }
      }
    } catch {
      // Ignore errors
    }
    return null;
  }, []);

  // Dismissal state — reset each 24h
  const [isDismissed, setIsDismissed] = useState(() => {
    if (!dismissible || simulationData) return false;
    try {
      const dismissed = localStorage.getItem(storageKey);
      if (!dismissed) return false;
      const dismissedAt = parseInt(dismissed, 10);
      return Date.now() - dismissedAt < 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    setIsDismissed(true);
    if (!simulationData) {
      try {
        localStorage.setItem(storageKey, Date.now().toString());
      } catch {
        // Ignore storage errors
      }
    }
  };

  const handleChoosePlan = () => {
    navigate('/settings/billing');
  };

  // Determine effective status and progress from simulation or real data
  const isExpired = simulationData
    ? simulationData.expired === true
    : subscription?.status === 'expired';

  const isTrialing = simulationData
    ? simulationData.trialStatus?.isTrialing === true
    : subscription?.status === 'trialing';

  // percentUsed from trial progress (meetings or days, whichever is higher)
  const percentUsed = simulationData
    ? simulationData.percentUsed ?? 0
    : trialProgress?.percentUsed ?? 0;

  const daysRemaining = simulationData
    ? simulationData.trialStatus?.daysRemaining ?? 0
    : trialProgress?.daysRemaining ?? 0;

  const meetingsUsed = simulationData
    ? simulationData.meetingsUsed ?? 0
    : trialProgress?.meetingsUsed ?? 0;

  const meetingsLimit = simulationData
    ? simulationData.meetingsLimit ?? 100
    : trialProgress?.meetingsLimit ?? 100;

  // Thresholds
  const isWarning = percentUsed >= 75; // 75%+ — yellow
  const isUrgent = percentUsed >= 90 || isExpired; // 90%+ or expired — red

  // Don't show if loading
  if (isLoading && !simulationData) return null;

  // Only show for trialing or expired orgs
  if (!isTrialing && !isExpired && !simulationData) return null;

  // Don't show if dismissed (expired banners cannot be dismissed)
  if (!isExpired && isDismissed) return null;

  // Don't show if still early trial (below 75%) unless expired
  if (!isExpired && !isWarning && !simulationData) return null;

  const bannerColor = isUrgent
    ? {
        bg: 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800/40',
        text: 'text-red-700 dark:text-red-400',
        subtext: 'text-red-600 dark:text-red-500',
        icon: 'text-red-500',
        btn: 'bg-red-600 hover:bg-red-700 text-white',
        dismiss: 'text-red-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30',
      }
    : {
        bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/40',
        text: 'text-amber-700 dark:text-amber-400',
        subtext: 'text-amber-600 dark:text-amber-500',
        icon: 'text-amber-500',
        btn: 'bg-amber-600 hover:bg-amber-700 text-white',
        dismiss: 'text-amber-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30',
      };

  const message = isExpired
    ? 'Your trial has ended — choose a plan to continue using the platform'
    : `Your trial is winding down — ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} and ${meetingsLimit - meetingsUsed} meeting${meetingsLimit - meetingsUsed !== 1 ? 's' : ''} remaining`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -60, opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={`
          fixed top-[65px] left-0 right-0 z-30
          lg:top-[65px] lg:left-[256px]
          border-b backdrop-blur-sm
          ${bannerColor.bg}
        `}
      >
        <div className="px-3 py-2 sm:px-4 sm:py-2.5 lg:px-6 lg:py-2.5">
          <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
            {/* Left: Status info */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {simulationData && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex-shrink-0 text-xs">
                  <Eye className="w-3 h-3" />
                  <span className="hidden sm:inline">Preview</span>
                  <span className="font-medium">Day {simulationData.day}</span>
                </span>
              )}

              {isUrgent ? (
                <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${bannerColor.icon}`} />
              ) : (
                <Clock className={`w-4 h-4 flex-shrink-0 ${bannerColor.icon}`} />
              )}

              <span className={`truncate font-medium ${bannerColor.text}`}>
                {message}
              </span>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleChoosePlan}
                className={`
                  inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium
                  transition-colors
                  ${bannerColor.btn}
                `}
              >
                Choose Plan
                <ArrowRight className="w-3 h-3" />
              </button>

              {/* Only allow dismissal for non-expired banners */}
              {dismissible && !isExpired && (
                <button
                  onClick={handleDismiss}
                  className={`p-1 rounded transition-colors ${bannerColor.dismiss}`}
                  aria-label="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default TrialBanner;

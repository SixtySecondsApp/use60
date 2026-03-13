/**
 * LowBalanceBanner — Dismissible warning banner when credit balance is low.
 *
 * Amber at projected <14 days remaining, red at <7 days.
 * Dismissed once per session (persisted in sessionStorage).
 * Hidden on the credits settings page (user is already managing credits).
 * "Top Up" navigates to credits page instead of opening another modal.
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, X, CreditCard, RefreshCw, Sparkles } from 'lucide-react';
import { useCreditBalance } from '@/lib/hooks/useCreditBalance';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { useUser } from '@/lib/hooks/useUser';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

export function LowBalanceBanner() {
  const orgId = useOrgId();
  const { data, isLoading } = useCreditBalance();
  const { userData } = useUser();
  const isAdmin = userData ? isUserAdmin(userData) : false;
  const navigate = useNavigate();
  const location = useLocation();

  // Session-persistent dismiss — once dismissed, stays hidden for the entire browser session
  const dismissKey = orgId ? `sixty_low_balance_dismissed_${orgId}` : null;
  const [dismissed, setDismissed] = useState(() =>
    dismissKey ? sessionStorage.getItem(dismissKey) === 'true' : false
  );

  const welcomeKey = orgId ? `sixty_welcome_credits_${orgId}` : null;
  const [showWelcome, setShowWelcome] = useState(() =>
    welcomeKey ? localStorage.getItem(welcomeKey) === 'pending' : false
  );

  // Check if the org has ANY cost events — used to suppress red banner for brand-new users
  const { data: costEventCount, isLoading: costEventsLoading } = useQuery({
    queryKey: ['credits', 'has-cost-events', orgId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('ai_cost_events')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId!)
        .limit(1);
      if (error) return 1; // Fail open: assume events exist so we don't hide real warnings
      return count ?? 0;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // Hide on pages where banner is redundant or disruptive
  const isFullHeightPage = location.pathname.startsWith('/copilot');
  const isCreditsPage = location.pathname.startsWith('/settings/credits');
  const isBillingPage = location.pathname.startsWith('/settings/billing');

  if (!orgId || isLoading || costEventsLoading || !data || dismissed || isFullHeightPage || isCreditsPage || isBillingPage) return null;

  const { balance, projectedDaysRemaining, autoTopUp } = data;

  const isZero = balance <= 0;
  const hasUsageData = projectedDaysRemaining >= 0;

  // Determine low-balance thresholds using projected days
  const isRedLow = balance > 0 && hasUsageData && projectedDaysRemaining < 7;
  const isAmberLow = balance > 0 && hasUsageData && projectedDaysRemaining >= 7 && projectedDaysRemaining < 14;

  // Welcome credits banner — shown once after onboarding.
  if (showWelcome && balance <= 0) {
    if (welcomeKey) localStorage.removeItem(welcomeKey);
    setShowWelcome(false);
  }

  if (showWelcome && balance > 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 text-sm bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200">
        <Sparkles className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">Free AI credits have been added to your account!</span>
        <button
          onClick={() => {
            if (welcomeKey) localStorage.removeItem(welcomeKey);
            setShowWelcome(false);
          }}
          className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Suppress the red "depleted" banner for brand-new users
  if (isZero && !costEventsLoading && (costEventCount ?? 0) === 0) return null;
  if (isZero && showWelcome) return null;

  if (!isZero && !isRedLow && !isAmberLow) return null;

  const autoTopUpEnabled = autoTopUp?.enabled ?? false;
  const autoTopUpPackCredits = autoTopUp?.packType ? `${autoTopUp.packType}` : 'credits';

  const formattedBalance = balance % 1 === 0
    ? `${Math.round(balance)} credits`
    : `${balance.toFixed(1)} credits`;

  const handleDismiss = () => {
    setDismissed(true);
    if (dismissKey) sessionStorage.setItem(dismissKey, 'true');
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-sm',
        isZero
          ? 'bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          : isRedLow
          ? 'bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          : 'bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
      )}
    >
      {autoTopUpEnabled ? (
        <RefreshCw className="w-4 h-4 flex-shrink-0" />
      ) : (
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      )}
      <span className="flex-1">
        {isZero ? (
          <>AI credits depleted. AI features are disabled until credits are added.</>
        ) : autoTopUpEnabled ? (
          <>
            Low credits ({formattedBalance} remaining) — auto top-up will add {autoTopUpPackCredits} pack credits shortly.
          </>
        ) : (
          <>
            Low AI credits ({formattedBalance} remaining
            {hasUsageData && projectedDaysRemaining < 365 && `, ~${Math.round(projectedDaysRemaining)} days left`}).
          </>
        )}
      </span>
      {isAdmin && !autoTopUpEnabled && (
        <button
          onClick={() => navigate('/settings/credits')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors flex-shrink-0',
            isZero || isRedLow
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-amber-600 hover:bg-amber-700 text-white'
          )}
        >
          <CreditCard className="w-3 h-3" />
          Top Up
        </button>
      )}
      {isAdmin && autoTopUpEnabled && (
        <button
          onClick={() => navigate('/settings/credits')}
          className="text-xs font-medium underline opacity-70 hover:opacity-100 transition-opacity flex-shrink-0"
        >
          Manage
        </button>
      )}
      <button
        onClick={handleDismiss}
        className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

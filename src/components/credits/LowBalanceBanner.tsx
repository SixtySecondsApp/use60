/**
 * LowBalanceBanner — Dismissible warning banner when credit balance is low.
 *
 * Amber at ~20% remaining, red at ~10% remaining.
 * If auto top-up is active, shows friendly message about upcoming top-up.
 * Links to the credits settings page.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X, CreditCard, RefreshCw, Sparkles } from 'lucide-react';
import { useCreditBalance } from '@/lib/hooks/useCreditBalance';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { useUser } from '@/lib/hooks/useUser';
import { cn } from '@/lib/utils';

export function LowBalanceBanner() {
  const orgId = useOrgId();
  const { data, isLoading } = useCreditBalance();
  const { userData } = useUser();
  const isAdmin = userData ? isUserAdmin(userData) : false;
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const welcomeKey = orgId ? `sixty_welcome_credits_${orgId}` : null;
  const [showWelcome, setShowWelcome] = useState(() =>
    welcomeKey ? localStorage.getItem(welcomeKey) === 'pending' : false
  );

  if (!orgId || isLoading || !data || dismissed) return null;

  const { balance, projectedDaysRemaining, autoTopUp } = data;

  const isZero = balance <= 0;
  const hasUsageData = projectedDaysRemaining >= 0;

  // Determine low-balance thresholds using projected days
  // Amber: <14 days remaining (roughly 20% if avg usage),  Red: <7 days (roughly 10%)
  const isRedLow = balance > 0 && hasUsageData && projectedDaysRemaining < 7;
  const isAmberLow = balance > 0 && hasUsageData && projectedDaysRemaining >= 7 && projectedDaysRemaining < 14;

  // Welcome credits banner — shown once after onboarding
  if (showWelcome && data && data.balance > 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 text-sm bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200">
        <Sparkles className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">10 Free AI credits have been added!</span>
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

  if (!isZero && !isRedLow && !isAmberLow) return null;

  const autoTopUpEnabled = autoTopUp?.enabled ?? false;
  const autoTopUpPackCredits = autoTopUp?.packType ? `${autoTopUp.packType}` : 'credits';

  const formattedBalance = balance % 1 === 0
    ? `${Math.round(balance)} credits`
    : `${balance.toFixed(1)} credits`;

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
        onClick={() => setDismissed(true)}
        className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

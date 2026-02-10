/**
 * LowBalanceBanner — Dismissible warning banner when credit balance is low.
 *
 * Shows when projected days remaining < 7 (or balance < $5).
 * Dismisses for the session via local state.
 * Links to the credits settings page.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X, CreditCard } from 'lucide-react';
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

  if (!orgId || isLoading || !data || dismissed) return null;

  const { balance, projectedDaysRemaining } = data;

  // Only show for genuinely low balance
  const isZero = balance <= 0;
  const isLow = balance > 0 && (projectedDaysRemaining < 7 || balance < 5);

  if (!isZero && !isLow) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-sm',
        isZero
          ? 'bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          : 'bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
      )}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">
        {isZero ? (
          <>AI credits depleted. AI features are disabled until credits are added.</>
        ) : (
          <>
            Low AI credit balance ({balance.toFixed(2)} credits remaining
            {projectedDaysRemaining < 365 && `, ~${Math.round(projectedDaysRemaining)} days left`}).
          </>
        )}
      </span>
      {isAdmin && (
        <button
          onClick={() => navigate('/settings/credits')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors flex-shrink-0',
            isZero
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-amber-600 hover:bg-amber-700 text-white'
          )}
        >
          <CreditCard className="w-3 h-3" />
          Top Up
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

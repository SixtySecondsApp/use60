/**
 * CreditMigrationModal
 *
 * Post-migration onboarding modal shown once per user after the credit system
 * upgrade from dollar-based to credit-unit-based packs.
 *
 * Shown once: tracked in localStorage ('credit_migration_modal_dismissed').
 * Offers a quick one-click path to enable Auto Top-Up.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, RefreshCw, Package, TrendingUp, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreditBalance } from '@/lib/hooks/useCreditBalance';
import { useOrgStore } from '@/lib/stores/orgStore';

// Credit system launch date — orgs created on or after this date never had old dollar-based credits,
// so we skip the migration modal entirely for them.
const CREDIT_SYSTEM_LAUNCH = new Date('2026-02-01T00:00:00Z');

const DISMISSED_KEY = 'credit_migration_modal_dismissed';

function hasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, 'true');
  } catch {
    // ignore
  }
}

interface CreditMigrationModalProps {
  /** Override: force show even if already dismissed (for testing) */
  forceShow?: boolean;
}

export function CreditMigrationModal({ forceShow }: CreditMigrationModalProps) {
  const navigate = useNavigate();
  const { data: balance } = useCreditBalance();
  const getActiveOrg = useOrgStore((s) => s.getActiveOrg);
  const activeOrg = getActiveOrg();

  // New orgs (created after the credit system launch) never had dollar-based credits,
  // so the migration modal is irrelevant for them.
  const isNewOrg = activeOrg?.created_at
    ? new Date(activeOrg.created_at) >= CREDIT_SYSTEM_LAUNCH
    : false;

  const [manuallyDismissed, setManuallyDismissed] = useState(false);

  const open = useMemo(() => {
    if (manuallyDismissed) return false;
    if (forceShow) return true;
    if (hasDismissed()) return false;
    if (!activeOrg) return false; // Not loaded yet — don't flash the modal
    return !isNewOrg;
  }, [manuallyDismissed, forceShow, activeOrg, isNewOrg]);

  if (!open) return null;

  const handleDismiss = () => {
    setDismissed();
    setManuallyDismissed(true);
  };

  const handleEnableAutoTopUp = () => {
    setDismissed();
    setManuallyDismissed(true);
    navigate('/settings/credits?tab=auto-topup');
  };

  const convertedBalance = balance?.balance ?? 0;
  const formattedBalance = convertedBalance % 1 === 0
    ? `${Math.round(convertedBalance)} credits`
    : `${convertedBalance.toFixed(1)} credits`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            We&apos;ve upgraded your credits
          </DialogTitle>
          <DialogDescription>
            Your account has been migrated to the new credit pack system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Balance converted confirmation */}
          <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                Your balance has been converted
              </span>
            </div>
            <p className="text-sm text-indigo-600 dark:text-indigo-400">
              You now have <span className="font-bold">{formattedBalance}</span> — the same purchasing power, denominated in credits for transparency.
            </p>
          </div>

          {/* What changed */}
          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Package className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Credit packs</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Buy Starter (100 credits), Growth (250 credits), or Scale (500 credits) packs. Better value at higher tiers.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <TrendingUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Credit units</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  All AI actions now cost credits (e.g. 0.3 credits/chat, 1.8 credits/meeting summary). See costs in model settings.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <RefreshCw className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Auto top-up</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Never run out — enable auto top-up to automatically purchase a pack when your balance gets low.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button variant="outline" onClick={handleDismiss} className="flex-1 sm:flex-none">
            <X className="mr-2 h-4 w-4" />
            Got it, dismiss
          </Button>
          <Button onClick={handleEnableAutoTopUp} className="flex-1 sm:flex-none">
            <RefreshCw className="mr-2 h-4 w-4" />
            Enable Auto Top-Up
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

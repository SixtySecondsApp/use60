/**
 * CreditMigrationModal
 *
 * Post-migration onboarding modal shown once per user after the credit system
 * upgrade from dollar-based to credit-unit-based packs.
 *
 * Shown once: tracked in localStorage ('credit_migration_modal_dismissed').
 * Offers a quick one-click path to enable Auto Top-Up.
 */

import { useState } from 'react';
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
  const [open, setOpen] = useState<boolean>(!hasDismissed() || !!forceShow);

  if (!open) return null;

  const handleDismiss = () => {
    setDismissed();
    setOpen(false);
  };

  const handleEnableAutoTopUp = () => {
    setDismissed();
    setOpen(false);
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
            We've upgraded your credits
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
                  Buy Starter (100 cr), Growth (250 cr), or Scale (500 cr) packs. Better value at higher tiers.
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
                  All AI actions now cost credits (e.g. 0.3 cr/chat, 1.8 cr/meeting summary). See costs in model settings.
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

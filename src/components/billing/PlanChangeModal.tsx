// src/components/billing/PlanChangeModal.tsx
// Unified modal for plan upgrades, downgrades, and billing cycle changes.
//
// Shows the user exactly what will change (price, features, proration)
// before they confirm. Calls update-subscription edge function on confirm.

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useUpdateSubscription } from '@/lib/hooks/useSubscription';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';
import {
  ArrowRight,
  ArrowDown,
  Sparkles,
  Loader2,
  Info,
  Calendar,
  CreditCard,
  RefreshCw,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export type PlanSlug = 'basic' | 'pro';
export type BillingCycle = 'monthly' | 'annual';

export interface PlanChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The org this change applies to */
  orgId: string;
  /** Current plan slug */
  currentPlanSlug: PlanSlug;
  /** Current billing cycle */
  currentBillingCycle: BillingCycle;
  /** Current period end ISO string (used for downgrade effective date) */
  currentPeriodEnd: string | null;
  /** Target plan slug */
  targetPlanSlug: PlanSlug;
  /** Target billing cycle selected in the toggle */
  targetBillingCycle: BillingCycle;
  /** Called after a successful plan change */
  onSuccess?: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

const PLAN_PRICES: Record<PlanSlug, { monthly: number; annual: number; name: string; currency: string }> = {
  basic: { monthly: 29, annual: 290, name: 'Basic', currency: '£' },
  pro:   { monthly: 99, annual: 990, name: 'Pro',   currency: '£' },
};

const TIER_ORDER: Record<PlanSlug, number> = { basic: 0, pro: 1 };

function formatPrice(slug: PlanSlug, cycle: BillingCycle, currencySymbol?: string): string {
  const p = PLAN_PRICES[slug];
  const sym = currencySymbol ?? p.currency;
  return cycle === 'annual'
    ? `${sym}${p.annual}/yr`
    : `${sym}${p.monthly}/mo`;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'end of billing period';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatProration(amountPence: number, currencySymbol: string): string {
  return `${currencySymbol}${(amountPence / 100).toFixed(2)}`;
}

// ============================================================================
// PlanChangeModal
// ============================================================================

export function PlanChangeModal({
  isOpen,
  onClose,
  orgId,
  currentPlanSlug,
  currentBillingCycle,
  currentPeriodEnd,
  targetPlanSlug,
  targetBillingCycle,
  onSuccess,
}: PlanChangeModalProps) {
  const updateSubscription = useUpdateSubscription();
  const { symbol } = useOrgMoney();
  const [prorationPreview, setProrationPreview] = useState<number | null>(null);
  const [prorationCurrency, setProrationCurrency] = useState<string>('GBP');

  const isUpgrade = TIER_ORDER[targetPlanSlug] > TIER_ORDER[currentPlanSlug];
  const isDowngrade = TIER_ORDER[targetPlanSlug] < TIER_ORDER[currentPlanSlug];
  const isCycleChange = !isUpgrade && !isDowngrade;

  const currentPrice = formatPrice(currentPlanSlug, currentBillingCycle, symbol);
  const targetPrice = formatPrice(targetPlanSlug, targetBillingCycle, symbol);

  const currentPlanInfo = PLAN_PRICES[currentPlanSlug];
  const targetPlanInfo = PLAN_PRICES[targetPlanSlug];

  // Annual savings for cycle-change messaging
  const currentAnnualEquivalent = currentBillingCycle === 'annual'
    ? currentPlanInfo.annual
    : currentPlanInfo.monthly * 12;
  const targetAnnualEquivalent = targetBillingCycle === 'annual'
    ? targetPlanInfo.annual
    : targetPlanInfo.monthly * 12;
  const annualSavings = currentAnnualEquivalent - targetAnnualEquivalent;

  // Reset preview when modal opens
  useEffect(() => {
    if (isOpen) {
      setProrationPreview(null);
    }
  }, [isOpen]);

  // When we get a result back from a previous mutation that included proration,
  // store it for display (populated after confirm succeeds for upgrades)
  const handleConfirm = async () => {
    try {
      const result = await updateSubscription.mutateAsync({
        org_id: orgId,
        new_plan_slug: targetPlanSlug,
        billing_cycle: targetBillingCycle === 'annual' ? 'yearly' : 'monthly',
      });

      if (result.effective === 'immediate') {
        if (result.proration_amount != null && result.proration_amount > 0) {
          const prorationStr = formatProration(result.proration_amount, symbol);
          toast.success(
            `Upgraded to ${targetPlanInfo.name}! ${prorationStr} charged now for the remainder of this billing period.`
          );
        } else {
          toast.success(`Plan updated to ${targetPlanInfo.name}!`);
        }
      } else {
        const effectiveDate = formatDate(currentPeriodEnd);
        if (isDowngrade) {
          toast.success(`Downgrade scheduled for ${effectiveDate}. You'll keep ${currentPlanInfo.name} features until then.`);
        } else {
          toast.success(`Billing cycle updated. Change takes effect at ${effectiveDate}.`);
        }
      }

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update plan';
      toast.error(message);
    }
  };

  const isPending = updateSubscription.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v && !isPending) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isUpgrade && <Sparkles className="w-4 h-4 text-[#37bd7e]" />}
            {isDowngrade && <ArrowDown className="w-4 h-4 text-amber-500" />}
            {isCycleChange && <RefreshCw className="w-4 h-4 text-blue-500" />}
            {isUpgrade && `Upgrade to ${targetPlanInfo.name}`}
            {isDowngrade && `Downgrade to ${targetPlanInfo.name}`}
            {isCycleChange && 'Switch billing cycle'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Plan change visual */}
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
            {/* From */}
            <div className="flex-1 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current</p>
              <p className="font-semibold text-gray-900 dark:text-white">{currentPlanInfo.name}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">{currentPrice}</p>
            </div>

            <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />

            {/* To */}
            <div className="flex-1 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">New</p>
              <p className={cn(
                'font-semibold',
                isUpgrade ? 'text-[#37bd7e]' : isDowngrade ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'
              )}>
                {targetPlanInfo.name}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">{targetPrice}</p>
            </div>
          </div>

          {/* Context message */}
          {isUpgrade && (
            <div className="flex items-start gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3">
              <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  Upgrade takes effect immediately
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  You'll be charged a prorated amount for the remainder of this billing period.
                  250 bundled credits will be added to your account right away.
                </p>
              </div>
            </div>
          )}

          {isDowngrade && (
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Your {currentPlanInfo.name} features remain active until{' '}
                  <span className="font-semibold">{formatDate(currentPeriodEnd)}</span>
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  After that, you'll be on {targetPlanInfo.name} at {formatPrice(targetPlanSlug, targetBillingCycle, symbol)}.
                  No charge or refund will be applied for the current period.
                </p>
              </div>
            </div>
          )}

          {isCycleChange && targetBillingCycle === 'annual' && annualSavings > 0 && (
            <div className="flex items-start gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3">
              <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Switch to annual billing and save {symbol}{annualSavings}/year
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Change takes effect at your next billing date:{' '}
                  <span className="font-semibold">{formatDate(currentPeriodEnd)}</span>
                </p>
              </div>
            </div>
          )}

          {isCycleChange && targetBillingCycle === 'monthly' && (
            <div className="flex items-start gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3">
              <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Switch to monthly billing. Takes effect at your next billing date:{' '}
                <span className="font-semibold">{formatDate(currentPeriodEnd)}</span>
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className="sm:w-auto w-full"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isPending}
            className={cn(
              'sm:w-auto w-full',
              isUpgrade && 'bg-[#37bd7e] hover:bg-[#2da76c] text-white',
              isDowngrade && 'bg-amber-600 hover:bg-amber-700 text-white',
              isCycleChange && 'bg-blue-600 hover:bg-blue-700 text-white',
            )}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <>
                {isUpgrade && <Sparkles className="w-4 h-4 mr-2" />}
                {isDowngrade && <ArrowDown className="w-4 h-4 mr-2" />}
                {isCycleChange && <RefreshCw className="w-4 h-4 mr-2" />}
              </>
            )}
            {isUpgrade && `Upgrade to ${targetPlanInfo.name}`}
            {isDowngrade && 'Confirm downgrade'}
            {isCycleChange && 'Confirm cycle change'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

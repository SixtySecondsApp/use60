/**
 * CreditBalanceSection — Credit balance overview for the Billing settings page.
 *
 * Shows total balance (color-coded), breakdown by credit type, burn rate,
 * projected runway, quick top-up buttons, and auto top-up status.
 */

import { useState } from 'react';
import { useCreditBalance } from '@/lib/hooks/useCreditBalance';
import { useCurrentSubscription } from '@/lib/hooks/useSubscription';
import { Sparkles, Gift, Package, TrendingDown, Timer, ArrowRight, Loader2, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CREDIT_PACK_DISPLAY } from '@/lib/config/planDetails';
import CreditPurchaseModal from '@/components/credits/CreditPurchaseModal';
import type { PackType } from '@/lib/config/creditPacks';
import { Link } from 'react-router-dom';

// ============================================================================
// Helpers
// ============================================================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function balanceColorClass(balance: number): string {
  if (balance >= 50) return 'text-emerald-600 dark:text-emerald-400';
  if (balance >= 10) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

// ============================================================================
// Sub-components
// ============================================================================

interface BreakdownCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  progress?: { used: number; total: number };
}

function BreakdownCard({ icon, label, value, sub, progress }: BreakdownCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </div>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
      {progress && (
        <div className="w-full rounded-full bg-gray-200 dark:bg-gray-700 h-1.5 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#37bd7e]"
            style={{ width: `${Math.min(100, (progress.used / progress.total) * 100)}%` }}
          />
        </div>
      )}
      <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function CreditBalanceSection() {
  const { data: balance, isLoading } = useCreditBalance();
  const { subscription: subState } = useCurrentSubscription();
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [selectedPackType, setSelectedPackType] = useState<PackType>('growth');

  const handleTopUp = (packType: PackType) => {
    setSelectedPackType(packType);
    setPurchaseModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const total = balance?.balance ?? 0;
  const subCredits = balance?.subscriptionCredits ?? { balance: 0, expiry: null };
  const onboardingCredits = balance?.onboardingCredits ?? { balance: 0, complete: false };
  const packCredits = balance?.packCredits ?? 0;
  const dailyBurnRate = balance?.dailyBurnRate ?? 0;
  const projectedDays = balance?.projectedDaysRemaining ?? -1;
  const autoTopUp = balance?.autoTopUp;

  // For subscription credits, get the bundled amount from the plan features
  const bundledCredits = subState?.plan?.features?.bundled_credits;
  const subTotal = typeof bundledCredits === 'number' && bundledCredits > 0 ? bundledCredits : 250;

  return (
    <>
      <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-5">

        {/* Total balance */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Total Credits
            </p>
            <p className={cn('text-4xl font-bold tabular-nums', balanceColorClass(total))}>
              {total % 1 === 0 ? total.toFixed(0) : total.toFixed(1)}
            </p>
          </div>
        </div>

        {/* Breakdown grid */}
        {(subCredits.balance > 0 || onboardingCredits.balance > 0 || packCredits >= 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {subCredits.balance > 0 && (
              <BreakdownCard
                icon={<Sparkles className="w-3.5 h-3.5 text-violet-500" />}
                label="Subscription"
                value={`${subCredits.balance} / ${subTotal}`}
                sub={subCredits.expiry ? `Expires ${formatDate(subCredits.expiry)}` : 'Refreshes monthly'}
                progress={{ used: subCredits.balance, total: subTotal }}
              />
            )}
            {onboardingCredits.balance > 0 && (
              <BreakdownCard
                icon={<Gift className="w-3.5 h-3.5 text-amber-500" />}
                label="Onboarding"
                value={`${onboardingCredits.balance}`}
                sub="Never expires"
              />
            )}
            <BreakdownCard
              icon={<Package className="w-3.5 h-3.5 text-blue-500" />}
              label="Pack Credits"
              value={`${packCredits}`}
              sub="Never expires"
            />
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-6 pt-1 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
            <TrendingDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500 dark:text-gray-500">Daily burn</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {dailyBurnRate === 0 ? '—' : `${dailyBurnRate.toFixed(1)} cr`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
            <Timer className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500 dark:text-gray-500">Runway</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {projectedDays < 0
                ? '—'
                : projectedDays === 0
                ? 'Today'
                : `${projectedDays}d`}
            </span>
          </div>
        </div>

        {/* Quick top-up */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Quick top-up</p>
          <div className="flex flex-wrap gap-2">
            {CREDIT_PACK_DISPLAY.map((pack) => (
              <Button
                key={pack.packType}
                variant="outline"
                size="sm"
                onClick={() => handleTopUp(pack.packType)}
                className="text-xs h-8 hover:border-[#37bd7e] hover:text-[#37bd7e]"
              >
                {pack.name} · £{pack.price}/{pack.credits}cr
              </Button>
            ))}
          </div>
        </div>

        {/* Auto top-up status */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-800">
          <span>
            Auto top-up:{' '}
            {autoTopUp?.enabled ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                Enabled — triggers below {autoTopUp.threshold} credits
              </span>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">Disabled</span>
            )}
          </span>
          <Link
            to="/settings/credits"
            className="flex items-center gap-0.5 text-[#37bd7e] hover:underline font-medium"
          >
            Configure
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      <CreditPurchaseModal
        open={purchaseModalOpen}
        onOpenChange={setPurchaseModalOpen}
      />
    </>
  );
}

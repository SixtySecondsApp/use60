/**
 * BillingSettingsPage — Billing & Subscription management under Settings.
 *
 * Sections (SUBBILL-007):
 *   1. Current Plan Card: plan name, status, cost, billing cycle, trial progress
 *   2. Plan Comparison: monthly/annual toggle, side-by-side Basic vs Pro cards
 *
 * Sections to be added by SUBBILL-008:
 *   - Credit Balance
 *   - Transaction History
 *   - Subscription Management / Stripe portal
 */

import { useState } from 'react';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { useOrg } from '@/lib/contexts/OrgContext';
import {
  useCurrentSubscription,
  useCreateCheckoutSession,
} from '@/lib/hooks/useSubscription';
import { PLAN_DETAILS, ANNUAL_SAVINGS } from '@/lib/config/planDetails';
import { CreditBalanceSection } from '@/components/billing/CreditBalanceSection';
import { TransactionHistorySection } from '@/components/billing/TransactionHistorySection';
import { PlanChangeModal } from '@/components/billing/PlanChangeModal';
import type { PlanSlug, BillingCycle as ModalBillingCycle } from '@/components/billing/PlanChangeModal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Check,
  X,
  Crown,
  Zap,
  Building2,
  Clock,
  CreditCard,
  Loader2,
  ArrowRight,
  Sparkles,
  AlertCircle,
  ArrowDown,
  RefreshCw,
} from 'lucide-react';

// ============================================================================
// Status badge
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string }> = {
    active: {
      label: 'Active',
      className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
    },
    trialing: {
      label: 'Trial',
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
    },
    past_due: {
      label: 'Past Due',
      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800',
    },
    canceled: {
      label: 'Canceled',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
    },
    paused: {
      label: 'Paused',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
    },
  };

  const config = configs[status] ?? {
    label: 'Unknown',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
  };

  return (
    <span className={cn('px-2.5 py-0.5 text-xs font-medium rounded-full', config.className)}>
      {config.label}
    </span>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function BillingSettingsPage() {
  const { activeOrgId: organizationId } = useOrg();
  const { symbol } = useOrgMoney();
  const { subscription, trial, isLoading, error } = useCurrentSubscription();
  const createCheckoutSession = useCreateCheckoutSession();

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // PlanChangeModal state: null = closed
  const [planChangeTarget, setPlanChangeTarget] = useState<{
    slug: PlanSlug;
    cycle: ModalBillingCycle;
  } | null>(null);

  const currentPlan = subscription?.plan;
  const currentPlanSlug = (currentPlan?.slug ?? 'basic') as PlanSlug;
  const isBasicUser = currentPlanSlug === 'basic' || currentPlan?.is_free_tier;
  const hasStripeSubscription = !!subscription?.stripe_subscription_id;
  const currentBillingCycle: ModalBillingCycle =
    subscription?.billing_cycle === 'yearly' ? 'annual' : 'monthly';

  // Format next billing date
  const nextBillingDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  // Billing cycle label
  const billingCycleLabel =
    subscription?.billing_cycle === 'yearly' ? 'Annual' : 'Monthly';

  // Monthly cost display
  const monthlyCostDisplay = currentPlan?.price_monthly != null
    ? `${symbol}${(currentPlan.price_monthly / 100).toFixed(0)}/mo`
    : `${symbol}29/mo`;

  // Trial progress
  const daysRemaining = trial?.daysRemaining ?? 0;
  const meetingsUsed = trial?.meetingsUsed ?? 0;
  const meetingsLimit = trial?.meetingsLimit ?? 100;
  const daysPercent = ((14 - daysRemaining) / 14) * 100;
  const meetingsPercent = meetingsLimit > 0 ? (meetingsUsed / meetingsLimit) * 100 : 0;
  const percentUsed = Math.max(daysPercent, meetingsPercent);

  const trialEndsFormatted = trial?.endsAt
    ? new Date(trial.endsAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  /**
   * Handle plan card CTA clicks.
   *
   * Decision tree:
   *   - No Stripe subscription → checkout (new/reactivating subscriber)
   *   - Has Stripe subscription → open PlanChangeModal for all cases
   *     (upgrades, downgrades, cycle switches are all confirmed before applying)
   */
  const handlePlanAction = async (targetSlug: PlanSlug, targetCycle?: ModalBillingCycle) => {
    if (!organizationId) {
      toast.error('No active organization');
      return;
    }

    const cycle = targetCycle ?? billingCycle;

    if (!hasStripeSubscription) {
      // New subscriber path: create Stripe Checkout session
      try {
        await createCheckoutSession.mutateAsync({
          org_id: organizationId,
          plan_slug: targetSlug,
          billing_cycle: cycle === 'annual' ? 'yearly' : 'monthly',
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to start checkout';
        toast.error(message);
      }
      return;
    }

    // Existing subscriber: show PlanChangeModal for confirmation
    setPlanChangeTarget({ slug: targetSlug, cycle });
  };

  return (
    <SettingsPageWrapper title="Billing & Subscription" description="Manage your plan and subscription">
      <div className="space-y-6">

        {/* ================================================================
            Section 1: Current Plan Card
        ================================================================ */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#37bd7e]" />
            Current Plan
          </h3>

          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 bg-white dark:bg-gray-900">
            {isLoading ? (
              <div className="space-y-4">
                {/* Plan name + status row */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-8 w-32 rounded-md" />
                </div>
                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-1">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-6 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center gap-3 py-6">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Failed to load subscription data
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Plan name + status */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xl font-bold text-gray-900 dark:text-white">
                      {currentPlan?.name ?? 'Basic Plan'}
                    </span>
                    {subscription?.status ? (
                      <StatusBadge status={subscription.status} />
                    ) : (
                      <StatusBadge status="active" />
                    )}
                  </div>

                  {/* Upgrade CTA for Basic users */}
                  {isBasicUser && (
                    <Button
                      size="sm"
                      onClick={() => handlePlanAction('pro')}
                      disabled={createCheckoutSession.isPending}
                      className="bg-[#37bd7e] hover:bg-[#2da76c] text-white flex-shrink-0"
                    >
                      {createCheckoutSession.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Upgrade to Pro
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  )}
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-1">
                  {/* Monthly cost */}
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      Monthly Cost
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {monthlyCostDisplay}
                    </p>
                  </div>

                  {/* Billing cycle */}
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Billing Cycle
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {billingCycleLabel}
                    </p>
                  </div>

                  {/* Next billing date */}
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Next Billing
                    </p>
                    <p className={cn(
                      'text-lg font-semibold',
                      nextBillingDate
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-400 dark:text-gray-500'
                    )}>
                      {nextBillingDate ?? '—'}
                    </p>
                  </div>
                </div>

                {/* Trial progress */}
                {trial?.isTrialing && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-600 dark:text-gray-400">Trial Progress</span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {daysRemaining}d remaining
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          percentUsed < 50 ? 'bg-emerald-500' :
                          percentUsed < 75 ? 'bg-amber-500' : 'bg-red-500'
                        )}
                        style={{ width: `${Math.min(percentUsed, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {meetingsUsed} of {meetingsLimit} meetings used
                      </p>
                      {trialEndsFormatted && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Trial ends {trialEndsFormatted}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ================================================================
            Section 2: Plan Comparison
        ================================================================ */}
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#37bd7e]" />
              Plan Comparison
            </h3>

            {/* Monthly / Annual toggle */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-full p-1">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-full transition-all',
                  billingCycle === 'monthly'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-full transition-all',
                  billingCycle === 'annual'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                Annual
                <span className="ml-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  Save
                </span>
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(2)].map((_, i) => (
                <div
                  key={i}
                  className="relative rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex flex-col bg-white dark:bg-gray-900 space-y-4"
                >
                  {/* Badge area */}
                  <div className="absolute top-3 right-3">
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  {/* Plan header */}
                  <div className="pr-16 space-y-1.5">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  {/* Price */}
                  <div className="space-y-1">
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  {/* Feature list */}
                  <div className="space-y-2 flex-1">
                    {[...Array(5)].map((_, j) => (
                      <Skeleton key={j} className="h-5 w-full rounded-md" />
                    ))}
                  </div>
                  {/* CTA */}
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ))}
            </div>
          ) : null}

          {!isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(['basic', 'pro'] as const).map((slug) => {
              const plan = PLAN_DETAILS[slug];
              const savings = ANNUAL_SAVINGS[slug];
              const isCurrentPlan = currentPlanSlug === slug;
              const isUpgrade = slug === 'pro' && isBasicUser;
              const isDowngrade = slug === 'basic' && !isBasicUser;
              // Cycle switch: on the current plan card but selected a different cycle
              const isCycleSwitch = isCurrentPlan && billingCycle !== currentBillingCycle;

              const displayPrice = billingCycle === 'annual'
                ? plan.yearlyPrice
                : plan.monthlyPrice;
              const priceSuffix = billingCycle === 'annual' ? '/yr' : '/mo';

              return (
                <div
                  key={slug}
                  className={cn(
                    'relative rounded-xl border p-5 flex flex-col bg-white dark:bg-gray-900 transition-all',
                    isCurrentPlan
                      ? 'border-[#37bd7e] ring-1 ring-[#37bd7e]/30'
                      : plan.badge
                        ? 'border-blue-400 dark:border-blue-600 ring-2 ring-blue-400/30 dark:ring-blue-500/20'
                        : 'border-gray-200 dark:border-gray-800'
                  )}
                >
                  {/* Badges */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    {plan.badge && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded-full flex items-center gap-1">
                        <Crown className="w-3 h-3" />
                        {plan.badge}
                      </span>
                    )}
                    {isCurrentPlan && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800">
                        Current Plan
                      </span>
                    )}
                  </div>

                  {/* Plan header */}
                  <div className="mb-4 pr-16">
                    <h4 className="text-base font-bold text-gray-900 dark:text-white">
                      {plan.name}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {plan.tagline}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-gray-900 dark:text-white">
                        {symbol}{displayPrice}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {priceSuffix}
                      </span>
                    </div>
                    {billingCycle === 'annual' && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                        Save {symbol}{savings.saved}/yr vs monthly
                      </p>
                    )}
                  </div>

                  {/* Feature list */}
                  <ul className="space-y-2 mb-5 flex-1">
                    {plan.features.map((feature) => (
                      <li
                        key={feature.name}
                        className={cn(
                          'flex items-start gap-2 rounded-md px-2 py-1 -mx-2',
                          feature.highlight
                            ? 'bg-indigo-50 dark:bg-indigo-950/30'
                            : ''
                        )}
                      >
                        {feature.included ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <span className={cn(
                            'text-xs font-medium',
                            feature.included
                              ? 'text-gray-900 dark:text-white'
                              : 'text-gray-400 dark:text-gray-500'
                          )}>
                            {feature.name}
                          </span>
                          {feature.included && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">
                              {feature.value}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* CTA button */}
                  {isCurrentPlan && !isCycleSwitch ? (
                    <Button
                      variant="outline"
                      disabled
                      className="w-full border-[#37bd7e] text-[#37bd7e] opacity-80 cursor-default"
                    >
                      Current Plan
                    </Button>
                  ) : isCycleSwitch ? (
                    <Button
                      variant="outline"
                      onClick={() => handlePlanAction(slug, billingCycle)}
                      disabled={createCheckoutSession.isPending}
                      className="w-full hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Switch to {billingCycle === 'annual' ? 'Annual' : 'Monthly'}
                    </Button>
                  ) : isUpgrade ? (
                    <Button
                      onClick={() => handlePlanAction(slug)}
                      disabled={createCheckoutSession.isPending}
                      className="w-full bg-[#37bd7e] hover:bg-[#2da76c] text-white"
                    >
                      {createCheckoutSession.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      {plan.ctaText}
                    </Button>
                  ) : isDowngrade ? (
                    <Button
                      variant="outline"
                      onClick={() => handlePlanAction(slug)}
                      disabled={createCheckoutSession.isPending}
                      className="w-full hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400"
                    >
                      <ArrowDown className="w-4 h-4 mr-2" />
                      Downgrade to {plan.name}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => handlePlanAction(slug)}
                      disabled={createCheckoutSession.isPending}
                      className="w-full hover:border-[#37bd7e] hover:text-[#37bd7e]"
                    >
                      {plan.ctaText}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </section>

        {/* Credit Balance Section */}
        <CreditBalanceSection />

        {/* Transaction History Section */}
        <TransactionHistorySection />

      </div>

      {/* Plan change modal (upgrade / downgrade / cycle switch) */}
      {planChangeTarget && organizationId && (
        <PlanChangeModal
          isOpen={!!planChangeTarget}
          onClose={() => setPlanChangeTarget(null)}
          orgId={organizationId}
          currentPlanSlug={currentPlanSlug}
          currentBillingCycle={currentBillingCycle}
          currentPeriodEnd={subscription?.current_period_end ?? null}
          targetPlanSlug={planChangeTarget.slug}
          targetBillingCycle={planChangeTarget.cycle}
          onSuccess={() => setPlanChangeTarget(null)}
        />
      )}
    </SettingsPageWrapper>
  );
}
